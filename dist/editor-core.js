/**
 * The editor's shared state and helpers: the document state (state, setState)
 * and interface state (ui), names and settings of the tools, DOM shortcuts,
 * busy and focus handling, messages (toasts) and confirmations. It imports
 * nothing from the other editor modules, so they can all rely on it as they load.
 */

import { TOOL_PAGES, TOOLS } from './routes.js';

// Resolve assets beside this module, including GitHub Pages project subpaths.
export const assetUrl = (path) => new URL(path, import.meta.url).href;
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const icon = (name) => '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
export const safe = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
export const uid = () =>
  'f-' + [...crypto.getRandomValues(new Uint32Array(4))].map((value) => value.toString(36)).join('-');
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const SVG_NS = 'http://www.w3.org/2000/svg';
export const phone = () => window.innerWidth <= 720;
export const touch = () => matchMedia('(pointer: coarse)').matches;
/** Guidance says "Tap" on touch screens. */
export const tapOrClick = (text) =>
  touch() ? text.replace(/\bClick\b/g, 'Tap').replace(/\bclick\b/g, 'tap') : text;

// Tools that place items on a page; their items can be selected, dragged and resized.
export const ANNOTATION_TOOLS = ['text', 'image', 'highlight', 'signature', 'draw'];
// Tools that show a repeated setting on pages, and the state key each one edits.
export const SETTINGS = { watermark: 'watermark', footer: 'headerFooter', numbers: 'pageNumbers' };
const SETTING_TOOL = { watermark: 'watermark', headerFooter: 'footer', pageNumbers: 'numbers' };
// Resize handles for each kind of item, named by compass direction.
export const HANDLES = {
  text: ['e'],
  image: ['nw', 'ne', 'sw', 'se'],
  signature: ['nw', 'ne', 'sw', 'se'],
  highlight: ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'],
  drawing: ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'],
};
export const THUMB_WIDTH = 172; // canvas pixels: sharp at 86 CSS pixels on high-density screens
export const THUMB_CACHE = 60;

export const emptyState = () => ({
  sources: [],
  pages: [],
  annotations: [],
  watermark: null,
  headerFooter: null,
  pageNumbers: null,
  // { enabled, password }: downloads need this password to open. Kept in memory only.
  protection: null,
  // Values typed into form fields, by source and field name, and whether downloads flatten the fields.
  formValues: {},
  flattenForms: false,
  // Combining PDF files: each file gets a bookmark, named after it.
  fileBookmarks: true,
  // Document properties set in the editor ({ title, author, subject, keywords,
  // language, clean }), or null to keep the first PDF's own.
  properties: null,
});
export let state = emptyState();
// Letter paper where it is the usual size (the United States, Canada, Mexico and
// the Philippines, by the region in the browser's language), A4 everywhere else.
const USUAL_PAPER = ['US', 'CA', 'MX', 'PH'].includes(
  String(globalThis.navigator?.language || '').split('-')[1],
)
  ? 'letter'
  : 'a4';
