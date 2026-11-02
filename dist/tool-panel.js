/**
 * The tool panel: each tool's settings and buttons, reading them back into
 * the document state, signatures, protection and the Split panel.
 */

import { cropMarginsForRotation, parsePageRange, passwordProblem } from './pdf-engine.js';
import { createZip, planSplit, safeBaseName, splitPdf } from './workflows.js';
import { pagesToImages } from './convert.js';
import {
  forgetSignature,
  loadSignatureFont,
  saveSignature,
  signaturePad,
  typedSignature,
} from './signature.js';
import { hexColor, number } from './layout.js';
import { geometryOf, warmFont } from './preview.js';
import {
  $,
  $$,
  activeIndex,
  ANNOTATION_TOOLS,
  announceMessage,
  busy,
  cancellable,
  clamp,
  currentPage,
  descriptions,
  focusKey,
  formatSize,
  friendly,
  icon,
  names,
  pageIndexOf,
  phone,
  rangeText,
  restoreFocus,
  safe,
  selectedItem,
  settingDefaults,
  SETTINGS,
  snapshot,
  state,
  tapOrClick,
  toast,
  touch,
  ui,
  uid,
} from './editor-core.js';
import {
  currentOverlay,
  itemLabel,
  markView,
  overlayItem,
  pageById,
  updateProblems,
  updateSelectionCaption,
  updateStageHint,
} from './page-view.js';
import { formPanel, updateFormSummary } from './form-ui.js';
import { inlineEditor, selectItem, setFrame } from './page-items.js';
import { setSheet, splitFormProblem } from './pages.js';
import { downloadBytes, exportDocument, outputName, relayoutPictures, showExportError } from './documents.js';
import { action, change } from './app.js';

// ---- The tool panel ---------------------------------------------------------------

