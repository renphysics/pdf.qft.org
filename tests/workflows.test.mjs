import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const runtime = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../node_modules');
globalThis.PDFLib = require(path.join(runtime, 'pdf-lib'));
globalThis.fontkit = require('../node_modules/@pdf-lib/fontkit');
const { DOMMatrix, ImageData, Path2D } = require(path.join(runtime, '@napi-rs/canvas'));
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith('file:')) {
    try { return new Response(await readFile(new URL(url))); }
    catch { return new Response('', { status: 404 }); }
  }
  return nativeFetch(url, options);
};
const { planSplit, splitPdf, normalizePreset, applyPreset, createZip, safeBaseName, uniqueFilename } = await import('../dist/workflows.js');
const { inspectPdf } = await import('../dist/pdf-engine.js');
const pdfjs = await import(pathToFileURL(path.join(runtime, 'pdfjs-dist/legacy/build/pdf.mjs')));
const { PDFDocument, StandardFonts, degrees } = globalThis.PDFLib;
const outputDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output');
await mkdir(outputDir, { recursive: true });

async function fixture(count = 5) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < count; index++) {
    const page = pdf.addPage([400 + index * 30, 600 - index * 20]);
    page.setCropBox(20, 30, 350 + index * 30, 530 - index * 20);
    page.setRotation(degrees(index % 4 * 90));
    page.drawText(`Original page ${index + 1}`, { x: 100, y: 260, font, size: 12 });
  }
  pdf.setTitle('Workflow source');
  return pdf.save();
}

async function inspectIndependent(bytes) {
  const pdf = await pdfjs.getDocument({
    data: bytes.slice(), verbosity: 0,
    standardFontDataUrl: path.join(runtime, 'pdfjs-dist/standard_fonts/'),
  }).promise;
  const result = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    result.push({ width: viewport.width, height: viewport.height, text: content.items.map(item => item.str || '').join(' ') });
  }
  await pdf.loadingTask.destroy();
  return result;
}

function approx(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < .01, `${message}: ${actual} != ${expected}`);
}

assert.deepEqual(planSplit({ mode: 'each' }, 3), [[0], [1], [2]]);
assert.deepEqual(planSplit({ mode: 'chunks', size: '2' }, 5), [[0, 1], [2, 3], [4]]);
assert.deepEqual(planSplit({ mode: 'chunks', size: 20 }, 3), [[0, 1, 2]]);
assert.deepEqual(planSplit({ mode: 'ranges', ranges: '3, 1-2, 2; 4-5' }, 5), [[2, 0, 1], [3, 4]]);
assert.equal(planSplit({ mode: 'each' }, 350).length, 350, 'Split does not reintroduce a 300-page cap');
for (const options of [
  { mode: 'ranges', ranges: '' }, { mode: 'ranges', ranges: '1;;2' },
  { mode: 'ranges', ranges: '1;' }, { mode: 'ranges', ranges: '0' },
  { mode: 'ranges', ranges: '2-1' }, { mode: 'ranges', ranges: '1-6' },
  { mode: 'ranges', ranges: 'one' }, { mode: 'chunks', size: 0 },
  { mode: 'chunks', size: 1.5 }, { mode: 'invalid' },
]) assert.throws(() => planSplit(options, 5), undefined, `Invalid split settings: ${JSON.stringify(options)}`);
assert.throws(() => planSplit({ mode: 'each' }, 0));

