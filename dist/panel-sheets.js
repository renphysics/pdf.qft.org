/**
 * The Pages per sheet panel: 2 or 4 pages to a sheet, the paper, margin, gap
 * and border, and the download (pagesPerSheet). (tool-panel.js describes the
 * panel interface.)
 */

import { pagesPerSheet, sheetLayout } from './pdf-engine.js';
import { safeBaseName } from './workflows.js';
import { geometryOf } from './preview.js';
import { $, busy, icon, protectedDownload, snapshot, state, toast, ui } from './editor-core.js';
import { downloadBytes, exportDocument, outputName, showExportError } from './documents.js';
import { numberField, selectField } from './tool-panel.js';

const MM = 72 / 25.4; // points in a millimetre

function sheetFields() {
  return (
    '<fieldset class="segmented wide"><legend>Pages per sheet</legend><div>' +
    ['2', '4']
      .map(
        (value) =>
          '<label><input type="radio" name="sheetCount" value="' +
          value +
          '"><span>' +
          value +
          '</span></label>',
      )
      .join('') +
    '</div></fieldset>' +
    selectField(
      'Paper',
      'sheetPaper',
      [
        ['a4', 'A4'],
        ['letter', 'Letter'],
      ],
      true,
    ) +
    '<div class="field-row">' +
    numberField('Margin (mm)', 'sheetMargin', 0, 30) +
    numberField('Gap (mm)', 'sheetGap', 0, 30) +
    '</div><label class="check-field wide"><input type="checkbox" name="sheetBorder"> A thin border around each page</label>' +
    '<p id="sheet-summary" class="field-hint wide" aria-live="polite"></p>' +
    '<button type="submit" class="button primary">' +
    icon('download') +
    'Download the sheets</button>' +
    '<p class="field-hint wide">Each page goes on its sheet as it looks with your edits, as large as fits, and text and drawings stay sharp. Links and comments don’t carry over; form fields are flattened, so their answers do.' +
    (protectedDownload() ? ' The PDF needs your password to open.' : '') +
    '</p>'
  );
}
/** How the pages go on sheets, from the first page's shape (see sheetLayout). */
function updateSheetSummary() {
  const node = $('#sheet-summary');
  if (!node || !state.pages.length) return;
  const draft = ui.sheetDraft,
    count = state.pages.length,
    sheets = Math.ceil(count / draft.perSheet);
  try {
    const layout = sheetLayout(
      draft.perSheet,
      draft.paper,
      geometryOf(state, state.pages[0]),
      draft.margin * MM,
      draft.gap * MM,
    );
    node.textContent =
      count +
      (count === 1 ? ' page on ' : ' pages on ') +
      sheets +
      (layout.width > layout.height ? ' landscape ' : ' portrait ') +
      (draft.paper === 'a4' ? 'A4' : 'Letter') +
      (sheets === 1 ? ' sheet' : ' sheets') +
      ': ' +
      layout.columns +
      ' across, ' +
      layout.rows +
      ' down.';
    node.classList.remove('invalid');
  } catch (error) {
    node.textContent = error.message;
    node.classList.add('invalid');
  }
}
/** Download the document with 2 or 4 pages to a sheet (see pagesPerSheet). */
async function saveSheets() {
  if (ui.busy) return;
  const draft = ui.sheetDraft;
  try {
    // From the PDF as it downloads, with its fields flattened (their answers become part of the pages).
    const { bytes } = await exportDocument({ ...snapshot(), flattenForms: true, protection: null });
    busy(true, 'Putting the pages on sheets…');
    const password = protectedDownload() ? state.protection.password : null;
    const sheets = await pagesPerSheet(bytes, {
      perSheet: draft.perSheet,
      paper: draft.paper,
      margin: draft.margin * MM,
      gap: draft.gap * MM,
      border: draft.border,
      password,
    });
    const base = safeBaseName(outputName()).replace(/-(edited|converted|protected|unlocked)$/, '');
    downloadBytes(sheets, base + '-' + draft.perSheet + '-per-sheet.pdf');
    const count = Math.ceil(state.pages.length / draft.perSheet);
    toast(
      'Your ' +
        (count === 1 ? 'sheet has' : count + ' sheets have') +
        ' been downloaded.' +
        (password ? ' The PDF needs your password to open.' : ''),
    );
  } catch (error) {
    showExportError(error);
  } finally {
    busy(false);
  }
}
export function fields() {
  return sheetFields();
}
export function values() {
  const draft = ui.sheetDraft;
  return {
    sheetCount: String(draft.perSheet),
    sheetPaper: draft.paper,
    sheetMargin: draft.margin,
    sheetGap: draft.gap,
    sheetBorder: draft.border,
  };
}
export function onInput(name, value) {
  const draft = ui.sheetDraft;
  if (name === 'sheetCount') draft.perSheet = Number(value);
  if (name === 'sheetPaper') draft.paper = value;
  if (name === 'sheetMargin') draft.margin = Number(value);
  if (name === 'sheetGap') draft.gap = Number(value);
  if (name === 'sheetBorder') draft.border = value;
  updateSheetSummary();
}
export function afterRender() {
  updateSheetSummary();
}
export function onSubmit() {
  saveSheets();
}
