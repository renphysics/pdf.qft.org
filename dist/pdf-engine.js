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
 * Encrypted PDFs open with their password (openPdf), or without one when they
 * only restrict changes; the editor works on an unencrypted copy in memory.
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

const subsetAdapters = new WeakMap();
/**
 * @cantoo/pdf-lib serializes a font subset with subset.encode() when that
 * method exists, as fontkit 2 provides it. @pdf-lib/fontkit 1.1.1 also has an
 * encode(), but an internal one that needs a stream, so its subsets are offered
 * with only encodeStream(), which pdf-lib uses otherwise. A fontkit whose
 * encode() takes no arguments is used as it is.
 */
function subsetCompatible(fontkit) {
  if (!subsetAdapters.has(fontkit)) {
    subsetAdapters.set(fontkit, {
      create(...args) {
        const font = fontkit.create(...args);
        if (typeof font?.createSubset !== 'function') return font;
        const createSubset = font.createSubset.bind(font);
        font.createSubset = () => {
          const subset = createSubset();
          if (typeof subset.encode !== 'function' || subset.encode.length === 0 || typeof subset.encodeStream !== 'function') {
            return subset;
          }
          return { cff: subset.cff, includeGlyph: (glyph) => subset.includeGlyph(glyph), encodeStream: () => subset.encodeStream() };
        };
        return font;
      },
    });
  }
  return subsetAdapters.get(fontkit);
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

// SASLprep (RFC 4013) maps these spaces to a space and drops these invisible characters.
const PASSWORD_SPACES = /[   -​  　]/g;
const PASSWORD_IGNORED = /[­͏᠆᠋-᠍‌‍⁠︀-️﻿]/g;
/**
 * A password prepared as PDF 2.0 asks for AES-256: SASLprep's mapping, then
 * NFKC, so that a password typed with, for example, full-width characters
 * matches the one another app stored.
 */
function preparedPassword(password) {
  return password.replace(PASSWORD_SPACES, ' ').replace(PASSWORD_IGNORED, '').normalize('NFKC');
}

/** Why a password can't protect a PDF, or null if it can. */
export function passwordProblem(password) {
  if (typeof password !== 'string' || !password) return 'Enter a password to protect your PDF.';
  // Includes C1 controls, which SASLprep also prohibits.
  if (/[\u0000-\u001F\u007F-\u009F]/.test(password)) return 'Passwords can’t contain control characters.';
  // PDF readers use the first 127 bytes of a password.
  if (new TextEncoder().encode(preparedPassword(password)).length > 127) return 'This password is too long. Use a shorter one.';
  return null;
}

/** A PDF that needs a password: error.code is 'password-required' or 'password-incorrect'. */
function passwordError(code, cause) {
  const error = new Error(code === 'password-incorrect'
    ? 'That password didn’t open this PDF. Check it and try again.'
    : 'This PDF is password-protected. Enter its password to open it.', { cause });
  error.code = code;
  return error;
}

/**
 * Load a PDF, decrypting it if it is encrypted. Without a password, the empty
 * password is tried: it opens PDFs that only restrict changes or copying
 * (they have an owner password but no password to open them).
 */
export async function loadPdf(bytes, password = '') {
  const lib = await loadPdfLib();
  const data = bytesOf(bytes);
  const attempts = [password];
  if (password && preparedPassword(password) !== password) attempts.push(preparedPassword(password));
  let doc;
  for (let attempt = 0; !doc; attempt++) {
    try {
      doc = await lib.PDFDocument.load(data, { updateMetadata: false, password: attempts[attempt] });
    } catch (error) {
      const message = String(error?.message);
      if (message === 'NEEDS PASSWORD') throw passwordError('password-required', error);
      if (message === 'Password incorrect') {
        if (attempt + 1 < attempts.length) continue;
        throw passwordError('password-incorrect', error);
      }
      if (/encrypt|key length/i.test(message)) {
        throw new Error('This PDF is protected in a way QFT PDF can’t open, such as with a certificate. Remove the protection in the app that made it, then try again.', { cause: error });
      }
      // Keep the parser's own error as the cause; it is logged with the message.
      throw new Error('This file could not be opened as a PDF. Try opening it in a PDF reader and saving a new copy.', { cause: error });
    }
  }
  if (!doc.getPageCount()) throw new Error('This PDF has no pages.');
  // Decrypting leaves the encryption dictionary behind with nothing referring to
  // it. Drop it: its password hashes should not travel with an unlocked copy.
  if (doc.context.isDecrypted) {
    const name = (key) => lib.PDFName.of(key);
    for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
      if (object instanceof lib.PDFDict && object.get(name('Filter')) === name('Standard') && object.has(name('O')) && object.has(name('U'))) doc.context.delete(ref);
    }
  }
  return doc;
}

