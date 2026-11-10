/**
 * Edit history. Edits apply at once: each change() is one undo step, except
 * that changes with the same key in quick succession (typing, dragging, a
 * slider) merge into one. Each step carries a label, which Undo and Redo show.
 *
 * Any module may import change() from here: this module imports only
 * editor-core.js, and what the editor redraws after a change is registered by
 * app.js with onDocumentChanged(), so nothing has to import app.js back.
 */

import {
  $,
  activeIndex,
  dropDefaultSelection,
  names,
  selectedItem,
  setState,
  snapshot,
  state,
  ui,
} from './editor-core.js';

const listeners = [];
/** Register what to bring up to date after every change (the editor's renders). */
export function onDocumentChanged(listener) {
  listeners.push(listener);
}
/** The document and selection as they are now: one undo entry. */
export function record() {
  return {
    state: snapshot(),
    active: ui.activeId,
    selected: new Set(ui.selected),
    selectedByDefault: ui.selectedByDefault,
    item: ui.item,
  };
}
/**
 * Make an edit. `label` names it for Undo ("Undo: Rotate pages"); without one
 * it is named after the tool in use.
 */
export function change(mutate, { key = null, layout = false, before = null, label = null } = {}) {
  const now = performance.now();
  const merge = key && ui.lastChange?.key === key && now - ui.lastChange.time < 1500;
  if (!merge) {
    ui.past.push({ ...(before || record()), label: label || names[ui.tool] });
    if (ui.past.length > 100) ui.past.shift();
  }
  ui.future = [];
  ui.lastChange = key ? { key, time: now } : null;
  ui.lastActiveIndex = activeIndex();
  mutate();
  ui.version++;
  if (ui.splitResults) {
    ui.splitResults = null;
    $('#split-results')?.replaceChildren();
  }
  documentChanged(layout);
}
/** Bring the editor up to date with the document. `layout`: pages were added, removed, moved, turned or cropped. */
export function documentChanged(layout) {
  if (!state.pages.some((p) => p.id === ui.activeId)) {
    // The current page was removed: the page now in its place becomes current.
    ui.activeId = state.pages[Math.min(ui.lastActiveIndex || 0, state.pages.length - 1)]?.id;
    ui.stage.reveal = ui.activeId;
  }
  ui.selected = new Set([...ui.selected].filter((id) => state.pages.some((p) => p.id === id)));
  if (ui.item && !selectedItem()) ui.item = null;
  for (const listener of listeners) listener(layout);
}
/**
 * Undo or redo: restore the entry on top of `from`, keeping the present on
 * `to`. Both show the page where the change was made. Returns the entry
 * restored, or null when there is none (or the editor is busy).
 */
export function travel(from, to) {
  if (ui.busy || !from.length) return null;
  const entry = from.pop();
  to.push({ ...record(), active: entry.active, label: entry.label });
  setState(entry.state);
  ui.activeId = entry.active;
  ui.stage.reveal = entry.active;
  ui.selected = entry.selected;
  ui.selectedByDefault = Boolean(entry.selectedByDefault);
  dropDefaultSelection();
  ui.item = entry.item;
  ui.lastChange = null;
  ui.pendingRecord = null;
  ui.version++;
  ui.splitResults = null;
  documentChanged(true);
  return entry;
}
