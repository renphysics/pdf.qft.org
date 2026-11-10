/**
 * The Document properties panel: the title, author, subject, keywords and
 * language a download carries, the first PDF's own until changed here.
 * (tool-panel.js describes the panel interface.)
 */

import { icon, safe, state, toast } from './editor-core.js';
import { change } from './history.js';
import { renderTool, textField } from './tool-panel.js';

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
    { label: 'Remove details' },
  );
  renderTool();
  toast('Details removed. Your download won’t include them.');
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
