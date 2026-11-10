/**
 * QFT PDF's editor. app.js loads this module when a file is opened (or once the
 * page is idle); it starts the editor: the actions behind buttons, what the
 * editor redraws after a change, showing views, and the listeners. The rest
 * lives in:
 *   editor-core.js  shared state, helpers and messages
 *   history.js      edit history: change(), undo and redo
 *   views.js        addresses and browser history
 *   page-view.js    the page preview
 *   page-items.js   typing, moving and resizing items; crop drag
 *   form-ui.js      Fill form
 *   tool-panel.js   the tool panel's frame, and panel-*.js, one per tool
 *   pages.js        pages, the page strip and choosing tools
 *   documents.js    opening, building and downloading PDFs
 */

import { createZip, normalizePreset, safeBaseName } from './workflows.js';
import { initBatch } from './batch-ui.js';
import { savedSignature, uploadedSignature } from './signature.js';
import { number } from './layout.js';
import { change, onDocumentChanged, travel } from './history.js';
import { finishLanding, recordView, restoring, viewDepth, viewTitle } from './views.js';
import { geometryOf, onFontsReady } from './preview.js';
import {
  $,
  $$,
  activeIndex,
  annotationById,
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
  protectedDownload,
  selectedItem,
  setState,
  SETTINGS,
  showInfo,
  snapshot,
  state,
  toast,
  typing,
  ui,
} from './editor-core.js';
import { onStageScroll, renderStage, revealItem, scheduleOverlays, setZoom } from './page-view.js';
import { clearForm, fitFieldForTouch, focusField, initFormInputs, nextEmptyField } from './form-ui.js';
import {
  addDrawing,
  addHighlight,
  addImageFile,
  baselines,
  copySignature,
  createText,
  deleteItem,
  endGesture,
  initPageItems,
  placeImage,
  placeSignature,
  placeSignatureEverywhere,
  selectItem,
  stopEditing,
} from './page-items.js';
import { fillForm, renderTool } from './tool-panel.js';
import { cropDraftActive, cropValues, scopedPages, updateCropOverlays } from './panel-crop.js';
import { notesMargin, removeMargins } from './panel-margins.js';
import { clearProperties } from './panel-properties.js';
import { pad, setSignature, useSignature } from './panel-signature.js';
import { defaultSetting, toggleSetting } from './panel-settings.js';
import {
  choosePage,
  chooseTool,
  deletePages,
  insertBlankPage,
  interleavePages,
  movePage,
  renderPages,
  renderThumbnails,
  reversePages,
  rotateSelected,
  selectRange,
  setSheet,
  syncPageNavigation,
} from './pages.js';
import {
  downloadBytes,
  downloadDocument,
  downloadProtected,
  downloadSelected,
  isDirty,
  openFiles,
  outputName,
  showLanding,
  showWorkspace,
  warmPdfTools,
} from './documents.js';

export { openFiles, warmPdfTools as warm } from './documents.js';

// A signature kept on this device (Sign PDF) is ready when the editor is.
{
  const kept = savedSignature();
  if (kept) Object.assign(ui, { signature: kept, signatureKept: true });
}

// Listeners on the page stack, added in the order the editor has always added them.
initFormInputs();
initPageItems();

// ---- After a change (history.js) ----------------------------------------------------

onDocumentChanged((layout) => {
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
});
/** While downloads need a password, the Download button shows a lock and says so. */
function updateDownloadButton() {
  const button = $('#download-button'),
    locked = protectedDownload();
  $('use', button).setAttribute('href', locked ? '#i-lock' : '#i-download');
  $('.download-protected', button).hidden = !locked;
  if (locked) button.title = 'Your download will need its password to open';
  else button.removeAttribute('title');
}
/** Undo and Redo are on when there is a step to take, and say which ("Undo: Rotate pages"). */
function updateHistoryButtons() {
  for (const [id, steps, verb] of [
    ['#undo-button', ui.past, 'Undo'],
    ['#redo-button', ui.future, 'Redo'],
  ]) {
    const button = $(id),
      label = steps.at(-1)?.label;
    button.disabled = !steps.length;
    if (label) {
      button.title = verb + ': ' + label;
      button.setAttribute('aria-label', verb + ': ' + label);
    } else {
      button.removeAttribute('title');
      button.removeAttribute('aria-label');
    }
  }
}
function undoOrRedo(from, to, done) {
  if (ui.busy || !from.length) return;
  stopEditing();
  endGesture();
  const step = travel(from, to);
  if (!step) return;
  renderTool();
  // Says what was undone, in place of a notice about what no longer holds.
  toast(done + (step.label ? ': ' + step.label : '') + '.');
}
const undo = () => undoOrRedo(ui.past, ui.future, 'Undone');
const redo = () => undoOrRedo(ui.future, ui.past, 'Redone');

