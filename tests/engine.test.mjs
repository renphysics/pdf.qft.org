import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const runtime =
  process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../node_modules');
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
const {
  inspectPdf,
  openPdf,
  buildPdf,
  buildPdfWithNotes,
  parsePageRange,
  cropMarginsForRotation,
  measuringFont,
  imagesToPdf,
  blankPdf,
} = await import('../dist/pdf-engine.js');
const { baseName, isoDate, rescaledMargins, variables } = await import('../dist/layout.js');
const pdfjs = await import(pathToFileURL(path.join(runtime, 'pdfjs-dist/legacy/build/pdf.mjs')));
const { PDFDocument, StandardFonts, degrees, rgb } = globalThis.PDFLib;
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
  const doc = await pdfjs.getDocument({
    data: data.slice(),
    password,
    verbosity: 0,
    standardFontDataUrl: path.join(runtime, 'pdfjs-dist/standard_fonts/'),
  }).promise;
  const result = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const text = await page.getTextContent();
    result.push({
      width: viewport.width,
      height: viewport.height,
      items: text.items
        .filter((item) => item.str)
        .map((item) => ({
          text: item.str,
          transform: pdfjs.Util.transform(viewport.transform, item.transform),
        })),
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
let inspected;
await test('the geometry fixture: four pages of mixed sizes, CropBox origins and rotations', async () => {
  inspected = await inspectPdf(fixtureBytes);
  assert.equal(inspected.pageCount, 4);
  assert.deepEqual(
    inspected.pages.map((page) => [page.width, page.height, page.rotation]),
    [
      [300, 480, 0],
      [450, 350, 90],
      [400, 420, 180],
      [390, 450, 270],
    ],
  );
});

let canvas, loadedOutput;
await test('geometry export: reordered and turned pages; text, headers, footers, page numbers and watermark where they belong; progress; the source is untouched', async () => {
  const order = [3, 0, 2, 1];
  const pages = order.map((index, position) => ({
    id: `page-${index}`,
    sourceId: 'fixture',
    index,
    rotation: position % 2 ? 90 : 0,
  }));
  canvas = createCanvas(10, 10);
  canvas.getContext('2d').fillStyle = '#fa5533';
  canvas.getContext('2d').fillRect(0, 0, 10, 10);
  const progress = [];
  const output = await buildPdf(
    {
      sources: [{ id: 'fixture', bytes: fixtureBytes }],
      pages,
      annotations: pages.flatMap((page) => [
        {
          type: 'text',
          pageId: page.id,
          text: `Annotation ${page.index + 1}`,
          x: 0.1,
          y: 0.15,
          width: 0.8,
          fontSize: 12,
        },
        { type: 'highlight', pageId: page.id, x: 0.1, y: 0.25, width: 0.25, height: 0.05, color: '#ffec73' },
        {
          type: 'image',
          pageId: page.id,
          x: 0.75,
          y: 0.1,
          width: 0.1,
          height: 0.08,
          imageBytes: canvas.toBuffer('image/png'),
          imageType: 'png',
        },
      ]),
      headerFooter: {
        headerLeft: 'Header {page}',
        footerCenter: 'Footer {page}/{total}',
        margin: 24,
        size: 10,
      },
      pageNumbers: { format: 'Number {page}', start: 7, position: 'bottom-right', margin: 24, size: 8 },
      watermark: { text: 'DRAFT', angle: 0, opacity: 0.16, size: 36 },
    },
    (fraction) => progress.push(fraction),
  );
  await writeFile(path.join(outputDir, 'geometry-export.pdf'), output);
  assert.deepEqual(fixtureBytes, snapshot, 'Export must not mutate original bytes');
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.every((value, i) => !i || value >= progress[i - 1]));
  loadedOutput = await PDFDocument.load(output);
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
    approx(annotation.transform[4], page.width * 0.1, 'Annotation left edge tracks visible crop');
    approx(annotation.transform[5], page.height * 0.15 + 8.616, 'Annotation top uses font ascent');
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
});

await test('geometry export: the picture and the highlight are drawn on every page', async () => {
  // The picture and the highlight are drawn on every page: one image XObject, and a
  // filled rectangle in the highlight's colour, blended with /Multiply at 30% opacity.
  {
    const { PDFName, decodePDFRawStream } = globalThis.PDFLib;
    for (const [index, page] of loadedOutput.getPages().entries()) {
      const resources = page.node.Resources();
      assert.equal(
        resources.lookup(PDFName.of('XObject')).keys().length,
        1,
        `page ${index + 1} has its picture`,
      );
      const states = resources.lookup(PDFName.of('ExtGState'));
      const multiply =
        states &&
        states
          .keys()
          .map((key) => states.lookup(key))
          .find((state) => state.get(PDFName.of('BM')) === PDFName.of('Multiply'));
      assert.ok(multiply, `page ${index + 1} has the highlight's blend mode`);
      approx(multiply.lookup(PDFName.of('ca')).asNumber(), 0.3, 'highlight opacity', 0.001);
      const content = page.node
        .Contents()
        .asArray()
        .map((ref) =>
          Buffer.from(decodePDFRawStream(loadedOutput.context.lookup(ref)).decode()).toString('latin1'),
        )
        .join('\n');
      // pdf-lib draws the rectangle as a path (m, l, h) and fills it: the colour, then a fill within a few lines.
      assert.match(
        content,
        /1 0\.92\d* 0\.45\d* rg\n(?:[^\n]*\n){1,12}?f\*?\n/,
        `page ${index + 1} fills the highlight rectangle in #ffec73`,
      );
      assert.match(content, /\/[\w-]+ Do\b/, `page ${index + 1} draws its picture`);
    }
  }
});

let merged;
await test('merging two PDFs; a footer on selected pages only', async () => {
  const second = await PDFDocument.create();
  second.addPage([210, 310]).drawText('Second document');
  merged = await buildPdf({
    sources: [
      { id: 'a', bytes: fixtureBytes },
      { id: 'b', bytes: await second.save() },
    ],
    pages: [
      { id: 'b1', sourceId: 'b', index: 0 },
      { id: 'a2', sourceId: 'a', index: 1 },
    ],
    headerFooter: { footerLeft: 'Selected only', pages: ['a2'] },
  });
  await writeFile(path.join(outputDir, 'merged-export.pdf'), merged);
  const mergedText = await extract(merged);
  assert.equal(mergedText.length, 2);
  assert.ok(mergedText[0].items.some((item) => item.text === 'Second document'));
  assert.ok(!mergedText[0].items.some((item) => item.text === 'Selected only'));
  assert.ok(mergedText[1].items.some((item) => item.text === 'Selected only'));
});

await test('{date} and {filename}: today’s date, and the name of the file each page came from', async () => {
  // The date as the reader's own calendar has it, months and days in two digits.
  assert.equal(isoDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(isoDate(new Date(2026, 10, 30)), '2026-11-30');
  assert.equal(baseName('Report v1.2.PDF'), 'Report v1.2');
  assert.equal(
    baseName('Report v1.2'),
    'Report v1.2',
    'Only the type of a file the editor opens is taken off',
  );
  assert.equal(baseName('scan.jpeg'), 'scan');
  assert.equal(
    variables('{filename} {date} {page}/{total} {date}', 2, 9, { date: 'D', filename: 'F' }),
    'F D 2/9 D',
  );
  assert.equal(variables('a{date}b{filename}c', 1, 1), 'abc', 'Without a file they leave nothing behind');
  // A name goes in as it is: "$&" is no pattern, and braces in it are not filled in a second time.
  assert.equal(
    variables('{filename}', 3, 4, { date: 'D', filename: 'Cost $& $$ {page} {date}' }),
    'Cost $& $$ {page} {date}',
  );

  const second = await PDFDocument.create();
  second.addPage([420, 310]).drawText('Second document');
  const before = isoDate();
  const bytes = await buildPdf({
    sources: [
      { id: 'a', bytes: fixtureBytes, name: 'Annual report v1.2.pdf' },
      { id: 'b', bytes: await second.save(), name: 'scan $& 7.PDF' },
      { id: 'c', bytes: await blankPdf(400, 300), name: 'Blank page', blank: true },
    ],
    pages: [
      { id: 'b1', sourceId: 'b', index: 0 },
      { id: 'a2', sourceId: 'a', index: 1 },
      { id: 'c1', sourceId: 'c', index: 0 },
    ],
    headerFooter: { headerLeft: '{filename}', footerLeft: 'Printed {date}' },
    pageNumbers: { format: '{filename} p{page}/{total}' },
    watermark: { text: 'Copy of {filename}, {date}', size: 12 },
  });
  await writeFile(path.join(outputDir, 'tokens-export.pdf'), bytes);
  // The build may have run across midnight.
  const dates = [before, isoDate()];
  const pages = (await extract(bytes)).map((page) => page.items.map((item) => item.text.trim()));
  assert.equal(pages.length, 3);
  const shows = (page, text) => dates.some((date) => page.includes(text.replace('DATE', date)));
  for (const [index, name] of [
    [0, 'scan $& 7'],
    [1, 'Annual report v1.2'],
  ]) {
    assert.ok(pages[index].includes(name), `Header on page ${index + 1}: ${JSON.stringify(pages[index])}`);
    assert.ok(shows(pages[index], 'Printed DATE'), `Footer on page ${index + 1}`);
    assert.ok(pages[index].includes(`${name} p${index + 1}/3`), `Page number on page ${index + 1}`);
    assert.ok(shows(pages[index], `Copy of ${name}, DATE`), `Watermark on page ${index + 1}`);
  }
  // A blank page came from no file: its name is nothing, the rest is as on the other pages.
  assert.ok(!pages[2].some((text) => text.includes('Blank page')), JSON.stringify(pages[2]));
  assert.ok(shows(pages[2], 'Printed DATE'));
  assert.ok(pages[2].includes('p3/3'));
  assert.ok(shows(pages[2], 'Copy of , DATE'));
});

await test('headers, footers and page numbers mirrored on even pages', async () => {
  // Mirrored for printing on both sides: on the 2nd page, left and right change places.
  const twoSided = await PDFDocument.create();
  for (let number = 0; number < 3; number++) twoSided.addPage([400, 500]);
  const mirrored = await extract(
    await buildPdf({
      sources: [{ id: 'm', bytes: await twoSided.save() }],
      pages: [0, 1, 2].map((index) => ({ id: `m${index}`, sourceId: 'm', index })),
      headerFooter: { headerLeft: 'Course', headerRight: 'Chapter', margin: 30, size: 10, mirror: true },
      pageNumbers: { format: 'p{page}', position: 'bottom-right', margin: 30, size: 10, mirror: true },
    }),
  );
  assert.deepEqual(
    mirrored.map((sheet) =>
      Object.fromEntries(
        sheet.items
          .filter((item) => item.text.trim())
          .map((item) => [item.text, item.transform[4] < sheet.width / 2 ? 'left' : 'right']),
      ),
    ),
    [
      { Course: 'left', Chapter: 'right', p1: 'right' },
      { Course: 'right', Chapter: 'left', p2: 'left' },
      { Course: 'left', Chapter: 'right', p3: 'right' },
    ],
  );
  approx(
    mirrored[1].items.find((item) => item.text === 'p2').transform[4],
    30,
    'An even page’s number starts at the left margin',
  );
});

await test('a subset of pages: unselected pages are not kept in the file', async () => {
  const subset = await buildPdf({
    sources: [{ id: 'a', bytes: fixtureBytes }],
    pages: [{ id: 'selected', sourceId: 'a', index: 1 }],
  });
  const subsetDoc = await PDFDocument.load(subset);
  assert.equal(subsetDoc.getPageCount(), 1);
  const decodedStreams = subsetDoc.context
    .enumerateIndirectObjects()
    .filter(([, object]) => object instanceof globalThis.PDFLib.PDFRawStream)
    .map(([, object]) => Buffer.from(globalThis.PDFLib.decodePDFRawStream(object).decode()).toString())
    .join('\n')
    .toUpperCase();
  assert.ok(
    decodedStreams.includes(Buffer.from('Original 2').toString('hex').toUpperCase()),
    'The selected page content is copied',
  );
  for (const omitted of [1, 3, 4])
    assert.ok(
      !decodedStreams.includes(Buffer.from(`Original ${omitted}`).toString('hex').toUpperCase()),
      'Unselected page streams are not retained in exported bytes',
    );
});

await test('Unicode and Chinese text in a footer', async () => {
  const unicode = await buildPdf({
    sources: [{ id: 'a', bytes: fixtureBytes }],
    pages: [{ id: 'a', sourceId: 'a', index: 0 }],
    annotations: [
      { type: 'text', pageId: 'a', text: 'Résumé π 中文页脚', x: 0.1, y: 0.2, width: 0.8, fontSize: 16 },
    ],
    headerFooter: { footerCenter: '量子场论 · 第 {page} 页', size: 10 },
  });
  await writeFile(path.join(outputDir, 'unicode-export.pdf'), unicode);
  const unicodeText = await extract(unicode);
  assert.ok(unicodeText[0].items.some((item) => item.text.includes('中文页脚')));
  assert.ok(unicodeText[0].items.some((item) => item.text.includes('量子场论')));
});

await test('accented Latin text: Noto Sans, embedded as a subset', async () => {
  // Accented Latin text uses Noto Sans, embedded as a subset of the glyphs used.
  const latin = await buildPdf({
    sources: [{ id: 'a', bytes: fixtureBytes }],
    pages: [{ id: 'a', sourceId: 'a', index: 0 }],
    annotations: [
      { type: 'text', pageId: 'a', text: 'Café crème, déjà vu', x: 0.1, y: 0.2, width: 0.8, fontSize: 16 },
    ],
  });
  await writeFile(path.join(outputDir, 'latin-subset-export.pdf'), latin);
  assert.ok(
    (await extract(latin))[0].items.some((item) => item.text === 'Café crème, déjà vu'),
    'Latin text is extractable',
  );
  assert.ok(
    latin.length - fixtureBytes.length < 60000,
    `Noto Sans is subset, not embedded whole (+${latin.length - fixtureBytes.length} bytes)`,
  );
});

await test('Chinese, kana and Hangul: the CJK font is subset, read without warnings, as wide as measured', async () => {
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
    process.stderr.write = (chunk, ...rest) =>
      String(chunk).includes('Warning:')
        ? (warnings.push(String(chunk).trim()), true)
        : write.call(process.stderr, chunk, ...rest);
    try {
      const doc = await pdfjs.getDocument({
        data: data.slice(),
        verbosity: 1,
        standardFontDataUrl: path.join(runtime, 'pdfjs-dist/standard_fonts/'),
      }).promise;
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
  const cjkLines = [
    '中文测试：你好，世界！欢迎使用。',
    '繁體字測試：臺灣、香港。',
    '日本語：ひらがな、カタカナ。',
    '한국어 테스트: 안녕하세요.',
    'Mixed 混合 ABC abc 123 — “引号”',
  ];
  const cjk = await buildPdf({
    sources: [{ id: 'a', bytes: fixtureBytes }],
    pages: [{ id: 'c', sourceId: 'a', index: 0 }],
    annotations: cjkLines.map((text, index) => ({
      id: `cjk${index}`,
      type: 'text',
      pageId: 'c',
      pageRotation: 0,
      text,
      x: 0.05,
      y: 0.1 + index * 0.12,
      autoWidth: true,
      fontSize: 14,
    })),
  });
  await writeFile(path.join(outputDir, 'cjk-subset-export.pdf'), cjk);
  assert.ok(
    cjk.length - fixtureBytes.length < 300000,
    `Noto Sans CJK is subset, not embedded whole (+${cjk.length - fixtureBytes.length} bytes)`,
  );
  assert.deepEqual(await renderWarnings(cjk), [], 'PDF.js reads the CJK subset without font warnings');
  const cjkFont = await measuringFont('cjk');
  const cjkItems = (await extract(cjk))[0].items;
  for (const line of cjkLines) {
    const item = cjkItems.find((candidate) => candidate.text === line);
    assert.ok(item, `"${line}" is extractable as written`);
    const doc = await pdfjs.getDocument({ data: cjk.slice(), verbosity: 0 }).promise;
    const width = (await (await doc.getPage(1)).getTextContent()).items.find(
      (candidate) => candidate.str === line,
    ).width;
    await doc.loadingTask.destroy();
    approx(
      width,
      cjkFont.widthOfTextAtSize(line, 14),
      `"${line}" is as wide as the preview measures it`,
      0.05,
    );
  }
});

await test('a signature on every page is stored once', async () => {
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
      annotations: inspected.pages.map((_, index) => ({
        id: `sig${index}`,
        pageId: `s${index}`,
        type: 'signature',
        x: 0.6,
        y: 0.8,
        width: 0.3,
        height: 0.1,
        imageBytes: signature,
        imageType: 'png',
      })),
    });
    const doc = await PDFDocument.load(signed);
    const images = doc.context
      .enumerateIndirectObjects()
      .filter(
        ([, object]) =>
          object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'),
      );
    assert.equal(images.length, 2, 'one signature picture and its transparency mask, for four pages');
    assert.deepEqual(
      doc.getPages().map((page) => page.node.Resources().lookup(PDFName.of('XObject')).keys().length),
      [1, 1, 1, 1],
      'every page draws it',
    );
  }
});

