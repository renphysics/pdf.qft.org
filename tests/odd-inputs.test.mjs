// PDFs whose structure is valid but not what the libraries expect: pages that
// share their resources, and pages that inherit from a node inside the page tree.
// Each file is written here object by object, without a PDF library (with the
// writer in odd-pdfs.mjs), and the exports are checked with pdf-lib and,
// independently, with PDF.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';
import { font, pdfFile as writeObjects, stream } from './odd-pdfs.mjs';

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
const { buildPdfWithNotes } = await import('../dist/pdf-engine.js');
const pdfjs = await import(pathToFileURL(path.join(runtime, 'pdfjs-dist/legacy/build/pdf.mjs')));
const { PDFDocument, PDFDict, PDFName } = globalThis.PDFLib;

// ---- Writing and reading -------------------------------------------------------------

/**
 * A PDF file from its objects, numbered from 1 in the order given, by the writer
 * of the odd-PDF catalogue. The first is the catalog.
 */
const pdfFile = (objects) =>
  writeObjects(objects.map((body, index) => [index ? `object-${index + 1}` : 'cat', body]));

/** Each page as PDF.js reads it: its texts, the kind of font of each, the part shown and the turn. */
async function read(bytes) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const pages = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    const items = content.items.filter((item) => item.str.trim());
    pages.push({
      texts: items.map((item) => item.str),
      families: items.map((item) => content.styles[item.fontName].fontFamily),
      view: page.view,
      rotate: page.rotate,
    });
  }
  await doc.loadingTask.destroy();
  return pages;
}

/** The export of `bytes` with its pages in `order` (indexes into the file), and what else is asked. */
async function build(bytes, order, settings = {}) {
  const source = Uint8Array.from(bytes);
  const result = await buildPdfWithNotes({
    sources: [{ id: 'file', bytes: source, name: 'file.pdf' }],
    pages: order.map((index, position) => ({ id: `page-${position}`, sourceId: 'file', index })),
    ...settings,
  });
  assert.deepEqual(source, Uint8Array.from(bytes), 'the opened file is not changed');
  return result;
}

const stamps = {
  pageNumbers: { format: 'Page {page} of {total}', start: 1, position: 'bottom-center', margin: 24, size: 9 },
  headerFooter: { headerLeft: 'Header {page}', margin: 24, size: 9 },
  watermark: { text: 'DRAFT', angle: 30, opacity: 0.2, size: 48 },
};

// ---- Pages that share their resources ------------------------------------------------

/**
 * A report of `count` pages, each with a line in Helvetica, a line in Times and
 * a small square drawn through a graphics state, whose pages share their
 * resources in one of three ways:
 *   'parts'      each page has its own resources, which point to one /Font, one
 *                /ExtGState and one /XObject dictionary (ReportLab writes fonts so);
 *   'resources'  every page points to one resources object;
 *   'inherited'  the resources are on the root of the page tree, and no page has its own.
 * The three dictionaries the engine adds names to are shared in each.
 */
function report(count, sharing) {
  const first = 11,
    parts = '<< /Font 3 0 R /ExtGState 7 0 R /XObject 8 0 R >>',
    square = '0 0 20 20 re f';
  const pageRefs = Array.from({ length: count }, (_, index) => `${first + 2 * index} 0 R`);
  const resources = { parts: `/Resources ${parts}`, resources: '/Resources 4 0 R', inherited: '' }[sharing];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${count}${sharing === 'inherited' ? ' /Resources 4 0 R' : ''} >>`,
    '<< /F1 5 0 R /F2 6 0 R >>',
    parts,
    font('Helvetica'),
    font('Times-Roman'),
    '<< /G1 9 0 R >>',
    '<< /X1 10 0 R >>',
    '<< /Type /ExtGState /ca 0.5 >>',
    `<< /Type /XObject /Subtype /Form /BBox [0 0 20 20] /Length ${square.length} >>\nstream\n${square}\nendstream`,
  ];
  for (let number = 1; number <= count; number++) {
    const contents = first + 2 * (number - 1) + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] ${resources} /Contents ${contents} 0 R >>`,
      stream(
        `q /G1 gs 1 0 0 1 340 440 cm /X1 Do Q BT /F1 16 Tf 40 440 Td (SHEET-${number}) Tj /F2 12 Tf 0 -24 Td (Serif ${number}) Tj ET`,
      ),
    );
  }
  return pdfFile(objects);
}

