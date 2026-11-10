/**
 * The Split PDF panel: how to split (a draft in ui.splitDraft), the parts made
 * (ui.splitResults) and their downloads. (tool-panel.js describes the panel
 * interface.)
 */

import { createZip, planSplit, safeBaseName, splitPdf } from './workflows.js';
import {
  $,
  busy,
  cancellable,
  formatSize,
  icon,
  protectedDownload,
  safe,
  snapshot,
  state,
  toast,
  ui,
} from './editor-core.js';
import { splitFormProblem } from './pages.js';
import { exportDocument, exportNotes, outputBase, showExportError } from './documents.js';
import { makeField, numberField, renderTool, selectField } from './tool-panel.js';

function splitFields() {
  return (
    selectField(
      'Split by',
      'mode',
      [
        ['each', 'Every page'],
        ['chunks', 'Every N pages'],
        ['ranges', 'Custom page groups'],
      ],
      true,
    ) +
    '<div id="split-size" class="wide">' +
    numberField('Pages per PDF', 'size', 1, Math.max(1, state.pages.length)) +
    '</div><div id="split-ranges" class="wide">' +
    makeField(
      'Page groups',
      '<textarea name="ranges" rows="3" placeholder="1-3; 4-6; 7, 9-10"></textarea>',
      true,
    ) +
    '<p class="field-hint">Separate PDFs with a semicolon. Use commas for pages within one PDF.</p></div><div id="split-summary" class="scope-note wide" aria-live="polite"></div>' +
    '<button type="submit" class="button primary">' +
    icon('split') +
    'Create split PDFs</button>' +
    '<div id="split-results" class="wide">' +
    splitResultMarkup() +
    '</div>'
  );
}
function splitResultMarkup() {
  if (!ui.splitResults?.length) return '';
  return (
    '<div class="split-result-header"><strong>' +
    ui.splitResults.length +
    ' PDFs ready</strong><span>Your source is unchanged.</span></div><button type="button" class="button primary" data-action="download-split-zip">' +
    icon('download') +
    'Download all as ZIP</button><div class="split-result-list">' +
    ui.splitResults
      .map(
        (file, index) =>
          '<div class="split-result"><span><strong>' +
          safe(file.name) +
          '</strong><small>' +
          file.pageCount +
          ' page' +
          (file.pageCount === 1 ? '' : 's') +
          ' · ' +
          formatSize(file.bytes.length) +
          '</small></span><button type="button" class="icon-button" data-action="download-split" data-output-index="' +
          index +
          '" aria-label="Download ' +
          safe(file.name) +
          '">' +
          icon('download') +
          '</button></div>',
      )
      .join('') +
    '</div>'
  );
}
function updateSplitSummary() {
  const values = ui.splitDraft;
  if (!$('#split-size')) return;
  $('#split-size').hidden = values.mode !== 'chunks';
  $('#split-ranges').hidden = values.mode !== 'ranges';
  $('#split-size input').disabled = values.mode !== 'chunks';
  $('#split-ranges textarea').disabled = values.mode !== 'ranges';
  const node = $('#split-summary');
  try {
    const groups = planSplit(
      { mode: values.mode, size: Number(values.size), ranges: values.ranges },
      state.pages.length,
    );
    const used = new Set(groups.flat()),
      omitted = state.pages.length - used.size,
      problem = splitFormProblem();
    node.textContent =
      problem ||
      groups.length +
        ' output PDF' +
        (groups.length === 1 ? '' : 's') +
        ' · ' +
        used.size +
        ' of ' +
        state.pages.length +
        ' pages included.' +
        (omitted
          ? ' ' + omitted + ' page' + (omitted === 1 ? ' is' : 's are') + ' outside these groups.'
          : '');
    node.classList.toggle('invalid', Boolean(problem));
  } catch (error) {
    node.textContent = error.message;
    node.classList.add('invalid');
  }
}
async function generateSplit() {
  if (ui.busy) return;
  try {
    const values = ui.splitDraft,
      groups = planSplit(
        { mode: values.mode, size: Number(values.size), ranges: values.ranges },
        state.pages.length,
      );
    const problem = splitFormProblem();
    if (problem) throw new Error(problem);
    // Each part is protected on its own, so the document is split unprotected.
    const password = protectedDownload() ? state.protection.password : null;
    const { bytes, notes } = await exportDocument(password ? { ...snapshot(), protection: null } : null);
    ui.cancelOperation = false;
    busy(true, 'Creating split PDFs…');
    cancellable('Cancel splitting', null);
    const { parts: outputs, notes: losses } = await splitPdf(bytes, groups, {
      password,
      onProgress: (value) => {
        $('#busy-message').textContent = 'Creating split PDFs… ' + Math.round(value * 100) + '%';
      },
      shouldCancel: () => ui.cancelOperation,
    });
    const base = safeBaseName(outputBase());
    ui.splitResults = outputs.map((output, index) => ({
      name: base + '-part-' + String(index + 1).padStart(String(groups.length).length, '0') + '.pdf',
      bytes: output,
      pageCount: groups[index].length,
    }));
    renderTool();
    toast(
      outputs.length +
        ' PDF' +
        (outputs.length === 1 ? ' is' : 's are') +
        ' ready to download.' +
        (password ? (outputs.length === 1 ? ' It needs' : ' Each needs') + ' your password to open.' : '') +
        // PDF/A: split parts are new PDFs, which never declare it.
        exportNotes([...notes.filter((note) => note === 'signature-invalid'), ...losses], {
          several: outputs.length > 1,
        }),
    );
  } catch (error) {
    if (error.name === 'AbortError') toast('Splitting cancelled. Your document is unchanged.');
    else showExportError(error);
  } finally {
    busy(false);
  }
}
export function fields() {
  return splitFields();
}
export function values() {
  return ui.splitDraft;
}
export function onInput(name, value) {
  ui.splitDraft[name] = value;
  ui.splitResults = null;
  $('#split-results')?.replaceChildren();
  updateSplitSummary();
}
export function afterRender() {
  updateSplitSummary();
}
export function onSubmit() {
  generateSplit();
}
