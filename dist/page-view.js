/**
 * The page preview: pages one under another in the stage, drawn near the view
 * (render pump, zoom, the current page), with the overlay of added items,
 * selection frames and the stage hint.
 */

import { textValue } from './layout.js';
import { formKey, geometryOf, pageOverlay, releasePage, renderKey, renderPage } from './preview.js';
import {
  $,
  $$,
  activeIndex,
  ANNOTATION_TOOLS,
  annotationById,
  clamp,
  focusKey,
  friendly,
  HANDLES,
  icon,
  pageIndexOf,
  phone,
  restoreFocus,
  safe,
  selectedItem,
  state,
  SVG_NS,
  tapOrClick,
  toast,
  ui,
} from './editor-core.js';
import { documentFields, fillingForm, renderFormLayer, updateFormSummary } from './form-ui.js';
import { positionInlineEditor, stack } from './page-items.js';
import { annotationList, fillForm } from './tool-panel.js';
import { updateCropOverlays } from './panel-crop.js';
import { refreshThumbOverlays, revealThumbnail, syncPageNavigation, thumbKey } from './pages.js';

// ---- The page preview ----------------------------------------------------------
// Pages are shown one under another in a scrolling stack, each fitted to its
// width. A page is rendered from its source PDF when it comes near the visible
// area and released when it leaves, so long documents stay light. Edits are drawn on
// top as SVG (preview.js), and items can be selected and moved on each page's
// edit layer. The current page is the one filling most of the view: the page
// counter, the page strip and the tools that work on "this page" follow it.

// Larger canvases are refused or slow (iOS Safari allows 16.7 million pixels in all).
const MAX_PAGE_PIXELS = matchMedia('(pointer: coarse)').matches ? 5_000_000 : 16_000_000;
const releaseCanvas = (canvas) => {
  canvas.width = 0;
  canvas.height = 0;
};
export function pageById(id) {
  return state.pages[pageIndexOf(id)];
}
/** The stack's margins (set in CSS) and the size of the view. */
function stageMetrics() {
  const scroll = $('#canvas-scroll'),
    style = getComputedStyle(scroll),
    read = (name, fallback) => {
      const value = parseFloat(style.getPropertyValue(name));
      return Number.isFinite(value) ? value : fallback;
    };
  return {
    padX: read('--stage-pad-x', 30),
    padY: read('--stage-pad-y', 30),
    gap: read('--stage-gap', 20),
    width: scroll.clientWidth,
    height: scroll.clientHeight,
  };
}
/**
 * CSS pixels per point for a page. At Fit each page fills the width (at most
 * 135%), so a page turned on its side is as wide as the others; on phones the
 * whole page fits the stage. Zoom scales every page alike.
 */
function pageScale(geometry, metrics) {
  let fit = Math.min(Math.max(120, metrics.width - 2 * metrics.padX) / geometry.width, 1.35);
  if (phone()) fit = Math.min(fit, Math.max(120, metrics.height - 2 * metrics.padY) / geometry.height);
  return fit * ui.zoom;
}
/** Place every page in the stack: whole CSS pixels for each page's size and position keep it sharp. */
function layoutStage() {
  const stage = ui.stage,
    metrics = stageMetrics();
  let top = metrics.padY,
    widest = 0;
  const layout = state.pages.map((page, index) => {
    const geometry = geometryOf(state, page),
      scale = pageScale(geometry, metrics),
      width = Math.max(1, Math.round(geometry.width * scale)),
      height = Math.max(1, Math.round(geometry.height * scale));
    const entry = {
      id: page.id,
      index,
      top,
      left: 0,
      width,
      height,
      scale: width / geometry.width,
      geometry,
    };
    top += height + metrics.gap;
    widest = Math.max(widest, width);
    return entry;
  });
  const width = Math.max(metrics.width, widest + 2 * metrics.padX);
  // Pages narrower than the view are centred in it; wider ones start at the margin.
  for (const entry of layout)
    entry.left =
      entry.width + 2 * metrics.padX <= metrics.width
        ? Math.floor((metrics.width - entry.width) / 2)
        : metrics.padX;
  Object.assign(stage, {
    scale: layout[activeIndex()]?.scale || 1,
    layout,
    metrics,
    byId: new Map(layout.map((entry) => [entry.id, entry])),
    version: stage.version + 1,
  });
  const stack = $('#page-stack');
  stack.style.width = width + 'px';
  stack.style.height = top - metrics.gap + metrics.padY + 'px';
}
/** The page at a height in the stack, or the page above the gap there. */
function entryAt(y) {
  const layout = ui.stage.layout;
  let low = 0,
    high = layout.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (layout[middle].top <= y) low = middle;
    else high = middle - 1;
  }
  return layout[low];
}
/** The index of the first page reaching below a height in the stack. */
function firstBelow(y) {
  const layout = ui.stage.layout;
  let low = 0,
    high = layout.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (layout[middle].top + layout[middle].height > y) high = middle;
    else low = middle + 1;
  }
  return low;
}
/** The point of the view that stays put when pages change size: the middle of its top edge. */
const readingPoint = () => ({ x: $('#canvas-scroll').clientWidth / 2, y: 0 });
/**
 * Where a point of the view is in the document: a page, the spot on it, and
 * any distance beyond its edges (in a margin or a gap), so that the same spot
 * can be brought back to the same point after the pages change size.
 */
