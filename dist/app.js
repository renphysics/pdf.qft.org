/**
 * QFT PDF. This module runs on every page and is all a page needs before a file
 * is opened: the tool search, opening files and the sample, dialogs, notices,
 * and the browser's Back and Forward. The editor (editor.js and the modules it
 * imports, about 400 KB) loads when a file is opened, or in the background
 * once the page is idle, so the page is usable before it arrives. The editor's
 * modules:
 *   editor.js       the actions behind buttons, listeners and start-up
 *   editor-core.js  shared state, helpers and messages
 *   history.js      edit history: change(), undo and redo
 *   views.js        addresses and browser history
 *   page-view.js    the page preview
 *   page-items.js   typing, moving and resizing items; crop drag
 *   form-ui.js      Fill form
 *   tool-panel.js   the tool panel
 *   pages.js        pages, the page strip and choosing tools
 *   documents.js    opening, building and downloading PDFs
 */

import { $, $$, busy, friendly, hideToast, pageTool, scheduleToastHide, toast, ui } from './editor-core.js';

// ---- The editor, loaded once ----------------------------------------------------------

let editor = null;
let loading = null;
/** The editor's module, loading it the first time. */
export function loadEditor() {
  loading ||= import('./editor.js').then((module) => (editor = module));
  return loading;
}
/** Hand work to the editor, loading it first; a failure is shown, not thrown. */
function withEditor(run) {
  return loadEditor()
    .then(run)
    .catch((error) => {
      busy(false);
      toast(friendly(error), true);
    });
}
// Once the page is idle, the editor loads in the background, ready for the first open.
const idle = window.requestIdleCallback || ((callback) => setTimeout(callback, 1500));
idle(() => loadEditor().catch(() => {}), { timeout: 4000 });
// Hovering or focusing Open or the sample: the PDF engines start downloading too.
for (const button of $$('[data-action="open"], [data-action="sample"]'))
  for (const type of ['pointerenter', 'focus'])
    button.addEventListener(type, () => withEditor((module) => module.warm()), { once: true });

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
  withEditor((module) => module.warm());
  $('#file-input').click();
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
  else if (name === 'open') openPicker();
  else withEditor((module) => module.action(name, target));
});
$('#file-input').addEventListener('change', (event) => {
  const files = [...event.target.files];
  withEditor((module) => module.openFiles(files, ui.append));
});
let dragDepth = 0;
document.addEventListener('dragenter', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  if (dragDepth === 0) withEditor((module) => module.warm());
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
// Views are recorded by the editor; before it loads, this page is the only entry.
window.addEventListener('popstate', (event) => {
  if (editor) editor.popstate(event);
});
// Views restore their own scroll position; a reload starts on the landing view.
history.scrollRestoration = 'manual';
history.replaceState({ view: 'landing', depth: 0 }, '');
if (!window.File || !window.Blob || !window.Worker)
  toast(
    'QFT PDF needs a modern browser. Please use a recent version of Chrome, Edge, Firefox, or Safari.',
    true,
  );
