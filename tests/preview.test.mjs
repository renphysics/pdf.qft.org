import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

// The editor preview (dist/preview.js) draws edits as SVG over the source pages
// instead of building a PDF. This checks, independently of the browser, that
// every line of text it draws lands where the exported PDF puts it: pages with
// all four intrinsic rotations and CropBox offsets, turned and cropped again in
// the editor, with notes placed before and after those changes.
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || path.join(root, 'node_modules');
globalThis.PDFLib = require(path.join(runtime, '@cantoo/pdf-lib'));
globalThis.fontkit = require(path.join(root, 'node_modules/@cantoo/fontkit'));
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
// The preview also loads each font as a FontFace for drawing; only its measurements matter here.
globalThis.FontFace = class {
  load() {
    return Promise.resolve(this);
  }
};
globalThis.document = { fonts: { add() {}, check: () => true } };

const { inspectPdf, buildPdf } = await import('../dist/pdf-engine.js');
const { pageOverlay, previewFont } = await import('../dist/preview.js');
const pdfjs = await import(pathToFileURL(path.join(runtime, 'pdfjs-dist/legacy/build/pdf.mjs')));

const bytes = new Uint8Array(await readFile(path.join(root, 'tests/fixtures/rotated-cropped.pdf')));
const info = await inspectPdf(bytes);
const source = {
  id: 's',
  bytes,
  name: 'fixture.pdf',
  pageCount: info.pageCount,
  hasForm: info.hasForm,
  pages: info.pages.map((page) => ({ box: page.cropBox, rotation: page.rotation })),
};
const pages = [
  { id: 'p0', sourceId: 's', index: 0, rotation: 0 },
  { id: 'p1', sourceId: 's', index: 1, rotation: 90 },
  {
    id: 'p2',
    sourceId: 's',
    index: 2,
    rotation: 180,
    crop: { left: 0.1, top: 0.05, right: 0.2, bottom: 0.1, rotation: 90 },
  },
  {
    id: 'p3',
    sourceId: 's',
    index: 3,
    rotation: 270,
    crop: { left: 0.05, top: 0.1, right: 0.05, bottom: 0.2, rotation: 270 },
  },
];
const annotations = pages.flatMap((page, i) => [
  // Placed before the page was turned or cropped: it turns with the paper.
  {
    id: `before${i}`,
    pageId: page.id,
    pageRotation: 0,
    type: 'text',
    text: `Placed upright ${i}\nsecond line`,
    fontSize: 14,
    x: 0.35,
    y: 0.45,
    autoWidth: true,
    color: '#224466',
  },
  // Placed in the current view, wrapping in a fixed-width centred box.
  {
    id: `after${i}`,
    pageId: page.id,
    pageRotation: page.rotation,
    pageCrop: page.crop,
    type: 'text',
    text: `Placed after turn ${i} with a longer line that wraps`,
    fontSize: 11,
    x: 0.3,
    y: 0.6,
    width: 0.4,
    align: 'center',
  },
  // Non-ASCII text uses the embedded Noto Sans; right-aligned in a box that fits its line.
  {
    id: `latin${i}`,
    pageId: page.id,
    pageRotation: page.rotation,
    pageCrop: page.crop,
    type: 'text',
    text: `Café ${i}`,
    fontSize: 12,
    x: 0.5,
    y: 0.4,
    autoWidth: true,
    align: 'right',
  },
]);
const state = {
  sources: [source],
  pages,
  annotations,
  watermark: { text: 'DRAFT {page}', size: 40, angle: -30, opacity: 0.2, position: 'top', pages: 'all' },
  headerFooter: { headerLeft: 'Head {page}', footerRight: 'Foot {total}', size: 9, margin: 20, pages: 'all' },
  pageNumbers: { format: 'No. {page}', position: 'bottom-center', size: 8, margin: 30, pages: ['p1', 'p3'] },
};

