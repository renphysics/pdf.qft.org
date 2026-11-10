/**
 * The Draw panel: the shape to draw with, its colour and line width, and the
 * selected drawing's. (tool-panel.js describes the panel interface.)
 */

import { hexColor, number } from './layout.js';
import { icon, ui } from './editor-core.js';
import { deselect } from './page-items.js';
import { change } from './history.js';
import { colorField, rangeField, renderTool, selectField } from './tool-panel.js';

const SHAPES = [
  ['pen', 'Pen', 'drawing', 'a drawing'],
  ['line', 'Line', 'line', 'a line'],
  ['arrow', 'Arrow', 'arrow', 'an arrow'],
  ['rect', 'Rectangle', 'rectangle', 'a rectangle'],
  ['ellipse', 'Ellipse', 'ellipse', 'an ellipse'],
];
function drawFields(item, index) {
  const drawing = item?.type === 'drawing' ? item : null,
    shape = SHAPES.find(([value]) => value === (drawing?.shape || ui.styles.draw.shape)) || SHAPES[0],
    next = SHAPES.find(([value]) => value === ui.styles.draw.shape) || SHAPES[0];
  return (
    // Always shown: choosing a shape ends a selection, ready to draw.
    selectField(
      'Draw with',
      'shape',
      SHAPES.map(([value, label]) => [value, label]),
      true,
    ) +
    '<div class="field-row">' +
    colorField() +
    rangeField('Line width', 'width', 1, 16, ' pt') +
    '</div>' +
    (drawing
      ? '<p class="field-hint wide">Drag it to move it, or a handle to resize it. Arrow keys nudge it.</p>' +
        '<button type="button" class="button danger" data-action="delete-item">' +
        icon('trash') +
        'Delete ' +
        shape[2] +
        '</button>'
      : next[0] === 'pen'
        ? '<p class="field-hint wide">Draw on the page with a mouse, a pen or a finger. On a touch screen, two fingers scroll.</p>'
        : '<button type="button" class="button secondary" data-action="add-drawing">' +
          icon('plus') +
          'Add ' +
          next[3] +
          ' to page <span data-current-page>' +
          (index + 1) +
          '</span></button>')
  );
}
export function fields(item, index) {
  return drawFields(item, index);
}
export function values(item) {
  const source = item?.type === 'drawing' ? { color: item.color, width: item.strokeWidth } : ui.styles.draw;
  return {
    shape: ui.styles.draw.shape,
    color: hexColor(source.color, '#d0342c'),
    width: Math.round(number(source.width, 2, 1, 16)),
  };
}
export function onInput(name, value, field, item) {
  if (name === 'shape') {
    ui.styles.draw.shape = value;
    if (item) deselect();
    renderTool();
    return;
  }
  const parsed = name === 'width' ? Number(value) : value;
  if (name !== 'width' && name !== 'color') return;
  ui.styles.draw[name] = parsed;
  if (item?.type === 'drawing')
    change(() => (item[name === 'width' ? 'strokeWidth' : 'color'] = parsed), {
      key: name + ':' + item.id,
      label: 'Edit drawing',
    });
}
