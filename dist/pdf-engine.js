/**
 * QFT PDF's document engine. Uses the local PDFLib UMD bundle; custom fonts
 * additionally use the local fontkit UMD bundle. Both bundles are loaded on
 * first use (see loadPdfLib), so the landing page does not pay for them; this
 * module also runs in the export worker (export-worker.js). Node tests may
 * provide globalThis.PDFLib / globalThis.fontkit instead.
 *
 * Coordinates are fractions of the visible, rotated CropBox, from top-left.
 * A page descriptor's rotation is an ADDITION to its source's /Rotate value.
 * Stable page IDs, rather than array positions, identify annotation scopes.
 * Annotation pageRotation records the descriptor rotation when it was placed,
 * so later page rotations rotate placed content with its original page.
 * A descriptor crop stores fractional margins from the ORIGINAL visible box,
 * plus the descriptor rotation when those margins were chosen. Annotation
 * pageCrop captures the crop at placement, keeping annotations fixed on paper
 * when a later crop changes the visible area. Cropping hides, not redacts.
 * All operations return new bytes; the input byte arrays remain untouched.
 *
 * Geometry and text layout live in layout.js, shared with the editor preview.
 */
import {
  applies, boxGeometry, fontKind, hexColor, headerFooterItems, layoutMarginText, layoutRect,
  layoutTextAnnotation, layoutWatermark, number, pageGeometry, pageNumberItem, placementGeometry, rotation, textValue,
  unsupportedCharacter, unsupportedMessage, visibleBox, watermarkText,
} from './layout.js';

export { cropMarginsForRotation } from './layout.js';

const fontBytes = new Map();
const VENDOR_SCRIPTS = {
  PDFLib: new URL('./assets/vendor/pdf-lib.min.js', import.meta.url),
  fontkit: new URL('./assets/vendor/fontkit.umd.min.js', import.meta.url),
};
const scriptLoads = new Map();
const FONT_FILES = {
  latin: new URL('./assets/fonts/NotoSans-Regular.ttf', import.meta.url),
  cjk: new URL('./assets/fonts/NotoSansCJKsc-Regular.otf', import.meta.url),
};

/** Run a bundled UMD library: a script tag in a page; a module import in a worker. */
function runScript(url) {
  if (typeof document === 'undefined') return import(url);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => {
      script.remove();
      reject();
    };
    document.head.append(script);
  });
}

/** Resolve a bundled UMD library's global, loading it on first use. */
function loadGlobal(name, failure) {
  if (globalThis[name]) return Promise.resolve(globalThis[name]);
  if (typeof document === 'undefined' && typeof WorkerGlobalScope === 'undefined') return Promise.reject(new Error(failure));
  if (!scriptLoads.has(name)) {
    const loading = runScript(VENDOR_SCRIPTS[name].href).then(
      () => globalThis[name] || Promise.reject(new Error(failure)),
      () => Promise.reject(new Error(failure)),
    );
    // A failed download (for example while offline) can be retried later.
    scriptLoads.set(name, loading.catch((error) => {
      scriptLoads.delete(name);
      throw error;
    }));
  }
  return scriptLoads.get(name);
}

/** Load pdf-lib if needed. Safe to call early to warm it up before it is required. */
export function loadPdfLib() {
  return loadGlobal('PDFLib', 'The PDF tools did not load. Check your connection, then try again.');
}

function loadFontkit() {
  if (!globalThis.fontkit && globalThis.Fontkit) return Promise.resolve(globalThis.Fontkit);
  return loadGlobal('fontkit', 'The text font engine did not load. Check your connection, then try again.');
}

/** Synchronous access for code that runs after loadPdfLib() has resolved. */
function library() {
  if (!globalThis.PDFLib) throw new Error('The PDF tools did not load. Check your connection, then try again.');
  return globalThis.PDFLib;
}

function bytesOf(bytes) {
  if (bytes instanceof Uint8Array) return bytes.slice();
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes.slice(0));
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).slice();
  throw new Error('Choose a PDF file to continue.');
}

