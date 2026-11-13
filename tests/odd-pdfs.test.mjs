// Every engine operation over every file of the odd-PDF catalogue
// (tests/odd-pdfs.mjs), each download read back with PDF.js, and with pdf-lib
// for what PDF.js does not show. The files are odd in the ways that broke the
// engine before (pages that share their resources, pages that inherit from the
// page tree) and in the others real PDFs are, so a pdf-lib update that changes
// how they come out fails here first.
//
// One suite per operation, with a test per file:
//   node --test --test-name-pattern=reorder tests/odd-pdfs.test.mjs
//   node --test --test-name-pattern=kids-twice tests/odd-pdfs.test.mjs
// To add an operation, add an entry to OPERATIONS: see the comment above it.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { describe, test } from 'node:test';
import { catalogue } from './odd-pdfs.mjs';

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
const { buildPdfWithNotes, openPdf, pagesPerSheet } = await import('../dist/pdf-engine.js');
const { splitPdf } = await import('../dist/workflows.js');
const pdfjs = await import(pathToFileURL(path.join(runtime, 'pdfjs-dist/legacy/build/pdf.mjs')));
const { PDFDocument, PDFDict, PDFName } = globalThis.PDFLib;

// ---- Reading -----------------------------------------------------------------------------

/** Text without its spaces, as readers split and join it differently. */
const squash = (text) => text.replace(/\s+/g, '');
/** Whether `text` is in `shown`, and not as part of a longer number: SP-1 is not in SP-10. */
function shows(shown, text) {
  const words = squash(text);
  const pattern = words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const before = /^[0-9]/.test(words) ? '(?<![0-9])' : '',
    after = /[0-9]$/.test(words) ? '(?![0-9])' : '';
  return new RegExp(before + pattern + after).test(shown);
}

/** A download as PDF.js reads it: each page's text, fonts, size, turn, links and notes; the outline, labels, title and fields. */
async function read(bytes, password) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), password, verbosity: 0 }).promise;
  try {
    const target = async (dest) => {
      const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
      return explicit ? doc.getPageIndex(explicit[0]) : null;
    };
    const pages = [];
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      const content = await page.getTextContent();
      const items = content.items.filter((item) => item.str.trim());
      const annotations = await page.getAnnotations();
      pages.push({
        text: squash(items.map((item) => item.str).join('')),
        families: new Map(items.map((item) => [squash(item.str), content.styles[item.fontName].fontFamily])),
        width: page.view[2] - page.view[0],
        height: page.view[3] - page.view[1],
        rotate: page.rotate,
        unit: page.userUnit,
        links: await Promise.all(
          annotations.filter((item) => item.subtype === 'Link').map((item) => target(item.dest)),
        ),
        notes: annotations.filter((item) => item.subtype === 'Text').length,
      });
    }
    const outline = await Promise.all(
      ((await doc.getOutline()) || []).map(async (item) => ({
        title: item.title,
        page: await target(item.dest),
      })),
    );
    // Each field's values, from its widgets (a field's own entry, without a widget, has none).
    const fields = Object.fromEntries(
      [...((await doc.getFieldObjects()) ?? [])].map(([name, objects]) => [
        name,
        [...new Set(objects.filter((item) => item.value !== undefined).map((item) => item.value))],
      ]),
    );
    return {
      pages,
      outline,
      labels: await doc.getPageLabels(),
      title: (await doc.getMetadata()).info.Title,
      fields,
    };
  } finally {
    await doc.loadingTask.destroy();
  }
}

/** How PDF.js refuses a file: 1 when it needs a password, 2 when the password is wrong; null when it opens. */
async function refusal(bytes, password) {
  const task = pdfjs.getDocument({ data: bytes.slice(), password, verbosity: 0 });
  try {
    await task.promise;
    return null;
  } catch (error) {
    return error.name === 'PasswordException' ? error.code : error.message;
  } finally {
    await task.destroy();
  }
}

/** How many red pixels a page shows, drawn by PDF.js at 72 dpi. */
async function redPixels(bytes, number, password) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), password, verbosity: 0 }).promise;
  try {
    const page = await doc.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const surface = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: surface.getContext('2d'), viewport, canvas: surface }).promise;
    const { data } = surface.getContext('2d').getImageData(0, 0, surface.width, surface.height);
    let count = 0;
    for (let index = 0; index < data.length; index += 4)
      if (data[index + 3] > 128 && data[index] > 200 && data[index + 1] < 80 && data[index + 2] < 80) count++;
    return count;
  } finally {
    await doc.loadingTask.destroy();
  }
}