await test('pictures as pages: their own size, A4 and Letter; JPEG data unchanged', async () => {
  // Pictures as pages: their own size at 96 pixels per inch, or A4 / Letter turned
  // to suit each picture, centred inside the margin and never enlarged. JPEG data
  // goes into the PDF unchanged.
  {
    const { PDFName, PDFRawStream } = globalThis.PDFLib;
    const picture = (width, height, type) => {
      const surface = createCanvas(width, height);
      const context = surface.getContext('2d');
      context.fillStyle = '#3a6ea5';
      context.fillRect(0, 0, width, height);
      return { bytes: new Uint8Array(surface.toBuffer(type === 'png' ? 'image/png' : 'image/jpeg')), type };
    };
    const wide = picture(800, 400, 'png'),
      tall = picture(300, 600, 'jpg'),
      small = picture(100, 100, 'png');
    const sizes = async (bytes) =>
      (await PDFDocument.load(bytes))
        .getPages()
        .map((page) => [Math.round(page.getWidth() * 100) / 100, Math.round(page.getHeight() * 100) / 100]);
    assert.deepEqual(
      await sizes(await imagesToPdf([wide, tall])),
      [
        [600, 300],
        [225, 450],
      ],
      'their own size: 0.75 pt per pixel',
    );
    assert.deepEqual(
      await sizes(await imagesToPdf([wide, tall], { size: 'fit', margin: 24 })),
      [
        [648, 348],
        [273, 498],
      ],
      'plus the margin',
    );
    assert.deepEqual(
      await sizes(await imagesToPdf([wide, tall], { size: 'a4', margin: 24 })),
      [
        [841.89, 595.28],
        [595.28, 841.89],
      ],
      'A4, turned to suit',
    );
    assert.deepEqual(await sizes(await imagesToPdf([wide], { size: 'letter' })), [[792, 612]], 'Letter');
    // A blank page, as Organize pages adds one.
    assert.deepEqual(
      await sizes(await blankPdf(841.89, 595.28)),
      [[841.89, 595.28]],
      'a blank page of the given size',
    );
    await assert.rejects(blankPdf(0, 100), /between 1 and 14,400 points/);
    const jpeg = await PDFDocument.load(await imagesToPdf([tall], { size: 'a4' }));
    const stored = jpeg.context
      .enumerateIndirectObjects()
      .find(
        ([, object]) =>
          object instanceof PDFRawStream && object.dict.get(PDFName.of('Filter')) === PDFName.of('DCTDecode'),
      );
    assert.deepEqual(stored[1].contents, tall.bytes, 'JPEG data is embedded as it is');
    const placed = await extract(await imagesToPdf([small], { size: 'a4' }));
    assert.equal(placed.length, 1);
    await assert.rejects(imagesToPdf([]), /at least one/);
    await assert.rejects(
      imagesToPdf([{ bytes: new Uint8Array([1, 2, 3]), type: 'png' }]),
      /could not be read/,
    );
    await assert.rejects(imagesToPdf([wide], { size: 'a3' }), /page size/);
  }
});

