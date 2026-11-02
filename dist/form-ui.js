/**
 * Fill form: inputs over a PDF's form fields, their values in the document
 * state, the panel's summary and moving between fields.
 */

import { applyMatrix, invert } from './layout.js';
import { fieldValue, geometryOf, renderPage } from './preview.js';
import {
  $,
  $$,
  activeIndex,
  icon,
  pageIndexOf,
  phone,
  state,
  THUMB_WIDTH,
  toast,
  touch,
  ui,
} from './editor-core.js';
import { inView, pageById, revealElement, scrollToPage, setCurrentPage } from './page-view.js';
import { rememberThumb, setSheet, thumbKey } from './pages.js';
import { usedSources } from './documents.js';
import { change, typing } from './app.js';

// ---- Filling in forms ------------------------------------------------------------
// With Fill form open, each page shows inputs over its form fields, and PDF.js
// leaves the fields out of the page image. Elsewhere, and in the page strip,
// the page image shows the fields with the values typed, as the download will.

const FORM_KINDS = ['text', 'checkbox', 'radio', 'dropdown', 'list'];
// PDF.js's line height for form text: inputs use its automatic sizes.
const FORM_LINE = 1.35;
export function sourceOf(page) {
  return page ? state.sources.find((source) => source.id === page.sourceId) : null;
}
/**
 * The fields on a page that can be filled in, each with its widget there.
 * Read-only fields are left out: PDF.js draws them on the page as they are.
 */
function pageFormFields(page) {
  const entries = [];
  for (const field of sourceOf(page)?.form?.fields || []) {
    if (!FORM_KINDS.includes(field.kind) || field.readOnly) continue;
    for (const widget of field.widgets) if (widget.pageIndex === page.index) entries.push({ field, widget });
  }
  return entries;
}
/** Whether Fill form shows a page without its fields, for its inputs to take their place. */
export function fillingForm(page) {
  return ui.tool === 'form' && pageFormFields(page).length > 0;
}
/** Every field in the document that can be filled in, in page order (a field on several pages, once). */
export function documentFields() {
  const seen = new Set(),
    fields = [];
  for (const page of state.pages) {
    const source = sourceOf(page);
    for (const { field } of pageFormFields(page)) {
      const key = source.id + '\n' + field.name;
      if (seen.has(key)) continue;
      seen.add(key);
      fields.push({ source, field, pageId: page.id });
    }
  }
  return fields;
}
const isFilled = (value) =>
  Array.isArray(value) ? value.length > 0 : typeof value === 'string' ? value.trim() !== '' : Boolean(value);
