/**
 * The Resize pages panel: the pages in scope go on A4 or Letter paper (a draft
 * in ui.resizeDraft), or get their own size back. A page keeps its sheet as
 * descriptor.paper; the preview and the download fit it on (layout.js:
 * fittedGeometry). (tool-panel.js describes the panel interface.)
 */

import { pageGeometry } from './layout.js';
import { geometryOf, sourcePage } from './preview.js';
import { $, friendly, icon, state, toast, ui } from './editor-core.js';
import { change } from './history.js';
import { scopedPages } from './panel-crop.js';
import { renderTool, selectField } from './tool-panel.js';
import { sentences, t, tn } from './i18n.js';

const PAPERS = [
  ['a4', 'A4'],
  ['letter', 'Letter'],
];
const paperName = (paper) => PAPERS.find(([value]) => value === paper)[1];

/** The pages in scope, split into those `paper` would change and those that are that size already. */
function sorted(paper) {
  const scope = scopedPages(ui.resizeDraft.scope),
    targets = state.pages.filter((page) => scope === 'all' || scope.includes(page.id));
  // Sizes in points. A sheet is in points; a page without one is in its own
  // units, which a PDF can make larger (a page of Letter's numbers in units of
  // two points is twice Letter, and changes).
  const changes = (page) => {
    const source = sourcePage(state, page),
      now = geometryOf(state, page),
      then = pageGeometry(source, { ...page, paper }),
      unit = page.paper ? 1 : source.userUnit || 1;
    return Math.abs(now.width * unit - then.width) > 0.01 || Math.abs(now.height * unit - then.height) > 0.01;
  };
  return { targets, changing: targets.filter(changes) };
}
/** Say what the button will do to the pages in scope. (The current page changes as the document is read, so nothing is said of it.) */
function updateResizeSummary() {
  const node = $('#resize-summary');
  if (!node || !state.pages.length) return;
  const draft = ui.resizeDraft,
    name = paperName(draft.paper);
  node.classList.remove('invalid');
  if (draft.scope === 'current') {
    node.textContent = '';
    return;
  }
  try {
    const { targets, changing } = sorted(draft.paper),
      total = targets.length,
      same = total - changing.length,
      values = { paper: name, count: changing.length, total, same };
    if (!same)
      node.textContent =
        total === 1
          ? t('The page goes on {paper} paper.', values)
          : total === 2
            ? t('Both pages go on {paper} paper.', values)
            : t('All {total} pages go on {paper} paper.', values);
    else if (!changing.length)
      node.textContent =
        total === 1
          ? t('The page is on {paper} paper already.', values)
          : total === 2
            ? t('Both pages are on {paper} paper already.', values)
            : t('All {total} pages are on {paper} paper already.', values);
    else if (changing.length === 1)
      node.textContent =
        same === 1
          ? t('{count} of {total} pages goes on {paper} paper; {same} is that size already.', values)
          : t('{count} of {total} pages goes on {paper} paper; {same} are that size already.', values);
    else
      node.textContent =
        same === 1
          ? t('{count} of {total} pages go on {paper} paper; {same} is that size already.', values)
          : t('{count} of {total} pages go on {paper} paper; {same} are that size already.', values);
  } catch (error) {
    node.textContent = error.message;
    node.classList.add('invalid');
  }
}
/**
 * Put the pages in scope on the paper in ui.resizeDraft, as one undo step. A
 * page that is that size already keeps the sheet too, and stays on it when it
 * is cropped or given margins later.
 */
function resizePages() {
  try {
    const paper = ui.resizeDraft.paper,
      name = paperName(paper),
      { targets, changing } = sorted(paper);
    if (targets.some((page) => page.paper !== paper))
      change(
        () => {
          for (const page of targets) page.paper = paper;
        },
        { layout: true, label: t('Resize pages') },
      );
    renderTool();
    const same = targets.length - changing.length;
    toast(
      !changing.length
        ? targets.length === 1
          ? t('The page is already on {paper} paper.', { paper: name })
          : t('These pages are already on {paper} paper.', { paper: name })
        : sentences(
            targets.length === 1
              ? t('The page is on {paper} paper now.', { paper: name })
              : tn(
                  changing.length,
                  '{count} page is on {paper} paper now.',
                  '{count} pages are on {paper} paper now.',
                  {
                    paper: name,
                  },
                ),
            same > 0 && tn(same, '{count} was that size already.', '{count} were that size already.'),
          ),
    );
  } catch (error) {
    toast(friendly(error), true);
  }
}
/** Give the pages in scope their own size back (one undo step). */
export function restoreSize() {
  try {
    const scope = scopedPages(ui.resizeDraft.scope),
      asked = state.pages.filter((page) => scope === 'all' || scope.includes(page.id)),
      targets = asked.filter((page) => page.paper);
    if (!targets.length)
      throw new Error(
        asked.length === 1
          ? t('This page has its own size already.')
          : t('These pages have their own size already.'),
      );
    change(
      () => {
        for (const page of targets) delete page.paper;
      },
      { layout: true, label: t('Restore page size') },
    );
    renderTool();
    toast(tn(targets.length, 'The page has its own size again.', '{count} pages have their own size again.'));
  } catch (error) {
    toast(friendly(error), true);
  }
}
export function fields() {
  return (
    selectField(t('Paper'), 'resizePaper', PAPERS, true) +
    selectField(
      t('Apply to'),
      'resizeScope',
      [
        ['all', t('Every page')],
        ['current', t('Current page')],
        ['selected', t('Selected pages')],
      ],
      true,
    ) +
    '<p id="resize-summary" class="field-hint wide" aria-live="polite"></p>' +
    '<button type="submit" class="button primary">' +
    icon('resize') +
    t('Resize pages') +
    '</button><button type="button" class="button subtle" data-action="resize-restore">' +
    t('Restore original size') +
    '</button><p class="field-hint wide">' +
    t(
      'Each page is scaled to fit its sheet and centred, in its own orientation. Nothing is cut off, and text stays text. Links, comments and form fields move with the page; page numbers, headers and footers go to the edges of the sheet. A resized page stays on its sheet when you crop it or add margins. Pages you add later keep their own size.',
    ) +
    '</p>'
  );
}
export function values() {
  return { resizePaper: ui.resizeDraft.paper, resizeScope: ui.resizeDraft.scope };
}
export function onInput(name, value) {
  if (name === 'resizePaper') ui.resizeDraft.paper = value;
  if (name === 'resizeScope') ui.resizeDraft.scope = value;
  updateResizeSummary();
}
export function afterRender() {
  updateResizeSummary();
}
export function onSubmit() {
  resizePages();
}
