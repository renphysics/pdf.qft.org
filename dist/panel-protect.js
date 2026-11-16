/**
 * The Protect PDF and Unlock PDF panels: a password for the download, or none.
 * (tool-panel.js describes the panel interface.)
 */

import { passwordProblem } from './pdf-engine.js';
import { $, icon, lockedSources, protectedDownload, state, ui } from './editor-core.js';
import { change } from './history.js';
import { makeField } from './tool-panel.js';
import { t } from './i18n.js';

function protectFields() {
  return (
    makeField(
      t('Password'),
      '<input name="password" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" aria-describedby="protect-status">',
      true,
    ) +
    '<label class="check-field wide"><input type="checkbox" data-reveal-password> ' +
    t('Show password') +
    '</label><p id="protect-status" class="field-hint wide" aria-live="polite"></p>' +
    '<button type="button" class="button primary" data-action="download-protected">' +
    icon('lock') +
    t('Download protected PDF') +
    '</button><p class="field-hint wide">' +
    t(
      'Encrypted with AES-256. Keep the password somewhere safe: QFT PDF doesn’t store it and can’t recover it.',
    ) +
    '</p>'
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
      ? t('Your download will need this password to open.')
      : t('Type a password to protect your download.'));
}
function unlockFields() {
  if (protectedDownload())
    return (
      '<div class="scope-note wide">' +
      t('Your download will need a password to open.') +
      '</div><button type="button" class="button primary" data-action="remove-protection">' +
      icon('unlock') +
      t('Remove the password') +
      '</button><p class="field-hint wide">' +
      t('Your original file isn’t changed, and Undo brings the password back.') +
      '</p>'
    );
  const used = lockedSources();
  if (!used.length)
    return (
      '<div class="scope-note wide">' +
      t('This PDF doesn’t have a password, so your download won’t need one either.') +
      '</div><button type="button" class="button secondary" data-action="choose-protect">' +
      icon('lock') +
      t('Add a password instead') +
      '</button>'
    );
  return (
    '<div class="scope-note wide protection-note">' +
    icon('check') +
    '<span>' +
    (used.some((source) => source.protection === 'owner')
      ? t(
          'Unlocked. Your download will open without a password, and without limits on printing, copying or changes.',
        )
      : t('Unlocked. Your download will open without a password.')) +
    '</span></div><button type="button" class="button primary" data-action="download">' +
    icon('download') +
    t('Download unlocked PDF') +
    '</button><p class="field-hint wide">' +
    t('Your original file isn’t changed.') +
    '</p>'
  );
}
export function fields() {
  return ui.tool === 'protect' ? protectFields() : unlockFields();
}
export function values() {
  return ui.tool === 'protect' ? { password: state.protection?.password || '' } : {};
}
export function onInput(name, value, field) {
  if (field.matches('[data-reveal-password]')) {
    $('#tool-form [name="password"]').type = field.checked ? 'text' : 'password';
    return;
  }
  if (ui.tool === 'protect' && name === 'password') {
    change(() => (state.protection = value ? { enabled: true, password: value } : null), {
      key: 'protection',
      label: t('Password'),
    });
    updateProtectionStatus();
  }
}
export function afterFill() {
  if (ui.tool === 'protect') updateProtectionStatus();
}