/** How many names each page's resources hold under `key`, read with pdf-lib. */
async function names(bytes, key) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const dictionary = page.node.Resources()?.lookupMaybe(PDFName.of(key), PDFDict);
    return dictionary ? dictionary.keys().length : 0;
  });
}

await test('numbers, a header and a watermark on pages that share their resources: each page holds only its own', async () => {
  // pdf-lib adds a name to a page's resources for each font and graphics state it
  // draws with. With resources that pages share, every page used to end up holding
  // the names added for all the others: a file that grew with the square of its pages.
  // The engine adds to three dictionaries: fonts (every text), graphics states
  // (an opacity: the watermark) and pictures. So each page gets a picture too.
  const count = 60,
    dot = createCanvas(4, 4);
  dot.getContext('2d').fillRect(0, 0, 4, 4);
  const picture = dot.toBuffer('image/png');
  for (const sharing of ['parts', 'resources', 'inherited']) {
    const bytes = report(count, sharing);
    const { bytes: output, notes } = await build(
      bytes,
      Array.from({ length: count }, (_, index) => index),
      {
        ...stamps,
        annotations: Array.from({ length: count }, (_, index) => ({
          type: 'image',
          pageId: `page-${index}`,
          x: 0.1,
          y: 0.5,
          width: 0.05,
          height: 0.04,
          imageBytes: picture,
          imageType: 'png',
        })),
      },
    );
    assert.deepEqual(notes, [], `${sharing}: nothing to report`);
    const pages = await read(output);
    assert.equal(pages.length, count);
    pages.forEach((page, index) => {
      const number = index + 1;
      for (const text of [
        `SHEET-${number}`,
        `Serif ${number}`,
        `Header ${number}`,
        'DRAFT',
        `Page ${number} of ${count}`,
      ])
        assert.ok(page.texts.includes(text), `${sharing}, page ${number}: “${text}” in ${page.texts}`);
      // The page's own two fonts still mean what they did.
      assert.deepEqual(page.families.slice(0, 2), ['sans-serif', 'serif'], `${sharing}, page ${number}`);
    });
    // The file's own names (two fonts, one graphics state, one square) and the page's additions.
    for (const [key, most] of [
      ['Font', 8],
      ['ExtGState', 4],
      ['XObject', 3],
    ]) {
      const held = await names(output, key);
      assert.ok(
        held.every((size) => size === held[0]),
        `${sharing}: every page holds as many /${key} names as the first, not more with each page: ${held}`,
      );
      assert.ok(
        held[0] > 1 && held[0] <= most,
        `${sharing}: a page holds the file's /${key} names and its own, no others: ${held[0]}`,
      );
    }
    const grown = (output.length - bytes.length) / count;
    assert.ok(grown < 1500, `${sharing}: the file grew by ${Math.round(grown)} bytes a page`);
  }
});

await test('page numbers on many copies of one page: each copy holds only its own', async () => {
  // Copies of a page share its resources as well: pdf-lib copies them once.
  const count = 40;
  const { bytes: output } = await build(report(1, 'parts'), new Array(count).fill(0), {
    pageNumbers: stamps.pageNumbers,
  });
  const pages = await read(output);
  assert.equal(pages.length, count);
  pages.forEach((page, index) =>
    assert.deepEqual(
      page.texts,
      ['SHEET-1', 'Serif 1', `Page ${index + 1} of ${count}`],
      `copy ${index + 1}`,
    ),
  );
  const held = await names(output, 'Font');
  assert.ok(
    held.every((size) => size === held[0]) && held[0] <= 4,
    `each copy holds its own names only: ${held}`,
  );
});

