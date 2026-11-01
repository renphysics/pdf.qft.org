import {
  openPdf,
  imagesToPdf,
  buildPdfWithNotes,
  parsePageRange,
  cropMarginsForRotation,
  loadPdfLib,
  passwordProblem,
} from './pdf-engine.js';
import { planSplit, splitPdf, createZip, normalizePreset, safeBaseName } from './workflows.js';
import { initBatch } from './batch-ui.js';
import { isPicture, pagesToImages, pictureForPage } from './convert.js';
import {
  forgetSignature,
  loadSignatureFont,
  saveSignature,
  savedSignature,
  signaturePad,
  typedSignature,
  uploadedSignature,
} from './signature.js';
import { TOOL_PAGES } from './routes.js';
import { applyMatrix, fontKind, hexColor, invert, number, TEXT_LINE_HEIGHT, textValue } from './layout.js';
import {
  closeDocuments,
  FONT_FAMILIES,
  geometryOf,
  loadPdfjs,
  onFontsReady,
  pageOverlay,
  previewFont,
  renderKey,
  renderPage,
  warmFont,
} from './preview.js';

// Resolve assets beside this module, including GitHub Pages project subpaths.
const assetUrl = (path) => new URL(path, import.meta.url).href;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (name) => '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
const safe = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const uid = () =>
  'f-' + [...crypto.getRandomValues(new Uint32Array(4))].map((value) => value.toString(36)).join('-');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const SVG_NS = 'http://www.w3.org/2000/svg';
const phone = () => window.innerWidth <= 720;
const touch = () => matchMedia('(pointer: coarse)').matches;
/** Guidance says "Tap" on touch screens. */
const tapOrClick = (text) =>
  touch() ? text.replace(/\bClick\b/g, 'Tap').replace(/\bclick\b/g, 'tap') : text;

// Tools that place items on a page; their items can be selected, dragged and resized.
const ANNOTATION_TOOLS = ['text', 'image', 'highlight', 'signature'];
// Tools that show a repeated setting on pages, and the state key each one edits.
const SETTINGS = { watermark: 'watermark', footer: 'headerFooter', numbers: 'pageNumbers' };
const SETTING_TOOL = { watermark: 'watermark', headerFooter: 'footer', pageNumbers: 'numbers' };
// Resize handles for each kind of item, named by compass direction.
const HANDLES = {
  text: ['e'],
  image: ['nw', 'ne', 'sw', 'se'],
  signature: ['nw', 'ne', 'sw', 'se'],
  highlight: ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'],
};
const THUMB_WIDTH = 172; // canvas pixels: sharp at 86 CSS pixels on high-density screens
const THUMB_CACHE = 60;

const emptyState = () => ({
  sources: [],
  pages: [],
  annotations: [],
  watermark: null,
  headerFooter: null,
  pageNumbers: null,
  // { enabled, password }: downloads need this password to open. Kept in memory only.
  protection: null,
});
let state = emptyState();
const ui = {
  tool: 'text',
  activeId: null,
  selected: new Set(),
  item: null, // the selected item on the current page
  editing: null, // the text item being typed into on the page
  zoom: 1,
  past: [],
  future: [],
  lastChange: null,
  pendingRecord: null,
  version: 0,
  savedVersion: 0,
  exported: null,
  initial: null,
  busy: false,
  append: false,
  image: null,
  styles: { text: { size: 18, color: '#244e41' }, highlight: { color: '#f6ce53', opacity: 0.35 } },
  dragId: null,
  gesture: null,
  toastTimer: null,
  toastReturnFocus: null,
  focusKey: null,
  splitResults: null,
  splitDraft: { mode: 'each', size: 2, ranges: '' },
  rangeDraft: '',
  cropDraft: { left: 0, top: 0, right: 0, bottom: 0, scope: 'current' },
  scopeErrors: {},
  cancelOperation: false,
  cancelExport: null,
  lastCropPreset: null,
  shownDepth: 0,
  landingFocus: null,
  stage: { key: null, pageKey: null, task: null, scale: 1, geometry: null, overlay: null },
  thumbs: { observer: null, token: 0, task: null, cache: new Map() },
  frame: 0,
  sheetOpen: true,
  // The signature to place (a PNG: { bytes, type, width, height }), and the one being made.
  signature: null,
  signatureKept: false,
  signatureDraft: { mode: 'draw', strokes: [], text: '', color: '#141414', removeBackground: true },
  // Pages made from pictures: paper size ('fit' is the picture's own size) and margin in points.
  pictureLayout: {
    size: /^(en|es)-(US|CA|MX|PH)$/i.test(navigator.language || '') ? 'letter' : 'a4',
    margin: 24,
  },
  pictureExport: { format: 'jpg', dpi: 150, scope: 'all' },
};
{
  const kept = savedSignature();
  if (kept) Object.assign(ui, { signature: kept, signatureKept: true });
}
// Tool pages (routes.js) name their tool on <body data-tool>; it opens first.
const pageTool = TOOL_PAGES[document.body.dataset.tool] ? document.body.dataset.tool : null;
if (pageTool && pageTool !== 'batch') ui.tool = pageTool;
const names = {
  text: 'Add text',
  image: 'Add an image',
  highlight: 'Highlight',
  watermark: 'Watermark',
  footer: 'Headers & footers',
  numbers: 'Page numbers',
  pages: 'Organize pages',
  merge: 'Merge PDFs',
  delete: 'Delete Pages',
  crop: 'Crop PDF',
  split: 'Split PDF',
  protect: 'Protect PDF',
  unlock: 'Unlock PDF',
  signature: 'Sign PDF',
  jpgtopdf: 'JPG to PDF',
  pdftojpg: 'PDF to JPG',
};
const descriptions = {
  text: 'Click the page where your text should start, then type. Drag text to move it.',
  image: 'Add a PNG or JPG to this page, then drag it into place. Drag a corner to resize it.',
  highlight: 'Drag across the page to highlight an area. Drag a highlight to move it.',
  watermark:
    'A text mark across your pages, as bold or as subtle as you like. Changes show as you make them.',
  footer: 'Put the same details in a consistent place on your pages. Type in any position to add it.',
  numbers: 'Give your document an easy-to-follow sequence. Changes show as you make them.',
  pages: 'Choose pages in the strip. Drag to reorder, or use the buttons below.',
  merge: 'Add PDF files, then arrange their pages in the strip.',
  delete: 'Select the pages to remove using their checkboxes or a page range. Undo brings them back.',
  crop: 'Drag across the page to choose the area to keep, or set the margins below.',
  split: 'Create separate PDFs from this document, including your edits.',
  protect: 'Choose a password. Anyone who opens the PDF you download will need it.',
  unlock: 'Download a copy of your PDF that opens without a password.',
  signature:
    'Draw, type or upload your signature, then click the page where it belongs. Drag it to move it, or a corner to resize it.',
  jpgtopdf:
    'Your JPG and PNG pictures are pages. Choose their paper size, put them in order in the page strip, then download one PDF.',
  pdftojpg: 'Save pages as JPG or PNG pictures, exactly as they look with your edits.',
};
const settingDefaults = {
  watermark: () => ({
    enabled: true,
    text: 'DRAFT',
    size: 48,
    color: '#7c8c76',
    opacity: 0.18,
    angle: -35,
    position: 'center',
    pages: 'all',
  }),
  headerFooter: () => ({
    enabled: true,
    headerLeft: '',
    headerCenter: '',
    headerRight: '',
    footerLeft: '',
    footerCenter: '',
    footerRight: '',
    size: 10,
    color: '#53635d',
    margin: 28,
    pages: 'all',
  }),
  pageNumbers: () => ({
    enabled: true,
    format: 'Page {page} of {total}',
    start: 1,
    size: 10,
    color: '#53635d',
    margin: 28,
    position: 'bottom-right',
    pages: 'all',
  }),
};

function copySetting(setting) {
  return setting
    ? { ...setting, pages: Array.isArray(setting.pages) ? [...setting.pages] : setting.pages }
    : null;
}
function snapshot(current = state) {
  return {
    sources: [...current.sources],
    pages: current.pages.map((p) => ({ ...p, crop: p.crop ? { ...p.crop } : undefined })),
    annotations: current.annotations.map((a) => ({
      ...a,
      pageCrop: a.pageCrop ? { ...a.pageCrop } : undefined,
    })),
    watermark: copySetting(current.watermark),
    headerFooter: copySetting(current.headerFooter),
    pageNumbers: copySetting(current.pageNumbers),
    protection: current.protection ? { ...current.protection } : null,
  };
}
function busy(value, message = 'Working on your PDF…') {
  // Making #main inert drops keyboard focus. Remember the control and return to
  // its re-rendered equivalent afterwards (callers may set ui.focusKey instead).
  if (value && !ui.busy) ui.focusKey = focusKey();
  ui.busy = value;
  if (!value) $('#busy-cancel').hidden = true;
  $('#busy-overlay').hidden = !value;
  $('#busy-message').textContent = message;
  $('#download-button').disabled = value;
  $('#main').setAttribute('aria-busy', String(value));
  $('#main').inert = value;
  $('.site-header').inert = value;
  if (!value) {
    const key = ui.focusKey;
    ui.focusKey = null;
    restoreFocus(key);
  }
}
/** Offer a Cancel button on the busy overlay. */
function cancellable(label, onCancel) {
  const button = $('#busy-cancel');
  button.textContent = label;
  button.disabled = false;
  button.hidden = false;
  ui.cancelExport = onCancel;
}
/** Describe the focused control so its replacement can be found after a re-render. */
function focusKey(element = document.activeElement) {
  if (!element || element === document.body || !element.isConnected) return null;
  const esc = (value) => CSS.escape(String(value));
  const pageId = element.closest('[data-page-id]')?.dataset.pageId;
  const pageFallback = pageId ? '[data-page-open="' + esc(pageId) + '"]' : null;
  if (element.dataset.movePage)
    return [
      '[data-move-page="' +
        esc(element.dataset.movePage) +
        '"][data-direction="' +
        esc(element.dataset.direction) +
        '"]',
      pageFallback,
    ];
  if (element.dataset.pageOpen) return [pageFallback];
  if (element.dataset.pageSelect) return ['[data-page-select="' + esc(pageId) + '"]', pageFallback];
  if (element.dataset.itemId)
    return ['[data-item-id="' + esc(element.dataset.itemId) + '"]', '#canvas-scroll'];
  if (element.id === 'inline-editor') return ['#canvas-scroll'];
  const panelFallback = element.closest('#tool-panel') ? '#tool-panel h2' : null;
  if (panelFallback && element.name && element.type === 'radio')
    return ['#tool-form [name="' + esc(element.name) + '"]:checked', panelFallback];
  if (panelFallback && element.name) return ['#tool-form [name="' + esc(element.name) + '"]', panelFallback];
  if (element.dataset.selectItem)
    return ['[data-select-item="' + esc(element.dataset.selectItem) + '"]', panelFallback];
  if (element.dataset.action) return ['[data-action="' + esc(element.dataset.action) + '"]', panelFallback];
  if (element.dataset.tool)
    return ['.tool-tabs [data-tool="' + esc(element.dataset.tool) + '"]', panelFallback];
  if (element.id) return ['#' + esc(element.id), panelFallback];
  return panelFallback ? [panelFallback] : null;
}
/** Focus the first visible, enabled match of a focusKey() description. */
function restoreFocus(key) {
  for (const selector of [].concat(key || [])) {
    if (!selector) continue;
    const target = $$(selector).find((element) => !element.disabled && element.getClientRects().length);
    if (target) {
      target.focus({ preventScroll: true });
      return true;
    }
  }
  return false;
}
/**
 * Show a notice. Errors stay until dismissed; other notices hide after a few
 * seconds unless the pointer or keyboard focus is on them. Screen readers hear
 * the message through persistent live regions (pass announce: false when the
 * caller already updates its own status region).
 */
function toast(message, error = false, { announce = true } = {}) {
  const node = $('#toast');
  $('#toast-message').textContent = message;
  node.classList.toggle('error', error);
  node.hidden = false;
  positionToast();
  if (announce) announceMessage(message, error);
  scheduleToastHide();
}
/** In the editor, centre the notice between page navigation and zoom controls. */
function positionToast() {
  const node = $('#toast');
  if (!document.body.classList.contains('editing') || phone()) return;
  const bar = $('.preview-toolbar').getBoundingClientRect(),
    nav = $('.page-navigation').getBoundingClientRect(),
    zoom = $('.zoom-controls').getBoundingClientRect(),
    center = bar.left + bar.width / 2,
    room = 2 * (Math.min(center - nav.right, zoom.left - center) - 12);
  node.style.setProperty('--toast-left', center + 'px');
  node.style.setProperty('--toast-top', bar.top + 4 + 'px');
  node.style.setProperty('--toast-width', Math.max(240, Math.min(460, room)) + 'px');
}
function scheduleToastHide() {
  clearTimeout(ui.toastTimer);
  if ($('#toast').hidden || $('#toast').classList.contains('error')) return;
  ui.toastTimer = setTimeout(hideToast, 5000);
}
function hideToast() {
  clearTimeout(ui.toastTimer);
  const node = $('#toast'),
    hadFocus = node.contains(document.activeElement);
  node.hidden = true;
  if (hadFocus && ui.toastReturnFocus?.isConnected) ui.toastReturnFocus.focus({ preventScroll: true });
  ui.toastReturnFocus = null;
}
function announceMessage(message, assertive = false) {
  const region = $(assertive ? '#announce-alert' : '#announce-status');
  region.textContent = '';
  // Inserting fresh text into an existing live region is announced, even for a repeated message.
  setTimeout(() => {
    region.textContent = message;
  }, 60);
}
/**
 * Ask before a destructive step. Resolves true only for the confirm button;
 * Escape, Cancel and clicking the backdrop all resolve false. Focus starts on
 * Cancel and returns to the triggering control when the dialog closes.
 */
function confirmDialog({ eyebrow = '', title, body, confirmLabel }) {
  const dialog = $('#confirm-dialog');
  $('#confirm-eyebrow').textContent = eyebrow;
  $('#confirm-title').textContent = title;
  $('#confirm-body').textContent = body;
  $('#confirm-accept').textContent = confirmLabel;
  dialog.returnValue = '';
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    dialog.showModal();
  });
}
function friendly(error) {
  console.error(error);
  return error?.message || 'That did not work. Please try a different PDF.';
}
function activeIndex() {
  const index = state.pages.findIndex((p) => p.id === ui.activeId);
  return index < 0 ? 0 : index;
}
function currentPage() {
  return state.pages[activeIndex()];
}
function pageIndexOf(id) {
  return state.pages.findIndex((page) => page.id === id);
}
function annotationById(id) {
  return id ? state.annotations.find((annotation) => annotation.id === id) || null : null;
}
/** The selected item, if it is on the current page. */
function selectedItem() {
  const annotation = annotationById(ui.item);
  return annotation && annotation.pageId === ui.activeId ? annotation : null;
}
function formatSize(bytes) {
  return bytes >= 1048576
    ? (bytes / 1048576).toFixed(1) + ' MB'
    : Math.max(1, Math.round(bytes / 1024)) + ' KB';
}
/** "1-3, 5" from zero-based page indexes. */
function rangeText(indexes) {
  const sorted = [...new Set(indexes)].sort((a, b) => a - b),
    parts = [];
  for (let i = 0; i < sorted.length; i++) {
    let end = i;
    while (sorted[end + 1] === sorted[end] + 1) end++;
    parts.push(end > i ? sorted[i] + 1 + '-' + (sorted[end] + 1) : String(sorted[i] + 1));
    i = end;
  }
  return parts.join(', ');
}

// ---- Edit history --------------------------------------------------------------
// Edits apply at once. Each change() is one undo step, except that changes with
// the same key in quick succession (typing, dragging, a slider) merge into one.

