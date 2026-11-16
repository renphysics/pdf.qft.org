/**
 * The Sign PDF panel: making a signature (drawn, typed or uploaded), keeping it,
 * and the selected placed signature's size. Placing it on pages is in
 * page-items.js with the other items. (tool-panel.js describes the panel
 * interface.)
 */

import {
  forgetSignature,
  loadSignatureFont,
  saveSignature,
  signaturePad,
  typedSignature,
} from './signature.js';
import { number } from './layout.js';
import { $, announceMessage, friendly, icon, tapOrClick, toast, touch, ui } from './editor-core.js';
import { overlayItem } from './page-view.js';
import { makeField, rangeField, renderTool, resizeImageTo } from './tool-panel.js';
import { t } from './i18n.js';

const INK = [
  ['#141414', t('Black')],
  ['#1d3f9e', t('Blue')],
];
// Letters the handwriting font draws; any other writing in a typed name (Chinese, say) is drawn in a plain font.
const HANDWRITTEN = /^[\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]*$/u;
function signatureFields(item, index) {
  if (item?.type === 'signature')
    return (
      rangeField(t('Width'), 'width', 2, 100) +
      '<p class="field-hint wide">' +
      t(
        'Drag the signature to move it, or a corner to resize it. Arrow keys move it, and with Alt they resize it.',
      ) +
      '</p><button type="button" class="button secondary" data-action="signature-copy">' +
      icon('pages') +
      t('Put it here on every page') +
      '</button><button type="button" class="button danger" data-action="delete-item">' +
      icon('trash') +
      t('Delete signature') +
      '</button>'
    );
  if (ui.signature)
    return (
      '<div class="signature-preview wide"><img src="' +
      signatureUrl() +
      '" alt="' +
      t('Your signature') +
      '"></div><button type="button" class="button primary" data-action="signature-place">' +
      icon('plus') +
      '<span>' +
      t('Add it to page {page}', { page: '<span data-current-page>' + (index + 1) + '</span>' }) +
      '</span>' +
      '</button><button type="button" class="button secondary" data-action="signature-place-all">' +
      icon('pages') +
      t('Add it to every page') +
      '</button><p class="field-hint wide">' +
      t('Or click the page where it belongs.') +
      '</p><label class="check-field wide"><input type="checkbox" name="keepSignature"' +
      (ui.signatureKept ? ' checked' : '') +
      '> ' +
      t('Keep it on this device for next time') +
      '</label><button type="button" class="button subtle" data-action="signature-new">' +
      t('Make a new signature') +
      '</button>'
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
    ['draw', t('Draw')],
    ['type', t('Type')],
    ['upload', t('Upload')],
  ];
  let fields = choice('signatureMode', modes, draft.mode, t('Make your signature'));
  if (draft.mode === 'draw')
    fields +=
      '<div class="signature-pad-wrap wide"><canvas id="signature-pad" class="signature-pad" role="img" aria-label="' +
      t('Signature drawing area') +
      '" aria-describedby="signature-pad-hint"></canvas></div><p class="field-hint wide" id="signature-pad-hint">' +
      (touch() ? t('Sign with your finger or a pen.') : t('Sign with your mouse, trackpad or pen.')) +
      '</p><button type="button" class="button subtle" data-action="signature-clear">' +
      t('Clear') +
      '</button>';
  else if (draft.mode === 'type')
    fields +=
      makeField(
        t('Your name'),
        '<input name="signatureText" type="text" maxlength="60" autocomplete="name" spellcheck="false" aria-describedby="signature-typed-note">',
        true,
      ) +
      '<div class="signature-typed wide" id="signature-typed" aria-hidden="true"></div>' +
      '<p class="field-hint wide" id="signature-typed-note" hidden>' +
      t('The handwriting style has Latin letters only: the rest of your name is drawn in a plain font.') +
      '</p>';
  else
    fields +=
      '<button type="button" class="button primary" data-action="signature-choose">' +
      icon('image') +
      t('Choose a picture of it') +
      '</button><label class="check-field wide"><input type="checkbox" name="removeBackground"' +
      (draft.removeBackground ? ' checked' : '') +
      '> ' +
      t('Make the paper transparent') +
      '</label><p class="field-hint wide">' +
      t('A PNG or JPG of your signature on light paper.') +
      '</p>';
  if (draft.mode !== 'upload')
    fields +=
      choice('signatureColor', INK, draft.color, t('Ink')) +
      '<button type="button" class="button primary" data-action="signature-use">' +
      icon('check') +
      t('Use this signature') +
      '</button>';
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
  node.textContent = ui.signatureDraft.text.trim() || t('Your name');
  node.classList.toggle('empty', !ui.signatureDraft.text.trim());
  node.style.color = ui.signatureDraft.color;
  const note = $('#signature-typed-note');
  if (note) note.hidden = HANDWRITTEN.test(ui.signatureDraft.text);
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
    toast(t('This browser could not keep your signature. It stays until you close this tab.'), true);
  } else toast(tapOrClick(t('Your signature is ready. Click the page where it belongs.')));
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
    toast(t('This browser could not keep your signature. It stays until you close this tab.'), true);
    keep = false;
  }
  if (!keep) forgetSignature();
  ui.signatureKept = keep;
  announceMessage(
    keep ? t('Your signature will be kept on this device.') : t('Your signature is no longer kept.'),
  );
}
export function title(item) {
  return item?.type === 'signature' ? t('Edit signature') : null;
}
export function fields(item, index) {
  return signatureFields(item, index);
}
export function values(item) {
  if (item?.type !== 'signature') return { signatureText: ui.signatureDraft.text };
  const frame = overlayItem(item.id)?.frame,
    placement = overlayItem(item.id)?.placement;
  return {
    width: frame
      ? Math.round((frame.width / placement.width) * 100)
      : Math.round(number(item.width, 0.25) * 100),
  };
}
export function onInput(name, value, field, item) {
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
  } else if (name === 'removeBackground') draft.removeBackground = value;
  else if (name === 'keepSignature') keepSignature(value);
  else if (name === 'width' && item?.type === 'signature') resizeImageTo(item, Number(value) / 100);
}
export function afterRender() {
  attachSignatureTools();
}