const writersEncryptingStrings = new WeakSet();
/**
 * Make saving encrypt the strings in the objects it writes outside object
 * streams. @cantoo/pdf-lib 2.11.1 encrypts stream contents only, so strings in
 * the catalog (such as the document's language), on pages, in stream
 * dictionaries, and everywhere when object streams are off, were written as
 * plain text that readers then decrypt into garbage. Strings inside an object
 * stream are covered by the stream's own encryption, and the encryption
 * dictionary is never encrypted. Nested dictionaries and arrays are replaced
 * by encrypted copies, so one shared by two objects is not encrypted twice.
 */
function encryptStringsWhenSaving(lib) {
  const writer = lib.PDFWriter.prototype;
  if (writersEncryptingStrings.has(writer)) return;
  const encryptStream = writer.encrypt;
  writer.encrypt = function (ref, object, security) {
    if (!(object instanceof lib.PDFObjectStream) && ref !== this.context.trailerInfo.Encrypt) {
      const encrypt = security.getEncryptFn(ref.objectNumber, ref.generationNumber);
      const encrypted = (value) => {
        if (value instanceof lib.PDFString || value instanceof lib.PDFHexString) return lib.PDFHexString.fromBytes(encrypt(value.asBytes()));
        if (value instanceof lib.PDFArray) {
          const copy = lib.PDFArray.withContext(this.context);
          for (const item of value.asArray()) copy.push(encrypted(item));
          return copy;
        }
        if (value instanceof lib.PDFDict) {
          const copy = lib.PDFDict.withContext(this.context);
          for (const [key, item] of value.entries()) copy.set(key, encrypted(item));
          return copy;
        }
        return value;
      };
      const target = object instanceof lib.PDFStream ? object.dict : object;
      if (target instanceof lib.PDFDict) for (const [key, value] of target.entries()) target.set(key, encrypted(value));
      else if (target instanceof lib.PDFArray) target.asArray().forEach((value, index) => target.set(index, encrypted(value)));
    }
    return encryptStream.call(this, ref, object, security);
  };
  writersEncryptingStrings.add(writer);
}

/**
 * Require a password to open the document when it is saved: AES-256, with the
 * same password as owner password and every permission allowed, so whoever
 * has the password can also print, copy and change it. Used by workflows.js.
 */
export function protectDocument(doc, password) {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const lib = library();
  encryptStringsWhenSaving(lib);
  const prepared = preparedPassword(password);
  doc.encrypt({
    userPassword: prepared,
    ownerPassword: prepared,
    permissions: { printing: 'highResolution', modifying: true, copying: true, annotating: true, fillingForms: true, contentAccessibility: true, documentAssembly: true },
  });
}

/** The page as viewers display it: CropBox ∩ MediaBox at the page's /Rotate. */
function visibleGeometry(page) {
  return boxGeometry(visibleBox(page.getMediaBox(), page.getCropBox()), page.getRotation().angle);
}

/** The document's XMP metadata as text, or null. */
function metadataXml(doc) {
  try {
    const lib = library();
    const stream = doc.catalog.lookup(lib.PDFName.of('Metadata'));
    if (!(stream instanceof lib.PDFRawStream)) return null;
    return new TextDecoder().decode(lib.decodePDFRawStream(stream).decode());
  } catch {
    return null;
  }
}