await test('rotation before and after a note is placed', async () => {
  // A note placed before rotation must rotate with the original page; a later
  // note placed in the rotated view must remain upright in that newer view.
  const rotatedAfterEdit = await buildPdf({
    sources: [{ id: 'a', bytes: fixtureBytes }],
    pages: [{ id: 'p', sourceId: 'a', index: 0, rotation: 90 }],
    annotations: [
      { type: 'text', pageId: 'p', pageRotation: 0, text: 'Before rotation', x: 0.1, y: 0.2, fontSize: 12 },
      { type: 'text', pageId: 'p', pageRotation: 90, text: 'After rotation', x: 0.1, y: 0.2, fontSize: 12 },
      {
        type: 'image',
        pageId: 'p',
        pageRotation: 0,
        x: 0.2,
        y: 0.4,
        width: 0.2,
        height: 0.125,
        imageBytes: canvas.toBuffer('image/png'),
        imageType: 'png',
      },
    ],
  });
  await writeFile(path.join(outputDir, 'rotation-after-edit.pdf'), rotatedAfterEdit);
  const rotatedText = (await extract(rotatedAfterEdit))[0].items;
  const beforeRotation = rotatedText.find((item) => item.text === 'Before rotation');
  const afterRotation = rotatedText.find((item) => item.text === 'After rotation');
  approx(beforeRotation.transform[0], 0, 'Existing annotation rotates with page');
  approx(beforeRotation.transform[1], 12, 'Existing annotation has clockwise orientation');
  approx(beforeRotation.transform[4], 480 * 0.8 - 8.616, 'Existing annotation retains original anchor');
  approx(beforeRotation.transform[5], 300 * 0.1, 'Existing annotation retains original anchor');
  approx(afterRotation.transform[1], 0, 'New annotation is upright in rotated view');
  approx(afterRotation.transform[4], 480 * 0.1, 'New annotation uses rotated width');
  approx(afterRotation.transform[5], 300 * 0.2 + 8.616, 'New annotation uses rotated height');
});

let margins, cropPages, cropState, cropDoc, cropText;
await test('crop: sizes at every source rotation; annotations stay put; the footer follows the new edge; the source is untouched', async () => {
  // Cropping changes the viewing box, preserving native vectors, searchable
  // text, MediaBox, and annotation anchors. Expected boxes below are calculated
  // directly in each source page's PDF coordinates, independently of the engine.
  margins = { left: 0.1, top: 0.15, right: 0.2, bottom: 0.05, rotation: 0 };
  cropPages = inspected.pages.map((page, index) => ({
    id: `crop-${index}`,
    sourceId: 'a',
    index,
    rotation: 0,
    crop: { ...margins },
  }));
  const cropAnnotations = cropPages.flatMap((page) => [
    {
      type: 'text',
      pageId: page.id,
      pageRotation: 0,
      text: `Before crop ${page.index}`,
      x: 0.4,
      y: 0.4,
      fontSize: 10,
    },
    {
      type: 'text',
      pageId: page.id,
      pageRotation: 0,
      pageCrop: { ...margins },
      text: `After crop ${page.index}`,
      x: 0.3,
      y: 0.5,
      fontSize: 10,
    },
  ]);
  cropState = {
    sources: [{ id: 'a', bytes: fixtureBytes }],
    pages: cropPages,
    annotations: cropAnnotations,
    headerFooter: { footerLeft: 'Cropped footer', margin: 20, size: 8 },
  };
  const cropped = await buildPdf(cropState);
  await writeFile(path.join(outputDir, 'cropped-export.pdf'), cropped);
  cropDoc = await PDFDocument.load(cropped);
  const sourceDoc = await PDFDocument.load(fixtureBytes);
  const expectedBoxes = [
    { x: 70, y: 84, width: 210, height: 384 },
    { x: 92.5, y: 105, width: 280, height: 315 },
    { x: 120, y: 123, width: 280, height: 336 },
    { x: 62.5, y: 138, width: 360, height: 273 },
  ];
  cropText = await extract(cropped);
  for (let i = 0; i < 4; i++) {
    for (const key of ['x', 'y', 'width', 'height'])
      approx(
        cropDoc.getPage(i).getCropBox()[key],
        expectedBoxes[i][key],
        `Native rotation ${i * 90}, crop ${key}`,
      );
    assert.deepEqual(
      cropDoc.getPage(i).getMediaBox(),
      sourceDoc.getPage(i).getMediaBox(),
      'Cropping leaves original media intact',
    );
    const { width: originalWidth, height: originalHeight } = inspected.pages[i];
    const result = cropText[i];
    approx(result.width, 0.7 * originalWidth, 'PDF.js cropped visible width');
    approx(result.height, 0.8 * originalHeight, 'PDF.js cropped visible height');
    const prior = result.items.find((item) => item.text === `Before crop ${i}`);
    const later = result.items.find((item) => item.text === `After crop ${i}`);
    assert.ok(prior && later, 'Text remains searchable before and after crop');
    approx(prior.transform[4], 0.3 * originalWidth, 'Pre-crop annotation retains paper location');
    approx(
      prior.transform[5],
      0.25 * originalHeight + 7.18,
      'Pre-crop annotation keeps original vertical anchor',
    );
    approx(later.transform[4], 0.3 * result.width, 'New annotation uses cropped view width');
    approx(later.transform[5], 0.5 * result.height + 7.18, 'New annotation uses cropped view height');
    const footer = result.items.find((item) => item.text === 'Cropped footer');
    approx(footer.transform[4], 20, 'Footer follows new crop left edge');
    approx(footer.transform[5], result.height - 20, 'Footer follows new crop bottom edge');
  }
  assert.deepEqual(fixtureBytes, snapshot, 'Cropping does not mutate source bytes');
});