function positionAt(x, y) {
  const scroll = $('#canvas-scroll');
  if (!ui.stage.layout.length) return null;
  const left = scroll.scrollLeft + x,
    top = scroll.scrollTop + y;
  let entry = entryAt(top);
  // In the gap under a page, the point belongs to the next page, which it stays above.
  const next = ui.stage.layout[entry.index + 1];
  if (next && top > entry.top + entry.height) entry = next;
  const fx = clamp((left - entry.left) / entry.width, 0, 1),
    fy = clamp((top - entry.top) / entry.height, 0, 1);
  return {
    id: entry.id,
    index: entry.index,
    fx,
    fy,
    dx: left - entry.left - fx * entry.width,
    dy: top - entry.top - fy * entry.height,
    rx: scroll.clientWidth ? x / scroll.clientWidth : 0.5,
    ry: scroll.clientHeight ? y / scroll.clientHeight : 0,
  };
}
function restorePosition(position) {
  const scroll = $('#canvas-scroll'),
    stage = ui.stage;
  if (!position) {
    scroll.scrollTop = 0;
    scroll.scrollLeft = 0;
    return;
  }
  const entry = stage.byId.get(position.id);
  if (!entry) {
    // The page was removed: show the page now in its place.
    scroll.scrollTop = pageTop(stage.layout[Math.min(position.index, stage.layout.length - 1)]);
    return;
  }
  scroll.scrollTop = Math.round(
    entry.top + position.fy * entry.height + position.dy - position.ry * scroll.clientHeight,
  );
  scroll.scrollLeft = Math.round(
    entry.left + position.fx * entry.width + position.dx - position.rx * scroll.clientWidth,
  );
}
/** The scroll position showing a page from its top edge (on phones at Fit, where pages snap to the middle, centred). */
function pageTop(entry) {
  const scroll = $('#canvas-scroll');
  if (scroll.classList.contains('snap-pages'))
    return Math.max(0, Math.round(entry.top + entry.height / 2 - scroll.clientHeight / 2));
  return entry.index === 0 ? 0 : Math.max(0, entry.top - Math.round(ui.stage.metrics.gap / 2));
}
/** How much of a page shows, from 0 to 1, where 1 is all of it or all of the view. */
function pageShare(entry) {
  const scroll = $('#canvas-scroll'),
    top = scroll.scrollTop,
    bottom = top + scroll.clientHeight,
    visible = Math.min(bottom, entry.top + entry.height) - Math.max(top, entry.top);
  return Math.max(0, visible) / Math.max(1, Math.min(entry.height, scroll.clientHeight));
}
/**
 * The page filling most of the view; ties go to the earlier page, except at
 * the end of the document, where the last whole page wins. While a selected
 * item's page shows, that page stays current.
 */
