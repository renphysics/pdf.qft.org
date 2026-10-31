import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const runtime = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../node_modules');
globalThis.PDFLib = require(path.join(runtime, 'pdf-lib'));
globalThis.fontkit = require('../node_modules/@pdf-lib/fontkit');
const { DOMMatrix, ImageData, Path2D, createCanvas } = require(path.join(runtime, '@napi-rs/canvas'));
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith('file:')) {
    try { return new Response(await readFile(new URL(url))); }
    catch { return new Response('', { status: 404 }); }
  }
  return nativeFetch(url, options);
};
const { inspectPdf, buildPdf, parsePageRange, cropMarginsForRotation } = await import('../dist/pdf-engine.js');
const pdfjs = await import(pathToFileURL(path.join(runtime, 'pdfjs-dist/legacy/build/pdf.mjs')));
const { PDFDocument, StandardFonts, degrees } = globalThis.PDFLib;
const outputDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output');
await mkdir(outputDir, { recursive: true });

async function fixture() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 4; i++) {
    const page = pdf.addPage([400 + i * 50, 600 - i * 30]);
    page.setCropBox(40, 60, 300 + i * 50, 480 - i * 30);
    page.setRotation(degrees(i * 90));
    page.drawText(`Original ${i + 1}`, { x: 60, y: 330, size: 18, font });
  }
  pdf.setTitle('Engine geometry fixture');
  return pdf.save();
}

async function extract(data) {
  const doc = await pdfjs.getDocument({ data: data.slice(), verbosity: 0, standardFontDataUrl: path.join(runtime, 'pdfjs-dist/standard_fonts/') }).promise;
  const result = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const text = await page.getTextContent();
    result.push({
      width: viewport.width, height: viewport.height,
      items: text.items.filter((item) => item.str).map((item) => ({ text: item.str, transform: pdfjs.Util.transform(viewport.transform, item.transform) })),
    });
  }
  await doc.destroy();
  return result;
}

