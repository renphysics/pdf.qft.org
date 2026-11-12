/**
 * The Organize pages, Delete pages and Merge PDFs panels: the page strip's
 * selection, page ranges, and the files combined. (tool-panel.js describes the
 * panel interface.)
 */

import { $, $$, announceMessage, formatSize, icon, safe, state, ui } from './editor-core.js';
import { markView } from './page-view.js';
import { selectRange } from './pages.js';
import { change } from './history.js';
import { textField } from './tool-panel.js';

/**
 * What Rotate, Remove and Download will act on, for their labels: "page 4" for
 * one selected page, "3 pages" for more. The page a document opens with
 * selected is named like any other, so no button acts on a page it did not name.
 */
function selectedWords() {
  if (ui.selected.size > 1) return ui.selected.size + ' pages';
  const index = state.pages.findIndex((page) => ui.selected.has(page.id));
  return index < 0 ? null : 'page ' + (index + 1);
}
export function fields(item, index) {
  const chosen = selectedWords();
  switch (ui.tool) {
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
        // With nothing selected the buttons keep their plain names, and say what to select when pressed.
        (chosen ? 'Rotate ' + chosen : 'Rotate 90°') +
        '</button><button type="button" class="button danger" data-action="delete-pages">' +
        icon('trash') +
        (chosen ? 'Remove ' + chosen : 'Remove') +
        '</button></div><button type="button" class="button secondary" data-action="extract">' +
        icon('download') +
        (chosen ? 'Download ' + chosen : 'Download selected pages') +
        '</button><div class="field-section wide">CURRENT PAGE · <span data-current-page>' +
        (index + 1) +
        '</span></div><div class="mini-actions wide"><button type="button" class="button secondary" data-action="move-earlier"' +
        (index === 0 ? ' aria-disabled="true"' : '') +
        '>' +
        icon('up') +
        'Move earlier</button><button type="button" class="button secondary" data-action="move-later"' +
        (index === state.pages.length - 1 ? ' aria-disabled="true"' : '') +
        '>' +
        icon('down') +
        'Move later</button></div><button type="button" class="button secondary" data-action="insert-blank">' +
        icon('plus') +
        'Add a blank page after it</button><div class="field-section wide">PAGE ORDER</div><div class="mini-actions wide"><button type="button" class="button secondary" data-action="reverse-pages"' +
        (state.pages.length < 2 ? ' disabled' : '') +
        '>' +
        icon('reverse') +
        'Reverse</button><button type="button" class="button secondary" data-action="interleave-pages" aria-describedby="interleave-hint"' +
        (state.pages.length < 3 ? ' disabled' : '') +
        '>' +
        icon('interleave') +
        'Interleave</button></div><label class="check-field wide"><input type="checkbox" name="backsReversed"' +
        (ui.backsReversed ? ' checked' : '') +
        '> Backs scanned from the last sheet</label><p class="field-hint wide" id="interleave-hint">For pages printed on both sides and scanned one side at a time: the first half are the fronts, the rest the backs. Interleave puts each back after its front.</p>'
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
        'Add another PDF</button><div class="scope-note wide">New pages are added at the end. Use <strong>Organize pages</strong> to change their order, then download the combined PDF.</div><label class="check-field wide"><input type="checkbox" name="fileBookmarks" aria-describedby="file-bookmarks-hint"' +
        (state.fileBookmarks !== false ? ' checked' : '') +
        '> Add a bookmark for each file</label><p class="field-hint wide" id="file-bookmarks-hint">Named after the file, it leads to the file’s first page; the file’s own bookmarks go under it.</p><button type="button" class="button secondary" data-action="organize">' +
        icon('pages') +
        'Organize pages</button>'
      );
  }
  return '';
}
export function values() {
  return ui.tool === 'merge' ? {} : { range: ui.rangeDraft };
}
export function onInput(name, value) {
  if (name === 'backsReversed') ui.backsReversed = value;
  else if (name === 'fileBookmarks') {
    change(() => (state.fileBookmarks = value), { label: 'File bookmarks' });
    announceMessage(value ? 'Each file will have a bookmark.' : 'Files won’t have bookmarks of their own.');
  } else if (name === 'range') ui.rangeDraft = value;
}
/** Enter in the page-numbers field selects the pages typed. */
export function onSubmit() {
  if (ui.tool !== 'merge') selectRange();
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
