/**
 * Documents: building the PDF (in the export worker when there is one),
 * downloads and their errors, and opening and adding files.
 */

import { buildPdfWithNotes, imagesToPdf, loadPdfLib, openPdf, passwordProblem } from './pdf-engine.js';
import { baseName, rescaledMargins } from './layout.js';
import { safeBaseName } from './workflows.js';
import { isPicture, pictureForPage } from './convert.js';
import { closeDocuments, loadPdfjs, previewFont } from './preview.js';
import {
  $,
  annotationById,
  busy,
  cancellable,
  confirmDialog,
  dropDefaultSelection,
  emptyState,
  friendly,
  pageTool,
  phone,
  protectedDownload,
  setState,
  snapshot,
  state,
  toast,
  ui,
  uid,
  unlockedDownload,
} from './editor-core.js';
import { resetStage } from './page-view.js';
import { documentFields, focusField } from './form-ui.js';
import { addImageFile, selectItem, stopEditing } from './page-items.js';
import { renderTool } from './tool-panel.js';
import { showSettingDefaults } from './panel-settings.js';
import { updateProtectionStatus } from './panel-protect.js';
import { choosePage, chooseTool, formProblem, selectedIds, setSheet } from './pages.js';
import { change, documentChanged } from './history.js';
import { recordView } from './views.js';

// ---- Building the PDF ---------------------------------------------------------------
// The PDF is built only to download, extract or split, in a worker when possible.

let exporter = null;
let exportSequence = 0;
function exportWorker() {
  if (exporter === false || typeof Worker === 'undefined') return null;
  if (!exporter) {
    try {
      const worker = new Worker(new URL('./export-worker.js', import.meta.url), { type: 'module' });
      const jobs = new Map();
      const ready = new Promise((resolve) => {
        worker.addEventListener('message', (event) => event.data?.ready && resolve(true));
        worker.addEventListener('error', () => resolve(false));
      });
      worker.addEventListener('message', ({ data }) => {
        const job = jobs.get(data?.id);
        if (!job) return;
        if ('progress' in data) job.progress(data.progress);
        else {
          jobs.delete(data.id);
          if (data.error) job.reject(Object.assign(new Error(data.error.message), data.error));
          else job.resolve({ bytes: data.bytes, notes: data.notes || [] });
        }
      });
      worker.addEventListener('error', (event) => {
        event.preventDefault();
        for (const job of jobs.values())
          job.reject(new Error('The PDF could not be created. Please try again.'));
        jobs.clear();
        worker.terminate();
        if (exporter?.worker === worker) exporter = null;
      });
      exporter = { worker, jobs, ready };
    } catch {
      exporter = false;
      return null;
    }
  }
  return exporter;
}
async function build(input, onProgress) {
  const current = exportWorker();
  if (current && (await current.ready)) {
    const id = ++exportSequence;
    return new Promise((resolve, reject) => {
      current.jobs.set(id, { resolve, reject, progress: onProgress });
      cancellable('Cancel', () => {
        current.jobs.delete(id);
        current.worker.terminate();
        if (exporter === current) exporter = null;
        const error = new Error('Stopped. Your document is unchanged.');
        error.name = 'AbortError';
        reject(error);
      });
      current.worker.postMessage({ id, state: input });
    });
  }
  // No module workers here: build on this page instead.
  exporter = false;
  return buildPdfWithNotes(input, onProgress);
}
/**
 * The document as a PDF: { bytes, notes } (see buildPdfWithNotes). Reuses the
 * last build while nothing has changed.
 */
