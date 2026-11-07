// Copying pages (delete, extract, combine, split): links and bookmarks to kept
// pages keep working, links to pages left out are dropped, no page carries
// another page along hidden in the file, and the document's details are kept.
// Checked with pdf-lib and, independently, with PDF.js.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.resolve(here, '../node_modules');
globalThis.PDFLib = require(path.join(runtime, '@cantoo/pdf-lib'));
globalThis.fontkit = require(path.join(runtime, '@cantoo/fontkit'));
const { DOMMatrix, ImageData, Path2D, createCanvas } = require(path.join(runtime, '@napi-rs/canvas'));
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith('file:')) {
    try {
      return new Response(await readFile(new URL(url)));
    } catch {
      return new Response('', { status: 404 });
    }
  }
  return nativeFetch(url, options);
};
const { buildPdf, buildPdfWithNotes, pagesPerSheet, sheetLayout } = await import('../dist/pdf-engine.js');
const { splitPdf } = await import('../dist/workflows.js');
const pdfjs = await import(pathToFileURL(path.join(runtime, 'pdfjs-dist/legacy/build/pdf.mjs')));
const { PDFDocument, PDFDict, PDFHexString, PDFName, PDFNull, PDFNumber, PDFString, StandardFonts, decodePDFRawStream, PDFRawStream, degrees, rgb } = globalThis.PDFLib;

// ---- A six-page document with links, bookmarks and details --------------------------

const lecture = await (async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = [1, 2, 3, 4, 5, 6].map((number) => {
    const page = doc.addPage([400, 500]);
    page.drawText(`PAGE-${number}-TEXT`, { x: 40, y: 440, size: 16, font });
    return page;
  });
  const [p1, p2, p3, p4, p5, p6] = pages.map((page) => page.ref);
  const { context } = doc;
  doc.setTitle('Lecture notes', { showInWindowTitleBar: true });
  doc.setAuthor('A. Author');
  doc.setSubject('Fields');
  doc.setKeywords(['physics, fields']);
  doc.setCreator('LaTeX with hyperref');
  doc.setCreationDate(new Date('2020-01-02T03:04:05Z'));
  doc.setLanguage('en-GB');
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
  // Named destinations, both kinds: the PDF 1.1 /Dests dictionary and the /Names tree.
  doc.catalog.set(PDFName.of('Dests'), context.obj({ sec12: [p4, 'FitH', 700] }));
  const names = context.obj({ Names: [PDFString.of('chapter.2'), context.obj([p5, 'XYZ', 0, 500, PDFNull]), PDFString.of('section.1.1'), context.obj({ D: [p3, 'Fit'] })] });
  doc.catalog.set(PDFName.of('Names'), context.obj({ Dests: context.register(names) }));
  const link = (y, extra) => context.register(context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [40, y, 200, y + 12], Border: [0, 0, 0], ...extra }));
  const shared = context.register(context.obj({ S: 'GoTo', D: [p6, 'Fit'] }));
  const comment = context.register(context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [300, 400, 320, 420], Contents: PDFHexString.fromText('Note'), P: p1 }));
  pages[0].node.set(PDFName.of('Annots'), context.obj([
    link(400, { Dest: [p2, 'Fit'] }),
    link(380, { A: { S: 'GoTo', D: [p3, 'XYZ', 50, 450, 0] } }),
    link(360, { Dest: PDFName.of('sec12') }),
    link(340, { A: { S: 'GoTo', D: PDFString.of('chapter.2') } }),
    link(320, { Dest: PDFString.of('section.1.1') }),
    link(300, { A: { S: 'URI', URI: PDFString.of('https://example.org/') } }),
    link(280, { A: shared }),
    link(260, { A: shared }),
    comment,
  ]));
  pages[1].node.set(PDFName.of('Annots'), context.obj([link(100, { Dest: [p3, 'Fit'] })]));
  pages[5].node.set(PDFName.of('Annots'), context.obj([link(100, { Dest: [p1, 'Fit'] })]));
  // Page 4 goes to page 5 when it opens: not a link, but it refers to page 5 all the same.
  pages[3].node.set(PDFName.of('AA'), context.obj({ O: { S: 'GoTo', D: [p5, 'Fit'] } }));
  // Bookmarks: chapter 1 open, chapter 2 closed, a web address at the end.
  const root = context.nextRef();
  const [c1, s11, s12, c2, s21, web] = [0, 1, 2, 3, 4, 5].map(() => context.nextRef());
  context.assign(c1, context.obj({ Title: PDFHexString.fromText('1 Introduction'), Parent: root, Dest: [p2, 'Fit'], First: s11, Last: s12, Count: 2, Next: c2, C: [1, 0, 0] }));
  context.assign(s11, context.obj({ Title: PDFHexString.fromText('1.1 Motivation'), Parent: c1, Dest: PDFString.of('section.1.1'), Next: s12 }));
  context.assign(s12, context.obj({ Title: PDFHexString.fromText('1.2 Outline'), Parent: c1, A: { S: 'GoTo', D: PDFName.of('sec12') }, Prev: s11 }));
  context.assign(c2, context.obj({ Title: PDFHexString.fromText('2 Fields'), Parent: root, A: { S: 'GoTo', D: PDFString.of('chapter.2') }, First: s21, Last: s21, Count: -1, Prev: c1, Next: web, F: 2 }));
  context.assign(s21, context.obj({ Title: PDFHexString.fromText('2.1 Scalars'), Parent: c2, Dest: [p6, 'Fit'] }));
  context.assign(web, context.obj({ Title: PDFHexString.fromText('Website'), Parent: root, A: { S: 'URI', URI: PDFString.of('https://example.org/') }, Prev: c2 }));
  context.assign(root, context.obj({ Type: 'Outlines', First: c1, Last: web, Count: 4 }));
  doc.catalog.set(PDFName.of('Outlines'), root);
  return doc.save();
})();

