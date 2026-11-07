/**
 * The Add margins panel: blank space around the pages in scope (a draft in
 * ui.marginDraft), and taking it away again. (tool-panel.js describes the panel
 * interface.)
 */

import { contentMargins, cropMarginsForRotation } from './pdf-engine.js';
import { geometryOf } from './preview.js';
import { friendly, icon, state, toast, ui } from './editor-core.js';
import { change } from './history.js';
import { scopedPages } from './panel-crop.js';
import { fillForm, numberField, renderTool, selectField } from './tool-panel.js';

const MM = 72 / 25.4; // points in a millimetre
function marginFields() {
  return (
    '<div class="field-row">' +
    numberField('Top (mm)', 'marginTop', 0, 100) +
    numberField('Bottom (mm)', 'marginBottom', 0, 100) +
    '</div><div class="field-row">' +
    numberField('Left (mm)', 'marginLeft', 0, 100) +
    numberField('Right (mm)', 'marginRight', 0, 100) +
    '</div><button type="button" class="button secondary" data-action="margins-notes">' +
    icon('margins') +
    'A wide right margin for notes</button>' +
    selectField(
      'Apply to',
      'marginScope',
      [
        ['all', 'Every page'],
        ['current', 'Current page'],
        ['selected', 'Selected pages'],
      ],
      true,
    ) +
    '<button type="submit" class="button primary">' +
    icon('plus') +
    'Add margins</button><button type="button" class="button subtle" data-action="margins-remove">Remove added margins</button>' +
    '<p class="field-hint wide">The margins are blank space around each page: nothing on it moves or shrinks. Page numbers, headers and footers go to the new edges.</p>'
  );
}
/** A wide right margin for notes: 60 mm, the others none. */
export function notesMargin() {
  ui.marginDraft = { ...ui.marginDraft, top: 0, bottom: 0, left: 0, right: 60 };
  fillForm({ all: true });
}
/**
 * Add the margins in ui.marginDraft (millimetres) around the pages in scope, as
 * one undo step: their crop grows outwards (negative crop margins), and what
 * they show now becomes their content area, so the new space is blank.
 */
function addMargins() {
  try {
    const draft = ui.marginDraft,
      added = Object.fromEntries(['top', 'bottom', 'left', 'right'].map((edge) => [edge, draft[edge] * MM])),
      scope = scopedPages(draft.scope);
    if (!Object.values(added).some((value) => value > 0))
      throw new Error('Enter the margins to add, in millimetres.');
    const targets = state.pages.filter((p) => scope === 'all' || scope.includes(p.id));
    for (const page of targets) {
      const geometry = geometryOf(state, page);
      if (
        geometry.width + added.left + added.right > 14400 ||
        geometry.height + added.top + added.bottom > 14400
      )
        throw new Error('A page can’t be larger than 5 metres (200 inches).');
    }
    change(
      () => {
        for (const p of targets) {
          const geometry = geometryOf(state, p),
            old = cropMarginsForRotation(p.crop, p.rotation),
            shown = contentMargins(p.crop, p.rotation),
            width = 1 - old.left - old.right,
            height = 1 - old.top - old.bottom;
          p.crop = {
            left: old.left - (added.left / geometry.width) * width,
            right: old.right - (added.right / geometry.width) * width,
            top: old.top - (added.top / geometry.height) * height,
            bottom: old.bottom - (added.bottom / geometry.height) * height,
            rotation: p.rotation,
            // What the page shows now, within what it showed before margins were added.
            content: Object.fromEntries(
              ['left', 'top', 'right', 'bottom'].map((edge) => [edge, Math.max(old[edge], shown[edge])]),
            ),
          };
        }
      },
      { layout: true },
    );
    ui.marginDraft = { top: 0, bottom: 0, left: 0, right: 0, scope: draft.scope };
    renderTool();
    toast(
      targets.length === 1 ? 'Margins added to the page.' : 'Margins added to ' + targets.length + ' pages.',
    );
  } catch (error) {
    toast(friendly(error), true);
  }
}
/** Take away the margins added to the pages in scope (one undo step); a crop made since stays. */
export function removeMargins() {
  try {
    const scope = scopedPages(ui.marginDraft.scope),
      targets = state.pages.filter((p) => (scope === 'all' || scope.includes(p.id)) && p.crop?.content);
    if (!targets.length) throw new Error('These pages have no added margins.');
    change(
      () => {
        for (const p of targets) {
          const old = cropMarginsForRotation(p.crop, p.rotation),
            shown = contentMargins(p.crop, p.rotation),
            crop = Object.fromEntries(
              ['left', 'top', 'right', 'bottom'].map((edge) => [edge, Math.max(old[edge], shown[edge])]),
            );
          if (Object.values(crop).every((value) => Math.abs(value) < 1e-9)) delete p.crop;
          else p.crop = { ...crop, rotation: p.rotation };
        }
      },
      { layout: true },
    );
    renderTool();
    toast(
      targets.length === 1
        ? 'The added margins are removed.'
        : 'Added margins removed from ' + targets.length + ' pages.',
    );
  } catch (error) {
    toast(friendly(error), true);
  }
}
export function fields() {
  return marginFields();
}
export function values() {
  const draft = ui.marginDraft;
  return {
    marginTop: draft.top,
    marginBottom: draft.bottom,
    marginLeft: draft.left,
    marginRight: draft.right,
    marginScope: draft.scope,
  };
}
export function onInput(name, value) {
  const edges = { marginTop: 'top', marginBottom: 'bottom', marginLeft: 'left', marginRight: 'right' };
  if (edges[name]) ui.marginDraft[edges[name]] = Number(value);
  if (name === 'marginScope') ui.marginDraft.scope = value;
}
export function onSubmit() {
  addMargins();
}
