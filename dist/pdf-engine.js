/**
 * QFT PDF's document engine. Uses the local PDFLib UMD bundle; custom fonts
 * additionally use the local fontkit UMD bundle. In a browser both bundles are
 * loaded on first use (see loadPdfLib), so the landing page does not pay for
 * them. Node tests may provide globalThis.PDFLib / globalThis.fontkit instead.
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
 */

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
const CJK = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\u{20000}-\u{2FA1F}]/u;
const ASCII = /^[\u0009\u000A\u000D\u0020-\u007E]*$/u;

/** Resolve a bundled UMD library's global, adding its script tag on first use. */
function loadGlobal(name, failure) {
  if (globalThis[name]) return Promise.resolve(globalThis[name]);
  if (typeof document === 'undefined') return Promise.reject(new Error(failure));
  if (!scriptLoads.has(name)) {
    const loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = VENDOR_SCRIPTS[name].href;
      script.async = true;
      script.onload = () => (globalThis[name] ? resolve(globalThis[name]) : reject(new Error(failure)));
      script.onerror = () => {
        script.remove();
        reject(new Error(failure));
      };
      document.head.append(script);
    });
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

function number(value, fallback, min = -Infinity, max = Infinity) {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
}

function rotation(value = 0) {
  const angle = Number(value);
  if (!Number.isFinite(angle) || angle % 90 !== 0) throw new Error('Page rotation must be a multiple of 90 degrees.');
  return ((angle % 360) + 360) % 360;
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
      throw new Error('This PDF is password-protected. Open it with your password and save an unlocked copy before using QFT PDF.');
    }
    if (error?.message === 'This PDF has no pages.') throw error;
    throw new Error('This file could not be opened as a PDF. Try opening it in a PDF reader and saving a new copy.');
  }
}

function visibleGeometry(page, rotationOverride, boxOverride) {
  // PDF viewers display the intersection of CropBox and MediaBox.
  const media = page.getMediaBox();
  const requested = page.getCropBox();
  let x = Math.max(media.x, requested.x);
  let y = Math.max(media.y, requested.y);
  let w = Math.min(media.x + media.width, requested.x + requested.width) - x;
  let h = Math.min(media.y + media.height, requested.y + requested.height) - y;
  if (!(w > 0 && h > 0)) ({ x, y, width: w, height: h } = media);
  if (boxOverride) ({ x, y, width: w, height: h } = boxOverride);
  const angle = rotation(rotationOverride ?? page.getRotation().angle);
  const matrices = {
    0: [1, 0, 0, 1, x, y],
    90: [0, 1, -1, 0, x + w, y],
    180: [-1, 0, 0, -1, x + w, y + h],
    270: [0, -1, 1, 0, x, y + h],
  };
  return {
    width: angle % 180 ? h : w,
    height: angle % 180 ? w : h,
    rotation: angle,
    cropBox: { x, y, width: w, height: h },
    matrix: matrices[angle],
  };
}

/** Return crop margins in the current descriptor rotation's displayed axes. */
export function cropMarginsForRotation(crop, currentRotation = 0) {
  let margins = { left: 0, top: 0, right: 0, bottom: 0 };
  if (!crop) return margins;
  for (const edge of Object.keys(margins)) {
    const value = crop[edge] === undefined ? 0 : Number(crop[edge]);
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error('Crop margins must be between 0% and less than 100%.');
    }
    margins[edge] = value;
  }
  if (margins.left + margins.right >= 1 || margins.top + margins.bottom >= 1) {
    throw new Error('Crop margins must leave some of the page visible.');
  }
  const turns = rotation(rotation(currentRotation) - rotation(crop.rotation ?? currentRotation)) / 90;
  for (let turn = 0; turn < turns; turn++) {
    margins = { left: margins.bottom, top: margins.left, right: margins.top, bottom: margins.right };
  }
  return margins;
}