async function loadPdf(bytes) {
  const lib = await loadPdfLib();
  try {
    const doc = await lib.PDFDocument.load(bytesOf(bytes), { updateMetadata: false });
    if (!doc.getPageCount()) throw new Error('This PDF has no pages.');
    return doc;
  } catch (error) {
    if (/encrypt|password/i.test(String(error?.message))) {
      throw new Error('This PDF is password-protected. Open it with your password and save an unlocked copy before using QFT PDF.', { cause: error });
    }
    if (error?.message === 'This PDF has no pages.') throw error;
    // Keep the parser's own error as the cause; it is logged with the message.
    throw new Error('This file could not be opened as a PDF. Try opening it in a PDF reader and saving a new copy.', { cause: error });
  }
}

/** The page as viewers display it: CropBox ∩ MediaBox at the page's /Rotate. */
function visibleGeometry(page) {
  return boxGeometry(visibleBox(page.getMediaBox(), page.getCropBox()), page.getRotation().angle);
}

/**
 * Page sizes in visible orientation, for layout before rendering, and whether
 * the PDF has interactive form fields (they limit merging and extracting).
 */
export async function inspectPdf(bytes) {
  const doc = await loadPdf(bytes);
  const pages = doc.getPages().map((page, index) => {
    const { width, height, rotation, cropBox } = visibleGeometry(page);
    return { index, width, height, rotation, cropBox };
  });
  return { pages, pageCount: pages.length, hasForm: doc.getForm().getFields().length > 0 };
}

function color(hex, fallback) {
  const text = hexColor(hex, fallback);
  return library().rgb(...[1, 3, 5].map((offset) => parseInt(text.slice(offset, offset + 2), 16) / 255));
}

/** The bytes of a bundled font file ('latin' or 'cjk'), downloaded once. */
export function fontFile(kind) {
  return getFontBytes(kind);
}

async function getFontBytes(kind) {
  if (!fontBytes.has(kind)) {
    fontBytes.set(kind, fetch(FONT_FILES[kind]).then(async (response) => {
      if (!response.ok) throw new Error('font fetch');
      return new Uint8Array(await response.arrayBuffer());
    }).catch(() => {
      fontBytes.delete(kind);
      throw new Error('The font for this text could not be loaded. Check your connection, then try again.');
    }));
  }
  return fontBytes.get(kind);
}

/** One font per kind for a document, loaded when first needed. */
function fontLoader(doc) {
  const fonts = new Map();
  return (kind) => {
    if (!fonts.has(kind)) {
      const loading = (async () => {
        if (kind === 'standard') return doc.embedFont(library().StandardFonts.Helvetica);
        // fontkit is only needed for non-ASCII text, so it is fetched on demand.
        doc.registerFontkit(await loadFontkit());
        // CFF subsets from fontkit are not reliably accepted by all PDF readers.
        // Embed the complete CJK OTF so exported Chinese text also renders in
        // native readers; the Latin TrueType font can be safely subset.
        return doc.embedFont(await getFontBytes(kind), { subset: kind !== 'cjk' });
      })();
      fonts.set(kind, loading);
      loading.catch(() => fonts.delete(kind));
    }
    return fonts.get(kind);
  };
}

const characterSets = new WeakMap();
/** The code points a font can draw. */
export function characterSet(font) {
  if (!characterSets.has(font)) characterSets.set(font, new Set(font.getCharacterSet()));
  return characterSets.get(font);
}

function fontManager(doc) {
  const load = fontLoader(doc);
  return async (value) => {
    const font = await load(fontKind(value));
    const unsupported = unsupportedCharacter(value, characterSet(font));
    if (unsupported) throw Object.assign(new Error(unsupportedMessage(unsupported)), { unsupported });
    return font;
  };
}

let measuring = null;
/**
 * The font the export uses for a kind of text ('standard', 'latin' or 'cjk'),
 * for measuring outside an export. The editor preview lays text out with it,
 * so its line breaks and positions match the downloaded PDF.
 */
export async function measuringFont(kind) {
  if (!measuring) {
    measuring = loadPdfLib().then((lib) => lib.PDFDocument.create()).then(fontLoader);
    measuring.catch(() => (measuring = null));
  }
  return (await measuring)(kind);
}

/** Report a problem with the page and item it is on, so the editor can show it there. */
function pageError(message, pageIndex, itemId) {
  return Object.assign(new Error(`Page ${pageIndex + 1}: ${message}`), { pageIndex, itemId });
}

async function fontFor(getFont, text, pageIndex, itemId) {
  try {
    return await getFont(text);
  } catch (error) {
    if (error.unsupported) throw pageError(error.message, pageIndex, itemId);
    throw error;
  }
}