export const ui = {
  batch: null, // the batch workspace (batch-ui.js initBatch), set by editor.js
  tool: 'text',
  activeId: null,
  selected: new Set(),
  selectedByDefault: false, // the selection is the one a document opens with (its first page), not a choice, until a page is ticked
  zoomByHand: false, // the zoom was set with the buttons or the wheel since a form field last got focus (form-ui.js)
  item: null, // the selected item on the current page
  editing: null, // the text item being typed into on the page
  zoom: 1,
  formZoom: null, // phones: the zoom before a form field zoomed the page (form-ui.js)
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
  styles: {
    text: { size: 18, color: '#244e41' },
    highlight: { color: '#f6ce53', opacity: 0.35 },
    // Draw: the shape new drawings take, their colour and line width (points).
    draw: { shape: 'pen', color: '#d0342c', width: 2 },
  },
  dragId: null,
  gesture: null,
  toastTimer: null,
  toastReturnFocus: null,
  focusKey: null,
  splitResults: null,
  splitDraft: { mode: 'each', size: 2, ranges: '' },
  rangeDraft: '',
  cropDraft: { left: 0, top: 0, right: 0, bottom: 0, scope: 'current' },
  // Add margins, in millimetres.
  marginDraft: { top: 0, bottom: 0, left: 0, right: 0, scope: 'all' },
  // Resize pages: the paper the pages in scope go on.
  resizeDraft: { paper: USUAL_PAPER, scope: 'all' },
  // Pages per sheet: margin and gap in millimetres.
  sheetDraft: {
    perSheet: 2,
    paper: USUAL_PAPER,
    margin: 10,
    gap: 5,
    border: false,
  },
  scopeErrors: {},
  cancelOperation: false,
  cancelExport: null,
  lastCropPreset: null,
  // When an arrow key last moved through the tool menu, and whether Watermark or
  // Page numbers wait for focus to leave it before they show (chooseTool).
  menuTraversal: 0,
  defaultsOnBlur: false,
  // Organize pages: the backs of a double-sided scan came from the last sheet first (Interleave).
  backsReversed: true,
  // Watermark and Page numbers whose defaults were shown for this document (showSettingDefaults).
  shownSettings: new Set(),
  shownDepth: 0,
  landingFocus: null,
  // The page stack (see "The page preview"): its layout, the pages shown, and the reading position.
  stage: {
    scale: 1,
    layout: [],
    byId: new Map(),
    metrics: null,
    version: 0,
    views: new Map(),
    position: null, // where the view is, to bring it back there after a new layout
    readAt: null, // the scroll offsets that position was read at
    lock: null,
    reveal: null,
    frame: 0,
    rendering: false,
    drawing: null,
    renderTimer: 0,
    holdUntil: 0,
    failed: new Set(),
  },
  thumbs: { observer: null, token: 0, task: null, cache: new Map() },
  frame: 0,
  sheetOpen: true,
  // The signature to place (a PNG: { bytes, type, width, height }), and the one being made.
  signature: null,
  signatureKept: false,
  signatureDraft: { mode: 'draw', strokes: [], text: '', color: '#141414', removeBackground: true },
  // Pages made from pictures: paper size ('fit' is the picture's own size) and margin in points.
  pictureLayout: { size: USUAL_PAPER, margin: 24 },
  pictureExport: { format: 'jpg', dpi: 150, scope: 'all' },
};
// Tool pages (routes.js) name their tool on <body data-tool>; it opens first.
export const pageTool = TOOL_PAGES[document.body.dataset.tool] ? document.body.dataset.tool : null;
if (pageTool && pageTool !== 'batch') ui.tool = pageTool;
/** Each editor tool's name: the menu, the panel's title (routes.js). */
export const names = Object.fromEntries(TOOLS.filter((item) => item.tab).map((item) => [item.id, item.name]));
export const descriptions = {
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
  margins:
    'Add blank space around your pages: room for notes, binding or punching. Nothing on the page moves.',
  resize:
    'Put your pages on A4 or Letter paper, each scaled to fit: one size for a document of mixed or odd sizes.',
  split: 'Create separate PDFs from this document, including your edits.',
  sheets:
    'Put 2 or 4 pages on each sheet, for handouts or to save paper. The sheets download as a new PDF; your document stays as it is.',
  protect: 'Choose a password. Anyone who opens the PDF you download will need it.',
  unlock: 'Download a copy of your PDF that opens without a password.',
  signature:
    'Draw, type or upload your signature, then click the page where it belongs. Drag it to move it, or a corner to resize it.',
  jpgtopdf:
    'Your JPG and PNG pictures are pages. Choose their paper size, put them in order in the page strip, then download one PDF.',
  pdftojpg: 'Save pages as JPG or PNG pictures, exactly as they look with your edits.',
  form: 'Click a field to type in it, or tick its box. Tab moves to the next field.',
  properties:
    'The title, author and other details saved in your PDF. Change them, or remove them before you share it.',
  draw: 'Draw on the page with a pen, or drag to add a line, an arrow, a rectangle or an ellipse.',
};
export const settingDefaults = {
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
    mirror: false,
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
    mirror: false,
    pages: 'all',
  }),
};

