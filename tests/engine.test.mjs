import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const runtime = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../node_modules');
globalThis.PDFLib = require(path.join(runtime, '@cantoo/pdf-lib'));
globalThis.fontkit = require(path.join(runtime, '@cantoo/fontkit'));
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
const { inspectPdf, openPdf, buildPdf, buildPdfWithNotes, parsePageRange, cropMarginsForRotation, measuringFont } = await import('../dist/pdf-engine.js');
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

async function extract(data, password) {
  const doc = await pdfjs.getDocument({ data: data.slice(), password, verbosity: 0, standardFontDataUrl: path.join(runtime, 'pdfjs-dist/standard_fonts/') }).promise;
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
  await doc.loadingTask.destroy();
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

// Accented Latin text uses Noto Sans, embedded as a subset of the glyphs used.
const latin = await buildPdf({
  sources: [{ id: 'a', bytes: fixtureBytes }], pages: [{ id: 'a', sourceId: 'a', index: 0 }],
  annotations: [{ type: 'text', pageId: 'a', text: 'Café crème, déjà vu', x: .1, y: .2, width: .8, fontSize: 16 }],
});
await writeFile(path.join(outputDir, 'latin-subset-export.pdf'), latin);
assert.ok((await extract(latin))[0].items.some((item) => item.text === 'Café crème, déjà vu'), 'Latin text is extractable');
assert.ok(latin.length - fixtureBytes.length < 60000, `Noto Sans is subset, not embedded whole (+${latin.length - fixtureBytes.length} bytes)`);

// Chinese, Japanese kana and Korean text embed only the glyphs used from the 16 MB
// Noto Sans CJK font (the whole font used to be embedded, adding 13.5 MB). Older
// fontkit's subsets of this CFF font were broken: PDF.js warned ("Out of bounds
// subrIndex") and drew other glyphs. Widths must also match what the preview
// measures: with the whole font embedded, digits and spaces in CJK text came out
// far too wide.
/** PDF.js warnings while rendering every page (they arrive on stderr). */
async function renderWarnings(data) {
  const warnings = [];
  const write = process.stderr.write;
  process.stderr.write = (chunk, ...rest) => (String(chunk).includes('Warning:') ? (warnings.push(String(chunk).trim()), true) : write.call(process.stderr, chunk, ...rest));
  try {
    const doc = await pdfjs.getDocument({ data: data.slice(), verbosity: 1, standardFontDataUrl: path.join(runtime, 'pdfjs-dist/standard_fonts/') }).promise;
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const surface = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: surface.getContext('2d'), viewport, canvas: surface }).promise;
    }
    await doc.loadingTask.destroy();
  } finally {
    process.stderr.write = write;
  }
  return warnings;
}
const cjkLines = ['中文测试：你好，世界！欢迎使用。', '繁體字測試：臺灣、香港。', '日本語：ひらがな、カタカナ。', '한국어 테스트: 안녕하세요.', 'Mixed 混合 ABC abc 123 — “引号”'];
const cjk = await buildPdf({
  sources: [{ id: 'a', bytes: fixtureBytes }], pages: [{ id: 'c', sourceId: 'a', index: 0 }],
  annotations: cjkLines.map((text, index) => ({ id: `cjk${index}`, type: 'text', pageId: 'c', pageRotation: 0, text, x: .05, y: .1 + index * .12, autoWidth: true, fontSize: 14 })),
});
await writeFile(path.join(outputDir, 'cjk-subset-export.pdf'), cjk);
assert.ok(cjk.length - fixtureBytes.length < 300000, `Noto Sans CJK is subset, not embedded whole (+${cjk.length - fixtureBytes.length} bytes)`);
assert.deepEqual(await renderWarnings(cjk), [], 'PDF.js reads the CJK subset without font warnings');
const cjkFont = await measuringFont('cjk');
const cjkItems = (await extract(cjk))[0].items;
for (const line of cjkLines) {
  const item = cjkItems.find((candidate) => candidate.text === line);
  assert.ok(item, `"${line}" is extractable as written`);
  const doc = await pdfjs.getDocument({ data: cjk.slice(), verbosity: 0 }).promise;
  const width = (await (await doc.getPage(1)).getTextContent()).items.find((candidate) => candidate.str === line).width;
  await doc.loadingTask.destroy();
  approx(width, cjkFont.widthOfTextAtSize(line, 14), `"${line}" is as wide as the preview measures it`, 0.05);
}