await test('crop: repeated builds do not shrink further', async () => {
  // Repeated builds use absolute source margins and do not progressively shrink.
  const repeated = await extract(await buildPdf(cropState));
  assert.deepEqual(
    repeated.map((p) => [p.width, p.height]),
    cropText.map((p) => [p.width, p.height]),
  );
});

await test('crop, then rotate: the crop keeps its rectangle and annotations their anchor', async () => {
  // Rotating after crop preserves its physical rectangle for every source angle.
  const cropThenRotate = await buildPdf({
    ...cropState,
    pages: cropPages.map((page) => ({ ...page, rotation: 90 })),
  });
  const cropRotatedDoc = await PDFDocument.load(cropThenRotate);
  const cropRotatedText = await extract(cropThenRotate);
  for (let i = 0; i < 4; i++) {
    assert.deepEqual(cropRotatedDoc.getPage(i).getCropBox(), cropDoc.getPage(i).getCropBox());
    approx(cropRotatedText[i].width, cropText[i].height, 'Post-crop rotation exchanges visible dimensions');
    approx(cropRotatedText[i].height, cropText[i].width, 'Post-crop rotation exchanges visible dimensions');
    const before = cropText[i].items.find((item) => item.text === `After crop ${i}`);
    const after = cropRotatedText[i].items.find((item) => item.text === `After crop ${i}`);
    approx(
      after.transform[4],
      cropText[i].height - before.transform[5],
      'Post-crop annotation rotates at fixed anchor',
    );
    approx(after.transform[5], before.transform[4], 'Post-crop annotation rotates at fixed anchor');
  }
});

await test('rotate, then crop: the crop uses the displayed axes', async () => {
  // Applying a crop in a newly rotated view uses the new displayed axes.
  const rotatedCrop = { ...margins, rotation: 90 };
  const cropAfterRotate = await buildPdf({
    sources: cropState.sources,
    pages: [{ id: 'p', sourceId: 'a', index: 0, rotation: 90, crop: rotatedCrop }],
  });
  const cropAfterRotateBox = (await PDFDocument.load(cropAfterRotate)).getPage(0).getCropBox();
  assert.deepEqual(cropAfterRotateBox, { x: 85, y: 108, width: 240, height: 336 });
});

await test('crop reset: the source size returns and later annotations stay put', async () => {
  // Resetting crop restores source size without moving post-crop annotations.
  const resetCrop = await extract(
    await buildPdf({ ...cropState, pages: cropPages.map(({ crop, ...page }) => page) }),
  );
  for (let i = 0; i < 4; i++) {
    approx(resetCrop[i].width, inspected.pages[i].width, 'Reset crop restores original visible width');
    approx(resetCrop[i].height, inspected.pages[i].height, 'Reset crop restores original visible height');
    const item = resetCrop[i].items.find((item) => item.text === `After crop ${i}`);
    approx(
      item.transform[4],
      inspected.pages[i].width * (0.1 + 0.3 * 0.7),
      'Reset crop retains post-crop annotation paper location',
    );
    approx(
      item.transform[5],
      inspected.pages[i].height * (0.15 + 0.5 * 0.8) + 7.18,
      'Reset crop retains annotation vertical location',
    );
  }
});

await test('crop margins as stored for each rotation; invalid and empty crops are refused', async () => {
  assert.deepEqual(cropMarginsForRotation(margins, 90), { left: 0.05, top: 0.1, right: 0.15, bottom: 0.2 });
  assert.deepEqual(cropMarginsForRotation(margins, 180), { left: 0.2, top: 0.05, right: 0.1, bottom: 0.15 });
  assert.deepEqual(cropMarginsForRotation(margins, 270), { left: 0.15, top: 0.2, right: 0.05, bottom: 0.1 });
  assert.deepEqual(cropMarginsForRotation(null, 90), { left: 0, top: 0, right: 0, bottom: 0 });
  for (const crop of [
    { left: -25 },
    { top: NaN },
    { right: Infinity },
    { left: 0.8, right: 0.2 },
    { top: 0.6, bottom: 0.5 },
    { bottom: 1 },
  ]) {
    await assert.rejects(
      buildPdf({ sources: cropState.sources, pages: [{ id: 'p', sourceId: 'a', index: 0, crop }] }),
      /Crop margins/,
    );
  }
  await assert.rejects(
    buildPdf({
      sources: cropState.sources,
      pages: [{ id: 'p', sourceId: 'a', index: 0, crop: { left: 0.999 } }],
    }),
    /at least 1 PDF point/,
  );
});

// Added margins (negative crop margins, with the area that shows content in
// crop.content): the page grows, nothing on it moves, the margins are blank even
// where the PDF has content there, and repeated settings go to the new edges.
/** Pixels of the first page, drawn by PDF.js at 72 dpi, that pass `test(red, green, blue)`. */
async function countPixels(data, test) {
  const doc = await pdfjs.getDocument({
    data: data.slice(),
    verbosity: 0,
    standardFontDataUrl: path.join(runtime, 'pdfjs-dist/standard_fonts/'),
  }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const surface = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvasContext: surface.getContext('2d'), viewport, canvas: surface }).promise;
  const { data: pixels } = surface.getContext('2d').getImageData(0, 0, surface.width, surface.height);
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4)
    if (pixels[index + 3] > 128 && test(pixels[index], pixels[index + 1], pixels[index + 2])) count++;
  await doc.loadingTask.destroy();
  return count;
}
const redPixels = (data) => countPixels(data, (red, green, blue) => red > 200 && green < 80 && blue < 80);
const bluePixels = (data) => countPixels(data, (red, green, blue) => blue > 200 && red < 80 && green < 80);
let hiddenRight;
await test('added margins: the page grows, content stays put and the margins are blank', async () => {
  // A 400 × 300 page whose CropBox hides its right 100 points, where a red square is; a blue
  // square at 250–290 is inside the CropBox.
  const redSquarePage = async (hidden) => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([400, 300]);
    page.drawText('INSIDE', { x: 40, y: 150, size: 16 });
    page.drawRectangle({ x: 320, y: 100, width: 60, height: 100, color: rgb(1, 0, 0) });
    page.drawRectangle({ x: 250, y: 100, width: 40, height: 100, color: rgb(0, 0, 1) });
    if (hidden) page.setCropBox(0, 0, 300, 300);
    return pdf.save();
  };
  hiddenRight = await redSquarePage(true);
  assert.ok(
    (await redPixels(await redSquarePage(false))) > 5000,
    'the red square shows where it is not hidden (the check below can see it)',
  );
  assert.ok((await bluePixels(hiddenRight)) > 3000, 'the blue square shows inside the CropBox');
  assert.equal(
    await redPixels(
      await buildPdf({
        sources: [{ id: 'h', bytes: hiddenRight }],
        pages: [{ id: 'h', sourceId: 'h', index: 0, crop: { right: -1 / 3, rotation: 0 } }],
      }),
    ),
    0,
    'a page grown past its visible box shows nothing new, even without crop.content',
  );
  const widened = await buildPdf({
    sources: [{ id: 'h', bytes: hiddenRight }],
    // 30 points on the left and 60 on the right of the 300-point visible page.
    pages: [
      {
        id: 'h',
        sourceId: 'h',
        index: 0,
        crop: {
          left: -0.1,
          right: -0.2,
          top: 0,
          bottom: 0,
          rotation: 0,
          content: { left: 0, right: 0, top: 0, bottom: 0 },
        },
      },
    ],
    annotations: [{ type: 'text', pageId: 'h', text: 'Placed before', x: 0.5, y: 0.5, fontSize: 12 }],
    pageNumbers: { format: 'N{page}', position: 'bottom-right', margin: 10, size: 10 },
  });
  {
    const [page] = await extract(widened);
    approx(page.width, 390, 'The page grows by its margins');
    approx(page.height, 300, 'and only where they were added');
    approx(
      page.items.find((item) => item.text === 'INSIDE').transform[4],
      70,
      'Its content stays put on the paper, now 30 points from the edge',
    );
    approx(
      page.items.find((item) => item.text === 'Placed before').transform[4],
      30 + 150,
      'An item placed before the margins stays on its content',
    );
    assert.ok(
      page.items.find((item) => item.text === 'N1').transform[4] > 360,
      'Page numbers go to the new edge',
    );
    const doc = await PDFDocument.load(widened);
    const [media, crop] = [doc.getPage(0).getMediaBox(), doc.getPage(0).getCropBox()];
    assert.ok(
      media.x <= crop.x && media.x + media.width >= crop.x + crop.width,
      'The MediaBox holds the page',
    );
  }
  assert.equal(await redPixels(widened), 0, 'The margins are blank: what the PDF hid there stays hidden');
});