const appendix = await (async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  page.drawText('APPENDIX-TEXT', { x: 40, y: 150, size: 16 });
  doc.setTitle('Appendix');
  const root = doc.context.nextRef();
  const only = doc.context.register(doc.context.obj({ Title: PDFHexString.fromText('Appendix A'), Parent: root, Dest: [page.ref, 'Fit'] }));
  doc.context.assign(root, doc.context.obj({ Type: 'Outlines', First: only, Last: only, Count: 1 }));
  doc.catalog.set(PDFName.of('Outlines'), root);
  return doc.save();
})();

const fingerprint = (bytes) => createHash('sha256').update(bytes).digest('hex');
const before = [fingerprint(lecture), fingerprint(appendix)];

// ---- Helpers ---------------------------------------------------------------------------

const build = (pageList, extraSources = []) =>
  buildPdf({
    sources: [{ id: 'lecture', bytes: lecture }, ...extraSources],
    pages: pageList.map(([sourceId, index], position) => ({ id: `page${position}`, sourceId, index })),
  });

/** Pages stored in the file, reachable or not, against pages in the document. */
async function pageObjects(bytes) {
  const doc = await PDFDocument.load(bytes);
  let stored = 0;
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (object instanceof PDFDict && object.get(PDFName.of('Type')) === PDFName.of('Page')) stored++;
  }
  return { stored, pages: doc.getPageCount() };
}

/** Whether text drawn on any page, shown or hidden, is anywhere in the file. */
async function fileHas(bytes, text) {
  const doc = await PDFDocument.load(bytes);
  const hex = Buffer.from(text, 'latin1').toString('hex').toUpperCase();
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    let content;
    try {
      content = Buffer.from(decodePDFRawStream(object).decode()).toString('latin1');
    } catch {
      continue;
    }
    if (content.includes(`<${hex}>`) || content.includes(`(${text})`)) return true;
  }
  return false;
}

/** As PDF.js reads them: bookmarks (title, page index or web address, count) and each page's links. */
async function read(bytes) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const target = async (dest) => {
    const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
    return explicit ? doc.getPageIndex(explicit[0]) : null;
  };
  const outline = async (items = []) =>
    Promise.all(items.map(async (item) => ({
      title: item.title,
      to: item.url ?? (item.dest ? await target(item.dest) : null),
      ...(item.items.length ? { count: item.count, items: await outline(item.items) } : {}),
      ...(item.bold ? { bold: true } : {}),
      ...(item.color && item.color[0] === 255 ? { red: true } : {}),
    })));
  const links = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const annotations = await (await doc.getPage(number)).getAnnotations();
    links.push(await Promise.all(annotations.filter((item) => item.subtype === 'Link').map(async (item) => item.url ?? (item.dest ? await target(item.dest) : null))));
  }
  const result = { outline: await outline((await doc.getOutline()) || []), links };
  await doc.loadingTask.destroy();
  return result;
}

const WEB = 'https://example.org/';