function pageInView() {
  const scroll = $('#canvas-scroll'),
    layout = ui.stage.layout,
    top = scroll.scrollTop,
    bottom = top + scroll.clientHeight,
    atEnd = top > 0 && bottom >= scroll.scrollHeight - 2;
  const working = ui.stage.byId.get(annotationById(ui.editing || ui.item)?.pageId);
  if (working && pageShare(working) > 0) return working.id;
  let best = null,
    bestShare = 0;
  for (let index = firstBelow(top); index < layout.length && layout[index].top < bottom; index++) {
    const share = pageShare(layout[index]);
    if (share > bestShare + 0.001 || (atEnd && share > 0.999)) {
      best = layout[index];
      bestShare = share;
    }
  }
  return best?.id || null;
}
/** Until the view scrolls, the current page stays current, whatever a new layout shows most of. */
function lockCurrentPage() {
  ui.stage.lock = { id: ui.activeId, top: $('#canvas-scroll').scrollTop };
}
/** Lay the pages out again (after a change of zoom, view size or pages) and draw them. */
export function renderStage({ position = null } = {}) {
  if (!state.pages.length || $('#workspace').hidden) return;
  const stage = ui.stage,
    scroll = $('#canvas-scroll');
  scroll.classList.toggle('snap-pages', phone() && ui.zoom === 1);
  const keep = position || stage.position;
  layoutStage();
  restorePosition(keep);
  if (stage.reveal) {
    // Undo, redo and removed pages show the page concerned, if it is out of view.
    const entry = stage.byId.get(stage.reveal);
    stage.reveal = null;
    if (entry && pageShare(entry) < 0.25) scroll.scrollTop = pageTop(entry);
  }
  lockCurrentPage();
  stage.position = positionAt(readingPoint().x, readingPoint().y);
  $('#page-stack').dataset.tool = ui.tool;
  $('#zoom-label').textContent = ui.zoom === 1 ? 'Fit' : Math.round(ui.zoom * 100) + '%';
  syncViews();
  orderViews();
  renderOverlays();
  updateCurrentPage();
}
/** Forget the pages shown for the last document. */
export function resetStage() {
  const stage = ui.stage;
  for (const view of [...stage.views.values()]) removeView(view, { release: false });
  Object.assign(stage, {
    layout: [],
    byId: new Map(),
    position: null,
    lock: null,
    reveal: null,
    failed: new Set(),
  });
  const scroll = $('#canvas-scroll');
  scroll.scrollTop = 0;
  scroll.scrollLeft = 0;
}
export function onStageScroll() {
  if (ui.stage.frame) return;
  ui.stage.frame = requestAnimationFrame(() => {
    ui.stage.frame = 0;
    trackScroll();
  });
}
/** After scrolling: the current page follows the view, and pages coming into view are drawn. */
function trackScroll() {
  const stage = ui.stage,
    scroll = $('#canvas-scroll');
  if (!stage.layout.length || $('#workspace').hidden || !state.pages.length) return;
  stage.position = positionAt(readingPoint().x, readingPoint().y);
  if (stage.lock && Math.abs(scroll.scrollTop - stage.lock.top) > 2) stage.lock = null;
  if (!stage.lock) {
    const id = pageInView();
    if (id && id !== ui.activeId) {
      ui.activeId = id;
      updateCurrentPage();
    }
  }
  syncViews();
}
/** Bring a page into view (from the page strip, the page number or Previous and Next). */
export function scrollToPage(id) {
  const entry = ui.stage.byId.get(id),
    scroll = $('#canvas-scroll');
  if (!entry) return;
  scroll.scrollTop = pageTop(entry);
  lockCurrentPage();
  ui.stage.position = positionAt(readingPoint().x, readingPoint().y);
  syncViews();
}
/** Make a page current without moving the view: it is on screen, and was clicked or tapped. */
export function setCurrentPage(id) {
  if (id === ui.activeId) return;
  ui.activeId = id;
  lockCurrentPage();
  updateCurrentPage();
}
/**
 * Keep elements for the pages near the view (and the pages in use) and drop
 * the rest; their canvases are released and drawn again when they return.
 */
