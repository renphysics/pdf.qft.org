/**
 * The JPG to PDF and PDF to JPG panels: how pictures become pages, and pages
 * become pictures. (tool-panel.js describes the panel interface.)
 */

import { createZip, safeBaseName } from './workflows.js';
import { pagesToImages } from './convert.js';
import {
  $,
  activeIndex,
  busy,
  cancellable,
  icon,
  protectedDownload,
  snapshot,
  state,
  toast,
  ui,
} from './editor-core.js';
import { downloadBytes, exportDocument, outputBase, relayoutPictures, showExportError } from './documents.js';
import { selectField } from './tool-panel.js';

function jpgToPdfFields() {
  const pictures = state.pages.filter(
    (page) => state.sources.find((s) => s.id === page.sourceId)?.picture,
  ).length;
  return (
    selectField(
      'Page size',
      'pictureSize',
      [
        ['a4', 'A4'],
        ['letter', 'Letter'],
        ['fit', 'Same as the picture'],
      ],
      true,
    ) +
    selectField(
      'Margin',
      'pictureMargin',
      [
        ['0', 'None'],
        ['24', 'Small'],
        ['48', 'Large'],
      ],
      true,
    ) +
    '<div class="scope-note wide">' +
    (pictures
      ? '<strong>' +
        pictures +
        ' of ' +
        state.pages.length +
        ' pages</strong> are pictures. A4 and Letter pages turn to suit each picture.'
      : 'No pages here are pictures yet. Add JPG or PNG pictures to make pages from them.') +
    '</div><button type="button" class="button secondary" data-action="add-files">' +
    icon('plus') +
    'Add pictures or PDFs</button>' +
    '<p class="field-hint wide">Drag pages in the page strip to put them in order. Download PDF saves them as one PDF.</p>'
  );
}
function pdfToJpgFields() {
  return (
    '<fieldset class="segmented wide"><legend>Picture format</legend><div>' +
    [
      ['jpg', 'JPG'],
      ['png', 'PNG'],
    ]
      .map(
        ([value, text]) =>
          '<label><input type="radio" name="pictureFormat" value="' +
          value +
          '"><span>' +
          text +
          '</span></label>',
      )
      .join('') +
    '</div></fieldset>' +
    selectField(
      'Quality',
      'pictureDpi',
      [
        ['72', 'Screen (72 dpi)'],
        ['150', 'Standard (150 dpi)'],
        ['300', 'High, for print (300 dpi)'],
      ],
      true,
    ) +
    selectField(
      'Pages',
      'pictureScope',
      [
        ['all', 'Every page'],
        ['selected', 'Selected pages (' + ui.selected.size + ')'],
        ['current', 'Current page (' + (activeIndex() + 1) + ')'],
      ],
      true,
    ) +
    '<button type="submit" class="button primary">' +
    icon('download') +
    'Save as pictures</button>' +
    '<p class="field-hint wide">Each page is saved as it looks with your edits. Several pages download together as a ZIP.' +
    (protectedDownload() ? ' Pictures can’t have a password.' : '') +
    '</p>'
  );
}
/** Save pages as JPG or PNG pictures: one picture, or a ZIP of them. */
async function savePictures() {
  if (ui.busy) return;
  const settings = ui.pictureExport;
  const numbers =
    settings.scope === 'current'
      ? [activeIndex() + 1]
      : state.pages
          .map((page, index) => (settings.scope === 'all' || ui.selected.has(page.id) ? index + 1 : 0))
          .filter(Boolean);
  if (!numbers.length) {
    toast('Select pages in the page strip first.', true);
    return;
  }
  try {
    // Pictures are made from the PDF as it downloads, without a password.
    const { bytes } = await exportDocument(protectedDownload() ? { ...snapshot(), protection: null } : null);
    ui.cancelOperation = false;
    busy(true, 'Saving pages as pictures…');
    cancellable('Cancel', null);
    const base = safeBaseName(outputBase());
    const pictures = await pagesToImages(bytes, numbers, {
      format: settings.format,
      dpi: settings.dpi,
      baseName: base,
      onProgress: (value) => {
        $('#busy-message').textContent = 'Saving pages as pictures… ' + Math.round(value * 100) + '%';
      },
      shouldCancel: () => ui.cancelOperation,
    });
    if (pictures.length === 1)
      downloadBytes(
        new Blob([pictures[0].bytes], { type: settings.format === 'png' ? 'image/png' : 'image/jpeg' }),
        pictures[0].name,
      );
    else downloadBytes(createZip(pictures), base + '-pictures.zip');
    toast(
      pictures.length === 1
        ? 'Your picture has been downloaded.'
        : pictures.length + ' pictures have been downloaded in a ZIP.',
    );
  } catch (error) {
    if (error.name === 'AbortError') toast(error.message);
    else showExportError(error);
  } finally {
    busy(false);
  }
}
export function fields() {
  return ui.tool === 'jpgtopdf' ? jpgToPdfFields() : pdfToJpgFields();
}
export function values() {
  if (ui.tool === 'jpgtopdf')
    return { pictureSize: ui.pictureLayout.size, pictureMargin: String(ui.pictureLayout.margin) };
  return {
    pictureFormat: ui.pictureExport.format,
    pictureDpi: String(ui.pictureExport.dpi),
    pictureScope: ui.pictureExport.scope,
  };
}
export function onInput(name, value) {
  if (ui.tool === 'jpgtopdf') {
    if (name === 'pictureSize') ui.pictureLayout.size = value;
    if (name === 'pictureMargin') ui.pictureLayout.margin = Number(value);
    relayoutPictures();
    return;
  }
  if (name === 'pictureFormat') ui.pictureExport.format = value;
  if (name === 'pictureDpi') ui.pictureExport.dpi = Number(value);
  if (name === 'pictureScope') ui.pictureExport.scope = value;
}
export function onSubmit() {
  if (ui.tool === 'pdftojpg') savePictures();
}