/**
 * A form of `count` pages that all point to one resources object, with one text
 * field on each page, filled in, and its appearance.
 */
function form(count) {
  const first = 6,
    refs = (offset) => Array.from({ length: count }, (_, index) => `${first + 4 * index + offset} 0 R`);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /AcroForm 5 0 R >>',
    `<< /Type /Pages /Kids [${refs(0).join(' ')}] /Count ${count} >>`,
    '<< /Font << /F1 4 0 R >> >>',
    font('Helvetica'),
    `<< /Fields [${refs(2).join(' ')}] /DA (/Helv 0 Tf 0 g) /DR << /Font << /Helv 4 0 R >> >> >>`,
  ];
  for (let number = 1; number <= count; number++) {
    const page = first + 4 * (number - 1),
      shown = `BT /Helv 12 Tf 2 10 Td (Answer ${number}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources 3 0 R /Contents ${page + 1} 0 R /Annots [${page + 2} 0 R] >>`,
      stream(`BT /F1 16 Tf 40 440 Td (SHEET-${number}) Tj ET`),
      `<< /Type /Annot /Subtype /Widget /FT /Tx /T (field${number}) /V (Answer ${number}) /Rect [40 300 240 330] /P ${page} 0 R /DA (/Helv 12 Tf 0 g) /AP << /N ${page + 3} 0 R >> >>`,
      `<< /Type /XObject /Subtype /Form /BBox [0 0 200 30] /Resources << /Font << /Helv 4 0 R >> >> /Length ${shown.length} >>\nstream\n${shown}\nendstream`,
    );
  }
  return pdfFile(objects);
}

await test('flattening a form on pages that share their resources: each page names its own field only', async () => {
  // Flattening draws each field on its page by a name in the page's resources.
  // It runs before the pages are otherwise prepared, so with shared resources
  // every page ended up naming every field in the document.
  const count = 40,
    bytes = form(count);
  for (const [what, order] of [
    ['every page', Array.from({ length: count }, (_, index) => index)],
    // Without its first page the document is copied, which shares what the pages shared.
    ['a page deleted', Array.from({ length: count - 1 }, (_, index) => index + 1)],
  ]) {
    const { bytes: output } = await build(bytes, order, { flattenForms: true });
    const pages = await read(output);
    pages.forEach((page, index) => {
      const number = order[index] + 1;
      assert.deepEqual(page.texts, [`SHEET-${number}`, `Answer ${number}`], `${what}, page ${number}`);
    });
    const held = await names(output, 'XObject');
    assert.ok(
      held.every((size) => size === 1),
      `${what}: each page names its own field's appearance, not the others': ${held}`,
    );
    const grown = (output.length - bytes.length) / count;
    assert.ok(grown < 400, `${what}: the file grew by ${Math.round(grown)} bytes a page`);
  }
});

// ---- Pages that inherit from a node inside the page tree -----------------------------

/**
 * Four pages under two nodes of the page tree. The first node turns its two pages
 * a quarter and gives them Helvetica; the second crops its two pages and gives
 * them Times. With `sizeOnPages` each page states its own size; without, the size
 * is inherited from the nodes as well.
 */
function nested(sizeOnPages) {
  const boxes = ['/MediaBox [0 0 420 595]', '/MediaBox [0 0 350 450]'];
  const node = (kids, index, rest) =>
    `<< /Type /Pages /Parent 2 0 R /Kids [${kids}] /Count 2 ${rest}${sizeOnPages ? '' : ' ' + boxes[index]} >>`;
  const page = (parent, index, contents) =>
    `<< /Type /Page /Parent ${parent} 0 R${sizeOnPages ? ' ' + boxes[index] : ''} /Contents ${contents} 0 R >>`;
  const text = (words) => stream(`BT /F1 16 Tf 40 300 Td (${words}) Tj ET`);
  return pdfFile([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 4 >>',
    node('5 0 R 6 0 R', 0, '/Rotate 90 /Resources << /Font << /F1 9 0 R >> >>'),
    node('7 0 R 8 0 R', 1, '/CropBox [20 30 330 420] /Resources << /Font << /F1 10 0 R >> >>'),
    page(3, 0, 11),
    page(3, 0, 12),
    page(4, 1, 13),
    page(4, 1, 14),
    font('Helvetica'),
    font('Times-Bold'),
    text('ALPHA-1'),
    text('ALPHA-2'),
    text('BETA-3'),
    text('BETA-4'),
  ]);
}