function record() {
  return { state: snapshot(), active: ui.activeId, selected: new Set(ui.selected), item: ui.item };
}
function change(mutate, { key = null, layout = false, before = null } = {}) {
  const now = performance.now();
  const merge = key && ui.lastChange?.key === key && now - ui.lastChange.time < 1500;
  if (!merge) {
    ui.past.push(before || record());
    if (ui.past.length > 100) ui.past.shift();
  }
  ui.future = [];
  ui.lastChange = key ? { key, time: now } : null;
  mutate();
  ui.version++;
  if (ui.splitResults) {
    ui.splitResults = null;
    $('#split-results')?.replaceChildren();
  }
  documentChanged(layout);
}
/** Bring the editor up to date with the document. `layout`: pages were added, removed, moved, turned or cropped. */
function documentChanged(layout) {
  if (!state.pages.some((p) => p.id === ui.activeId)) ui.activeId = state.pages[0]?.id;
  ui.selected = new Set([...ui.selected].filter((id) => state.pages.some((p) => p.id === id)));
  if (ui.item && !selectedItem()) ui.item = null;
  if (ui.editing && !annotationById(ui.editing)) stopEditing();
  updateHistoryButtons();
  updateDocumentInfo();
  updateDownloadButton();
  if (layout) {
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
  to.push(record());
  const entry = from.pop();
  state = entry.state;
  ui.activeId = entry.active;
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

// ---- The page preview ----------------------------------------------------------
// The current page is rendered from its source PDF; edits are drawn on top as
// SVG (preview.js), and items can be selected and moved on the edit layer.

function stageScale(geometry) {
  const scroll = $('#canvas-scroll');
  const width = Math.max(120, scroll.clientWidth - (phone() ? 24 : 60));
  let fit = Math.min(width / geometry.width, 1.35);
  // On phones the whole page fits the stage; zoom in to work on details.
  if (phone()) fit = Math.min(fit, Math.max(120, scroll.clientHeight - 24) / geometry.height);
  return fit * ui.zoom;
}
function renderStage() {
  if (!state.pages.length || $('#workspace').hidden) return;
  const index = activeIndex(),
    descriptor = state.pages[index],
    geometry = geometryOf(state, descriptor),
    stage = ui.stage,
    surface = $('#page-surface'),
    canvas = $('#pdf-canvas'),
    scroll = $('#canvas-scroll');
  // Whole CSS pixels for the page's size and position keep its rendering sharp.
  const width = Math.max(1, Math.round(geometry.width * stageScale(geometry))),
    scale = width / geometry.width,
    padding =
      parseFloat(getComputedStyle(scroll).paddingLeft) + parseFloat(getComputedStyle(scroll).paddingRight),
    room = scroll.clientWidth - padding;
  stage.geometry = geometry;
  stage.scale = scale;
  surface.style.width = width + 'px';
  surface.style.height = Math.max(1, Math.round(geometry.height * scale)) + 'px';
  surface.style.marginLeft = width < room ? Math.floor((room - width) / 2) + 'px' : '0px';
  const pageKey = renderKey(descriptor),
    dpr = Math.min(devicePixelRatio || 1, 2),
    key = pageKey + '@' + (scale * dpr).toFixed(3);
  if (stage.key !== key) {
    stage.task?.cancel();
    stage.key = key;
    if (stage.pageKey !== pageKey) {
      // A different page: clear the old image rather than show it under new edits.
      canvas.width = 1;
      canvas.height = 1;
      surface.classList.add('render-pending');
    }
    stage.pageKey = pageKey;
    const task = renderPage(state, descriptor, scale * dpr);
    stage.task = task;
    task.promise.then(
      (rendered) => {
        if (stage.task !== task) return;
        stage.task = null;
        canvas.width = rendered.width;
        canvas.height = rendered.height;
        canvas.getContext('2d').drawImage(rendered, 0, 0);
        rendered.width = 0;
        rendered.height = 0;
        surface.classList.remove('render-pending');
      },
      (error) => {
        if (stage.task !== task) return;
        stage.task = null;
        surface.classList.remove('render-pending');
        if (error?.name !== 'RenderingCancelledException')
          toast('Could not preview this page. ' + friendly(error), true);
      },
    );
  }
  canvas.setAttribute('aria-label', 'Page ' + (index + 1) + ' of ' + state.pages.length);
  syncPageNavigation();
  $('#zoom-label').textContent = ui.zoom === 1 ? 'Fit' : Math.round(ui.zoom * 100) + '%';
  $('[data-action=previous]').disabled = index === 0;
  $('[data-action=next]').disabled = index === state.pages.length - 1;
  updateSelectionCaption();
  surface.classList.toggle('placing', ['text', 'highlight', 'signature'].includes(ui.tool));
  surface.dataset.tool = ui.tool;
  renderOverlay();
  updateCropOverlay();
}
function scheduleOverlays() {
  if (ui.frame) return;
  ui.frame = requestAnimationFrame(() => {
    ui.frame = 0;
    if ($('#workspace').hidden || !state.pages.length) return;
    renderOverlay();
    refreshThumbOverlays();
  });
}
function renderOverlay() {
  const index = activeIndex();
  if (!state.pages[index] || !ui.stage.geometry) return;
  const overlay = pageOverlay(state, index, { hide: ui.editing ? new Set([ui.editing]) : null });
  ui.stage.overlay = overlay;
  const svg = $('#page-overlay');
  svg.setAttribute('viewBox', '0 0 ' + overlay.geometry.width + ' ' + overlay.geometry.height);
  svg.innerHTML = overlay.markup;
  renderEditLayer();
  positionInlineEditor();
  updateProblems(overlay.problems);
  updateStageHint();
}
function overlayItem(id) {
  return ui.stage.overlay?.items.find((item) => item.id === id) || null;
}
/** CSS transform placing an element over a frame given in an item's placement view. */
function frameTransform(item, frame, scale, extra = '') {
  const [a, b, c, d, e, f] = item.matrix;
  const tx = (a * frame.x + c * frame.y + e) * scale,
    ty = (b * frame.x + d * frame.y + f) * scale;
  return (
    'matrix(' + [a, b, c, d, tx, ty].map((value) => Math.round(value * 1000) / 1000).join(',') + ')' + extra
  );
}
function itemLabel(annotation) {
  if (annotation.type === 'text') {
    const text = textValue(annotation.text).trim().replace(/\s+/g, ' ');
    return 'Text: ' + (text ? '“' + (text.length > 40 ? text.slice(0, 40) + '…' : text) + '”' : 'empty');
  }
  return { image: 'Image', signature: 'Signature' }[annotation.type] || 'Highlight';
}
function renderEditLayer() {
  const layer = $('#edit-layer'),
    interactive = ANNOTATION_TOOLS.includes(ui.tool),
    scale = ui.stage.scale;
  layer.classList.toggle('interactive', interactive);
  const items = interactive ? (ui.stage.overlay?.items || []).filter((item) => item.frame) : [];
  const existing = new Map($$('[data-item-id]', layer).map((node) => [node.dataset.itemId, node]));
  for (const item of items) {
    let node = existing.get(item.id);
    existing.delete(item.id);
    if (!node) {
      node = document.createElement('div');
      node.className = 'item-box';
      node.tabIndex = 0;
      node.dataset.itemId = item.id;
      node.setAttribute('role', 'button');
      node.setAttribute('aria-describedby', 'item-help');
      layer.append(node);
    }
    const selected = item.id === ui.item;
    node.classList.toggle('selected', selected);
    node.classList.toggle('editing', item.id === ui.editing);
    node.classList.toggle('problem', Boolean(item.problem));
    node.dataset.type = item.type;
    node.title = item.problem || '';
    node.setAttribute('aria-label', itemLabel(item.annotation) + (item.problem ? '. ' + item.problem : ''));
    node.style.width = Math.max(1, item.frame.width * scale) + 'px';
    node.style.height = Math.max(1, item.frame.height * scale) + 'px';
    node.style.transform = frameTransform(item, item.frame, scale);
    const handles = selected && item.id !== ui.editing ? HANDLES[item.type] : [];
    if (node.dataset.handles !== handles.join()) {
      node.dataset.handles = handles.join();
      node.replaceChildren(
        ...handles.map((name) => {
          const handle = document.createElement('span');
          handle.className = 'handle handle-' + name;
          handle.dataset.handle = name;
          return handle;
        }),
      );
    }
  }
  for (const node of existing.values()) node.remove();
}
function focusItem(id) {
  const node = $('[data-item-id="' + CSS.escape(id) + '"]');
  if (node) node.focus({ preventScroll: true });
  else $('#canvas-scroll').focus({ preventScroll: true });
}
function updateProblems(problems) {
  const node = $('#panel-problems');
  if (!node) return;
  const messages = [...new Set(problems.map((problem) => problem.message))];
  const text = messages.join(' ');
  if (node.dataset.text === text) return;
  node.dataset.text = text;
  node.hidden = !messages.length;
  node.innerHTML = messages.map((message) => '<p>' + icon('help') + safe(message) + '</p>').join('');
}
function updateStageHint() {
  const status = $('#preview-status');
  const problems = ui.stage.overlay?.problems || [];
  let hint = 'Your edits show here as you make them.';
  if (ui.tool === 'text')
    hint = ui.editing
      ? 'Type your text. Click outside it when you are done.'
      : 'Click the page where your text should start.';
  if (ui.tool === 'image')
    hint = selectedItem()
      ? 'Drag the image to move it. Drag a corner to resize it.'
      : 'Choose an image to add it to this page.';
  if (ui.tool === 'highlight') hint = 'Drag across the page to highlight an area.';
  if (ui.tool === 'signature')
    hint = selectedItem()
      ? 'Drag the signature to move it. Drag a corner to resize it.'
      : ui.signature
        ? 'Click the page where your signature belongs.'
        : 'Make your signature in the panel, then click the page to place it.';
  if (ui.tool === 'crop') hint = 'Drag across the page to choose the area to keep.';
  if (ui.tool === 'pages' || ui.tool === 'delete')
    hint = 'Choose pages with the checkboxes in the page strip.';
  if (problems.length) hint = 'Check this page: ' + problems[0].message;
  status.classList.toggle('warning', problems.length > 0);
  status.innerHTML = icon(problems.length ? 'help' : 'check') + safe(tapOrClick(hint));
}
function updateSelectionCaption() {
  if (!state.pages.length) return;
  $('#selection-caption').textContent =
    'Page ' + (activeIndex() + 1) + ' · ' + ui.selected.size + ' selected';
}

// ---- Typing on the page ---------------------------------------------------------

const baselines = new Map();
/** Where a CSS line box puts the first baseline, as a fraction of the font size. */
function cssBaseline(kind) {
  if (!baselines.has(kind)) {
    if (!document.fonts.check('16px "' + FONT_FAMILIES[kind] + '"')) return null;
    const context = document.createElement('canvas').getContext('2d');
    context.font = '100px "' + FONT_FAMILIES[kind] + '"';
    const metrics = context.measureText('Hg');
    const ascent = metrics.fontBoundingBoxAscent,
      descent = metrics.fontBoundingBoxDescent;
    if (!Number.isFinite(ascent) || !Number.isFinite(descent)) return null;
    baselines.set(kind, ((TEXT_LINE_HEIGHT * 100 - ascent - descent) / 2 + ascent) / 100);
  }
  return baselines.get(kind);
}
function startEditing(id) {
  const annotation = annotationById(id);
  if (!annotation || annotation.type !== 'text') return;
  if (ui.editing && ui.editing !== id) stopEditing();
  ui.item = id;
  ui.editing = id;
  // Phones: fold the tool sheet away so the page stays visible above the keyboard.
  if (phone()) setSheet(false);
  const editor = $('#inline-editor');
  editor.value = textValue(annotation.text);
  editor.hidden = false;
  renderOverlay();
  renderTool();
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(editor.value.length, editor.value.length);
}
function positionInlineEditor() {
  const editor = $('#inline-editor');
  const item = ui.editing ? overlayItem(ui.editing) : null;
  if (!item?.frame) {
    if (!ui.editing) editor.hidden = true;
    return;
  }
  const annotation = item.annotation,
    scale = ui.stage.scale,
    size = number(annotation.fontSize, 16, 4, 200),
    kind = fontKind(editor.value),
    frame = item.frame,
    room = item.placement.width - frame.x;
  // Left-aligned text grows to the right as you type, so the box may reach the page edge.
  const width = annotation.autoWidth && (annotation.align || 'left') === 'left' ? room : frame.width + 2;
  editor.style.fontFamily = '"' + FONT_FAMILIES[kind] + '", sans-serif';
  editor.style.fontSize = size * scale + 'px';
  editor.style.lineHeight = size * TEXT_LINE_HEIGHT * scale + 'px';
  editor.style.color = hexColor(annotation.color);
  editor.style.opacity = number(annotation.opacity, 1, 0, 1);
  editor.style.textAlign = annotation.align || 'left';
  editor.style.width = Math.max(8, width * scale) + 'px';
  editor.style.height = Math.max(frame.height, size * TEXT_LINE_HEIGHT) * scale + 'px';
  // Line the typed text up with the exported text's first baseline.
  const baseline = cssBaseline(kind),
    ascent = item.layout ? item.layout.ascent / size : null;
  const shift = baseline !== null && ascent !== null ? (ascent - baseline) * size * scale : 0;
  editor.style.transform = frameTransform(item, frame, scale, ' translateY(' + shift.toFixed(2) + 'px)');
}
function stopEditing() {
  const id = ui.editing;
  if (!id) return;
  ui.editing = null;
  const editor = $('#inline-editor'),
    hadFocus = document.activeElement === editor;
  editor.hidden = true;
  const annotation = annotationById(id);
  let removed = false;
  if (annotation && !textValue(annotation.text).trim()) {
    removed = true;
    if (ui.pendingRecord) {
      // Nothing was typed: the new text box leaves no trace in the history.
      state.annotations = state.annotations.filter((item) => item.id !== id);
    } else
      change(
        () => {
          state.annotations = state.annotations.filter((item) => item.id !== id);
        },
        { key: 'text:' + id },
      );
    if (ui.item === id) ui.item = null;
  }
  ui.pendingRecord = null;
  renderOverlay();
  refreshThumbOverlays();
  if (removed) renderTool();
  if (hadFocus) focusItem(id);
}
/** Add a text box at a point in the current view and start typing in it. */
function createText(point) {
  const page = currentPage(),
    geometry = ui.stage.geometry,
    size = ui.styles.text.size;
  stopEditing();
  const lineHeight = (size * TEXT_LINE_HEIGHT) / geometry.height;
  const annotation = {
    id: uid(),
    pageId: page.id,
    pageRotation: page.rotation,
    pageCrop: page.crop ? { ...page.crop } : undefined,
    type: 'text',
    text: '',
    fontSize: size,
    color: ui.styles.text.color,
    x: clamp(point.x / geometry.width, 0, 0.95),
    y: clamp(point.y / geometry.height, 0, Math.max(0, 1 - lineHeight)),
    opacity: 1,
    align: 'left',
    autoWidth: true,
  };
  // The box joins the history with its first character (see the editor's input handler).
  ui.pendingRecord = record();
  state.annotations.push(annotation);
  startEditing(annotation.id);
}

// ---- Moving and resizing items --------------------------------------------------

/** A pointer position in the current page view, in points from the top-left. */
function surfacePoint(event) {
  const rect = $('#page-surface').getBoundingClientRect(),
    scale = ui.stage.scale;
  return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
}
function setFrame(annotation, item, frame) {
  const { placement } = item;
  annotation.x = frame.x / placement.width;
  annotation.y = frame.y / placement.height;
  if (annotation.type !== 'text') {
    annotation.width = frame.width / placement.width;
    annotation.height = frame.height / placement.height;
  }
}
function moveItem(gesture, point) {
  const annotation = annotationById(gesture.id),
    item = gesture.item;
  if (!annotation) return;
  const inverse = invert(item.matrix),
    start = applyMatrix(inverse, gesture.start.x, gesture.start.y),
    now = applyMatrix(inverse, point.x, point.y),
    { placement, frame } = item;
  const moved = {
    ...frame,
    x: clamp(frame.x + now.x - start.x, 0, Math.max(0, placement.width - frame.width)),
    y: clamp(frame.y + now.y - start.y, 0, Math.max(0, placement.height - frame.height)),
  };
  change(() => setFrame(annotation, item, moved), { key: gesture.key });
}
function resizeItem(gesture, point) {
  const annotation = annotationById(gesture.id),
    item = gesture.item;
  if (!annotation) return;
  const { placement, frame } = item,
    handle = gesture.handle,
    p = applyMatrix(invert(item.matrix), point.x, point.y),
    W = placement.width,
    H = placement.height;
  if (annotation.type === 'text') {
    const width = clamp(p.x, frame.x + 12, W) - frame.x;
    change(
      () => {
        annotation.width = width / W;
        annotation.autoWidth = false;
      },
      { key: gesture.key },
    );
    return;
  }
  let left = frame.x,
    top = frame.y,
    right = frame.x + frame.width,
    bottom = frame.y + frame.height;
  if (annotation.type === 'image' || annotation.type === 'signature') {
    // Keep the image's proportions, anchored at the opposite corner.
    const anchorX = handle.includes('w') ? right : left,
      anchorY = handle.includes('n') ? bottom : top;
    const roomX = handle.includes('w') ? anchorX : W - anchorX,
      roomY = handle.includes('n') ? anchorY : H - anchorY;
    let factor = Math.max(Math.abs(p.x - anchorX) / frame.width, Math.abs(p.y - anchorY) / frame.height);
    factor = clamp(
      factor,
      8 / Math.min(frame.width, frame.height),
      Math.min(roomX / frame.width, roomY / frame.height),
    );
    const width = frame.width * factor,
      height = frame.height * factor;
    left = handle.includes('w') ? anchorX - width : anchorX;
    top = handle.includes('n') ? anchorY - height : anchorY;
    right = left + width;
    bottom = top + height;
  } else {
    const minimum = 3;
    if (handle.includes('w')) left = clamp(p.x, 0, right - minimum);
    if (handle.includes('e')) right = clamp(p.x, left + minimum, W);
    if (handle.includes('n')) top = clamp(p.y, 0, bottom - minimum);
    if (handle.includes('s')) bottom = clamp(p.y, top + minimum, H);
  }
  change(() => setFrame(annotation, item, { x: left, y: top, width: right - left, height: bottom - top }), {
    key: gesture.key,
  });
}
function drawHighlight(gesture, point) {
  const geometry = ui.stage.geometry,
    page = currentPage();
  const x1 = clamp(Math.min(gesture.start.x, point.x), 0, geometry.width),
    x2 = clamp(Math.max(gesture.start.x, point.x), 0, geometry.width),
    y1 = clamp(Math.min(gesture.start.y, point.y), 0, geometry.height),
    y2 = clamp(Math.max(gesture.start.y, point.y), 0, geometry.height);
  const box = {
    x: x1 / geometry.width,
    y: y1 / geometry.height,
    width: Math.max(1, x2 - x1) / geometry.width,
    height: Math.max(1, y2 - y1) / geometry.height,
  };
  if (!gesture.id) {
    gesture.id = uid();
    const annotation = {
      id: gesture.id,
      pageId: page.id,
      pageRotation: page.rotation,
      pageCrop: page.crop ? { ...page.crop } : undefined,
      type: 'highlight',
      color: ui.styles.highlight.color,
      opacity: ui.styles.highlight.opacity,
      ...box,
    };
    change(() => state.annotations.push(annotation), { key: gesture.key });
    ui.item = gesture.id;
    return;
  }
  const annotation = annotationById(gesture.id);
  if (annotation) change(() => Object.assign(annotation, box), { key: gesture.key });
}
/** Add an item at a default spot (keyboard and touch alternative to drawing). */
function addHighlight(point) {
  const geometry = ui.stage.geometry,
    page = currentPage();
  const width = Math.min(0.4, 1 - point.x / geometry.width),
    height = Math.min(18 / geometry.height, 1 - point.y / geometry.height);
  const annotation = {
    id: uid(),
    pageId: page.id,
    pageRotation: page.rotation,
    pageCrop: page.crop ? { ...page.crop } : undefined,
    type: 'highlight',
    color: ui.styles.highlight.color,
    opacity: ui.styles.highlight.opacity,
    x: clamp(point.x / geometry.width, 0, 0.99),
    y: clamp(point.y / geometry.height, 0, 0.99),
    width: Math.max(0.01, width),
    height: Math.max(0.005, height),
  };
  change(() => state.annotations.push(annotation));
  selectItem(annotation.id);
}
function placeImage(image, point = null) {
  const page = currentPage(),
    geometry = ui.stage.geometry || geometryOf(state, page);
  // A quarter of the page wide (less for tall images), centred unless placed at a point.
  let width = geometry.width * 0.3,
    height = width / image.ratio;
  if (height > geometry.height * 0.4) {
    height = geometry.height * 0.4;
    width = height * image.ratio;
  }
  const x = point ? clamp(point.x - width / 2, 0, geometry.width - width) : (geometry.width - width) / 2,
    y = point ? clamp(point.y - height / 2, 0, geometry.height - height) : (geometry.height - height) / 2;
  const annotation = {
    id: uid(),
    pageId: page.id,
    pageRotation: page.rotation,
    pageCrop: page.crop ? { ...page.crop } : undefined,
    type: 'image',
    x: x / geometry.width,
    y: y / geometry.height,
    width: width / geometry.width,
    height: height / geometry.height,
    opacity: 1,
    imageBytes: image.bytes,
    imageType: image.type,
  };
  change(() => state.annotations.push(annotation));
  selectItem(annotation.id);
}
function nudge(id, dx, dy) {
  const annotation = annotationById(id),
    item = overlayItem(id);
  if (!annotation || !item?.frame) return;
  const inverse = invert(item.matrix),
    origin = applyMatrix(inverse, 0, 0),
    delta = applyMatrix(inverse, dx, dy);
  const { placement, frame } = item;
  // Start from the item's stored position: the drawn frame refreshes once per
  // animation frame, and several key presses (or key repeat) can arrive before it.
  const x = number(annotation.x, 0.1, 0, 1) * placement.width,
    y = number(annotation.y, 0.1, 0, 1) * placement.height;
  const moved = {
    ...frame,
    x: clamp(x + delta.x - origin.x, 0, Math.max(0, placement.width - frame.width)),
    y: clamp(y + delta.y - origin.y, 0, Math.max(0, placement.height - frame.height)),
  };
  change(() => setFrame(annotation, item, moved), { key: 'nudge:' + id });
}
function deleteItem(id) {
  const annotation = annotationById(id);
  if (!annotation) return;
  const label = itemLabel(annotation).split(':')[0];
  if (ui.editing === id) {
    ui.editing = null;
    $('#inline-editor').hidden = true;
  }
  if (ui.pendingRecord) {
    // A new, still empty text box leaves no trace in the history.
    ui.pendingRecord = null;
    state.annotations = state.annotations.filter((item) => item.id !== id);
    documentChanged(false);
  } else
    change(() => {
      state.annotations = state.annotations.filter((item) => item.id !== id);
    });
  ui.item = null;
  renderTool();
  $('#canvas-scroll').focus({ preventScroll: true });
  announceMessage(label + ' deleted.');
}
function selectItem(id, { focus = true } = {}) {
  const annotation = annotationById(id);
  if (!annotation) return;
  if (ui.editing && ui.editing !== id) stopEditing();
  const changedTool = ui.tool !== annotation.type;
  ui.item = id;
  if (changedTool) {
    ui.tool = annotation.type;
    recordView('editor');
  }
  renderTool();
  renderEditLayer();
  updateStageHint();
  if (changedTool)
    $('#page-surface').classList.toggle('placing', ['text', 'highlight', 'signature'].includes(ui.tool));
  if (focus) focusItem(id);
}
function deselect() {
  stopEditing();
  if (!ui.item) return;
  ui.item = null;
  renderTool();
  renderEditLayer();
  updateStageHint();
}
function endGesture() {
  const gesture = ui.gesture;
  ui.gesture = null;
  const surface = $('#page-surface');
  if (gesture && surface.hasPointerCapture(gesture.pointerId))
    surface.releasePointerCapture(gesture.pointerId);
  surface.classList.remove('dragging');
}

const surface = $('#page-surface');
surface.addEventListener('pointerdown', (event) => {
  if (ui.busy || event.button !== 0 || !ui.stage.geometry) return;
  if (ui.tool === 'crop') {
    startCropDrag(event);
    return;
  }
  if (!ANNOTATION_TOOLS.includes(ui.tool) || event.target.closest('#inline-editor')) return;
  const box = event.target.closest('[data-item-id]'),
    handle = event.target.closest('[data-handle]'),
    point = surfacePoint(event);
  const wasEditing = Boolean(ui.editing),
    wasSelected = box && box.dataset.itemId === ui.item;
  if (ui.editing && box?.dataset.itemId !== ui.editing) stopEditing();
  if (box) {
    selectItem(box.dataset.itemId, { focus: true });
    ui.gesture = {
      type: handle ? 'resize' : 'move',
      handle: handle?.dataset.handle,
      id: box.dataset.itemId,
      item: overlayItem(box.dataset.itemId),
      wasSelected,
    };
  } else {
    ui.gesture = {
      type: ui.tool === 'highlight' ? 'draw' : 'tap',
      wasEditing,
      hadSelection: Boolean(ui.item),
    };
  }
  Object.assign(ui.gesture, {
    pointerId: event.pointerId,
    start: point,
    key: 'gesture:' + uid(),
    moved: false,
  });
  surface.setPointerCapture(event.pointerId);
  event.preventDefault();
});
surface.addEventListener('pointermove', (event) => {
  const gesture = ui.gesture;
  if (!gesture || event.pointerId !== gesture.pointerId || gesture.type === 'crop') return;
  const point = surfacePoint(event);
  if (!gesture.moved) {
    const distance = Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) * ui.stage.scale;
    if (distance < 4) return;
    gesture.moved = true;
    surface.classList.add('dragging');
  }
  if (gesture.type === 'move' && gesture.item?.frame) moveItem(gesture, point);
  if (gesture.type === 'resize' && gesture.item?.frame) resizeItem(gesture, point);
  if (gesture.type === 'draw') drawHighlight(gesture, point);
});
surface.addEventListener('pointerup', (event) => {
  const gesture = ui.gesture;
  if (!gesture || event.pointerId !== gesture.pointerId || gesture.type === 'crop') return;
  endGesture();
  if (gesture.moved) {
    if (gesture.type === 'draw' && gesture.id) selectItem(gesture.id);
    else if (gesture.id) focusItem(gesture.id);
    renderTool();
    return;
  }
  if (gesture.type === 'move' || gesture.type === 'resize') {
    // A second click on selected text starts typing in it.
    if (gesture.wasSelected && annotationById(gesture.id)?.type === 'text') startEditing(gesture.id);
    return;
  }
  // A click on the page: the first one after editing or selecting just deselects.
  if (gesture.wasEditing || gesture.hadSelection) {
    deselect();
    $('#canvas-scroll').focus({ preventScroll: true });
    return;
  }
  if (ui.tool === 'text') createText(gesture.start);
  if (ui.tool === 'highlight') addHighlight(gesture.start);
  if (ui.tool === 'signature') placeSignature(gesture.start);
});
surface.addEventListener('pointercancel', (event) => {
  if (ui.gesture?.pointerId === event.pointerId && ui.gesture.type !== 'crop') endGesture();
});
surface.addEventListener('dblclick', (event) => {
  const box = event.target.closest('[data-item-id]');
  if (box && annotationById(box.dataset.itemId)?.type === 'text') startEditing(box.dataset.itemId);
});
$('#edit-layer').addEventListener('focusin', (event) => {
  const box = event.target.closest('[data-item-id]');
  if (box && box.dataset.itemId !== ui.item) selectItem(box.dataset.itemId, { focus: false });
});
$('#edit-layer').addEventListener('keydown', (event) => {
  const box = event.target.closest('[data-item-id]');
  if (!box || ui.busy) return;
  const id = box.dataset.itemId,
    step = event.shiftKey ? 10 : 1;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (moves[event.key]) {
    event.preventDefault();
    nudge(id, ...moves[event.key]);
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    deleteItem(id);
  } else if ((event.key === 'Enter' || event.key === 'F2') && annotationById(id)?.type === 'text') {
    event.preventDefault();
    startEditing(id);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    deselect();
    $('#canvas-scroll').focus({ preventScroll: true });
  }
});
const inlineEditor = $('#inline-editor');
inlineEditor.addEventListener('input', () => {
  const id = ui.editing,
    annotation = annotationById(id);
  if (!annotation) return;
  const before = ui.pendingRecord;
  ui.pendingRecord = null;
  change(
    () => {
      annotation.text = inlineEditor.value;
    },
    { key: 'text:' + id, before },
  );
  warmFont(inlineEditor.value);
  const field = $('#tool-form [name="text"]');
  if (field) field.value = inlineEditor.value;
  renderOverlay();
});
inlineEditor.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
    event.preventDefault();
    const id = ui.editing;
    stopEditing();
    if (annotationById(id)) focusItem(id);
    else $('#canvas-scroll').focus({ preventScroll: true });
  }
});
inlineEditor.addEventListener('blur', () => {
  // Let focus settle first: a click in the panel keeps working on the same text.
  setTimeout(() => {
    if (ui.editing && document.activeElement !== inlineEditor) stopEditing();
  }, 0);
});