// ---- Deleting a page ----------------------------------------------------------------------

const deleted = await build([['lecture', 0], ['lecture', 2], ['lecture', 3], ['lecture', 4], ['lecture', 5]]);
{
  // Read the details as written (pdf-lib otherwise stamps its own producer on load).
  const doc = await PDFDocument.load(deleted, { updateMetadata: false });
  assert.equal(doc.getTitle(), 'Lecture notes');
  assert.equal(doc.getAuthor(), 'A. Author');
  assert.equal(doc.getSubject(), 'Fields');
  assert.equal(doc.getKeywords(), 'physics, fields');
  assert.equal(doc.getCreator(), 'LaTeX with hyperref');
  assert.equal(doc.getCreationDate().toISOString(), '2020-01-02T03:04:05.000Z');
  assert.equal(doc.getLanguage(), 'en-GB');
  assert.equal(doc.getProducer(), 'QFT PDF');
  assert.equal(doc.catalog.getViewerPreferences()?.getDisplayDocTitle(), true, 'readers still show the title');
  assert.equal(doc.catalog.get(PDFName.of('PageMode')), PDFName.of('UseOutlines'), 'readers still open the bookmarks');
  // The comment on page 1 belongs to the new page 1.
  const comment = doc.getPage(0).node.Annots().asArray().map((ref) => doc.context.lookup(ref)).find((item) => item.get(PDFName.of('Subtype')) === PDFName.of('Text'));
  assert.equal(comment.get(PDFName.of('P')), doc.getPage(0).ref);
}
assert.deepEqual(await pageObjects(deleted), { stored: 5, pages: 5 }, 'no hidden pages');
assert.equal(await fileHas(deleted, 'PAGE-2-TEXT'), false, 'the deleted page is not in the file');
assert.equal(await fileHas(deleted, 'PAGE-3-TEXT'), true, 'the text check finds text that is there');
{
  const { outline, links } = await read(deleted);
  assert.deepEqual(outline, [
    // Its own page is gone, so chapter 1 leads to its first section.
    { title: '1 Introduction', to: 1, count: 2, red: true, items: [{ title: '1.1 Motivation', to: 1 }, { title: '1.2 Outline', to: 2 }] },
    { title: '2 Fields', to: 3, count: -1, bold: true, items: [{ title: '2.1 Scalars', to: 4 }] },
    { title: 'Website', to: WEB },
  ]);
  // Page 1: the link to the deleted page is gone; named links lead to the right pages.
  assert.deepEqual(links, [[1, 2, 3, 1, WEB, 4, 4], [], [], [], [0]]);
}

// ---- Extracting pages ----------------------------------------------------------------------

const contents = await build([['lecture', 0]]);
assert.deepEqual(await pageObjects(contents), { stored: 1, pages: 1 }, 'the contents page alone');
for (const number of [2, 3, 4, 5, 6]) assert.equal(await fileHas(contents, `PAGE-${number}-TEXT`), false, `page ${number} is not hidden in the file`);
assert.ok(contents.length < 12000, `small, as one page should be (${contents.length} bytes)`);
assert.deepEqual(await read(contents), { outline: [{ title: 'Website', to: WEB }], links: [[WEB]] });
assert.equal((await PDFDocument.load(contents)).getTitle(), 'Lecture notes');

// Page 4 opens page 5 (a page action, not a link): page 5 still stays out.
const pageFour = await build([['lecture', 3]]);
assert.deepEqual(await pageObjects(pageFour), { stored: 1, pages: 1 });
assert.equal(await fileHas(pageFour, 'PAGE-5-TEXT'), false, 'a page action does not bring its page along');

// ---- Combining with another PDF ------------------------------------------------------------

const combined = await build([0, 1, 2, 3, 4, 5].map((index) => ['lecture', index]).concat([['appendix', 0]]), [{ id: 'appendix', bytes: appendix }]);
assert.deepEqual(await pageObjects(combined), { stored: 7, pages: 7 }, 'linked pages are stored once');
{
  const { outline, links } = await read(combined);
  assert.deepEqual(outline.map((item) => [item.title, item.to]), [['1 Introduction', 1], ['2 Fields', 4], ['Website', WEB], ['Appendix A', 6]]);
  assert.deepEqual(links, [[1, 2, 3, 4, 2, WEB, 5, 5], [2], [], [], [], [0], []], 'every link leads to its page');
}
assert.equal((await PDFDocument.load(combined)).getTitle(), 'Lecture notes', 'the first PDF names the result');
const appendixFirst = await build([['appendix', 0], ['lecture', 0]], [{ id: 'appendix', bytes: appendix }]);
assert.equal((await PDFDocument.load(appendixFirst)).getTitle(), 'Appendix');
assert.deepEqual((await read(appendixFirst)).outline.map((item) => [item.title, item.to]), [['Appendix A', 0], ['Website', WEB]]);

