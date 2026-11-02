/**
 * Documents: building the PDF (in the export worker when there is one),
 * downloads and their errors, and opening and adding files.
 */

import { buildPdfWithNotes, imagesToPdf, loadPdfLib, openPdf, passwordProblem } from './pdf-engine.js';
import { isPicture, pictureForPage } from './convert.js';
import { closeDocuments, loadPdfjs, previewFont } from './preview.js';
import {
  $,
  annotationById,
  busy,
  cancellable,
  confirmDialog,
  emptyState,
  friendly,
  pageTool,
  phone,
  setState,
  snapshot,
  state,
  toast,
  ui,
  uid,
} from './editor-core.js';
import { resetStage } from './page-view.js';
import { documentFields, focusField } from './form-ui.js';
import { selectItem, stopEditing } from './page-items.js';
import { protectedDownload, renderTool, unlockedDownload, updateProtectionStatus } from './tool-panel.js';
import { choosePage, chooseTool, formProblem, selectedIds, setSheet } from './pages.js';
import { addImageFile, batch, change, documentChanged, recordView } from './app.js';

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
export function outputName(
  suffix = protectedDownload()
    ? 'protected'
    : unlockedDownload()
      ? 'unlocked'
      : usedSources().every((source) => source.picture)
        ? 'converted'
        : 'edited',
) {
  const sources = usedSources();
  const base = sources.length === 1 ? sources[0].name.replace(/\.(pdf|jpe?g|png)$/i, '') : 'combined';
  return base + '-' + suffix + '.pdf';
}
/** What a download message adds about the file, from the build's notes. */
function exportNotes(notes) {
  const content = notes.includes('pdfa-removed'),
    password = notes.includes('pdfa-removed-password');
  if (!content && !password) return '';
  return (
    ' It’s no longer marked as PDF/A (archival), because ' +
    (password && content
      ? 'PDF/A files can’t have a password, and added text and marks don’t meet PDF/A rules.'
      : password
        ? 'PDF/A files can’t have a password.'
        : 'added text and marks don’t meet PDF/A rules.')
  );
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
    const { bytes } = await exportDocument(extraction, 'Preparing selected pages…');
    downloadBytes(bytes, outputName('selected'));
    toast(
      extraction.pages.length +
        ' selected page' +
        (extraction.pages.length === 1 ? '' : 's') +
        ' downloaded.' +
        (protectedDownload() ? ' The PDF needs your password to open.' : ''),
    );
  } catch (error) {
    showExportError(error);
  }
}