// ---- The tool panel ---------------------------------------------------------------

function makeField(label, input, wide = false) {
  return '<label class="field' + (wide ? ' wide' : '') + '"><span>' + label + '</span>' + input + '</label>';
}
function textField(label, name, placeholder = '', wide = false) {
  return makeField(
    label,
    '<input name="' +
      name +
      '" type="text" maxlength="300" placeholder="' +
      placeholder +
      '" autocomplete="off">',
    wide,
  );
}
function numberField(label, name, min, max, step = 1) {
  return makeField(
    label,
    '<input name="' +
      name +
      '" type="number" inputmode="decimal" min="' +
      min +
      '" max="' +
      max +
      '" step="' +
      step +
      '" required>',
  );
}
function colorField(name = 'color') {
  return makeField('Color', '<input name="' + name + '" type="color">');
}
function rangeField(label, name, min, max, unit = '%') {
  return makeField(
    label + ' <output data-for="' + name + '"></output>',
    '<input name="' +
      name +
      '" type="range" min="' +
      min +
      '" max="' +
      max +
      '" step="1" data-unit="' +
      unit +
      '">',
  );
}
function selectField(label, name, options, wide = false) {
  return makeField(
    label,
    '<select name="' +
      name +
      '">' +
      options.map(([value, text]) => '<option value="' + value + '">' + text + '</option>').join('') +
      '</select>',
    wide,
  );
}
function alignField() {
  return (
    '<fieldset class="segmented wide"><legend>Alignment</legend><div>' +
    [
      ['left', 'Left'],
      ['center', 'Center'],
      ['right', 'Right'],
    ]
      .map(
        ([value, text]) =>
          '<label><input type="radio" name="align" value="' + value + '"><span>' + text + '</span></label>',
      )
      .join('') +
    '</div></fieldset>'
  );
}
function switchField(key, label) {
  const on = Boolean(state[key]) && state[key].enabled !== false;
  return (
    '<button type="button" class="switch wide" role="switch" aria-checked="' +
    on +
    '" data-action="toggle-setting">' +
    '<span class="switch-track" aria-hidden="true"><span></span></span>' +
    label +
    '</button>'
  );
}
function scopeFields() {
  return (
    selectField(
      'Show on',
      'scope',
      [
        ['all', 'Every page'],
        ['pages', 'Only some pages'],
      ],
      true,
    ) +
    '<div class="scope-pages wide" id="scope-pages">' +
    makeField(
      'Page numbers',
      '<input name="scopePages" type="text" inputmode="numeric" autocomplete="off" placeholder="e.g. 1-3, 5" aria-describedby="scope-hint">',
      true,
    ) +
    '<p id="scope-hint" class="field-hint">Numbers follow the current page order.</p>' +
    '<button type="button" class="button secondary" data-action="scope-selected">Use the selected pages</button></div>'
  );
}
function batchLink() {
  return (
    '<div class="reuse-settings wide"><button type="button" class="text-button" data-action="batch-from-editor">' +
    icon('batch') +
    (ui.tool === 'crop' && ui.lastCropPreset && !cropDraftActive()
      ? 'Reuse last applied crop in batch'
      : 'Use these settings in batch') +
    '</button><p>Apply this tool to every page in separate PDFs, and save it as a preset.</p></div>'
  );
}
function annotationList() {
  if (!ANNOTATION_TOOLS.includes(ui.tool)) return '';
  const annotations = state.annotations.filter((a) => a.pageId === ui.activeId);
  if (!annotations.length) return '';
  return (
    '<div class="annotation-list"><strong id="annotation-list-title">ON THIS PAGE</strong><ul aria-labelledby="annotation-list-title">' +
    annotations
      .map(
        (a) =>
          '<li class="annotation-item' +
          (a.id === ui.item ? ' current' : '') +
          '"><button type="button" class="annotation-select" data-select-item="' +
          a.id +
          '"' +
          (a.id === ui.item ? ' aria-current="true"' : '') +
          '>' +
          icon({ text: 'text', image: 'image', signature: 'sign' }[a.type] || 'highlight') +
          '<span>' +
          safe(itemLabel(a)) +
          '</span></button><button type="button" class="icon-button" data-remove-annotation="' +
          a.id +
          '" aria-label="Delete ' +
          safe(itemLabel(a)) +
          '">' +
          icon('trash') +
          '</button></li>',
      )
      .join('') +
    '</ul></div>'
  );
}
function panelTitle() {
  const item = selectedItem();
  if (item?.type === 'text') return 'Edit text';
  if (item?.type === 'image') return 'Edit image';
  if (item?.type === 'signature') return 'Edit signature';
  if (item?.type === 'highlight') return 'Edit highlight';
  return names[ui.tool];
}
function panelFields() {
  const item = selectedItem(),
    index = activeIndex();
  switch (ui.tool) {
    case 'text':
      if (item?.type === 'text')
        return (
          makeField('Text', '<textarea name="text" maxlength="1000" rows="3"></textarea>', true) +
          '<div class="field-row">' +
          numberField('Size (pt)', 'size', 4, 200) +
          colorField() +
          '</div>' +
          alignField() +
          '<p class="field-hint wide">Drag the text to move it, or its right edge to set where lines wrap. With the text selected, arrow keys nudge it.</p>' +
          '<button type="button" class="button danger" data-action="delete-item">' +
          icon('trash') +
          'Delete text</button>'
        );
      return (
        '<div class="field-row">' +
        numberField('Size (pt)', 'size', 4, 200) +
        colorField() +
        '</div>' +
        '<button type="button" class="button secondary" data-action="add-text">' +
        icon('plus') +
        'Add text to page ' +
        (index + 1) +
        '</button>'
      );
    case 'image':
      if (item?.type === 'image')
        return (
          rangeField('Width', 'width', 2, 100) +
          rangeField('Opacity', 'opacity', 10, 100) +
          '<p class="field-hint wide">Drag the image to move it, or a corner to resize it. Arrow keys nudge it.</p>' +
          '<button type="button" class="button danger" data-action="delete-item">' +
          icon('trash') +
          'Delete image</button>'
        );
      return (
        '<div class="file-chosen wide">' +
        (ui.image ? safe(ui.image.name) : 'PNG or JPG · up to 15 MB') +
        '</div>' +
        '<button type="button" class="button primary" data-action="choose-image">' +
        icon('image') +
        (ui.image ? 'Choose another image' : 'Choose an image') +
        '</button>' +
        (ui.image
          ? '<button type="button" class="button secondary" data-action="place-image">' +
            icon('plus') +
            'Add it to page ' +
            (index + 1) +
            '</button>'
          : '')
      );
    case 'highlight':
      return (
        '<div class="field-row">' +
        colorField() +
        rangeField('Opacity', 'opacity', 5, 80) +
        '</div>' +
        (item?.type === 'highlight'
          ? '<p class="field-hint wide">Drag the highlight to move it, or a handle to resize it. Arrow keys nudge it.</p>' +
            '<button type="button" class="button danger" data-action="delete-item">' +
            icon('trash') +
            'Delete highlight</button>'
          : '<button type="button" class="button secondary" data-action="add-highlight">' +
            icon('plus') +
            'Add a highlight to page ' +
            (index + 1) +
            '</button>')
      );
    case 'watermark':
      return (
        switchField('watermark', 'Show the watermark') +
        textField('Watermark text', 'text', 'e.g. DRAFT', true) +
        '<div class="field-row">' +
        numberField('Text size (pt)', 'size', 8, 150) +
        colorField() +
        '</div>' +
        rangeField('Opacity', 'opacity', 3, 100) +
        rangeField('Angle', 'angle', -90, 90, '°') +
        selectField('Position', 'position', [
          ['center', 'Center of page'],
          ['top', 'Top of page'],
          ['bottom', 'Bottom of page'],
        ]) +
        scopeFields() +
        batchLink()
      );
    case 'footer':
      return (
        switchField('headerFooter', 'Show headers & footers') +
        '<div class="scope-note wide">Use <strong>{page}</strong> and <strong>{total}</strong> for automatic page numbering.</div><div class="field-section wide">HEADER</div>' +
        textField('Left', 'headerLeft', 'e.g. Project name') +
        textField('Center', 'headerCenter') +
        textField('Right', 'headerRight') +
        '<div class="field-section wide">FOOTER</div>' +
        textField('Left', 'footerLeft', 'e.g. Your name') +
        textField('Center', 'footerCenter', 'e.g. © Your organization') +
        textField('Right', 'footerRight', 'e.g. Page {page}') +
        '<div class="field-row">' +
        numberField('Text size (pt)', 'size', 6, 24) +
        colorField() +
        '</div>' +
        numberField('Edge margin (pt)', 'margin', 12, 100) +
        scopeFields() +
        batchLink()
      );
    case 'numbers':
      return (
        switchField('pageNumbers', 'Show page numbers') +
        textField('Number format', 'format', 'Page {page} of {total}', true) +
        '<div class="scope-note wide"><strong>{page}</strong> is the page number. <strong>{total}</strong> is the document page count.</div>' +
        selectField(
          'Position',
          'position',
          [
            ['bottom-right', 'Bottom right'],
            ['bottom-center', 'Bottom center'],
            ['bottom-left', 'Bottom left'],
          ],
          true,
        ) +
        '<div class="field-row">' +
        numberField('Start numbering at', 'start', 1, 100000) +
        numberField('Text size (pt)', 'size', 6, 24) +
        '</div>' +
        '<div class="field-row">' +
        colorField() +
        numberField('Edge margin (pt)', 'margin', 12, 100) +
        '</div>' +
        scopeFields() +
        batchLink()
      );
    case 'pages':
      return (
        '<div class="scope-note wide"><strong>' +
        ui.selected.size +
        ' of ' +
        state.pages.length +
        ' pages selected.</strong> Select pages with the checkboxes beneath each thumbnail.</div><div class="selection-buttons wide"><button type="button" data-action="select-all">Select all</button><button type="button" data-action="select-none">Clear selection</button></div>' +
        textField('Select page numbers', 'range', 'e.g. 1-3, 5', true) +
        '<button type="button" class="button secondary" data-action="select-range">Select range</button><div class="field-section wide">SELECTED PAGES</div><div class="mini-actions wide"><button type="button" class="button secondary" data-action="rotate">' +
        icon('rotate') +
        'Rotate 90°</button><button type="button" class="button danger" data-action="delete-pages">' +
        icon('trash') +
        'Remove</button></div><button type="button" class="button secondary" data-action="extract">' +
        icon('download') +
        'Download selected pages</button><div class="field-section wide">CURRENT PAGE · ' +
        (index + 1) +
        '</div><div class="mini-actions wide"><button type="button" class="button secondary" data-action="move-earlier"' +
        (index === 0 ? ' disabled' : '') +
        '>' +
        icon('up') +
        'Move earlier</button><button type="button" class="button secondary" data-action="move-later"' +
        (index === state.pages.length - 1 ? ' disabled' : '') +
        '>' +
        icon('down') +
        'Move later</button></div>'
      );
    case 'delete':
      return (
        '<div class="scope-note wide"><strong>' +
        ui.selected.size +
        ' of ' +
        state.pages.length +
        ' pages selected for deletion.</strong><br>' +
        (state.pages.length - ui.selected.size) +
        ' pages will remain.</div><div class="selection-buttons wide"><button type="button" data-action="select-all">Select all</button><button type="button" data-action="select-none">Clear selection</button></div>' +
        textField('Page numbers to delete', 'range', 'e.g. 2, 4-6', true) +
        '<button type="button" class="button secondary" data-action="select-range">Select range</button><p class="field-hint wide">Numbers follow the current page order. Checked thumbnails are the pages to delete.</p><button type="button" class="button danger" data-action="delete-pages"' +
        (!ui.selected.size || ui.selected.size === state.pages.length ? ' disabled' : '') +
        '>' +
        icon('trash') +
        'Delete ' +
        ui.selected.size +
        ' selected page' +
        (ui.selected.size === 1 ? '' : 's') +
        '</button><p class="field-hint wide">' +
        (ui.selected.size === state.pages.length
          ? 'Keep at least one page. Deselect a page to continue.'
          : 'Deleted pages leave at once. Undo brings them back.') +
        '</p>'
      );
    case 'crop':
      return (
        '<div class="scope-note wide">Margins are percentages of each page’s <strong>current visible area</strong>. The outlined area is kept.</div><div class="field-row">' +
        numberField('Top (%)', 'top', 0, 99, 0.1) +
        numberField('Bottom (%)', 'bottom', 0, 99, 0.1) +
        '</div><div class="field-row">' +
        numberField('Left (%)', 'left', 0, 99, 0.1) +
        numberField('Right (%)', 'right', 0, 99, 0.1) +
        '</div>' +
        selectField(
          'Apply to',
          'scope',
          [
            ['current', 'Current page'],
            ['all', 'Every page'],
            ['selected', 'Selected pages'],
          ],
          true,
        ) +
        '<p id="crop-summary" class="field-hint wide" aria-live="polite"></p>' +
        '<button type="submit" class="button primary">' +
        icon('crop') +
        'Crop to the outlined area</button>' +
        '<button type="button" class="button secondary" data-action="clear-crop-margins">Clear margins</button><button type="button" class="button subtle" data-action="restore-crop">Restore original crop for scope</button><p class="field-hint wide">Cropping hides content outside the boundary; it does not securely remove it. Text and graphics keep their original quality.</p>' +
        batchLink()
      );
    case 'merge':
      return (
        '<div class="file-list wide">' +
        state.sources
          .filter((source) => state.pages.some((page) => page.sourceId === source.id))
          .map(
            (source) =>
              '<div class="file-list-item"><strong>' +
              safe(source.name) +
              '</strong>' +
              source.pageCount +
              ' pages · ' +
              formatSize(source.bytes.length) +
              '</div>',
          )
          .join('') +
        '</div><button type="button" class="button primary" data-action="add-files">' +
        icon('plus') +
        'Add another PDF</button><div class="scope-note wide">New pages are added at the end. Use <strong>Organize pages</strong> to change their order, then download the combined PDF.</div><button type="button" class="button secondary" data-action="organize">' +
        icon('pages') +
        'Organize pages</button>'
      );
    case 'split':
      return splitFields();
    case 'protect':
      return protectFields();
    case 'unlock':
      return unlockFields();
    case 'signature':
      return signatureFields(item, index);
    case 'jpgtopdf':
      return jpgToPdfFields();
    case 'pdftojpg':
      return pdfToJpgFields();
  }
  return '';
}
function jpgToPdfFields() {
  const pictures = state.pages.filter(
    (page) => state.sources.find((s) => s.id === page.sourceId)?.picture,
  ).length;
  return (
    selectField(
      'Page size',
      'pictureSize',
      [
        ['a4', 'A4'],
        ['letter', 'US Letter'],
        ['fit', 'Same as the picture'],
      ],
      true,
    ) +
    selectField(
      'Margin',
      'pictureMargin',
      [
        ['0', 'None'],
        ['24', 'Small'],
        ['48', 'Large'],
      ],
      true,
    ) +
    '<div class="scope-note wide">' +
    (pictures
      ? '<strong>' +
        pictures +
        ' of ' +
        state.pages.length +
        ' pages</strong> are pictures. A4 and Letter pages turn to suit each picture.'
      : 'No pages here are pictures yet. Add JPG or PNG pictures to make pages from them.') +
    '</div><button type="button" class="button secondary" data-action="add-files">' +
    icon('plus') +
    'Add pictures or PDFs</button>' +
    '<p class="field-hint wide">Drag pages in the page strip to put them in order. Download PDF saves them as one PDF.</p>'
  );
}
function pdfToJpgFields() {
  return (
    '<fieldset class="segmented wide"><legend>Picture format</legend><div>' +
    [
      ['jpg', 'JPG'],
      ['png', 'PNG'],
    ]
      .map(
        ([value, text]) =>
          '<label><input type="radio" name="pictureFormat" value="' +
          value +
          '"><span>' +
          text +
          '</span></label>',
      )
      .join('') +
    '</div></fieldset>' +
    selectField(
      'Quality',
      'pictureDpi',
      [
        ['72', 'Screen (72 dpi)'],
        ['150', 'Standard (150 dpi)'],
        ['300', 'High, for print (300 dpi)'],
      ],
      true,
    ) +
    selectField(
      'Pages',
      'pictureScope',
      [
        ['all', 'Every page'],
        ['selected', 'Selected pages (' + ui.selected.size + ')'],
        ['current', 'Current page (' + (activeIndex() + 1) + ')'],
      ],
      true,
    ) +
    '<button type="submit" class="button primary">' +
    icon('download') +
    'Save as pictures</button>' +
    '<p class="field-hint wide">Each page is saved as it looks with your edits. Several pages download together as a ZIP.' +
    (protectedDownload() ? ' Pictures can’t have a password.' : '') +
    '</p>'
  );
}
/** Save pages as JPG or PNG pictures: one picture, or a ZIP of them. */
async function savePictures() {
  if (ui.busy) return;
  const settings = ui.pictureExport;
  const numbers =
    settings.scope === 'current'
      ? [activeIndex() + 1]
      : state.pages
          .map((page, index) => (settings.scope === 'all' || ui.selected.has(page.id) ? index + 1 : 0))
          .filter(Boolean);
  if (!numbers.length) {
    toast('Select pages in the page strip first.', true);
    return;
  }
  try {
    // Pictures are made from the PDF as it downloads, without a password.
    const { bytes } = await exportDocument(protectedDownload() ? { ...snapshot(), protection: null } : null);
    ui.cancelOperation = false;
    busy(true, 'Saving pages as pictures…');
    cancellable('Cancel', null);
    const base = safeBaseName(outputName()).replace(/-(edited|converted|protected|unlocked)$/, '');
    const pictures = await pagesToImages(bytes, numbers, {
      format: settings.format,
      dpi: settings.dpi,
      baseName: base,
      onProgress: (value) => {
        $('#busy-message').textContent = 'Saving pages as pictures… ' + Math.round(value * 100) + '%';
      },
      shouldCancel: () => ui.cancelOperation,
    });
    if (pictures.length === 1)
      downloadBytes(
        new Blob([pictures[0].bytes], { type: settings.format === 'png' ? 'image/png' : 'image/jpeg' }),
        pictures[0].name,
      );
    else downloadBytes(createZip(pictures), base + '-pictures.zip');
    toast(
      pictures.length === 1
        ? 'Your picture has been downloaded.'
        : pictures.length + ' pictures have been downloaded in a ZIP.',
    );
  } catch (error) {
    if (error.name === 'AbortError') toast(error.message);
    else showExportError(error);
  } finally {
    busy(false);
  }
}
const INK = [
  ['#141414', 'Black'],
  ['#1d3f9e', 'Blue'],
];
function signatureFields(item, index) {
  if (item?.type === 'signature')
    return (
      rangeField('Width', 'width', 2, 100) +
      '<p class="field-hint wide">Drag the signature to move it, or a corner to resize it. Arrow keys nudge it.</p>' +
      '<button type="button" class="button secondary" data-action="signature-copy">' +
      icon('pages') +
      'Put it here on every page</button>' +
      '<button type="button" class="button danger" data-action="delete-item">' +
      icon('trash') +
      'Delete signature</button>'
    );
  if (ui.signature)
    return (
      '<div class="signature-preview wide"><img src="' +
      signatureUrl() +
      '" alt="Your signature"></div>' +
      '<button type="button" class="button primary" data-action="signature-place">' +
      icon('plus') +
      'Add it to page ' +
      (index + 1) +
      '</button><button type="button" class="button secondary" data-action="signature-place-all">' +
      icon('pages') +
      'Add it to every page</button>' +
      '<p class="field-hint wide">Or click the page where it belongs.</p>' +
      '<label class="check-field wide"><input type="checkbox" name="keepSignature"' +
      (ui.signatureKept ? ' checked' : '') +
      '> Keep it on this device for next time</label>' +
      '<button type="button" class="button subtle" data-action="signature-new">Make a new signature</button>'
    );
  const draft = ui.signatureDraft;
  const choice = (name, options, current, legend) =>
    '<fieldset class="segmented wide"><legend>' +
    legend +
    '</legend><div>' +
    options
      .map(
        ([value, text]) =>
          '<label><input type="radio" name="' +
          name +
          '" value="' +
          value +
          '"' +
          (value === current ? ' checked' : '') +
          '><span>' +
          text +
          '</span></label>',
      )
      .join('') +
    '</div></fieldset>';
  const modes = [
    ['draw', 'Draw'],
    ['type', 'Type'],
    ['upload', 'Upload'],
  ];
  let fields = choice('signatureMode', modes, draft.mode, 'Make your signature');
  if (draft.mode === 'draw')
    fields +=
      '<div class="signature-pad-wrap wide"><canvas id="signature-pad" class="signature-pad" role="img" aria-label="Signature drawing area" aria-describedby="signature-pad-hint"></canvas></div>' +
      '<p class="field-hint wide" id="signature-pad-hint">' +
      (touch() ? 'Sign with your finger or a pen.' : 'Sign with your mouse, trackpad or pen.') +
      '</p><button type="button" class="button subtle" data-action="signature-clear">Clear</button>';
  else if (draft.mode === 'type')
    fields +=
      makeField(
        'Your name',
        '<input name="signatureText" type="text" maxlength="60" autocomplete="name" spellcheck="false">',
        true,
      ) + '<div class="signature-typed wide" id="signature-typed" aria-hidden="true"></div>';
  else
    fields +=
      '<button type="button" class="button primary" data-action="signature-choose">' +
      icon('image') +
      'Choose a picture of it</button>' +
      '<label class="check-field wide"><input type="checkbox" name="removeBackground"' +
      (draft.removeBackground ? ' checked' : '') +
      '> Make the paper transparent</label>' +
      '<p class="field-hint wide">A PNG or JPG of your signature on light paper.</p>';
  if (draft.mode !== 'upload')
    fields +=
      choice('signatureColor', INK, draft.color, 'Ink') +
      '<button type="button" class="button primary" data-action="signature-use">' +
      icon('check') +
      'Use this signature</button>';
  return fields;
}
let signatureObjectUrl = null;
/** An address for the current signature's picture in the panel. */
function signatureUrl() {
  if (signatureObjectUrl?.bytes !== ui.signature.bytes) {
    if (signatureObjectUrl) URL.revokeObjectURL(signatureObjectUrl.url);
    signatureObjectUrl = {
      bytes: ui.signature.bytes,
      url: URL.createObjectURL(new Blob([ui.signature.bytes], { type: 'image/png' })),
    };
  }
  return signatureObjectUrl.url;
}
let pad = null;
/** After the Sign panel is drawn: the drawing area, the typed preview and the Use button. */
function attachSignatureTools() {
  const canvas = $('#signature-pad');
  pad = canvas
    ? signaturePad(canvas, ui.signatureDraft.strokes, {
        color: ui.signatureDraft.color,
        onChange: updateSignatureButton,
      })
    : null;
  if ($('#signature-typed')) {
    updateTypedSignature();
    loadSignatureFont().catch((error) => toast(friendly(error), true));
  }
  updateSignatureButton();
}
function updateTypedSignature() {
  const node = $('#signature-typed');
  if (!node) return;
  node.textContent = ui.signatureDraft.text.trim() || 'Your name';
  node.classList.toggle('empty', !ui.signatureDraft.text.trim());
  node.style.color = ui.signatureDraft.color;
}
function updateSignatureButton() {
  const button = $('[data-action="signature-use"]');
  if (!button) return;
  const draft = ui.signatureDraft;
  button.disabled = draft.mode === 'draw' ? !draft.strokes.length : !draft.text.trim();
}
function setSignature(signature) {
  ui.signature = signature;
  if (ui.signatureKept && !saveSignature(signature)) {
    ui.signatureKept = false;
    toast('This browser could not keep your signature. It stays until you close this tab.', true);
  } else toast(tapOrClick('Your signature is ready. Click the page where it belongs.'));
  renderTool();
}
async function useSignature() {
  try {
    const draft = ui.signatureDraft;
    setSignature(
      draft.mode === 'type' ? await typedSignature(draft.text, draft.color) : await pad.toSignature(),
    );
  } catch (error) {
    toast(friendly(error), true);
  }
}
function keepSignature(keep) {
  if (keep && ui.signature && !saveSignature(ui.signature)) {
    toast('This browser could not keep your signature. It stays until you close this tab.', true);
    keep = false;
  }
  if (!keep) forgetSignature();
  ui.signatureKept = keep;
  announceMessage(keep ? 'Your signature will be kept on this device.' : 'Your signature is no longer kept.');
}
/** A signature's size and place: at a click, or near the lower right of the page. */
function signatureFrame(geometry, point = null) {
  const ratio = ui.signature.width / ui.signature.height;
  let width = Math.min(geometry.width * 0.32, 160),
    height = width / ratio;
  if (height > geometry.height * 0.12) {
    height = geometry.height * 0.12;
    width = height * ratio;
  }
  const margin = Math.min(geometry.width, geometry.height) * 0.08;
  return {
    x: point ? clamp(point.x - width / 2, 0, geometry.width - width) : geometry.width - margin - width,
    y: point
      ? clamp(point.y - height / 2, 0, geometry.height - height)
      : geometry.height - margin * 1.5 - height,
    width,
    height,
  };
}
function signatureAnnotation(page, geometry, frame, bytes = ui.signature.bytes) {
  return {
    id: uid(),
    pageId: page.id,
    pageRotation: page.rotation,
    pageCrop: page.crop ? { ...page.crop } : undefined,
    type: 'signature',
    x: frame.x / geometry.width,
    y: frame.y / geometry.height,
    width: frame.width / geometry.width,
    height: frame.height / geometry.height,
    opacity: 1,
    // Shared by every copy, so the PDF stores the picture once.
    imageBytes: bytes,
    imageType: 'png',
  };
}
function placeSignature(point = null) {
  if (!ui.signature) {
    toast('Make your signature first: draw, type or upload it in the panel.');
    if (phone()) setSheet(true);
    return;
  }
  const page = currentPage(),
    geometry = ui.stage.geometry || geometryOf(state, page),
    annotation = signatureAnnotation(page, geometry, signatureFrame(geometry, point));
  change(() => state.annotations.push(annotation));
  selectItem(annotation.id);
  if (!point) revealItem(annotation.id);
}
/** Scroll the page so a newly placed item can be seen (placed with a button, it may be off screen). */
function revealItem(id) {
  requestAnimationFrame(() =>
    $('[data-item-id="' + CSS.escape(id) + '"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
  );
}
function placeSignatureEverywhere() {
  const added = state.pages.map((page) => {
    const geometry = geometryOf(state, page);
    return signatureAnnotation(page, geometry, signatureFrame(geometry));
  });
  change(() => state.annotations.push(...added));
  selectItem(added[activeIndex()].id);
  revealItem(added[activeIndex()].id);
  toast('Your signature is on all ' + added.length + ' pages. Drag any of them to adjust it.');
}
/** Copy a placed signature to the same place, at the same size, on every other page. */
function copySignature(item) {
  const own = currentPage(),
    from = geometryOf(state, own);
  const width = item.width * from.width,
    height = item.height * from.height;
  const added = state.pages
    .filter((page) => page.id !== own.id)
    .map((page) => {
      const geometry = geometryOf(state, page),
        w = Math.min(width, geometry.width),
        h = Math.min(height, geometry.height);
      const frame = {
        x: clamp(item.x * geometry.width, 0, geometry.width - w),
        y: clamp(item.y * geometry.height, 0, geometry.height - h),
        width: w,
        height: h,
      };
      return signatureAnnotation(page, geometry, frame, item.imageBytes);
    });
  if (!added.length) return;
  change(() => state.annotations.push(...added));
  toast('Signature added to ' + added.length + ' more page' + (added.length === 1 ? '' : 's') + '.');
}
/** Whether downloads will need a password to open. */
function protectedDownload() {
  return Boolean(state.protection && state.protection.enabled !== false && state.protection.password);
}
/** Protected PDFs in use: opened with a password, or limiting printing, copying or changes. */
function lockedSources() {
  return state.sources.filter(
    (source) => source.protection && state.pages.some((page) => page.sourceId === source.id),
  );
}
/** Whether Unlock PDF is giving a protected PDF back without its password. */
function unlockedDownload() {
  return ui.tool === 'unlock' && !protectedDownload() && lockedSources().length > 0;
}
function protectFields() {
  return (
    makeField(
      'Password',
      '<input name="password" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" aria-describedby="protect-status">',
      true,
    ) +
    '<label class="check-field wide"><input type="checkbox" data-reveal-password> Show password</label>' +
    '<p id="protect-status" class="field-hint wide" aria-live="polite"></p>' +
    '<button type="button" class="button primary" data-action="download-protected">' +
    icon('lock') +
    'Download protected PDF</button>' +
    '<p class="field-hint wide">Encrypted with AES-256. Keep the password somewhere safe: QFT PDF doesn’t store it and can’t recover it.</p>'
  );
}
/** Show whether the typed password protects downloads, or why it can't. */
function updateProtectionStatus() {
  const field = $('#tool-form [name="password"]'),
    status = $('#protect-status');
  if (!field || !status) return;
  const password = state.protection?.password || '';
  const problem = password ? passwordProblem(password) : null;
  field.setAttribute('aria-invalid', String(Boolean(problem)));
  status.classList.toggle('invalid', Boolean(problem));
  status.textContent =
    problem ||
    (password
      ? 'Your download will need this password to open.'
      : 'Type a password to protect your download.');
}
function unlockFields() {
  if (protectedDownload())
    return (
      '<div class="scope-note wide">Your download will need a password to open.</div>' +
      '<button type="button" class="button primary" data-action="remove-protection">' +
      icon('unlock') +
      'Remove the password</button>' +
      '<p class="field-hint wide">Your original file isn’t changed, and Undo brings the password back.</p>'
    );
  const used = lockedSources();
  if (!used.length)
    return (
      '<div class="scope-note wide">This PDF doesn’t have a password, so your download won’t need one either.</div>' +
      '<button type="button" class="button secondary" data-action="choose-protect">' +
      icon('lock') +
      'Add a password instead</button>'
    );
  return (
    '<div class="scope-note wide protection-note">' +
    icon('check') +
    '<span>Unlocked. Your download will open without a password' +
    (used.some((source) => source.protection === 'owner')
      ? ', and without limits on printing, copying or changes'
      : '') +
    '.</span></div>' +
    '<button type="button" class="button primary" data-action="download">' +
    icon('download') +
    'Download unlocked PDF</button>' +
    '<p class="field-hint wide">Your original file isn’t changed.</p>'
  );
}
/** Values the panel's fields show for the current tool and selection. */
function panelValues() {
  const item = selectedItem();
  switch (ui.tool) {
    case 'text':
      return item?.type === 'text'
        ? { text: item.text, size: item.fontSize, color: hexColor(item.color), align: item.align || 'left' }
        : { size: ui.styles.text.size, color: ui.styles.text.color };
    case 'image': {
      if (item?.type !== 'image') return {};
      const frame = overlayItem(item.id)?.frame,
        placement = overlayItem(item.id)?.placement;
      return {
        width: frame
          ? Math.round((frame.width / placement.width) * 100)
          : Math.round(number(item.width, 0.25) * 100),
        opacity: Math.round(number(item.opacity, 1, 0, 1) * 100),
      };
    }
    case 'highlight': {
      const source = item?.type === 'highlight' ? item : ui.styles.highlight;
      return {
        color: hexColor(source.color, '#f5d85c'),
        opacity: Math.round(number(source.opacity, 0.3, 0, 1) * 100),
      };
    }
    case 'watermark':
    case 'footer':
    case 'numbers': {
      const key = SETTINGS[ui.tool],
        setting = state[key] || settingDefaults[key]();
      const values = { ...setting, scope: setting.pages === 'all' || !setting.pages ? 'all' : 'pages' };
      if (key === 'watermark') values.opacity = Math.round(number(setting.opacity, 0.18, 0, 1) * 100);
      if (Array.isArray(setting.pages))
        values.scopePages = rangeText(setting.pages.map(pageIndexOf).filter((index) => index >= 0));
      return values;
    }
    case 'crop': {
      const draft = ui.cropDraft;
      return {
        ...Object.fromEntries(
          ['left', 'top', 'right', 'bottom'].map((edge) => [edge, Math.round(draft[edge] * 1000) / 10]),
        ),
        scope: draft.scope,
      };
    }
    case 'pages':
    case 'delete':
      return { range: ui.rangeDraft };
    case 'split':
      return ui.splitDraft;
    case 'protect':
      return { password: state.protection?.password || '' };
    case 'jpgtopdf':
      return { pictureSize: ui.pictureLayout.size, pictureMargin: String(ui.pictureLayout.margin) };
    case 'pdftojpg':
      return {
        pictureFormat: ui.pictureExport.format,
        pictureDpi: String(ui.pictureExport.dpi),
        pictureScope: ui.pictureExport.scope,
      };
    case 'signature': {
      if (item?.type !== 'signature') return { signatureText: ui.signatureDraft.text };
      const frame = overlayItem(item.id)?.frame,
        placement = overlayItem(item.id)?.placement;
      return {
        width: frame
          ? Math.round((frame.width / placement.width) * 100)
          : Math.round(number(item.width, 0.25) * 100),
      };
    }
  }
  return {};
}
/** Show current values in the panel without rebuilding it (the focused field keeps what is typed). */
function fillForm({ all = false } = {}) {
  const form = $('#tool-form');
  if (!form) return;
  const values = panelValues();
  for (const input of $$('[name]', form)) {
    if (!(input.name in values) || (!all && input === document.activeElement)) continue;
    const value = values[input.name] ?? '';
    if (input.type === 'radio') input.checked = input.value === String(value);
    else if (input.value !== String(value)) input.value = value;
    input.removeAttribute('aria-invalid');
  }
  updateOutputs();
  const scopePages = $('#scope-pages');
  if (scopePages) {
    scopePages.hidden = values.scope !== 'pages';
    const button = $('[data-action="scope-selected"]', scopePages);
    button.disabled = !ui.selected.size;
    button.textContent = ui.selected.size
      ? 'Use the ' + ui.selected.size + ' selected page' + (ui.selected.size === 1 ? '' : 's')
      : 'Select pages in the strip to use them';
    const error = ui.scopeErrors[SETTINGS[ui.tool]];
    const field = $('[name="scopePages"]', scopePages);
    field.setAttribute('aria-invalid', String(Boolean(error)));
    $('#scope-hint').textContent = error || 'Numbers follow the current page order.';
    $('#scope-hint').classList.toggle('invalid', Boolean(error));
  }
  if (ui.tool === 'protect') updateProtectionStatus();
  const toggle = $('[role="switch"]', form);
  if (toggle) {
    const key = SETTINGS[ui.tool];
    toggle.setAttribute('aria-checked', String(Boolean(state[key]) && state[key].enabled !== false));
  }
}
function renderTool() {
  // The panel is rebuilt below; remember which control had keyboard focus.
  const restoreKey = !ui.busy && $('#tool-panel').contains(document.activeElement) ? focusKey() : null;
  $('#tool-select').value = ui.tool;
  $$('.tool-tabs [data-tool]').forEach((button) =>
    button.setAttribute('aria-pressed', String(button.dataset.tool === ui.tool)),
  );
  $('#workspace').dataset.tool = ui.tool;
  $('#sheet-title').textContent = names[ui.tool];
  $('#tool-panel').innerHTML =
    '<h2 tabindex="-1">' +
    panelTitle() +
    '</h2><p class="panel-description">' +
    tapOrClick(descriptions[ui.tool]) +
    '</p><div id="panel-problems" class="panel-problems" role="status" hidden></div><form id="tool-form" novalidate>' +
    panelFields() +
    '</form>' +
    annotationList();
  const form = $('#tool-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (['delete', 'pages'].includes(ui.tool)) action('select-range');
    else if (ui.tool === 'split') generateSplit();
    else if (ui.tool === 'pdftojpg') savePictures();
    else if (ui.tool === 'crop') applyCrop();
  });
  form.addEventListener('input', onPanelInput);
  form.addEventListener('change', (event) => {
    // A number left empty or out of range goes back to the value in use.
    if (event.target.type === 'number' && !event.target.checkValidity()) fillForm({ all: true });
  });
  fillForm({ all: true });
  if (ui.stage.overlay) updateProblems(ui.stage.overlay.problems);
  updateCropOverlay();
  updateDeletionMarks();
  if (ui.tool === 'split') updateSplitSummary();
  if (ui.tool === 'signature') attachSignatureTools();
  updateSelectionCaption();
  updateStageHint();
  if (restoreKey) restoreFocus(restoreKey);
}
function updateOutputs() {
  $$('input[type=range]', $('#tool-form') || document.createElement('form')).forEach((input) => {
    const output = $('output[data-for="' + input.name + '"]', $('#tool-form'));
    if (output) output.textContent = input.value + (input.dataset.unit || '');
  });
}
function validNumber(field) {
  return field.type !== 'number' || (field.value !== '' && field.checkValidity());
}
function onPanelInput(event) {
  const field = event.target,
    name = field.name;
  if (field.matches('[data-reveal-password]')) {
    $('#tool-form [name="password"]').type = field.checked ? 'text' : 'password';
    return;
  }
  if (!name) return;
  updateOutputs();
  if (!validNumber(field)) {
    field.setAttribute('aria-invalid', 'true');
    return;
  }
  field.removeAttribute('aria-invalid');
  const value = field.value,
    item = selectedItem();
  if (ui.tool === 'text') {
    if (name === 'size' || name === 'color') ui.styles.text[name] = name === 'size' ? Number(value) : value;
    if (item?.type !== 'text') return;
    const keys = { text: 'text', size: 'fontSize', color: 'color', align: 'align' };
    change(
      () => {
        item[keys[name]] = name === 'size' ? Number(value) : value;
      },
      { key: name + ':' + item.id },
    );
    if (name === 'text') warmFont(value);
    if (ui.editing === item.id && name === 'text') inlineEditor.value = value;
    return;
  }
  if (ui.tool === 'highlight') {
    const parsed = name === 'opacity' ? Number(value) / 100 : value;
    ui.styles.highlight[name] = parsed;
    if (item?.type === 'highlight') change(() => (item[name] = parsed), { key: name + ':' + item.id });
    return;
  }
  if (ui.tool === 'image' && item?.type === 'image') {
    if (name === 'opacity') change(() => (item.opacity = Number(value) / 100), { key: 'opacity:' + item.id });
    if (name === 'width') resizeImageTo(item, Number(value) / 100);
    return;
  }
  if (SETTINGS[ui.tool]) {
    updateSetting(SETTINGS[ui.tool], name, value);
    return;
  }
  if (ui.tool === 'crop') {
    if (name === 'scope') ui.cropDraft.scope = value;
    else ui.cropDraft[name] = clamp(Number(value) / 100, 0, 0.99);
    updateCropOverlay();
    return;
  }
  if (ui.tool === 'jpgtopdf') {
    if (name === 'pictureSize') ui.pictureLayout.size = value;
    if (name === 'pictureMargin') ui.pictureLayout.margin = Number(value);
    relayoutPictures();
    return;
  }
  if (ui.tool === 'pdftojpg') {
    if (name === 'pictureFormat') ui.pictureExport.format = value;
    if (name === 'pictureDpi') ui.pictureExport.dpi = Number(value);
    if (name === 'pictureScope') ui.pictureExport.scope = value;
    return;
  }
  if (ui.tool === 'signature') {
    const draft = ui.signatureDraft;
    if (name === 'signatureMode') {
      draft.mode = value;
      renderTool();
      $('#tool-form [name="signatureMode"]:checked')?.focus();
    } else if (name === 'signatureText') {
      draft.text = value;
      updateTypedSignature();
      updateSignatureButton();
    } else if (name === 'signatureColor') {
      draft.color = value;
      pad?.setColor(value);
      updateTypedSignature();
    } else if (name === 'removeBackground') draft.removeBackground = field.checked;
    else if (name === 'keepSignature') keepSignature(field.checked);
    else if (name === 'width' && item?.type === 'signature') resizeImageTo(item, Number(value) / 100);
    return;
  }
  if (ui.tool === 'protect' && name === 'password') {
    change(() => (state.protection = value ? { enabled: true, password: value } : null), {
      key: 'protection',
    });
    updateProtectionStatus();
    return;
  }
  if (ui.tool === 'split') {
    ui.splitDraft[name] = value;
    ui.splitResults = null;
    $('#split-results')?.replaceChildren();
    updateSplitSummary();
    return;
  }
  if (name === 'range') ui.rangeDraft = value;
}
function resizeImageTo(annotation, fraction) {
  const item = overlayItem(annotation.id);
  if (!item?.frame) return;
  const { placement, frame } = item,
    ratio = frame.width / frame.height;
  let width = Math.min(
    fraction * placement.width,
    placement.width - frame.x,
    (placement.height - frame.y) * ratio,
  );
  width = Math.max(4, width);
  change(() => setFrame(annotation, item, { ...frame, width, height: width / ratio }), {
    key: 'width:' + annotation.id,
  });
}
/** Edit a watermark, header/footer or page-number setting. Any edit also shows it. */
function updateSetting(key, name, value) {
  if (name === 'scopePages') {
    try {
      const ids = parsePageRange(value, state.pages.length).map((index) => state.pages[index].id);
      if (!value.trim()) throw new Error('Enter the page numbers to show this on, for example 1-3, 5.');
      delete ui.scopeErrors[key];
      change(
        () => {
          state[key] ||= settingDefaults[key]();
          state[key].enabled = true;
          state[key].pages = ids;
        },
        { key: key + ':scope' },
      );
    } catch (error) {
      ui.scopeErrors[key] = error.message;
    }
    fillForm();
    return;
  }
  const numeric = ['size', 'opacity', 'angle', 'start', 'margin'];
  change(
    () => {
      state[key] ||= settingDefaults[key]();
      const setting = state[key];
      setting.enabled = true;
      if (name === 'scope') {
        delete ui.scopeErrors[key];
        setting.pages = value === 'all' ? 'all' : [ui.activeId];
      } else if (name === 'opacity') setting.opacity = Number(value) / 100;
      else setting[name] = numeric.includes(name) ? Number(value) : value;
    },
    { key: key + ':' + name },
  );
  if (name === 'scope') fillForm({ all: true });
  else fillForm();
  if (typeof value === 'string' && name !== 'color') warmFont(value);
}
function toggleSetting() {
  const key = SETTINGS[ui.tool];
  if (!key) return;
  change(() => {
    if (!state[key]) state[key] = settingDefaults[key]();
    else state[key].enabled = state[key].enabled === false;
  });
  fillForm();
  const on = state[key].enabled !== false;
  announceMessage(names[ui.tool] + (on ? ' shown.' : ' hidden.'));
}
function cropDraftActive() {
  const draft = ui.cropDraft;
  return ['left', 'top', 'right', 'bottom'].some((edge) => draft[edge] > 0);
}
function cropValues() {
  const margins = Object.fromEntries(
    ['left', 'top', 'right', 'bottom'].map((edge) => [edge, ui.cropDraft[edge]]),
  );
  if (
    Object.values(margins).some((value) => !Number.isFinite(value) || value < 0 || value >= 1) ||
    margins.left + margins.right >= 0.99 ||
    margins.top + margins.bottom >= 0.99
  )
    throw new Error('Keep more than 1% of the width and height. Reduce the crop margins.');
  return margins;
}
function updateCropOverlay() {
  const overlay = $('#crop-overlay'),
    enabled = ui.tool === 'crop' && state.pages.length > 0;
  overlay.hidden = !enabled;
  $('#page-surface').classList.toggle('cropping', enabled);
  if (!enabled) return;
  const summary = $('#crop-summary');
  try {
    const crop = cropValues();
    overlay.style.inset = [crop.top, crop.right, crop.bottom, crop.left]
      .map((value) => value * 100 + '%')
      .join(' ');
    if (summary)
      summary.textContent =
        'Keep ' +
        ((1 - crop.left - crop.right) * 100).toFixed(1) +
        '% of width × ' +
        ((1 - crop.top - crop.bottom) * 100).toFixed(1) +
        '% of height.';
  } catch (error) {
    overlay.hidden = true;
    if (summary) summary.textContent = error.message;
  }
}
function updateDeletionMarks() {
  $$('.page-item').forEach((item) => {
    const deleting = ui.tool === 'delete' && ui.selected.has(item.dataset.pageId);
    item.classList.toggle('marked-delete', deleting);
    const badge = $('.delete-badge', item);
    if (badge) badge.hidden = !deleting;
  });
}
function scopedPages(value) {
  if (value === 'all') return 'all';
  if (value === 'current') return [ui.activeId];
  const ids = state.pages.filter((p) => ui.selected.has(p.id)).map((p) => p.id);
  if (!ids.length) throw new Error('Select at least one page in the page strip, or choose Every page.');
  return ids;
}
function applyCrop() {
  try {
    const margins = cropValues(),
      scope = scopedPages(ui.cropDraft.scope);
    if (!Object.values(margins).some((value) => value > 0))
      throw new Error('Set a margin or drag an area to keep before cropping.');
    const targets = state.pages.filter((p) => scope === 'all' || scope.includes(p.id));
    // Check every new boundary before changing anything.
    for (const page of targets) {
      const geometry = geometryOf(state, page);
      if (
        (1 - margins.left - margins.right) * geometry.width < 1 ||
        (1 - margins.top - margins.bottom) * geometry.height < 1
      )
        throw new Error('The cropped page must be at least 1 PDF point wide and high.');
    }
    change(
      () => {
        for (const p of targets) {
          const old = cropMarginsForRotation(p.crop, p.rotation),
            width = 1 - old.left - old.right,
            height = 1 - old.top - old.bottom;
          p.crop = {
            left: old.left + margins.left * width,
            right: old.right + margins.right * width,
            top: old.top + margins.top * height,
            bottom: old.bottom + margins.bottom * height,
            rotation: p.rotation,
          };
        }
      },
      { layout: true },
    );
    ui.lastCropPreset = margins;
    ui.cropDraft = { left: 0, top: 0, right: 0, bottom: 0, scope: ui.cropDraft.scope };
    renderTool();
    toast(targets.length === 1 ? 'Page cropped.' : targets.length + ' pages cropped.');
  } catch (error) {
    toast(friendly(error), true);
  }
}

