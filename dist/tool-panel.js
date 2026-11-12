/**
 * The tool panel's frame: the field builders every panel uses, the panel
 * registry, renderTool() (the panel for the current tool) and fillForm() (its
 * values). Each tool's panel is a module, panel-*.js (Fill form's is form-ui.js),
 * exporting some of:
 *   fields(item, index)               the form's inner HTML (every panel)
 *   values(item)                      what fillForm writes into the fields
 *   onInput(name, value, field, item) a field changed (a checkbox's value is its checked state)
 *   onSubmit()                        the form's submit button, or Enter in a field
 *   afterRender()                     the panel is in the DOM (summaries, the signature pad)
 *   afterFill(values)                 after every fillForm (state only the panel shows)
 *   title(item)                       the heading with an item selected, else null
 * A module serving several tools reads ui.tool. The modules are imported as
 * namespaces, and the registry reads their functions only when a panel is
 * drawn, so the editor's import cycle never reaches one before it exists. A
 * panel module may run code as it loads only with what the leaf modules give
 * (editor-core.js, history.js, views.js, the libraries), as panel-settings.js
 * does to follow changes: anything else in the cycle may not exist yet.
 */

import {
  $,
  $$,
  activeIndex,
  ANNOTATION_TOOLS,
  descriptions,
  focusKey,
  icon,
  names,
  restoreFocus,
  safe,
  selectedItem,
  state,
  tapOrClick,
  toast,
  ui,
} from './editor-core.js';
import {
  currentOverlay,
  itemLabel,
  overlayItem,
  updateProblems,
  updateSelectionCaption,
  updateStageHint,
} from './page-view.js';
import { setFrame } from './page-items.js';
import { change } from './history.js';
import { updateCropOverlays } from './panel-crop.js';
import { updateDeletionMarks } from './panel-pages.js';
import * as text from './panel-text.js';
import * as draw from './panel-draw.js';
import * as settings from './panel-settings.js';
import * as pages from './panel-pages.js';
import * as crop from './panel-crop.js';
import * as margins from './panel-margins.js';
import * as sheets from './panel-sheets.js';
import * as split from './panel-split.js';
import * as protect from './panel-protect.js';
import * as signature from './panel-signature.js';
import * as convert from './panel-convert.js';
import * as properties from './panel-properties.js';
import * as form from './form-ui.js';

/** Each tool's panel module (tools with a tab in routes.js). */
const PANELS = {
  text,
  image: text,
  highlight: text,
  signature,
  form,
  properties,
  draw,
  watermark: settings,
  footer: settings,
  numbers: settings,
  pages,
  delete: pages,
  crop,
  margins,
  merge: pages,
  split,
  sheets,
  jpgtopdf: convert,
  pdftojpg: convert,
  protect,
  unlock: protect,
};
const panel = () => PANELS[ui.tool];

// ---- Field builders ------------------------------------------------------------------