await test('added margins after a crop: what the crop hid stays hidden', async () => {
  // Margins after a crop: the crop's edge is the edge of the content, and what the crop hid stays hidden.
  const croppedThenWidened = await buildPdf({
    sources: [{ id: 'h', bytes: hiddenRight }],
    pages: [
      {
        id: 'h',
        sourceId: 'h',
        index: 0,
        crop: { left: 0, right: -0.1, rotation: 0, content: { left: 0, right: 0.2, top: 0, bottom: 0 } },
      },
    ],
  });
  approx(
    (await extract(croppedThenWidened))[0].width,
    330,
    'Cropped by 60 points, then 90 added: 330 points wide',
  );
  assert.equal(await redPixels(croppedThenWidened), 0, 'Content the CropBox hid does not show in the margin');
  assert.equal(
    await bluePixels(croppedThenWidened),
    0,
    'Content the crop hid (inside the CropBox) does not show in the margin either',
  );
});

await test('added margins with fields kept or flattened: the page number in the margin shows', async () => {
  // Fields flattened on download: pdf-lib then draws into a stream it keeps on the page, which
  // the clip must not swallow, or page numbers and edits in the margins would vanish.
  const formPageBytes = await (async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([400, 300]);
    page.drawText('FORM', { x: 40, y: 150, size: 16 });
    pdf.getForm().createTextField('name').addToPage(page, { x: 40, y: 40, width: 200, height: 24 });
    return pdf.save();
  })();
  for (const flattenForms of [false, true]) {
    const numbered = await buildPdf({
      sources: [{ id: 'f', bytes: formPageBytes }],
      pages: [
        {
          id: 'f',
          sourceId: 'f',
          index: 0,
          crop: {
            left: 0,
            right: -0.5,
            top: 0,
            bottom: 0,
            rotation: 0,
            content: { left: 0, right: 0, top: 0, bottom: 0 },
          },
        },
      ],
      flattenForms,
      pageNumbers: { format: 'N{page}', position: 'bottom-right', margin: 10, size: 40, color: '#ff0000' },
    });
    approx((await extract(numbered))[0].width, 600, 'The page grows by its margin');
    assert.ok(
      (await redPixels(numbered)) > 100,
      `The page number in the margin shows (fields ${flattenForms ? 'flattened' : 'kept'})`,
    );
  }
});

await test('added margins keep their size when a picture page is laid out again', async () => {
  // Margins keep their size in points when a picture page is laid out again (rescaledMargins);
  // crops and the content area stay fractions.
  {
    const typed = {
      left: 0,
      right: -0.1,
      top: 0.2,
      bottom: 0,
      rotation: 0,
      content: { left: 0, right: 0, top: 0.2, bottom: 0 },
    };
    const wider = rescaledMargins(typed, { width: 600, height: 300 }, { width: 840, height: 600 });
    approx(wider.right, -60 / 840, 'A 60-point margin stays 60 points on the wider page');
    assert.equal(wider.top, 0.2, 'A crop stays a fraction');
    assert.deepEqual(wider.content, typed.content);
    const turned = rescaledMargins(
      { ...typed, rotation: 90, content: { ...typed.content } },
      { width: 600, height: 300 },
      { width: 840, height: 600 },
    );
    approx(turned.right, -30 / 600, 'Turned 90°, the margin follows the page’s height');
    assert.equal(
      rescaledMargins({ left: 0.1, rotation: 0 }, { width: 1, height: 1 }, { width: 2, height: 2 }).left,
      0.1,
      'Without added margins, nothing changes',
    );
  }
});

await test('added margins turn with the page', async () => {
  // Turned after the margins were added: the margins turn with the page.
  {
    const [page] = await extract(
      await buildPdf({
        sources: [{ id: 'h', bytes: hiddenRight }],
        pages: [
          {
            id: 'h',
            sourceId: 'h',
            index: 0,
            rotation: 90,
            crop: { left: -0.1, right: -0.2, rotation: 0, content: { left: 0, right: 0, top: 0, bottom: 0 } },
          },
        ],
      }),
    );
    approx(page.width, 300, 'Turned: 300 wide');
    approx(page.height, 390, 'and 390 high');
  }
});

// PDF/A: a declared PDF/A file exports unchanged (PDF/A-1 forbids object
// streams), keeps its declaration while only pages change, and stops claiming
// PDF/A once content is added, keeping the rest of its metadata.
async function pdfaFixture(part, conformance, attributeForm) {
  const pdf = await PDFDocument.create();
  pdf.addPage([400, 300]).drawText('Archived page', {
    x: 40,
    y: 200,
    size: 18,
    font: await pdf.embedFont(StandardFonts.Helvetica),
  });
  const id = attributeForm
    ? `<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" pdfaid:part="${part}" pdfaid:conformance="${conformance}"/>`
    : `<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>${part}</pdfaid:part><pdfaid:conformance>${conformance}</pdfaid:conformance></rdf:Description>`;
  const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">Archiv für Berichte</rdf:li></rdf:Alt></dc:title></rdf:Description>${id}</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  const { PDFName } = globalThis.PDFLib;
  pdf.catalog.set(
    PDFName.of('Metadata'),
    pdf.context.register(
      pdf.context.stream(new TextEncoder().encode(xmp), { Type: 'Metadata', Subtype: 'XML' }),
    ),
  );
  return pdf.save({ useObjectStreams: false });
}
function metadataOf(bytes) {
  const { PDFName } = globalThis.PDFLib;
  return PDFDocument.load(bytes).then((pdf) =>
    new TextDecoder().decode(
      globalThis.PDFLib.decodePDFRawStream(pdf.catalog.lookup(PDFName.of('Metadata'))).decode(),
    ),
  );
}
await test('PDF/A: exported unchanged; the declaration is kept, or dropped with a note', async () => {
  for (const [part, conformance, attributeForm] of [
    [1, 'B', false],
    [1, 'A', false],
    [2, 'B', true],
  ]) {
    const label = `PDF/A-${part}${conformance.toLowerCase()}`;
    const bytes = await pdfaFixture(part, conformance, attributeForm);
    assert.equal((await inspectPdf(bytes)).pdfa, part, `${label} is detected`);
    const one = { sources: [{ id: 'a', bytes }], pages: [{ id: 'p', sourceId: 'a', index: 0 }] };
    const unchanged = await buildPdfWithNotes(one);
    assert.deepEqual(unchanged.notes, [], `${label}: nothing to report for an unchanged export`);
    assert.match(
      await metadataOf(unchanged.bytes),
      /pdfaid:part/,
      `${label}: an unchanged export still declares PDF/A`,
    );
    assert.equal(
      Buffer.from(unchanged.bytes).includes('/ObjStm'),
      part !== 1,
      `${label}: object streams ${part === 1 ? 'are not' : 'may be'} used`,
    );
    const turned = await buildPdfWithNotes({
      ...one,
      pages: [{ id: 'p', sourceId: 'a', index: 0, rotation: 90 }],
    });
    assert.deepEqual(turned.notes, [], `${label}: turning a page keeps PDF/A`);
    const edited = await buildPdfWithNotes({ ...one, watermark: { text: 'DRAFT', pages: 'all' } });
    assert.deepEqual(edited.notes, ['pdfa-removed'], `${label}: added content is reported`);
    const metadata = await metadataOf(edited.bytes);
    assert.doesNotMatch(metadata, /pdfaid:(part|conformance)/, `${label}: the PDF/A declaration is removed`);
    assert.match(metadata, /Archiv für Berichte/, `${label}: the rest of the metadata is kept`);
    assert.equal((await inspectPdf(edited.bytes)).pdfa, null);
    assert.ok((await extract(edited.bytes))[0].items.some((item) => item.text === 'DRAFT'));
  }
});