// ---- Crop drag ---------------------------------------------------------------------

function cropPoint(event, rect) {
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  };
}
function startCropDrag(event) {
  const rect = surface.getBoundingClientRect();
  ui.gesture = { type: 'crop', start: cropPoint(event, rect), rect, pointerId: event.pointerId };
  surface.setPointerCapture(event.pointerId);
  event.preventDefault();
}
surface.addEventListener('pointermove', (event) => {
  const gesture = ui.gesture;
  if (gesture?.type !== 'crop' || event.pointerId !== gesture.pointerId) return;
  const end = cropPoint(event, gesture.rect),
    start = gesture.start;
  const margins = {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: 1 - Math.max(start.x, end.x),
    bottom: 1 - Math.max(start.y, end.y),
  };
  if (1 - margins.left - margins.right <= 0.01 || 1 - margins.top - margins.bottom <= 0.01) return;
  for (const [edge, value] of Object.entries(margins)) ui.cropDraft[edge] = Math.round(value * 1000) / 1000;
  fillForm({ all: true });
  updateCropOverlay();
});
function endCropDrag(event) {
  if (ui.gesture?.type === 'crop' && event.pointerId === ui.gesture.pointerId) endGesture();
}
surface.addEventListener('pointerup', endCropDrag);
surface.addEventListener('pointercancel', endCropDrag);