export function syncViews() {
  const stage = ui.stage,
    scroll = $('#canvas-scroll');
  if (!stage.layout.length) return;
  const margin = Math.max(scroll.clientHeight, 400),
    from = scroll.scrollTop - margin,
    to = scroll.scrollTop + scroll.clientHeight + margin,
    wanted = new Set();
  for (let index = firstBelow(from); index < stage.layout.length && stage.layout[index].top < to; index++)
    wanted.add(stage.layout[index].id);
  // Pages in use stay: the current page, and the pages being typed on, dragged on or holding focus.
  const focused = document.activeElement?.closest?.('.page-view')?.dataset.viewId;
  for (const id of [ui.activeId, annotationById(ui.editing)?.pageId, ui.gesture?.pageId, focused])
    if (id && stage.byId.has(id)) wanted.add(id);
  for (const view of [...stage.views.values()]) if (!wanted.has(view.id)) removeView(view);
  const created = [];
  for (const id of wanted) {
    let view = stage.views.get(id);
    if (!view) {
      view = createView(id);
      created.push(view);
    }
    if (view.version !== stage.version) placeView(view);
  }
  if (created.length) {
    for (const view of created) renderViewOverlay(view);
    updateCropOverlays();
  }
  scheduleRenders();
}
function blankCanvas(label = '') {
  const canvas = document.createElement('canvas');
  canvas.className = 'page-canvas';
  canvas.width = 1;
  canvas.height = 1;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label);
  return canvas;
}
function createView(id) {
  const stage = ui.stage,
    el = document.createElement('div'),
    canvas = blankCanvas(),
    svg = document.createElementNS(SVG_NS, 'svg'),
    crop = document.createElement('div'),
    layer = document.createElement('div');
  el.className = 'page-view blank render-pending';
  el.dataset.viewId = id;
  svg.classList.add('page-overlay');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('preserveAspectRatio', 'none');
  crop.className = 'crop-overlay';
  crop.hidden = true;
  crop.setAttribute('aria-hidden', 'true');
  crop.innerHTML = '<span>Keep this area</span>';
  layer.className = 'edit-layer';
  const fields = document.createElement('div');
  fields.className = 'form-layer';
  fields.hidden = true;
  el.append(canvas, svg, crop, layer, fields);
  const view = {
    id,
    el,
    canvas,
    svg,
    crop,
    layer,
    fields,
    key: null,
    pageKey: null,
    task: null,
    overlay: null,
  };
  view.version = -1;
  // Until the page is drawn, its thumbnail from the page strip stands in for it.
  const pageKey = renderKey(pageById(id)),
    thumb = ui.thumbs.cache.get(thumbKey(pageById(id)));
  if (thumb?.width > 1) {
    canvas.width = thumb.width;
    canvas.height = thumb.height;
    canvas.getContext('2d').drawImage(thumb, 0, 0);
    view.pageKey = pageKey;
    el.classList.remove('blank');
  }
  // In page order among the pages shown, without moving them (that would end a drag or move focus).
  const index = stage.byId.get(id).index;
  let next = null;
  for (const other of stage.views.values()) {
    const otherIndex = stage.byId.get(other.id)?.index ?? -1;
    if (otherIndex > index && (!next || otherIndex < stage.byId.get(next.id).index)) next = other;
  }
  $('#page-stack').insertBefore(el, next?.el || null);
  stage.views.set(id, view);
  return view;
}
function removeView(view, { release = true } = {}) {
  const stage = ui.stage,
    editor = $('#inline-editor');
  view.task?.cancel();
  if (view.el.contains(editor)) $('#page-stack').append(editor);
  view.el.remove();
  releaseCanvas(view.canvas);
  stage.views.delete(view.id);
  const page = release && pageById(view.id);
  if (page) releasePage(state, page);
}
/** After pages move, put their elements in page order, so the keyboard reaches their items in order. */
function orderViews() {
  const stage = ui.stage,
    stack = $('#page-stack'),
    views = [...stage.views.values()].sort(
      (a, b) => (stage.byId.get(a.id)?.index ?? 0) - (stage.byId.get(b.id)?.index ?? 0),
    ),
    present = [...stack.children].filter((node) => node.classList.contains('page-view'));
  if (views.every((view, index) => present[index] === view.el)) return;
  // Moving an element takes keyboard focus from inside it: put focus back.
  const focused = document.activeElement,
    selection = focused?.selectionStart !== undefined ? [focused.selectionStart, focused.selectionEnd] : null;
  stack.append(...views.map((view) => view.el));
  if (focused?.isConnected && document.activeElement !== focused) {
    focused.focus({ preventScroll: true });
    if (selection) focused.setSelectionRange(...selection);
  }
}
/** What a page's canvas should hold: the page's content, at the screen's resolution. */
function wantedRender(entry) {
  const descriptor = state.pages[entry.index],
    pageKey = renderKey(descriptor),
    // With Fill form open the page is drawn without its fields (inputs take their place).
    forms = fillingForm(descriptor),
    values = forms ? 'inputs' : formKey(state, descriptor),
    { width, height } = entry.geometry;
  // Very large pages at high zoom are drawn at a little less than the screen's resolution.
  const scale = Math.min(
    entry.scale * Math.min(devicePixelRatio || 1, 2),
    Math.sqrt(MAX_PAGE_PIXELS / (width * height)),
  );
  return { descriptor, pageKey, forms, scale, key: pageKey + '|' + values + '@' + scale.toFixed(4) };
}
function pageLabel(id, index) {
  return (
    'Page ' +
    (index + 1) +
    ' of ' +
    state.pages.length +
    (ui.tool === 'delete' && ui.selected.has(id) ? ', marked for deletion' : '')
  );
}
/** Size and place a page's element, and mark what it shows. */
function placeView(view) {
  const entry = ui.stage.byId.get(view.id),
    style = view.el.style;
  view.version = ui.stage.version;
  style.top = entry.top + 'px';
  style.left = entry.left + 'px';
  style.width = entry.width + 'px';
  style.height = entry.height + 'px';
  view.el.dataset.number = entry.index + 1;
  view.el.classList.toggle('current', view.id === ui.activeId);
  markView(view, entry.index);
  // The page was turned or cropped: never show its old image under the new edits.
  const wanted = wantedRender(entry);
  if (view.pageKey && view.pageKey !== wanted.pageKey) {
    view.task?.cancel();
    const canvas = blankCanvas(view.canvas.getAttribute('aria-label'));
    view.canvas.replaceWith(canvas);
    releaseCanvas(view.canvas);
    Object.assign(view, { canvas, pageKey: null, key: null });
    view.el.classList.add('blank');
  }
  view.el.classList.toggle('render-pending', view.key !== wanted.key);
}
export function markView(view, index = pageIndexOf(view.id)) {
  view.el.classList.toggle('marked-delete', ui.tool === 'delete' && ui.selected.has(view.id));
  view.canvas.setAttribute('aria-label', pageLabel(view.id, index));
}
/** Draw pages whose canvas is missing or out of date, nearest the middle of the view first, one at a time. */
function scheduleRenders(delay = 0) {
  const stage = ui.stage,
    drawing = stage.drawing;
  // A page out of view gives way to a page in view (when scrolling fast through a long document).
  if (drawing?.task && !inView(drawing)) {
    const next = nextRender();
    if (next && inView(next.view)) drawing.task.cancel();
  }
  clearTimeout(stage.renderTimer);
  stage.renderTimer = setTimeout(
    () => void pumpRenders(),
    Math.max(delay, stage.holdUntil - performance.now(), 0),
  );
}
async function pumpRenders() {
  const stage = ui.stage;
  if (stage.rendering) return;
  stage.rendering = true;
  try {
    for (let next = nextRender(); next; next = nextRender()) await renderView(next.view, next.wanted);
  } finally {
    stage.rendering = false;
  }
  // Zooming holds new renders back until it pauses.
  if (performance.now() < stage.holdUntil) scheduleRenders();
}
function nextRender() {
  const stage = ui.stage,
    scroll = $('#canvas-scroll');
  if ($('#workspace').hidden || performance.now() < stage.holdUntil) return null;
  const top = scroll.scrollTop,
    bottom = top + scroll.clientHeight,
    middle = top + scroll.clientHeight / 2;
  let best = null,
    bestDistance = Infinity;
  for (const view of stage.views.values()) {
    const entry = stage.byId.get(view.id);
    if (!entry) continue;
    const wanted = wantedRender(entry);
    if (view.key === wanted.key || stage.failed.has(wanted.key)) continue;
    // Pages in view first, then the nearest.
    const away = Math.max(0, entry.top - bottom, top - entry.top - entry.height),
      distance = away * 1e6 + Math.abs(entry.top + entry.height / 2 - middle);
    if (distance < bestDistance) {
      best = { view, wanted };
      bestDistance = distance;
    }
  }
  return best;
}
export function inView(view) {
  const entry = ui.stage.byId.get(view.id),
    scroll = $('#canvas-scroll');
  return (
    Boolean(entry) &&
    entry.top < scroll.scrollTop + scroll.clientHeight &&
    entry.top + entry.height > scroll.scrollTop
  );
}
async function renderView(view, wanted) {
  const stage = ui.stage,
    task = renderPage(state, wanted.descriptor, wanted.scale, { forms: wanted.forms });
  view.task = task;
  stage.drawing = view;
  let canvas;
  try {
    canvas = await task.promise;
  } catch (error) {
    if (error?.name !== 'RenderingCancelledException') {
      stage.failed.add(wanted.key);
      view.el.classList.remove('render-pending');
      if (stage.views.get(view.id) === view)
        toast('Could not preview page ' + (pageIndexOf(view.id) + 1) + '. ' + friendly(error), true);
    }
    return;
  } finally {
    if (view.task === task) view.task = null;
    if (stage.drawing === view) stage.drawing = null;
  }
  const entry = stage.byId.get(view.id);
  // The page left the view, or was turned or cropped, while it was drawn.
  if (stage.views.get(view.id) !== view || !entry || wantedRender(entry).pageKey !== wanted.pageKey) {
    releaseCanvas(canvas);
    return;
  }
  canvas.className = 'page-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', view.canvas.getAttribute('aria-label') || '');
  view.canvas.replaceWith(canvas);
  releaseCanvas(view.canvas);
  Object.assign(view, { canvas, key: wanted.key, pageKey: wanted.pageKey });
  view.el.classList.remove('blank');
  // Drawn at an earlier zoom, the image stands in until the page is drawn again.
  view.el.classList.toggle('render-pending', wantedRender(entry).key !== view.key);
}
/**
 * Change the zoom, keeping a point of the view (the middle of its top edge, or
 * the pointer) in place. The buttons and the wheel stop at 300% and at Fit on
 * their way across it; zooming to a form field (form-ui.js) may go further.
 */