await test('document properties: read on opening; set, removed or cleaned on export', async () => {
  // Document properties: read when a PDF opens; set, removed or cleaned on export.
  // Changed properties remove the XMP copy of the details, which PDF.js prefers.
  {
    const { PDFName } = globalThis.PDFLib;
    const withInfo = await PDFDocument.load(await pdfaFixture(2, 'B', true));
    withInfo.setTitle('Archiv für Berichte');
    withInfo.setAuthor('A. Author');
    withInfo.setSubject('Reports');
    withInfo.setKeywords(['archive, 2026']);
    withInfo.setCreator('Writer 7');
    withInfo.setLanguage('de-DE');
    // Something the file no longer refers to, which pdf-lib would still write out.
    withInfo.context.register(withInfo.context.stream(new TextEncoder().encode('LEFTOVER-SECRET'), {}));
    const bytes = await withInfo.save();
    // Every object in a file, linked or not, as text (streams decoded).
    const everything = async (pdfBytes) => {
      const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
      const { PDFRawStream, decodePDFRawStream } = globalThis.PDFLib;
      return pdf.context
        .enumerateIndirectObjects()
        .map(([, object]) =>
          object instanceof PDFRawStream
            ? new TextDecoder().decode(decodePDFRawStream(object).decode())
            : object.toString(),
        )
        .join('\n');
    };
    assert.match(await everything(bytes), /LEFTOVER-SECRET/);
    const opened = await openPdf(bytes);
    assert.deepEqual(
      { ...opened.details, producer: '', created: '' },
      {
        title: 'Archiv für Berichte',
        author: 'A. Author',
        subject: 'Reports',
        keywords: 'archive, 2026',
        language: 'de-DE',
        creator: 'Writer 7',
        producer: '',
        created: '',
      },
    );
    assert.match(opened.details.created, /^\d{4}-\d\d-\d\dT/, 'the creation date');
    const one = { sources: [{ id: 'a', bytes }], pages: [{ id: 'p', sourceId: 'a', index: 0 }] };
    const edited = await buildPdfWithNotes({
      ...one,
      properties: {
        title: 'Annual report',
        author: '',
        subject: 'Reports',
        keywords: 'archive, 2026',
        language: 'de-DE',
      },
    });
    assert.deepEqual(edited.notes, ['pdfa-removed-properties'], 'a PDF/A file stops claiming PDF/A');
    const doc = await PDFDocument.load(edited.bytes, { updateMetadata: false });
    assert.equal(doc.getTitle(), 'Annual report');
    assert.equal(doc.getAuthor(), undefined, 'an emptied property is removed');
    assert.equal(doc.getCreator(), 'Writer 7', 'other details stay');
    assert.equal(doc.catalog.get(PDFName.of('Metadata')), undefined, 'the XMP copy is removed');
    assert.doesNotMatch(
      await everything(edited.bytes),
      /x:xmpmeta/,
      'the XMP stream itself, not only its link',
    );
    const read = await pdfjs.getDocument({ data: edited.bytes.slice(), verbosity: 0 }).promise;
    const { info, metadata } = await read.getMetadata();
    assert.deepEqual([info.Title, metadata], ['Annual report', null], 'PDF.js shows the new title');
    await read.loadingTask.destroy();
    // Remove all: no details at all; the language stays, for screen readers.
    const cleanedBytes = await buildPdf({
      ...one,
      properties: { title: '', author: '', subject: '', keywords: '', language: 'de-DE', clean: true },
    });
    const cleaned = await PDFDocument.load(cleanedBytes, { updateMetadata: false });
    const left = await everything(cleanedBytes);
    for (const detail of ['Archiv für Berichte', 'x:xmpmeta', 'LEFTOVER-SECRET', 'Writer 7'])
      assert.ok(!left.includes(detail), `Remove all leaves nothing of ${detail} in the file`);
    assert.deepEqual(cleaned.getInfoDict().keys(), [], 'no document information left');
    assert.equal(cleaned.getLanguage(), 'de-DE');
    // Combined with another PDF (pages copied into a new one): the properties set win.
    const other = await PDFDocument.create();
    other.addPage([100, 100]);
    const merged = await PDFDocument.load(
      await buildPdf({
        sources: [...one.sources, { id: 'b', bytes: await other.save() }],
        pages: [...one.pages, { id: 'q', sourceId: 'b', index: 0 }],
        properties: { title: 'Combined', author: 'B. Author', subject: '', keywords: '', language: 'en' },
      }),
      { updateMetadata: false },
    );
    assert.deepEqual(
      [merged.getTitle(), merged.getAuthor(), merged.getSubject(), merged.getLanguage()],
      ['Combined', 'B. Author', undefined, 'en'],
    );
    // Unchanged properties: the PDF keeps its own details, XMP included.
    assert.ok(
      (await PDFDocument.load((await buildPdfWithNotes(one)).bytes)).catalog.get(PDFName.of('Metadata')),
    );
  }
});

await test('drawings: vector paths with round ends, as the preview draws them', async () => {
  // Drawings: vector paths with round ends and corners, from the same path data as
  // the preview (drawingPath), so they stay sharp and land where the preview shows them.
  {
    const { PDFName, PDFArray, decodePDFRawStream } = globalThis.PDFLib;
    const blank = await PDFDocument.create();
    blank.addPage([400, 300]);
    const one = {
      sources: [{ id: 's', bytes: await blank.save() }],
      pages: [{ id: 'p', sourceId: 's', index: 0 }],
    };
    const drawn = await PDFDocument.load(
      await buildPdf({
        ...one,
        annotations: [
          {
            id: 'r',
            type: 'drawing',
            shape: 'rect',
            pageId: 'p',
            pageRotation: 0,
            x: 0.25,
            y: 0.5,
            width: 0.5,
            height: 0.25,
            color: '#d0342c',
            strokeWidth: 4,
          },
          {
            id: 'a',
            type: 'drawing',
            shape: 'arrow',
            pageId: 'p',
            pageRotation: 0,
            x: 0.1,
            y: 0.1,
            width: 0.3,
            height: 0.2,
            points: [
              [0, 1],
              [1, 0],
            ],
            color: '#2255cc',
            strokeWidth: 2,
          },
        ],
      }),
    );
    const contents = drawn.getPage(0).node.lookup(PDFName.of('Contents'));
    const streams =
      contents instanceof PDFArray ? contents.asArray().map((ref) => drawn.context.lookup(ref)) : [contents];
    const content = streams
      .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode()))
      .join('\n');
    assert.match(content, /0\.81\d* 0\.20\d* 0\.17\d* RG/, 'the rectangle’s colour');
    assert.match(content, /\b1 j\b/, 'round corners');
    assert.match(content, /\b1 J\b/, 'round ends');
    // The rectangle's corners, in its frame from the top left (the export flips it, as drawSvgPath does).
    assert.match(
      content,
      /100 150 m\s+300 150 l\s+300 225 l\s+100 225 l/,
      'the rectangle where the preview draws it',
    );
    assert.equal((await extract(await drawn.save()))[0].items.length, 0, 'no text: lines and curves only');
    assert.equal(
      drawn.getPage(0).node.Resources().lookup(PDFName.of('XObject'))?.entries().length ?? 0,
      0,
      'no pictures',
    );
  }
});