// ---- Pages -------------------------------------------------------------------------

/** Merging or removing pages of a PDF with form fields cannot be exported; say so before doing it. */
function formProblem(pages) {
  const used = [...new Set(pages.map((page) => page.sourceId))].map((id) =>
    state.sources.find((source) => source.id === id),
  );
  if (!used.some((source) => source?.hasForm)) return null;
  const complete =
    used.length === 1 &&
    pages.length === used[0].pageCount &&
    new Set(pages.map((page) => page.index)).size === pages.length;
  return complete
    ? null
    : 'This PDF has interactive form fields, so its pages can’t be removed, extracted or combined with other files. Save a flattened copy in your PDF reader, then open that copy.';
}
function movePage(id, offset, targetId = null) {
  if (ui.busy) return;
  const from = pageIndexOf(id),
    to = targetId ? pageIndexOf(targetId) : from + offset;
  if (from < 0 || to < 0 || to >= state.pages.length || from === to) return;
  stopEditing();
  change(
    () => {
      const [page] = state.pages.splice(from, 1);
      state.pages.splice(to, 0, page);
    },
    { layout: true },
  );
  renderTool();
  announceMessage('Page moved to position ' + (to + 1) + '.');
}
function selectedIds() {
  if (!ui.selected.size) throw new Error('Select one or more pages using the checkboxes in the page strip.');
  return new Set(ui.selected);
}
function rotateSelected() {
  const ids = selectedIds();
  stopEditing();
  change(
    () => {
      state.pages.forEach((p) => {
        if (ids.has(p.id)) p.rotation = (p.rotation + 90) % 360;
      });
    },
    { layout: true },
  );
  toast(ids.size === 1 ? 'Page rotated.' : ids.size + ' pages rotated.');
}
function deletePages() {
  const ids = selectedIds();
  if (ids.size === state.pages.length)
    throw new Error('Keep at least one page. Deselect a page before removing the others.');
  const remaining = state.pages.filter((p) => !ids.has(p.id));
  const problem = formProblem(remaining);
  if (problem) throw new Error(problem);
  stopEditing();
  change(
    () => {
      state.pages = remaining;
      state.annotations = state.annotations.filter((a) => !ids.has(a.pageId));
    },
    { layout: true },
  );
  renderTool();
  toast(
    ids.size === 1 ? 'Page deleted. You can undo this.' : ids.size + ' pages deleted. You can undo this.',
  );
}
function renderPages() {
  const list = $('#page-list');
  list.innerHTML = state.pages
    .map(
      (page, index) =>
        '<div class="page-item' +
        (page.id === ui.activeId ? ' active' : '') +
        '" data-page-id="' +
        page.id +
        '" draggable="true"><div class="page-thumb-frame"><button class="page-thumb" type="button" data-page-open="' +
        page.id +
        '" aria-label="View page ' +
        (index + 1) +
        '"' +
        (page.id === ui.activeId ? ' aria-current="page"' : '') +
        '><span class="thumb-loading">' +
        (index + 1) +
        '</span></button></div><div class="page-item-foot"><label><input type="checkbox" data-page-select="' +
        page.id +
        '" aria-label="Select page ' +
        (index + 1) +
        '"' +
        (ui.selected.has(page.id) ? ' checked' : '') +
        '><span>' +
        (index + 1) +
        '</span></label></div><span class="delete-badge" hidden>Delete</span><div class="page-move"><button class="icon-button" data-move-page="' +
        page.id +
        '" data-direction="-1" aria-label="Move page ' +
        (index + 1) +
        ' earlier"' +
        (index === 0 ? ' disabled' : '') +
        '>' +
        icon('up') +
        '</button><button class="icon-button" data-move-page="' +
        page.id +
        '" data-direction="1" aria-label="Move page ' +
        (index + 1) +
        ' later"' +
        (index === state.pages.length - 1 ? ' disabled' : '') +
        '>' +
        icon('down') +
        '</button></div></div>',
    )
    .join('');
  updateDeletionMarks();
}
function rememberThumb(key, canvas) {
  const cache = ui.thumbs.cache;
  cache.delete(key);
  cache.set(key, canvas);
  while (cache.size > THUMB_CACHE) {
    const [oldest, old] = cache.entries().next().value;
    cache.delete(oldest);
    if (!old.isConnected) {
      old.width = 0;
      old.height = 0;
    }
  }
}
// A thumbnail's edits are drawn over its button, not inside it: the button's
// name ("View page 3") stays its only text.
function thumbOverlay(node, index) {
  const svg = node.parentElement?.querySelector('svg.thumb-overlay');
  if (!svg) return;
  const overlay = pageOverlay(state, index);
  svg.setAttribute('viewBox', '0 0 ' + overlay.geometry.width + ' ' + overlay.geometry.height);
  svg.innerHTML = overlay.markup;
}
function refreshThumbOverlays() {
  for (const node of $$('#page-list [data-page-open]')) {
    if (!node.querySelector('canvas')) continue;
    const index = pageIndexOf(node.dataset.pageOpen);
    if (index >= 0) thumbOverlay(node, index);
  }
}
function showThumb(node, canvas, geometry, index) {
  canvas.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('thumb-overlay');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('preserveAspectRatio', 'none');
  node.style.aspectRatio = geometry.width + ' / ' + geometry.height;
  node.classList.add('thumb-sized');
  node.replaceChildren(canvas);
  node.parentElement.querySelector('svg.thumb-overlay')?.remove();
  node.after(svg);
  thumbOverlay(node, index);
}
function renderThumbnails() {
  const thumbs = ui.thumbs,
    token = ++thumbs.token;
  thumbs.observer?.disconnect();
  thumbs.observer = null;
  thumbs.task?.cancel();
  thumbs.task = null;
  if (!state.pages.length) return;
  const nodes = $$('#page-list [data-page-open]');
  const visible = new Set(),
    queued = new Set();
  let running = false;
  const placeholder = (node) => {
    const span = document.createElement('span');
    span.className = 'thumb-loading';
    span.textContent = pageIndexOf(node.dataset.pageOpen) + 1;
    node.replaceChildren(span);
    node.parentElement.querySelector('svg.thumb-overlay')?.remove();
  };
  async function pump() {
    if (running) return;
    running = true;
    try {
      while (queued.size && token === thumbs.token) {
        const node = queued.values().next().value;
        queued.delete(node);
        if (!visible.has(node) || node.querySelector('canvas')) continue;
        const index = pageIndexOf(node.dataset.pageOpen),
          descriptor = state.pages[index];
        if (!descriptor) continue;
        const geometry = geometryOf(state, descriptor),
          key = renderKey(descriptor);
        let canvas = thumbs.cache.get(key);
        if (!canvas || canvas.isConnected) {
          const task = renderPage(state, descriptor, THUMB_WIDTH / geometry.width);
          thumbs.task = task;
          try {
            canvas = await task.promise;
          } catch (error) {
            if (error?.name !== 'RenderingCancelledException')
              console.warn('Thumbnail unavailable', index + 1, error);
            continue;
          } finally {
            if (thumbs.task === task) thumbs.task = null;
          }
          if (token !== thumbs.token) return;
          rememberThumb(key, canvas);
        }
        if (visible.has(node)) showThumb(node, canvas, geometry, pageIndexOf(node.dataset.pageOpen));
      }
    } finally {
      running = false;
    }
  }
  if (!('IntersectionObserver' in window)) {
    nodes.forEach((node) => {
      visible.add(node);
      queued.add(node);
    });
    void pump();
    return;
  }
  thumbs.observer = new IntersectionObserver(
    (entries) => {
      if (token !== thumbs.token) return;
      for (const entry of entries) {
        const node = entry.target;
        if (entry.isIntersecting) {
          visible.add(node);
          queued.add(node);
        } else {
          visible.delete(node);
          queued.delete(node);
          if (node.querySelector('canvas')) placeholder(node);
        }
      }
      void pump();
    },
    { root: phone() ? $('#page-list') : $('.page-sidebar'), rootMargin: '350px', threshold: 0 },
  );
  nodes.forEach((node) => thumbs.observer.observe(node));
}
function choosePage(id) {
  if (ui.busy || !state.pages.some((page) => page.id === id)) return;
  stopEditing();
  endGesture();
  ui.activeId = id;
  ui.item = null;
  $$('.page-item').forEach((item) => {
    const active = item.dataset.pageId === id;
    item.classList.toggle('active', active);
    const thumb = $('.page-thumb', item);
    if (active) thumb.setAttribute('aria-current', 'page');
    else thumb.removeAttribute('aria-current');
  });
  renderTool();
  renderStage();
  revealThumbnail(id);
}
function chooseTool(tool) {
  if (ui.busy || !names[tool]) return;
  stopEditing();
  endGesture();
  if (ui.item && annotationById(ui.item)?.type !== tool) ui.item = null;
  ui.tool = tool;
  if (tool === 'crop') ui.cropDraft = { left: 0, top: 0, right: 0, bottom: 0, scope: ui.cropDraft.scope };
  if (phone()) setSheet(true);
  renderTool();
  renderStage();
  // The address follows the tool, so it can be bookmarked or shared.
  if (!$('#workspace').hidden) recordView('editor');
}
/** Phones: the tool panel is a sheet under the page that can be folded away. */
function setSheet(open) {
  ui.sheetOpen = open;
  $('.tool-sidebar').classList.toggle('collapsed', !open);
  const toggle = $('#sheet-toggle');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Hide tool settings' : 'Show tool settings');
}

