/**
 * QFT PDF. This module runs on every page and is all a page needs before a file
 * is opened: the tool search, opening files and the sample, the help and
 * privacy dialogs, notices, and the browser's Back and Forward. The editor
 * (editor.js and the modules it imports, about 400 KB) loads when a file is
 * opened, and starts loading as soon as a visitor hovers, focuses or touches
 * the upload area, a tool card or the sample, so it is usually there before
 * the click; a visitor who only reads the page never downloads it. The
 * editor's modules:
 *   editor.js       the actions behind buttons, listeners and start-up
 *   editor-core.js  shared state, helpers and messages
 *   history.js      edit history: change(), undo and redo
 *   views.js        addresses and browser history
 *   page-view.js    the page preview
 *   page-items.js   typing, moving and resizing items; crop drag
 *   form-ui.js      Fill form
 *   tool-panel.js   the tool panel's frame, and panel-*.js, one per tool
 *   pages.js        pages, the page strip and choosing tools
 *   documents.js    opening, building and downloading PDFs
 */

import {
  $,
  $$,
  announceMessage,
  busy,
  friendly,
  hideToast,
  pageTool,
  scheduleToastHide,
  showInfo,
  state,
  toast,
  ui,
} from './editor-core.js';
import { finishLanding } from './views.js';
import { TOOLS, TOOL_PAGES, searchFinds, searchNote, searchText, searchWords } from './routes.js';

// ---- The editor, loaded once ----------------------------------------------------------

let editor = null;
let loading = null;
// The editor that arrived is another release's (sameRelease): this page cannot use it.
let stale = false;
// When this page last reloaded itself into a newer release (refresh), kept in the
// history entry, which a reload keeps.
const reloaded = history.state?.reloaded || null;
/**
 * One release in a tab. The editor shares this module's state by importing the
 * same editor-core.js. After a deploy, a page loaded before it is given the new
 * release's editor, whose modules have other addresses (each carries its
 * release) and so would be second copies with a state of their own: Add another
 * PDF would replace the document, notices would not pause. Such an editor is
 * not used; the page is left as it is until the visitor does something that
 * needs the editor (refresh).
 */
function sameRelease(module) {
  if (module.ui === ui) return module;
  stale = true;
  throw new Error('QFT PDF was updated while this page was open. Please reload the page.');
}
/**
 * The visitor did something that needs the editor, and the editor is another
 * release's. Nothing is open yet, so the page reloads into the new release,
 * once, and says so there (the click or the chosen file has to be repeated). A
 * warm-up never does this: the page would reload under an open file picker, or
 * while the visitor is typing in the search. If a reload a moment ago did not
 * help, the notice asks for one by hand.
 */
function refresh() {
  if (Date.now() - (reloaded?.at || 0) < 60000) {
    toast('QFT PDF was updated while this page was open. Please reload the page.', true);
    return;
  }
  history.replaceState({ ...history.state, reloaded: { at: Date.now() } }, '');
  location.reload();
}
/** The editor's module, loading it the first time (and again after a failed load). */
export function loadEditor() {
  loading ||= import('./editor.js')
    .then(sameRelease, (error) => {
      // Firefox fetches again on the next try; Chromium never does in the same page
      // (nor WebKit, for a module the editor imports), so the notice says to reload.
      loading = null;
      throw new Error('The editor could not be loaded. Check your connection, then reload the page.', {
        cause: error,
      });
    })
    .then((module) => (editor = module));
  return loading;
}
/** Say why something could not be done; with another release's editor, reload into that release. */
function failed(error) {
  busy(false);
  if (stale) refresh();
  else toast(friendly(error), true);
}
/** Hand work to the editor, loading it first; a failure is shown, not thrown. */
function withEditor(run) {
  return loadEditor().then(run).catch(failed);
}
// Intent: hovering, focusing or touching the upload area, a tool card or the sample
// loads the editor; on Open and the sample the PDF engines start downloading too,
// unless the visitor asked to save data. A warm-up that fails says nothing: the
// click that follows does.
const warmEditor = () => loadEditor().catch(() => {});
const warmEngines = () =>
  loadEditor()
    .then((module) => navigator.connection?.saveData || module.warm())
    .catch(() => {});
for (const [selector, warm] of [
  ['#drop-zone, .tool-card, [data-action="batch"], [data-action="batch-choose"]', warmEditor],
  ['[data-action="open"], [data-action="sample"]', warmEngines],
])
  for (const element of $$(selector))
    for (const type of ['pointerover', 'focusin', 'touchstart'])
      element.addEventListener(type, warm, { once: true, passive: true });
