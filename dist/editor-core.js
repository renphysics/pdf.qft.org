/**
 * The editor's shared state and helpers: the document state (state, setState)
 * and interface state (ui), names and settings of the tools, DOM shortcuts,
 * busy and focus handling, messages (toasts) and confirmations. It imports
 * nothing from the other editor modules, so they can all rely on it as they load.
 */

import { savedSignature } from './signature.js';
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
export const ui = {
  batch: null, // the batch workspace (batch-ui.js initBatch), set by app.js
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
  // Pages per sheet: margin and gap in millimetres; Letter paper where it is the usual size.
  sheetDraft: {
    perSheet: 2,
    paper: ['US', 'CA', 'MX', 'PH'].includes(String(globalThis.navigator?.language || '').split('-')[1])
      ? 'letter'
      : 'a4',
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
    position: null,
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
/** Focus the first visible, enabled match of a focusKey() description. */
export function restoreFocus(key) {
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
export function toast(message, error = false, { announce = true } = {}) {
  const node = $('#toast');
  $('#toast-message').textContent = message;
  node.classList.toggle('error', error);
  node.hidden = false;
  positionToast();
  if (announce) announceMessage(message, error);
  scheduleToastHide();
}
/** In the editor, centre the notice between page navigation and zoom controls. */
export function positionToast() {
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
export function announceMessage(message, assertive = false) {
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
