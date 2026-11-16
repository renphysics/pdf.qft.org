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
import { t, tn } from './i18n.js';

/**
 * Rotate, Remove and Download say what they will act on: "Rotate page 4" for
 * one selected page, "Rotate 3 pages" for more. The page a document opens with
 * selected is named like any other, so no button acts on a page it did not
 * name. With nothing selected they keep their plain names, and say what to
 * select when pressed.
 */
function selectionLabels() {
  const count = ui.selected.size;
  if (count > 1)
    return {
      rotate: t('Rotate {count} pages', { count }),
      remove: t('Remove {count} pages', { count }),
      download: t('Download {count} pages', { count }),
    };
  const index = state.pages.findIndex((page) => ui.selected.has(page.id));
  if (index < 0)
    return { rotate: t('Rotate 90°'), remove: t('Remove'), download: t('Download selected pages') };
  const page = index + 1;
  return {
    rotate: t('Rotate page {page}', { page }),
    remove: t('Remove page {page}', { page }),
    download: t('Download page {page}', { page }),
  };
}
const selectionButtons = () =>
  '<div class="selection-buttons wide"><button type="button" data-action="select-all">' +
  t('Select all') +
  '</button><button type="button" data-action="select-none">' +
  t('Clear selection') +
  '</button></div>';
export function fields(item, index) {
  const label = selectionLabels(),
    count = ui.selected.size,
    total = state.pages.length;
  switch (ui.tool) {
    case 'pages':
      return (
        '<div class="scope-note wide">' +
        t(
          '<strong>{count} of {total} pages selected.</strong> Select pages with the checkboxes beneath each thumbnail.',
          { count, total },
        ) +
        '</div>' +
        selectionButtons() +
        textField(t('Select page numbers'), 'range', t('e.g. 1-3, 5'), true) +
        '<button type="button" class="button secondary" data-action="select-range">' +
        t('Select range') +
        '</button><div class="field-section wide">' +
        t('SELECTED PAGES') +
        '</div><div class="mini-actions wide"><button type="button" class="button secondary" data-action="rotate">' +
        icon('rotate') +
        label.rotate +
        '</button><button type="button" class="button danger" data-action="delete-pages">' +
        icon('trash') +
        label.remove +
        '</button></div><button type="button" class="button secondary" data-action="extract">' +
        icon('download') +
        label.download +
        '</button><div class="field-section wide">' +
        t('CURRENT PAGE · {page}', { page: '<span data-current-page>' + (index + 1) + '</span>' }) +
        '</div><div class="mini-actions wide"><button type="button" class="button secondary" data-action="move-earlier"' +
        (index === 0 ? ' aria-disabled="true"' : '') +
        '>' +
        icon('up') +
        t('Move earlier') +
        '</button><button type="button" class="button secondary" data-action="move-later"' +
        (index === state.pages.length - 1 ? ' aria-disabled="true"' : '') +
        '>' +
        icon('down') +
        t('Move later') +
        '</button></div><button type="button" class="button secondary" data-action="insert-blank">' +
        icon('plus') +
        t('Add a blank page after it') +
        '</button><div class="field-section wide">' +
        t('PAGE ORDER') +
        '</div><div class="mini-actions wide"><button type="button" class="button secondary" data-action="reverse-pages"' +
        (state.pages.length < 2 ? ' disabled' : '') +
        '>' +
        icon('reverse') +
        t('Reverse') +
        '</button><button type="button" class="button secondary" data-action="interleave-pages" aria-describedby="interleave-hint"' +
        (state.pages.length < 3 ? ' disabled' : '') +
        '>' +
        icon('interleave') +
        t('Interleave') +
        '</button></div><label class="check-field wide"><input type="checkbox" name="backsReversed"' +
        (ui.backsReversed ? ' checked' : '') +
        '> ' +
        t('Backs scanned from the last sheet') +
        '</label><p class="field-hint wide" id="interleave-hint">' +
        t(
          'For pages printed on both sides and scanned one side at a time: the first half are the fronts, the rest the backs. Interleave puts each back after its front.',
        ) +
        '</p>'
      );
    case 'delete':
      return (
        '<div class="scope-note wide">' +
        t(
          '<strong>{count} of {total} pages selected for deletion.</strong><br>{remaining} pages will remain.',
          {
            count,
            total,
            remaining: total - count,
          },
        ) +
        '</div>' +
        selectionButtons() +
        textField(t('Page numbers to delete'), 'range', t('e.g. 2, 4-6'), true) +
        '<button type="button" class="button secondary" data-action="select-range">' +
        t('Select range') +
        '</button><p class="field-hint wide">' +
        t('Numbers follow the current page order. Checked thumbnails are the pages to delete.') +
        '</p><button type="button" class="button danger" data-action="delete-pages"' +
        (!count || count === total ? ' disabled' : '') +
        '>' +
        icon('trash') +
        tn(count, 'Delete {count} selected page', 'Delete {count} selected pages') +
        '</button><p class="field-hint wide">' +
        (count === total
          ? t('Keep at least one page. Deselect a page to continue.')
          : t('Deleted pages leave at once. Undo brings them back.')) +
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
              tn(source.pageCount, '{count} page · {size}', '{count} pages · {size}', {
                size: formatSize(source.bytes.length),
              }) +
              '</div>',
          )
          .join('') +
        '</div><button type="button" class="button primary" data-action="add-files">' +
        icon('plus') +
        t('Add another PDF') +
        '</button><div class="scope-note wide">' +
        t(
          'New pages are added at the end. Use <strong>Organize pages</strong> to change their order, then download the combined PDF.',
        ) +
        '</div><label class="check-field wide"><input type="checkbox" name="fileBookmarks" aria-describedby="file-bookmarks-hint"' +
        (state.fileBookmarks !== false ? ' checked' : '') +
        '> ' +
        t('Add a bookmark for each file') +
        '</label><p class="field-hint wide" id="file-bookmarks-hint">' +
        t('Named after the file, it leads to the file’s first page; the file’s own bookmarks go under it.') +
        '</p><button type="button" class="button secondary" data-action="organize">' +
        icon('pages') +
        t('Organize pages') +
        '</button>'
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
    change(() => (state.fileBookmarks = value), { label: t('File bookmarks') });
    announceMessage(
      value ? t('Each file will have a bookmark.') : t('Files won’t have bookmarks of their own.'),
    );
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