function approx(actual, expected, message, tolerance = 0.1) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${message}: expected ${expected}, got ${actual}`);
}

const fixtureBytes = await fixture();
const snapshot = fixtureBytes.slice();
await writeFile(path.join(outputDir, 'geometry-source.pdf'), fixtureBytes);
const inspected = await inspectPdf(fixtureBytes);
assert.equal(inspected.pageCount, 4);
assert.deepEqual(inspected.pages.map((page) => [page.width, page.height, page.rotation]), [[300, 480, 0], [450, 350, 90], [400, 420, 180], [390, 450, 270]]);

const order = [3, 0, 2, 1];
const pages = order.map((index, position) => ({ id: `page-${index}`, sourceId: 'fixture', index, rotation: position % 2 ? 90 : 0 }));
const canvas = createCanvas(10, 10);
canvas.getContext('2d').fillStyle = '#fa5533';
canvas.getContext('2d').fillRect(0, 0, 10, 10);
const progress = [];
const output = await buildPdf({
  sources: [{ id: 'fixture', bytes: fixtureBytes }], pages,
  annotations: pages.flatMap((page) => [
    { type: 'text', pageId: page.id, text: `Annotation ${page.index + 1}`, x: .1, y: .15, width: .8, fontSize: 12 },
    { type: 'highlight', pageId: page.id, x: .1, y: .25, width: .25, height: .05, color: '#ffec73' },
    { type: 'image', pageId: page.id, x: .75, y: .1, width: .1, height: .08, imageBytes: canvas.toBuffer('image/png'), imageType: 'png' },
  ]),
  headerFooter: { headerLeft: 'Header {page}', footerCenter: 'Footer {page}/{total}', margin: 24, size: 10 },
  pageNumbers: { format: 'Number {page}', start: 7, position: 'bottom-right', margin: 24, size: 8 },
  watermark: { text: 'DRAFT', angle: 0, opacity: .16, size: 36 },
}, (fraction) => progress.push(fraction));
await writeFile(path.join(outputDir, 'geometry-export.pdf'), output);
assert.deepEqual(fixtureBytes, snapshot, 'Export must not mutate original bytes');
assert.equal(progress.at(-1), 1);
assert.ok(progress.every((value, i) => !i || value >= progress[i - 1]));
const loadedOutput = await PDFDocument.load(output);
assert.equal(loadedOutput.getTitle(), 'Engine geometry fixture', 'Single-document metadata is preserved');
const extracted = await extract(output);
for (let i = 0; i < extracted.length; i++) {
  const page = extracted[i];
  const find = (text) => {
    const item = page.items.find((item) => item.text === text);
    assert.ok(item, `Missing text ${text} on output page ${i + 1}`);
    return item;
  };
  find(`Original ${order[i] + 1}`);
  const annotation = find(`Annotation ${order[i] + 1}`);
  approx(annotation.transform[4], page.width * .1, 'Annotation left edge tracks visible crop');
  approx(annotation.transform[5], page.height * .15 + 8.616, 'Annotation top uses font ascent');
  approx(annotation.transform[1], 0, 'Annotation remains horizontal after page rotation');
  const footer = find(`Footer ${i + 1}/4`);
  approx(footer.transform[5], page.height - 24, 'Footer is at visible bottom edge');
  approx(footer.transform[1], 0, 'Footer remains horizontal');
  const header = find(`Header ${i + 1}`);
  approx(header.transform[4], 24, 'Header aligns to visible left margin');
  approx(header.transform[5], 31.18, 'Header baseline matches top margin and ascent');
  find(`Number ${i + 7}`);
  find('DRAFT');
}

const second = await PDFDocument.create();
second.addPage([210, 310]).drawText('Second document');
const merged = await buildPdf({
  sources: [{ id: 'a', bytes: fixtureBytes }, { id: 'b', bytes: await second.save() }],
  pages: [{ id: 'b1', sourceId: 'b', index: 0 }, { id: 'a2', sourceId: 'a', index: 1 }],
  headerFooter: { footerLeft: 'Selected only', pages: ['a2'] },
});
await writeFile(path.join(outputDir, 'merged-export.pdf'), merged);
const mergedText = await extract(merged);
assert.equal(mergedText.length, 2);
assert.ok(mergedText[0].items.some((item) => item.text === 'Second document'));
assert.ok(!mergedText[0].items.some((item) => item.text === 'Selected only'));
assert.ok(mergedText[1].items.some((item) => item.text === 'Selected only'));

const subset = await buildPdf({ sources: [{ id: 'a', bytes: fixtureBytes }], pages: [{ id: 'selected', sourceId: 'a', index: 1 }] });
const subsetDoc = await PDFDocument.load(subset);
assert.equal(subsetDoc.getPageCount(), 1);
const decodedStreams = subsetDoc.context.enumerateIndirectObjects()
  .filter(([, object]) => object instanceof globalThis.PDFLib.PDFRawStream)
  .map(([, object]) => Buffer.from(globalThis.PDFLib.decodePDFRawStream(object).decode()).toString()).join('\n').toUpperCase();
assert.ok(decodedStreams.includes(Buffer.from('Original 2').toString('hex').toUpperCase()), 'The selected page content is copied');
for (const omitted of [1, 3, 4]) assert.ok(!decodedStreams.includes(Buffer.from(`Original ${omitted}`).toString('hex').toUpperCase()), 'Unselected page streams are not retained in exported bytes');

const unicode = await buildPdf({
  sources: [{ id: 'a', bytes: fixtureBytes }], pages: [{ id: 'a', sourceId: 'a', index: 0 }],
  annotations: [{ type: 'text', pageId: 'a', text: 'Résumé π 中文页脚', x: .1, y: .2, width: .8, fontSize: 16 }],
  headerFooter: { footerCenter: '量子场论 · 第 {page} 页', size: 10 },
});
await writeFile(path.join(outputDir, 'unicode-export.pdf'), unicode);
const unicodeText = await extract(unicode);
assert.ok(unicodeText[0].items.some((item) => item.text.includes('中文页脚')));
assert.ok(unicodeText[0].items.some((item) => item.text.includes('量子场论')));

// A note placed before rotation must rotate with the original page; a later
// note placed in the rotated view must remain upright in that newer view.
const rotatedAfterEdit = await buildPdf({
  sources: [{ id: 'a', bytes: fixtureBytes }], pages: [{ id: 'p', sourceId: 'a', index: 0, rotation: 90 }],
  annotations: [
    { type: 'text', pageId: 'p', pageRotation: 0, text: 'Before rotation', x: .1, y: .2, fontSize: 12 },
    { type: 'text', pageId: 'p', pageRotation: 90, text: 'After rotation', x: .1, y: .2, fontSize: 12 },
    { type: 'image', pageId: 'p', pageRotation: 0, x: .2, y: .4, width: .2, height: .125, imageBytes: canvas.toBuffer('image/png'), imageType: 'png' },
  ],
});
await writeFile(path.join(outputDir, 'rotation-after-edit.pdf'), rotatedAfterEdit);
const rotatedText = (await extract(rotatedAfterEdit))[0].items;
const beforeRotation = rotatedText.find((item) => item.text === 'Before rotation');
const afterRotation = rotatedText.find((item) => item.text === 'After rotation');
approx(beforeRotation.transform[0], 0, 'Existing annotation rotates with page');
approx(beforeRotation.transform[1], 12, 'Existing annotation has clockwise orientation');
approx(beforeRotation.transform[4], 480 * .8 - 8.616, 'Existing annotation retains original anchor');
approx(beforeRotation.transform[5], 300 * .1, 'Existing annotation retains original anchor');
approx(afterRotation.transform[1], 0, 'New annotation is upright in rotated view');
approx(afterRotation.transform[4], 480 * .1, 'New annotation uses rotated width');
approx(afterRotation.transform[5], 300 * .2 + 8.616, 'New annotation uses rotated height');

// Cropping changes the viewing box, preserving native vectors, searchable
// text, MediaBox, and annotation anchors. Expected boxes below are calculated
// directly in each source page's PDF coordinates, independently of the engine.
const margins = { left: .1, top: .15, right: .2, bottom: .05, rotation: 0 };
const cropPages = inspected.pages.map((page, index) => ({ id: `crop-${index}`, sourceId: 'a', index, rotation: 0, crop: { ...margins } }));
const cropAnnotations = cropPages.flatMap((page) => [
  { type: 'text', pageId: page.id, pageRotation: 0, text: `Before crop ${page.index}`, x: .4, y: .4, fontSize: 10 },
  { type: 'text', pageId: page.id, pageRotation: 0, pageCrop: { ...margins }, text: `After crop ${page.index}`, x: .3, y: .5, fontSize: 10 },
]);
const cropState = {
  sources: [{ id: 'a', bytes: fixtureBytes }], pages: cropPages, annotations: cropAnnotations,
  headerFooter: { footerLeft: 'Cropped footer', margin: 20, size: 8 },
};
const cropped = await buildPdf(cropState);
await writeFile(path.join(outputDir, 'cropped-export.pdf'), cropped);
const cropDoc = await PDFDocument.load(cropped);
const sourceDoc = await PDFDocument.load(fixtureBytes);
const expectedBoxes = [
  { x: 70, y: 84, width: 210, height: 384 },
  { x: 92.5, y: 105, width: 280, height: 315 },
  { x: 120, y: 123, width: 280, height: 336 },
  { x: 62.5, y: 138, width: 360, height: 273 },
];
const cropText = await extract(cropped);
for (let i = 0; i < 4; i++) {
  for (const key of ['x', 'y', 'width', 'height']) approx(cropDoc.getPage(i).getCropBox()[key], expectedBoxes[i][key], `Native rotation ${i * 90}, crop ${key}`);
  assert.deepEqual(cropDoc.getPage(i).getMediaBox(), sourceDoc.getPage(i).getMediaBox(), 'Cropping leaves original media intact');
  const { width: originalWidth, height: originalHeight } = inspected.pages[i];
  const result = cropText[i];
  approx(result.width, .7 * originalWidth, 'PDF.js cropped visible width');
  approx(result.height, .8 * originalHeight, 'PDF.js cropped visible height');
  const prior = result.items.find((item) => item.text === `Before crop ${i}`);
  const later = result.items.find((item) => item.text === `After crop ${i}`);
  assert.ok(prior && later, 'Text remains searchable before and after crop');
  approx(prior.transform[4], .3 * originalWidth, 'Pre-crop annotation retains paper location');
  approx(prior.transform[5], .25 * originalHeight + 7.18, 'Pre-crop annotation keeps original vertical anchor');
  approx(later.transform[4], .3 * result.width, 'New annotation uses cropped view width');
  approx(later.transform[5], .5 * result.height + 7.18, 'New annotation uses cropped view height');
  const footer = result.items.find((item) => item.text === 'Cropped footer');
  approx(footer.transform[4], 20, 'Footer follows new crop left edge');
  approx(footer.transform[5], result.height - 20, 'Footer follows new crop bottom edge');
}
assert.deepEqual(fixtureBytes, snapshot, 'Cropping does not mutate source bytes');
// Repeated builds use absolute source margins and do not progressively shrink.
const repeated = await extract(await buildPdf(cropState));
assert.deepEqual(repeated.map(p => [p.width, p.height]), cropText.map(p => [p.width, p.height]));
// Rotating after crop preserves its physical rectangle for every source angle.
const cropThenRotate = await buildPdf({ ...cropState, pages: cropPages.map(page => ({ ...page, rotation: 90 })) });
const cropRotatedDoc = await PDFDocument.load(cropThenRotate);
const cropRotatedText = await extract(cropThenRotate);
for (let i = 0; i < 4; i++) {
  assert.deepEqual(cropRotatedDoc.getPage(i).getCropBox(), cropDoc.getPage(i).getCropBox());
  approx(cropRotatedText[i].width, cropText[i].height, 'Post-crop rotation exchanges visible dimensions');
  approx(cropRotatedText[i].height, cropText[i].width, 'Post-crop rotation exchanges visible dimensions');
  const before = cropText[i].items.find(item => item.text === `After crop ${i}`);
  const after = cropRotatedText[i].items.find(item => item.text === `After crop ${i}`);
  approx(after.transform[4], cropText[i].height - before.transform[5], 'Post-crop annotation rotates at fixed anchor');
  approx(after.transform[5], before.transform[4], 'Post-crop annotation rotates at fixed anchor');
}
// Applying a crop in a newly rotated view uses the new displayed axes.
const rotatedCrop = { ...margins, rotation: 90 };
const cropAfterRotate = await buildPdf({ sources: cropState.sources, pages: [{ id: 'p', sourceId: 'a', index: 0, rotation: 90, crop: rotatedCrop }] });
const cropAfterRotateBox = (await PDFDocument.load(cropAfterRotate)).getPage(0).getCropBox();
assert.deepEqual(cropAfterRotateBox, { x: 85, y: 108, width: 240, height: 336 });
// Resetting crop restores source size without moving post-crop annotations.
const resetCrop = await extract(await buildPdf({ ...cropState, pages: cropPages.map(({ crop, ...page }) => page) }));
for (let i = 0; i < 4; i++) {
  approx(resetCrop[i].width, inspected.pages[i].width, 'Reset crop restores original visible width');
  approx(resetCrop[i].height, inspected.pages[i].height, 'Reset crop restores original visible height');
  const item = resetCrop[i].items.find(item => item.text === `After crop ${i}`);
  approx(item.transform[4], inspected.pages[i].width * (.1 + .3 * .7), 'Reset crop retains post-crop annotation paper location');
  approx(item.transform[5], inspected.pages[i].height * (.15 + .5 * .8) + 7.18, 'Reset crop retains annotation vertical location');
}
assert.deepEqual(cropMarginsForRotation(margins, 90), { left: .05, top: .1, right: .15, bottom: .2 });
assert.deepEqual(cropMarginsForRotation(margins, 180), { left: .2, top: .05, right: .1, bottom: .15 });
assert.deepEqual(cropMarginsForRotation(margins, 270), { left: .15, top: .2, right: .05, bottom: .1 });
assert.deepEqual(cropMarginsForRotation(null, 90), { left: 0, top: 0, right: 0, bottom: 0 });
for (const crop of [{ left: -.1 }, { top: NaN }, { right: Infinity }, { left: .8, right: .2 }, { top: .6, bottom: .5 }, { bottom: 1 }]) {
  await assert.rejects(buildPdf({ sources: cropState.sources, pages: [{ id: 'p', sourceId: 'a', index: 0, crop }] }), /Crop margins/);
}
await assert.rejects(buildPdf({ sources: cropState.sources, pages: [{ id: 'p', sourceId: 'a', index: 0, crop: { left: .999 } }] }), /at least 1 PDF point/);

const formDoc = await PDFDocument.create();
const formPage = formDoc.addPage();
const field = formDoc.getForm().createTextField('name');
field.setText('Preserved field value');
field.addToPage(formPage, { x: 50, y: 100, width: 220, height: 30 });
const formBytes = await formDoc.save();
const formOutput = await buildPdf({ sources: [{ id: 'form', bytes: formBytes }], pages: [{ id: 'f1', sourceId: 'form', index: 0 }], headerFooter: { footerCenter: 'With form' } });
assert.equal((await PDFDocument.load(formOutput)).getForm().getTextField('name').getText(), 'Preserved field value');
await assert.rejects(buildPdf({ sources: [{ id: 'form', bytes: formBytes }, { id: 'a', bytes: fixtureBytes }], pages: [{ id: 'f1', sourceId: 'form', index: 0 }, { id: 'a1', sourceId: 'a', index: 0 }] }), /interactive forms/);
await assert.rejects(inspectPdf(new Uint8Array([1, 2, 3])), /could not be opened/);
await assert.rejects(inspectPdf(new Uint8Array(await readFile(path.join(outputDir, '../fixtures/encrypted.pdf')))), /password-protected/);
await assert.rejects(buildPdf({ sources: [], pages: [] }), /at least one page/);
await assert.rejects(buildPdf({ sources: [{ id: 'a', bytes: fixtureBytes }], pages: [{ id: 'x', sourceId: 'a', index: 9 }] }), /does not exist/);
await assert.rejects(buildPdf({ sources: [{ id: 'a', bytes: fixtureBytes }], pages: [{ id: 'x', sourceId: 'a', index: 0 }], annotations: [{ pageId: 'x', type: 'text', text: '🦄' }] }), /cannot display/);
assert.deepEqual(parsePageRange('1-3, 2, 4', 4), [0, 1, 2, 3]);
assert.deepEqual(parsePageRange('', 2), [0, 1]);
assert.throws(() => parsePageRange('0, 1', 4), /between/);
assert.throws(() => parsePageRange('3-1', 4), /between/);
assert.throws(() => parsePageRange('one', 4), /Use page numbers/);
console.log(JSON.stringify({ status: 'passed', checks: ['mixed-page-size', 'CropBox origin', 'all intrinsic rotations', 'added rotation', 'rotation before and after annotation placement', 'reordering', 'positioned annotations', 'image embedding', 'highlights', 'watermark', 'repeated headers and footers', 'page-number sequence', 'page scope', 'merge', 'source immutability', 'form preservation', 'unicode and CJK', 'unsupported character errors', 'invalid input', 'page-range validation', 'crop dimensions at all source rotations', 'crop preserves annotation locations', 'annotations after crop', 'crop before and after rotation', 'crop reset', 'repeat crop export', 'invalid and empty crop rejection'], outputs: ['geometry-export.pdf', 'merged-export.pdf', 'unicode-export.pdf', 'rotation-after-edit.pdf', 'cropped-export.pdf'] }, null, 2));