// The batch workspace is part of the editor: its page needs it at once.
if (pageTool === 'batch') warmEditor();

// ---- The tool cards -------------------------------------------------------------------

let toolFilter = 'all';
const siteRoot = new URL('./', import.meta.url);
const toolOf = (id) => TOOLS.find((item) => item.id === id);
/** What the search reads for a tool: its card (routes.js) and its category, named as on the filter buttons. */
const cardText = (item) =>
  searchText(item) + ' ' + ($(`[data-tool-filter="${item.category}"]`)?.textContent || '');
/** A link to a tool that works as its card does: with a document open, the editor switches tools in place. */
function toolLink(id, label) {
  const link = document.createElement('a');
  link.href = new URL(TOOL_PAGES[id] + '/', siteRoot).pathname;
  if (toolOf(id).tab) link.dataset.startTool = id;
  else link.dataset.action = id;
  link.textContent = label;
  return link;
}
const LINK = /\[([^\]]+)\]\(tool:([a-z]+)\)/g;
/** A search note's text (routes.js), its [label](tool:id) links made into links. */
function noteContent(text) {
  const parts = [];
  let at = 0;
  for (const match of text.matchAll(LINK)) {
    parts.push(text.slice(at, match.index), toolLink(match[2], match[1]));
    at = match.index + match[0].length;
  }
  parts.push(text.slice(at));
  return parts;
}
/**
 * On a tool page, the search found only the page's own tool, which has no card
 * there: this page is it. Its upload button says what to choose; with a
 * document open, a link takes the document to the tool.
 */
function ownToolContent(item) {
  const name = `This page is ${item.title || item.name}: `;
  if (state.pages.length && item.tab) return [name, toolLink(item.id, 'use it on your open document'), '.'];
  const choose = $('#drop-zone .upload-button').textContent.trim();
  return [name + choose[0].toLowerCase() + choose.slice(1) + ' above.'];
}
let sayTimer = 0,
  said = '';
/**
 * A dead end is said once typing rests, and only when it is new: a screen
 * reader would otherwise speak at every key. Cards that match are not said.
 */