// A bookmark for each file (fileBookmarks, on in the editor): named after the
// file, leading to its first page, closed, with the file's own bookmarks under
// it. A blank page added in the editor has none.
const blankBytes = await (async () => {
  const doc = await PDFDocument.create();
  doc.addPage([300, 300]);
  return doc.save();
})();
const named = (pageList, fileBookmarks = true) =>
  buildPdf({
    sources: [{ id: 'lecture', name: 'Lecture notes.pdf', bytes: lecture }, { id: 'appendix', name: 'appendix.PDF', bytes: appendix }, { id: 'blank', name: 'Blank page', blank: true, bytes: blankBytes }],
    pages: pageList.map(([sourceId, index], position) => ({ id: `page${position}`, sourceId, index })),
    fileBookmarks,
  });
{
  const { outline } = await read(await named([['lecture', 0], ['lecture', 1], ['blank', 0], ['appendix', 0], ['lecture', 5]]));
  // Closed: -3, the three bookmarks it shows when opened (1.1 and 1.2 led to pages left out).
  assert.deepEqual(outline.map(({ title, to, count }) => [title, to, count]), [['Lecture notes', 0, -3], ['appendix', 3, -1]], 'one closed bookmark per file, at its first page');
  assert.deepEqual(outline[0].items.map((item) => [item.title, item.to]), [['1 Introduction', 1], ['2 Fields', 4], ['Website', WEB]], 'the file’s own bookmarks under it');
  assert.deepEqual(outline[1].items, [{ title: 'Appendix A', to: 3 }]);
  assert.deepEqual((await read(await named([['lecture', 0], ['lecture', 1], ['blank', 0]]))).outline.map((item) => item.title), ['1 Introduction', 'Website'], 'one file and a blank page: no file bookmarks');
  assert.deepEqual((await read(await named([['lecture', 1], ['appendix', 0]], false))).outline.map((item) => item.title), ['1 Introduction', 'Website', 'Appendix A'], 'turned off');
}

// ---- Reordering (the document is edited in place) and duplicating --------------------------

const reordered = await build([5, 4, 3, 2, 1, 0].map((index) => ['lecture', index]));
assert.deepEqual((await read(reordered)).outline.map((item) => [item.title, item.to]), [['1 Introduction', 4], ['2 Fields', 1], ['Website', WEB]]);
const duplicated = await build([0, 0, 1, 2, 3, 4, 5].map((index) => ['lecture', index]));
assert.deepEqual(await pageObjects(duplicated), { stored: 7, pages: 7 });
assert.deepEqual((await read(duplicated)).outline.map((item) => [item.title, item.to]), [['1 Introduction', 2], ['2 Fields', 5], ['Website', WEB]], 'bookmarks lead to the first copy');