function croppedGeometry(page, originalBox, angle, crop, descriptorRotation) {
  const original = visibleGeometry(page, angle, originalBox);
  if (!crop) return original;
  const margins = cropMarginsForRotation(crop, descriptorRotation);
  const [a, b, c, d, e, f] = original.matrix;
  const left = margins.left * original.width;
  const right = (1 - margins.right) * original.width;
  const bottom = margins.bottom * original.height;
  const top = (1 - margins.top) * original.height;
  const xs = [], ys = [];
  for (const x of [left, right]) for (const y of [bottom, top]) {
    xs.push(a * x + c * y + e);
    ys.push(b * x + d * y + f);
  }
  const x = Math.min(...xs), y = Math.min(...ys);
  const width = Math.max(...xs) - x, height = Math.max(...ys) - y;
  if (!(width >= 1 && height >= 1)) throw new Error('The cropped page must be at least 1 PDF point wide and high.');
  return visibleGeometry(page, angle, { x, y, width, height });
}

/** Returns dimensions in visible orientation, suitable for preview layout. */
export async function inspectPdf(bytes) {
  const doc = await loadPdf(bytes);
  const pages = doc.getPages().map((page, index) => {
    const { width, height, rotation, cropBox } = visibleGeometry(page);
    return { index, width, height, rotation, cropBox };
  });
  return { pages, pageCount: pages.length };
}

function color(hex, fallback = '#142c28') {
  let text = typeof hex === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex) ? hex : fallback;
  if (text.length === 4) text = '#' + [...text.slice(1)].map((x) => x + x).join('');
  return library().rgb(...[1, 3, 5].map((offset) => parseInt(text.slice(offset, offset + 2), 16) / 255));
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

function textValue(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
}

function fontManager(doc) {
  const fonts = new Map();
  return async (value) => {
    const text = textValue(value);
    const kind = ASCII.test(text) ? 'standard' : CJK.test(text) ? 'cjk' : 'latin';
    if (!fonts.has(kind)) {
      fonts.set(kind, (async () => {
        if (kind === 'standard') return doc.embedFont(library().StandardFonts.Helvetica);
        // fontkit is only needed for non-ASCII text, so it is fetched on demand.
        doc.registerFontkit(await loadFontkit());
        // CFF subsets from fontkit are not reliably accepted by all PDF readers.
        // Embed the complete CJK OTF so exported Chinese text also renders in
        // native readers; the Latin TrueType font can be safely subset.
        return doc.embedFont(await getFontBytes(kind), { subset: kind !== 'cjk' });
      })());
    }
    const font = await fonts.get(kind);
    const supported = new Set(font.getCharacterSet());
    const unsupported = [...text].find((character) => character !== '\n' && !supported.has(character.codePointAt(0)));
    if (unsupported) throw new Error(`The available font cannot display “${unsupported}”. Remove that character or use a supported alphabet.`);
    return font;
  };
}

function applies(setting, pageId) {
  return setting && setting.enabled !== false && (!setting.pages || setting.pages === 'all' || setting.pages.includes(pageId));
}

function variables(text, page, total) {
  return textValue(text).replaceAll('{page}', String(page)).replaceAll('{total}', String(total));
}

function wrapText(text, font, size, maxWidth) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph) { lines.push(''); continue; }
    let line = '';
    let wordBreak = -1;
    for (const character of paragraph) {
      const test = line + character;
      if (line && font.widthOfTextAtSize(test, size) > maxWidth) {
        if (wordBreak > 0 && !CJK.test(line)) {
          lines.push(line.slice(0, wordBreak).trimEnd());
          line = line.slice(wordBreak + 1) + character;
        } else {
          lines.push(line.trimEnd());
          line = character === ' ' ? '' : character;
        }
        wordBreak = line.lastIndexOf(' ');
      } else {
        line = test;
        if (character === ' ') wordBreak = line.length - 1;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

async function drawTextAnnotation(page, geometry, annotation, getFont) {
  const text = textValue(annotation.text);
  if (!text.trim()) return;
  const font = await getFont(text);
  const size = number(annotation.fontSize, 16, 4, 200);
  const x = number(annotation.x, 0.1, 0, 1) * geometry.width;
  const y = geometry.height - number(annotation.y, 0.1, 0, 1) * geometry.height;
  const width = Math.max(1, Math.min(number(annotation.width, 0.8, 0.01, 1) * geometry.width, geometry.width - x));
  const ascent = font.heightAtSize(size, { descender: false });
  const lines = wrapText(text, font, size, width);
  const lineHeight = size * 1.25;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line) continue;
    const textWidth = font.widthOfTextAtSize(line, size);
    const offset = annotation.align === 'right' ? width - textWidth : annotation.align === 'center' ? (width - textWidth) / 2 : 0;
    const baseline = y - ascent - index * lineHeight;
    if (baseline < 0) throw new Error('A text annotation extends below its page. Move it up or use a smaller font.');
    page.drawText(line, { x: x + offset, y: baseline, font, size, color: color(annotation.color), opacity: number(annotation.opacity, 1, 0, 1) });
  }
}