function sayResult(message) {
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => {
    if (message && message !== said) announceMessage(message);
    said = message;
  }, 700);
}
function filterTools() {
  // Every word typed (but "pdf", "to", "the"...) must start a word of the card's text,
  // its keywords or its category (routes.js), so "word" does not find "password".
  const typed = searchWords($('#tool-search').value),
    shown = (item) => toolFilter === 'all' || item.category === toolFilter;
  let count = 0;
  $$('.tool-card').forEach((card) => {
    const item = toolOf(card.dataset.card);
    card.hidden = !(shown(item) && searchFinds(typed, cardText(item)));
    if (!card.hidden) count++;
  });
  // What the site does not do, said plainly: above the cards, or in place of "No tools
  // match". On a tool page, a search that finds only the page's own tool says so.
  const found = searchNote(typed),
    own = !found && !count && pageTool ? toolOf(pageTool) : null,
    here = own && shown(own) && searchFinds(typed, cardText(own)),
    note = $('#search-note');
  note.replaceChildren(...(found ? noteContent(found.text) : here ? ownToolContent(own) : []));
  note.hidden = !found && !here;
  $('#no-tools').hidden = count !== 0 || !note.hidden;
  sayResult(!note.hidden ? note.textContent : count ? '' : $('#no-tools').textContent);
}
$('#tool-search').addEventListener('input', filterTools);
$$('[data-tool-filter]').forEach((button) =>
  button.addEventListener('click', () => {
    toolFilter = button.dataset.toolFilter;
    $$('[data-tool-filter]').forEach((item) => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    filterTools();
  }),
);

// ---- Clicks, files and keys -------------------------------------------------------------

const plainClick = (event) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
/** Open the file picker: at once, as browsers require, while the editor loads. */
function openPicker() {
  // Known already: reload now, before a file is chosen in vain.
  if (stale) return refresh();
  if (pageTool && pageTool !== 'batch' && $('#workspace').hidden) ui.tool = pageTool;
  ui.append = false;
  warmEngines();
  $('#file-input').click();
}
/**
 * Choose PDFs for a batch before the editor, which owns the batch workspace, has
 * loaded: a picker opens only during the click, so the files are chosen here and
 * handed over once the workspace is there.
 */
function chooseForBatch() {
  if (stale) return refresh();
  $('#batch-early-picker')?.remove();
  const picker = Object.assign(document.createElement('input'), {
    id: 'batch-early-picker',
    type: 'file',
    accept: '.pdf,application/pdf',
    multiple: true,
    hidden: true,
  });
  picker.addEventListener('change', () => {
    const files = [...picker.files];
    picker.remove();
    if (files.length) withEditor((module) => module.batchFiles(files));
  });
  document.body.append(picker);
  picker.click();
  withEditor((module) => module.action('batch'));
}
document.addEventListener('click', (event) => {
  const target = event.target.closest('button,a');
  if (!target) return;
  // Links opened in a new tab or window go to their real address.
  if (target.matches('a[href]') && !plainClick(event)) return;
  if (editor) {
    editor.handleClick(event, target);
    return;
  }
  // Before the editor has loaded, only buttons: tool cards are links to their pages.
  const name = target.dataset.action;
  if (!name) return;
  event.preventDefault();
  if (name === 'dismiss-toast') hideToast();
  else if (name === 'close-dialog') $('#info-dialog').close();
  else if (name === 'privacy' || name === 'help') showInfo(name);
  else if (name === 'open') openPicker();
  else if (name === 'batch-choose') chooseForBatch();
  else if (name === 'home' || name === 'tools-home' || name === 'back') {
    ui.landingFocus = name === 'tools-home' ? 'tools' : 'top';
    finishLanding();
  } else withEditor((module) => module.action(name, target));
});
$('#file-input').addEventListener('change', (event) => {
  const picker = event.target,
    files = [...picker.files];
  loadEditor()
    .then(
      (module) => module.openFiles(files, ui.append),
      (error) => {
        // openFiles clears the picker when it is done. Without the editor it stays
        // filled, and choosing the same file again would not be a change.
        picker.value = '';
        throw error;
      },
    )
    .catch(failed);
});
let dragDepth = 0;
document.addEventListener('dragenter', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  if (dragDepth === 0) warmEngines();
  dragDepth++;
  $('#drop-zone').classList.add('drag-over');
});
document.addEventListener('dragleave', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  dragDepth--;
  if (dragDepth <= 0) $('#drop-zone').classList.remove('drag-over');
});
document.addEventListener('dragover', (event) => {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
});
document.addEventListener('drop', (event) => {
  if (!event.dataTransfer?.files.length) return;
  event.preventDefault();
  dragDepth = 0;
  $('#drop-zone').classList.remove('drag-over');
  const files = [...event.dataTransfer.files];
  withEditor((module) => module.openDropped(files));
});
$('#info-dialog').addEventListener('click', (event) => {
  if (event.target === $('#info-dialog')) $('#info-dialog').close();
});
$('#confirm-dialog').addEventListener('click', (event) => {
  const dialog = $('#confirm-dialog'),
    choice = event.target.closest('[data-confirm]')?.dataset.confirm;
  if (choice) dialog.close(choice);
  else if (event.target === dialog) dialog.close('cancel');
});
const toastNode = $('#toast');
toastNode.addEventListener('mouseenter', () => clearTimeout(ui.toastTimer));
toastNode.addEventListener('mouseleave', scheduleToastHide);
toastNode.addEventListener('focusin', (event) => {
  clearTimeout(ui.toastTimer);
  if (!toastNode.contains(event.relatedTarget)) ui.toastReturnFocus = event.relatedTarget;
});
toastNode.addEventListener('focusout', (event) => {
  if (!toastNode.contains(event.relatedTarget)) scheduleToastHide();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('#toast').hidden && !document.querySelector('dialog[open]')) hideToast();
});
// Views are recorded by the editor. Before it loads, Back and Forward can only
// reach this page's own entry, or a batch entry left by a reload.
window.addEventListener('popstate', (event) => {
  if (editor) editor.popstate(event);
  else if (event.state?.view === 'batch') withEditor((module) => module.popstate(event));
  else {
    ui.shownDepth = Number(event.state?.depth) || 0;
    finishLanding();
  }
});
// Views restore their own scroll position; a reload starts on the landing view.
history.scrollRestoration = 'manual';
history.replaceState({ view: 'landing', depth: 0 }, '');
// The page reloaded itself into a newer release when the visitor opened something (refresh).
if (reloaded) toast('QFT PDF has been updated, so this page was reloaded. Please try again.');
if (!window.File || !window.Blob || !window.Worker)
  toast(
    'QFT PDF needs a modern browser. Please use a recent version of Chrome, Edge, Firefox, or Safari.',
    true,
  );
