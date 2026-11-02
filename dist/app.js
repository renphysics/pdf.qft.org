/**
 * QFT PDF's editor. This module starts it: edit history (undo and redo),
 * addresses and browser history, the actions behind buttons, and the
 * listeners and start-up code. The rest lives in:
 *   editor-core.js  shared state, helpers and messages
 *   page-view.js    the page preview
 *   page-items.js   typing, moving and resizing items; crop drag
 *   form-ui.js      Fill form
 *   tool-panel.js   the tool panel
 *   pages.js        pages, the page strip and choosing tools
 *   documents.js    opening, building and downloading PDFs
 */

import { parsePageRange } from './pdf-engine.js';
import { createZip, normalizePreset, safeBaseName } from './workflows.js';
import { initBatch } from './batch-ui.js';
import { uploadedSignature } from './signature.js';
import { TOOL_PAGES } from './routes.js';
import { number } from './layout.js';
import { geometryOf, onFontsReady } from './preview.js';
import {
  $,
  $$,
  activeIndex,
  annotationById,
  announceMessage,
  assetUrl,
  busy,
  confirmDialog,
  currentPage,
  formatSize,
  friendly,
  hideToast,
  names,
  pageTool,
  phone,
  positionToast,
  scheduleToastHide,
  selectedItem,
  setState,
  settingDefaults,
  SETTINGS,
  snapshot,
  state,
  toast,
  ui,
} from './editor-core.js';
import { onStageScroll, renderStage, revealItem, scheduleOverlays, setZoom } from './page-view.js';
import { clearForm, focusField, initFormInputs, nextEmptyField } from './form-ui.js';
import {
  addHighlight,
  baselines,
  createText,
  deleteItem,
  endGesture,
  initPageItems,
  placeImage,
  selectItem,
  stopEditing,
} from './page-items.js';
import {
  clearProperties,
  copySignature,
  cropDraftActive,
  cropValues,
  fillForm,
  pad,
  placeSignature,
  placeSignatureEverywhere,
  protectedDownload,
  renderTool,
  scopedPages,
  setSignature,
  toggleSetting,
  updateCropOverlays,
  useSignature,
} from './tool-panel.js';
import {
  choosePage,
  chooseTool,
  deletePages,
  insertBlankPage,
  movePage,
  renderPages,
  renderThumbnails,
  rotateSelected,
  setSheet,
} from './pages.js';
import {
  downloadBytes,
  downloadDocument,
  downloadProtected,
  downloadSelected,
  isDirty,
  openFiles,
  outputName,
  showInfo,
  showLanding,
  showWorkspace,
  warmPdfTools,
} from './documents.js';

// Listeners on the page stack, added in the order the editor has always added them.
initFormInputs();
initPageItems();

// ---- Edit history --------------------------------------------------------------
// Edits apply at once. Each change() is one undo step, except that changes with
// the same key in quick succession (typing, dragging, a slider) merge into one.