// ---- Views (views.js records them) -----------------------------------------------
let ignoreNextPop = false;
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
function restoreView(target) {
  restoring(() => {
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
  });
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
      ui.selectedByDefault = true;
      ui.item = null;
      ui.stage.reveal = ui.activeId;
    },
    { layout: true, label: 'Reset' },
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
    setZoom(name === 'zoom-fit' ? 1 : quarters / 4, null, { max: Math.max(3, ui.zoom) });
    ui.zoomByHand = true;
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
    change(() => (state.protection = null), { label: 'Remove password' });
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
  if (name === 'add-drawing') {
    addDrawing(currentPage());
    revealItem(ui.item);
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
        state[key] ||= defaultSetting(key);
        state[key].enabled = true;
        state[key].pages = ids;
      });
      fillForm({ all: true });
    }
  }
  if (name === 'select-all' || name === 'select-none') {
    ui.selected = name === 'select-all' ? new Set(state.pages.map((p) => p.id)) : new Set();
    ui.selectedByDefault = false;
    $$('[data-page-select]').forEach((input) => (input.checked = ui.selected.has(input.dataset.pageSelect)));
    renderTool();
  }
  if (name === 'select-range') selectRange();
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
        { layout: true, label: 'Restore crop' },
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
  if (name === 'reverse-pages') reversePages();
  if (name === 'margins-notes') notesMargin();
  if (name === 'margins-remove') removeMargins();
  if (name === 'interleave-pages') interleavePages();
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
function sendSettingsToBatch() {
  try {
    const key = SETTINGS[ui.tool],
      preset = { version: 1, name: names[ui.tool] + ' preset' };
    if (key) {
      const { enabled, pages, ...setting } = state[key] || defaultSetting(key);
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
const batch = initBatch({
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
ui.batch = batch;
// Arrow keys move through the closed menu, changing the tool with every press:
// looking at the tools, not choosing one (see chooseTool).
$('#tool-select').addEventListener('keydown', (event) => {
  if (
    ['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key) ||
    event.key.length === 1
  ) {
    ui.menuTraversal = performance.now();
  }
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
/** A click on a button or link (app.js finds the target and lets links opened in a new tab be). */
export function handleClick(event, target) {
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
  if (target.dataset.selectItem) selectItem(target.dataset.selectItem, { reveal: true });
  if (target.dataset.removeAnnotation) deleteItem(target.dataset.removeAnnotation);
}
$('#image-input').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  await addImageFile(file);
  event.target.value = '';
});
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
  ui.selectedByDefault = false;
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
/** Files dropped on the page (app.js listens): into the batch when it is open or on its page, else opened. */
export function openDropped(files) {
  if (batch.isOpen() || pageTool === 'batch') {
    if (!batch.isOpen()) batch.open();
    batch.addFiles(files);
  } else openFiles(files, !$('#workspace').hidden && state.pages.length > 0);
}
/** Back or Forward (app.js listens): show the view the history entry names. */
export function popstate(event) {
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
}
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
    // A phone's keyboard or a turn changes Fit: a focused form field keeps its size.
    fitFieldForTouch(document.activeElement, { again: true });
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
    // Like the buttons: from a field zoom above 300%, down to 300% and no further up.
    setZoom(
      ui.zoom * Math.exp(-delta / 400),
      { x: event.clientX - area.left - scroll.clientLeft, y: event.clientY - area.top - scroll.clientTop },
      { max: Math.max(3, ui.zoom) },
    );
    ui.zoomByHand = true;
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
window.addEventListener('keydown', (event) => {
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
