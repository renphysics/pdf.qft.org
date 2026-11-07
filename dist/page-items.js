/**
 * Items on the page: typing text in place, selecting, moving and resizing
 * items with the pointer and the keyboard, and dragging a crop area.
 * initPageItems() adds their listeners to the page stack.
 */

import { applyMatrix, fontKind, hexColor, invert, number, TEXT_LINE_HEIGHT, textValue } from './layout.js';
import { FONT_FAMILIES, geometryOf, warmFont } from './preview.js';
import {
  $,
  ANNOTATION_TOOLS,
  annotationById,
  announceMessage,
  clamp,
  currentPage,
  friendly,
  phone,
  state,
  toast,
  ui,
  uid,
} from './editor-core.js';
import {
  focusItem,
  frameTransform,
  itemLabel,
  overlayItem,
  pageById,
  renderEditLayers,
  renderOverlays,
  renderViewOverlay,
  revealElement,
  revealItem,
  setCurrentPage,
  syncViews,
  updateStageHint,
} from './page-view.js';
import { fillForm, placeSignature, renderTool, updateCropOverlays } from './tool-panel.js';
import { chooseTool, refreshThumbOverlays, setSheet } from './pages.js';
import { change, documentChanged, record } from './history.js';
import { recordView } from './views.js';

// ---- Typing on the page ---------------------------------------------------------