/** How many names each page's resources hold under `key`, read with pdf-lib (PDF.js does not show them). */
async function names(bytes, key) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const dictionary = page.node.Resources()?.lookupMaybe(PDFName.of(key), PDFDict);
    return dictionary ? dictionary.keys().length : 0;
  });
}

// ---- What a download should be -----------------------------------------------------------

const all = (count) => Array.from({ length: count }, (_, index) => index);
const turn = (rotate, by) => (((rotate + by) % 360) + 360) % 360;
const password = 'odd-secret-1';
const others = (position, count) => all(count).filter((other) => other !== position);

/**
 * What every download must be, checked in this order: its pages; each page's
 * texts, and not the texts added to other pages; its size and turn; where its
 * links lead, and its notes; the form's fields, kept or gone; the outline, the
 * labels and the title; a hidden layer still hidden; at most `namesMax` names
 * in a page's resources; a size that grows with the pages, not with their
 * square; and a password that PDF.js needs.
 */
async function invariants(where, bytes, expect, source) {
  if (expect.password) assert.equal(await refusal(bytes), 1, `${where}: PDF.js asks for the password`);
  const got = await read(bytes, expect.password);
  assert.equal(got.pages.length, expect.pages.length, `${where}: the number of pages`);
  expect.pages.forEach((want, index) => {
    const page = got.pages[index];
    const at = `${where}, page ${index + 1}`;
    for (const text of want.texts)
      assert.ok(shows(page.text, text), `${at}: “${text}” is not on it, in “${page.text}”`);
    for (const text of want.absent ?? [])
      assert.ok(!shows(page.text, text), `${at}: “${text}” belongs on another page, in “${page.text}”`);
    if (want.family)
      assert.equal(
        page.families.get(squash(want.texts[0])),
        want.family,
        `${at}: the kind of font of “${want.texts[0]}”`,
      );
    if (want.w !== undefined)
      assert.ok(
        Math.abs(page.width - want.w) < 0.6 && Math.abs(page.height - want.h) < 0.6,
        `${at}: shows ${page.width.toFixed(2)} × ${page.height.toFixed(2)}, not ${want.w} × ${want.h}`,
      );
    if (want.rotate !== undefined) assert.equal(page.rotate, want.rotate, `${at}: the turn`);
    if (want.unit !== undefined) assert.equal(page.unit, want.unit, `${at}: the size of its unit, in points`);
    if (expect.links) assert.deepEqual(page.links, expect.links[index], `${at}: the pages its links lead to`);
    if (expect.notes) assert.equal(page.notes, expect.notes[index], `${at}: its notes`);
  });
  if (expect.fields)
    assert.deepEqual(
      got.fields,
      Object.fromEntries(Object.entries(expect.fields).map(([name, value]) => [name, [value]])),
      `${where}: the form's fields, and the value each of their widgets holds`,
    );
  if (expect.noFields) assert.deepEqual(got.fields, {}, `${where}: no fields are left`);
  if (expect.outline)
    assert.deepEqual(got.outline, expect.outline, `${where}: the outline, and the pages it leads to`);
  if (expect.labels) assert.deepEqual(got.labels, expect.labels, `${where}: the page labels`);
  if (expect.title !== undefined) assert.equal(got.title, expect.title, `${where}: the title`);
  if (expect.layerHidden)
    for (let number = 1; number <= got.pages.length; number++)
      assert.equal(
        await redPixels(bytes, number, expect.password),
        0,
        `${where}, page ${number}: the hidden layer's red square shows`,
      );
  if (expect.namesMax)
    for (const key of ['Font', 'XObject', 'ExtGState'])
      (await names(bytes, key)).forEach((count, index) =>
        assert.ok(
          count <= expect.namesMax,
          `${where}, page ${index + 1}: ${count} /${key} names, at most ${expect.namesMax}: the page holds names added for the others`,
        ),
      );
  if (source) {
    const pages = expect.pages.length;
    const bound = source.bytes.length * Math.max(1, pages / source.pages.length) + 6000 + 1000 * pages;
    assert.ok(bytes.length <= bound, `${where}: ${bytes.length} bytes, over ${Math.round(bound)}`);
  }
}

