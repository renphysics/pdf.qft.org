import { normalizePreset, applyPreset, createZip, uniqueFilename, safeBaseName } from './workflows.js';
import { loadPdfLib } from './pdf-engine.js';

const STORAGE_KEY = 'qft-pdf.presets.v1';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const sizeLabel = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const id = () => crypto.randomUUID?.() || `preset-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const watermarkDefaults = { text: 'DRAFT', size: 48, color: '#7c8c76', opacity: .18, angle: -35, position: 'center' };
const footerDefaults = { headerLeft: '', headerCenter: '', headerRight: '', footerLeft: '', footerCenter: '', footerRight: '', size: 10, color: '#53635d', margin: 28 };
const numbersDefaults = { format: 'Page {page} of {total}', start: 1, size: 10, color: '#53635d', margin: 28, position: 'bottom-right' };
const builtIns = [
  { id: 'builtin-draft', preset: { version: 1, name: 'Draft copy', watermark: watermarkDefaults, headerFooter: null, pageNumbers: null, crop: null } },
  { id: 'builtin-numbered', preset: { version: 1, name: 'Numbered document', watermark: null, headerFooter: null, pageNumbers: numbersDefaults, crop: null } },
  { id: 'builtin-teaching', preset: { version: 1, name: 'Lecture handout', watermark: null, headerFooter: { ...footerDefaults, footerLeft: 'Course notes', footerRight: 'Page {page} of {total}' }, pageNumbers: null, crop: null } },
];

function field(label, name, type = 'text', options = '') {
  return `<label class="batch-field"><span>${label}</span><input type="${type}" name="${name}" ${options}></label>`;
}
function select(label, name, options) {
  return `<label class="batch-field"><span>${label}</span><select name="${name}">${options.map(([value, title]) => `<option value="${value}">${title}</option>`).join('')}</select></label>`;
}
function operation(name, title, description, contents, checked = false) {
  return `<section class="batch-operation"><label class="batch-operation-toggle"><input type="checkbox" name="enable-${name}" ${checked ? 'checked' : ''}><span><strong>${title}</strong><small>${description}</small></span></label><fieldset class="batch-operation-fields" data-operation="${name}" aria-label="${title} settings">${contents}</fieldset></section>`;
}

export function initBatch({ onShow = () => {}, onBack = () => {}, notify = () => {} } = {}) {
  const root = document.createElement('section');
  root.id = 'batch-workspace';
  root.className = 'batch-workspace';
  root.hidden = true;
  root.setAttribute('aria-label', 'Batch processing and saved presets');
  root.innerHTML = `
    <div class="batch-shell">
      <div class="batch-topline"><button type="button" class="button subtle compact" data-batch-action="back">${icon('back')}All tools</button><span>${icon('shield')}Processed on your device</span></div>
      <header class="batch-heading"><div><div class="eyebrow">A WORKFLOW WORTH REPEATING</div><h1>One setup. <em>Every PDF.</em></h1><p>Apply a saved combination of edits to separate files, then download them together.</p></div><span class="batch-tag">BATCH &amp; PRESETS</span></header>
      <div class="batch-layout">
        <aside class="batch-settings" aria-label="Batch preset settings">
          <div class="batch-section-title"><span class="batch-step">1</span><div><h2>Set up your edits</h2><p>Start with a preset, then make it yours.</p></div></div>
          <form id="batch-preset-form">
            <fieldset id="batch-settings-controls">
              <label class="batch-field"><span>Preset</span><select id="batch-preset-select" aria-describedby="batch-preset-storage"></select></label>
              <div class="batch-save-row">${field('Preset name', 'preset-name', 'text', 'maxlength="80" placeholder="e.g. Course handout"')}<button type="button" class="button secondary compact" data-batch-action="save-preset">Save preset</button></div>
              <div class="batch-preset-note"><p id="batch-preset-storage">Saved presets stay in this browser. PDF files are never saved with them.</p><button type="button" class="text-button" data-batch-action="delete-preset" hidden>Delete saved preset</button></div>
              ${operation('watermark', 'Watermark', 'Repeat a text stamp on every page.', `
                ${field('Watermark text', 'watermark-text', 'text', 'maxlength="300" required')}
                <div class="batch-fields-2">${field('Text size (pt)', 'watermark-size', 'number', 'min="8" max="150" step="1" required')}${field('Watermark color', 'watermark-color', 'color')}</div>
                <div class="batch-fields-2">${field('Opacity (%)', 'watermark-opacity', 'number', 'min="0" max="100" step="1" required')}${field('Angle (°)', 'watermark-angle', 'number', 'min="-90" max="90" step="1" required')}</div>
                ${select('Watermark position', 'watermark-position', [['center', 'Center'], ['top', 'Top'], ['bottom', 'Bottom']])}
              `, true)}
              ${operation('footer', 'Headers & footers', 'Consistent details at the page edges.', `
                <p class="batch-field-note">Use {page} and {total} for page numbers within each file.</p>
                <div class="batch-subheading">Header</div>${field('Header left', 'headerLeft', 'text', 'maxlength="300"')}${field('Header center', 'headerCenter', 'text', 'maxlength="300"')}${field('Header right', 'headerRight', 'text', 'maxlength="300"')}
                <div class="batch-subheading">Footer</div>${field('Footer left', 'footerLeft', 'text', 'maxlength="300"')}${field('Footer center', 'footerCenter', 'text', 'maxlength="300"')}${field('Footer right', 'footerRight', 'text', 'maxlength="300"')}
                <div class="batch-fields-3">${field('Size (pt)', 'footer-size', 'number', 'min="6" max="24" step="1" required')}${field('Margin (pt)', 'footer-margin', 'number', 'min="12" max="100" step="1" required')}${field('Text color', 'footer-color', 'color')}</div>
              `)}
              ${operation('numbers', 'Page numbers', 'Number each document independently.', `
                ${field('Number format', 'numbers-format', 'text', 'maxlength="300" required')}
                <p class="batch-field-note">Use {page} for the number and {total} for each file’s page count.</p>
                ${select('Number position', 'numbers-position', [['bottom-right', 'Bottom right'], ['bottom-center', 'Bottom center'], ['bottom-left', 'Bottom left']])}
                <div class="batch-fields-2">${field('Start numbering at', 'numbers-start', 'number', 'min="1" max="1000000" step="1" required')}${field('Number size (pt)', 'numbers-size', 'number', 'min="6" max="24" step="1" required')}</div>
                <div class="batch-fields-2">${field('Number margin (pt)', 'numbers-margin', 'number', 'min="12" max="100" step="1" required')}${field('Number color', 'numbers-color', 'color')}</div>
              `)}
              ${operation('crop', 'Crop margins', 'Trim the same percentage from each page.', `
                <div class="batch-fields-2">${field('Top margin (%)', 'crop-top', 'number', 'min="0" max="99" step="0.1" required')}${field('Bottom margin (%)', 'crop-bottom', 'number', 'min="0" max="99" step="0.1" required')}${field('Left margin (%)', 'crop-left', 'number', 'min="0" max="99" step="0.1" required')}${field('Right margin (%)', 'crop-right', 'number', 'min="0" max="99" step="0.1" required')}</div>
                <p class="batch-field-note">Margins follow each page’s visible orientation. Cropping hides content; it is not secure redaction.</p>
              `)}
            </fieldset>
          </form>
        </aside>
        <div class="batch-main">
          <section class="batch-file-card" aria-labelledby="batch-file-title">
            <div class="batch-section-title"><span class="batch-step">2</span><div><h2 id="batch-file-title">Add your PDFs</h2><p>Each file stays separate. Your originals stay unchanged.</p></div></div>
            <button type="button" id="batch-drop-zone" class="batch-drop-zone" data-batch-action="choose-files"><span class="batch-upload-icon">${icon('upload')}</span><strong>Choose PDFs or drop them here</strong><span>Multiple files · no fixed size or page limit</span></button>
            <div class="batch-queue-toolbar" hidden><strong id="batch-queue-count"></strong><button type="button" class="text-button" data-batch-action="clear-queue">Clear list</button></div>
            <ul id="batch-file-list" class="batch-file-list" aria-label="Files in this batch"></ul>
            <p class="batch-device-note">Large batches depend on available browser memory. Files are processed one at a time.</p>
          </section>
          <section class="batch-run-card" aria-labelledby="batch-run-title">
            <div class="batch-section-title"><span class="batch-step">3</span><div><h2 id="batch-run-title">Process and download</h2><p id="batch-operation-summary">Watermark on every page.</p></div></div>
            <p id="batch-settings-warning" class="batch-inline-note" hidden>Settings changed. Existing downloads use the previous settings; process again to update them.</p>
            <div id="batch-progress-region" hidden><div class="batch-progress-label"><span id="batch-progress-label">Preparing files…</span><span id="batch-progress-percent">0%</span></div><progress id="batch-progress" max="100" value="0" aria-label="Batch processing progress"></progress></div>
            <p id="batch-status" class="batch-status" role="status" aria-live="polite">Add PDFs to get started.</p>
            <div class="batch-run-actions"><button type="button" class="button primary" data-batch-action="process" disabled>${icon('check')}Process PDFs</button><button type="button" class="button secondary" data-batch-action="stop" hidden>Stop after this file</button><button type="button" class="button secondary" data-batch-action="download-zip" hidden>${icon('download')}Download ZIP</button></div>
            <p class="batch-result-note" id="batch-result-note" hidden>Download individual files from the list, or collect successful results in one ZIP.</p>
          </section>
        </div>
      </div>
    </div>
    <input type="file" id="batch-file-input" accept=".pdf,application/pdf" multiple hidden>
  `;
  document.querySelector('#main').append(root);
  const $ = selector => root.querySelector(selector);
  const $$ = selector => [...root.querySelectorAll(selector)];
  const form = $('#batch-preset-form');
  const input = name => form.elements.namedItem(name);
  let saved = [], queue = [], activePresetId = builtIns[0].id;
  let processing = false, stopping = false, settingsChanged = false, storageAvailable = true, lastRunName = '', hadRun = false;

  function inform(message, error = false) { $('#batch-status').textContent = message; notify(message, error); }
  function readSavedPresets() {
    try {
      const text = localStorage.getItem(STORAGE_KEY);
      const parsed = text ? JSON.parse(text) : [];
      if (!Array.isArray(parsed)) throw new Error('Invalid preset storage.');
      saved = parsed.flatMap(entry => {
        try {
          if (!entry || typeof entry.id !== 'string' || !entry.id.startsWith('saved-')) return [];
          return [{ id: entry.id, preset: normalizePreset(entry.preset) }];
        } catch { return []; }
      });
    } catch { saved = []; storageAvailable = false; }
  }
  function storePresets() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); storageAvailable = true; return true; }
    catch { storageAvailable = false; return false; }
  }
  function updatePresetMenu() {
    const menu = $('#batch-preset-select');
    menu.innerHTML = '<option value="">Custom settings</option><optgroup label="Ready to use">' + builtIns.map(entry => `<option value="${entry.id}">${escapeHtml(entry.preset.name)}</option>`).join('') + '</optgroup>' + (saved.length ? '<optgroup label="Your saved presets">' + saved.map(entry => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.preset.name)}</option>`).join('') + '</optgroup>' : '');
    menu.value = activePresetId;
    $('[data-batch-action="delete-preset"]').hidden = !saved.some(entry => entry.id === activePresetId);
    $('#batch-preset-storage').textContent = storageAvailable ? 'Saved presets stay in this browser. PDF files are never saved with them.' : 'Browser storage is unavailable. Presets are available in this tab only.';
  }
  function updateOperationPanels() {
    for (const key of ['watermark', 'footer', 'numbers', 'crop']) {
      const enabled = input(`enable-${key}`).checked;
      const fields = $(`[data-operation="${key}"]`);
      fields.hidden = !enabled; fields.disabled = !enabled;
      fields.closest('.batch-operation').classList.toggle('enabled', enabled);
    }
    const labels = [['watermark', 'Watermark'], ['footer', 'Headers & footers'], ['numbers', 'Page numbers'], ['crop', 'Crop margins']].filter(([key]) => input(`enable-${key}`).checked).map(([, label]) => label);
    $('#batch-operation-summary').textContent = labels.length ? `${labels.join(' · ')}. Applied to every page of each file.` : 'Enable at least one edit in your preset.';
  }
  function setPreset(preset, presetId = '') {
    const normalized = normalizePreset(preset);
    const wm = normalized.watermark || watermarkDefaults, hf = normalized.headerFooter || footerDefaults, pn = normalized.pageNumbers || numbersDefaults, crop = normalized.crop || { left: 0, top: 0, right: 0, bottom: 0 };
    input('preset-name').value = normalized.name;
    for (const [key, value] of Object.entries(wm)) input(`watermark-${key}`).value = key === 'opacity' ? Math.round(value * 100) : value;
    for (const key of ['headerLeft', 'headerCenter', 'headerRight', 'footerLeft', 'footerCenter', 'footerRight']) input(key).value = hf[key] || '';
    for (const key of ['size', 'color', 'margin']) input(`footer-${key}`).value = hf[key];
    for (const [key, value] of Object.entries(pn)) input(`numbers-${key}`).value = value;
    for (const [key, value] of Object.entries(crop)) if (['left', 'top', 'right', 'bottom'].includes(key)) input(`crop-${key}`).value = Math.round(value * 1000) / 10;
    input('enable-watermark').checked = !!normalized.watermark;
    input('enable-footer').checked = !!normalized.headerFooter;
    input('enable-numbers').checked = !!normalized.pageNumbers;
    input('enable-crop').checked = !!normalized.crop;
    activePresetId = presetId; settingsChanged = hadRun;
    updatePresetMenu(); updateOperationPanels(); renderActions();
  }
  function readPreset() {
    const value = name => input(name).value;
    const number = name => Number(value(name));
    return normalizePreset({
      version: 1, name: value('preset-name').trim() || 'Custom preset',
      watermark: input('enable-watermark').checked ? { text: value('watermark-text'), size: number('watermark-size'), color: value('watermark-color'), opacity: number('watermark-opacity') / 100, angle: number('watermark-angle'), position: value('watermark-position') } : null,
      headerFooter: input('enable-footer').checked ? { ...Object.fromEntries(['headerLeft', 'headerCenter', 'headerRight', 'footerLeft', 'footerCenter', 'footerRight'].map(key => [key, value(key)])), size: number('footer-size'), color: value('footer-color'), margin: number('footer-margin') } : null,
      pageNumbers: input('enable-numbers').checked ? { format: value('numbers-format'), start: number('numbers-start'), size: number('numbers-size'), color: value('numbers-color'), margin: number('numbers-margin'), position: value('numbers-position') } : null,
      crop: input('enable-crop').checked ? Object.fromEntries(['left', 'top', 'right', 'bottom'].map(key => [key, number(`crop-${key}`) / 100])) : null,
    });
  }
  function savePreset() {
    if (!form.reportValidity()) return;
    if (!input('preset-name').value.trim()) { input('preset-name').focus(); inform('Give your preset a name before saving it.', true); return; }
    try {
      const preset = readPreset();
      const existing = saved.find(entry => entry.id === activePresetId) || saved.find(entry => entry.preset.name.toLocaleLowerCase() === preset.name.toLocaleLowerCase());
      const next = { id: existing?.id || `saved-${id()}`, preset };
      saved = existing ? saved.map(entry => entry.id === existing.id ? next : entry) : [...saved, next];
      activePresetId = next.id;
      const persistent = storePresets(); updatePresetMenu();
      inform(persistent ? `“${preset.name}” saved in this browser.` : `“${preset.name}” is saved for this tab only. Browser storage is unavailable.`, !persistent);
    } catch (error) { inform(error.message || 'The preset could not be saved.', true); }
  }
  function deletePreset() {
    const entry = saved.find(item => item.id === activePresetId); if (!entry) return;
    saved = saved.filter(item => item.id !== activePresetId); activePresetId = '';
    const persistent = storePresets(); updatePresetMenu();
    inform(persistent ? 'Saved preset deleted. Its settings remain here until you change them.' : 'Preset removed from this tab. Browser storage could not be updated.', !persistent);
  }
  function renderQueue() {
    const statuses = { waiting: 'Ready', processing: 'Processing', done: 'Ready to download', error: 'Could not process' };
    $('#batch-file-list').innerHTML = queue.map(entry => `<li class="batch-file-row ${entry.status}" data-batch-file="${entry.id}"><span class="batch-file-icon">${icon(entry.status === 'done' ? 'check' : 'file')}</span><div class="batch-file-copy"><strong title="${escapeHtml(entry.file.name)}">${escapeHtml(entry.file.name)}</strong><span>${sizeLabel(entry.file.size)}<span aria-hidden="true"> · </span><span data-batch-file-status>${statuses[entry.status]}${entry.status === 'done' ? ` · ${sizeLabel(entry.bytes.length)}` : ''}</span></span>${entry.error ? `<p class="batch-file-error">${escapeHtml(entry.error)}</p>` : ''}${entry.status === 'done' ? `<small>${escapeHtml(entry.outputName)}</small>` : ''}</div><div class="batch-file-actions">${entry.status === 'done' ? `<button type="button" class="button secondary compact" data-batch-action="download-file" data-file-id="${entry.id}" aria-label="Download ${escapeHtml(entry.outputName)}">${icon('download')}<span>Download</span></button>` : ''}<button type="button" class="icon-button" data-batch-action="remove-file" data-file-id="${entry.id}" aria-label="Remove ${escapeHtml(entry.file.name)} from batch" ${processing ? 'disabled' : ''}>${icon('close')}</button></div></li>`).join('');
    $('.batch-queue-toolbar').hidden = !queue.length;
    $('#batch-queue-count').textContent = `${queue.length} PDF${queue.length === 1 ? '' : 's'} · ${sizeLabel(queue.reduce((total, entry) => total + entry.file.size, 0))}`;
    $('#batch-drop-zone').classList.toggle('has-files', !!queue.length);
    renderActions();
  }
  function renderActions() {
    const success = queue.filter(entry => entry.status === 'done');
    const run = $('[data-batch-action="process"]');
    run.disabled = processing || !queue.length;
    run.innerHTML = icon('check') + (processing ? 'Processing…' : hadRun ? `Process ${queue.length} PDF${queue.length === 1 ? '' : 's'} again` : `Process ${queue.length || ''} PDF${queue.length === 1 ? '' : 's'}`);
    $('[data-batch-action="stop"]').hidden = !processing;
    $('[data-batch-action="stop"]').disabled = stopping;
    $('[data-batch-action="stop"]').textContent = stopping ? 'Stopping after this file…' : 'Stop after this file';
    $('[data-batch-action="download-zip"]').hidden = !success.length;
    $('[data-batch-action="download-zip"]').disabled = processing;
    $('[data-batch-action="download-zip"]').innerHTML = icon('download') + `Download ZIP (${success.length})`;
    $('#batch-result-note').hidden = !success.length;
    $('#batch-settings-warning').hidden = !(settingsChanged && success.length);
    $('#batch-settings-controls').disabled = processing;
    $('#batch-drop-zone').disabled = processing;
    $('[data-batch-action="clear-queue"]').disabled = processing;
    $('[data-batch-action="back"]').disabled = processing;
    $('#batch-progress-region').hidden = !processing && !hadRun;
  }
  function addFiles(files) {
    if (processing) { inform('Wait for this batch to finish, or stop after the current file, before adding PDFs.', true); return; }
    const list = [...files];
    const accepted = list.filter(file => file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf');
    if (accepted.length) loadPdfLib().catch(() => {});
    queue.push(...accepted.map(file => ({ id: id(), file, status: 'waiting', bytes: null, error: '', outputName: '', downloaded: false })));
    if (accepted.length) { renderQueue(); $('#batch-status').textContent = `${accepted.length} PDF${accepted.length === 1 ? '' : 's'} added. Choose your settings, then process the batch.`; }
    if (accepted.length < list.length) inform('Only PDF files were added. Choose PNG/JPG images in the single-document editor.', true);
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function downloadFile(entry) {
    if (!entry?.bytes) return;
    downloadBlob(new Blob([entry.bytes], { type: 'application/pdf' }), entry.outputName); entry.downloaded = true;
    inform(`${entry.outputName} downloaded.`);
  }
  async function downloadZip() {
    const completed = queue.filter(entry => entry.status === 'done'); if (!completed.length) return;
    const button = $('[data-batch-action="download-zip"]');button.disabled = true;
    try {
      const zip = await createZip(completed.map(entry => ({ name: entry.outputName, bytes: entry.bytes })));
      downloadBlob(zip, `${safeBaseName(lastRunName || 'qft-pdf')}-batch.zip`);
      completed.forEach(entry => { entry.downloaded = true; });
      inform(`${completed.length} processed PDF${completed.length === 1 ? '' : 's'} downloaded in a ZIP.`);
    } catch (error) { inform(error.message || 'The ZIP could not be created. Download files individually instead.', true); }
    finally { renderActions(); }
  }
  async function run() {
    if (processing || !queue.length || !form.reportValidity()) return;
    let preset;
    try { preset = readPreset(); } catch (error) { inform(error.message || 'Check your preset settings.', true); return; }
    processing = true; stopping = false; settingsChanged = false; hadRun = true; lastRunName = preset.name;
    queue.forEach(entry => { entry.bytes = null; entry.error = ''; entry.status = 'waiting'; entry.outputName = ''; entry.downloaded = false; });
    const usedNames = new Set();
    renderQueue();
    const setProgress = (index, fraction) => {
      const percent = Math.round(100 * (index + Math.max(0, Math.min(1, fraction))) / queue.length);
      $('#batch-progress').value = percent; $('#batch-progress-percent').textContent = `${percent}%`;
    };
    setProgress(0, 0);
    try {
      for (let index = 0; index < queue.length; index++) {
        if (stopping) break;
        const entry = queue[index]; entry.status = 'processing'; renderQueue();
        $('#batch-progress-label').textContent = `File ${index + 1} of ${queue.length} · ${entry.file.name}`;
        $('#batch-status').textContent = `Applying “${preset.name}” to file ${index + 1} of ${queue.length}.`;
        await tick();
        try {
          const bytes = new Uint8Array(await entry.file.arrayBuffer());
          entry.bytes = await applyPreset(bytes, preset, fraction => setProgress(index, fraction));
          entry.outputName = uniqueFilename(`${safeBaseName(entry.file.name)}-processed.pdf`, usedNames);
          entry.status = 'done';
        } catch (error) { entry.error = error.message || 'This PDF could not be processed.'; entry.status = 'error'; }
        setProgress(index, 1); renderQueue(); await tick();
      }
    } finally {
      processing = false; renderQueue();
      const done = queue.filter(entry => entry.status === 'done').length, failed = queue.filter(entry => entry.status === 'error').length, waiting = queue.filter(entry => entry.status === 'waiting').length;
      $('#batch-progress-label').textContent = waiting ? 'Stopped after the current file' : 'Batch complete';
      const summary = `${done} file${done === 1 ? '' : 's'} ready${failed ? ` · ${failed} could not be processed` : ''}${waiting ? ` · ${waiting} not processed` : ''}.`;
      inform(summary, done === 0 && failed > 0);
    }
  }

  root.addEventListener('click', event => {
    const target = event.target.closest('[data-batch-action]'); if (!target || target.disabled) return;
    const action = target.dataset.batchAction;
    if (action === 'back') { if (close()) onBack(); }
    if (action === 'choose-files') {
      // Start loading the PDF engine while the file picker is open.
      loadPdfLib().catch(() => {});
      $('#batch-file-input').click();
    }
    if (action === 'save-preset') savePreset();
    if (action === 'delete-preset') deletePreset();
    if (action === 'remove-file' && !processing) { queue = queue.filter(entry => entry.id !== target.dataset.fileId); if (!queue.length) { hadRun = false; settingsChanged = false; $('#batch-status').textContent = 'Add PDFs to get started.'; } renderQueue(); }
    if (action === 'clear-queue' && !processing) { queue = []; hadRun = false; settingsChanged = false; renderQueue(); $('#batch-status').textContent = 'Add PDFs to get started.'; }
    if (action === 'process') void run();
    if (action === 'stop') { stopping = true; renderActions(); $('#batch-status').textContent = 'The current file will finish; remaining files will stay unprocessed.'; }
    if (action === 'download-file') downloadFile(queue.find(entry => entry.id === target.dataset.fileId));
    if (action === 'download-zip') void downloadZip();
  });
  $('#batch-file-input').addEventListener('change', event => { addFiles(event.target.files); event.target.value = ''; });
  $('#batch-preset-select').addEventListener('change', event => {
    const entry = [...builtIns, ...saved].find(item => item.id === event.target.value);
    if (entry) setPreset(entry.preset, entry.id); else { activePresetId = ''; updatePresetMenu(); }
  });
  form.addEventListener('input', event => {
    if (event.target === $('#batch-preset-select')) return;
    activePresetId = ''; settingsChanged = hadRun;
    updatePresetMenu(); updateOperationPanels(); renderActions();
  });
  form.addEventListener('submit', event => { event.preventDefault(); savePreset(); });
  // The application's central drop handler calls addFiles(). Keep this listener
  // visual-only so a drop cannot append the same file twice.
  root.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) $('#batch-drop-zone').classList.add('drag-over'); });
  root.addEventListener('dragleave', event => { if (!root.contains(event.relatedTarget)) $('#batch-drop-zone').classList.remove('drag-over'); });
  root.addEventListener('drop', () => $('#batch-drop-zone').classList.remove('drag-over'));

  function open(preset) {
    if (preset && !processing) { try { setPreset(preset); } catch (error) { inform(error.message || 'This preset could not be opened.', true); } }
    root.hidden = false; document.body.classList.add('batching'); onShow(); window.scrollTo(0, 0);
  }
  function close() {
    if (processing) { inform('Finish this batch, or stop after the current file, before switching workspaces.', true); return false; }
    root.hidden = true; document.body.classList.remove('batching'); return true;
  }
  readSavedPresets(); setPreset(builtIns[0].preset, builtIns[0].id); renderQueue();
  return { open, addFiles, close, isOpen: () => !root.hidden, isBusy: () => processing, hasUnsavedWork: () => processing || queue.some(entry => entry.status === 'done' && !entry.downloaded) };
}