function makeField(label, input, wide = false) {
  return '<label class="field' + (wide ? ' wide' : '') + '"><span>' + label + '</span>' + input + '</label>';
}
function textField(label, name, placeholder = '', wide = false) {
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
function numberField(label, name, min, max, step = 1) {
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
function colorField(name = 'color') {
  return makeField('Color', '<input name="' + name + '" type="color">');
}
function rangeField(label, name, min, max, unit = '%') {
  return makeField(
    label + ' <output data-for="' + name + '"></output>',
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
function selectField(label, name, options, wide = false) {
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
function alignField() {
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
function switchField(key, label) {
  const on = Boolean(state[key]) && state[key].enabled !== false;
  return (
    '<button type="button" class="switch wide" role="switch" aria-checked="' +
    on +
    '" data-action="toggle-setting">' +
    '<span class="switch-track" aria-hidden="true"><span></span></span>' +
    label +
    '</button>'
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
    '<p id="scope-hint" class="field-hint">Numbers follow the current page order.</p>' +
    '<button type="button" class="button secondary" data-action="scope-selected">Use the selected pages</button></div>'
  );
}
function batchLink() {
  return (
    '<div class="reuse-settings wide"><button type="button" class="text-button" data-action="batch-from-editor">' +
    icon('batch') +
    (ui.tool === 'crop' && ui.lastCropPreset && !cropDraftActive()
      ? 'Reuse last applied crop in batch'
      : 'Use these settings in batch') +
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
          icon({ text: 'text', image: 'image', signature: 'sign' }[a.type] || 'highlight') +
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
function panelTitle() {
  const item = selectedItem();
  if (item?.type === 'text') return 'Edit text';
  if (item?.type === 'image') return 'Edit image';
  if (item?.type === 'signature') return 'Edit signature';
  if (item?.type === 'highlight') return 'Edit highlight';
  return names[ui.tool];
}
function panelFields() {
  const item = selectedItem(),
    index = activeIndex();
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
        '<div class="scope-note wide">Use <strong>{page}</strong> and <strong>{total}</strong> for automatic page numbering.</div><div class="field-section wide">HEADER</div>' +
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
        numberField('Edge margin (pt)', 'margin', 12, 100) +
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
        numberField('Edge margin (pt)', 'margin', 12, 100) +
        '</div>' +
        scopeFields() +
        batchLink()
      );
    case 'pages':
      return (
        '<div class="scope-note wide"><strong>' +
        ui.selected.size +
        ' of ' +
        state.pages.length +
        ' pages selected.</strong> Select pages with the checkboxes beneath each thumbnail.</div><div class="selection-buttons wide"><button type="button" data-action="select-all">Select all</button><button type="button" data-action="select-none">Clear selection</button></div>' +
        textField('Select page numbers', 'range', 'e.g. 1-3, 5', true) +
        '<button type="button" class="button secondary" data-action="select-range">Select range</button><div class="field-section wide">SELECTED PAGES</div><div class="mini-actions wide"><button type="button" class="button secondary" data-action="rotate">' +
        icon('rotate') +
        'Rotate 90°</button><button type="button" class="button danger" data-action="delete-pages">' +
        icon('trash') +
        'Remove</button></div><button type="button" class="button secondary" data-action="extract">' +
        icon('download') +
        'Download selected pages</button><div class="field-section wide">CURRENT PAGE · <span data-current-page>' +
        (index + 1) +
        '</span></div><div class="mini-actions wide"><button type="button" class="button secondary" data-action="move-earlier"' +
        (index === 0 ? ' disabled' : '') +
        '>' +
        icon('up') +
        'Move earlier</button><button type="button" class="button secondary" data-action="move-later"' +
        (index === state.pages.length - 1 ? ' disabled' : '') +
        '>' +
        icon('down') +
        'Move later</button></div><button type="button" class="button secondary" data-action="insert-blank">' +
        icon('plus') +
        'Add a blank page after it</button>'
      );
    case 'delete':
      return (
        '<div class="scope-note wide"><strong>' +
        ui.selected.size +
        ' of ' +
        state.pages.length +
        ' pages selected for deletion.</strong><br>' +
        (state.pages.length - ui.selected.size) +
        ' pages will remain.</div><div class="selection-buttons wide"><button type="button" data-action="select-all">Select all</button><button type="button" data-action="select-none">Clear selection</button></div>' +
        textField('Page numbers to delete', 'range', 'e.g. 2, 4-6', true) +
        '<button type="button" class="button secondary" data-action="select-range">Select range</button><p class="field-hint wide">Numbers follow the current page order. Checked thumbnails are the pages to delete.</p><button type="button" class="button danger" data-action="delete-pages"' +
        (!ui.selected.size || ui.selected.size === state.pages.length ? ' disabled' : '') +
        '>' +
        icon('trash') +
        'Delete ' +
        ui.selected.size +
        ' selected page' +
        (ui.selected.size === 1 ? '' : 's') +
        '</button><p class="field-hint wide">' +
        (ui.selected.size === state.pages.length
          ? 'Keep at least one page. Deselect a page to continue.'
          : 'Deleted pages leave at once. Undo brings them back.') +
        '</p>'
      );
    case 'crop':
      return (
        '<div class="scope-note wide">Margins are percentages of each page’s <strong>current visible area</strong>. The outlined area is kept.</div><div class="field-row">' +
        numberField('Top (%)', 'top', 0, 99, 0.1) +
        numberField('Bottom (%)', 'bottom', 0, 99, 0.1) +
        '</div><div class="field-row">' +
        numberField('Left (%)', 'left', 0, 99, 0.1) +
        numberField('Right (%)', 'right', 0, 99, 0.1) +
        '</div>' +
        selectField(
          'Apply to',
          'scope',
          [
            ['current', 'Current page'],
            ['all', 'Every page'],
            ['selected', 'Selected pages'],
          ],
          true,
        ) +
        '<p id="crop-summary" class="field-hint wide" aria-live="polite"></p>' +
        '<button type="submit" class="button primary">' +
        icon('crop') +
        'Crop to the outlined area</button>' +
        '<button type="button" class="button secondary" data-action="clear-crop-margins">Clear margins</button><button type="button" class="button subtle" data-action="restore-crop">Restore original crop for scope</button><p class="field-hint wide">Cropping hides content outside the boundary; it does not securely remove it. Text and graphics keep their original quality.</p>' +
        batchLink()
      );
    case 'merge':
      return (
        '<div class="file-list wide">' +
        state.sources
          .filter((source) => state.pages.some((page) => page.sourceId === source.id))
          .map(
            (source) =>
              '<div class="file-list-item"><strong>' +
              safe(source.name) +
              '</strong>' +
              source.pageCount +
              ' pages · ' +
              formatSize(source.bytes.length) +
              '</div>',
          )
          .join('') +
        '</div><button type="button" class="button primary" data-action="add-files">' +
        icon('plus') +
        'Add another PDF</button><div class="scope-note wide">New pages are added at the end. Use <strong>Organize pages</strong> to change their order, then download the combined PDF.</div><button type="button" class="button secondary" data-action="organize">' +
        icon('pages') +
        'Organize pages</button>'
      );
    case 'split':
      return splitFields();
    case 'protect':
      return protectFields();
    case 'unlock':
      return unlockFields();
    case 'signature':
      return signatureFields(item, index);
    case 'jpgtopdf':
      return jpgToPdfFields();
    case 'pdftojpg':
      return pdfToJpgFields();
    case 'form':
      return formPanel();
    case 'properties':
      return propertiesPanel();
  }
  return '';
}

// ---- Document properties -------------------------------------------------------------
// The title, author, subject, keywords and language a download carries: the
// first PDF's own (state.properties is null) until they are changed here.

const PROPERTY_FIELDS = ['title', 'author', 'subject', 'keywords', 'language'];
/** The details the first PDF keeps about itself (pictures and blank pages have none). */
function ownDetails() {
  return state.sources.find((source) => source.id === state.pages[0]?.sourceId)?.details || {};
}
export function currentProperties() {
  if (state.properties) return state.properties;
  const own = ownDetails();
  return Object.fromEntries(PROPERTY_FIELDS.map((name) => [name, own[name] || '']));
}
function propertiesPanel() {
  const own = ownDetails(),
    clean = Boolean(state.properties?.clean);
  const extra = clean
    ? []
    : [
        own.creator && 'made with ' + own.creator,
        own.producer && own.producer !== own.creator && 'saved by ' + own.producer,
        own.created && 'created on ' + new Date(own.created).toLocaleDateString(),
      ].filter(Boolean);
  return (
    textField('Title', 'title', '', true) +
    textField('Author', 'author', '', true) +
    textField('Subject', 'subject', '', true) +
    textField('Keywords', 'keywords', 'Separated by commas', true) +
    textField('Language', 'language', 'For example en-GB, de or zh-CN', true) +
    '<p class="field-hint wide" id="properties-extra">' +
    (extra.length
      ? 'Also in the file: ' + safe(extra.join(', ')) + '.'
      : clean
        ? 'Your download keeps only the details above.'
        : '') +
    '</p><button type="button" class="button danger" data-action="properties-clear">' +
    icon('trash') +
    'Remove all</button><p class="field-hint wide">Removes the title, author, subject and keywords, and what apps add without asking: which app made the PDF, when, and a second copy of these details. The language stays, because screen readers need it.</p>'
  );
}
/** Remove all: keep only the language, for privacy before sharing (one undo step). */
export function clearProperties() {
  change(() => (state.properties = { ...currentProperties(), title: '', author: '', subject: '', keywords: '', clean: true }));
  renderTool();
  toast('Details removed. Your download won’t include them.');
}
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
        ['letter', 'US Letter'],
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
    const base = safeBaseName(outputName()).replace(/-(edited|converted|protected|unlocked)$/, '');
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
const INK = [
  ['#141414', 'Black'],
  ['#1d3f9e', 'Blue'],
];
function signatureFields(item, index) {
  if (item?.type === 'signature')
    return (
      rangeField('Width', 'width', 2, 100) +
      '<p class="field-hint wide">Drag the signature to move it, or a corner to resize it. Arrow keys nudge it.</p>' +
      '<button type="button" class="button secondary" data-action="signature-copy">' +
      icon('pages') +
      'Put it here on every page</button>' +
      '<button type="button" class="button danger" data-action="delete-item">' +
      icon('trash') +
      'Delete signature</button>'
    );
  if (ui.signature)
    return (
      '<div class="signature-preview wide"><img src="' +
      signatureUrl() +
      '" alt="Your signature"></div>' +
      '<button type="button" class="button primary" data-action="signature-place">' +
      icon('plus') +
      'Add it to page <span data-current-page>' +
      (index + 1) +
      '</span>' +
      '</button><button type="button" class="button secondary" data-action="signature-place-all">' +
      icon('pages') +
      'Add it to every page</button>' +
      '<p class="field-hint wide">Or click the page where it belongs.</p>' +
      '<label class="check-field wide"><input type="checkbox" name="keepSignature"' +
      (ui.signatureKept ? ' checked' : '') +
      '> Keep it on this device for next time</label>' +
      '<button type="button" class="button subtle" data-action="signature-new">Make a new signature</button>'
    );
  const draft = ui.signatureDraft;
  const choice = (name, options, current, legend) =>
    '<fieldset class="segmented wide"><legend>' +
    legend +
    '</legend><div>' +
    options
      .map(
        ([value, text]) =>
          '<label><input type="radio" name="' +
          name +
          '" value="' +
          value +
          '"' +
          (value === current ? ' checked' : '') +
          '><span>' +
          text +
          '</span></label>',
      )
      .join('') +
    '</div></fieldset>';
  const modes = [
    ['draw', 'Draw'],
    ['type', 'Type'],
    ['upload', 'Upload'],
  ];
  let fields = choice('signatureMode', modes, draft.mode, 'Make your signature');
  if (draft.mode === 'draw')
    fields +=
      '<div class="signature-pad-wrap wide"><canvas id="signature-pad" class="signature-pad" role="img" aria-label="Signature drawing area" aria-describedby="signature-pad-hint"></canvas></div>' +
      '<p class="field-hint wide" id="signature-pad-hint">' +
      (touch() ? 'Sign with your finger or a pen.' : 'Sign with your mouse, trackpad or pen.') +
      '</p><button type="button" class="button subtle" data-action="signature-clear">Clear</button>';
  else if (draft.mode === 'type')
    fields +=
      makeField(
        'Your name',
        '<input name="signatureText" type="text" maxlength="60" autocomplete="name" spellcheck="false">',
        true,
      ) + '<div class="signature-typed wide" id="signature-typed" aria-hidden="true"></div>';
  else
    fields +=
      '<button type="button" class="button primary" data-action="signature-choose">' +
      icon('image') +
      'Choose a picture of it</button>' +
      '<label class="check-field wide"><input type="checkbox" name="removeBackground"' +
      (draft.removeBackground ? ' checked' : '') +
      '> Make the paper transparent</label>' +
      '<p class="field-hint wide">A PNG or JPG of your signature on light paper.</p>';
  if (draft.mode !== 'upload')
    fields +=
      choice('signatureColor', INK, draft.color, 'Ink') +
      '<button type="button" class="button primary" data-action="signature-use">' +
      icon('check') +
      'Use this signature</button>';
  return fields;
}
let signatureObjectUrl = null;
/** An address for the current signature's picture in the panel. */
function signatureUrl() {
  if (signatureObjectUrl?.bytes !== ui.signature.bytes) {
    if (signatureObjectUrl) URL.revokeObjectURL(signatureObjectUrl.url);
    signatureObjectUrl = {
      bytes: ui.signature.bytes,
      url: URL.createObjectURL(new Blob([ui.signature.bytes], { type: 'image/png' })),
    };
  }
  return signatureObjectUrl.url;
}
export let pad = null;
/** After the Sign panel is drawn: the drawing area, the typed preview and the Use button. */
function attachSignatureTools() {
  const canvas = $('#signature-pad');
  pad = canvas
    ? signaturePad(canvas, ui.signatureDraft.strokes, {
        color: ui.signatureDraft.color,
        onChange: updateSignatureButton,
      })
    : null;
  if ($('#signature-typed')) {
    updateTypedSignature();
    loadSignatureFont().catch((error) => toast(friendly(error), true));
  }
  updateSignatureButton();
}
function updateTypedSignature() {
  const node = $('#signature-typed');
  if (!node) return;
  node.textContent = ui.signatureDraft.text.trim() || 'Your name';
  node.classList.toggle('empty', !ui.signatureDraft.text.trim());
  node.style.color = ui.signatureDraft.color;
}
function updateSignatureButton() {
  const button = $('[data-action="signature-use"]');
  if (!button) return;
  const draft = ui.signatureDraft;
  button.disabled = draft.mode === 'draw' ? !draft.strokes.length : !draft.text.trim();
}
export function setSignature(signature) {
  ui.signature = signature;
  if (ui.signatureKept && !saveSignature(signature)) {
    ui.signatureKept = false;
    toast('This browser could not keep your signature. It stays until you close this tab.', true);
  } else toast(tapOrClick('Your signature is ready. Click the page where it belongs.'));
  renderTool();
}
export async function useSignature() {
  try {
    const draft = ui.signatureDraft;
    setSignature(
      draft.mode === 'type' ? await typedSignature(draft.text, draft.color) : await pad.toSignature(),
    );
  } catch (error) {
    toast(friendly(error), true);
  }
}
function keepSignature(keep) {
  if (keep && ui.signature && !saveSignature(ui.signature)) {
    toast('This browser could not keep your signature. It stays until you close this tab.', true);
    keep = false;
  }
  if (!keep) forgetSignature();
  ui.signatureKept = keep;
  announceMessage(keep ? 'Your signature will be kept on this device.' : 'Your signature is no longer kept.');
}
/** A signature's size and place: at a click, or near the lower right of the page. */
function signatureFrame(geometry, point = null) {
  const ratio = ui.signature.width / ui.signature.height;
  let width = Math.min(geometry.width * 0.32, 160),
    height = width / ratio;
  if (height > geometry.height * 0.12) {
    height = geometry.height * 0.12;
    width = height * ratio;
  }
  const margin = Math.min(geometry.width, geometry.height) * 0.08;
  return {
    x: point ? clamp(point.x - width / 2, 0, geometry.width - width) : geometry.width - margin - width,
    y: point
      ? clamp(point.y - height / 2, 0, geometry.height - height)
      : geometry.height - margin * 1.5 - height,
    width,
    height,
  };
}
function signatureAnnotation(page, geometry, frame, bytes = ui.signature.bytes) {
  return {
    id: uid(),
    pageId: page.id,
    pageRotation: page.rotation,
    pageCrop: page.crop ? { ...page.crop } : undefined,
    type: 'signature',
    x: frame.x / geometry.width,
    y: frame.y / geometry.height,
    width: frame.width / geometry.width,
    height: frame.height / geometry.height,
    opacity: 1,
    // Shared by every copy, so the PDF stores the picture once.
    imageBytes: bytes,
    imageType: 'png',
  };
}
/** Place the signature at a point on a page, or (from the panel) in the corner of the current page. */
export function placeSignature(point = null, page = currentPage()) {
  if (!ui.signature) {
    toast('Make your signature first: draw, type or upload it in the panel.');
    if (phone()) setSheet(true);
    return;
  }
  const geometry = geometryOf(state, page),
    annotation = signatureAnnotation(page, geometry, signatureFrame(geometry, point));
  change(() => state.annotations.push(annotation));
  // Placed with a button, it may be out of view.
  selectItem(annotation.id, { reveal: !point });
}
export function placeSignatureEverywhere() {
  const added = state.pages.map((page) => {
    const geometry = geometryOf(state, page);
    return signatureAnnotation(page, geometry, signatureFrame(geometry));
  });
  change(() => state.annotations.push(...added));
  selectItem(added[activeIndex()].id, { reveal: true });
  toast('Your signature is on all ' + added.length + ' pages. Drag any of them to adjust it.');
}
/** Copy a placed signature to the same place, at the same size, on every other page. */
export function copySignature(item) {
  const own = pageById(item.pageId),
    from = geometryOf(state, own);
  const width = item.width * from.width,
    height = item.height * from.height;
  const added = state.pages
    .filter((page) => page.id !== own.id)
    .map((page) => {
      const geometry = geometryOf(state, page),
        w = Math.min(width, geometry.width),
        h = Math.min(height, geometry.height);
      const frame = {
        x: clamp(item.x * geometry.width, 0, geometry.width - w),
        y: clamp(item.y * geometry.height, 0, geometry.height - h),
        width: w,
        height: h,
      };
      return signatureAnnotation(page, geometry, frame, item.imageBytes);
    });
  if (!added.length) return;
  change(() => state.annotations.push(...added));
  toast('Signature added to ' + added.length + ' more page' + (added.length === 1 ? '' : 's') + '.');
}
/** Whether downloads will need a password to open. */
export function protectedDownload() {
  return Boolean(state.protection && state.protection.enabled !== false && state.protection.password);
}
/** Protected PDFs in use: opened with a password, or limiting printing, copying or changes. */
function lockedSources() {
  return state.sources.filter(
    (source) => source.protection && state.pages.some((page) => page.sourceId === source.id),
  );
}
/** Whether Unlock PDF is giving a protected PDF back without its password. */
export function unlockedDownload() {
  return ui.tool === 'unlock' && !protectedDownload() && lockedSources().length > 0;
}
function protectFields() {
  return (
    makeField(
      'Password',
      '<input name="password" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" aria-describedby="protect-status">',
      true,
    ) +
    '<label class="check-field wide"><input type="checkbox" data-reveal-password> Show password</label>' +
    '<p id="protect-status" class="field-hint wide" aria-live="polite"></p>' +
    '<button type="button" class="button primary" data-action="download-protected">' +
    icon('lock') +
    'Download protected PDF</button>' +
    '<p class="field-hint wide">Encrypted with AES-256. Keep the password somewhere safe: QFT PDF doesn’t store it and can’t recover it.</p>'
  );
}
/** Show whether the typed password protects downloads, or why it can't. */
export function updateProtectionStatus() {
  const field = $('#tool-form [name="password"]'),
    status = $('#protect-status');
  if (!field || !status) return;
  const password = state.protection?.password || '';
  const problem = password ? passwordProblem(password) : null;
  field.setAttribute('aria-invalid', String(Boolean(problem)));
  status.classList.toggle('invalid', Boolean(problem));
  status.textContent =
    problem ||
    (password
      ? 'Your download will need this password to open.'
      : 'Type a password to protect your download.');
}
function unlockFields() {
  if (protectedDownload())
    return (
      '<div class="scope-note wide">Your download will need a password to open.</div>' +
      '<button type="button" class="button primary" data-action="remove-protection">' +
      icon('unlock') +
      'Remove the password</button>' +
      '<p class="field-hint wide">Your original file isn’t changed, and Undo brings the password back.</p>'
    );
  const used = lockedSources();
  if (!used.length)
    return (
      '<div class="scope-note wide">This PDF doesn’t have a password, so your download won’t need one either.</div>' +
      '<button type="button" class="button secondary" data-action="choose-protect">' +
      icon('lock') +
      'Add a password instead</button>'
    );
  return (
    '<div class="scope-note wide protection-note">' +
    icon('check') +
    '<span>Unlocked. Your download will open without a password' +
    (used.some((source) => source.protection === 'owner')
      ? ', and without limits on printing, copying or changes'
      : '') +
    '.</span></div>' +
    '<button type="button" class="button primary" data-action="download">' +
    icon('download') +
    'Download unlocked PDF</button>' +
    '<p class="field-hint wide">Your original file isn’t changed.</p>'
  );
}
/** Values the panel's fields show for the current tool and selection. */
function panelValues() {
  const item = selectedItem();
  switch (ui.tool) {
    case 'properties':
      return currentProperties();
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
    case 'watermark':
    case 'footer':
    case 'numbers': {
      const key = SETTINGS[ui.tool],
        setting = state[key] || settingDefaults[key]();
      const values = { ...setting, scope: setting.pages === 'all' || !setting.pages ? 'all' : 'pages' };
      if (key === 'watermark') values.opacity = Math.round(number(setting.opacity, 0.18, 0, 1) * 100);
      if (Array.isArray(setting.pages))
        values.scopePages = rangeText(setting.pages.map(pageIndexOf).filter((index) => index >= 0));
      return values;
    }
    case 'crop': {
      const draft = ui.cropDraft;
      return {
        ...Object.fromEntries(
          ['left', 'top', 'right', 'bottom'].map((edge) => [edge, Math.round(draft[edge] * 1000) / 10]),
        ),
        scope: draft.scope,
      };
    }
    case 'pages':
    case 'delete':
      return { range: ui.rangeDraft };
    case 'split':
      return ui.splitDraft;
    case 'protect':
      return { password: state.protection?.password || '' };
    case 'jpgtopdf':
      return { pictureSize: ui.pictureLayout.size, pictureMargin: String(ui.pictureLayout.margin) };
    case 'pdftojpg':
      return {
        pictureFormat: ui.pictureExport.format,
        pictureDpi: String(ui.pictureExport.dpi),
        pictureScope: ui.pictureExport.scope,
      };
    case 'signature': {
      if (item?.type !== 'signature') return { signatureText: ui.signatureDraft.text };
      const frame = overlayItem(item.id)?.frame,
        placement = overlayItem(item.id)?.placement;
      return {
        width: frame
          ? Math.round((frame.width / placement.width) * 100)
          : Math.round(number(item.width, 0.25) * 100),
      };
    }
  }
  return {};
}
/** Show current values in the panel without rebuilding it (the focused field keeps what is typed). */
export function fillForm({ all = false } = {}) {
  const form = $('#tool-form');
  if (!form) return;
  const values = panelValues();
  for (const input of $$('[name]', form)) {
    if (!(input.name in values) || (!all && input === document.activeElement)) continue;
    const value = values[input.name] ?? '';
    if (input.type === 'radio') input.checked = input.value === String(value);
    else if (input.value !== String(value)) input.value = value;
    input.removeAttribute('aria-invalid');
  }
  updateOutputs();
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
    $('#scope-hint').textContent = error || 'Numbers follow the current page order.';
    $('#scope-hint').classList.toggle('invalid', Boolean(error));
  }
  if (ui.tool === 'protect') updateProtectionStatus();
  const toggle = $('[role="switch"]', form);
  if (toggle) {
    const key = SETTINGS[ui.tool];
    toggle.setAttribute('aria-checked', String(Boolean(state[key]) && state[key].enabled !== false));
  }
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
  $('#tool-panel').innerHTML =
    '<h2 tabindex="-1">' +
    panelTitle() +
    '</h2><p class="panel-description">' +
    tapOrClick(descriptions[ui.tool]) +
    '</p><div id="panel-problems" class="panel-problems" role="status" hidden></div><form id="tool-form" novalidate>' +
    panelFields() +
    '</form>' +
    annotationList();
  const form = $('#tool-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (['delete', 'pages'].includes(ui.tool)) action('select-range');
    else if (ui.tool === 'split') generateSplit();
    else if (ui.tool === 'pdftojpg') savePictures();
    else if (ui.tool === 'crop') applyCrop();
  });
  form.addEventListener('input', onPanelInput);
  form.addEventListener('change', (event) => {
    // A number left empty or out of range goes back to the value in use.
    if (event.target.type === 'number' && !event.target.checkValidity()) fillForm({ all: true });
  });
  fillForm({ all: true });
  updateProblems(currentOverlay()?.problems || []);
  updateCropOverlays();
  updateDeletionMarks();
  if (ui.tool === 'split') updateSplitSummary();
  if (ui.tool === 'signature') attachSignatureTools();
  if (ui.tool === 'form') updateFormSummary();
  updateSelectionCaption();
  updateStageHint();
  if (restoreKey) restoreFocus(restoreKey);
}
function updateOutputs() {
  $$('input[type=range]', $('#tool-form') || document.createElement('form')).forEach((input) => {
    const output = $('output[data-for="' + input.name + '"]', $('#tool-form'));
    if (output) output.textContent = input.value + (input.dataset.unit || '');
  });
}
function validNumber(field) {
  return field.type !== 'number' || (field.value !== '' && field.checkValidity());
}
function onPanelInput(event) {
  const field = event.target,
    name = field.name;
  if (field.matches('[data-reveal-password]')) {
    $('#tool-form [name="password"]').type = field.checked ? 'text' : 'password';
    return;
  }
  if (name === 'flattenForms') {
    change(() => (state.flattenForms = field.checked));
    announceMessage(field.checked ? 'Fields will be flattened on download.' : 'Fields will stay fillable.');
    return;
  }
  if (ui.tool === 'properties' && PROPERTY_FIELDS.includes(name)) {
    change(() => (state.properties = { ...currentProperties(), [name]: field.value }), { key: 'properties:' + name });
    return;
  }
  if (!name) return;
  updateOutputs();
  if (!validNumber(field)) {
    field.setAttribute('aria-invalid', 'true');
    return;
  }
  field.removeAttribute('aria-invalid');
  const value = field.value,
    item = selectedItem();
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
    return;
  }
  if (SETTINGS[ui.tool]) {
    updateSetting(SETTINGS[ui.tool], name, value);
    return;
  }
  if (ui.tool === 'crop') {
    if (name === 'scope') ui.cropDraft.scope = value;
    else ui.cropDraft[name] = clamp(Number(value) / 100, 0, 0.99);
    updateCropOverlays();
    return;
  }
  if (ui.tool === 'jpgtopdf') {
    if (name === 'pictureSize') ui.pictureLayout.size = value;
    if (name === 'pictureMargin') ui.pictureLayout.margin = Number(value);
    relayoutPictures();
    return;
  }
  if (ui.tool === 'pdftojpg') {
    if (name === 'pictureFormat') ui.pictureExport.format = value;
    if (name === 'pictureDpi') ui.pictureExport.dpi = Number(value);
    if (name === 'pictureScope') ui.pictureExport.scope = value;
    return;
  }
  if (ui.tool === 'signature') {
    const draft = ui.signatureDraft;
    if (name === 'signatureMode') {
      draft.mode = value;
      renderTool();
      $('#tool-form [name="signatureMode"]:checked')?.focus();
    } else if (name === 'signatureText') {
      draft.text = value;
      updateTypedSignature();
      updateSignatureButton();
    } else if (name === 'signatureColor') {
      draft.color = value;
      pad?.setColor(value);
      updateTypedSignature();
    } else if (name === 'removeBackground') draft.removeBackground = field.checked;
    else if (name === 'keepSignature') keepSignature(field.checked);
    else if (name === 'width' && item?.type === 'signature') resizeImageTo(item, Number(value) / 100);
    return;
  }
  if (ui.tool === 'protect' && name === 'password') {
    change(() => (state.protection = value ? { enabled: true, password: value } : null), {
      key: 'protection',
    });
    updateProtectionStatus();
    return;
  }
  if (ui.tool === 'split') {
    ui.splitDraft[name] = value;
    ui.splitResults = null;
    $('#split-results')?.replaceChildren();
    updateSplitSummary();
    return;
  }
  if (name === 'range') ui.rangeDraft = value;
}
function resizeImageTo(annotation, fraction) {
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
  });
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
  change(() => {
    if (!state[key]) state[key] = settingDefaults[key]();
    else state[key].enabled = state[key].enabled === false;
  });
  fillForm();
  const on = state[key].enabled !== false;
  announceMessage(names[ui.tool] + (on ? ' shown.' : ' hidden.'));
}
export function cropDraftActive() {
  const draft = ui.cropDraft;
  return ['left', 'top', 'right', 'bottom'].some((edge) => draft[edge] > 0);
}
export function cropValues() {
  const margins = Object.fromEntries(
    ['left', 'top', 'right', 'bottom'].map((edge) => [edge, ui.cropDraft[edge]]),
  );
  if (
    Object.values(margins).some((value) => !Number.isFinite(value) || value < 0 || value >= 1) ||
    margins.left + margins.right >= 0.99 ||
    margins.top + margins.bottom >= 0.99
  )
    throw new Error('Keep more than 1% of the width and height. Reduce the crop margins.');
  return margins;
}
/** Outline the area to keep on the pages the crop applies to (and on the page being dragged on). */
export function updateCropOverlays() {
  const enabled = ui.tool === 'crop' && state.pages.length > 0,
    summary = $('#crop-summary');
  let crop = null;
  if (enabled) {
    try {
      crop = cropValues();
      if (summary)
        summary.textContent =
          'Keep ' +
          ((1 - crop.left - crop.right) * 100).toFixed(1) +
          '% of width × ' +
          ((1 - crop.top - crop.bottom) * 100).toFixed(1) +
          '% of height.';
    } catch (error) {
      if (summary) summary.textContent = error.message;
    }
  }
  const scope = ui.cropDraft.scope,
    inset = crop
      ? [crop.top, crop.right, crop.bottom, crop.left].map((value) => value * 100 + '%').join(' ')
      : '';
  for (const view of ui.stage.views.values()) {
    const shown =
      Boolean(crop) &&
      (scope === 'all' ||
        (scope === 'current' ? view.id === ui.activeId : ui.selected.has(view.id)) ||
        (ui.gesture?.type === 'crop' && ui.gesture.pageId === view.id));
    view.crop.hidden = !shown;
    if (shown) view.crop.style.inset = inset;
  }
}
/** Pages selected for deletion are marked in the page strip and on the stage. */
export function updateDeletionMarks() {
  $$('.page-item').forEach((item) => {
    const deleting = ui.tool === 'delete' && ui.selected.has(item.dataset.pageId);
    item.classList.toggle('marked-delete', deleting);
    const badge = $('.delete-badge', item);
    if (badge) badge.hidden = !deleting;
  });
  for (const view of ui.stage.views.values()) markView(view);
}
export function scopedPages(value) {
  if (value === 'all') return 'all';
  if (value === 'current') return [ui.activeId];
  const ids = state.pages.filter((p) => ui.selected.has(p.id)).map((p) => p.id);
  if (!ids.length) throw new Error('Select at least one page in the page strip, or choose Every page.');
  return ids;
}
function applyCrop() {
  try {
    const margins = cropValues(),
      scope = scopedPages(ui.cropDraft.scope);
    if (!Object.values(margins).some((value) => value > 0))
      throw new Error('Set a margin or drag an area to keep before cropping.');
    const targets = state.pages.filter((p) => scope === 'all' || scope.includes(p.id));
    // Check every new boundary before changing anything.
    for (const page of targets) {
      const geometry = geometryOf(state, page);
      if (
        (1 - margins.left - margins.right) * geometry.width < 1 ||
        (1 - margins.top - margins.bottom) * geometry.height < 1
      )
        throw new Error('The cropped page must be at least 1 PDF point wide and high.');
    }
    change(
      () => {
        for (const p of targets) {
          const old = cropMarginsForRotation(p.crop, p.rotation),
            width = 1 - old.left - old.right,
            height = 1 - old.top - old.bottom;
          p.crop = {
            left: old.left + margins.left * width,
            right: old.right + margins.right * width,
            top: old.top + margins.top * height,
            bottom: old.bottom + margins.bottom * height,
            rotation: p.rotation,
          };
        }
      },
      { layout: true },
    );
    ui.lastCropPreset = margins;
    ui.cropDraft = { left: 0, top: 0, right: 0, bottom: 0, scope: ui.cropDraft.scope };
    renderTool();
    toast(targets.length === 1 ? 'Page cropped.' : targets.length + ' pages cropped.');
  } catch (error) {
    toast(friendly(error), true);
  }
}

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
        (omitted ? ' ' + omitted + ' page' + (omitted === 1 ? ' is' : 's are') + ' outside these groups.' : '');
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
    const { bytes } = await exportDocument(password ? { ...snapshot(), protection: null } : null);
    ui.cancelOperation = false;
    busy(true, 'Creating split PDFs…');
    cancellable('Cancel splitting', null);
    const outputs = await splitPdf(bytes, groups, {
      password,
      onProgress: (value) => {
        $('#busy-message').textContent = 'Creating split PDFs… ' + Math.round(value * 100) + '%';
      },
      shouldCancel: () => ui.cancelOperation,
    });
    const base = safeBaseName(outputName()).replace(/-edited$/, '');
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
        (password ? (outputs.length === 1 ? ' It needs' : ' Each needs') + ' your password to open.' : ''),
    );
  } catch (error) {
    if (error.name === 'AbortError') toast('Splitting cancelled. Your document is unchanged.');
    else showExportError(error);
  } finally {
    busy(false);
  }
}