// ---- Building the PDF ---------------------------------------------------------------
// The PDF is built only to download, extract or split, in a worker when possible.

let exporter = null;
let exportSequence = 0;
function exportWorker() {
  if (exporter === false || typeof Worker === 'undefined') return null;
  if (!exporter) {
    try {
      const worker = new Worker(new URL('./export-worker.js', import.meta.url), { type: 'module' });
      const jobs = new Map();
      const ready = new Promise((resolve) => {
        worker.addEventListener('message', (event) => event.data?.ready && resolve(true));
        worker.addEventListener('error', () => resolve(false));
      });
      worker.addEventListener('message', ({ data }) => {
        const job = jobs.get(data?.id);
        if (!job) return;
        if ('progress' in data) job.progress(data.progress);
        else {
          jobs.delete(data.id);
          if (data.error) job.reject(Object.assign(new Error(data.error.message), data.error));
          else job.resolve({ bytes: data.bytes, notes: data.notes || [] });
        }
      });
      worker.addEventListener('error', (event) => {
        event.preventDefault();
        for (const job of jobs.values())
          job.reject(new Error('The PDF could not be created. Please try again.'));
        jobs.clear();
        worker.terminate();
        if (exporter?.worker === worker) exporter = null;
      });
      exporter = { worker, jobs, ready };
    } catch {
      exporter = false;
      return null;
    }
  }
  return exporter;
}
async function build(input, onProgress) {
  const current = exportWorker();
  if (current && (await current.ready)) {
    const id = ++exportSequence;
    return new Promise((resolve, reject) => {
      current.jobs.set(id, { resolve, reject, progress: onProgress });
      cancellable('Cancel', () => {
        current.jobs.delete(id);
        current.worker.terminate();
        if (exporter === current) exporter = null;
        const error = new Error('Stopped. Your document is unchanged.');
        error.name = 'AbortError';
        reject(error);
      });
      current.worker.postMessage({ id, state: input });
    });
  }
  // No module workers here: build on this page instead.
  exporter = false;
  return buildPdfWithNotes(input, onProgress);
}
/**
 * The document as a PDF: { bytes, notes } (see buildPdfWithNotes). Reuses the
 * last build while nothing has changed.
 */