async function drawTextAnnotation(page, geometry, annotation, getFont, pageIndex) {
  const text = textValue(annotation.text);
  if (!text.trim()) return;
  const font = await fontFor(getFont, text, pageIndex, annotation.id);
  const layout = layoutTextAnnotation(annotation, geometry, font);
  if (layout.problem) throw pageError(layout.problem, pageIndex, annotation.id);
  const options = { font, size: layout.size, color: color(annotation.color), opacity: number(annotation.opacity, 1, 0, 1) };
  for (const line of layout.lines) page.drawText(line.text, { ...options, x: line.x, y: line.y });
}

async function drawAnnotation(doc, page, geometry, annotation, getFont, pageIndex) {
  if (annotation.type === 'text') return drawTextAnnotation(page, geometry, annotation, getFont, pageIndex);
  const rect = layoutRect(annotation, geometry);
  if (!rect) return;
  const options = { ...rect, opacity: number(annotation.opacity, 1, 0, 1) };
  if (annotation.type === 'highlight') {
    page.drawRectangle({ ...options, color: color(annotation.color, '#f5d85c'), opacity: number(annotation.opacity, 0.3, 0, 1), blendMode: library().BlendMode.Multiply });
  } else if (annotation.type === 'image') {
    if (!annotation.imageBytes) throw new Error('Choose a PNG or JPEG image to add to the PDF.');
    try {
      const image = annotation.imageType === 'jpg' || annotation.imageType === 'jpeg'
        ? await doc.embedJpg(annotation.imageBytes)
        : await doc.embedPng(annotation.imageBytes);
      page.drawImage(image, options);
    } catch {
      throw new Error('This image could not be added. Choose a valid PNG or JPEG image.');
    }
  }
}

async function drawWatermark(page, geometry, setting, getFont, pageIndex, total) {
  const text = watermarkText(setting, pageIndex + 1, total);
  if (!text.trim()) return;
  const font = await fontFor(getFont, text, pageIndex, 'watermark');
  const mark = layoutWatermark(setting, geometry, font, text);
  page.drawText(text, {
    x: mark.x, y: mark.y, size: mark.size, font, color: color(setting.color, '#85948e'),
    opacity: number(setting.opacity, 0.15, 0, 1), rotate: library().degrees(mark.angle),
  });
}

async function drawMarginItems(page, geometry, items, hex, getFont, pageIndex, fallback) {
  for (const item of items) {
    if (!item.text.trim()) continue;
    const font = await fontFor(getFont, item.text, pageIndex, item.key);
    const placed = layoutMarginText(geometry, item, font);
    if (placed.problem) throw pageError(placed.problem, pageIndex, item.key);
    page.drawText(placed.text, { x: placed.x, y: placed.y, size: placed.size, font, color: color(hex, fallback) });
  }
}

/**
 * Export the current editor state. The progress callback receives a 0..1 fraction.
 * A single complete source retains its document tree (forms, attachments,
 * metadata). Subsets are copied into a fresh document so unselected page
 * objects are not simply left behind in the original document's object store.
 * Combining/subsetting forms is rejected: copying widget appearances alone
 * would silently lose the interactive form structure.
 */
