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
const { DOMMatrix, ImageData, Path2D } = require(path.join(runtime, '@napi-rs/canvas'));
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
const { buildPdf } = await import('../dist/pdf-engine.js');
const { splitPdf } = await import('../dist/workflows.js');
const pdfjs = await import(pathToFileURL(path.join(runtime, 'pdfjs-dist/legacy/build/pdf.mjs')));
const { PDFDocument, PDFDict, PDFHexString, PDFName, PDFNull, PDFNumber, PDFString, StandardFonts, decodePDFRawStream, PDFRawStream } = globalThis.PDFLib;

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

// ---- Reordering (the document is edited in place) and duplicating --------------------------

const reordered = await build([5, 4, 3, 2, 1, 0].map((index) => ['lecture', index]));
assert.deepEqual((await read(reordered)).outline.map((item) => [item.title, item.to]), [['1 Introduction', 4], ['2 Fields', 1], ['Website', WEB]]);
const duplicated = await build([0, 0, 1, 2, 3, 4, 5].map((index) => ['lecture', index]));
assert.deepEqual(await pageObjects(duplicated), { stored: 7, pages: 7 });
assert.deepEqual((await read(duplicated)).outline.map((item) => [item.title, item.to]), [['1 Introduction', 2], ['2 Fields', 5], ['Website', WEB]], 'bookmarks lead to the first copy');

// ---- Splitting, with parts that share a page --------------------------------------------------

const [first, second] = await splitPdf(lecture, [[0, 1], [1, 2, 3, 5]]);
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

assert.deepEqual([fingerprint(lecture), fingerprint(appendix)], before, 'the source PDFs are untouched');

console.log(JSON.stringify({ status: 'passed', checks: ['deleted page: details, language, viewer settings and bookmarks kept; links to kept pages work, named destinations resolved; the deleted page is not in the file', 'extracted page: no other page hidden in the file (links, page actions)', 'combined: each linked page stored once, links and bookmarks lead to the right pages, bookmarks of both PDFs, details from the first', 'reordered and duplicated pages', 'split parts with a shared page: each part has its own links and bookmarks'] }, null, 2));