async function drawAnnotation(doc, page, geometry, annotation, getFont) {
  if (annotation.type === 'text') return drawTextAnnotation(page, geometry, annotation, getFont);
  const x = number(annotation.x, 0.1, 0, 1) * geometry.width;
  const top = number(annotation.y, 0.1, 0, 1) * geometry.height;
  const width = Math.min(number(annotation.width, 0.25, 0.001, 1) * geometry.width, geometry.width - x);
  const height = Math.min(number(annotation.height, 0.08, 0.001, 1) * geometry.height, geometry.height - top);
  if (!(width > 0 && height > 0)) return;
  const options = { x, y: geometry.height - top - height, width, height, opacity: number(annotation.opacity, 1, 0, 1) };
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

async function drawWatermark(page, geometry, setting, getFont, pageNumber, total) {
  const text = variables(setting.text, pageNumber, total).replace(/\n/g, ' ');
  if (!text.trim()) return;
  const font = await getFont(text);
  let size = number(setting.size, 48, 4, 240);
  const angle = number(setting.angle, -35, -180, 180);
  const radians = angle * Math.PI / 180;
  // Keep a long watermark inside the page, including its rotated bounding box.
  const originalWidth = font.widthOfTextAtSize(text, size);
  const originalHeight = font.heightAtSize(size, { descender: false });
  const boundingWidth = Math.abs(originalWidth * Math.cos(radians)) + Math.abs(originalHeight * Math.sin(radians));
  const boundingHeight = Math.abs(originalWidth * Math.sin(radians)) + Math.abs(originalHeight * Math.cos(radians));
  size *= Math.min(1, geometry.width * 0.86 / Math.max(1, boundingWidth), geometry.height * 0.7 / Math.max(1, boundingHeight));
  const width = font.widthOfTextAtSize(text, size);
  const height = font.heightAtSize(size, { descender: false });
  const rotatedHeight = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians));
  let centerY = geometry.height / 2;
  if (setting.position === 'top') centerY = geometry.height - Math.max(28 + rotatedHeight / 2, geometry.height * 0.15);
  if (setting.position === 'bottom') centerY = Math.max(28 + rotatedHeight / 2, geometry.height * 0.15);
  const centerX = geometry.width / 2;
  page.drawText(text, {
    x: centerX - (width * Math.cos(radians) - height * Math.sin(radians)) / 2,
    y: centerY - (width * Math.sin(radians) + height * Math.cos(radians)) / 2,
    size, font, color: color(setting.color, '#85948e'), opacity: number(setting.opacity, 0.15, 0, 1), rotate: library().degrees(angle),
  });
}

async function drawMarginText(page, geometry, text, { size, margin, align, top, hex, maxWidth }, getFont) {
  if (!text.trim()) return;
  const font = await getFont(text);
  const content = text.replace(/\n/g, ' ');
  const intendedWidth = font.widthOfTextAtSize(content, size);
  const actualSize = size * Math.min(1, maxWidth / Math.max(1, intendedWidth));
  if (actualSize < 4) throw new Error('The header or footer is too long. Shorten it or use more than one text position.');
  const textWidth = font.widthOfTextAtSize(content, actualSize);
  const x = align === 'right' ? geometry.width - margin - textWidth : align === 'center' ? (geometry.width - textWidth) / 2 : margin;
  const ascent = font.heightAtSize(actualSize, { descender: false });
  const y = top ? geometry.height - margin - ascent : margin;
  page.drawText(content, { x, y, size: actualSize, font, color: color(hex, '#53635d') });
}

