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
  busy,
  friendly,
  hideToast,
  pageTool,
  scheduleToastHide,
  showInfo,
  toast,
  ui,
} from './editor-core.js';
import { finishLanding } from './views.js';

// ---- The editor, loaded once ----------------------------------------------------------

let editor = null;
let loading = null;
// An action is waiting for the editor (a click, a chosen file), not only a warm-up.
let acting = false;
// When this page last reloaded itself into a newer release (sameRelease), kept in
// the history entry, which a reload keeps.
const reloaded = history.state?.reloaded || null;
/**
 * One release in a tab. The editor shares this module's state by importing the
 * same editor-core.js. After a deploy, a page loaded before it is given the new
 * release's editor, whose modules have other addresses (each carries its
 * release) and so would be second copies with a state of their own: Add another
 * PDF would replace the document, notices would not pause. Nothing is open yet,
 * so the page reloads into the new release, once; if that does not help, the
 * notice asks for a reload by hand.
 */
function sameRelease(module) {
  if (module.ui === ui) return module;
  if (Date.now() - (reloaded?.at || 0) < 60000)
    throw new Error('QFT PDF was updated while this page was open. Please reload the page.');
  history.replaceState({ ...history.state, reloaded: { at: Date.now(), notice: acting } }, '');
  location.reload();
  return new Promise(() => {}); // nothing more happens on this page
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
/** Say why something could not be done. */
function failed(error) {
  busy(false);
  toast(friendly(error), true);
}
/** Hand work to the editor, loading it first; a failure is shown, not thrown. */
function withEditor(run) {
  acting = true;
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
function filterTools() {
  // Every word typed must be in the card's text or its keywords (routes.js).
  const words = $('#tool-search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let count = 0;
  $$('.tool-card').forEach((card) => {
    const text = (card.textContent + ' ' + (card.dataset.keywords || '')).toLowerCase();
    const visible =
      (toolFilter === 'all' || card.dataset.category === toolFilter) &&
      words.every((word) => text.includes(word));
    card.hidden = !visible;
    if (visible) count++;
  });
  $('#no-tools').hidden = count !== 0;
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
  acting = true;
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
// The page reloaded itself into a newer release while a file was being opened.
if (reloaded?.notice)
  toast('QFT PDF has been updated, so this page was reloaded. Please choose your file again.');
if (!window.File || !window.Blob || !window.Worker)
  toast(
    'QFT PDF needs a modern browser. Please use a recent version of Chrome, Edge, Firefox, or Safari.',
    true,
  );