function formSummary() {
  const fields = documentFields().filter(({ field }) => !field.readOnly),
    empty = fields.filter(({ source, field }) => !isFilled(fieldValue(state, source, field)));
  return {
    total: fields.length,
    filled: fields.length - empty.length,
    required: empty.filter(({ field }) => field.required).length,
    empty,
  };
}
/** The text size an input uses: the field's own, or the automatic size PDF.js draws. */
function inputTextSize(field, width, height) {
  if (field.fontSize) return field.fontSize;
  if (field.kind === 'list') return Math.max(4, (height - 1) / Math.max(1, field.options.length) / FORM_LINE);
  if (field.kind === 'text' && field.multiline) {
    const lines = Math.max(1, Math.round((height - 2) / (12 * FORM_LINE)));
    return Math.max(4, (height - 2) / lines / FORM_LINE);
  }
  return Math.max(4, (height - 2) / FORM_LINE);
}
function fieldControl(source, field, widget) {
  let control;
  if (field.kind === 'text') {
    control = document.createElement(field.multiline ? 'textarea' : 'input');
    if (!field.multiline) control.type = field.password ? 'password' : 'text';
    if (field.maxLength) control.maxLength = field.maxLength;
    control.autocomplete = 'off';
    control.readOnly = field.readOnly;
  } else if (field.kind === 'checkbox' || field.kind === 'radio') {
    control = document.createElement('input');
    control.type = field.kind;
    if (field.kind === 'radio') {
      control.name = 'form:' + source.id + ':' + field.name;
      control.value = widget.option ?? '';
    }
    control.disabled = field.readOnly;
  } else {
    control = document.createElement('select');
    if (field.kind === 'list') {
      control.multiple = Boolean(field.multiple);
      control.size = Math.max(2, field.options.length);
    } else control.append(new Option('', ''));
    for (const option of field.options) control.append(new Option(option, option));
    control.disabled = field.readOnly;
  }
  control.className = 'form-field form-' + field.kind + (field.comb ? ' form-comb' : '');
  control.dataset.source = source.id;
  control.dataset.field = field.name;
  control.setAttribute(
    'aria-label',
    field.kind === 'radio' ? field.label + ': ' + (widget.option ?? '') : field.label,
  );
  if (field.required) {
    control.required = true;
    control.classList.add('form-required');
  }
  control.style.color = field.color || '#000000';
  if (field.kind === 'text') control.style.textAlign = ['left', 'center', 'right'][field.align] || 'left';
  return control;
}
/** Place an input over its widget, turned and cropped with the page; returns its top-left corner on the page. */
function placeControl(control, entry, field, widget) {
  const [x, y, width, height] = widget.rect,
    inverse = invert(entry.geometry.matrix),
    pageHeight = entry.geometry.height,
    scale = entry.scale;
  const onPage = (ux, uy) => {
    const point = applyMatrix(inverse, ux, uy);
    return { x: point.x, y: pageHeight - point.y };
  };
  const origin = onPage(x, y + height),
    across = onPage(x + 1, y + height),
    down = onPage(x, y + height - 1),
    far = onPage(x + width, y);
  const typing = field.kind === 'text' || field.kind === 'dropdown' || field.kind === 'list',
    size = typing ? inputTextSize(field, width, height) : 0;
  // iOS zooms into inputs with text under 16 px: such inputs are drawn larger, then scaled down.
  const enlarge = typing && touch() && size * scale < 16 ? 16 / (size * scale) : 1;
  const style = control.style;
  style.width = width * scale * enlarge + 'px';
  style.height = height * scale * enlarge + 'px';
  if (typing) style.fontSize = size * scale * enlarge + 'px';
  if (field.comb && field.maxLength) {
    // One character per box, as the PDF draws them.
    const cell = (width / field.maxLength) * scale * enlarge,
      glyph = 0.6 * size * scale * enlarge;
    style.letterSpacing = Math.max(0, cell - glyph) + 'px';
    style.paddingLeft = Math.max(0, (cell - glyph) / 2) + 'px';
  }
  const matrix = [
    (across.x - origin.x) / enlarge,
    (across.y - origin.y) / enlarge,
    (down.x - origin.x) / enlarge,
    (down.y - origin.y) / enlarge,
    origin.x * scale,
    origin.y * scale,
  ];
  style.transform = 'matrix(' + matrix.map((value) => Math.round(value * 1000) / 1000).join(',') + ')';
  return { x: Math.min(origin.x, far.x), y: Math.min(origin.y, far.y) };
}
/** Show a field's value in its input (not while it is being typed in). */
function syncControl(control, field, value) {
  if (field.kind === 'checkbox') control.checked = Boolean(value);
  else if (field.kind === 'radio')
    control.checked = value !== null && value !== undefined && control.value === value;
  else if (document.activeElement === control) return;
  else if (field.kind === 'list')
    for (const option of control.options)
      option.selected = Array.isArray(value) && value.includes(option.value);
  else {
    const text = String(value ?? '');
    // A dropdown value the PDF has that is not one of its options.
    if (field.kind === 'dropdown' && text && ![...control.options].some((option) => option.value === text))
      control.append(new Option(text, text));
    if (control.value !== text) control.value = text;
  }
}
/** The inputs over a page's fields, while Fill form is open. */
export function renderFormLayer(view) {
  const layer = view.fields,
    page = pageById(view.id),
    entry = ui.stage.byId.get(view.id),
    entries = page && entry && ui.tool === 'form' ? pageFormFields(page) : [];
  layer.hidden = !entries.length;
  if (!entries.length) {
    if (layer.firstChild && !layer.contains(document.activeElement)) layer.replaceChildren();
    return;
  }
  const source = sourceOf(page),
    existing = new Map($$('.form-field', layer).map((control) => [control.dataset.widget, control])),
    placed = [];
  for (const { field, widget } of entries) {
    const key = widget.id || field.name + '#' + field.widgets.indexOf(widget);
    let control = existing.get(key);
    existing.delete(key);
    if (!control) {
      control = fieldControl(source, field, widget);
      control.dataset.widget = key;
    }
    placed.push([placeControl(control, entry, field, widget), control]);
    syncControl(control, field, fieldValue(state, source, field));
  }
  for (const control of existing.values()) control.remove();
  // Reading order, row by row: also the order Tab moves in.
  placed.sort((a, b) => Math.round(a[0].y / 6) - Math.round(b[0].y / 6) || a[0].x - b[0].x);
  const ordered = placed.map(([, control]) => control);
  if (ordered.some((control, index) => layer.children[index] !== control)) {
    const focused = document.activeElement;
    layer.append(...ordered);
    if (layer.contains(focused) && document.activeElement !== focused) focused.focus({ preventScroll: true });
  }
}
/** Keep a typed value: each change is an undo step (typing in one field merges into one). */
function commitControl(control) {
  const source = state.sources.find((item) => item.id === control.dataset.source),
    field = source?.form?.fields.find((item) => item.name === control.dataset.field);
  if (!field || field.readOnly || ui.busy) return;
  let value;
  if (field.kind === 'text' || field.kind === 'dropdown') value = control.value;
  else if (field.kind === 'checkbox') value = control.checked;
  else if (field.kind === 'radio') {
    if (!control.checked) return;
    value = control.value;
  } else value = [...control.selectedOptions].map((option) => option.value);
  change(
    () => {
      state.formValues = {
        ...state.formValues,
        [source.id]: { ...(state.formValues[source.id] || {}), [field.name]: value },
      };
    },
    { key: field.kind === 'text' ? 'form:' + source.id + ':' + field.name : null },
  );
  refreshThumbnailsSoon();
}
/** Put focus in a field's input, bringing its page into view. */
export function focusField({ source, field, pageId }) {
  let view = ui.stage.views.get(pageId);
  if (!view || !inView(view)) {
    scrollToPage(pageId);
    view = ui.stage.views.get(pageId);
  }
  if (!view) return;
  renderFormLayer(view);
  const control = $$('.form-field', view.fields).find(
    (item) => item.dataset.source === source.id && item.dataset.field === field.name && !item.disabled,
  );
  if (!control) return;
  control.focus({ preventScroll: true });
  revealElement(control);
}
/** The first empty field from the current page on, or from the start. */
export function nextEmptyField() {
  const { empty } = formSummary(),
    current = activeIndex();
  return empty.find((item) => pageIndexOf(item.pageId) >= current) || empty[0] || null;
}
export function updateFormSummary() {
  const node = $('#form-summary');
  if (!node) return;
  const { total, filled, required } = formSummary(),
    text =
      '<strong>' +
      filled +
      ' of ' +
      total +
      ' field' +
      (total === 1 ? '' : 's') +
      ' filled in.</strong>' +
      (required
        ? '<br>' + required + ' required field' + (required === 1 ? ' is' : 's are') + ' still empty.'
        : '');
  if (node.innerHTML !== text) node.innerHTML = text;
  const next = $('#tool-form [data-action="form-next"]');
  if (next) next.disabled = filled === total;
}
export function formPanel() {
  const sources = usedSources().filter((source) => source.form),
    fields = documentFields();
  if (!fields.length)
    return (
      '<p class="scope-note wide">' +
      (sources.length
        ? 'This PDF’s form has no fields to type in.'
        : 'This PDF has no form fields to fill in.') +
      ' To write on a page, use Add text.</p>' +
      '<button type="button" class="button secondary" data-tool="text">' +
      icon('text') +
      'Add text</button>'
    );
  const notes = [];
  if (sources.some((source) => source.form.fields.some((field) => field.kind === 'signature')))
    notes.push('Signature fields stay empty here. To sign, use Sign PDF.');
  if (sources.some((source) => source.form.scripts))
    notes.push('Calculations and checks built into this form don’t run here.');
  if (sources.some((source) => source.form.xfa))
    notes.push(
      'This PDF also has an XFA version of its form, which some apps show instead. Once you fill in fields here, the download has these fields only.',
    );
  return (
    '<p id="form-summary" class="scope-note wide" aria-live="polite"></p>' +
    '<button type="button" class="button primary" data-action="form-next">' +
    icon('arrow') +
    'Go to the next empty field</button>' +
    '<label class="check-field wide"><input type="checkbox" name="flattenForms"' +
    (state.flattenForms ? ' checked' : '') +
    '> Flatten fields on download</label>' +
    '<p class="field-hint wide">Flattened fields become part of the page: the PDF looks the same in every app, but its fields can no longer be changed. Flattening also lets you combine these pages with other PDFs.</p>' +
    '<button type="button" class="button secondary" data-action="download">' +
    icon('download') +
    'Download filled PDF</button>' +
    '<button type="button" class="button subtle" data-action="form-clear">Clear all fields</button>' +
    notes.map((note) => '<p class="field-hint wide">' + note + '</p>').join('')
  );
}
export function clearForm() {
  const fields = documentFields().filter(
    ({ source, field }) => !field.readOnly && isFilled(fieldValue(state, source, field)),
  );
  if (!fields.length) return;
  const empty = { text: '', checkbox: false, radio: null, dropdown: '', list: [] };
  change(() => {
    const values = { ...state.formValues };
    for (const { source, field } of fields)
      values[source.id] = { ...(values[source.id] || {}), [field.name]: empty[field.kind] };
    state.formValues = values;
  });
  refreshThumbnailsSoon();
  toast('Fields cleared. Undo brings their values back.');
}
let thumbnailRefresh = 0;
/** Draw again the thumbnails whose form values changed, once typing pauses. */
function refreshThumbnailsSoon() {
  clearTimeout(thumbnailRefresh);
  thumbnailRefresh = setTimeout(async () => {
    for (const node of $$('#page-list [data-page-open]')) {
      const old = node.querySelector('canvas'),
        descriptor = pageById(node.dataset.pageOpen);
      if (!old || !descriptor || node.dataset.key === thumbKey(descriptor)) continue;
      const geometry = geometryOf(state, descriptor),
        key = thumbKey(descriptor);
      try {
        const canvas = await renderPage(state, descriptor, THUMB_WIDTH / geometry.width).promise;
        if (!old.isConnected || thumbKey(descriptor) !== key) continue;
        canvas.setAttribute('aria-hidden', 'true');
        old.replaceWith(canvas);
        node.dataset.key = key;
        rememberThumb(key, canvas);
      } catch {
        // The old thumbnail stays.
      }
    }
  }, 600);
}
const stageStack = $('#page-stack');