export function record() {
  return { state: snapshot(), active: ui.activeId, selected: new Set(ui.selected), item: ui.item };
}
export function change(mutate, { key = null, layout = false, before = null } = {}) {
  const now = performance.now();
  const merge = key && ui.lastChange?.key === key && now - ui.lastChange.time < 1500;
  if (!merge) {
    ui.past.push(before || record());
    if (ui.past.length > 100) ui.past.shift();
  }
  ui.future = [];
  ui.lastChange = key ? { key, time: now } : null;
  ui.lastActiveIndex = activeIndex();
  mutate();
  ui.version++;
  if (ui.splitResults) {
    ui.splitResults = null;
    $('#split-results')?.replaceChildren();
  }
  documentChanged(layout);
}
/** Bring the editor up to date with the document. `layout`: pages were added, removed, moved, turned or cropped. */
export function documentChanged(layout) {
  if (!state.pages.some((p) => p.id === ui.activeId)) {
    // The current page was removed: the page now in its place becomes current.
    ui.activeId = state.pages[Math.min(ui.lastActiveIndex || 0, state.pages.length - 1)]?.id;
    ui.stage.reveal = ui.activeId;
  }
  ui.selected = new Set([...ui.selected].filter((id) => state.pages.some((p) => p.id === id)));
  if (ui.item && !selectedItem()) ui.item = null;
  if (ui.editing && !annotationById(ui.editing)) stopEditing();
  updateHistoryButtons();
  updateDocumentInfo();
  updateDownloadButton();
  if (layout) {
    // Pages that moved, turned or left may take the current page out of view: bring it back.
    ui.stage.reveal ||= ui.activeId;
    renderPages();
    renderThumbnails();
    renderStage();
  } else scheduleOverlays();
}
/** While downloads need a password, the Download button shows a lock and says so. */
function updateDownloadButton() {
  const button = $('#download-button'),
    locked = protectedDownload();
  $('use', button).setAttribute('href', locked ? '#i-lock' : '#i-download');
  $('.download-protected', button).hidden = !locked;
  if (locked) button.title = 'Your download will need its password to open';
  else button.removeAttribute('title');
}
function updateHistoryButtons() {
  $('#undo-button').disabled = !ui.past.length;
  $('#redo-button').disabled = !ui.future.length;
}
function travel(from, to, message) {
  if (ui.busy || !from.length) return;
  stopEditing();
  endGesture();
  const entry = from.pop();
  // Undo and redo both show the page where the change was made.
  to.push({ ...record(), active: entry.active });
  setState(entry.state);
  ui.activeId = entry.active;
  ui.stage.reveal = entry.active;
  ui.selected = entry.selected;
  ui.item = entry.item;
  ui.lastChange = null;
  ui.pendingRecord = null;
  ui.version++;
  ui.splitResults = null;
  documentChanged(true);
  renderTool();
  announceMessage(message);
}
const undo = () => travel(ui.past, ui.future, 'Undone.');
const redo = () => travel(ui.future, ui.past, 'Redone.');