const inputPreset = {
  version: 1, name: 'Lecture handout',
  watermark: { text: 'DRAFT', size: '30', color: '#58765b', opacity: '.15', angle: '0', position: 'center' },
  headerFooter: { headerLeft: 'Course notes', footerCenter: 'Reading copy', size: '8', margin: '20', color: '#244e41' },
  pageNumbers: { format: 'Sheet {page}/{total}', start: '10', size: '8', margin: '20', position: 'bottom-right', color: '#244e41' },
  crop: { left: '.1', right: '.1', top: '.1', bottom: '.05' },
  ignored: { scope: 'this file only' },
};
const originalPreset = structuredClone(inputPreset);
const preset = normalizePreset(inputPreset);
assert.deepEqual(inputPreset, originalPreset, 'Normalization does not mutate caller settings');
assert.equal(preset.version, 1);
assert.equal(preset.watermark.opacity, .15);
assert.equal(preset.crop.left, .1);
assert.equal(preset.pageNumbers.start, 10);
assert.ok(!('ignored' in preset));
assert.deepEqual(normalizePreset(JSON.parse(JSON.stringify(preset))), preset, 'Canonical preset survives JSON persistence');
const disabled = normalizePreset({ name: 'Only numbering', watermark: false, headerFooter: { enabled: false }, crop: null, pageNumbers: { format: '{page}' } });
assert.equal(disabled.watermark, null);
assert.equal(disabled.headerFooter, null);
assert.equal(disabled.crop, null);
for (const invalid of [
  {}, { version: 2, watermark: { text: 'DRAFT' } },
  { watermark: { text: '' } }, { watermark: { text: 'X', opacity: 2 } },
  { watermark: { text: 'X', color: 'red' } },
  { pageNumbers: { format: '', start: 1 } },
  { pageNumbers: { format: '{page}', start: 1.5 } },
  { crop: { left: .8, right: .3 } }, { crop: { top: -.1 } },
  { headerFooter: { footerCenter: 'X', size: Infinity } },
]) assert.throws(() => normalizePreset(invalid), undefined, `Invalid preset: ${JSON.stringify(invalid)}`);

const source = await fixture();
const sourceCopy = source.slice();
const originalGeometry = (await inspectPdf(source)).pages;
const batchProgress = [];
const processed = await applyPreset(source, preset, fraction => batchProgress.push(fraction));
assert.deepEqual(source, sourceCopy, 'Batch operation leaves original source bytes intact');
assert.equal(batchProgress.at(-1), 1);
assert.ok(batchProgress.every((fraction, i) => fraction >= 0 && fraction <= 1 && (!i || fraction >= batchProgress[i - 1])));
const processedPages = await inspectIndependent(processed);
assert.equal(processedPages.length, 5);
for (let i = 0; i < processedPages.length; i++) {
  approx(processedPages[i].width, .8 * originalGeometry[i].width, `Cropped width at rotation ${i % 4 * 90}`);
  approx(processedPages[i].height, .85 * originalGeometry[i].height, `Cropped height at rotation ${i % 4 * 90}`);
  assert.ok(processedPages[i].text.includes(`Original page ${i + 1}`), 'Source text remains searchable');
  for (const expected of ['Course notes', 'Reading copy', 'DRAFT', `Sheet ${10 + i}/5`]) {
    assert.ok(processedPages[i].text.includes(expected), `Missing ${expected} on page ${i + 1}`);
  }
}
const secondProcessed = await inspectIndependent(await applyPreset(await fixture(1), preset));
assert.ok(secondProcessed[0].text.includes('Sheet 10/1'), 'Each batch file restarts numbering using its own page count');
await writeFile(path.join(outputDir, 'workflow-batch.pdf'), processed);

const processedCopy = processed.slice();
const groups = planSplit({ mode: 'ranges', ranges: '3,1;2,4-5' }, 5);
const splitProgress = [];
const outputs = await splitPdf(processed, groups, { onProgress: fraction => splitProgress.push(fraction) });
assert.equal(outputs.length, 2);
assert.deepEqual(processed, processedCopy, 'Splitting does not mutate edited PDF input');
assert.equal(splitProgress.at(-1), 1);
const splitPages = await Promise.all(outputs.map(inspectIndependent));
assert.deepEqual(splitPages.map(pages => pages.length), [2, 3]);
for (let part = 0; part < groups.length; part++) {
  for (let page = 0; page < groups[part].length; page++) {
    const sourceIndex = groups[part][page];
    const actual = splitPages[part][page];
    assert.ok(actual.text.includes(`Original page ${sourceIndex + 1}`), 'Split preserves chosen order');
    assert.ok(actual.text.includes(`Sheet ${10 + sourceIndex}/5`), 'Split preserves applied numbering instead of renumbering');
    approx(actual.width, processedPages[sourceIndex].width, 'Split preserves visible width');
    approx(actual.height, processedPages[sourceIndex].height, 'Split preserves visible height');
  }
}
const processedPdf = await PDFDocument.load(processed);
const firstPartPdf = await PDFDocument.load(outputs[0]);
assert.equal(firstPartPdf.getPage(0).getRotation().angle, processedPdf.getPage(2).getRotation().angle);
assert.deepEqual(firstPartPdf.getPage(0).getCropBox(), processedPdf.getPage(2).getCropBox());
for (const invalidGroups of [[], [[]], [[-1]], [[5]], [[.5]]]) await assert.rejects(splitPdf(source, invalidGroups));
await assert.rejects(splitPdf(source, [[0]], { shouldCancel: () => true }), error => error.name === 'AbortError');
let cancel = false;
await assert.rejects(splitPdf(source, [[0], [1]], { onProgress: fraction => { if (fraction > 0) cancel = true; }, shouldCancel: () => cancel }), error => error.name === 'AbortError');

