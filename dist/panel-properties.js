/**
 * The Document properties panel: the title, author, subject, keywords and
 * language a download carries, the first PDF's own until changed here.
 * (tool-panel.js describes the panel interface.)
 */

import { icon, safe, state, toast } from './editor-core.js';
import { change } from './history.js';
import { renderTool, textField } from './tool-panel.js';
import { LOCALE, t } from './i18n.js';

const PROPERTY_FIELDS = ['title', 'author', 'subject', 'keywords', 'language'];
/** The details the first PDF keeps about itself (pictures and blank pages have none). */
function ownDetails() {
  return state.sources.find((source) => source.id === state.pages[0]?.sourceId)?.details || {};
}
function currentProperties() {
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
        own.creator && t('made with {app}', { app: own.creator }),
        own.producer && own.producer !== own.creator && t('saved by {app}', { app: own.producer }),
        own.created && t('created on {date}', { date: new Date(own.created).toLocaleDateString(LOCALE) }),
      ].filter(Boolean);
  return (
    textField(t('Title'), 'title', '', true) +
    textField(t('Author'), 'author', '', true) +
    textField(t('Subject'), 'subject', '', true) +
    textField(t('Keywords'), 'keywords', t('Separated by commas'), true) +
    textField(t('Language'), 'language', t('For example en-GB, de or zh-CN'), true) +
    '<p class="field-hint wide" id="properties-extra">' +
    (extra.length
      ? t('Also in the file: {details}.', { details: safe(extra.join(t(', '))) })
      : clean
        ? t('Your download keeps only the details above.')
        : '') +
    '</p><button type="button" class="button danger" data-action="properties-clear">' +
    icon('trash') +
    t('Remove all') +
    '</button><p class="field-hint wide">' +
    t(
      'Removes the title, author, subject and keywords, and what apps add without asking: which app made the PDF, when, and a second copy of these details. The language stays, because screen readers need it.',
    ) +
    '</p>'
  );
}
/** Remove all: keep only the language, for privacy before sharing (one undo step). */
export function clearProperties() {
  change(
    () =>
      (state.properties = {
        ...currentProperties(),
        title: '',
        author: '',
        subject: '',
        keywords: '',
        clean: true,
      }),
    { label: t('Remove details') },
  );
  renderTool();
  toast(t('Details removed. Your download won’t include them.'));
}
export function fields() {
  return propertiesPanel();
}
export function values() {
  return currentProperties();
}
export function onInput(name, value) {
  if (PROPERTY_FIELDS.includes(name))
    change(() => (state.properties = { ...currentProperties(), [name]: value }), {
      key: 'properties:' + name,
    });
}