// A signature placed on every page shares one bytes object: the PDF stores the
// picture once (a PNG with transparency: one image and its mask).
{
  const { PDFName, PDFRawStream } = globalThis.PDFLib;
  const canvas = createCanvas(120, 40);
  const context = canvas.getContext('2d');
  context.strokeStyle = '#141414';
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(10, 30);
  context.bezierCurveTo(40, 0, 70, 40, 110, 10);
  context.stroke();
  const signature = new Uint8Array(canvas.toBuffer('image/png'));
  const signed = await buildPdf({
    sources: [{ id: 'a', bytes: fixtureBytes }],
    pages: inspected.pages.map((_, index) => ({ id: `s${index}`, sourceId: 'a', index })),
    annotations: inspected.pages.map((_, index) => ({ id: `sig${index}`, pageId: `s${index}`, type: 'signature', x: .6, y: .8, width: .3, height: .1, imageBytes: signature, imageType: 'png' })),
  });
  const doc = await PDFDocument.load(signed);
  const images = doc.context.enumerateIndirectObjects().filter(([, object]) => object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'));
  assert.equal(images.length, 2, 'one signature picture and its transparency mask, for four pages');
  assert.deepEqual(doc.getPages().map((page) => page.node.Resources().lookup(PDFName.of('XObject')).keys().length), [1, 1, 1, 1], 'every page draws it');
}

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

// PDF/A: a declared PDF/A file exports unchanged (PDF/A-1 forbids object
// streams), keeps its declaration while only pages change, and stops claiming
// PDF/A once content is added, keeping the rest of its metadata.
async function pdfaFixture(part, conformance, attributeForm) {
  const pdf = await PDFDocument.create();
  pdf.addPage([400, 300]).drawText('Archived page', { x: 40, y: 200, size: 18, font: await pdf.embedFont(StandardFonts.Helvetica) });
  const id = attributeForm
    ? `<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" pdfaid:part="${part}" pdfaid:conformance="${conformance}"/>`
    : `<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>${part}</pdfaid:part><pdfaid:conformance>${conformance}</pdfaid:conformance></rdf:Description>`;
  const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">Archiv für Berichte</rdf:li></rdf:Alt></dc:title></rdf:Description>${id}</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  const { PDFName } = globalThis.PDFLib;
  pdf.catalog.set(PDFName.of('Metadata'), pdf.context.register(pdf.context.stream(new TextEncoder().encode(xmp), { Type: 'Metadata', Subtype: 'XML' })));
  return pdf.save({ useObjectStreams: false });
}
function metadataOf(bytes) {
  const { PDFName } = globalThis.PDFLib;
  return PDFDocument.load(bytes).then((pdf) => new TextDecoder().decode(globalThis.PDFLib.decodePDFRawStream(pdf.catalog.lookup(PDFName.of('Metadata'))).decode()));
}
for (const [part, conformance, attributeForm] of [[1, 'B', false], [1, 'A', false], [2, 'B', true]]) {
  const label = `PDF/A-${part}${conformance.toLowerCase()}`;
  const bytes = await pdfaFixture(part, conformance, attributeForm);
  assert.equal((await inspectPdf(bytes)).pdfa, part, `${label} is detected`);
  const one = { sources: [{ id: 'a', bytes }], pages: [{ id: 'p', sourceId: 'a', index: 0 }] };
  const unchanged = await buildPdfWithNotes(one);
  assert.deepEqual(unchanged.notes, [], `${label}: nothing to report for an unchanged export`);
  assert.match(await metadataOf(unchanged.bytes), /pdfaid:part/, `${label}: an unchanged export still declares PDF/A`);
  assert.equal(Buffer.from(unchanged.bytes).includes('/ObjStm'), part !== 1, `${label}: object streams ${part === 1 ? 'are not' : 'may be'} used`);
  const turned = await buildPdfWithNotes({ ...one, pages: [{ id: 'p', sourceId: 'a', index: 0, rotation: 90 }] });
  assert.deepEqual(turned.notes, [], `${label}: turning a page keeps PDF/A`);
  const edited = await buildPdfWithNotes({ ...one, watermark: { text: 'DRAFT', pages: 'all' } });
  assert.deepEqual(edited.notes, ['pdfa-removed'], `${label}: added content is reported`);
  const metadata = await metadataOf(edited.bytes);
  assert.doesNotMatch(metadata, /pdfaid:(part|conformance)/, `${label}: the PDF/A declaration is removed`);
  assert.match(metadata, /Archiv für Berichte/, `${label}: the rest of the metadata is kept`);
  assert.equal((await inspectPdf(edited.bytes)).pdfa, null);
  assert.ok((await extract(edited.bytes))[0].items.some((item) => item.text === 'DRAFT'));
}

// Passwords. The fixtures were encrypted by pypdf (scripts/make-encrypted-fixtures.py),
// not by the library under test; each has two pages, "Secret page 1" and "Secret page 2".
const fixturePath = (name) => path.join(outputDir, '../fixtures', name);
const textOf = async (bytes, password) => (await extract(bytes, password)).map((page) => page.items.map((item) => item.text).join(' '));
const { PDFDict, PDFName } = globalThis.PDFLib;
/** Whether the file still holds an encryption dictionary, used or not. */
async function hasEncryptionDictionary(bytes) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.context.enumerateIndirectObjects().some(([, object]) => object instanceof PDFDict && object.get(PDFName.of('Filter')) === PDFName.of('Standard'));
}
/** How pdf.js refuses a file: 1 when it needs a password, 2 when the password is wrong. */
async function pdfjsRefusal(bytes, password) {
  const task = pdfjs.getDocument({ data: bytes.slice(), password, verbosity: 0 });
  try {
    await task.promise;
    return null;
  } catch (error) {
    assert.equal(error.name, 'PasswordException');
    return error.code;
  } finally {
    await task.destroy();
  }
}
// An owner password only restricts changes: the PDF opens without asking.
const ownerOnly = new Uint8Array(await readFile(fixturePath('owner-only-aes256.pdf')));
assert.equal((await inspectPdf(ownerOnly)).encrypted, true);
const ownerOpened = await openPdf(ownerOnly);
assert.equal(ownerOpened.protection, 'owner');
assert.equal(ownerOpened.pageCount, 2);
assert.equal((await PDFDocument.load(ownerOpened.bytes)).isEncrypted, false, 'the copy to edit is not encrypted');
assert.equal(await hasEncryptionDictionary(ownerOpened.bytes), false, 'the unlocked copy carries no password hashes');
assert.deepEqual(await textOf(ownerOpened.bytes), ['Secret page 1', 'Secret page 2']);
assert.equal((await PDFDocument.load(ownerOpened.bytes)).getTitle(), 'Locked report', 'encrypted strings are decrypted');
// Batch processing passes encrypted bytes straight to the build.
const ownerBuilt = await buildPdf({ sources: [{ id: 'o', bytes: ownerOnly }], pages: [{ id: 'o1', sourceId: 'o', index: 0 }, { id: 'o2', sourceId: 'o', index: 1 }], pageNumbers: { format: 'No. {page}', pages: 'all' } });
assert.equal(await hasEncryptionDictionary(ownerBuilt), false);
assert.deepEqual(await textOf(ownerBuilt), ['Secret page 1 No. 1', 'Secret page 2 No. 2']);
// A password to open: required, refused when wrong, accepted when right (the
// owner password works too). AES-128, RC4 and AES-256 with a Unicode password.
for (const [name, password, ownerPassword] of [['password-aes128.pdf', 'open sesame', 'owner secret'], ['password-rc4.pdf', 'open sesame', 'owner secret'], ['password-aes256-unicode.pdf', 'Grüße 密码', null]]) {
  const bytes = new Uint8Array(await readFile(fixturePath(name)));
  await assert.rejects(openPdf(bytes), (error) => error.code === 'password-required' && /password-protected/.test(error.message), `${name}: needs a password`);
  await assert.rejects(openPdf(bytes, { password: 'not it' }), (error) => error.code === 'password-incorrect', `${name}: a wrong password is refused`);
  await assert.rejects(inspectPdf(bytes), (error) => error.code === 'password-required');
  const opened = await openPdf(bytes, { password });
  assert.equal(opened.protection, 'password', name);
  assert.equal(await hasEncryptionDictionary(opened.bytes), false, `${name}: no password hashes in the copy`);
  assert.deepEqual(await textOf(opened.bytes), ['Secret page 1', 'Secret page 2'], `${name}: decrypted text`);
  assert.equal((await PDFDocument.load(opened.bytes)).getTitle(), 'Locked report', `${name}: decrypted title`);
  if (ownerPassword) assert.equal((await openPdf(bytes, { password: ownerPassword })).pageCount, 2, `${name}: the owner password opens it`);
}
await assert.rejects(inspectPdf(new Uint8Array(await readFile(fixturePath('encrypted.pdf')))), (error) => error.code === 'password-required');
const plainOpened = await openPdf(fixtureBytes);
assert.equal(plainOpened.protection, null);
assert.equal(plainOpened.bytes, fixtureBytes, 'an unencrypted PDF is used as it is');