export const baselines = new Map();
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
  if (annotation.pageId !== ui.activeId) setCurrentPage(annotation.pageId);
  // The editor sits on the text's page, which stays shown while it is typed in.
  syncViews();
  const editor = $('#inline-editor'),
    view = ui.stage.views.get(annotation.pageId);
  if (view && editor.parentElement !== view.el) view.el.append(editor);
  editor.value = textValue(annotation.text);
  editor.hidden = false;
  renderOverlays();
  renderTool();
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(editor.value.length, editor.value.length);
  revealElement(editor);
}
export function positionInlineEditor() {
  const editor = $('#inline-editor');
  const item = ui.editing ? overlayItem(ui.editing) : null;
  if (!item?.frame) {
    if (!ui.editing) editor.hidden = true;
    return;
  }
  const annotation = item.annotation,
    scale = ui.stage.byId.get(annotation.pageId)?.scale || ui.stage.scale,
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
export function stopEditing() {
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
  renderOverlays();
  refreshThumbOverlays();
  if (removed) renderTool();
  if (hadFocus) focusItem(id);
}
/** Add a text box at a point on a page (in points from its top-left corner) and start typing in it. */
export function createText(page, point) {
  const geometry = geometryOf(state, page),
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

/** A pointer position on a page, in points from its top-left corner. */
function pagePoint(event, view) {
  const rect = view.el.getBoundingClientRect(),
    scale = ui.stage.byId.get(view.id)?.scale || ui.stage.scale;
  return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
}
export function setFrame(annotation, item, frame) {
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
  const page = pageById(gesture.pageId),
    geometry = geometryOf(state, page);
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
/** Add a highlight at a spot on a page (keyboard and touch alternative to drawing). */
export function addHighlight(page, point) {
  const geometry = geometryOf(state, page);
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
/** Draw: a pen stroke follows the pointer; other shapes stretch from where the drag started. */
function sketch(gesture, point) {
  const page = pageById(gesture.pageId);
  if (!page) return;
  const geometry = geometryOf(state, page),
    style = ui.styles.draw,
    inside = ({ x, y }) => ({ x: clamp(x, 0, geometry.width), y: clamp(y, 0, geometry.height) }),
    end = inside(point);
  gesture.shape ||= style.shape;
  if (gesture.shape === 'pen') {
    gesture.points ||= [inside(gesture.start)];
    const last = gesture.points.at(-1),
      scale = ui.stage.byId.get(gesture.pageId)?.scale || 1;
    // Points two screen pixels apart make a smooth line.
    if (Math.hypot(end.x - last.x, end.y - last.y) * scale < 2) return;
    gesture.points.push(end);
  } else gesture.points = [inside(gesture.start), end];
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const { x, y } of gesture.points) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  // A straight line has no height (or width): its box gets a little.
  const width = Math.max(right - left, 0.5),
    height = Math.max(bottom - top, 0.5),
    fraction = (value) => Math.round(value * 1e4) / 1e4;
  const fields = {
    x: left / geometry.width,
    y: top / geometry.height,
    width: width / geometry.width,
    height: height / geometry.height,
  };
  if (gesture.shape !== 'rect' && gesture.shape !== 'ellipse')
    fields.points = gesture.points.map(({ x, y }) => [
      fraction((x - left) / width),
      fraction((y - top) / height),
    ]);
  if (!gesture.id) {
    gesture.id = uid();
    const annotation = {
      id: gesture.id,
      pageId: page.id,
      pageRotation: page.rotation,
      pageCrop: page.crop ? { ...page.crop } : undefined,
      type: 'drawing',
      shape: gesture.shape,
      color: style.color,
      strokeWidth: style.width,
      ...fields,
    };
    change(() => state.annotations.push(annotation), { key: gesture.key });
    return;
  }
  const annotation = annotationById(gesture.id);
  if (annotation) change(() => Object.assign(annotation, fields), { key: gesture.key });
}
/** Add a line, arrow, rectangle or ellipse to a page (keyboard and touch alternative to dragging). */
export function addDrawing(page) {
  const style = ui.styles.draw,
    shape = style.shape === 'pen' ? 'line' : style.shape,
    straight = shape === 'line' || shape === 'arrow';
  const annotation = {
    id: uid(),
    pageId: page.id,
    pageRotation: page.rotation,
    pageCrop: page.crop ? { ...page.crop } : undefined,
    type: 'drawing',
    shape,
    color: style.color,
    strokeWidth: style.width,
    x: 0.3,
    y: 0.2,
    width: 0.4,
    height: straight ? 0.1 : 0.15,
    ...(straight
      ? {
          points: [
            [0, 1],
            [1, 0],
          ],
        }
      : {}),
  };
  change(() => state.annotations.push(annotation));
  selectItem(annotation.id);
}
export function placeImage(image, point = null) {
  const page = currentPage(),
    geometry = geometryOf(state, page);
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
export function deleteItem(id) {
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
/** Select an item; its page becomes current. `reveal` scrolls it into view (chosen from a list, it may be out of view). */
export function selectItem(id, { focus = true, reveal = false } = {}) {
  const annotation = annotationById(id);
  if (!annotation) return;
  if (ui.editing && ui.editing !== id) stopEditing();
  // Each item belongs to the tool named after its type; drawings belong to Draw.
  const tool = annotation.type === 'drawing' ? 'draw' : annotation.type;
  const changedTool = ui.tool !== tool;
  ui.item = id;
  if (changedTool) {
    ui.tool = tool;
    $('#page-stack').dataset.tool = ui.tool;
    recordView('editor');
  }
  if (annotation.pageId !== ui.activeId) setCurrentPage(annotation.pageId);
  // A new item is drawn now (not at the next frame), so that it can take focus.
  const view = ui.stage.views.get(annotation.pageId);
  if (view && !view.overlay?.items.some((item) => item.id === id)) renderViewOverlay(view);
  renderTool();
  renderEditLayers();
  updateStageHint();
  if (focus) focusItem(id);
  if (reveal) revealItem(id);
}
export function deselect() {
  stopEditing();
  if (!ui.item) return;
  ui.item = null;
  renderTool();
  renderEditLayers();
  updateStageHint();
}
export function endGesture() {
  const gesture = ui.gesture;
  ui.gesture = null;
  const target = gesture?.view?.el;
  if (target?.hasPointerCapture(gesture.pointerId)) target.releasePointerCapture(gesture.pointerId);
  $('#page-stack').classList.remove('dragging');
}

// Pages are worked on where they are: pointer events reach the stack from every page.
export const stack = $('#page-stack');
export const inlineEditor = $('#inline-editor');

// ---- Crop drag ---------------------------------------------------------------------

function cropPoint(event, rect) {
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  };
}
function startCropDrag(event, view) {
  ui.gesture = {
    type: 'crop',
    start: cropPoint(event, view.el.getBoundingClientRect()),
    view,
    pageId: view.id,
    pointerId: event.pointerId,
  };
  view.el.setPointerCapture(event.pointerId);
  event.preventDefault();
}
function endCropDrag(event) {
  if (ui.gesture?.type !== 'crop' || event.pointerId !== ui.gesture.pointerId) return;
  endGesture();
  updateCropOverlays();
}

/** Listen for input on the page stack (called once, by app.js). */
export function initPageItems() {
  stack.addEventListener('pointerdown', (event) => {
    const node = event.target.closest('.page-view'),
      view = node && ui.stage.views.get(node.dataset.viewId);
    if (
      ui.busy ||
      event.button !== 0 ||
      !view ||
      !pageById(view.id) ||
      event.target.closest('#inline-editor')
    )
      return;
    // The page you work on becomes the current page.
    setCurrentPage(view.id);
    if (ui.tool === 'crop') {
      startCropDrag(event, view);
      return;
    }
    if (!ANNOTATION_TOOLS.includes(ui.tool)) return;
    const handle = event.target.closest('[data-handle]'),
      point = pagePoint(event, view);
    let box = event.target.closest('[data-item-id]');
    // Draw: a stroke may start over another drawing; a tap on one selects it (pointerup).
    const under =
      ui.tool === 'draw' &&
      box &&
      !handle &&
      box.dataset.itemId !== ui.item &&
      annotationById(box.dataset.itemId)?.type === 'drawing'
        ? box.dataset.itemId
        : null;
    if (under) box = null;
    const wasEditing = Boolean(ui.editing),
      wasSelected = box && box.dataset.itemId === ui.item;
    // Typing ends with a tap elsewhere (see pointerup), not when a finger starts to scroll.
    if (ui.editing && box && box.dataset.itemId !== ui.editing) stopEditing();
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
        type: ui.tool === 'highlight' ? 'draw' : ui.tool === 'draw' ? 'sketch' : 'tap',
        wasEditing,
        hadSelection: Boolean(ui.item),
        under,
      };
    }
    Object.assign(ui.gesture, {
      pointerId: event.pointerId,
      start: point,
      key: 'gesture:' + uid(),
      moved: false,
      view,
      pageId: view.id,
    });
    node.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  stack.addEventListener('pointermove', (event) => {
    const gesture = ui.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId || gesture.type === 'crop') return;
    const point = pagePoint(event, gesture.view);
    if (!gesture.moved) {
      const distance =
        Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) *
        (ui.stage.byId.get(gesture.pageId)?.scale || 1);
      if (distance < 4) return;
      gesture.moved = true;
      stack.classList.add('dragging');
    }
    if (gesture.type === 'move' && gesture.item?.frame) moveItem(gesture, point);
    if (gesture.type === 'resize' && gesture.item?.frame) resizeItem(gesture, point);
    if (gesture.type === 'draw') drawHighlight(gesture, point);
    if (gesture.type === 'sketch') sketch(gesture, point);
  });
  stack.addEventListener('pointerup', (event) => {
    const gesture = ui.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId || gesture.type === 'crop') return;
    endGesture();
    if (gesture.moved) {
      if (gesture.type === 'draw' && gesture.id) selectItem(gesture.id);
      // A new shape is selected, to adjust it; pen strokes are not, so writing goes on.
      else if (gesture.type === 'sketch' && gesture.id) {
        if (gesture.shape === 'pen') deselect();
        else selectItem(gesture.id);
      } else if (gesture.id) focusItem(gesture.id);
      renderTool();
      return;
    }
    if (gesture.under) {
      selectItem(gesture.under, { focus: true });
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
    const page = pageById(gesture.pageId);
    if (!page) return;
    if (ui.tool === 'text') createText(page, gesture.start);
    if (ui.tool === 'highlight') addHighlight(page, gesture.start);
    if (ui.tool === 'signature') placeSignature(gesture.start, page);
  });
  stack.addEventListener('pointercancel', (event) => {
    // The browser took over the touch (to scroll or zoom): nothing is added.
    if (ui.gesture?.pointerId === event.pointerId && ui.gesture.type !== 'crop') endGesture();
  });
  stack.addEventListener('dblclick', (event) => {
    const box = event.target.closest('[data-item-id]');
    if (box && annotationById(box.dataset.itemId)?.type === 'text') startEditing(box.dataset.itemId);
  });
  stack.addEventListener('focusin', (event) => {
    const box = event.target.closest('[data-item-id]');
    if (box && box.dataset.itemId !== ui.item) selectItem(box.dataset.itemId, { focus: false });
  });
  stack.addEventListener('keydown', (event) => {
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
    renderOverlays();
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
  stack.addEventListener('pointermove', (event) => {
    const gesture = ui.gesture;
    if (gesture?.type !== 'crop' || event.pointerId !== gesture.pointerId) return;
    const end = cropPoint(event, gesture.view.el.getBoundingClientRect()),
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
    updateCropOverlays();
  });
  stack.addEventListener('pointerup', endCropDrag);
  stack.addEventListener('pointercancel', endCropDrag);
}

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