export async function exportDocument(input = null, label = 'Preparing your PDF…') {
  stopEditing();
  if (!input && ui.exported?.version === ui.version) return ui.exported.result;
  const version = ui.version;
  busy(true, label);
  try {
    const result = await build(input || snapshot(), (progress) => {
      $('#busy-message').textContent = label + ' ' + Math.round(progress * 100) + '%';
    });
    if (!input) ui.exported = { version, result };
    return result;
  } finally {
    ui.cancelExport = null;
    busy(false);
  }
}
/** Show where an export problem is: its page, and the item or tool involved. */
export function showExportError(error) {
  if (error?.name === 'AbortError') {
    toast(error.message);
    return;
  }
  const page = state.pages[error?.pageIndex];
  if (page) {
    choosePage(page.id);
    const keys = { watermark: 'watermark', pageNumber: 'numbers' };
    const formField =
      /^form:/.test(error.itemId || '') &&
      documentFields().find(
        ({ source, field }) => source.id === page.sourceId && 'form:' + field.name === error.itemId,
      );
    if (formField) {
      chooseTool('form');
      focusField({ ...formField, pageId: page.id });
    } else if (annotationById(error.itemId)) selectItem(error.itemId);
    else if (keys[error.itemId] || /^(header|footer)/.test(error.itemId || ''))
      chooseTool(keys[error.itemId] || 'footer');
  }
  toast(friendly(error), true);
}
export function downloadBytes(bytes, name) {
  const url = URL.createObjectURL(
    bytes instanceof Blob ? bytes : new Blob([bytes], { type: 'application/pdf' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function usedSources() {
  return state.sources.filter((s) => state.pages.some((p) => p.sourceId === s.id));
}
/**
 * A download is named after the first file in it (blank pages aside), without
 * its extension. `pages`: the pages in the download, when they are not the
 * whole document (Download selected pages).
 */
export function outputBase(pages = state.pages) {
  const first = pages
    .map((page) => state.sources.find((source) => source.id === page.sourceId))
    .find((source) => source && !source.blank);
  return first ? baseName(first.name) : 'document';
}
/**
 * What a download's name says was done: its protection; "converted" for
 * pictures made into pages; "merged" for several files; one word when the
 * edits are of one kind (numbered, watermarked, cropped, signed, filled,
 * organized); and "edited" for anything else.
 */
function outputKind() {
  if (protectedDownload()) return 'protected';
  if (unlockedDownload()) return 'unlocked';
  const files = usedSources().filter((source) => !source.blank);
  if (files.length && files.every((source) => source.picture)) return 'converted';
  if (files.length > 1) return 'merged';
  const on = (key) => state[key] && state[key].enabled !== false;
  const kinds = new Set();
  if (on('pageNumbers')) kinds.add('numbered');
  if (on('watermark') && String(state.watermark.text || '').trim()) kinds.add('watermarked');
  if (
    on('headerFooter') &&
    ['headerLeft', 'headerCenter', 'headerRight', 'footerLeft', 'footerCenter', 'footerRight'].some((slot) =>
      String(state.headerFooter[slot] || '').trim(),
    )
  )
    kinds.add('edited');
  for (const annotation of state.annotations)
    kinds.add(annotation.type === 'signature' ? 'signed' : 'edited');
  if (state.pages.some((page) => page.crop))
    kinds.add(state.pages.some((page) => page.crop?.content) ? 'edited' : 'cropped');
  if (
    state.flattenForms ||
    Object.values(state.formValues || {}).some((values) => Object.keys(values).length)
  )
    kinds.add('filled');
  if (state.properties) kinds.add('edited');
  // Pages moved, turned, removed, repeated or added.
  const [file] = files;
  if (
    file &&
    (state.pages.length !== file.pageCount ||
      state.pages.some(
        (page, index) => page.sourceId !== file.id || page.index !== index || (page.rotation || 0) !== 0,
      ))
  )
    kinds.add('organized');
  return kinds.size === 1 ? [...kinds][0] : 'edited';
}
/** The download's name, in a form every system takes (safeBaseName): not left to the browser. */
export function outputName(suffix = outputKind(), pages = state.pages) {
  return safeBaseName(outputBase(pages)) + '-' + suffix + '.pdf';
}
/**
 * What a download message adds about the file, or the files of a split
 * (`several`), from the build's notes (see buildPdfWithNotes).
 */
export function exportNotes(notes, { several = false } = {}) {
  const reasons = [
    notes.includes('pdfa-removed-password') && 'PDF/A files can’t have a password',
    notes.includes('pdfa-removed') && 'added text and marks don’t meet PDF/A rules',
    notes.includes('pdfa-removed-properties') &&
      'changing its details removes the metadata that declares PDF/A',
  ].filter(Boolean);
  const left = [
    notes.includes('labels-dropped') && 'page labels (such as i, ii, iii)',
    notes.includes('attachments-dropped') && 'attached files',
    notes.includes('tags-dropped') && 'accessibility tags',
  ].filter(Boolean);
  let text = reasons.length
    ? ' It’s no longer marked as PDF/A (archival), because ' + reasons.join(', and ') + '.'
    : '';
  if (left.length) {
    const list = left.length > 1 ? left.slice(0, -1).join(', ') + ' and ' + left.at(-1) : left[0];
    text +=
      (several ? ' Their pages were copied into new PDFs' : ' Its pages were copied into a new PDF') +
      ', without the original’s ' +
      list +
      '.';
  }
  if (notes.includes('signature-invalid'))
    text +=
      ' The original was digitally signed: its signature isn’t valid in ' +
      (several ? 'these copies.' : 'this copy.');
  if (notes.includes('additions-untagged'))
    text +=
      ' What you added isn’t tagged for screen readers; they skip the page numbers, headers, footers and watermark, which are marked as artifacts.';
  return text;
}
export async function downloadDocument() {
  try {
    const version = ui.version,
      locked = protectedDownload(),
      { bytes, notes } = await exportDocument();
    downloadBytes(bytes, outputName());
    ui.savedVersion = version;
    toast(
      (locked
        ? 'Your protected PDF has been downloaded. It needs your password to open.'
        : unlockedDownload()
          ? 'Your unlocked PDF has been downloaded.'
          : 'Your edited PDF has been downloaded.') + exportNotes(notes),
    );
  } catch (error) {
    showExportError(error);
  }
}
/** Download from Protect PDF: only once a usable password is set. */
export async function downloadProtected() {
  const field = $('#tool-form [name="password"]');
  if (!protectedDownload() || passwordProblem(state.protection.password)) {
    updateProtectionStatus();
    if (!state.protection?.password) {
      $('#protect-status').textContent = passwordProblem('');
      $('#protect-status').classList.add('invalid');
      field?.setAttribute('aria-invalid', 'true');
    }
    field?.focus();
    return;
  }
  await downloadDocument();
}
export async function downloadSelected() {
  try {
    const ids = selectedIds();
    const extraction = snapshot();
    extraction.pages = extraction.pages.filter((p) => ids.has(p.id));
    const problem = formProblem(extraction.pages);
    if (problem) throw new Error(problem);
    const { bytes, notes } = await exportDocument(extraction, 'Preparing selected pages…');
    downloadBytes(bytes, outputName('selected', extraction.pages));
    toast(
      extraction.pages.length +
        ' selected page' +
        (extraction.pages.length === 1 ? '' : 's') +
        ' downloaded.' +
        (protectedDownload() ? ' The PDF needs your password to open.' : '') +
        exportNotes(notes),
    );
  } catch (error) {
    showExportError(error);
  }
}

// ---- Opening documents ------------------------------------------------------------

export function warmPdfTools() {
  loadPdfLib().catch(() => {});
  loadPdfjs().catch(() => {});
}
export function isDirty() {
  return ui.version !== ui.savedVersion || Boolean(ui.splitResults?.some((file) => !file.downloaded));
}
/**
 * Ask for a protected PDF's password until it opens the file. `attempt(password)`
 * opens it; a wrong password keeps the dialog open with a message. Resolves
 * with what attempt returned, or null if the person cancels or skips the file.
 */
function passwordDialog(name, several, attempt) {
  const dialog = $('#password-dialog'),
    form = $('#password-form'),
    input = $('#password-input'),
    reveal = $('#password-show'),
    error = $('#password-error'),
    submit = $('#password-submit'),
    cancel = $('#password-cancel');
  $('#password-file').textContent = '“' + name + '”';
  cancel.textContent = several ? 'Skip this file' : 'Cancel';
  input.value = '';
  input.type = 'password';
  reveal.checked = false;
  const showError = (message) => {
    error.textContent = message;
    error.hidden = !message;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  };
  showError('');
  return new Promise((resolve, reject) => {
    let settled = false,
      working = false;
    const finish = (value, failure) => {
      if (settled) return;
      settled = true;
      form.removeEventListener('submit', onSubmit);
      cancel.removeEventListener('click', onCancel);
      reveal.removeEventListener('change', onReveal);
      dialog.removeEventListener('close', onClose);
      if (dialog.open) dialog.close();
      input.value = '';
      if (failure) reject(failure);
      else resolve(value);
    };
    const onSubmit = async (event) => {
      event.preventDefault();
      if (working) return;
      if (!input.value) {
        showError('Enter the password.');
        input.focus();
        return;
      }
      working = true;
      submit.disabled = true;
      submit.textContent = 'Opening…';
      try {
        finish(await attempt(input.value));
      } catch (failure) {
        if (failure?.code === 'password-incorrect' && !settled) {
          showError(failure.message);
          input.focus();
          input.select();
        } else finish(null, failure);
      } finally {
        working = false;
        submit.disabled = false;
        submit.textContent = 'Open PDF';
      }
    };
    const onCancel = () => finish(null);
    // Escape closes the dialog. The close event arrives later, so one left over
    // from the previous prompt may reach this one while it is open: ignore that.
    const onClose = () => {
      if (!dialog.open) finish(null);
    };
    const onReveal = () => (input.type = reveal.checked ? 'text' : 'password');
    form.addEventListener('submit', onSubmit);
    cancel.addEventListener('click', onCancel);
    reveal.addEventListener('change', onReveal);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
    input.focus();
  });
}
/**
 * Open a PDF, asking for its password if it needs one. Resolves with openPdf's
 * result and the password that opened it ('' if none was needed), or null.
 */
async function openWithPassword(name, bytes, several) {
  try {
    return { ...(await openPdf(bytes)), password: '' };
  } catch (error) {
    if (error.code !== 'password-required') throw error;
  }
  return passwordDialog(name, several, async (password) => ({
    ...(await openPdf(bytes, { password })),
    password,
  }));
}
/** What to say once files are open: protection kept or removed, files skipped. */
let reassured = false;
/** Said with the first document opened in this tab; later ones are simply ready. */
function reassurance() {
  if (reassured) return '';
  reassured = true;
  return ' Everything happens on your device.';
}
function openedMessage(sources, { added, kept, skipped, shown = null }) {
  const withPassword = sources.some((source) => source.protection === 'password'),
    limited = sources.some((source) => source.protection === 'owner'),
    pictures = sources.filter((source) => source.picture).length,
    parts = [];
  if (pictures === sources.length && !added)
    parts.push(
      pictures === 1
        ? 'Your picture is a PDF page now. Download it, or add more pictures.'
        : 'Your ' + pictures + ' pictures are PDF pages now. Put them in order, then download one PDF.',
    );
  else if (added)
    parts.push(added + ' page' + (added === 1 ? '' : 's') + ' added. Arrange them, then download.');
  else if (ui.tool === 'unlock' && (withPassword || limited))
    parts.push(
      'Your PDF is unlocked. Download a copy that opens without a password' +
        (limited ? ' and without limits on printing, copying or changes.' : '.'),
    );
  else if (withPassword) parts.push('Your PDF is unlocked for editing, here on your device.');
  else if (!added && ui.tool === 'form' && documentFields().length)
    parts.push('Your PDF has fields to fill in: click one to type in it.' + reassurance());
  else parts.push('Your PDF is ready.' + reassurance());
  if (kept) parts.push('Your download will keep the same password. Change it in Protect PDF.');
  if (limited && ui.tool !== 'unlock')
    parts.push('It had limits on printing, copying or changes, which your download won’t have.');
  if (skipped.length)
    parts.push(
      skipped.map((name) => '“' + name + '”').join(', ') +
        (skipped.length === 1 ? ' wasn’t' : ' weren’t') +
        ' opened.',
    );
  if (shown) parts.push(shown);
  return parts.join(' ');
}
/** A picture file as a one-page source; it keeps the picture to lay the page out again. */
async function pictureSource(file, picture = null) {
  picture ||= await pictureForPage(file);
  const layout = ui.pictureLayout;
  const info = await openPdf(await imagesToPdf([picture], layout));
  return {
    id: uid(),
    bytes: info.bytes,
    name: picture.name,
    pageCount: 1,
    hasForm: false,
    pages: info.pages.map((page) => ({ box: page.cropBox, rotation: page.rotation })),
    picture,
    pictureLayout: { ...layout },
  };
}
/** Lay the pages made from pictures out again (paper size or margin changed), as one undo step. */
export async function relayoutPictures() {
  const old = state.sources.filter(
    (source) => source.picture && state.pages.some((p) => p.sourceId === source.id),
  );
  if (!old.length) return;
  busy(true, 'Updating the pages made from pictures…');
  try {
    // New sources with new ids: the preview keeps rendered pages by source.
    const replaced = new Map();
    for (const source of old) replaced.set(source.id, await pictureSource(null, source.picture));
    change(
      () => {
        state.sources = [...state.sources.filter((s) => !replaced.has(s.id)), ...replaced.values()];
        state.pages = state.pages.map((page) => {
          const source = replaced.get(page.sourceId);
          if (!source) return page;
          // Added margins keep their size in points on the new page (crops stay fractions).
          const before = state.sources.find((s) => s.id === page.sourceId)?.pages[page.index]?.box;
          const crop =
            before && source.pages[page.index]
              ? rescaledMargins(page.crop, before, source.pages[page.index].box)
              : page.crop;
          return { ...page, sourceId: source.id, crop };
        });
      },
      { layout: true, label: 'Page size' },
    );
  } catch (error) {
    toast(friendly(error), true);
  } finally {
    busy(false);
  }
}
export async function openFiles(files, append = false) {
  if (ui.busy || ui.batch?.isBusy() || !files.length) return;
  const list = [...files];
  // The picker is cleared only after its files are read (see finally below), or
  // when we stop early, so choosing the same file again still fires a change event.
  const resetPicker = () => {
    $('#file-input').value = '';
  };
  const isPdf = (file) => file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  if (list.some((file) => !isPdf(file) && !isPicture(file))) {
    resetPicker();
    toast('Please choose PDF files, or JPG and PNG pictures to make pages from.', true);
    return;
  }
  // With Add an image, a picture dropped on the page goes on the page.
  if (append && ui.tool === 'image' && list.length === 1 && isPicture(list[0]) && state.pages.length) {
    resetPicker();
    await addImageFile(list[0]);
    return;
  }
  append = append && state.pages.length > 0;
  if (
    !append &&
    state.pages.length &&
    isDirty() &&
    !(await confirmDialog({
      eyebrow: 'START A NEW DOCUMENT',
      title: 'Replace your current document?',
      body: 'Your edits will be cleared. Download your edited PDF first if you want to keep it.',
      confirmLabel: 'Open new PDF',
    }))
  ) {
    resetPicker();
    return;
  }
  stopEditing();
  busy(true, 'Opening your PDF' + (list.length > 1 ? 's' : '') + '…');
  loadPdfjs().catch(() => {});
  try {
    const sources = [],
      pages = [],
      skipped = [];
    // The first password that opened a file protects downloads too (not when unlocking).
    let password = '';
    for (const file of list) {
      if (!isPdf(file)) {
        sources.push(await pictureSource(file));
        pages.push({ id: uid(), sourceId: sources.at(-1).id, index: 0, rotation: 0 });
        continue;
      }
      const info = await openWithPassword(
        file.name,
        new Uint8Array(await file.arrayBuffer()),
        list.length > 1,
      );
      if (!info) {
        skipped.push(file.name);
        continue;
      }
      const id = uid();
      password ||= info.password;
      sources.push({
        id,
        // An encrypted PDF's unencrypted copy: the editor works on it in memory.
        bytes: info.bytes,
        name: file.name,
        pageCount: info.pageCount,
        hasForm: info.hasForm,
        form: info.form,
        details: info.details,
        pages: info.pages.map((page) => ({ box: page.cropBox, rotation: page.rotation })),
        protection: info.protection,
      });
      for (let index = 0; index < info.pageCount; index++)
        pages.push({ id: uid(), sourceId: id, index, rotation: 0 });
    }
    if (!sources.length) return;
    const keep = Boolean(password) && ui.tool !== 'unlock' && !(append && protectedDownload());
    // Draw text in the standard font as soon as the first page appears.
    previewFont('standard');
    if (append) {
      const known = new Map(state.sources.map((source) => [source.id, source]));
      sources.forEach((source) => known.set(source.id, source));
      const used = [...state.pages, ...pages].map((page) => known.get(page.sourceId));
      if (!state.flattenForms && used.some((source) => source.hasForm))
        throw new Error(
          'PDFs with form fields can only be combined with other files once their fields are flattened. Turn on “Flatten fields on download” in Fill form, then add the file again.',
        );
      change(
        () => {
          state.sources.push(...sources);
          state.pages.push(...pages);
          if (keep) state.protection = { enabled: true, password };
        },
        { layout: true, label: 'Add files' },
      );
      renderTool();
      toast(openedMessage(sources, { added: pages.length, kept: keep, skipped }));
    } else {
      closeDocuments();
      ui.thumbs.cache.clear();
      setState({
        ...emptyState(),
        sources,
        pages,
        protection: keep ? { enabled: true, password } : null,
      });
      ui.activeId = pages[0].id;
      ui.selected = new Set([pages[0].id]);
      ui.selectedByDefault = true;
      ui.item = null;
      ui.past = [];
      ui.future = [];
      ui.lastChange = null;
      ui.version++;
      ui.savedVersion = ui.version;
      ui.exported = null;
      ui.initial = snapshot();
      ui.cropDraft = { left: 0, top: 0, right: 0, bottom: 0, scope: 'current' };
      ui.rangeDraft = '';
      ui.scopeErrors = {};
      ui.splitResults = null;
      ui.lastCropPreset = null;
      ui.shownSettings = new Set();
      ui.image = null;
      ui.zoom = 1;
      ui.formZoom = null;
      resetStage();
      // A PDF with fields to fill in, opened from the home page, opens in Fill form.
      if (!pageTool && documentFields().length) ui.tool = 'form';
      dropDefaultSelection();
      // Phones: tools you use on the page start with their settings folded away.
      if (phone()) setSheet(!['text', 'highlight', 'draw'].includes(ui.tool));
      showWorkspace();
      documentChanged(true);
      // Opened on Watermark or Page numbers: theirs show at once, and the
      // opened message says so.
      const shown = showSettingDefaults({ notice: false });
      renderTool();
      ui.focusKey = '#document-name';
      recordView('editor');
      toast(openedMessage(sources, { added: 0, kept: keep, skipped, shown }));
    }
  } catch (error) {
    toast(friendly(error), true);
  } finally {
    busy(false);
    resetPicker();
  }
}
export function showWorkspace() {
  if (ui.batch && !ui.batch.close()) return;
  document.body.classList.remove('batching');
  $('#landing').hidden = true;
  $('#workspace').hidden = false;
  document.body.classList.add('editing');
  window.scrollTo(0, 0);
}
export function showLanding() {
  if (ui.batch && !ui.batch.close()) return;
  stopEditing();
  document.body.classList.remove('batching');
  $('#landing').hidden = false;
  $('#workspace').hidden = true;
  document.body.classList.remove('editing');
  let resume = $('#resume-document');
  if (state.pages.length && !resume) {
    resume = document.createElement('button');
    resume.id = 'resume-document';
    resume.className = 'button secondary';
    resume.dataset.action = 'resume';
    resume.textContent = 'Return to your open document';
    resume.style.marginTop = '14px';
    $('#drop-zone').append(resume);
  }
  if (resume) resume.hidden = !state.pages.length;
}
