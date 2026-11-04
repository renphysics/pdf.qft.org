/**
 * Pages: choosing a page and a tool, the page strip (thumbnails), and moving,
 * turning, deleting and selecting pages.
 */

import { blankPdf, openPdf } from './pdf-engine.js';
import { formKey, geometryOf, pageOverlay, renderKey, renderPage } from './preview.js';
import {
  $,
  $$,
  annotationById,
  announceMessage,
  busy,
  currentPage,
  icon,
  names,
  pageIndexOf,
  phone,
  state,
  SVG_NS,
  THUMB_CACHE,
  THUMB_WIDTH,
  toast,
  ui,
  uid,
} from './editor-core.js';
import { renderEditLayers, renderStage, scrollToPage, updateCurrentPage } from './page-view.js';
import { sourceOf } from './form-ui.js';
import { endGesture, stopEditing } from './page-items.js';
import { renderTool, showSettingDefaults, updateDeletionMarks } from './tool-panel.js';
import { change, recordView } from './app.js';

// ---- Pages -------------------------------------------------------------------------

/**
 * Merging or removing pages of a PDF with form fields cannot be exported unless
 * the fields are flattened; say so before doing it.
 */
export function formProblem(pages) {
  if (state.flattenForms) return null;
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
    : 'This PDF has form fields, so its pages can’t be removed, extracted or combined with other files while the fields stay fillable. Turn on “Flatten fields on download” in Fill form, then try again.';
}
/** Splitting always takes a PDF's pages apart, so its fields must be flattened first. */
export function splitFormProblem() {
  return !state.flattenForms && state.pages.some((page) => sourceOf(page)?.hasForm)
    ? 'This PDF has form fields. To split it, turn on “Flatten fields on download” in Fill form.'
    : null;
}
export function movePage(id, offset, targetId = null) {
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
/** Add a blank page after the current one, the size and shape it shows at (one undo step). */
export async function insertBlankPage() {
  const page = currentPage();
  if (ui.busy || !page) return;
  const blank = { id: uid(), sourceId: uid(), index: 0, rotation: 0 };
  // A form's pages can be combined with others only once its fields are flattened.
  if (formProblem([...state.pages, blank]))
    throw new Error(
      'This PDF has form fields, so pages can’t be added while the fields stay fillable. Turn on “Flatten fields on download” in Fill form, then try again.',
    );
  const at = pageIndexOf(page.id) + 1;
  const { width, height } = geometryOf(state, page);
  stopEditing();
  busy(true, 'Adding a blank page…');
  try {
    const info = await openPdf(await blankPdf(width, height));
    const source = {
      id: blank.sourceId,
      bytes: info.bytes,
      name: 'Blank page',
      pageCount: 1,
      hasForm: false,
      pages: info.pages.map((sheet) => ({ box: sheet.cropBox, rotation: sheet.rotation })),
    };
    change(
      () => {
        state.sources.push(source);
        state.pages.splice(at, 0, blank);
      },
      { layout: true },
    );
  } finally {
    busy(false);
  }
  choosePage(blank.id);
  renderTool();
  toast('Blank page added as page ' + (at + 1) + '.');
}
export function selectedIds() {
  if (!ui.selected.size) throw new Error('Select one or more pages using the checkboxes in the page strip.');
  return new Set(ui.selected);
}
export function rotateSelected() {
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
export function deletePages() {
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
export function renderPages() {
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
        '</span></label></div><span class="delete-badge" hidden>Delete</span></div>',
    )
    .join('');
  updateDeletionMarks();
}
/** A thumbnail's cache key: the page's content and the form values it shows. */
export function thumbKey(descriptor) {
  return renderKey(descriptor) + '|' + formKey(state, descriptor);
}
export function rememberThumb(key, canvas) {
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
export function refreshThumbOverlays() {
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
export function renderThumbnails() {
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
          key = thumbKey(descriptor);
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
        if (visible.has(node)) {
          showThumb(node, canvas, geometry, pageIndexOf(node.dataset.pageOpen));
          node.dataset.key = key;
        }
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
/** Go to a page (from the page strip, the page number, or Previous and Next). */
export function choosePage(id) {
  if (ui.busy || !state.pages.some((page) => page.id === id)) return;
  stopEditing();
  endGesture();
  const deselected = Boolean(ui.item);
  ui.activeId = id;
  ui.item = null;
  scrollToPage(id);
  // An item's settings give way to the page's tools.
  if (deselected) {
    renderTool();
    renderEditLayers();
  }
  updateCurrentPage();
}
export function chooseTool(tool) {
  if (ui.busy || !names[tool]) return;
  stopEditing();
  endGesture();
  if (ui.item && annotationById(ui.item)?.type !== tool) ui.item = null;
  ui.tool = tool;
  showSettingDefaults();
  if (tool === 'crop') ui.cropDraft = { left: 0, top: 0, right: 0, bottom: 0, scope: ui.cropDraft.scope };
  if (phone()) setSheet(true);
  renderTool();
  renderStage();
  // The address follows the tool, so it can be bookmarked or shared.
  if (!$('#workspace').hidden) recordView('editor');
}
/** Phones: the tool panel is a sheet under the page that can be folded away. */
export function setSheet(open) {
  ui.sheetOpen = open;
  $('.tool-sidebar').classList.toggle('collapsed', !open);
  const toggle = $('#sheet-toggle');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Hide tool settings' : 'Show tool settings');
}