// Passwords. The fixtures were encrypted by pypdf (scripts/make-encrypted-fixtures.py),
// not by the library under test; each has two pages, "Secret page 1" and "Secret page 2".
const fixturePath = (name) => path.join(outputDir, '../fixtures', name);
const textOf = async (bytes, password) =>
  (await extract(bytes, password)).map((page) => page.items.map((item) => item.text).join(' '));
const { PDFDict, PDFName } = globalThis.PDFLib;
/** Whether the file still holds an encryption dictionary, used or not. */
async function hasEncryptionDictionary(bytes) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.context
    .enumerateIndirectObjects()
    .some(
      ([, object]) =>
        object instanceof PDFDict && object.get(PDFName.of('Filter')) === PDFName.of('Standard'),
    );
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
let ownerOnly;
await test('an owner password only restricts changes: the PDF opens without asking', async () => {
  // An owner password only restricts changes: the PDF opens without asking.
  ownerOnly = new Uint8Array(await readFile(fixturePath('owner-only-aes256.pdf')));
  assert.equal((await inspectPdf(ownerOnly)).encrypted, true);
  const ownerOpened = await openPdf(ownerOnly);
  assert.equal(ownerOpened.protection, 'owner');
  assert.equal(ownerOpened.pageCount, 2);
  assert.equal(
    (await PDFDocument.load(ownerOpened.bytes)).isEncrypted,
    false,
    'the copy to edit is not encrypted',
  );
  assert.equal(
    await hasEncryptionDictionary(ownerOpened.bytes),
    false,
    'the unlocked copy carries no password hashes',
  );
  assert.deepEqual(await textOf(ownerOpened.bytes), ['Secret page 1', 'Secret page 2']);
  assert.equal(
    (await PDFDocument.load(ownerOpened.bytes)).getTitle(),
    'Locked report',
    'encrypted strings are decrypted',
  );
});

await test('batch processing passes encrypted bytes straight to the build', async () => {
  // Batch processing passes encrypted bytes straight to the build.
  const ownerBuilt = await buildPdf({
    sources: [{ id: 'o', bytes: ownerOnly }],
    pages: [
      { id: 'o1', sourceId: 'o', index: 0 },
      { id: 'o2', sourceId: 'o', index: 1 },
    ],
    pageNumbers: { format: 'No. {page}', pages: 'all' },
  });
  assert.equal(await hasEncryptionDictionary(ownerBuilt), false);
  assert.deepEqual(await textOf(ownerBuilt), ['Secret page 1 No. 1', 'Secret page 2 No. 2']);
});

await test('a password to open: required, refused when wrong, accepted when right (AES-128, RC4, AES-256)', async () => {
  // A password to open: required, refused when wrong, accepted when right (the
  // owner password works too). AES-128, RC4 and AES-256 with a Unicode password.
  for (const [name, password, ownerPassword] of [
    ['password-aes128.pdf', 'open sesame', 'owner secret'],
    ['password-rc4.pdf', 'open sesame', 'owner secret'],
    ['password-aes256-unicode.pdf', 'Grüße 密码', null],
  ]) {
    const bytes = new Uint8Array(await readFile(fixturePath(name)));
    await assert.rejects(
      openPdf(bytes),
      (error) => error.code === 'password-required' && /password-protected/.test(error.message),
      `${name}: needs a password`,
    );
    await assert.rejects(
      openPdf(bytes, { password: 'not it' }),
      (error) => error.code === 'password-incorrect',
      `${name}: a wrong password is refused`,
    );
    await assert.rejects(inspectPdf(bytes), (error) => error.code === 'password-required');
    const opened = await openPdf(bytes, { password });
    assert.equal(opened.protection, 'password', name);
    assert.equal(
      await hasEncryptionDictionary(opened.bytes),
      false,
      `${name}: no password hashes in the copy`,
    );
    assert.deepEqual(
      await textOf(opened.bytes),
      ['Secret page 1', 'Secret page 2'],
      `${name}: decrypted text`,
    );
    assert.equal(
      (await PDFDocument.load(opened.bytes)).getTitle(),
      'Locked report',
      `${name}: decrypted title`,
    );
    if (ownerPassword)
      assert.equal(
        (await openPdf(bytes, { password: ownerPassword })).pageCount,
        2,
        `${name}: the owner password opens it`,
      );
  }
  await assert.rejects(
    inspectPdf(new Uint8Array(await readFile(fixturePath('encrypted.pdf')))),
    (error) => error.code === 'password-required',
  );
  const plainOpened = await openPdf(fixtureBytes);
  assert.equal(plainOpened.protection, null);
  assert.equal(plainOpened.bytes, fixtureBytes, 'an unencrypted PDF is used as it is');
});

const one = (bytes) => ({ sources: [{ id: 's', bytes }], pages: [{ id: 's1', sourceId: 's', index: 0 }] });
let stringsBytes;
await test('protecting a download: AES-256, read by pdf.js with the password; strings and link targets encrypted', async () => {
  // Protecting the download: AES-256, needing the password in another reader
  // (pdf.js), with the document's strings intact. The library alone left strings
  // outside object streams unencrypted, so the language read back as garbage.
  const stringsDoc = await PDFDocument.create();
  stringsDoc.addPage([300, 200]).drawText('Protected page', {
    x: 40,
    y: 100,
    size: 18,
    font: await stringsDoc.embedFont(StandardFonts.Helvetica),
  });
  stringsDoc.setTitle('Quarterly figures');
  stringsDoc.setLanguage('de-DE');
  const link = stringsDoc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [40, 40, 200, 60],
    Border: [0, 0, 0],
    A: { S: 'URI', URI: globalThis.PDFLib.PDFString.of('https://example.com/report') },
  });
  stringsDoc
    .getPage(0)
    .node.set(PDFName.of('Annots'), stringsDoc.context.obj([stringsDoc.context.register(link)]));
  stringsBytes = await stringsDoc.save();
  const protectedBuild = await buildPdfWithNotes({
    ...one(stringsBytes),
    watermark: { text: 'DRAFT', pages: 'all' },
    protection: { enabled: true, password: 'Grüße 1' },
  });
  assert.deepEqual(protectedBuild.notes, []);
  assert.equal(await pdfjsRefusal(protectedBuild.bytes), 1, 'pdf.js asks for the password');
  assert.equal(await pdfjsRefusal(protectedBuild.bytes, 'wrong'), 2, 'pdf.js refuses a wrong password');
  assert.deepEqual(await textOf(protectedBuild.bytes, 'Grüße 1'), ['Protected page DRAFT']);
  {
    const doc = await pdfjs.getDocument({
      data: protectedBuild.bytes.slice(),
      password: 'Grüße 1',
      verbosity: 0,
    }).promise;
    const { info } = await doc.getMetadata();
    assert.equal(info.Title, 'Quarterly figures', 'the title decrypts');
    assert.equal(
      info.Language,
      'de-DE',
      'the language, stored on the catalog outside object streams, decrypts',
    );
    assert.deepEqual(
      (await (await doc.getPage(1)).getAnnotations()).map((annotation) => annotation.url),
      ['https://example.com/report'],
      'link targets decrypt',
    );
    await doc.loadingTask.destroy();
  }
  const reopened = await openPdf(protectedBuild.bytes, { password: 'Grüße 1' });
  assert.equal(reopened.protection, 'password', 'QFT PDF reopens its own protected files');
  await assert.rejects(openPdf(protectedBuild.bytes), (error) => error.code === 'password-required');
});

await test('passwords are prepared as PDF 2.0 asks (SASLprep)', async () => {
  // Passwords are prepared as PDF 2.0 asks (SASLprep, NFKC): full-width characters match their plain form.
  const fullWidth = await buildPdf({
    ...one(stringsBytes),
    protection: { enabled: true, password: 'ｐａｓｓ１' },
  });
  assert.equal(await pdfjsRefusal(fullWidth, 'pass1'), null, 'the prepared password opens it in pdf.js');
  assert.equal(
    (await openPdf(fullWidth, { password: 'ｐａｓｓ１' })).pageCount,
    1,
    'and as typed in QFT PDF',
  );
});