// What PDF.js shows for a page of each node, whatever is done to the file.
const alpha = (number) => ({
  texts: [`ALPHA-${number}`],
  families: ['sans-serif'],
  view: [0, 0, 420, 595],
  rotate: 90,
});
const beta = (number) => ({
  texts: [`BETA-${number}`],
  families: ['serif'],
  view: [20, 30, 330, 420],
  rotate: 0,
});
const inOrder = [alpha(1), alpha(2), beta(3), beta(4)];

await test('reordering pages that inherit from a node of the page tree: size, turn, crop and fonts stay', async () => {
  // To reorder a document in place, the pages are taken out of the page tree and
  // put back under its root. What a page inherited from a node in between was lost:
  // pages came out unturned, uncropped and without their fonts, or the export failed
  // on a page with no size of its own.
  for (const sizeOnPages of [true, false]) {
    const label = sizeOnPages ? 'size on the pages' : 'size inherited';
    const bytes = nested(sizeOnPages);
    assert.deepEqual(await read(bytes), inOrder, `${label}: the file is what the test takes it for`);
    for (const [name, order] of [
      ['as it is', [0, 1, 2, 3]],
      ['reversed', [3, 2, 1, 0]],
      ['interleaved', [0, 2, 1, 3]],
      ['one page moved', [1, 2, 3, 0]],
    ]) {
      const { bytes: output, notes } = await build(bytes, order);
      assert.deepEqual(notes, [], `${label}, ${name}: nothing to report`);
      assert.deepEqual(
        await read(output),
        order.map((index) => inOrder[index]),
        `${label}, ${name}`,
      );
    }
    // Reversed and numbered: what is added is drawn on pages that were moved.
    const { bytes: numbered } = await build(bytes, [3, 2, 1, 0], { pageNumbers: stamps.pageNumbers });
    const pages = await read(numbered);
    assert.deepEqual(
      pages.map((page) => page.texts),
      [
        ['BETA-4', 'Page 1 of 4'],
        ['BETA-3', 'Page 2 of 4'],
        ['ALPHA-2', 'Page 3 of 4'],
        ['ALPHA-1', 'Page 4 of 4'],
      ],
      `${label}, reversed and numbered`,
    );
    assert.deepEqual(
      pages.map((page) => [page.families[0], page.rotate, page.view]),
      [beta(4), beta(3), alpha(2), alpha(1)].map((page) => [page.families[0], page.rotate, page.view]),
      `${label}, reversed and numbered`,
    );
    // Deleting a page copies the others into a new file, which always kept these.
    const { bytes: fewer } = await build(bytes, [3, 0]);
    assert.deepEqual(await read(fewer), [beta(4), alpha(1)], `${label}, two pages kept`);
  }
});

// ---- A page listed twice in the page tree -----------------------------------------------

/**
 * Three pages of which the first and the third are one object (Kids [p1 p2
 * p1]), with page labels i, ii, iii and, when asked, a form of one text field
 * on the second page.
 */