export async function buildPdf(state, onProgress = () => {}) {
  const lib = await loadPdfLib();
  const sources = state?.sources || [];
  const descriptors = state?.pages || [];
  if (!descriptors.length) throw new Error('Keep at least one page before exporting your PDF.');
  if (new Set(descriptors.map((page) => page.id)).size !== descriptors.length) throw new Error('The page list contains duplicate page IDs. Reload this document and try again.');
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const loaded = new Map();
  const needed = [...new Set(descriptors.map((page) => page.sourceId))];
  onProgress(0);
  for (const id of needed) {
    if (!sourceMap.has(id)) throw new Error('A source PDF is missing. Add the file again before exporting.');
    loaded.set(id, await loadPdf(sourceMap.get(id).bytes));
  }
  for (const descriptor of descriptors) {
    if (!Number.isInteger(descriptor.index) || descriptor.index < 0 || descriptor.index >= loaded.get(descriptor.sourceId).getPageCount()) {
      throw new Error('A selected page does not exist in its source PDF. Reload the file and try again.');
    }
    rotation(descriptor.rotation || 0);
  }
  onProgress(0.1);
  const oneSource = needed.length === 1;
  const noDuplicates = new Set(descriptors.map((page) => `${page.sourceId}:${page.index}`)).size === descriptors.length;
  let doc;
  let outputPages;
  const completeSource = oneSource && descriptors.length === loaded.get(needed[0]).getPageCount();
  if (completeSource && noDuplicates) {
    doc = loaded.get(needed[0]);
    const originalPages = doc.getPages();
    outputPages = descriptors.map((descriptor) => originalPages[descriptor.index]);
    // Reuse original PDFPage objects to preserve the original document's form tree.
    for (let index = doc.getPageCount() - 1; index >= 0; index--) doc.removePage(index);
    outputPages.forEach((page) => doc.addPage(page));
  } else {
    for (const source of loaded.values()) {
      if (source.getForm().getFields().length) throw new Error('Merging, duplicating, or extracting pages from PDFs with interactive forms is not supported. Save a flattened copy in your PDF reader, then add that copy.');
    }
    doc = await lib.PDFDocument.create();
    doc.setProducer('QFT PDF');
    const copies = new Map();
    for (const id of needed) {
      const selected = descriptors.filter((descriptor) => descriptor.sourceId === id);
      const copied = await doc.copyPages(loaded.get(id), selected.map((page) => page.index));
      selected.forEach((descriptor, index) => copies.set(descriptor.id, copied[index]));
    }
    outputPages = descriptors.map((descriptor) => copies.get(descriptor.id));
    outputPages.forEach((page) => doc.addPage(page));
  }
  const getFont = fontManager(doc);
  const annotations = state.annotations || [];
  const total = outputPages.length;
  for (let index = 0; index < total; index++) {
    const page = outputPages[index];
    const descriptor = descriptors[index];
    const source = { box: visibleBox(page.getMediaBox(), page.getCropBox()), rotation: page.getRotation().angle };
    const geometry = pageGeometry(source, descriptor);
    page.setRotation(lib.degrees(geometry.rotation));
    if (descriptor.crop) {
      const { x, y, width, height } = geometry.cropBox;
      page.setCropBox(x, y, width, height);
    }
    for (const annotation of annotations.filter((item) => item.pageId === descriptor.id)) {
      const placement = placementGeometry(source, descriptor, annotation);
      page.pushOperators(lib.pushGraphicsState(), lib.concatTransformationMatrix(...placement.matrix));
      await drawAnnotation(doc, page, placement, annotation, getFont, index);
      page.pushOperators(lib.popGraphicsState());
    }
    page.pushOperators(lib.pushGraphicsState(), lib.concatTransformationMatrix(...geometry.matrix));
    if (applies(state.watermark, descriptor.id)) await drawWatermark(page, geometry, state.watermark, getFont, index, total);
    if (applies(state.headerFooter, descriptor.id)) {
      await drawMarginItems(page, geometry, headerFooterItems(state.headerFooter, geometry, index + 1, total), state.headerFooter.color, getFont, index, '#53635d');
    }
    if (applies(state.pageNumbers, descriptor.id)) {
      await drawMarginItems(page, geometry, [pageNumberItem(state.pageNumbers, geometry, index + 1, total)], state.pageNumbers.color, getFont, index, '#53635d');
    }
    page.pushOperators(lib.popGraphicsState());
    onProgress(0.1 + 0.8 * (index + 1) / total);
    // Give the browser time to paint progress during larger exports.
    if (index % 10 === 9) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const output = await doc.save();
  onProgress(1);
  return output;
}

/** Parse an inclusive, one-based list like "1-3, 5" into zero-based indexes. */
export function parsePageRange(value, pageCount) {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('Open a PDF before choosing a page range.');
  if (!String(value ?? '').trim()) return Array.from({ length: pageCount }, (_, index) => index);
  const result = new Set();
  for (const token of String(value).split(',')) {
    const match = token.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!match) throw new Error('Use page numbers like 1-3, 5.');
    const first = Number(match[1]);
    const last = Number(match[2] || match[1]);
    if (first < 1 || last < first || last > pageCount) throw new Error(`Choose page numbers between 1 and ${pageCount}, with each range in ascending order.`);
    for (let page = first; page <= last; page++) result.add(page - 1);
  }
  return [...result];
}