// Protecting the download: AES-256, needing the password in another reader
// (pdf.js), with the document's strings intact. The library alone left strings
// outside object streams unencrypted, so the language read back as garbage.
const stringsDoc = await PDFDocument.create();
stringsDoc.addPage([300, 200]).drawText('Protected page', { x: 40, y: 100, size: 18, font: await stringsDoc.embedFont(StandardFonts.Helvetica) });
stringsDoc.setTitle('Quarterly figures');
stringsDoc.setLanguage('de-DE');
const link = stringsDoc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [40, 40, 200, 60], Border: [0, 0, 0], A: { S: 'URI', URI: globalThis.PDFLib.PDFString.of('https://example.com/report') } });
stringsDoc.getPage(0).node.set(PDFName.of('Annots'), stringsDoc.context.obj([stringsDoc.context.register(link)]));
const stringsBytes = await stringsDoc.save();
const one = (bytes) => ({ sources: [{ id: 's', bytes }], pages: [{ id: 's1', sourceId: 's', index: 0 }] });
const protectedBuild = await buildPdfWithNotes({ ...one(stringsBytes), watermark: { text: 'DRAFT', pages: 'all' }, protection: { enabled: true, password: 'Grüße 1' } });
assert.deepEqual(protectedBuild.notes, []);
assert.equal(await pdfjsRefusal(protectedBuild.bytes), 1, 'pdf.js asks for the password');
assert.equal(await pdfjsRefusal(protectedBuild.bytes, 'wrong'), 2, 'pdf.js refuses a wrong password');
assert.deepEqual(await textOf(protectedBuild.bytes, 'Grüße 1'), ['Protected page DRAFT']);
{
  const doc = await pdfjs.getDocument({ data: protectedBuild.bytes.slice(), password: 'Grüße 1', verbosity: 0 }).promise;
  const { info } = await doc.getMetadata();
  assert.equal(info.Title, 'Quarterly figures', 'the title decrypts');
  assert.equal(info.Language, 'de-DE', 'the language, stored on the catalog outside object streams, decrypts');
  assert.deepEqual((await (await doc.getPage(1)).getAnnotations()).map((annotation) => annotation.url), ['https://example.com/report'], 'link targets decrypt');
  await doc.loadingTask.destroy();
}
const reopened = await openPdf(protectedBuild.bytes, { password: 'Grüße 1' });
assert.equal(reopened.protection, 'password', 'QFT PDF reopens its own protected files');
await assert.rejects(openPdf(protectedBuild.bytes), (error) => error.code === 'password-required');
// Passwords are prepared as PDF 2.0 asks (SASLprep, NFKC): full-width characters match their plain form.
const fullWidth = await buildPdf({ ...one(stringsBytes), protection: { enabled: true, password: 'ｐａｓｓ１' } });
assert.equal(await pdfjsRefusal(fullWidth, 'pass1'), null, 'the prepared password opens it in pdf.js');
assert.equal((await openPdf(fullWidth, { password: 'ｐａｓｓ１' })).pageCount, 1, 'and as typed in QFT PDF');
// Protection that is off, or a password that can't be used.
assert.equal((await PDFDocument.load(await buildPdf({ ...one(stringsBytes), protection: { enabled: false, password: '' } }))).isEncrypted, false);
await assert.rejects(buildPdf({ ...one(stringsBytes), protection: { enabled: true, password: '' } }), /Enter a password/);
await assert.rejects(buildPdf({ ...one(stringsBytes), protection: { enabled: true, password: 'tab\there' } }), /control characters/);
await assert.rejects(buildPdf({ ...one(stringsBytes), protection: { enabled: true, password: '密'.repeat(43) } }), /too long/);
// PDF/A forbids encryption: a protected copy stops claiming PDF/A.
{
  const bytes = await pdfaFixture(2, 'B', false);
  const protectedOnly = await buildPdfWithNotes({ ...one(bytes), protection: { enabled: true, password: 'archive' } });
  assert.deepEqual(protectedOnly.notes, ['pdfa-removed-password']);
  const unlocked = await openPdf(protectedOnly.bytes, { password: 'archive' });
  assert.equal(unlocked.pdfa, null, 'the protected copy no longer declares PDF/A');
  assert.match(await metadataOf(unlocked.bytes), /Archiv für Berichte/, 'the rest of the metadata is kept');
  const both = await buildPdfWithNotes({ ...one(bytes), watermark: { text: 'DRAFT', pages: 'all' }, protection: { enabled: true, password: 'archive' } });
  assert.deepEqual(both.notes, ['pdfa-removed', 'pdfa-removed-password']);
  const pdfa1 = await buildPdfWithNotes({ ...one(await pdfaFixture(1, 'B', false)), protection: { enabled: true, password: 'archive' } });
  assert.deepEqual(await textOf(pdfa1.bytes, 'archive'), ['Archived page'], 'a protected PDF/A-1 file opens with its password');
}

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
await assert.rejects(inspectPdf(new TextEncoder().encode('%PDF-1.7 broken')), /could not be opened/, 'A header without a page tree is not a PDF');
await assert.rejects(buildPdf({ sources: [], pages: [] }), /at least one page/);
await assert.rejects(buildPdf({ sources: [{ id: 'a', bytes: fixtureBytes }], pages: [{ id: 'x', sourceId: 'a', index: 9 }] }), /does not exist/);
await assert.rejects(buildPdf({ sources: [{ id: 'a', bytes: fixtureBytes }], pages: [{ id: 'x', sourceId: 'a', index: 0 }], annotations: [{ pageId: 'x', type: 'text', text: '🦄' }] }), /cannot display/);
assert.deepEqual(parsePageRange('1-3, 2, 4', 4), [0, 1, 2, 3]);
assert.deepEqual(parsePageRange('', 2), [0, 1]);
assert.throws(() => parsePageRange('0, 1', 4), /between/);
assert.throws(() => parsePageRange('3-1', 4), /between/);
assert.throws(() => parsePageRange('one', 4), /Use page numbers/);
console.log(JSON.stringify({ status: 'passed', checks: ['mixed-page-size', 'CropBox origin', 'all intrinsic rotations', 'added rotation', 'rotation before and after annotation placement', 'reordering', 'positioned annotations', 'image embedding', 'highlights', 'watermark', 'repeated headers and footers', 'page-number sequence', 'page scope', 'merge', 'source immutability', 'form preservation', 'unicode and CJK', 'CJK, kana and Hangul fonts subset, read without warnings, widths as measured', 'signatures on every page stored once', 'unsupported character errors', 'invalid input', 'page-range validation', 'crop dimensions at all source rotations', 'crop preserves annotation locations', 'annotations after crop', 'crop before and after rotation', 'crop reset', 'repeat crop export', 'invalid and empty crop rejection', 'PDF/A-1 export and declaration handling', 'owner-password PDFs open without asking', 'AES-128, RC4 and AES-256 passwords', 'wrong and missing passwords', 'unlocked copies without password hashes', 'AES-256 protection read by pdf.js', 'strings outside object streams encrypted', 'SASLprep password preparation', 'password validation', 'protected PDF/A copies'], outputs: ['geometry-export.pdf', 'merged-export.pdf', 'unicode-export.pdf', 'rotation-after-edit.pdf', 'cropped-export.pdf'] }, null, 2));