function copySetting(setting) {
  return setting
    ? { ...setting, pages: Array.isArray(setting.pages) ? [...setting.pages] : setting.pages }
    : null;
}
export function snapshot(current = state) {
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
    formValues: Object.fromEntries(
      Object.entries(current.formValues || {}).map(([id, values]) => [
        id,
        Object.fromEntries(
          Object.entries(values).map(([name, value]) => [name, Array.isArray(value) ? [...value] : value]),
        ),
      ]),
    ),
    flattenForms: Boolean(current.flattenForms),
    fileBookmarks: current.fileBookmarks !== false,
    properties: current.properties ? { ...current.properties } : null,
  };
}
export function busy(value, message = 'Working on your PDF…') {
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
export function cancellable(label, onCancel) {
  const button = $('#busy-cancel');
  button.textContent = label;
  button.disabled = false;
  button.hidden = false;
  ui.cancelExport = onCancel;
}
/** Describe the focused control so its replacement can be found after a re-render. */
export function focusKey(element = document.activeElement) {
  if (!element || element === document.body || !element.isConnected) return null;
  const esc = (value) => CSS.escape(String(value));
  const pageId = element.closest('[data-page-id]')?.dataset.pageId;
  const pageFallback = pageId ? '[data-page-open="' + esc(pageId) + '"]' : null;
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
/**
 * Delete pages starts with nothing to delete: the page a document opens with
 * selected was not chosen. Called wherever the selection is set for the user
 * (a document opens, Reset, Undo and Redo) and when the tool is chosen. Pages
 * selected on purpose stay selected.
 */
export function dropDefaultSelection() {
  if (ui.tool !== 'delete' || !ui.selectedByDefault) return;
  ui.selected = new Set();
  ui.selectedByDefault = false;
  $$('[data-page-select]').forEach((input) => (input.checked = false));
}
/**
 * Focus the first visible, enabled match of a focusKey() description. A control
 * that disabled itself (Delete, once the selected pages are gone) hands focus
 * to the nearest enabled control in its group, the one before it first, so a
 * keyboard user keeps their place.
 */
export function restoreFocus(key) {
  for (const selector of [].concat(key || [])) {
    if (!selector) continue;
    const shown = $$(selector).filter((element) => element.getClientRects().length);
    const target = shown.find((element) => !element.disabled);
    if (target) {
      target.focus({ preventScroll: true });
      return true;
    }
    const group = shown[0]?.closest('.mini-actions, .selection-buttons, .field-row, #tool-form');
    const controls = group ? $$('button, input, select, textarea, [tabindex="0"]', group) : [],
      at = controls.indexOf(shown[0]),
      usable = (element) => element && !element.disabled && element.getClientRects().length;
    for (let step = 1; at >= 0 && step < controls.length; step++) {
      const neighbour = [controls[at - step], controls[at + step]].find(usable);
      if (!neighbour) continue;
      neighbour.focus({ preventScroll: true });
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
export function toast(message, error = false, { announce = true } = {}) {
  const node = $('#toast');
  $('#toast-message').textContent = message;
  node.classList.toggle('error', error);
  node.hidden = false;
  positionToast();
  if (announce) announceMessage(message, error);
  scheduleToastHide();
}
/**
 * In the editor, the notice sits in the gap between page navigation and the zoom
 * controls, as wide as the gap allows, so it covers neither. Where the gap is
 * too narrow for it, it sits at the foot of the pages instead, above the status
 * line.
 */
export function positionToast() {
  const node = $('#toast');
  if (!document.body.classList.contains('editing') || phone()) return;
  const bar = $('.preview-toolbar').getBoundingClientRect(),
    nav = $('.page-navigation').getBoundingClientRect(),
    zoom = $('.zoom-controls').getBoundingClientRect(),
    room = zoom.left - nav.right - 24;
  const place = (left, top, bottom, width) => {
    node.style.setProperty('--toast-left', left + 'px');
    node.style.setProperty('--toast-top', top);
    node.style.setProperty('--toast-bottom', bottom);
    node.style.setProperty('--toast-width', width + 'px');
  };
  if (room >= 280) place((nav.right + zoom.left) / 2, bar.top + 4 + 'px', 'auto', Math.min(460, room));
  else {
    const stage = $('#canvas-scroll').getBoundingClientRect();
    place(
      stage.left + stage.width / 2,
      'auto',
      // In a short window the pages end below its edge: the notice stays in the window.
      Math.max(8, innerHeight - stage.bottom + 8) + 'px',
      Math.max(240, Math.min(460, stage.width - 32)),
    );
  }
}
export function scheduleToastHide() {
  clearTimeout(ui.toastTimer);
  if ($('#toast').hidden || $('#toast').classList.contains('error')) return;
  // Five seconds, and longer for longer messages (about 17 characters a second).
  ui.toastTimer = setTimeout(hideToast, Math.max(5000, $('#toast-message').textContent.length * 60));
}
export function hideToast() {
  clearTimeout(ui.toastTimer);
  const node = $('#toast'),
    hadFocus = node.contains(document.activeElement);
  node.hidden = true;
  if (hadFocus && ui.toastReturnFocus?.isConnected) ui.toastReturnFocus.focus({ preventScroll: true });
  ui.toastReturnFocus = null;
}
let rested = 0;
export function announceMessage(message, assertive = false) {
  // What waited for things to rest (announceRested) gives way to this.
  clearTimeout(rested);
  const region = $(assertive ? '#announce-alert' : '#announce-status');
  region.textContent = '';
  // Inserting fresh text into an existing live region is announced, even for a repeated message.
  setTimeout(() => {
    region.textContent = message;
  }, 60);
}
/**
 * Announce once things rest. Of a quick run only the last is said: a held key
 * resizes an item some thirty times a second, and a screen reader would queue
 * every size on the way. Nothing is said if something else is announced in the
 * meantime (the resize was undone, the item deleted), or if `still()` no longer
 * holds by then (the item is not the selected one any more).
 */
export function announceRested(message, still = () => true) {
  clearTimeout(rested);
  rested = setTimeout(() => still() && announceMessage(message), 300);
}
/**
 * Ask before a destructive step. Resolves true only for the confirm button;
 * Escape, Cancel and clicking the backdrop all resolve false. Focus starts on
 * Cancel and returns to the triggering control when the dialog closes.
 */
export function confirmDialog({ eyebrow = '', title, body, confirmLabel }) {
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
export function friendly(error) {
  console.error(error);
  return error?.message || 'That did not work. Please try a different PDF.';
}
export function activeIndex() {
  const index = state.pages.findIndex((p) => p.id === ui.activeId);
  return index < 0 ? 0 : index;
}
export function currentPage() {
  return state.pages[activeIndex()];
}
export function pageIndexOf(id) {
  return state.pages.findIndex((page) => page.id === id);
}
export function annotationById(id) {
  return id ? state.annotations.find((annotation) => annotation.id === id) || null : null;
}
/** The selected item, on whichever page it is. */
export function selectedItem() {
  return annotationById(ui.item);
}
export function formatSize(bytes) {
  return bytes >= 1048576
    ? (bytes / 1048576).toFixed(1) + ' MB'
    : Math.max(1, Math.round(bytes / 1024)) + ' KB';
}
/** "1-3, 5" from zero-based page indexes. */
export function rangeText(indexes) {
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

/** Replace the document state (undo, redo, opening and resetting documents). */
export function setState(next) {
  state = next;
}

/** Whether keystrokes on this element are text being typed (so shortcuts leave them alone). */
export const typing = (element) =>
  ['INPUT', 'TEXTAREA', 'SELECT'].includes(element?.tagName) || element?.isContentEditable;

// ---- Protection ----------------------------------------------------------------

/** Whether downloads will need a password to open. */
export function protectedDownload() {
  return Boolean(state.protection && state.protection.enabled !== false && state.protection.password);
}
/** Protected PDFs in use: opened with a password, or limiting printing, copying or changes. */
export function lockedSources() {
  return state.sources.filter(
    (source) => source.protection && state.pages.some((page) => page.sourceId === source.id),
  );
}
/** Whether Unlock PDF is giving a protected PDF back without its password. */
export function unlockedDownload() {
  return ui.tool === 'unlock' && !protectedDownload() && lockedSources().length > 0;
}

// ---- The help and privacy dialogs ------------------------------------------------

/** Open the privacy or help dialog (on any page; the editor need not be loaded). */
export function showInfo(kind) {
  const content = $('#dialog-content');
  if (kind === 'privacy')
    content.innerHTML =
      '<div class="eyebrow">YOUR FILES, YOUR SPACE</div><h2 id="dialog-title">Private by design.</h2><p>QFT PDF processes your PDFs in this browser. The editor does not send document contents, filenames, or your edits to a processing server.</p><h3>What stays on your device?</h3><p>Your PDF files, added images, text, and the edited document. PDF files and generated results are held in this tab’s memory. Closing or refreshing the tab clears them. Saved presets contain your chosen text and settings; they stay in this browser until you delete them or clear site data. So do the settings of Watermark, Headers &amp; footers and Page numbers, when you tick “Remember these settings on this device”; unticking it forgets them.</p><p>Passwords are used only in this tab: to open a protected PDF, and to protect your download. They are never saved, not even in presets. Your signature is kept in this browser only if you choose “Keep it on this device”; unticking it removes it.</p><h3>What uses the internet?</h3><p>Your browser loads this website, its PDF libraries, and font assets. The hosting provider may receive ordinary website requests. QFT PDF does not include advertising or analytics scripts.</p><p>Use Download PDF to save your finished copy. Your original file is not overwritten.</p>';
  if (kind === 'help')
    content.innerHTML =
      '<div class="eyebrow">A LITTLE GUIDANCE</div><h2 id="dialog-title">Make yourself at home.</h2><p>Open a PDF, choose a tool, and edit right on the page. Every change shows at once, exactly as it will appear in your PDF. Download PDF saves a new copy.</p><h3>What can I edit?</h3><p>Add text, PNG/JPG images, highlights, drawings, watermarks, headers, footers, and page numbers. Fill in PDF forms. Merge PDFs or reorder, reverse, rotate, delete, crop, extract, and split their pages, interleave a double-sided scan, and add blank pages or margins. Resize pages to A4 or Letter paper. Put 2 or 4 pages on each sheet for handouts. Batch tools apply a saved preset to several PDFs separately.</p><h3>Text, images and highlights</h3><p>With Add text, click the page and type. Drag an item to move it; drag a handle to resize it. Select an item to change it in the panel, or press Delete to remove it. With an item selected, arrow keys move it, Alt and an arrow key resizes it (hold Shift for bigger steps) and Enter edits text.</p><h3>Undo and redo</h3><p>Undo (Ctrl+Z or ⌘Z) reverses your recent edits; Redo (Ctrl+Shift+Z or ⌘⇧Z) brings them back. Each button says which step it will take. Reset returns to the first document you opened. Your workspace is not saved after you close or refresh this tab.</p><h3>Delete pages &amp; Crop PDF</h3><p>Delete pages lets you select thumbnails or a page range, such as 2, 4-6. Keep at least one page. Crop PDF lets you drag an area to keep or enter margin percentages, then apply to the current, selected, or every page. Each crop trims the current visible area. Restore original crop brings back the original page boundary for your chosen scope. Cropping hides content; it is not secure redaction.</p><p>Add text creates new content; it does not rewrite existing paragraphs. Highlights are annotations, not secure redaction. Changes can invalidate existing digital signatures. QFT PDF doesn’t compress PDFs, read the text in scans (OCR), or convert to or from Word.</p><h3>Signatures</h3><p>With Sign PDF, draw your signature, type your name in a handwriting style, or upload a picture of it. Click the page to place it, or add it to every page; drag it to move it and a corner to resize it. It is a picture of your signature, not a certificate-based digital signature.</p><h3>Forms</h3><p>With Fill form, click a field to type in it, or tick its box; Tab moves to the next field. On a phone, the page zooms in to the field you tap; Fit shows the whole page again. Your download keeps the fields fillable, or turn on Flatten fields on download to make your answers part of the pages. Calculations built into a form don’t run, and forms made only in Adobe’s XFA format can’t be filled.</p><h3>Drawing</h3><p>With Draw, drag on the page to draw with the pen, or choose a line, an arrow, a rectangle or an ellipse. Each stroke is one undo step. Select a drawing to move it, resize it, or change its color and line width. On a touch screen, one finger draws and two fingers scroll.</p><h3>Document properties</h3><p>Document properties shows the title, author, subject, keywords and language saved in your PDF. Change them, or choose Remove all before you share the file: it also removes which app made the PDF and when. The language stays, because screen readers need it.</p><h3>Passwords</h3><p>A PDF that needs a password asks for it when you open it. Your download keeps that password: change it in Protect PDF, or remove it in Unlock PDF. PDFs that only limit printing, copying or changes open without asking, and your download won’t have those limits. Passwords stay on your device and aren’t saved.</p><h3>Supported files</h3><p>PDFs with no fixed file-size or page-count limit, including password-protected PDFs (not those protected with a certificate). JPG and PNG pictures open as pages (JPG to PDF); PDF to JPG saves pages as pictures. Processing capacity depends on your device and available browser memory. Very large files can be slow or may not open, especially on mobile devices. To combine, remove, extract or split pages of a PDF with form fields, first turn on Flatten fields on download in Fill form.</p><h3>Fonts</h3><p>Latin and Chinese text are supported, as well as Japanese kana and Korean Hangul. Japanese kanji and Traditional Chinese characters use the font’s Simplified Chinese shapes, so some of them look slightly different. Only the characters you use are embedded, so Chinese text adds kilobytes to your PDF. The Chinese font (16 MB) downloads once, the first time you type it. Other scripts depend on the bundled font coverage.</p><h3>Split PDF and batch presets</h3><p>Split by individual page, every N pages, or custom groups such as 1-3; 4-6. A semicolon starts a new output PDF. Download individual results or a ZIP. Batch tools combine watermarks, headers/footers, page numbers, and cropping. Numbering restarts for each file. Presets are saved in this browser; PDFs are not.</p>';
  $('#info-dialog').showModal();
}