/** The pages of `entry` twice over, as one file: what a merge of the file with itself shows. */
function twice(entry) {
  const count = entry.pages.length;
  const shift = (index) => index + count;
  return {
    ...entry,
    pages: [...entry.pages, ...entry.pages],
    links: entry.links && [...entry.links, ...entry.links.map((targets) => targets.map(shift))],
    notes: entry.notes && [...entry.notes, ...entry.notes],
    outline: entry.outline && [
      ...entry.outline,
      ...entry.outline.map((item) => ({ ...item, page: shift(item.page) })),
    ],
  };
}

/** What `plan` should make of `entry` in `output` (see OPERATIONS for the fields). */
function expected(entry, plan, output) {
  const source = output.source ?? entry;
  const order = output.order ?? plan.order ?? all(source.pages.length);
  const pages =
    output.pages ??
    order.map((index, position) => {
      const { texts, box, rotate, family, userUnit = 1 } = source.pages[index];
      const shown = { texts, family, w: box[2] - box[0], h: box[3] - box[1], rotate, unit: userUnit };
      return { ...shown, ...plan.change?.(shown, { position, count: order.length, index }) };
    });
  const flattened = Boolean(plan.settings?.flattenForms);
  return {
    pages,
    links:
      !output.pages &&
      source.links &&
      order.map((index) =>
        source.links[index].map((target) => order.indexOf(target)).filter((target) => target >= 0),
      ),
    notes: !output.pages && source.notes && order.map((index) => source.notes[index]),
    outline:
      !output.pages &&
      source.outline &&
      source.outline
        .filter((item) => order.includes(item.page))
        .map((item) => ({ ...item, page: order.indexOf(item.page) })),
    // Copied pages start a new file, without the page labels.
    labels: !plan.copies && source.labels,
    fields: !plan.copies && !flattened && (plan.fields ?? source.fields),
    noFields: flattened,
    title: output.title ?? plan.title ?? source.title,
    layerHidden: source.layerHidden,
    namesMax: plan.namesMax,
    password: plan.password,
  };
}

// ---- The operations ----------------------------------------------------------------------

/**
 * The export of `entry` as the plan asks: its pages in `order`, with `page` on
 * each, and `settings`. The file's id is 'file' (Fill form's values are by file).
 */
async function build(entry, plan) {
  const source = 'file';
  const bytes = Uint8Array.from(entry.bytes);
  const pages = (plan.order ?? all(entry.pages.length)).map((index, position) => ({
    id: `${source}-${position}`,
    sourceId: source,
    index,
    ...plan.page,
  }));
  const { bytes: output } = await buildPdfWithNotes({
    sources: [{ id: source, bytes, name: `${entry.name}.pdf` }],
    pages,
    ...plan.settings,
    annotations: plan.annotations?.(pages) ?? [],
  });
  assert.deepEqual(bytes, entry.bytes, `${entry.name}: the opened file is not changed`);
  return [{ bytes: output }];
}

const stamps = {
  pageNumbers: { format: 'Page {page} of {total}', start: 1, position: 'bottom-center', margin: 24, size: 9 },
  headerFooter: { headerLeft: 'Header {page}', margin: 24, size: 9 },
  watermark: { text: 'DRAFT', angle: 30, opacity: 0.2, size: 48 },
};
const dot = createCanvas(4, 4);
dot.getContext('2d').fillRect(0, 0, 4, 4);
const picture = dot.toBuffer('image/png');
const protection = { protection: { enabled: true, password } };

/**
 * Each operation, given a file of the catalogue, gives a plan, or null when it
 * does not apply to that file. A plan says, all optional:
 *   order     the file's page indexes, in the order of the download (all, as they are);
 *   page      what each page descriptor gets ({ rotation: 90 }, a crop…);
 *   settings  what the export state gets (page numbers, properties, protection…);
 *   annotations(pages)  items to add, given the page descriptors;
 *   change(shown, { position, count, index })  what to expect of a page instead of
 *             what the file shows ({ texts, w, h, rotate }), as fields that replace those;
 *   copies    the pages go into a new file: a file with fields must be refused
 *             unless they are flattened, and page labels are not kept;
 *   fields, title  the field values and the title to expect instead of the file's;
 *   namesMax  the most names a page's resources may hold under /Font, /XObject, /ExtGState;
 *   password  the download needs it;
 *   run(entry, plan)  instead of one buildPdfWithNotes, for operations with
 *             another entry point; it gives the downloads, each { bytes } and
 *             what in it is not as expected() works out (order, pages, source, title).
 * A new operation is mostly a line or two: see `rotate`, or `resize`, whose
 * `change` says what size each page then has.
 */