function listedTwice(withForm) {
  const field =
    '<< /Type /Annot /Subtype /Widget /FT /Tx /T (note) /Rect [40 300 240 324] /P 6 0 R /DA (/Helv 12 Tf 0 g) /F 4 >>';
  return pdfFile([
    `<< /Type /Catalog /Pages 2 0 R /PageLabels << /Nums [0 << /S /r >>] >>${withForm ? ' /AcroForm << /Fields [8 0 R] /DA (/Helv 12 Tf 0 g) /DR << /Font << /Helv 3 0 R >> >> /NeedAppearances true >>' : ''} >>`,
    '<< /Type /Pages /Kids [4 0 R 6 0 R 4 0 R] /Count 3 >>',
    font('Helvetica'),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
    stream('BT /F1 16 Tf 40 440 Td (TWICE) Tj ET'),
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 3 0 R >> >> /Contents 7 0 R${withForm ? ' /Annots [8 0 R]' : ''} >>`,
    stream('BT /F1 16 Tf 40 440 Td (ONCE) Tj ET'),
    ...(withForm ? [field] : []),
  ]);
}

await test('a page listed twice in the page tree: left alone the file is kept as it is; edited, its pages are copied, and a form says why it cannot be', async () => {
  const labels = async (bytes) => {
    const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
    const found = await doc.getPageLabels();
    await doc.loadingTask.destroy();
    return found;
  };
  const turns = async (bytes) => (await read(bytes)).map((page) => page.rotate);
  const pagesOf = (extra = {}) =>
    [0, 1, 2].map((index) => ({ id: `page-${index}`, sourceId: 'file', index, ...extra }));
  const exported = (bytes, state) =>
    buildPdfWithNotes({
      sources: [{ id: 'file', bytes: Uint8Array.from(bytes), name: 'file.pdf' }],
      ...state,
    });
  for (const withForm of [false, true]) {
    const bytes = listedTwice(withForm),
      kind = withForm ? 'with a form' : 'without a form';
    assert.deepEqual(
      (await read(bytes)).map((page) => page.texts[0]),
      ['TWICE', 'ONCE', 'TWICE'],
      `${kind}: readers show three pages`,
    );
    // Nothing done to the pages: kept in place, with what a copy would lose.
    for (const [what, state] of [
      ['nothing changed', {}],
      ['a new title', { properties: { title: 'Kept' } }],
      ['a password', { protection: null }],
      ...(withForm ? [['an answer typed', { formValues: { file: { note: 'Typed' } } }]] : []),
    ]) {
      const { bytes: output, notes } = await exported(bytes, { pages: pagesOf(), ...state });
      assert.deepEqual(
        await labels(output),
        ['i', 'ii', 'iii'],
        `${kind}, ${what}: the page labels are kept`,
      );
      assert.deepEqual(notes, [], `${kind}, ${what}: nothing is left out`);
      const form = (await PDFDocument.load(output)).getForm();
      assert.equal(form.getFields().length, withForm ? 1 : 0, `${kind}, ${what}: the form is kept`);
      if (what === 'an answer typed') assert.equal(form.getTextField('note').getText(), 'Typed');
    }
    // The first page turned: it is one object with the third, and only the first turns.
    const turned = { pages: [{ ...pagesOf()[0], rotation: 90 }, ...pagesOf().slice(1)] };
    if (withForm) {
      await assert.rejects(
        exported(bytes, turned),
        /One page of this PDF is in it twice, so its pages have to be copied to be edited, and a form’s pages can only be copied once its fields are flattened\./,
        'with a form: the refusal says what is the matter with this file',
      );
      // Pages removed: the usual refusal.
      await assert.rejects(
        exported(bytes, { pages: pagesOf().slice(0, 2) }),
        /Pages of a PDF with form fields can only be combined, duplicated or extracted/,
      );
    }
    const { bytes: output, notes } = await exported(bytes, { ...turned, flattenForms: withForm });
    assert.deepEqual(
      await turns(output),
      [90, 0, 0],
      `${kind}: the first page is turned once, the third not at all`,
    );
    assert.deepEqual(notes, ['labels-dropped'], `${kind}: a copy, which says what it leaves out`);
    // Numbered: each page has its own number, and only its own.
    const { bytes: numbered } = await exported(bytes, {
      pages: pagesOf(),
      flattenForms: withForm,
      pageNumbers: stamps.pageNumbers,
    });
    assert.deepEqual(
      (await read(numbered)).map((page) => page.texts.filter((text) => text.startsWith('Page'))),
      [['Page 1 of 3'], ['Page 2 of 3'], ['Page 3 of 3']],
      `${kind}: page numbers`,
    );
  }
});
