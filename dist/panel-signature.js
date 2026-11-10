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
export function title(item) {
  return item?.type === 'signature' ? 'Edit signature' : null;
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