export function makeField(label, input, wide = false) {
  return '<label class="field' + (wide ? ' wide' : '') + '"><span>' + label + '</span>' + input + '</label>';
}
export function textField(label, name, placeholder = '', wide = false) {
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
export function numberField(label, name, min, max, step = 1) {
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
export function colorField(name = 'color') {
  return makeField('Color', '<input name="' + name + '" type="color">');
}
/**
 * A slider. The label names it, so the value shown beside the label is kept out of
 * the name (a read-out element there would even take the label for itself and
 * leave the slider without one). The slider says its own value, with the unit:
 * updateOutputs() below.
 */
export function rangeField(label, name, min, max, unit = '%') {
  return makeField(
    label + ' <span data-for="' + name + '" aria-hidden="true"></span>',
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
export function selectField(label, name, options, wide = false) {
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
export function alignField() {
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
/** The link to Batch & presets under a tool's settings. */
export function batchLink(label = 'Use these settings in batch') {
  return (
    '<div class="reuse-settings wide"><button type="button" class="text-button" data-action="batch-from-editor">' +
    icon('batch') +
    label +
    '</button><p>Apply this tool to every page in separate PDFs, and save it as a preset.</p></div>'
  );
}
export function annotationList() {
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
          icon({ text: 'text', image: 'image', signature: 'sign', drawing: 'draw' }[a.type] || 'highlight') +
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

// ---- The panel ------------------------------------------------------------------------

/** Show current values in the panel without rebuilding it (the focused field keeps what is typed). */
export function fillForm({ all = false } = {}) {
  const form = $('#tool-form');
  if (!form) return;
  const current = panel(),
    values = current?.values?.(selectedItem()) ?? {};
  for (const input of $$('[name]', form)) {
    if (!(input.name in values) || (!all && input === document.activeElement)) continue;
    const value = values[input.name] ?? '';
    if (input.type === 'radio') input.checked = input.value === String(value);
    else if (input.type === 'checkbox') {
      if (typeof value === 'boolean') input.checked = value;
    } else if (input.value !== String(value)) input.value = value;
    input.removeAttribute('aria-invalid');
  }
  updateOutputs();
  current?.afterFill?.(values);
}
export function renderTool() {
  // The panel is rebuilt below; remember which control had keyboard focus.
  const restoreKey = !ui.busy && $('#tool-panel').contains(document.activeElement) ? focusKey() : null;
  $('#tool-select').value = ui.tool;
  $$('.tool-tabs [data-tool]').forEach((button) =>
    button.setAttribute('aria-pressed', String(button.dataset.tool === ui.tool)),
  );
  $('#workspace').dataset.tool = ui.tool;
  $('#sheet-title').textContent = names[ui.tool];
  const current = panel(),
    item = selectedItem(),
    index = activeIndex();
  $('#tool-panel').innerHTML =
    '<h2 tabindex="-1">' +
    (current?.title?.(item) || names[ui.tool]) +
    '</h2><p class="panel-description">' +
    tapOrClick(descriptions[ui.tool]) +
    '</p><div id="panel-problems" class="panel-problems" role="status" hidden></div><form id="tool-form" novalidate>' +
    (current?.fields(item, index) ?? '') +
    '</form>' +
    annotationList();
  const form = $('#tool-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    panel()?.onSubmit?.();
  });
  form.addEventListener('input', onPanelInput);
  form.addEventListener('change', (event) => {
    const field = event.target;
    if (field.type !== 'number' || field.checkValidity()) return;
    // A number left empty goes back to the value in use; one out of range is set
    // to the nearest value allowed, and used.
    const value = Number(field.value);
    if (field.value.trim() === '' || !Number.isFinite(value)) {
      fillForm({ all: true });
      return;
    }
    const min = Number(field.min),
      max = Number(field.max),
      step = Number(field.step) || 1,
      nearest = Number(
        Math.min(max, Math.max(min, min + Math.round((value - min) / step) * step)).toFixed(4),
      );
    field.value = String(nearest);
    onPanelInput({ target: field });
    const label = field.closest('label')?.querySelector('span')?.textContent || 'This number';
    toast('“' + label + '” can be ' + min + ' to ' + max + ', so it’s set to ' + nearest + '.');
  });
  fillForm({ all: true });
  updateProblems(currentOverlay()?.problems || []);
  // Crop outlines and deletion marks go when their tool is left.
  updateCropOverlays();
  updateDeletionMarks();
  current?.afterRender?.();
  updateSelectionCaption();
  updateStageHint();
  if (restoreKey) restoreFocus(restoreKey);
}
/** Each slider's value with its unit: shown beside its label, and what the slider says. */
function updateOutputs() {
  const form = $('#tool-form');
  if (!form) return;
  for (const input of $$('input[type=range]', form)) {
    const value = input.value + (input.dataset.unit || '');
    input.setAttribute('aria-valuetext', value.trim());
    const shown = $('[data-for="' + input.name + '"]', form);
    if (shown) shown.textContent = value;
  }
}
function validNumber(field) {
  return field.type !== 'number' || (field.value !== '' && field.checkValidity());
}
/** A field changed: numbers are checked, then the panel hears of it. */
function onPanelInput(event) {
  const field = event.target,
    name = field.name;
  if (name) {
    updateOutputs();
    if (!validNumber(field)) {
      field.setAttribute('aria-invalid', 'true');
      return;
    }
    field.removeAttribute('aria-invalid');
  }
  panel()?.onInput?.(name, field.type === 'checkbox' ? field.checked : field.value, field, selectedItem());
}
export function resizeImageTo(annotation, fraction) {
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
    label: 'Resize ' + annotation.type,
  });
}