const decode = (text) =>
  text.replace(/&(amp|lt|gt|quot);/g, (match, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"' })[name]);
const number = (value) => Number(value);
/** Text the preview draws: each line's string, baseline origin and size in display points (y down). */
function previewLines(markup) {
  const lines = [];
  // Annotations are groups with their placement transform; repeated settings are drawn directly.
  const parts = markup.split(/(?=<g transform=)|(?<=<\/g>)/);
  for (const part of parts) {
    const matrix = part
      .match(/^<g transform="matrix\(([^)]+)\)">/)?.[1]
      .split(' ')
      .map(number) || [1, 0, 0, 1, 0, 0];
    for (const text of part.matchAll(/<text([^>]*)>(.*?)<\/text>/g)) {
      const size = number(text[1].match(/font-size="([^"]+)"/)[1]);
      const placed = text[1].match(/transform="translate\(([^ ]+) ([^)]+)\) rotate\(([^)]+)\)"/);
      if (placed) {
        lines.push({ text: decode(text[2]), x: number(placed[1]), y: number(placed[2]), size });
        continue;
      }
      for (const span of text[2].matchAll(/<tspan x="([^"]+)" y="([^"]+)">(.*?)<\/tspan>/g)) {
        const [a, b, c, d, e, f] = matrix,
          x = number(span[1]),
          y = number(span[2]);
        // An item placed before its page went on a sheet is scaled with the page.
        lines.push({
          text: decode(span[3]),
          x: a * x + c * y + e,
          y: b * x + d * y + f,
          size: size * Math.hypot(a, b),
        });
      }
    }
  }
  return lines;
}
await test('the preview’s fonts load on first use', async () => {
  // Fonts load on first use; wait for both.
  for (const kind of ['standard', 'latin']) previewFont(kind);
  for (let wait = 0; !(previewFont('standard').font && previewFont('latin').font); wait++) {
    assert(wait < 200, 'preview fonts did not load');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
});

/**
 * Every line the preview draws on every page of `state` is where the export
 * puts it, at its size. Returns how many lines each page has.
 */
async function sameAsExport(state) {
  const { pages } = state;
  const output = await buildPdf(state);
  const doc = await pdfjs.getDocument({
    data: output.slice(),
    verbosity: 0,
    standardFontDataUrl: path.join(runtime, 'pdfjs-dist/standard_fonts/'),
  }).promise;
  const counts = [];
  for (let index = 0; index < pages.length; index++) {
    const overlay = pageOverlay(state, index);
    assert.equal(overlay.problems.length, 0, `page ${index + 1}: no problems`);
    const page = await doc.getPage(index + 1);
    const viewport = page.getViewport({ scale: 1 });
    assert(
      Math.abs(viewport.width - overlay.geometry.width) < 0.01 &&
        Math.abs(viewport.height - overlay.geometry.height) < 0.01,
      `page ${index + 1}: preview size ${overlay.geometry.width}×${overlay.geometry.height} matches the export ${viewport.width}×${viewport.height}`,
    );
    const exported = (await page.getTextContent()).items
      .filter((item) => item.str.trim())
      .map((item) => {
        const [a, b, , , e, f] = pdfjs.Util.transform(viewport.transform, item.transform);
        return { text: item.str, x: e, y: f, size: Math.hypot(a, b) };
      });
    const lines = previewLines(overlay.markup);
    counts.push(lines.length);
    for (const line of lines) {
      const match = exported.find(
        (item) =>
          item.text === line.text && Math.abs(item.x - line.x) < 0.05 && Math.abs(item.y - line.y) < 0.05,
      );
      assert(
        match,
        `page ${index + 1}: "${line.text}" is drawn at (${line.x.toFixed(2)}, ${line.y.toFixed(2)}) in the preview; the export has ${JSON.stringify(exported.filter((item) => item.text === line.text))}`,
      );
      assert(Math.abs(match.size - line.size) < 0.01, `page ${index + 1}: "${line.text}" size`);
    }
  }
  await doc.loadingTask.destroy();
  return counts;
}
await test('the preview draws every line where the export does: rotations, CropBox offsets, turned and cropped pages, wrapped text, watermark, headers, footers, page numbers, Noto Sans', async () => {
  // Two lines placed upright, three wrapped, one in Noto Sans, the watermark, a
  // header and a footer; a page number on the second and fourth pages.
  assert.deepEqual(await sameAsExport(state), [8, 9, 8, 9], 'the preview draws every line');
});

await test('and on pages put on sheets of A4 and Letter: what was placed before is scaled with its page, the rest is at its own size on the sheet', async () => {
  const paper = (index) => (index % 2 ? 'letter' : 'a4');
  const sheets = {
    ...state,
    pages: pages.map((page, index) => ({ ...page, paper: paper(index) })),
    // The notes placed in the page's current view were placed on its sheet.
    annotations: annotations.map((annotation) =>
      annotation.id.startsWith('before')
        ? annotation
        : { ...annotation, pagePaper: paper(pages.findIndex((page) => page.id === annotation.pageId)) },
    ),
  };
  // On the wider sheets the wrapped note takes two lines, not three.
  assert.deepEqual(await sameAsExport(sheets), [7, 8, 7, 8], 'the preview draws every line');
});