const OPERATIONS = {
  unchanged: () => ({}),
  reorder: (entry) => ({ order: all(entry.pages.length).reverse() }),
  delete: (entry) => ({ order: all(entry.pages.length - 1), copies: true }),
  duplicate: (entry) => ({ order: [0, ...all(entry.pages.length)], copies: true }),
  rotate: () => ({ page: { rotation: 90 }, change: (shown) => ({ rotate: turn(shown.rotate, 90) }) }),
  crop: () => ({
    page: { crop: { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1, rotation: 0 } },
    change: (shown) => ({ w: shown.w * 0.8, h: shown.h * 0.8 }),
  }),
  margins: () => ({
    page: {
      crop: {
        left: -0.1,
        right: -0.1,
        top: -0.1,
        bottom: -0.1,
        rotation: 0,
        content: { left: 0, right: 0, top: 0, bottom: 0 },
      },
    },
    change: (shown) => ({ w: shown.w * 1.2, h: shown.h * 1.2 }),
  }),
  // On A4 paper, the sheet lying the way the page is shown. The size is the page's
  // box, which a turned page turns: a page shown upright but turned 90 degrees
  // has a box that lies on its side.
  resize: () => ({
    page: { paper: 'a4' },
    change: (shown) => {
      const turned = shown.rotate % 180 !== 0,
        [across, down] = turned ? [shown.h, shown.w] : [shown.w, shown.h],
        [width, height] = across > down ? [841.89, 595.28] : [595.28, 841.89];
      // A sheet is measured in points, whatever the page's unit was.
      return { ...(turned ? { w: height, h: width } : { w: width, h: height }), unit: 1 };
    },
  }),
  stamps: () => ({
    settings: stamps,
    namesMax: 8,
    change: (shown, { position, count }) => ({
      texts: [...shown.texts, `Page ${position + 1} of ${count}`, `Header ${position + 1}`, 'DRAFT'],
      absent: others(position, count).map((other) => `Page ${other + 1} of ${count}`),
    }),
  }),
  annotate: () => ({
    // Blue, so that nothing added is taken for the hidden layer's red square.
    annotations: (pages) =>
      pages.flatMap((page, position) => [
        {
          type: 'text',
          pageId: page.id,
          text: `ADDED-${position + 1}x`,
          x: 0.3,
          y: 0.4,
          fontSize: 12,
          color: '#0000ff',
        },
        {
          type: 'image',
          pageId: page.id,
          x: 0.1,
          y: 0.5,
          width: 0.05,
          height: 0.04,
          imageBytes: picture,
          imageType: 'png',
        },
        { type: 'highlight', pageId: page.id, x: 0.2, y: 0.2, width: 0.3, height: 0.05 },
        {
          type: 'drawing',
          pageId: page.id,
          tool: 'pen',
          color: '#0000ff',
          strokeWidth: 2,
          points: [
            [0.1, 0.1],
            [0.2, 0.15],
            [0.3, 0.1],
          ],
          x: 0.1,
          y: 0.1,
          width: 0.2,
          height: 0.05,
        },
      ]),
    namesMax: 8,
    change: (shown, { position, count }) => ({
      texts: [...shown.texts, `ADDED-${position + 1}x`],
      absent: others(position, count).map((other) => `ADDED-${other + 1}x`),
    }),
  }),
  // On a file without a form, flattening has nothing to do and must change nothing.
  flatten: (entry) => ({
    settings: { flattenForms: true },
    namesMax: 8,
    change: (shown, { index }) => ({ texts: [...shown.texts, ...(entry.drawn?.[index] ?? [])] }),
  }),
  fill: (entry) => entry.fill && { settings: { formValues: { file: entry.fill } }, fields: entry.fill },
  'fill-flatten': (entry) =>
    entry.fill && {
      settings: { flattenForms: true, formValues: { file: entry.fill } },
      namesMax: 8,
      change: (shown, { index }) => ({ texts: [...shown.texts, ...entry.drawnFilled[index]] }),
    },
  properties: () => ({
    settings: {
      properties: { title: 'Odd title', author: 'Tester', subject: '', keywords: '', language: 'en' },
    },
    title: 'Odd title',
  }),
  // The file combined with itself.
  merge: () => ({
    copies: true,
    run: async (entry) => {
      const pages = ['first', 'second'].flatMap((source) =>
        entry.pages.map((page, index) => ({ id: `${source}-${index}`, sourceId: source, index })),
      );
      const { bytes } = await buildPdfWithNotes({
        sources: ['first', 'second'].map((id) => ({
          id,
          bytes: Uint8Array.from(entry.bytes),
          name: `${id}.pdf`,
        })),
        pages,
      });
      return [{ bytes, source: twice(entry) }];
    },
  }),
  // Two pages to a sheet: what is on each page, on its sheet.
  sheets: () => ({
    copies: true,
    run: async (entry) => [
      {
        bytes: await pagesPerSheet(Uint8Array.from(entry.bytes), { perSheet: 2 }),
        pages: all(Math.ceil(entry.pages.length / 2)).map((sheet) => ({
          texts: entry.pages.slice(2 * sheet, 2 * sheet + 2).flatMap((page) => page.texts),
        })),
      },
    ],
  }),
  // The first page, and the rest.
  split: () => ({
    copies: true,
    run: async (entry) => {
      const rest = all(entry.pages.length).slice(1);
      const { parts } = await splitPdf(Uint8Array.from(entry.bytes), [[0], rest]);
      return [[0], rest].map((order, index) => ({
        bytes: parts[index],
        order,
        title: entry.title && `${entry.title} — part ${index + 1}`,
      }));
    },
  }),
  protect: () => ({ settings: protection, password }),
  // Protected, then unlocked as Unlock PDF does: the copy the editor works on.
  unlock: () => ({
    settings: protection,
    run: async (entry, plan) => {
      const [locked] = await build(entry, plan);
      const opened = await openPdf(locked.bytes, { password });
      return [{ bytes: opened.bytes, details: opened.details }];
    },
  }),
};