/** Listen for input on the page stack (called once, by app.js). */
export function initFormInputs() {
  stageStack.addEventListener('input', (event) => {
    const control = event.target.closest?.('.form-field');
    if (control && control.matches('input[type="text"], input[type="password"], textarea'))
      commitControl(control);
  });
  stageStack.addEventListener('change', (event) => {
    const control = event.target.closest?.('.form-field');
    if (control && !control.matches('input[type="text"], input[type="password"], textarea'))
      commitControl(control);
  });
  stageStack.addEventListener('focusin', (event) => {
    const control = event.target.closest?.('.form-field');
    if (!control) return;
    const view = control.closest('.page-view');
    if (view) setCurrentPage(view.dataset.viewId);
    // Phones: fold the tool sheet away so the field stays visible above the keyboard.
    if (phone() && control.matches('input[type="text"], input[type="password"], textarea')) setSheet(false);
  });
  // Tab moves through the fields in reading order, also to pages not shown yet.
  stageStack.addEventListener('keydown', (event) => {
    const control = event.target.closest?.('.form-field');
    if (!control || event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
    const view = control.closest('.page-view'),
      controls = $$('.form-field', view).filter((item) => !item.disabled),
      edge = event.shiftKey ? controls[0] : controls[controls.length - 1];
    if (control !== edge && !(control.type === 'radio' && edge?.name === control.name)) return;
    const step = event.shiftKey ? -1 : 1;
    for (
      let index = pageIndexOf(view.dataset.viewId) + step;
      index >= 0 && index < state.pages.length;
      index += step
    ) {
      const page = state.pages[index],
        fields = pageFormFields(page).filter(({ field }) => !field.readOnly);
      if (!fields.length) continue;
      event.preventDefault();
      const source = sourceOf(page),
        { field } = event.shiftKey ? fields[fields.length - 1] : fields[0];
      // The page's own order (row by row) decides its first and last field once its inputs exist.
      let target = ui.stage.views.get(page.id);
      if (!target) {
        scrollToPage(page.id);
        target = ui.stage.views.get(page.id);
      }
      if (target) renderFormLayer(target);
      const inputs = target ? $$('.form-field', target.fields).filter((item) => !item.disabled) : [];
      const next = event.shiftKey ? inputs[inputs.length - 1] : inputs[0];
      if (next) {
        next.focus({ preventScroll: true });
        revealElement(next);
      } else focusField({ source, field, pageId: page.id });
      return;
    }
  });
}
