/**
 * The Watermark, Headers & footers and Page numbers panels: one setting each
 * (state.watermark, state.headerFooter, state.pageNumbers) with a switch, its
 * fields and the pages it applies to. (tool-panel.js describes the panel
 * interface.)
 */

import { parsePageRange } from './pdf-engine.js';
import { number } from './layout.js';
import { warmFont } from './preview.js';
import {
  $,
  announceMessage,
  names,
  pageIndexOf,
  rangeText,
  settingDefaults,
  SETTINGS,
  state,
  toast,
  ui,
} from './editor-core.js';
import { change } from './history.js';
import {
  batchLink,
  colorField,
  fillForm,
  makeField,
  numberField,
  rangeField,
  selectField,
  textField,
} from './tool-panel.js';

/** A setting not made yet counts as on: headers and footers draw nothing until text is typed. */
function settingOn(key) {
  return state[key] ? state[key].enabled !== false : key === 'headerFooter';
}
/**
 * Watermark and Page numbers show their defaults the first time they are the
 * tool in use for a document (one undo step). Switched off or undone, they stay
 * off when the tool opens again.
 */
export function showSettingDefaults({ notice = true } = {}) {
  const key = SETTINGS[ui.tool];
  if (
    !state.pages.length ||
    (key !== 'watermark' && key !== 'pageNumbers') ||
    state[key] ||
    ui.shownSettings.has(key)
  )
    return null;
  ui.shownSettings.add(key);
  change(() => (state[key] = settingDefaults[key]()));
  const message =
    key === 'watermark'
      ? 'Watermark “DRAFT” shown on every page. Undo takes it away.'
      : 'Page numbers shown on every page. Undo takes them away.';
  if (notice) toast(message);
  return message;
}
function switchField(key, label) {
  const on = settingOn(key);
  return (
    '<button type="button" class="switch wide" role="switch" aria-checked="' +
    on +
    '" data-action="toggle-setting">' +
    '<span class="switch-track" aria-hidden="true"><span></span></span>' +
    label +
    '</button>'
  );
}
/** Headers & footers and Page numbers: left and right change places on even pages. */
function mirrorField() {
  return (
    '<label class="check-field wide"><input type="checkbox" name="mirror" aria-describedby="mirror-hint"> Swap left and right on even pages</label>' +
    '<p class="field-hint wide" id="mirror-hint">For printing on both sides: text on the right of odd pages goes on the left of even pages, so it stays on the outer edge.</p>'
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
    '<p id="scope-hint" class="field-hint" aria-live="polite">Numbers follow the current page order.</p>' +
    '<button type="button" class="button secondary" data-action="scope-selected">Use the selected pages</button></div>'
  );
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
export function toggleSetting() {
  const key = SETTINGS[ui.tool];
  if (!key) return;
  const on = !settingOn(key);
  change(() => {
    state[key] ||= settingDefaults[key]();
    state[key].enabled = on;
  });
  fillForm();
  announceMessage(names[ui.tool] + (on ? ' shown.' : ' hidden.'));
}
export function fields() {
  switch (ui.tool) {
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
        '<div class="scope-note wide">Type <strong>{page}</strong> for the page number and <strong>{total}</strong> for the number of pages: “Page {page} of {total}” shows as “Page 2 of 5”.</div><div class="field-section wide">HEADER</div>' +
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
        numberField('Edge margin (pt)', 'margin', 0, 100) +
        mirrorField() +
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
        numberField('Edge margin (pt)', 'margin', 0, 100) +
        '</div>' +
        mirrorField() +
        scopeFields() +
        batchLink()
      );
  }
  return '';
}
export function values() {
  const key = SETTINGS[ui.tool],
    setting = state[key] || settingDefaults[key]();
  const values = { ...setting, scope: setting.pages === 'all' || !setting.pages ? 'all' : 'pages' };
  if (key === 'watermark') values.opacity = Math.round(number(setting.opacity, 0.18, 0, 1) * 100);
  if (Array.isArray(setting.pages))
    values.scopePages = rangeText(setting.pages.map(pageIndexOf).filter((index) => index >= 0));
  return values;
}
export function onInput(name, value) {
  updateSetting(SETTINGS[ui.tool], name, value);
}
/** After every fillForm: the page list's visibility and error, and the switch. */
export function afterFill(values) {
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
    const hint = $('#scope-hint'),
      text = error || 'Numbers follow the current page order.';
    if (hint.textContent !== text) hint.textContent = text;
    hint.classList.toggle('invalid', Boolean(error));
  }
  const toggle = $('#tool-form [role="switch"]');
  if (toggle) toggle.setAttribute('aria-checked', String(settingOn(SETTINGS[ui.tool])));
}