async function exportDocument(input = null, label = 'Preparing your PDF…') {
  stopEditing();
  if (!input && ui.exported?.version === ui.version) return ui.exported.result;
  const version = ui.version;
  busy(true, label);
  try {
    const result = await build(input || snapshot(), (progress) => {
      $('#busy-message').textContent = label + ' ' + Math.round(progress * 100) + '%';
    });
    if (!input) ui.exported = { version, result };
    return result;
  } finally {
    ui.cancelExport = null;
    busy(false);
  }
}
/** Show where an export problem is: its page, and the item or tool involved. */
function showExportError(error) {
  if (error?.name === 'AbortError') {
    toast(error.message);
    return;
  }
  const page = state.pages[error?.pageIndex];
  if (page) {
    choosePage(page.id);
    const keys = { watermark: 'watermark', pageNumber: 'numbers' };
    if (annotationById(error.itemId)) selectItem(error.itemId);
    else if (keys[error.itemId] || /^(header|footer)/.test(error.itemId || ''))
      chooseTool(keys[error.itemId] || 'footer');
  }
  toast(friendly(error), true);
}
function downloadBytes(bytes, name) {
  const url = URL.createObjectURL(
    bytes instanceof Blob ? bytes : new Blob([bytes], { type: 'application/pdf' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function usedSources() {
  return state.sources.filter((s) => state.pages.some((p) => p.sourceId === s.id));
}
function outputName(
  suffix = protectedDownload()
    ? 'protected'
    : unlockedDownload()
      ? 'unlocked'
      : usedSources().every((source) => source.picture)
        ? 'converted'
        : 'edited',
) {
  const sources = usedSources();
  const base = sources.length === 1 ? sources[0].name.replace(/\.(pdf|jpe?g|png)$/i, '') : 'combined';
  return base + '-' + suffix + '.pdf';
}
/** What a download message adds about the file, from the build's notes. */
function exportNotes(notes) {
  const content = notes.includes('pdfa-removed'),
    password = notes.includes('pdfa-removed-password');
  if (!content && !password) return '';
  return (
    ' It’s no longer marked as PDF/A (archival), because ' +
    (password && content
      ? 'PDF/A files can’t have a password, and added text and marks don’t meet PDF/A rules.'
      : password
        ? 'PDF/A files can’t have a password.'
        : 'added text and marks don’t meet PDF/A rules.')
  );
}
async function downloadDocument() {
  try {
    const version = ui.version,
      locked = protectedDownload(),
      { bytes, notes } = await exportDocument();
    downloadBytes(bytes, outputName());
    ui.savedVersion = version;
    toast(
      (locked
        ? 'Your protected PDF has been downloaded. It needs your password to open.'
        : unlockedDownload()
          ? 'Your unlocked PDF has been downloaded.'
          : 'Your edited PDF has been downloaded.') + exportNotes(notes),
    );
  } catch (error) {
    showExportError(error);
  }
}
/** Download from Protect PDF: only once a usable password is set. */
async function downloadProtected() {
  const field = $('#tool-form [name="password"]');
  if (!protectedDownload() || passwordProblem(state.protection.password)) {
    updateProtectionStatus();
    if (!state.protection?.password) {
      $('#protect-status').textContent = passwordProblem('');
      $('#protect-status').classList.add('invalid');
      field?.setAttribute('aria-invalid', 'true');
    }
    field?.focus();
    return;
  }
  await downloadDocument();
}
async function downloadSelected() {
  try {
    const ids = selectedIds();
    const extraction = snapshot();
    extraction.pages = extraction.pages.filter((p) => ids.has(p.id));
    const problem = formProblem(extraction.pages);
    if (problem) throw new Error(problem);
    const { bytes } = await exportDocument(extraction, 'Preparing selected pages…');
    downloadBytes(bytes, outputName('selected'));
    toast(
      extraction.pages.length +
        ' selected page' +
        (extraction.pages.length === 1 ? '' : 's') +
        ' downloaded.' +
        (protectedDownload() ? ' The PDF needs your password to open.' : ''),
    );
  } catch (error) {
    showExportError(error);
  }
}

function showInfo(kind) {
  const content = $('#dialog-content');
  if (kind === 'privacy')
    content.innerHTML =
      '<div class="eyebrow">YOUR FILES, YOUR SPACE</div><h2 id="dialog-title">Private by design.</h2><p>QFT PDF processes your PDFs in this browser. The editor does not send document contents, filenames, or your edits to a processing server.</p><h3>What stays on your device?</h3><p>Your PDF files, added images, text, and the edited document. PDF files and generated results are held in this tab’s memory. Closing or refreshing the tab clears them. Saved presets contain your chosen text and settings; they stay in this browser until you delete them or clear site data.</p><p>Passwords are used only in this tab: to open a protected PDF, and to protect your download. They are never saved, not even in presets. Your signature is kept in this browser only if you choose “Keep it on this device”; unticking it removes it.</p><h3>What uses the internet?</h3><p>Your browser loads this website, its PDF libraries, and font assets. The hosting provider may receive ordinary website requests. QFT PDF does not include advertising or analytics scripts.</p><p>Use Download PDF to save your finished copy. Your original file is not overwritten.</p>';
  if (kind === 'help')
    content.innerHTML =
      '<div class="eyebrow">A LITTLE GUIDANCE</div><h2 id="dialog-title">Make yourself at home.</h2><p>Open a PDF, choose a tool, and edit right on the page. Every change shows at once, exactly as it will appear in your PDF. Download PDF saves a new copy.</p><h3>What can I edit?</h3><p>Add text, PNG/JPG images, highlights, watermarks, headers, footers, and page numbers. Merge PDFs or reorder, rotate, delete, crop, extract, and split their pages. Batch tools apply a saved preset to several PDFs separately.</p><h3>Text, images and highlights</h3><p>With Add text, click the page and type. Drag an item to move it; drag a handle to resize it. Select an item to change it in the panel, or press Delete to remove it. With an item selected, arrow keys nudge it (hold Shift for bigger steps) and Enter edits text.</p><h3>Undo and redo</h3><p>Undo (Ctrl+Z or ⌘Z) reverses your recent edits; Redo (Ctrl+Shift+Z or ⌘⇧Z) brings them back. Reset returns to the first document you opened. Your workspace is not saved after you close or refresh this tab.</p><h3>Delete Pages &amp; Crop PDF</h3><p>Delete Pages lets you select thumbnails or a page range, such as 2, 4-6. Keep at least one page. Crop PDF lets you drag an area to keep or enter margin percentages, then apply to the current, selected, or every page. Each crop trims the current visible area. Restore original crop brings back the original page boundary for your chosen scope. Cropping hides content; it is not secure redaction.</p><p>Add text creates new content; it does not rewrite existing paragraphs. Highlights are annotations, not secure redaction. Changes can invalidate existing digital signatures.</p><h3>Signatures</h3><p>With Sign PDF, draw your signature, type your name in a handwriting style, or upload a picture of it. Click the page to place it, or add it to every page; drag it to move it and a corner to resize it. It is a picture of your signature, not a certificate-based digital signature.</p><h3>Passwords</h3><p>A PDF that needs a password asks for it when you open it. Your download keeps that password: change it in Protect PDF, or remove it in Unlock PDF. PDFs that only limit printing, copying or changes open without asking, and your download won’t have those limits. Passwords stay on your device and aren’t saved.</p><h3>Supported files</h3><p>PDFs with no fixed file-size or page-count limit, including password-protected PDFs (not those protected with a certificate). JPG and PNG pictures open as pages (JPG to PDF); PDF to JPG saves pages as pictures. Processing capacity depends on your device and available browser memory. Very large files can be slow or may not open, especially on mobile devices. Combining, removing, or extracting pages from PDFs with interactive form fields is not supported.</p><h3>Fonts</h3><p>Latin and Chinese text are supported, as well as Japanese kana and Korean Hangul. Only the characters you use are embedded, so Chinese text adds kilobytes to your PDF. The Chinese font (16 MB) downloads once, the first time you type it. Other scripts depend on the bundled font coverage.</p><h3>Split PDF and batch presets</h3><p>Split by individual page, every N pages, or custom groups such as 1-3; 4-6. A semicolon starts a new output PDF. Download individual results or a ZIP. Batch tools combine watermarks, headers/footers, page numbers, and cropping. Numbering restarts for each file. Presets are saved in this browser; PDFs are not.</p>';
  $('#info-dialog').showModal();
}

// ---- Opening documents ------------------------------------------------------------

function warmPdfTools() {
  loadPdfLib().catch(() => {});
  loadPdfjs().catch(() => {});
}
function isDirty() {
  return ui.version !== ui.savedVersion || Boolean(ui.splitResults?.some((file) => !file.downloaded));
}
/**
 * Ask for a protected PDF's password until it opens the file. `attempt(password)`
 * opens it; a wrong password keeps the dialog open with a message. Resolves
 * with what attempt returned, or null if the person cancels or skips the file.
 */
function passwordDialog(name, several, attempt) {
  const dialog = $('#password-dialog'),
    form = $('#password-form'),
    input = $('#password-input'),
    reveal = $('#password-show'),
    error = $('#password-error'),
    submit = $('#password-submit'),
    cancel = $('#password-cancel');
  $('#password-file').textContent = '“' + name + '”';
  cancel.textContent = several ? 'Skip this file' : 'Cancel';
  input.value = '';
  input.type = 'password';
  reveal.checked = false;
  const showError = (message) => {
    error.textContent = message;
    error.hidden = !message;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  };
  showError('');
  return new Promise((resolve, reject) => {
    let settled = false,
      working = false;
    const finish = (value, failure) => {
      if (settled) return;
      settled = true;
      form.removeEventListener('submit', onSubmit);
      cancel.removeEventListener('click', onCancel);
      reveal.removeEventListener('change', onReveal);
      dialog.removeEventListener('close', onClose);
      if (dialog.open) dialog.close();
      input.value = '';
      if (failure) reject(failure);
      else resolve(value);
    };
    const onSubmit = async (event) => {
      event.preventDefault();
      if (working) return;
      if (!input.value) {
        showError('Enter the password.');
        input.focus();
        return;
      }
      working = true;
      submit.disabled = true;
      submit.textContent = 'Opening…';
      try {
        finish(await attempt(input.value));
      } catch (failure) {
        if (failure?.code === 'password-incorrect' && !settled) {
          showError(failure.message);
          input.focus();
          input.select();
        } else finish(null, failure);
      } finally {
        working = false;
        submit.disabled = false;
        submit.textContent = 'Open PDF';
      }
    };
    const onCancel = () => finish(null);
    // Escape closes the dialog. The close event arrives later, so one left over
    // from the previous prompt may reach this one while it is open: ignore that.
    const onClose = () => {
      if (!dialog.open) finish(null);
    };
    const onReveal = () => (input.type = reveal.checked ? 'text' : 'password');
    form.addEventListener('submit', onSubmit);
    cancel.addEventListener('click', onCancel);
    reveal.addEventListener('change', onReveal);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
    input.focus();
  });
}
/**
 * Open a PDF, asking for its password if it needs one. Resolves with openPdf's
 * result and the password that opened it ('' if none was needed), or null.
 */
async function openWithPassword(name, bytes, several) {
  try {
    return { ...(await openPdf(bytes)), password: '' };
  } catch (error) {
    if (error.code !== 'password-required') throw error;
  }
  return passwordDialog(name, several, async (password) => ({
    ...(await openPdf(bytes, { password })),
    password,
  }));
}
/** What to say once files are open: protection kept or removed, files skipped. */
function openedMessage(sources, { added, kept, skipped }) {
  const withPassword = sources.some((source) => source.protection === 'password'),
    limited = sources.some((source) => source.protection === 'owner'),
    pictures = sources.filter((source) => source.picture).length,
    parts = [];
  if (pictures === sources.length && !added)
    parts.push(
      pictures === 1
        ? 'Your picture is a PDF page now. Download it, or add more pictures.'
        : 'Your ' + pictures + ' pictures are PDF pages now. Put them in order, then download one PDF.',
    );
  else if (added)
    parts.push(added + ' page' + (added === 1 ? '' : 's') + ' added. Arrange them, then download.');
  else if (ui.tool === 'unlock' && (withPassword || limited))
    parts.push(
      'Your PDF is unlocked. Download a copy that opens without a password' +
        (limited ? ' and without limits on printing, copying or changes.' : '.'),
    );
  else if (withPassword) parts.push('Your PDF is unlocked for editing, here on your device.');
  else parts.push('Your PDF is ready. Everything happens on your device.');
  if (kept) parts.push('Your download will keep the same password. Change it in Protect PDF.');
  if (limited && ui.tool !== 'unlock')
    parts.push('It had limits on printing, copying or changes, which your download won’t have.');
  if (skipped.length)
    parts.push(
      skipped.map((name) => '“' + name + '”').join(', ') +
        (skipped.length === 1 ? ' wasn’t' : ' weren’t') +
        ' opened.',
    );
  return parts.join(' ');
}
/** A picture file as a one-page source; it keeps the picture to lay the page out again. */
async function pictureSource(file, picture = null) {
  picture ||= await pictureForPage(file);
  const layout = ui.pictureLayout;
  const info = await openPdf(await imagesToPdf([picture], layout));
  return {
    id: uid(),
    bytes: info.bytes,
    name: picture.name,
    pageCount: 1,
    hasForm: false,
    pages: info.pages.map((page) => ({ box: page.cropBox, rotation: page.rotation })),
    picture,
    pictureLayout: { ...layout },
  };
}
/** Lay the pages made from pictures out again (paper size or margin changed), as one undo step. */
async function relayoutPictures() {
  const old = state.sources.filter(
    (source) => source.picture && state.pages.some((p) => p.sourceId === source.id),
  );
  if (!old.length) return;
  busy(true, 'Updating the pages made from pictures…');
  try {
    // New sources with new ids: the preview keeps rendered pages by source.
    const replaced = new Map();
    for (const source of old) replaced.set(source.id, await pictureSource(null, source.picture));
    change(
      () => {
        state.sources = [...state.sources.filter((s) => !replaced.has(s.id)), ...replaced.values()];
        state.pages = state.pages.map((page) =>
          replaced.has(page.sourceId) ? { ...page, sourceId: replaced.get(page.sourceId).id } : page,
        );
      },
      { layout: true },
    );
  } catch (error) {
    toast(friendly(error), true);
  } finally {
    busy(false);
  }
}
async function openFiles(files, append = false) {
  if (ui.busy || batch.isBusy() || !files.length) return;
  const list = [...files];
  // The picker is cleared only after its files are read (see finally below), or
  // when we stop early, so choosing the same file again still fires a change event.
  const resetPicker = () => {
    $('#file-input').value = '';
  };
  const isPdf = (file) => file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  if (list.some((file) => !isPdf(file) && !isPicture(file))) {
    resetPicker();
    toast('Please choose PDF files, or JPG and PNG pictures to make pages from.', true);
    return;
  }
  // With Add an image, a picture dropped on the page goes on the page.
  if (append && ui.tool === 'image' && list.length === 1 && isPicture(list[0]) && state.pages.length) {
    resetPicker();
    await addImageFile(list[0]);
    return;
  }
  append = append && state.pages.length > 0;
  if (
    !append &&
    state.pages.length &&
    isDirty() &&
    !(await confirmDialog({
      eyebrow: 'START A NEW DOCUMENT',
      title: 'Replace your current document?',
      body: 'Your edits will be cleared. Download your edited PDF first if you want to keep it.',
      confirmLabel: 'Open new PDF',
    }))
  ) {
    resetPicker();
    return;
  }
  stopEditing();
  busy(true, 'Opening your PDF' + (list.length > 1 ? 's' : '') + '…');
  loadPdfjs().catch(() => {});
  try {
    const sources = [],
      pages = [],
      skipped = [];
    // The first password that opened a file protects downloads too (not when unlocking).
    let password = '';
    for (const file of list) {
      if (!isPdf(file)) {
        sources.push(await pictureSource(file));
        pages.push({ id: uid(), sourceId: sources.at(-1).id, index: 0, rotation: 0 });
        continue;
      }
      const info = await openWithPassword(
        file.name,
        new Uint8Array(await file.arrayBuffer()),
        list.length > 1,
      );
      if (!info) {
        skipped.push(file.name);
        continue;
      }
      const id = uid();
      password ||= info.password;
      sources.push({
        id,
        // An encrypted PDF's unencrypted copy: the editor works on it in memory.
        bytes: info.bytes,
        name: file.name,
        pageCount: info.pageCount,
        hasForm: info.hasForm,
        pages: info.pages.map((page) => ({ box: page.cropBox, rotation: page.rotation })),
        protection: info.protection,
      });
      for (let index = 0; index < info.pageCount; index++)
        pages.push({ id: uid(), sourceId: id, index, rotation: 0 });
    }
    if (!sources.length) return;
    const keep = Boolean(password) && ui.tool !== 'unlock' && !(append && protectedDownload());
    // Draw text in the standard font as soon as the first page appears.
    previewFont('standard');
    if (append) {
      const known = new Map(state.sources.map((source) => [source.id, source]));
      sources.forEach((source) => known.set(source.id, source));
      const used = [...state.pages, ...pages].map((page) => known.get(page.sourceId));
      if (used.some((source) => source.hasForm))
        throw new Error(
          'PDFs with interactive form fields can’t be combined with other files. Save a flattened copy in your PDF reader, then add that copy.',
        );
      change(
        () => {
          state.sources.push(...sources);
          state.pages.push(...pages);
          if (keep) state.protection = { enabled: true, password };
        },
        { layout: true },
      );
      renderTool();
      toast(openedMessage(sources, { added: pages.length, kept: keep, skipped }));
    } else {
      closeDocuments();
      ui.thumbs.cache.clear();
      state = {
        ...emptyState(),
        sources,
        pages,
        protection: keep ? { enabled: true, password } : null,
      };
      ui.activeId = pages[0].id;
      ui.selected = new Set([pages[0].id]);
      ui.item = null;
      ui.past = [];
      ui.future = [];
      ui.lastChange = null;
      ui.version++;
      ui.savedVersion = ui.version;
      ui.exported = null;
      ui.initial = snapshot();
      ui.cropDraft = { left: 0, top: 0, right: 0, bottom: 0, scope: 'current' };
      ui.rangeDraft = '';
      ui.scopeErrors = {};
      ui.splitResults = null;
      ui.lastCropPreset = null;
      ui.image = null;
      ui.zoom = 1;
      ui.stage.key = null;
      ui.stage.pageKey = null;
      // Phones: tools you use on the page start with their settings folded away.
      if (phone()) setSheet(!['text', 'highlight'].includes(ui.tool));
      showWorkspace();
      documentChanged(true);
      renderTool();
      ui.focusKey = '#document-name';
      recordView('editor');
      toast(openedMessage(sources, { added: 0, kept: keep, skipped }));
    }
  } catch (error) {
    toast(friendly(error), true);
  } finally {
    busy(false);
    resetPicker();
  }
}
function showWorkspace() {
  if (!batch.close()) return;
  document.body.classList.remove('batching');
  $('#landing').hidden = true;
  $('#workspace').hidden = false;
  document.body.classList.add('editing');
  window.scrollTo(0, 0);
}
function showLanding() {
  if (!batch.close()) return;
  stopEditing();
  document.body.classList.remove('batching');
  $('#landing').hidden = false;
  $('#workspace').hidden = true;
  document.body.classList.remove('editing');
  let resume = $('#resume-document');
  if (state.pages.length && !resume) {
    resume = document.createElement('button');
    resume.id = 'resume-document';
    resume.className = 'button secondary';
    resume.dataset.action = 'resume';
    resume.textContent = 'Return to your open document';
    resume.style.marginTop = '14px';
    $('#drop-zone').append(resume);
  }
  if (resume) resume.hidden = !state.pages.length;
}
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
function recordView(view) {
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
      state = snapshot(ui.initial);
      ui.activeId = state.pages[0].id;
      ui.selected = new Set([ui.activeId]);
      ui.item = null;
    },
    { layout: true },
  );
  ui.cropDraft = { left: 0, top: 0, right: 0, bottom: 0, scope: 'current' };
  ui.lastCropPreset = null;
  renderTool();
  toast('Back to your original document. Undo brings your edits back.');
}
async function action(name, element) {
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
    ui.zoom = name === 'zoom-fit' ? 1 : clamp(ui.zoom + (name === 'zoom-in' ? 0.25 : -0.25), 0.5, 3);
    renderStage();
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
    const geometry = ui.stage.geometry;
    createText({ x: geometry.width * 0.1, y: geometry.height * 0.1 });
  }
  if (name === 'add-highlight') {
    const geometry = ui.stage.geometry;
    addHighlight({ x: geometry.width * 0.1, y: geometry.height * 0.15 });
  }
  if (name === 'place-image' && ui.image) placeImage(ui.image);
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
    updateCropOverlay();
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
  if (name === 'signature-new') {
    ui.signature = null;
    renderTool();
    $('#tool-form [name="signatureMode"]:checked')?.focus();
  }
}

function syncPageNavigation() {
  const field = $('#page-jump');
  field.max = state.pages.length;
  field.value = activeIndex() + 1;
  $('#page-counter').textContent = 'of ' + state.pages.length;
}
function jumpToPage() {
  const field = $('#page-jump'),
    number = Number(field.value);
  if (!Number.isInteger(number) || number < 1 || number > state.pages.length) {
    toast('Enter a page number from 1 to ' + state.pages.length + '.', true);
    syncPageNavigation();
    return;
  }
  choosePage(state.pages[number - 1].id);
}
function revealThumbnail(id) {
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
function splitFields() {
  return (
    selectField(
      'Split by',
      'mode',
      [
        ['each', 'Every page'],
        ['chunks', 'Every N pages'],
        ['ranges', 'Custom page groups'],
      ],
      true,
    ) +
    '<div id="split-size" class="wide">' +
    numberField('Pages per PDF', 'size', 1, Math.max(1, state.pages.length)) +
    '</div><div id="split-ranges" class="wide">' +
    makeField(
      'Page groups',
      '<textarea name="ranges" rows="3" placeholder="1-3; 4-6; 7, 9-10"></textarea>',
      true,
    ) +
    '<p class="field-hint">Separate PDFs with a semicolon. Use commas for pages within one PDF.</p></div><div id="split-summary" class="scope-note wide" aria-live="polite"></div>' +
    '<button type="submit" class="button primary">' +
    icon('split') +
    'Create split PDFs</button>' +
    '<div id="split-results" class="wide">' +
    splitResultMarkup() +
    '</div>'
  );
}
function splitResultMarkup() {
  if (!ui.splitResults?.length) return '';
  return (
    '<div class="split-result-header"><strong>' +
    ui.splitResults.length +
    ' PDFs ready</strong><span>Your source is unchanged.</span></div><button type="button" class="button primary" data-action="download-split-zip">' +
    icon('download') +
    'Download all as ZIP</button><div class="split-result-list">' +
    ui.splitResults
      .map(
        (file, index) =>
          '<div class="split-result"><span><strong>' +
          safe(file.name) +
          '</strong><small>' +
          file.pageCount +
          ' page' +
          (file.pageCount === 1 ? '' : 's') +
          ' · ' +
          formatSize(file.bytes.length) +
          '</small></span><button type="button" class="icon-button" data-action="download-split" data-output-index="' +
          index +
          '" aria-label="Download ' +
          safe(file.name) +
          '">' +
          icon('download') +
          '</button></div>',
      )
      .join('') +
    '</div>'
  );
}
function updateSplitSummary() {
  const values = ui.splitDraft;
  if (!$('#split-size')) return;
  $('#split-size').hidden = values.mode !== 'chunks';
  $('#split-ranges').hidden = values.mode !== 'ranges';
  $('#split-size input').disabled = values.mode !== 'chunks';
  $('#split-ranges textarea').disabled = values.mode !== 'ranges';
  const node = $('#split-summary');
  try {
    const groups = planSplit(
      { mode: values.mode, size: Number(values.size), ranges: values.ranges },
      state.pages.length,
    );
    const used = new Set(groups.flat()),
      omitted = state.pages.length - used.size;
    node.textContent =
      groups.length +
      ' output PDF' +
      (groups.length === 1 ? '' : 's') +
      ' · ' +
      used.size +
      ' of ' +
      state.pages.length +
      ' pages included.' +
      (omitted ? ' ' + omitted + ' page' + (omitted === 1 ? ' is' : 's are') + ' outside these groups.' : '');
    node.classList.remove('invalid');
  } catch (error) {
    node.textContent = error.message;
    node.classList.add('invalid');
  }
}
async function generateSplit() {
  if (ui.busy) return;
  try {
    const values = ui.splitDraft,
      groups = planSplit(
        { mode: values.mode, size: Number(values.size), ranges: values.ranges },
        state.pages.length,
      );
    // Each part is protected on its own, so the document is split unprotected.
    const password = protectedDownload() ? state.protection.password : null;
    const { bytes } = await exportDocument(password ? { ...snapshot(), protection: null } : null);
    ui.cancelOperation = false;
    busy(true, 'Creating split PDFs…');
    cancellable('Cancel splitting', null);
    const outputs = await splitPdf(bytes, groups, {
      password,
      onProgress: (value) => {
        $('#busy-message').textContent = 'Creating split PDFs… ' + Math.round(value * 100) + '%';
      },
      shouldCancel: () => ui.cancelOperation,
    });
    const base = safeBaseName(outputName()).replace(/-edited$/, '');
    ui.splitResults = outputs.map((output, index) => ({
      name: base + '-part-' + String(index + 1).padStart(String(groups.length).length, '0') + '.pdf',
      bytes: output,
      pageCount: groups[index].length,
    }));
    renderTool();
    toast(
      outputs.length +
        ' PDF' +
        (outputs.length === 1 ? ' is' : 's are') +
        ' ready to download.' +
        (password ? (outputs.length === 1 ? ' It needs' : ' Each needs') + ' your password to open.' : ''),
    );
  } catch (error) {
    if (error.name === 'AbortError') toast('Splitting cancelled. Your document is unchanged.');
    else showExportError(error);
  } finally {
    busy(false);
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
$('#tool-select').addEventListener('change', (event) => chooseTool(event.target.value));
$('#page-jump').addEventListener('change', jumpToPage);
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
  if (target.dataset.selectItem) selectItem(target.dataset.selectItem);
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
async function addImageFile(file) {
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
const typing = (element) =>
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
