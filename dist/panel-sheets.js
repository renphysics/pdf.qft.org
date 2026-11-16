/**
 * The Pages per sheet panel: 2 or 4 pages to a sheet, the paper, margin, gap
 * and border, and the download (pagesPerSheet). (tool-panel.js describes the
 * panel interface.)
 */

import { copyNotes, pagesPerSheet, sheetLayout } from './pdf-engine.js';
import { safeBaseName } from './workflows.js';
import { geometryOf } from './preview.js';
import { $, busy, icon, protectedDownload, snapshot, state, toast, ui } from './editor-core.js';
import { downloadBytes, exportDocument, exportNotes, outputBase, showExportError } from './documents.js';
import { numberField, selectField } from './tool-panel.js';
import { sentences, t, tn } from './i18n.js';

const MM = 72 / 25.4; // points in a millimetre

function sheetFields() {
  return (
    '<fieldset class="segmented wide"><legend>' +
    t('Pages per sheet') +
    '</legend><div>' +
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
      t('Paper'),
      'sheetPaper',
      [
        ['a4', 'A4'],
        ['letter', 'Letter'],
      ],
      true,
    ) +
    '<div class="field-row">' +
    numberField(t('Margin (mm)'), 'sheetMargin', 0, 30) +
    numberField(t('Gap (mm)'), 'sheetGap', 0, 30) +
    '</div><label class="check-field wide"><input type="checkbox" name="sheetBorder"> ' +
    t('A thin border around each page') +
    '</label><p id="sheet-summary" class="field-hint wide" aria-live="polite"></p>' +
    '<button type="submit" class="button primary">' +
    icon('download') +
    t('Download the sheets') +
    '</button><p class="field-hint wide">' +
    sentences(
      t(
        'Each page goes on its sheet as it looks with your edits, as large as fits, and text and drawings stay sharp. Links and comments don’t carry over; form fields are flattened, so their answers do.',
      ),
      protectedDownload() && t('The PDF needs your password to open.'),
    ) +
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
    const values = {
      count,
      sheets,
      orientation: layout.width > layout.height ? t('landscape') : t('portrait'),
      paper: draft.paper === 'a4' ? 'A4' : 'Letter',
      columns: layout.columns,
      rows: layout.rows,
    };
    node.textContent =
      count === 1
        ? t('{count} page on {sheets} {orientation} {paper} sheet: {columns} across, {rows} down.', values)
        : sheets === 1
          ? t('{count} pages on {sheets} {orientation} {paper} sheet: {columns} across, {rows} down.', values)
          : t(
              '{count} pages on {sheets} {orientation} {paper} sheets: {columns} across, {rows} down.',
              values,
            );
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
    const { bytes, notes } = await exportDocument({ ...snapshot(), flattenForms: true, protection: null });
    busy(true, t('Putting the pages on sheets…'));
    const password = protectedDownload() ? state.protection.password : null;
    const sheets = await pagesPerSheet(bytes, {
      perSheet: draft.perSheet,
      paper: draft.paper,
      margin: draft.margin * MM,
      gap: draft.gap * MM,
      border: draft.border,
      password,
    });
    const base = safeBaseName(outputBase());
    downloadBytes(sheets, base + t('-{count}-per-sheet', { count: draft.perSheet }) + '.pdf');
    const count = Math.ceil(state.pages.length / draft.perSheet);
    // A handout is a new PDF: it says what the original's pages left behind, here
    // or already in the export (pages deleted or files combined make a copy).
    const losses = [
      ...new Set([...notes.filter((note) => note.endsWith('-dropped')), ...(await copyNotes(bytes))]),
    ];
    toast(
      sentences(
        tn(count, 'Your sheet has been downloaded.', 'Your {count} sheets have been downloaded.'),
        password && t('The PDF needs your password to open.'),
        exportNotes([...notes.filter((note) => note === 'signature-invalid'), ...losses]),
      ),
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