// Each copy of a duplicated page is a page of its own: what is added to one copy,
// and its page number, show on that copy only; each has its own link, note and
// pop-up. (pdf-lib writes a page's content as a list of streams, which pdf-lib's
// copying shares between the copies, so this page shows the problem.)
const single = await (async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 500]);
  page.drawText('ORIGINAL', { x: 40, y: 440, size: 16 });
  const { context } = doc;
  const [link, note, popup] = [0, 1, 2].map(() => context.nextRef());
  context.assign(link, context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [40, 300, 200, 312], Border: [0, 0, 0], A: { S: 'URI', URI: PDFString.of(WEB) } }));
  context.assign(note, context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [300, 400, 320, 420], Contents: PDFHexString.fromText('Note'), P: page.ref, Popup: popup }));
  context.assign(popup, context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [320, 320, 400, 400], Parent: note, P: page.ref }));
  page.node.set(PDFName.of('Annots'), context.obj([link, note, popup]));
  return doc.save();
})();
const twice = await buildPdf({
  sources: [{ id: 'single', bytes: single }],
  pages: [{ id: 'first', sourceId: 'single', index: 0 }, { id: 'second', sourceId: 'single', index: 0 }],
  annotations: [{ id: 'mark', pageId: 'second', type: 'text', text: 'ONLY-SECOND', fontSize: 14, color: '#000000', x: 0.1, y: 0.3, opacity: 1, align: 'left', autoWidth: true }],
  pageNumbers: { enabled: true, format: 'Number {page}', start: 1, size: 10, color: '#000000', margin: 28, position: 'bottom-right', pages: 'all' },
});
{
  const doc = await pdfjs.getDocument({ data: twice.slice(), verbosity: 0 }).promise;
  const texts = [];
  for (let number = 1; number <= doc.numPages; number++) texts.push((await (await doc.getPage(number)).getTextContent()).items.map((item) => item.str).filter((text) => text.trim()));
  await doc.loadingTask.destroy();
  assert.deepEqual(texts, [['ORIGINAL', 'Number 1'], ['ORIGINAL', 'ONLY-SECOND', 'Number 2']], 'each copy shows its own additions only');
}
assert.deepEqual((await read(twice)).links, [[WEB], [WEB]], 'each copy keeps the link');
{
  const doc = await PDFDocument.load(twice);
  const annots = doc.getPages().map((page) => page.node.Annots().asArray());
  assert.equal(new Set(annots.flat()).size, 6, 'each copy has its own three annotations');
  doc.getPages().forEach((page, index) => {
    const [, note, popup] = annots[index];
    assert.equal(doc.context.lookup(note).get(PDFName.of('P')), page.ref, `the note on copy ${index + 1} belongs to it`);
    assert.equal(doc.context.lookup(note).get(PDFName.of('Popup')), popup, `the note on copy ${index + 1} opens its own pop-up`);
    assert.equal(doc.context.lookup(popup).get(PDFName.of('Parent')), note);
    assert.equal(doc.context.lookup(popup).get(PDFName.of('P')), page.ref);
  });
}

// ---- Splitting, with parts that share a page --------------------------------------------------

const { parts: [first, second] } = await splitPdf(lecture, [[0, 1], [1, 2, 3, 5]]);
assert.deepEqual(await pageObjects(first), { stored: 2, pages: 2 });
assert.deepEqual(await pageObjects(second), { stored: 4, pages: 4 });
assert.equal((await PDFDocument.load(first)).getTitle(), 'Lecture notes — part 1');
assert.equal((await PDFDocument.load(second)).getLanguage(), 'en-GB');
assert.deepEqual(await read(first), {
  outline: [{ title: '1 Introduction', to: 1, red: true }, { title: 'Website', to: WEB }],
  links: [[1, WEB], []],
});
assert.deepEqual(await read(second), {
  outline: [
    { title: '1 Introduction', to: 0, count: 2, red: true, items: [{ title: '1.1 Motivation', to: 1 }, { title: '1.2 Outline', to: 2 }] },
    // Chapter 2's page is in neither part's pages here, so it leads to section 2.1.
    { title: '2 Fields', to: 3, count: -1, bold: true, items: [{ title: '2.1 Scalars', to: 3 }] },
    { title: 'Website', to: WEB },
  ],
  // Page 2's link to page 3 was dropped from part 1, and is back for part 2.
  links: [[1], [], [], []],
});
assert.equal(await fileHas(first, 'PAGE-3-TEXT'), false, 'part 1 does not carry page 3');

// ---- Layers: what is hidden stays hidden -----------------------------------------------------

/**
 * A two-page PDF whose pages each have a square on a shown layer and one on a
 * hidden layer: hidden by being listed as off, or (baseOff) by every layer
 * starting off but the shown one.
 */
async function layeredPdf([shownName, hiddenName], { baseOff = false } = {}) {
  const doc = await PDFDocument.create();
  const { context } = doc;
  const [shown, hidden] = [shownName, hiddenName].map((name) => context.register(context.obj({ Type: 'OCG', Name: PDFHexString.fromText(name) })));
  for (let number = 0; number < 2; number++) {
    const page = doc.addPage([400, 500]);
    page.node.set(PDFName.of('Resources'), context.obj({ Properties: { shown, hidden } }));
    page.node.set(PDFName.of('Contents'), context.register(context.stream('/OC /shown BDC 0 g 40 340 100 100 re f EMC /OC /hidden BDC 0 g 240 340 100 100 re f EMC')));
  }
  const config = baseOff ? { BaseState: 'OFF', ON: [shown], Order: [shown, hidden] } : { OFF: [hidden], Order: [shown, hidden] };
  doc.catalog.set(PDFName.of('OCProperties'), context.obj({ OCGs: [shown, hidden], D: config }));
  return doc.save();
}

