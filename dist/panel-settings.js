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
import { change, onDocumentChanged } from './history.js';
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

// ---- Settings remembered on this device ------------------------------------------
// Asked for in each tool ("Remember these settings on this device"): the text
// and options of a watermark, of headers and footers or of page numbers are
// kept in this browser, follow what is used, and are that tool's starting
// point from then on. Never the PDF, nor which pages.

const STORAGE_KEY = 'qft-pdf.settings.v1';
const SLOTS = ['headerLeft', 'headerCenter', 'headerRight', 'footerLeft', 'footerCenter', 'footerRight'];
const record = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);
/** Everything remembered, by setting; nothing when the browser keeps none or what it keeps cannot be read. */
function savedSettings() {
  try {
    return record(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')) || {};
  } catch {
    return {};
  }
}
/** Whether a tool's settings are remembered. */
const remembers = (key) => Boolean(record(savedSettings()[key]));
/** Whether headers and footers have any text to draw. */
const hasText = (setting) => SLOTS.some((slot) => String(setting[slot] ?? '').trim());
/** A tool's starting settings: its own defaults, with what was remembered for it over them. */
export function defaultSetting(key) {
  const defaults = settingDefaults[key](),
    saved = record(savedSettings()[key]);
  if (saved)
    for (const [name, value] of Object.entries(defaults))
      // Only what the tool knows, of the kind it expects.
      if (name !== 'enabled' && name !== 'pages' && typeof saved[name] === typeof value)
        defaults[name] = typeof value === 'string' ? saved[name].slice(0, 500) : saved[name];
  return defaults;
}
/** What is kept of a setting: its text and options, not whether it is shown nor on which pages. */
function keptOf(setting) {
  const kept = { ...setting };
  delete kept.enabled;
  delete kept.pages;
  return kept;
}
/** Keep a tool's settings in this browser (`setting`), or forget them (null). False when the browser refuses. */
function remember(key, setting) {
  try {
    const saved = savedSettings();
    if (setting) saved[key] = keptOf(setting);
    else delete saved[key];
    if (Object.keys(saved).length) localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    else localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
// What is remembered follows what is used: an edit of a setting, and an undo
// or a redo of one. Only a setting that changed here is written, so a document
// open in another tab does not put its older settings back.
const lastUsed = {};
onDocumentChanged(() => {
  for (const key of Object.values(SETTINGS)) {
    if (!state[key]) continue;
    const used = JSON.stringify(keptOf(state[key]));
    if (used === lastUsed[key]) continue;
    lastUsed[key] = used;
    if (remembers(key)) remember(key, state[key]);
  }
});
function rememberField() {
  return (
    '<label class="check-field wide"><input type="checkbox" name="rememberSetting" aria-describedby="remember-hint"> Remember these settings on this device</label>' +
    '<p class="field-hint wide" id="remember-hint">Kept in this browser only: the text and options above, not your PDF or which pages. This tool starts from them next time; untick to forget them.</p>'
  );
}

/**
 * A setting not made yet is off, except headers and footers with nothing to
 * draw: they count as on, and show as soon as text is typed.
 */
function settingOn(key) {
  if (state[key]) return state[key].enabled !== false;
  return key === 'headerFooter' && !hasText(defaultSetting(key));
}
/**
 * Watermark and Page numbers show their starting settings the first time they
 * are the tool in use for a document (one undo step); so do Headers & footers
 * when text was remembered for them. Switched off or undone, they stay off when
 * the tool opens again.
 */
export function showSettingDefaults({ notice = true } = {}) {
  const key = SETTINGS[ui.tool];
  if (!key || !state.pages.length || state[key] || ui.shownSettings.has(key)) return null;
  const saved = remembers(key),
    start = defaultSetting(key);
  // Nothing to show until there is text: headers and footers, and a watermark saved without any.
  if (key === 'headerFooter' ? !hasText(start) : key === 'watermark' && !start.text.trim()) return null;
  ui.shownSettings.add(key);
  change(() => (state[key] = start));
  const message = saved
    ? {
        watermark: 'Your saved watermark is shown on every page. Undo takes it away.',
        headerFooter: 'Your saved headers and footers are shown on every page. Undo takes them away.',
        pageNumbers: 'Your saved page numbers are shown on every page. Undo takes them away.',
      }[key]
    : key === 'watermark'
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
          state[key] ||= defaultSetting(key);
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
      state[key] ||= defaultSetting(key);
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
    state[key] ||= defaultSetting(key);
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
        rememberField() +
        batchLink()
      );
    case 'footer':
      return (
        switchField('headerFooter', 'Show headers & footers') +
        '<div class="scope-note wide">Type <strong>{page}</strong> for the page number and <strong>{total}</strong> for the number of pages: “Page {page} of {total}” shows as “Page 2 of 5”. <strong>{date}</strong> is today’s date and <strong>{filename}</strong> the file’s name.</div><div class="field-section wide">HEADER</div>' +
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
        rememberField() +
        batchLink()
      );
    case 'numbers':
      return (
        switchField('pageNumbers', 'Show page numbers') +
        textField('Number format', 'format', 'Page {page} of {total}', true) +
        '<div class="scope-note wide"><strong>{page}</strong> is the page number. <strong>{total}</strong> is the document page count. <strong>{date}</strong> and <strong>{filename}</strong> work too.</div>' +
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
        rememberField() +
        batchLink()
      );
  }
  return '';
}
export function values() {
  const key = SETTINGS[ui.tool],
    setting = state[key] || defaultSetting(key);
  const values = { ...setting, scope: setting.pages === 'all' || !setting.pages ? 'all' : 'pages' };
  if (key === 'watermark') values.opacity = Math.round(number(setting.opacity, 0.18, 0, 1) * 100);
  if (Array.isArray(setting.pages))
    values.scopePages = rangeText(setting.pages.map(pageIndexOf).filter((index) => index >= 0));
  values.rememberSetting = remembers(key);
  return values;
}
export function onInput(name, value) {
  const key = SETTINGS[ui.tool];
  if (name === 'rememberSetting') {
    if (!remember(key, value ? state[key] || defaultSetting(key) : null)) {
      toast('This browser could not keep these settings.', true);
      fillForm({ all: true });
    } else
      announceMessage(
        value
          ? 'These settings will be remembered on this device.'
          : 'These settings are no longer remembered.',
      );
    return;
  }
  updateSetting(key, name, value);
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
