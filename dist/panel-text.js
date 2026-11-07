/**
 * The Add text, Add an image and Highlight panels: the selected item's settings,
 * or the next item's. (tool-panel.js describes the panel interface.)
 */

import { hexColor, number } from './layout.js';
import { warmFont } from './preview.js';
import { icon, safe, ui } from './editor-core.js';
import { overlayItem } from './page-view.js';
import { inlineEditor } from './page-items.js';
import { change } from './history.js';
import { alignField, colorField, makeField, numberField, rangeField, resizeImageTo } from './tool-panel.js';

export function title(item) {
  if (item?.type === 'text') return 'Edit text';
  if (item?.type === 'image') return 'Edit image';
  if (item?.type === 'highlight') return 'Edit highlight';
  return null;
}
export function fields(item, index) {
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
        'Add text to page <span data-current-page>' +
        (index + 1) +
        '</span>' +
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
            'Add it to page <span data-current-page>' +
            (index + 1) +
            '</span>' +
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
            'Add a highlight to page <span data-current-page>' +
            (index + 1) +
            '</span>' +
            '</button>')
      );
  }
  return '';
}
export function values(item) {
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
  }
  return {};
}
export function onInput(name, value, field, item) {
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
  }
}