/** For each page, as PDF.js draws it: whether its shown and its hidden square are drawn. */
async function drawnSquares(bytes) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const result = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const surface = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: surface.getContext('2d'), viewport, canvas: surface }).promise;
    const dark = (x, y) => {
      const [red, , , alpha] = surface.getContext('2d').getImageData(x, viewport.height - y, 1, 1).data;
      return alpha > 128 && red < 128;
    };
    result.push([dark(90, 390), dark(290, 390)]);
  }
  await doc.loadingTask.destroy();
  return result;
}

const questions = await layeredPdf(['Questions', 'Answers']);
const solutions = await layeredPdf(['Hints', 'Key'], { baseOff: true });
assert.deepEqual(await drawnSquares(questions), [[true, false], [true, false]], 'PDF.js draws the shown layer only');
assert.deepEqual(await drawnSquares(solutions), [[true, false], [true, false]]);
const buildLayers = (pageList) =>
  buildPdf({
    sources: [{ id: 'questions', bytes: questions }, { id: 'solutions', bytes: solutions }],
    pages: pageList.map(([sourceId, index], position) => ({ id: `page${position}`, sourceId, index })),
  });
assert.deepEqual(await drawnSquares(await buildLayers([['questions', 1]])), [[true, false]], 'a page deleted: the hidden layer stays hidden');
assert.deepEqual(await drawnSquares(await buildLayers([['questions', 0], ['questions', 0]])), [[true, false], [true, false]], 'a page duplicated');
const layersCombined = await buildLayers([['questions', 0], ['solutions', 0], ['solutions', 1]]);
assert.deepEqual(await drawnSquares(layersCombined), [[true, false], [true, false], [true, false]], 'two PDFs combined: each one’s hidden layer stays hidden');
{
  const doc = await pdfjs.getDocument({ data: layersCombined.slice(), verbosity: 0 }).promise;
  const config = await doc.getOptionalContentConfig();
  assert.deepEqual([...config].map(([, group]) => [group.name, group.visible]), [['Questions', true], ['Answers', false], ['Hints', true], ['Key', false]], 'every layer is listed, as it was');
  await doc.loadingTask.destroy();
}
const { parts: [layerPart] } = await splitPdf(questions, [[1]]);
assert.deepEqual(await drawnSquares(layerPart), [[true, false]], 'a split part');

// ---- Notes: what a copy leaves out, and digital signatures -----------------------------------

/** A three-page PDF with `extra` set in its catalog, and a file attached if `attach`. */
async function catalogPdf(extra, { attach = false } = {}) {
  const doc = await PDFDocument.create();
  for (let number = 1; number <= 3; number++) doc.addPage([300, 300]).drawText(`PAGE-${number}`, { x: 40, y: 150, size: 16 });
  for (const [key, value] of Object.entries(extra)) doc.catalog.set(PDFName.of(key), doc.context.obj(value));
  if (attach) await doc.attach(new TextEncoder().encode('x,y\n1,2\n'), 'data.csv', { mimeType: 'text/csv' });
  return doc.save();
}
const notesOf = async (bytes, indices) =>
  (await buildPdfWithNotes({ sources: [{ id: 'source', bytes }], pages: indices.map((index) => ({ id: `page${index}`, sourceId: 'source', index })) })).notes.sort();