const form = await PDFDocument.create();
const formPage = form.addPage([400, 600]);
form.addPage([400, 600]);
const field = form.getForm().createTextField('student');
field.setText('Retain this value');
field.addToPage(formPage, { x: 50, y: 300, width: 200, height: 25 });
const formBytes = await form.save();
await assert.rejects(splitPdf(formBytes, [[0], [1]]), /form/i, 'Split rejects interactive forms explicitly');
const formProcessed = await applyPreset(formBytes, { name: 'Footer', headerFooter: { footerCenter: 'Course notes' } });
assert.equal((await PDFDocument.load(formProcessed)).getForm().getTextField('student').getText(), 'Retain this value');

assert.equal(safeBaseName('../lecture.pdf'), 'lecture');
assert.equal(safeBaseName('C:\\notes\\lecture.PDF'), 'lecture');
const seen = new Set();
assert.equal(uniqueFilename('lecture.pdf', seen), 'lecture.pdf');
assert.equal(uniqueFilename('lecture.pdf', seen), 'lecture (2).pdf');
const zip = createZip([
  { name: 'lecture.pdf', bytes: outputs[0] },
  { name: 'lecture.pdf', bytes: outputs[1] },
  { name: '../量子力学.pdf', bytes: new Uint8Array([0, 1, 2, 255]) },
]);
assert.equal(zip.type, 'application/zip');
const zipPath = path.join(outputDir, 'workflow-download.zip');
await writeFile(zipPath, new Uint8Array(await zip.arrayBuffer()));
const report = JSON.parse(execFileSync(process.env.PYTHON || process.env.CODEX_PRIMARY_RUNTIME_PYTHON || 'python3', ['-c', `
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    assert z.testzip() is None
    names = z.namelist()
    assert len(set(names)) == len(names)
    assert all('/' not in n and '\\\\' not in n and not n.startswith('.') for n in names)
    assert z.read(names[0]).startswith(b'%PDF-')
    assert z.read(names[1]).startswith(b'%PDF-')
    assert z.read(names[2]) == bytes([0, 1, 2, 255])
    assert all(i.compress_type == zipfile.ZIP_STORED for i in z.infolist())
    print(json.dumps({'names':names,'sizes':[z.getinfo(n).file_size for n in names]},ensure_ascii=False))
`, zipPath], { encoding: 'utf8' }));
assert.deepEqual(report.names, ['lecture.pdf', 'lecture (2).pdf', '量子力学.pdf']);
assert.deepEqual(report.sizes, [outputs[0].length, outputs[1].length, 4]);

console.log(JSON.stringify({ status: 'passed', checks: [
  'split planning and ranges', '350-page planning', 'canonical preset persistence',
  'preset validation', 'batch crop geometry and annotations', 'per-file numbering reset',
  'split text, page order, crop, and rotation', 'printed numbering retained',
  'source immutability', 'cancellation', 'interactive form handling',
  'safe unique filenames', 'independent ZIP CRC and Unicode verification',
], artifacts: ['workflow-batch.pdf', 'workflow-download.zip'] }, null, 2));