export function setZoom(zoom, at = null, { max = 3, across = false } = {}) {
  zoom = clamp(zoom, 0.5, max);
  if (!across && (ui.zoom - 1) * (zoom - 1) < 0) zoom = 1;
  if (Math.abs(zoom - ui.zoom) < 0.0001 || !state.pages.length) return;
  const point = at || readingPoint(),
    position = positionAt(point.x, point.y);
  ui.zoom = zoom;
  // While zooming continues (a pinch or the wheel), pages are scaled and drawn again once it pauses.
  ui.stage.holdUntil = at ? performance.now() + 200 : 0;
  renderStage({ position });
}
export function scheduleOverlays() {
  if (ui.frame) return;
  ui.frame = requestAnimationFrame(() => {
    ui.frame = 0;
    if ($('#workspace').hidden || !state.pages.length) return;
    renderOverlays();
    refreshThumbOverlays();
  });
}
/** Draw the edits on every page shown. */
export function renderOverlays() {
  if (!state.pages.length) return;
  for (const view of ui.stage.views.values()) renderViewOverlay(view);
  if (ui.tool === 'form') updateFormSummary();
  // The panel shows the selected item's settings, its size among them: they follow
  // what was done to the item on the page (a drag, a key, Undo). A field that is
  // being typed in keeps what is typed.
  if (ui.item) fillForm();
  // So does its list of the items on this page, which names a text by its words.
  refreshAnnotationList();
  positionInlineEditor();
  updateProblems(currentOverlay()?.problems || []);
  updateStageHint();
}
export function renderViewOverlay(view) {
  const index = pageIndexOf(view.id);
  if (index < 0) return;
  const overlay = pageOverlay(state, index, { hide: ui.editing ? new Set([ui.editing]) : null });
  view.overlay = overlay;
  view.svg.setAttribute('viewBox', '0 0 ' + overlay.geometry.width + ' ' + overlay.geometry.height);
  view.svg.innerHTML = overlay.markup;
  renderEditLayer(view);
  renderFormLayer(view);
}
export function currentOverlay() {
  return ui.stage.views.get(ui.activeId)?.overlay || null;
}
/** An item's frame and placement on its page, from the page's drawn edits (worked out if the page is not shown). */
export function overlayItem(id) {
  const annotation = annotationById(id);
  if (!annotation) return null;
  let overlay = ui.stage.views.get(annotation.pageId)?.overlay;
  if (!overlay) {
    const index = pageIndexOf(annotation.pageId);
    if (index < 0) return null;
    overlay = pageOverlay(state, index);
  }
  return overlay.items.find((item) => item.id === id) || null;
}
/** CSS transform placing an element over a frame given in an item's placement view. */
export function frameTransform(item, frame, scale, extra = '') {
  const [a, b, c, d, e, f] = item.matrix;
  const tx = (a * frame.x + c * frame.y + e) * scale,
    ty = (b * frame.x + d * frame.y + f) * scale;
  return (
    'matrix(' + [a, b, c, d, tx, ty].map((value) => Math.round(value * 1000) / 1000).join(',') + ')' + extra
  );
}
export function itemLabel(annotation) {
  if (annotation.type === 'text') {
    const text = textValue(annotation.text).trim().replace(/\s+/g, ' ');
    return 'Text: ' + (text ? '“' + (text.length > 40 ? text.slice(0, 40) + '…' : text) + '”' : 'empty');
  }
  if (annotation.type === 'drawing')
    return (
      { line: 'Line', arrow: 'Arrow', rect: 'Rectangle', ellipse: 'Ellipse' }[annotation.shape] || 'Drawing'
    );
  return { image: 'Image', signature: 'Signature' }[annotation.type] || 'Highlight';
}
export function renderEditLayers() {
  for (const view of ui.stage.views.values()) renderEditLayer(view);
}
function renderEditLayer(view) {
  const layer = view.layer,
    interactive = ANNOTATION_TOOLS.includes(ui.tool),
    scale = ui.stage.byId.get(view.id)?.scale || ui.stage.scale;
  layer.classList.toggle('interactive', interactive);
  const items = interactive ? (view.overlay?.items || []).filter((item) => item.frame) : [];
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
export function focusItem(id) {
  const node = $('[data-item-id="' + CSS.escape(id) + '"]');
  if (node) node.focus({ preventScroll: true });
  else $('#canvas-scroll').focus({ preventScroll: true });
}
/**
 * Scroll the view just enough to show an element on a page (an item added with
 * a button may be out of view). `upper`: an element in the lower half comes up
 * to the top third, leaving room for a phone's keyboard below it.
 */
export function revealElement(node, { upper = false } = {}) {
  const scroll = $('#canvas-scroll');
  if (!node?.isConnected) return;
  const area = scroll.getBoundingClientRect(),
    rect = node.getBoundingClientRect(),
    margin = 24,
    top = area.top + scroll.clientTop,
    left = area.left + scroll.clientLeft,
    bottom = top + scroll.clientHeight,
    right = left + scroll.clientWidth;
  let dx = 0,
    dy = 0;
  if (rect.top < top + margin) dy = rect.top - top - margin;
  else if (rect.bottom > bottom - margin)
    dy = Math.min(rect.bottom - bottom + margin, rect.top - top - margin);
  if (rect.left < left + margin) dx = rect.left - left - margin;
  else if (rect.right > right - margin) dx = Math.min(rect.right - right + margin, rect.left - left - margin);
  if (upper && rect.top > top + scroll.clientHeight / 2) dy = rect.top - top - scroll.clientHeight / 3;
  if (!dx && !dy) return;
  scroll.scrollTop += dy;
  scroll.scrollLeft += dx;
  lockCurrentPage();
}
export function revealItem(id) {
  requestAnimationFrame(() => revealElement($('[data-item-id="' + CSS.escape(id) + '"]')));
}
/** Show which page is current: in the counter and the page strip, and in the tools that work on "this page". */
export function updateCurrentPage() {
  if (!state.pages.length) return;
  const id = ui.activeId,
    index = activeIndex();
  const previous = $('.page-item.active');
  if (previous?.dataset.pageId !== id) {
    if (previous) {
      previous.classList.remove('active');
      $('.page-thumb', previous).removeAttribute('aria-current');
    }
    const item = $('.page-item[data-page-id="' + CSS.escape(id) + '"]');
    if (item) {
      item.classList.add('active');
      $('.page-thumb', item).setAttribute('aria-current', 'page');
    }
  }
  revealThumbnail(id);
  for (const view of ui.stage.views.values()) view.el.classList.toggle('current', view.id === id);
  syncPageNavigation();
  updateSelectionCaption();
  for (const node of $$('#tool-panel [data-current-page]')) node.textContent = index + 1;
  const option = $('#tool-form [name="pictureScope"] option[value="current"]');
  if (option) option.textContent = 'Current page (' + (index + 1) + ')';
  const earlier = $('#tool-form [data-action="move-earlier"]'),
    later = $('#tool-form [data-action="move-later"]');
  // At the first or the last page they are unavailable, not disabled: focus stays
  // on the button that reached the end, and pressing it again does nothing.
  for (const [button, reached] of [
    [earlier, index === 0],
    [later, index === state.pages.length - 1],
  ]) {
    if (reached) button?.setAttribute('aria-disabled', 'true');
    else button?.removeAttribute('aria-disabled');
  }
  refreshAnnotationList();
  updateCropOverlays();
  updateProblems(currentOverlay()?.problems || []);
  updateStageHint();
}
/** The panel's list of the items on the current page. */
function refreshAnnotationList() {
  const panel = $('#tool-panel'),
    old = $('.annotation-list', panel),
    markup = annotationList();
  if (!old && !markup) return;
  const restore = old?.contains(document.activeElement) ? focusKey() : null,
    holder = document.createElement('div');
  holder.innerHTML = markup;
  const next = holder.firstElementChild;
  // Left alone while it says the same: this runs with every redraw of the page.
  if (old && next && old.isEqualNode(next)) return;
  if (old && next) old.replaceWith(next);
  else if (old) old.remove();
  else panel.append(next);
  if (restore) restoreFocus(restore);
}
export function updateProblems(problems) {
  const node = $('#panel-problems');
  if (!node) return;
  const messages = [...new Set(problems.map((problem) => problem.message))];
  const text = messages.join(' ');
  if (node.dataset.text === text) return;
  node.dataset.text = text;
  node.hidden = !messages.length;
  node.innerHTML = messages.map((message) => '<p>' + icon('help') + safe(message) + '</p>').join('');
}
export function updateStageHint() {
  const status = $('#preview-status');
  const problems = currentOverlay()?.problems || [];
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
  if (ui.tool === 'draw')
    hint = selectedItem()
      ? 'Drag the drawing to move it. Drag a handle to resize it.'
      : 'Drag on the page to draw.';
  if (ui.tool === 'signature')
    hint = selectedItem()
      ? 'Drag the signature to move it. Drag a corner to resize it.'
      : ui.signature
        ? 'Click the page where your signature belongs.'
        : 'Make your signature in the panel, then click the page to place it.';
  if (ui.tool === 'crop') hint = 'Drag across the page to choose the area to keep.';
  if (ui.tool === 'form')
    hint = !documentFields().length
      ? 'This PDF has no form fields to fill in.'
      : phone()
        ? 'Tap a field to fill it in. The page zooms to it; Fit shows it whole.'
        : 'Click a field to fill it in. Tab moves to the next one.';
  if (ui.tool === 'pages' || ui.tool === 'delete')
    hint = 'Choose pages with the checkboxes in the page strip.';
  if (problems.length) hint = 'Check this page: ' + problems[0].message;
  status.classList.toggle('warning', problems.length > 0);
  status.innerHTML = icon(problems.length ? 'help' : 'check') + safe(tapOrClick(hint));
}
export function updateSelectionCaption() {
  if (!state.pages.length) return;
  $('#selection-caption').textContent =
    'Page ' + (activeIndex() + 1) + ' · ' + ui.selected.size + ' selected';
}