const front = { PageLabels: { Nums: [0, { S: 'r' }, 2, { S: 'D' }] } };
const everything = await catalogPdf({ ...front, StructTreeRoot: { Type: 'StructTreeRoot' }, MarkInfo: { Marked: true } }, { attach: true });
assert.deepEqual(await notesOf(everything, [0, 1]), ['attachments-dropped', 'labels-dropped', 'tags-dropped'], 'a page deleted: the copy says what it leaves out');
assert.deepEqual(await notesOf(everything, [2, 1, 0]), [], 'pages only reordered: the PDF itself is kept, with all of these');
assert.deepEqual(await notesOf(await catalogPdf({ PageLabels: { Nums: [0, { S: 'D' }] } }), [0, 1]), [], 'labels that are plain numbers from 1 are not missed');
assert.deepEqual(await notesOf(await catalogPdf({ PageLabels: { Nums: [0, { S: 'D', St: 5 }] } }), [0, 1]), ['labels-dropped'], 'numbers starting at 5 are');
assert.deepEqual(await notesOf(await catalogPdf({ PageLabels: { Nums: [0, { S: 'D', St: PDFString.of('one') }] } }), [0, 1]), ['labels-dropped'], 'a damaged label is noted, and does not stop the download');
assert.deepEqual((await splitPdf(everything, [[0], [1, 2]])).notes.sort(), ['attachments-dropped', 'labels-dropped', 'tags-dropped'], 'split parts say it too');
/** A one-page PDF with a signature field, signed (with a value) or not. */
async function signaturePdf(signed) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const { context } = doc;
  const value = context.register(context.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite', SubFilter: 'adbe.pkcs7.detached', ByteRange: [0, 10, 20, 30], Contents: PDFHexString.of('00') }));
  const field = context.register(context.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: PDFString.of('Signature1'), Rect: [0, 0, 0, 0], F: 132, P: page.ref, ...(signed ? { V: value } : {}) }));
  page.node.set(PDFName.of('Annots'), context.obj([field]));
  doc.catalog.set(PDFName.of('AcroForm'), context.obj({ Fields: [field], SigFlags: 3 }));
  return doc.save();
}
assert.deepEqual(await notesOf(await signaturePdf(true), [0]), ['signature-invalid'], 'a signed PDF: its signature no longer matches the file');
assert.deepEqual(await notesOf(await signaturePdf(false), [0]), [], 'an empty signature field is not a signature');

// ---- Pages per sheet -------------------------------------------------------------------------

/** Each sheet's size and its text, with where each piece starts and which way it reads. */
async function sheetTexts(bytes) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const result = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const [, , width, height] = page.view;
    const items = (await page.getTextContent()).items.filter((item) => item.str.trim()).map(({ str, transform: [a, b, , , x, y] }) => ({ text: str, a, b, x, y }));
    result.push({ width, height, items });
  }
  await doc.loadingTask.destroy();
  return result;
}

/** How many pixels of a sheet, drawn at 72 dpi, pass `test(red, green, blue)`. */
async function countPixels(bytes, number, test) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const page = await doc.getPage(number);
  const viewport = page.getViewport({ scale: 1 });
  const surface = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvasContext: surface.getContext('2d'), viewport, canvas: surface }).promise;
  const { data } = surface.getContext('2d').getImageData(0, 0, surface.width, surface.height);
  let count = 0;
  for (let index = 0; index < data.length; index += 4) if (data[index + 3] > 128 && test(data[index], data[index + 1], data[index + 2])) count++;
  await doc.loadingTask.destroy();
  return count;
}
const dark = (red, green, blue) => red < 100 && green < 100 && blue < 100;
const pure = (red, green, blue) => red > 200 && green < 80 && blue < 80;
const MARGIN = 28.35, GAP = 14.17; // 10 mm and 5 mm, the defaults

// Two per sheet: the lecture's six 400 × 500 pages on three landscape A4 sheets, side by side.
const twoUp = await pagesPerSheet(lecture, { perSheet: 2 });
{
  const sheets = await sheetTexts(twoUp);
  assert.deepEqual(sheets.map(({ width, height }) => [Math.round(width), Math.round(height)]), [[842, 595], [842, 595], [842, 595]]);
  const at = (text) => sheets[0].items.find((item) => item.text === text);
  assert.ok(at('PAGE-1-TEXT').x < sheets[0].width / 2 && at('PAGE-2-TEXT').x > sheets[0].width / 2, 'pages 1 and 2 side by side');
  assert.equal(Math.round(at('PAGE-1-TEXT').y), Math.round(at('PAGE-2-TEXT').y));
}
assert.deepEqual(await pageObjects(twoUp), { stored: 3, pages: 3 }, 'only the sheets: no page hidden in the file');
assert.equal((await PDFDocument.load(twoUp)).getTitle(), 'Lecture notes', 'the document’s details come along');
// Four per sheet, on Letter: along each row, then down; portrait pages make a portrait sheet.
{
  const sheets = await sheetTexts(await pagesPerSheet(lecture, { perSheet: 4, paper: 'letter' }));
  assert.deepEqual(sheets.map(({ width, height, items }) => [width, height, items.length]), [[612, 792, 4], [612, 792, 2]]);
  const at = (text) => sheets[0].items.find((item) => item.text === text);
  assert.ok(at('PAGE-1-TEXT').x < at('PAGE-2-TEXT').x && Math.abs(at('PAGE-1-TEXT').y - at('PAGE-2-TEXT').y) < 0.01, 'pages 1 and 2 on the top row');
  assert.ok(at('PAGE-3-TEXT').y < at('PAGE-1-TEXT').y && Math.abs(at('PAGE-3-TEXT').x - at('PAGE-1-TEXT').x) < 0.01, 'page 3 under page 1');
}
// Landscape slides: two to a portrait sheet, one above the other; four to a landscape sheet, two by two.
assert.deepEqual((({ width, height, columns, rows }) => [Math.round(width), Math.round(height), columns, rows])(sheetLayout(2, 'a4', { width: 720, height: 405 }, MARGIN, GAP)), [595, 842, 1, 2]);
assert.deepEqual((({ width, height, columns, rows }) => [Math.round(width), Math.round(height), columns, rows])(sheetLayout(4, 'a4', { width: 720, height: 405 }, MARGIN, GAP)), [842, 595, 2, 2]);