await test('protection that is off, or a password that cannot be used', async () => {
  // Protection that is off, or a password that can't be used.
  assert.equal(
    (
      await PDFDocument.load(
        await buildPdf({ ...one(stringsBytes), protection: { enabled: false, password: '' } }),
      )
    ).isEncrypted,
    false,
  );
  await assert.rejects(
    buildPdf({ ...one(stringsBytes), protection: { enabled: true, password: '' } }),
    /Enter a password/,
  );
  await assert.rejects(
    buildPdf({ ...one(stringsBytes), protection: { enabled: true, password: 'tab\there' } }),
    /control characters/,
  );
  await assert.rejects(
    buildPdf({ ...one(stringsBytes), protection: { enabled: true, password: '密'.repeat(43) } }),
    /too long/,
  );
});

await test('a protected PDF/A copy stops claiming PDF/A', async () => {
  // PDF/A forbids encryption: a protected copy stops claiming PDF/A.
  {
    const bytes = await pdfaFixture(2, 'B', false);
    const protectedOnly = await buildPdfWithNotes({
      ...one(bytes),
      protection: { enabled: true, password: 'archive' },
    });
    assert.deepEqual(protectedOnly.notes, ['pdfa-removed-password']);
    const unlocked = await openPdf(protectedOnly.bytes, { password: 'archive' });
    assert.equal(unlocked.pdfa, null, 'the protected copy no longer declares PDF/A');
    assert.match(await metadataOf(unlocked.bytes), /Archiv für Berichte/, 'the rest of the metadata is kept');
    const both = await buildPdfWithNotes({
      ...one(bytes),
      watermark: { text: 'DRAFT', pages: 'all' },
      protection: { enabled: true, password: 'archive' },
    });
    assert.deepEqual(both.notes, ['pdfa-removed', 'pdfa-removed-password']);
    const pdfa1 = await buildPdfWithNotes({
      ...one(await pdfaFixture(1, 'B', false)),
      protection: { enabled: true, password: 'archive' },
    });
    assert.deepEqual(
      await textOf(pdfa1.bytes, 'archive'),
      ['Archived page'],
      'a protected PDF/A-1 file opens with its password',
    );
  }
});

await test('form fields survive an in-place export, and are refused when pages are combined', async () => {
  const formDoc = await PDFDocument.create();
  const formPage = formDoc.addPage();
  const field = formDoc.getForm().createTextField('name');
  field.setText('Preserved field value');
  field.addToPage(formPage, { x: 50, y: 100, width: 220, height: 30 });
  const formBytes = await formDoc.save();
  const formOutput = await buildPdf({
    sources: [{ id: 'form', bytes: formBytes }],
    pages: [{ id: 'f1', sourceId: 'form', index: 0 }],
    headerFooter: { footerCenter: 'With form' },
  });
  assert.equal(
    (await PDFDocument.load(formOutput)).getForm().getTextField('name').getText(),
    'Preserved field value',
  );
  await assert.rejects(
    buildPdf({
      sources: [
        { id: 'form', bytes: formBytes },
        { id: 'a', bytes: fixtureBytes },
      ],
      pages: [
        { id: 'f1', sourceId: 'form', index: 0 },
        { id: 'a1', sourceId: 'a', index: 0 },
      ],
    }),
    /form fields can only be combined/,
  );
});

await test('invalid input: not a PDF, no pages, a page that does not exist, a character no font has', async () => {
  await assert.rejects(inspectPdf(new Uint8Array([1, 2, 3])), /could not be opened/);
  await assert.rejects(
    inspectPdf(new TextEncoder().encode('%PDF-1.7 broken')),
    /could not be opened/,
    'A header without a page tree is not a PDF',
  );
  await assert.rejects(buildPdf({ sources: [], pages: [] }), /at least one page/);
  await assert.rejects(
    buildPdf({ sources: [{ id: 'a', bytes: fixtureBytes }], pages: [{ id: 'x', sourceId: 'a', index: 9 }] }),
    /does not exist/,
  );
  await assert.rejects(
    buildPdf({
      sources: [{ id: 'a', bytes: fixtureBytes }],
      pages: [{ id: 'x', sourceId: 'a', index: 0 }],
      annotations: [{ pageId: 'x', type: 'text', text: '🦄' }],
    }),
    /cannot display/,
  );
});

await test('page ranges: parsed; refused when out of range or malformed', async () => {
  assert.deepEqual(parsePageRange('1-3, 2, 4', 4), [0, 1, 2, 3]);
  assert.deepEqual(parsePageRange('', 2), [0, 1]);
  assert.throws(() => parsePageRange('0, 1', 4), /between/);
  assert.throws(() => parsePageRange('3-1', 4), /between/);
  assert.throws(() => parsePageRange('one', 4), /Use page numbers/);
});

await test('tagged PDFs: repeated content is marked as artifacts; untagged additions are noted', async () => {
  // A tagged PDF (a structure tree, which screen readers follow): page numbers,
  // headers, footers and the watermark are each marked as a pagination artifact
  // of their kind, which readers skip; the added text is not, and the notes say
  // so. An untagged PDF gets neither.
  {
    const { PDFName, decodePDFRawStream } = globalThis.PDFLib;
    const contentOf = async (bytes) => {
      const doc = await PDFDocument.load(bytes);
      const page = doc.getPage(0);
      return page.node
        .Contents()
        .asArray()
        .map((ref) => Buffer.from(decodePDFRawStream(doc.context.lookup(ref)).decode()).toString('latin1'))
        .join('\n');
    };
    const source = async (tagged) => {
      const doc = await PDFDocument.create();
      doc.addPage([400, 500]).drawText('Body text', {
        x: 40,
        y: 400,
        size: 14,
        font: await doc.embedFont(StandardFonts.Helvetica),
      });
      if (tagged) {
        doc.catalog.set(PDFName.of('MarkInfo'), doc.context.obj({ Marked: true }));
        doc.catalog.set(PDFName.of('StructTreeRoot'), doc.context.obj({ Type: 'StructTreeRoot' }));
      }
      return doc.save();
    };
    const build = async (tagged) =>
      buildPdfWithNotes({
        sources: [{ id: 't', bytes: await source(tagged) }],
        pages: [{ id: 'p', sourceId: 't', index: 0 }],
        annotations: [
          { type: 'text', pageId: 'p', text: 'Added note', x: 0.1, y: 0.2, width: 0.6, fontSize: 12 },
        ],
        watermark: { text: 'DRAFT', angle: 0, opacity: 0.16, size: 36 },
        headerFooter: { headerLeft: 'Head', footerRight: 'Foot {page}', margin: 24, size: 8 },
        pageNumbers: { format: 'Page {page} of {total}', position: 'bottom-right', margin: 24, size: 8 },
      });
    const tagged = await build(true);
    const content = await contentOf(tagged.bytes);
    const spans = [
      ...content.matchAll(
        /\/Artifact <<\s*\/Type \/Pagination\s*\/Subtype \/(\w+)\s*>> BDC\n([\s\S]*?)\nEMC/g,
      ),
    ];
    assert.deepEqual(
      spans.map((span) => span[1]).sort(),
      ['Footer', 'Header', 'PageNum', 'Watermark'],
      'each repeated item is a pagination artifact of its kind',
    );
    for (const span of spans)
      assert.equal(
        (span[2].match(/\bT[Jj]\b/g) || []).length,
        1,
        `the ${span[1]} artifact holds one text run`,
      );
    // Outside the artifacts: the page's own text and the note that was added.
    const outside = spans.reduce((text, span) => text.replace(span[0], ''), content);
    assert.equal(
      (outside.match(/\bT[Jj]\b/g) || []).length,
      2,
      'the page’s text and the added text are outside the artifacts',
    );
    assert.ok(tagged.notes.includes('additions-untagged'), 'the notes say what was added is untagged');
    const plain = await build(false);
    assert.ok(!/BDC|EMC/.test(await contentOf(plain.bytes)), 'an untagged PDF gets no artifacts');
    assert.ok(!plain.notes.includes('additions-untagged'), 'and no note about tags');
  }
});