// ---- Addresses and history ---------------------------------------------------
// Each tool has its own page (routes.js, generated by scripts/build-pages.mjs).
// On any page, the editor and the batch workspace are history entries stacked
// on the page's own entry: Back and Forward move between views instead of
// leaving the site, the address names the tool in use, and a reload opens that
// tool's page. Documents live only in memory, so a reload starts on the landing.
const siteRoot = new URL('./', import.meta.url);
const landingView = { address: location.pathname, title: document.title };
let restoringView = false;
let ignoreNextPop = false;
const viewDepth = () => Number(history.state?.depth) || 0;
function viewAddress(view) {
  const slug = TOOL_PAGES[view === 'batch' ? 'batch' : ui.tool];
  return view === 'landing' || !slug ? landingView.address : new URL(slug + '/', siteRoot).pathname;
}
function viewTitle(view) {
  if (view === 'landing') return landingView.title;
  return (view === 'batch' ? 'Batch & presets' : names[ui.tool]) + ' — QFT PDF';
}
/** Record the visible view: a new entry for a new view, a replacement when only the tool changes. */
export function recordView(view) {
  if (restoringView) return;
  const current = history.state?.view || 'landing';
  const entry = { view, depth: viewDepth() + (view === current ? 0 : 1) };
  if (view === current) history.replaceState(entry, '', viewAddress(view));
  else history.pushState(entry, '', viewAddress(view));
  ui.shownDepth = entry.depth;
  document.title = viewTitle(view);
}
/** Show this page's landing view, stepping back through any views stacked on it. */
function goToLanding(focus = 'top') {
  ui.landingFocus = focus;
  if (viewDepth() > 0) {
    history.go(-viewDepth()); // the popstate handler shows the landing view
    return;
  }
  showLanding();
  finishLanding();
}
function finishLanding() {
  document.title = landingView.title;
  const focus = ui.landingFocus;
  ui.landingFocus = null;
  if (focus === 'tools') {
    $('#tools-title').focus({ preventScroll: true });
    setTimeout(() => $('#tools').scrollIntoView({ behavior: 'smooth' }), 0);
  } else {
    $('#landing-title').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}
function restoreView(target) {
  restoringView = true;
  try {
    ui.shownDepth = Number(target.depth) || 0;
    if (target.view === 'editor' && state.pages.length) {
      showWorkspace();
      renderStage();
      renderThumbnails();
      document.title = viewTitle('editor');
      $('#document-name').focus({ preventScroll: true });
    } else if (target.view === 'batch') {
      batch.open();
      document.title = viewTitle('batch');
    } else {
      showLanding();
      finishLanding();
    }
  } finally {
    restoringView = false;
  }
}
function updateDocumentInfo() {
  const activeSources = state.sources.filter((s) => state.pages.some((p) => p.sourceId === s.id));
  $('#document-name').textContent =
    activeSources.length === 1 ? activeSources[0].name : 'Combined document.pdf';
  $('#document-info').textContent =
    state.pages.length +
    ' page' +
    (state.pages.length === 1 ? '' : 's') +
    ' · ' +
    formatSize(activeSources.reduce((sum, source) => sum + source.bytes.length, 0));
  $('#total-pages').textContent = state.pages.length;
  updateHistoryButtons();
  syncPageNavigation();
}
async function resetDocument() {
  if (!ui.initial) return;
  stopEditing();
  change(
    () => {
      setState(snapshot(ui.initial));
      ui.activeId = state.pages[0].id;
      ui.selected = new Set([ui.activeId]);
      ui.item = null;
      ui.stage.reveal = ui.activeId;
    },
    { layout: true },
  );
  ui.cropDraft = { left: 0, top: 0, right: 0, bottom: 0, scope: 'current' };
  ui.lastCropPreset = null;
  renderTool();
  toast('Back to your original document. Undo brings your edits back.');
}
export async function action(name, element) {
  if (ui.busy && !['privacy', 'help', 'close-dialog', 'cancel-operation', 'dismiss-toast'].includes(name))
    return;
  if (batch.isBusy() && !['privacy', 'help', 'close-dialog', 'batch', 'dismiss-toast'].includes(name)) {
    toast('Stop the batch or wait for it to finish before switching workspaces.');
    return;
  }
  if (name === 'cancel-operation') {
    ui.cancelOperation = true;
    $('#busy-cancel').disabled = true;
    if (ui.cancelExport) ui.cancelExport();
    else $('#busy-message').textContent = 'Stopping after the current output…';
    return;
  }
  if (name === 'batch') {
    batch.open();
    return;
  }
  if (name === 'batch-choose') {
    batch.open();
    batch.chooseFiles();
    return;
  }
  if (name === 'batch-from-editor') {
    sendSettingsToBatch();
    return;
  }
  if (name === 'download-split') {
    const file = ui.splitResults?.[Number(element.dataset.outputIndex)];
    if (file) {
      downloadBytes(file.bytes, file.name);
      file.downloaded = true;
    }
    return;
  }
  if (name === 'download-split-zip') {
    try {
      if (ui.splitResults?.length) {
        downloadBytes(createZip(ui.splitResults), safeBaseName(outputName('split')) + '.zip');
        ui.splitResults.forEach((file) => (file.downloaded = true));
      }
    } catch (error) {
      toast(friendly(error), true);
    }
    return;
  }
  if ((name === 'open' || name === 'sample') && pageTool && pageTool !== 'batch' && $('#workspace').hidden)
    ui.tool = pageTool;
  if (name === 'open') {
    ui.append = false;
    warmPdfTools();
    $('#file-input').click();
  }
  if (name === 'add-files') {
    ui.append = true;
    warmPdfTools();
    $('#file-input').click();
  }
  if (name === 'sample') {
    try {
      warmPdfTools();
      busy(true, 'Opening the sample document…');
      const response = await fetch(assetUrl('./assets/sample.pdf'));
      if (!response.ok) throw new Error('The sample could not load. Please choose your own PDF.');
      const blob = await response.blob();
      busy(false);
      await openFiles([new File([blob], 'A little room to create.pdf', { type: 'application/pdf' })]);
    } catch (error) {
      busy(false);
      toast(friendly(error), true);
    }
  }
  if (name === 'home' || name === 'back' || name === 'tools-home')
    goToLanding(name === 'tools-home' ? 'tools' : 'top');
  if (name === 'resume') {
    showWorkspace();
    renderStage();
    renderThumbnails();
    recordView('editor');
    $('#document-name').focus({ preventScroll: true });
  }
  if (name === 'dismiss-toast') hideToast();
  if (name === 'privacy' || name === 'help') showInfo(name);
  if (name === 'close-dialog') $('#info-dialog').close();
  if (name === 'organize') chooseTool('pages');
  if (name === 'toggle-sheet') setSheet(!ui.sheetOpen);
  if (name === 'previous' || name === 'next') {
    const next = activeIndex() + (name === 'next' ? 1 : -1);
    if (next >= 0 && next < state.pages.length) choosePage(state.pages[next].id);
  }
  if (name === 'zoom-in' || name === 'zoom-out' || name === 'zoom-fit') {
    // Steps of 25% of Fit; from a zoom set with the wheel, to the next step.
    const quarters = name === 'zoom-in' ? Math.ceil(ui.zoom * 4 + 0.01) : Math.floor(ui.zoom * 4 - 0.01);
    setZoom(name === 'zoom-fit' ? 1 : quarters / 4);
  }
  if (name === 'undo') undo();
  if (name === 'redo') redo();
  if (name === 'reset') {
    const confirmed = await confirmDialog({
      eyebrow: 'START FRESH',
      title: 'Reset this document?',
      body: 'This clears your edits and added PDFs and returns to the document you first opened. Undo brings your edits back. Your original files are unchanged.',
      confirmLabel: 'Reset document',
    });
    if (confirmed) await resetDocument();
  }
  if (name === 'download') await downloadDocument();
  if (name === 'download-protected') await downloadProtected();
  if (name === 'remove-protection') {
    change(() => (state.protection = null));
    renderTool();
    toast('Password removed. Your download will open without one.');
  }
  if (name === 'choose-protect') {
    chooseTool('protect');
    $('#tool-form [name="password"]')?.focus();
  }
  if (name === 'add-text') {
    const page = currentPage(),
      geometry = geometryOf(state, page);
    createText(page, { x: geometry.width * 0.1, y: geometry.height * 0.1 });
  }
  if (name === 'add-highlight') {
    const page = currentPage(),
      geometry = geometryOf(state, page);
    addHighlight(page, { x: geometry.width * 0.1, y: geometry.height * 0.15 });
    revealItem(ui.item);
  }
  if (name === 'place-image' && ui.image) {
    placeImage(ui.image);
    revealItem(ui.item);
  }
  if (name === 'delete-item' && ui.item) deleteItem(ui.item);
  if (name === 'toggle-setting') toggleSetting();
  if (name === 'scope-selected') {
    const key = SETTINGS[ui.tool];
    const ids = state.pages.filter((page) => ui.selected.has(page.id)).map((page) => page.id);
    if (key && ids.length) {
      delete ui.scopeErrors[key];
      change(() => {
        state[key] ||= settingDefaults[key]();
        state[key].enabled = true;
        state[key].pages = ids;
      });
      fillForm({ all: true });
    }
  }
  if (name === 'select-all' || name === 'select-none') {
    ui.selected = name === 'select-all' ? new Set(state.pages.map((p) => p.id)) : new Set();
    $$('[data-page-select]').forEach((input) => (input.checked = ui.selected.has(input.dataset.pageSelect)));
    renderTool();
  }
  if (name === 'select-range') {
    try {
      const indices = parsePageRange(ui.rangeDraft, state.pages.length);
      ui.selected = new Set(indices.map((i) => state.pages[i].id));
      $$('[data-page-select]').forEach(
        (input) => (input.checked = ui.selected.has(input.dataset.pageSelect)),
      );
      renderTool();
    } catch (error) {
      toast(friendly(error), true);
    }
  }
  if (name === 'rotate') {
    try {
      rotateSelected();
    } catch (error) {
      toast(friendly(error), true);
    }
  }
  if (name === 'clear-crop-margins') {
    ui.cropDraft = { left: 0, top: 0, right: 0, bottom: 0, scope: ui.cropDraft.scope };
    fillForm({ all: true });
    updateCropOverlays();
  }
  if (name === 'restore-crop') {
    try {
      const scope = scopedPages(ui.cropDraft.scope);
      const targets = state.pages.filter((p) => (scope === 'all' || scope.includes(p.id)) && p.crop);
      if (!targets.length) throw new Error('These pages show their original boundaries already.');
      change(
        () => {
          targets.forEach((p) => delete p.crop);
        },
        { layout: true },
      );
      ui.lastCropPreset = null;
      ui.cropDraft = { left: 0, top: 0, right: 0, bottom: 0, scope: ui.cropDraft.scope };
      renderTool();
      toast('Original page boundaries restored.');
    } catch (error) {
      toast(friendly(error), true);
    }
  }
  if (name === 'delete-pages') {
    try {
      deletePages();
    } catch (error) {
      toast(friendly(error), true);
    }
  }
  if (name === 'properties-clear') clearProperties();
  if (name === 'insert-blank') {
    try {
      await insertBlankPage();
    } catch (error) {
      toast(friendly(error), true);
    }
  }
  if (name === 'extract') await downloadSelected();
  if (name === 'move-earlier' || name === 'move-later')
    movePage(ui.activeId, name === 'move-earlier' ? -1 : 1);
  if (name === 'choose-image') $('#image-input').click();
  if (name === 'signature-use') await useSignature();
  if (name === 'signature-clear') pad?.clear();
  if (name === 'signature-choose') $('#signature-input').click();
  if (name === 'signature-place') placeSignature();
  if (name === 'signature-place-all') placeSignatureEverywhere();
  if (name === 'signature-copy' && selectedItem()?.type === 'signature') copySignature(selectedItem());
  if (name === 'form-next') {
    const next = nextEmptyField();
    if (next) focusField(next);
    else toast('Every field is filled in.');
  }
  if (name === 'form-clear') clearForm();
  if (name === 'signature-new') {
    ui.signature = null;
    renderTool();
    $('#tool-form [name="signatureMode"]:checked')?.focus();
  }
}

/** The page number box and Previous and Next follow the current page (but not while a number is typed). */
export function syncPageNavigation({ force = false } = {}) {
  const field = $('#page-jump'),
    index = activeIndex();
  field.max = state.pages.length;
  if (force || document.activeElement !== field) field.value = index + 1;
  $('#page-counter').textContent = 'of ' + state.pages.length;
  $('[data-action=previous]').disabled = index === 0;
  $('[data-action=next]').disabled = index >= state.pages.length - 1;
}
function jumpToPage() {
  const field = $('#page-jump'),
    number = Number(field.value);
  if (!Number.isInteger(number) || number < 1 || number > state.pages.length) {
    toast('Enter a page number from 1 to ' + state.pages.length + '.', true);
    syncPageNavigation({ force: true });
    return;
  }
  choosePage(state.pages[number - 1].id);
}
export function revealThumbnail(id) {
  const node = $('[data-page-id="' + id + '"]'),
    root = phone() ? $('#page-list') : $('.page-sidebar');
  if (!node) return;
  const rect = node.getBoundingClientRect(),
    area = root.getBoundingClientRect();
  if (phone()) {
    if (rect.left < area.left) root.scrollLeft += rect.left - area.left;
    else if (rect.right > area.right) root.scrollLeft += rect.right - area.right;
  } else {
    if (rect.top < area.top) root.scrollTop += rect.top - area.top;
    else if (rect.bottom > area.bottom) root.scrollTop += rect.bottom - area.bottom;
  }
}
function sendSettingsToBatch() {
  try {
    const key = SETTINGS[ui.tool],
      preset = { version: 1, name: names[ui.tool] + ' preset' };
    if (key) {
      const { enabled, pages, ...setting } = state[key] || settingDefaults[key]();
      void enabled;
      void pages;
      preset[key] = setting;
    }
    if (ui.tool === 'crop')
      preset.crop = cropDraftActive() ? cropValues() : ui.lastCropPreset || cropValues();
    batch.open(normalizePreset(preset));
  } catch (error) {
    toast(friendly(error), true);
  }
}
export const batch = initBatch({
  onShow: () => {
    stopEditing();
    $('#landing').hidden = true;
    $('#workspace').hidden = true;
    document.body.classList.remove('editing');
    document.body.classList.add('batching');
    window.scrollTo(0, 0);
    recordView('batch');
  },
  onBack: () => {
    document.body.classList.remove('batching');
    goToLanding('top');
  },
  notify: (message, error) => toast(message, error, { announce: false }),
});
$('#tool-select').addEventListener('change', (event) => chooseTool(event.target.value));
$('#page-jump').addEventListener('change', jumpToPage);
// While the box had focus, the current page may have changed.
$('#page-jump').addEventListener('blur', () => syncPageNavigation());
$('#page-jump').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    jumpToPage();
    event.target.blur();
  }
});
let toolFilter = 'all';
function filterTools() {
  const query = $('#tool-search').value.trim().toLowerCase();
  let count = 0;
  $$('.tool-card').forEach((card) => {
    const visible =
      (toolFilter === 'all' || card.dataset.category === toolFilter) &&
      (card.textContent + ' ' + (card.dataset.keywords || '')).toLowerCase().includes(query);
    card.hidden = !visible;
    if (visible) count++;
  });
  $('#no-tools').hidden = count !== 0;
}
$('#tool-search').addEventListener('input', filterTools);
$$('[data-tool-filter]').forEach((button) =>
  button.addEventListener('click', () => {
    toolFilter = button.dataset.toolFilter;
    $$('[data-tool-filter]').forEach((item) => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    filterTools();
  }),
);

const plainClick = (event) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
document.addEventListener('click', (event) => {
  const target = event.target.closest('button,a');
  if (!target) return;
  // Links opened in a new tab or window go to their real address.
  if (target.matches('a[href]') && !plainClick(event)) return;
  if (target.dataset.action) {
    event.preventDefault();
    action(target.dataset.action, target).catch((error) => {
      busy(false);
      toast(friendly(error), true);
    });
  }
  // Tool cards link to their pages. With a document open, switch tools in place.
  if (target.dataset.startTool) {
    if (ui.busy || batch.isBusy()) {
      event.preventDefault();
      return;
    }
    if (state.pages.length) {
      event.preventDefault();
      showWorkspace();
      chooseTool(target.dataset.startTool);
      recordView('editor');
      $('#tool-panel h2').focus({ preventScroll: true });
    }
  }
  if (target.dataset.tool) chooseTool(target.dataset.tool);
  if (target.dataset.pageOpen) choosePage(target.dataset.pageOpen);
  if (target.dataset.movePage) movePage(target.dataset.movePage, Number(target.dataset.direction));
  if (target.dataset.selectItem) selectItem(target.dataset.selectItem, { reveal: true });
  if (target.dataset.removeAnnotation) deleteItem(target.dataset.removeAnnotation);
});
$('#file-input').addEventListener('change', (event) => openFiles(event.target.files, ui.append));
$('#image-input').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  await addImageFile(file);
  event.target.value = '';
});
/** Put a PNG or JPG on the current page with Add an image. */
export async function addImageFile(file) {
  try {
    if (!['image/png', 'image/jpeg'].includes(file.type))
      throw new Error('Please choose a PNG or JPG image.');
    if (file.size > 15 * 1024 * 1024) throw new Error('Please choose an image smaller than 15 MB.');
    const bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 30000000) {
      bitmap.close();
      throw new Error('Choose an image with fewer than 30 million pixels.');
    }
    ui.image = {
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      type: file.type === 'image/png' ? 'png' : 'jpg',
      ratio: bitmap.width / bitmap.height,
    };
    bitmap.close();
    if (ui.tool !== 'image') chooseTool('image');
    placeImage(ui.image);
    toast('Image added. Drag it into place, or drag a corner to resize it.');
  } catch (error) {
    toast(friendly(error), true);
  }
}
$('#signature-input').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    setSignature(await uploadedSignature(file, { removeBackground: ui.signatureDraft.removeBackground }));
  } catch (error) {
    toast(friendly(error), true);
  } finally {
    event.target.value = '';
  }
});
$('#page-list').addEventListener('change', (event) => {
  const id = event.target.dataset.pageSelect;
  if (!id) return;
  if (event.target.checked) ui.selected.add(id);
  else ui.selected.delete(id);
  renderTool();
});
$('#page-list').addEventListener('dragstart', (event) => {
  const item = event.target.closest('[data-page-id]');
  if (!item || ui.busy) return;
  ui.dragId = item.dataset.pageId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', ui.dragId);
  item.classList.add('dragging');
});
$('#page-list').addEventListener('dragover', (event) => {
  if (!ui.dragId) return;
  event.preventDefault();
  const item = event.target.closest('[data-page-id]');
  $$('.drag-target').forEach((el) => el.classList.remove('drag-target'));
  if (item) item.classList.add('drag-target');
});
$('#page-list').addEventListener('drop', (event) => {
  if (!ui.dragId) return;
  event.preventDefault();
  event.stopPropagation();
  const item = event.target.closest('[data-page-id]');
  if (item) movePage(ui.dragId, 0, item.dataset.pageId);
  ui.dragId = null;
  $$('.dragging,.drag-target').forEach((el) => el.classList.remove('dragging', 'drag-target'));
});
$('#page-list').addEventListener('dragend', () => {
  ui.dragId = null;
  $$('.dragging,.drag-target').forEach((el) => el.classList.remove('dragging', 'drag-target'));
});
let dragDepth = 0;
document.addEventListener('dragenter', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  if (dragDepth === 0) warmPdfTools();
  dragDepth++;
  $('#drop-zone').classList.add('drag-over');
});
document.addEventListener('dragleave', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  dragDepth--;
  if (dragDepth <= 0) $('#drop-zone').classList.remove('drag-over');
});
document.addEventListener('dragover', (event) => {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
});
document.addEventListener('drop', (event) => {
  if (!event.dataTransfer?.files.length) return;
  event.preventDefault();
  dragDepth = 0;
  $('#drop-zone').classList.remove('drag-over');
  if (batch.isOpen() || pageTool === 'batch') {
    if (!batch.isOpen()) batch.open();
    batch.addFiles(event.dataTransfer.files);
  } else openFiles(event.dataTransfer.files, !$('#workspace').hidden && state.pages.length > 0);
});
$('#info-dialog').addEventListener('click', (event) => {
  if (event.target === $('#info-dialog')) $('#info-dialog').close();
});
$('#confirm-dialog').addEventListener('click', (event) => {
  const dialog = $('#confirm-dialog'),
    choice = event.target.closest('[data-confirm]')?.dataset.confirm;
  if (choice) dialog.close(choice);
  else if (event.target === dialog) dialog.close('cancel');
});
const toastNode = $('#toast');
toastNode.addEventListener('mouseenter', () => clearTimeout(ui.toastTimer));
toastNode.addEventListener('mouseleave', scheduleToastHide);
toastNode.addEventListener('focusin', (event) => {
  clearTimeout(ui.toastTimer);
  if (!toastNode.contains(event.relatedTarget)) ui.toastReturnFocus = event.relatedTarget;
});
toastNode.addEventListener('focusout', (event) => {
  if (!toastNode.contains(event.relatedTarget)) scheduleToastHide();
});
window.addEventListener('popstate', (event) => {
  if (ignoreNextPop) {
    ignoreNextPop = false;
    return;
  }
  const target = event.state || { view: 'landing', depth: 0 };
  if (ui.busy || batch.isBusy()) {
    // Work is in progress: go back to the entry we were on and say why.
    const delta = ui.shownDepth - (Number(target.depth) || 0);
    if (delta) {
      ignoreNextPop = true;
      history.go(delta);
    }
    toast('Wait for the current task to finish, or stop it, before leaving this view.');
    return;
  }
  restoreView(target);
});
// Views restore their own scroll position; a reload starts on the landing view.
history.scrollRestoration = 'manual';
history.replaceState({ view: 'landing', depth: 0 }, '');
// Fonts finish loading after first use; redraw the text that waited for them.
onFontsReady(() => {
  baselines.clear();
  scheduleOverlays();
});
// The page fits the stage, which changes size with the window and the phone tool sheet.
let resizeTimer;
let phoneLayout = phone();
const refit = () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if ($('#workspace').hidden) return;
    renderStage();
    // The page strip scrolls in a different container on phones.
    if (phoneLayout !== phone()) {
      phoneLayout = phone();
      renderThumbnails();
    }
  }, 120);
};
if ('ResizeObserver' in window) new ResizeObserver(refit).observe($('#canvas-scroll'));
$('#canvas-scroll').addEventListener('scroll', onStageScroll, { passive: true });
// Control and the wheel (or a pinch on a touchpad) zoom the pages around the pointer.
$('#canvas-scroll').addEventListener(
  'wheel',
  (event) => {
    if (!event.ctrlKey || !state.pages.length || ui.busy) return;
    event.preventDefault();
    const scroll = $('#canvas-scroll'),
      area = scroll.getBoundingClientRect(),
      delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    setZoom(ui.zoom * Math.exp(-delta / 400), {
      x: event.clientX - area.left - scroll.clientLeft,
      y: event.clientY - area.top - scroll.clientTop,
    });
  },
  { passive: false },
);
window.addEventListener('resize', () => {
  if (!$('#toast').hidden) positionToast();
  refit();
});
window.addEventListener('beforeunload', (event) => {
  if ((state.pages.length && isDirty()) || batch.hasUnsavedWork()) {
    event.preventDefault();
    event.returnValue = '';
  }
});
export const typing = (element) =>
  ['INPUT', 'TEXTAREA', 'SELECT'].includes(element?.tagName) || element?.isContentEditable;
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('#toast').hidden && !document.querySelector('dialog[open]')) hideToast();
  if (
    !(event.ctrlKey || event.metaKey) ||
    event.altKey ||
    typing(document.activeElement) ||
    $('#workspace').hidden
  )
    return;
  if (document.querySelector('dialog[open]')) return;
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) {
    event.preventDefault();
    action('undo');
  } else if ((key === 'z' && event.shiftKey) || key === 'y') {
    event.preventDefault();
    action('redo');
  }
});
if (!window.File || !window.Blob || !window.Worker)
  toast(
    'QFT PDF needs a modern browser. Please use a recent version of Chrome, Edge, Firefox, or Safari.',
    true,
  );