async function drawHeaderFooter(page, geometry, setting, getFont, pageNumber, total) {
  const size = number(setting.size, 10, 4, 48);
  const margin = number(setting.margin, 28, 4, Math.min(geometry.width, geometry.height) / 3);
  const usable = Math.max(1, geometry.width - margin * 2);
  for (const edge of ['header', 'footer']) {
    const slots = ['Left', 'Center', 'Right'].filter((slot) => textValue(setting[edge + slot]).trim());
    const maxWidth = usable / (slots.length > 1 ? 3 : 1) - (slots.length > 1 ? 8 : 0);
    for (const slot of slots) {
      await drawMarginText(page, geometry, variables(setting[edge + slot], pageNumber, total), { size, margin, align: slot.toLowerCase(), top: edge === 'header', hex: setting.color, maxWidth }, getFont);
    }
  }
}

async function drawPageNumbers(page, geometry, setting, getFont, pageNumber, total) {
  const size = number(setting.size, 10, 4, 48);
  const margin = number(setting.margin, 28, 4, Math.min(geometry.width, geometry.height) / 3);
  const position = setting.position || 'bottom-center';
  const text = variables(setting.format || 'Page {page} of {total}', pageNumber + number(setting.start, 1, 0, 1000000) - 1, total);
  await drawMarginText(page, geometry, text, { size, margin, align: position.endsWith('right') ? 'right' : position.endsWith('left') ? 'left' : 'center', top: position.startsWith('top'), hex: setting.color, maxWidth: geometry.width - margin * 2 }, getFont);
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
  for (let index = 0; index < outputPages.length; index++) {
    const page = outputPages[index];
    const descriptor = descriptors[index];
    const sourceRotation = page.getRotation().angle;
    const originalBox = visibleGeometry(page).cropBox;
    const descriptorRotation = descriptor.rotation || 0;
    page.setRotation(lib.degrees(rotation(sourceRotation + descriptorRotation)));
    const geometry = croppedGeometry(page, originalBox, page.getRotation().angle, descriptor.crop, descriptorRotation);
    if (descriptor.crop) {
      const { x, y, width, height } = geometry.cropBox;
      page.setCropBox(x, y, width, height);
    }
    for (const annotation of annotations.filter((item) => item.pageId === descriptor.id)) {
      const placementDescriptorRotation = annotation.pageRotation ?? descriptorRotation;
      const placementRotation = sourceRotation + rotation(placementDescriptorRotation);
      const placementGeometry = croppedGeometry(page, originalBox, placementRotation, annotation.pageCrop, placementDescriptorRotation);
      page.pushOperators(lib.pushGraphicsState(), lib.concatTransformationMatrix(...placementGeometry.matrix));
      await drawAnnotation(doc, page, placementGeometry, annotation, getFont);
      page.pushOperators(lib.popGraphicsState());
    }
    page.pushOperators(lib.pushGraphicsState(), lib.concatTransformationMatrix(...geometry.matrix));
    if (applies(state.watermark, descriptor.id)) await drawWatermark(page, geometry, state.watermark, getFont, index + 1, outputPages.length);
    if (applies(state.headerFooter, descriptor.id)) await drawHeaderFooter(page, geometry, state.headerFooter, getFont, index + 1, outputPages.length);
    if (applies(state.pageNumbers, descriptor.id)) await drawPageNumbers(page, geometry, state.pageNumbers, getFont, index + 1, outputPages.length);
    page.pushOperators(lib.popGraphicsState());
    onProgress(0.1 + 0.8 * (index + 1) / outputPages.length);
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
