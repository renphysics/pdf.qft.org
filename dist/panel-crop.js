/**
 * The Crop PDF panel: margins to trim (a draft in ui.cropDraft, outlined on the
 * pages it applies to) and the crop itself. (tool-panel.js describes the panel
 * interface.)
 */

import { contentMargins, cropMarginsForRotation } from './pdf-engine.js';
import { geometryOf } from './preview.js';
import { $, clamp, friendly, icon, state, toast, ui } from './editor-core.js';
import { change } from './history.js';
import { batchLink, numberField, renderTool, selectField } from './tool-panel.js';

export function fields() {
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
    batchLink(
      ui.lastCropPreset && !cropDraftActive()
        ? 'Reuse last applied crop in batch'
        : 'Use these settings in batch',
    )
  );
}
export function values() {
  const draft = ui.cropDraft;
  return {
    ...Object.fromEntries(
      ['left', 'top', 'right', 'bottom'].map((edge) => [edge, Math.round(draft[edge] * 1000) / 10]),
    ),
    scope: draft.scope,
  };
}
export function onInput(name, value) {
  if (name === 'scope') ui.cropDraft.scope = value;
  else ui.cropDraft[name] = clamp(Number(value) / 100, 0, 0.99);
  updateCropOverlays();
}
export function onSubmit() {
  applyCrop();
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
            // Margins added before stay blank (see contentMargins).
            shown = p.crop?.content ? contentMargins(p.crop, p.rotation) : null,
            width = 1 - old.left - old.right,
            height = 1 - old.top - old.bottom;
          p.crop = {
            left: old.left + margins.left * width,
            right: old.right + margins.right * width,
            top: old.top + margins.top * height,
            bottom: old.bottom + margins.bottom * height,
            rotation: p.rotation,
            ...(shown ? { content: shown } : {}),
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
