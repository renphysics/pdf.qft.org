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

const PAPERS = [
  ['a4', 'A4'],
  ['letter', 'Letter'],
];
const paperName = (paper) => PAPERS.find(([value]) => value === paper)[1];
const every = (count) => (count === 2 ? 'Both' : 'All ' + count);

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
      same = total - changing.length;
    if (!same)
      node.textContent =
        total === 1
          ? 'The page goes on ' + name + ' paper.'
          : every(total) + ' pages go on ' + name + ' paper.';
    else if (!changing.length)
      node.textContent =
        total === 1
          ? 'The page is on ' + name + ' paper already.'
          : every(total) + ' pages are on ' + name + ' paper already.';
    else
      node.textContent =
        changing.length +
        ' of ' +
        total +
        (changing.length === 1 ? ' pages goes on ' : ' pages go on ') +
        name +
        ' paper; ' +
        same +
        (same === 1 ? ' is' : ' are') +
        ' that size already.';
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
        { layout: true, label: 'Resize pages' },
      );
    renderTool();
    const same = targets.length - changing.length;
    toast(
      !changing.length
        ? targets.length === 1
          ? 'The page is already on ' + name + ' paper.'
          : 'These pages are already on ' + name + ' paper.'
        : (changing.length === 1
            ? targets.length === 1
              ? 'The page is'
              : '1 page is'
            : changing.length + ' pages are') +
            ' on ' +
            name +
            ' paper now.' +
            (same ? ' ' + same + (same === 1 ? ' was' : ' were') + ' that size already.' : ''),
    );
  } catch (error) {
    toast(friendly(error), true);
  }
}
/** Give the pages in scope their own size back (one undo step). */
export function restoreSize() {
  try {
    const scope = scopedPages(ui.resizeDraft.scope),
      targets = state.pages.filter((page) => (scope === 'all' || scope.includes(page.id)) && page.paper);
    if (!targets.length) throw new Error('These pages have their own size.');
    change(
      () => {
        for (const page of targets) delete page.paper;
      },
      { layout: true, label: 'Restore page size' },
    );
    renderTool();
    toast(
      targets.length === 1
        ? 'The page has its own size again.'
        : targets.length + ' pages have their own size again.',
    );
  } catch (error) {
    toast(friendly(error), true);
  }
}
export function fields() {
  return (
    selectField('Paper', 'resizePaper', PAPERS, true) +
    selectField(
      'Apply to',
      'resizeScope',
      [
        ['all', 'Every page'],
        ['current', 'Current page'],
        ['selected', 'Selected pages'],
      ],
      true,
    ) +
    '<p id="resize-summary" class="field-hint wide" aria-live="polite"></p>' +
    '<button type="submit" class="button primary">' +
    icon('resize') +
    'Resize pages</button><button type="button" class="button subtle" data-action="resize-restore">Restore original size</button>' +
    '<p class="field-hint wide">Each page is scaled to fit its sheet and centred, in its own orientation. Nothing is cut off, and text stays text. Links, comments and form fields move with the page; page numbers, headers and footers go to the edges of the sheet. A resized page stays on its sheet when you crop it or add margins.</p>'
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