export function showInfo(kind) {
  const content = $('#dialog-content');
  if (kind === 'privacy')
    content.innerHTML =
      '<div class="eyebrow">YOUR FILES, YOUR SPACE</div><h2 id="dialog-title">Private by design.</h2><p>QFT PDF processes your PDFs in this browser. The editor does not send document contents, filenames, or your edits to a processing server.</p><h3>What stays on your device?</h3><p>Your PDF files, added images, text, and the edited document. PDF files and generated results are held in this tab’s memory. Closing or refreshing the tab clears them. Saved presets contain your chosen text and settings; they stay in this browser until you delete them or clear site data.</p><p>Passwords are used only in this tab: to open a protected PDF, and to protect your download. They are never saved, not even in presets. Your signature is kept in this browser only if you choose “Keep it on this device”; unticking it removes it.</p><h3>What uses the internet?</h3><p>Your browser loads this website, its PDF libraries, and font assets. The hosting provider may receive ordinary website requests. QFT PDF does not include advertising or analytics scripts.</p><p>Use Download PDF to save your finished copy. Your original file is not overwritten.</p>';
  if (kind === 'help')
    content.innerHTML =
      '<div class="eyebrow">A LITTLE GUIDANCE</div><h2 id="dialog-title">Make yourself at home.</h2><p>Open a PDF, choose a tool, and edit right on the page. Every change shows at once, exactly as it will appear in your PDF. Download PDF saves a new copy.</p><h3>What can I edit?</h3><p>Add text, PNG/JPG images, highlights, watermarks, headers, footers, and page numbers. Fill in PDF forms. Merge PDFs or reorder, rotate, delete, crop, extract, and split their pages, and add blank pages. Batch tools apply a saved preset to several PDFs separately.</p><h3>Text, images and highlights</h3><p>With Add text, click the page and type. Drag an item to move it; drag a handle to resize it. Select an item to change it in the panel, or press Delete to remove it. With an item selected, arrow keys nudge it (hold Shift for bigger steps) and Enter edits text.</p><h3>Undo and redo</h3><p>Undo (Ctrl+Z or ⌘Z) reverses your recent edits; Redo (Ctrl+Shift+Z or ⌘⇧Z) brings them back. Reset returns to the first document you opened. Your workspace is not saved after you close or refresh this tab.</p><h3>Delete Pages &amp; Crop PDF</h3><p>Delete Pages lets you select thumbnails or a page range, such as 2, 4-6. Keep at least one page. Crop PDF lets you drag an area to keep or enter margin percentages, then apply to the current, selected, or every page. Each crop trims the current visible area. Restore original crop brings back the original page boundary for your chosen scope. Cropping hides content; it is not secure redaction.</p><p>Add text creates new content; it does not rewrite existing paragraphs. Highlights are annotations, not secure redaction. Changes can invalidate existing digital signatures.</p><h3>Signatures</h3><p>With Sign PDF, draw your signature, type your name in a handwriting style, or upload a picture of it. Click the page to place it, or add it to every page; drag it to move it and a corner to resize it. It is a picture of your signature, not a certificate-based digital signature.</p><h3>Forms</h3><p>With Fill form, click a field to type in it, or tick its box; Tab moves to the next field. Your download keeps the fields fillable, or turn on Flatten fields on download to make your answers part of the pages. Calculations built into a form don’t run, and forms made only in Adobe’s XFA format can’t be filled.</p><h3>Passwords</h3><p>A PDF that needs a password asks for it when you open it. Your download keeps that password: change it in Protect PDF, or remove it in Unlock PDF. PDFs that only limit printing, copying or changes open without asking, and your download won’t have those limits. Passwords stay on your device and aren’t saved.</p><h3>Supported files</h3><p>PDFs with no fixed file-size or page-count limit, including password-protected PDFs (not those protected with a certificate). JPG and PNG pictures open as pages (JPG to PDF); PDF to JPG saves pages as pictures. Processing capacity depends on your device and available browser memory. Very large files can be slow or may not open, especially on mobile devices. To combine, remove, extract or split pages of a PDF with form fields, first turn on Flatten fields on download in Fill form.</p><h3>Fonts</h3><p>Latin and Chinese text are supported, as well as Japanese kana and Korean Hangul. Japanese kanji and Traditional Chinese characters use the font’s Simplified Chinese shapes, so some of them look slightly different. Only the characters you use are embedded, so Chinese text adds kilobytes to your PDF. The Chinese font (16 MB) downloads once, the first time you type it. Other scripts depend on the bundled font coverage.</p><h3>Split PDF and batch presets</h3><p>Split by individual page, every N pages, or custom groups such as 1-3; 4-6. A semicolon starts a new output PDF. Download individual results or a ZIP. Batch tools combine watermarks, headers/footers, page numbers, and cropping. Numbering restarts for each file. Presets are saved in this browser; PDFs are not.</p>';
  $('#info-dialog').showModal();
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
function openedMessage(sources, { added, kept, skipped }) {
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
    parts.push('Your PDF has fields to fill in: click one to type in it. Everything happens on your device.');
  else parts.push('Your PDF is ready. Everything happens on your device.');
  if (kept) parts.push('Your download will keep the same password. Change it in Protect PDF.');
  if (limited && ui.tool !== 'unlock')
    parts.push('It had limits on printing, copying or changes, which your download won’t have.');
  if (skipped.length)
    parts.push(
      skipped.map((name) => '“' + name + '”').join(', ') +
        (skipped.length === 1 ? ' wasn’t' : ' weren’t') +
        ' opened.',
    );
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
        state.pages = state.pages.map((page) =>
          replaced.has(page.sourceId) ? { ...page, sourceId: replaced.get(page.sourceId).id } : page,
        );
      },
      { layout: true },
    );
  } catch (error) {
    toast(friendly(error), true);
  } finally {
    busy(false);
  }
}
export async function openFiles(files, append = false) {
  if (ui.busy || batch.isBusy() || !files.length) return;
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
        { layout: true },
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
      ui.image = null;
      ui.zoom = 1;
      resetStage();
      // A PDF with fields to fill in, opened from the home page, opens in Fill form.
      if (!pageTool && documentFields().length) ui.tool = 'form';
      // Phones: tools you use on the page start with their settings folded away.
      if (phone()) setSheet(!['text', 'highlight'].includes(ui.tool));
      showWorkspace();
      documentChanged(true);
      renderTool();
      ui.focusKey = '#document-name';
      recordView('editor');
      toast(openedMessage(sources, { added: 0, kept: keep, skipped }));
    }
  } catch (error) {
    toast(friendly(error), true);
  } finally {
    busy(false);
    resetPicker();
  }
}
export function showWorkspace() {
  if (!batch.close()) return;
  document.body.classList.remove('batching');
  $('#landing').hidden = true;
  $('#workspace').hidden = false;
  document.body.classList.add('editing');
  window.scrollTo(0, 0);
}
export function showLanding() {
  if (!batch.close()) return;
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