// ---- The tests ---------------------------------------------------------------------------

/** Run one operation on one file and check every download it gives. */
async function check(entry, operation, plan) {
  const run = () => (plan.run ?? build)(entry, plan);
  if (entry.fields && plan.copies && !plan.settings?.flattenForms) {
    await assert.rejects(
      run(),
      /once its fields are flattened/,
      `${entry.name}, ${operation}: a file with fields is refused until they are flattened`,
    );
    return;
  }
  const outputs = await run();
  for (const [index, output] of outputs.entries()) {
    const where = `${entry.name}, ${operation}${outputs.length > 1 ? `, part ${index + 1}` : ''}`;
    const expect = expected(entry, plan, output);
    await invariants(where, output.bytes, expect, entry);
    // What Document properties shows of the unlocked copy.
    if (output.details)
      assert.equal(output.details.title, expect.title ?? '', `${where}: the title the editor shows`);
  }
}

// Suites, not tests with subtests: their tests are known before they run, so
// --test-name-pattern finds a file inside any operation.
describe('the files are what the catalogue says', () => {
  // A change to the writer that makes a file other than what the tests take it
  // for (a crop left reaching past the media, a lost page) fails here, not as a
  // fault of the engine.
  for (const entry of catalogue)
    test(entry.name, async () => {
      await invariants(`${entry.name}, as written`, entry.bytes, expected(entry, {}, {}));
      // And it is odd in the way the catalogue says: PDF.js shows the same pages without that.
      const written = Buffer.from(entry.bytes).toString('latin1');
      for (const sign of entry.signs ?? [])
        assert.match(written, sign, `${entry.name}: the file is no longer odd in the way it is listed for`);
    });
});

for (const [operation, plan] of Object.entries(OPERATIONS)) {
  describe(operation, () => {
    for (const entry of catalogue) {
      const made = plan(entry);
      if (made) test(entry.name, () => check(entry, operation, made));
    }
  });
}