/** The PDF/A part (1–4) a document declares in its XMP metadata, or null. */
function pdfaPart(doc) {
  const xml = metadataXml(doc);
  const match = xml && (/<pdfaid:part>\s*(\d)\s*<\/pdfaid:part>/.exec(xml) || /\bpdfaid:part\s*=\s*["'](\d)["']/.exec(xml));
  return match ? Number(match[1]) : null;
}

/**
 * Stop the document claiming PDF/A conformance, keeping the rest of its
 * metadata. Used when added content (non-embedded standard fonts,
 * transparency) means the result can no longer meet PDF/A rules.
 */
function removePdfaIdentification(doc) {
  const lib = library();
  const xml = metadataXml(doc);
  if (!xml) return;
  const cleaned = xml
    .replace(/\s*<pdfaid:(part|conformance|amd|rev|corr)>[\s\S]*?<\/pdfaid:\1>/g, '')
    .replace(/\s+pdfaid:(part|conformance|amd|rev|corr)\s*=\s*(?:"[^"]*"|'[^']*')/g, '');
  const stream = doc.context.stream(new TextEncoder().encode(cleaned), { Type: 'Metadata', Subtype: 'XML' });
  const name = lib.PDFName.of('Metadata');
  const ref = doc.catalog.get(name);
  if (ref instanceof lib.PDFRef) doc.context.assign(ref, stream);
  else doc.catalog.set(name, doc.context.register(stream));
}

function describePdf(doc) {
  const pages = doc.getPages().map((page, index) => {
    const { width, height, rotation, cropBox } = visibleGeometry(page);
    return { index, width, height, rotation, cropBox };
  });
  return { pages, pageCount: pages.length, hasForm: doc.getForm().getFields().length > 0, pdfa: pdfaPart(doc), encrypted: Boolean(doc.context.isDecrypted) };
}

/**
 * Page sizes in visible orientation, for layout before rendering, whether the
 * PDF has interactive form fields (they limit merging and extracting), the
 * PDF/A part it declares, if any, and whether it is encrypted.
 */
export async function inspectPdf(bytes, { password = '' } = {}) {
  return describePdf(await loadPdf(bytes, password));
}

/**
 * Open a PDF to edit: what inspectPdf tells, plus `bytes` to edit. For an
 * encrypted PDF they are an unencrypted copy (the password is not kept), and
 * `protection` says how it was protected: 'owner' when it opened without a
 * password (it only restricted changes or copying), or 'password'. Otherwise
 * `bytes` are the bytes given and `protection` is null.
 */
export async function openPdf(bytes, { password = '' } = {}) {
  const doc = await loadPdf(bytes, password);
  if (!doc.context.isDecrypted) return { ...describePdf(doc), bytes, protection: null };
  // Saved before describePdf, whose form check can add an empty form to the document.
  const unlocked = await doc.save({ useObjectStreams: pdfaPart(doc) !== 1, updateFieldAppearances: false, addDefaultPage: false });
  return { ...describePdf(doc), bytes: unlocked, protection: password ? 'password' : 'owner' };
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
        doc.registerFontkit(subsetCompatible(await loadFontkit()));
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
  if (!text.trim()) return false;
  const font = await fontFor(getFont, text, pageIndex, annotation.id);
  const layout = layoutTextAnnotation(annotation, geometry, font);
  if (layout.problem) throw pageError(layout.problem, pageIndex, annotation.id);
  const options = { font, size: layout.size, color: color(annotation.color), opacity: number(annotation.opacity, 1, 0, 1) };
  for (const line of layout.lines) page.drawText(line.text, { ...options, x: line.x, y: line.y });
  return layout.lines.length > 0;
}

async function drawAnnotation(doc, page, geometry, annotation, getFont, pageIndex) {
  if (annotation.type === 'text') return drawTextAnnotation(page, geometry, annotation, getFont, pageIndex);
  const rect = layoutRect(annotation, geometry);
  if (!rect) return false;
  const options = { ...rect, opacity: number(annotation.opacity, 1, 0, 1) };
  if (annotation.type === 'highlight') {
    page.drawRectangle({ ...options, color: color(annotation.color, '#f5d85c'), opacity: number(annotation.opacity, 0.3, 0, 1), blendMode: library().BlendMode.Multiply });
    return true;
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
    return true;
  }
  return false;
}

async function drawWatermark(page, geometry, setting, getFont, pageIndex, total) {
  const text = watermarkText(setting, pageIndex + 1, total);
  if (!text.trim()) return false;
  const font = await fontFor(getFont, text, pageIndex, 'watermark');
  const mark = layoutWatermark(setting, geometry, font, text);
  page.drawText(text, {
    x: mark.x, y: mark.y, size: mark.size, font, color: color(setting.color, '#85948e'),
    opacity: number(setting.opacity, 0.15, 0, 1), rotate: library().degrees(mark.angle),
  });
  return true;
}

async function drawMarginItems(page, geometry, items, hex, getFont, pageIndex, fallback) {
  let drew = false;
  for (const item of items) {
    if (!item.text.trim()) continue;
    const font = await fontFor(getFont, item.text, pageIndex, item.key);
    const placed = layoutMarginText(geometry, item, font);
    if (placed.problem) throw pageError(placed.problem, pageIndex, item.key);
    page.drawText(placed.text, { x: placed.x, y: placed.y, size: placed.size, font, color: color(hex, fallback) });
    drew = true;
  }
  return drew;
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
  return (await buildPdfWithNotes(state, onProgress)).bytes;
}

/** The password a state's protection setting asks for, or null when it is off. */
function protectionPassword(protection) {
  if (!protection || protection.enabled === false) return null;
  const problem = passwordProblem(protection.password);
  if (problem) throw new Error(problem);
  return protection.password;
}

/**
 * Like buildPdf, with notes about the result for the person downloading it.
 * The source declared PDF/A, and the copy no longer does: 'pdfa-removed'
 * because of the added content (PDF/A forbids standard fonts that are not
 * embedded, and PDF/A-1 also forbids transparency), 'pdfa-removed-password'
 * because PDF/A forbids encryption. state.protection, when on, makes the copy
 * need its password ({ enabled, password }).
 */
export async function buildPdfWithNotes(state, onProgress = () => {}) {
  const lib = await loadPdfLib();
  const sources = state?.sources || [];
  const descriptors = state?.pages || [];
  if (!descriptors.length) throw new Error('Keep at least one page before exporting your PDF.');
  const password = protectionPassword(state.protection);
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
  // The PDF/A part the kept document declares. Copied pages start a fresh,
  // undeclared document.
  let pdfa = null;
  const completeSource = oneSource && descriptors.length === loaded.get(needed[0]).getPageCount();
  if (completeSource && noDuplicates) {
    doc = loaded.get(needed[0]);
    pdfa = pdfaPart(doc);
    const originalPages = doc.getPages();
    outputPages = descriptors.map((descriptor) => originalPages[descriptor.index]);
    // Reuse original PDFPage objects to preserve the original document's form tree.
    // Pages in their original order stay in place. To reorder, take every page out
    // of the page tree and add them back; removePage also deletes the page object,
    // so each one is registered again under its own reference (outlines, links and
    // form widgets that point at a page keep working).
    if (outputPages.some((page, index) => page !== originalPages[index])) {
      for (let index = doc.getPageCount() - 1; index >= 0; index--) doc.removePage(index);
      for (const page of outputPages) {
        doc.context.assign(page.ref, page.node);
        doc.addPage(page);
      }
    }
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
  let added = false;
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
      added = (await drawAnnotation(doc, page, placement, annotation, getFont, index)) || added;
      page.pushOperators(lib.popGraphicsState());
    }
    page.pushOperators(lib.pushGraphicsState(), lib.concatTransformationMatrix(...geometry.matrix));
    if (applies(state.watermark, descriptor.id)) added = (await drawWatermark(page, geometry, state.watermark, getFont, index, total)) || added;
    if (applies(state.headerFooter, descriptor.id)) {
      added = (await drawMarginItems(page, geometry, headerFooterItems(state.headerFooter, geometry, index + 1, total), state.headerFooter.color, getFont, index, '#53635d')) || added;
    }
    if (applies(state.pageNumbers, descriptor.id)) {
      added = (await drawMarginItems(page, geometry, [pageNumberItem(state.pageNumbers, geometry, index + 1, total)], state.pageNumbers.color, getFont, index, '#53635d')) || added;
    }
    page.pushOperators(lib.popGraphicsState());
    onProgress(0.1 + 0.8 * (index + 1) / total);
    // Give the browser time to paint progress during larger exports.
    if (index % 10 === 9) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const notes = [];
  if (pdfa && (added || password)) {
    removePdfaIdentification(doc);
    pdfa = null;
    if (added) notes.push('pdfa-removed');
    if (password) notes.push('pdfa-removed-password');
  }
  if (password) protectDocument(doc, password);
  // Object streams keep files small, but PDF/A-1 forbids them.
  const output = await doc.save({ useObjectStreams: pdfa !== 1 });
  onProgress(1);
  return { bytes: output, notes };
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