// A page turned (/Rotate 90) and cropped goes on the sheet as it shows: turned, and without
// what the crop hides (a red square outside the crop; another inside it shows).
const turned = await (async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  page.drawText('TURNED', { x: 40, y: 40, size: 20 });
  page.drawRectangle({ x: 100, y: 200, width: 50, height: 50, color: rgb(1, 0, 0) });
  page.drawRectangle({ x: 250, y: 150, width: 100, height: 100, color: rgb(1, 0, 0) });
  page.setCropBox(0, 0, 200, 300);
  page.setRotation(degrees(90));
  return doc.save();
})();
const turnedSheet = await pagesPerSheet(turned, { perSheet: 2 });
{
  const [sheet] = await sheetTexts(turnedSheet);
  const text = sheet.items.find((item) => item.text === 'TURNED');
  assert.ok(Math.abs(text.a) < 1e-6 && text.b < 0, 'the text reads downwards, as the turned page shows it');
  const { scale } = sheetLayout(2, 'a4', { width: 300, height: 200 }, MARGIN, GAP);
  const red = await countPixels(turnedSheet, 1, pure);
  const square = (50 * scale) ** 2;
  assert.ok(red > 0.8 * square && red < 1.2 * square, `only the square inside the crop shows (${red} red pixels, ${Math.round(square)} expected)`);
}
// Layers hidden in the PDF stay hidden on the sheet: each page shows only its square on the shown layer.
{
  const sheet = await pagesPerSheet(questions, { perSheet: 2 });
  const { scale } = sheetLayout(2, 'a4', { width: 400, height: 500 }, MARGIN, GAP);
  const shown = 2 * (100 * scale) ** 2;
  const drawn = await countPixels(sheet, 1, dark);
  assert.ok(drawn > 0.8 * shown && drawn < 1.2 * shown, `the hidden layer stays hidden (${drawn} dark pixels, ${Math.round(shown)} expected)`);
}
// A thin border around each page, a password, and fields that must be flattened first.
assert.ok((await countPixels(await pagesPerSheet(blankBytes, { perSheet: 2, border: true }), 1, (red, green, blue) => red < 230 && red === green && green === blue)) > 100, 'a grey border around the page');
await assert.rejects(PDFDocument.load(await pagesPerSheet(lecture, { password: 'secret' })), /encrypted/i, 'the handout keeps the password');
await assert.rejects(pagesPerSheet(await readFile(path.join(here, 'fixtures/form-fields.pdf'))), /flattened/);
await assert.rejects(pagesPerSheet(lecture, { perSheet: 3 }), /2 or 4/);

assert.deepEqual([fingerprint(lecture), fingerprint(appendix)], before, 'the source PDFs are untouched');

console.log(JSON.stringify({ status: 'passed', checks: ['deleted page: details, language, viewer settings and bookmarks kept; links to kept pages work, named destinations resolved; the deleted page is not in the file', 'extracted page: no other page hidden in the file (links, page actions)', 'combined: each linked page stored once, links and bookmarks lead to the right pages, bookmarks of both PDFs, details from the first', 'reordered and duplicated pages; each copy of a duplicated page shows only its own additions and has its own annotations', 'split parts with a shared page: each part has its own links and bookmarks', 'layers hidden in a PDF stay hidden when pages are deleted, duplicated, combined or split', 'a bookmark for each combined file', 'notes: page labels, attached files and tags a copy leaves out; a digital signature no longer valid', 'pages per sheet: 2 and 4 to a sheet, in reading order, turned and cropped as shown, layers hidden, no hidden pages, border, password'] }, null, 2));
