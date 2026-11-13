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
 * A descriptor's paper ('a4' | 'letter') puts the page, as all of that leaves
 * it, on a sheet of that size (layout.js: fittedGeometry); annotation pagePaper
 * records the sheet an annotation was placed on.
 * All operations return new bytes; the input byte arrays remain untouched.
 * Encrypted PDFs open with their password (openPdf), or without one when they
 * only restrict changes; the editor works on an unencrypted copy in memory.
 * Form fields are described when a PDF opens (formFields), filled from
 * state.formValues on export, and flattened into their pages when
 * state.flattenForms is on, which also lets their pages be combined.
 *
 * Geometry and text layout live in layout.js, shared with the editor preview.
 */
import {
  applies,
  boxGeometry,
  contentBox,
  drawingPath,
  fontKind,
  headerFooterItems,
  hexColor,
  invert,
  layoutMarginText,
  layoutRect,
  layoutTextAnnotation,
  layoutWatermark,
  number,
  pageGeometry,
  PAPER_SIZES,
  pageNumberItem,
  pageVariables,
  placementGeometry,
  rotation,
  textValue,
  unsupportedCharacter,
  unsupportedMessage,
  visibleBox,
  watermarkText,
  wrapText,
} from './layout.js';

export { contentMargins, cropMarginsForRotation } from './layout.js';

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

/**
 * Run a bundled library script: a script tag in a page; a module import in a
 * worker. Run as a module, a bundle's top-level `var` stays inside the module.
 * fontkit's bundle also exports through CommonJS when a `module` exists, so in
 * a worker it gets one for the import, and its export becomes the global.
 */
async function runScript(name, url) {
  if (typeof document === 'undefined') {
    if (name !== 'fontkit') return import(url);
    const commonjs = { exports: {} };
    globalThis.module = commonjs;
    try {
      await import(url);
    } finally {
      delete globalThis.module;
    }
    if (typeof commonjs.exports?.create === 'function') globalThis.fontkit = commonjs.exports;
    return;
  }
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
  if (typeof document === 'undefined' && typeof WorkerGlobalScope === 'undefined')
    return Promise.reject(new Error(failure));
  if (!scriptLoads.has(name)) {
    const loading = runScript(name, VENDOR_SCRIPTS[name].href).then(
      () => globalThis[name] || Promise.reject(new Error(failure)),
      () => Promise.reject(new Error(failure)),
    );
    // A failed download (for example while offline) can be retried later.
    scriptLoads.set(
      name,
      loading.catch((error) => {
        scriptLoads.delete(name);
        throw error;
      }),
    );
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
  if (!globalThis.PDFLib)
    throw new Error('The PDF tools did not load. Check your connection, then try again.');
  return globalThis.PDFLib;
}

function bytesOf(bytes) {
  if (bytes instanceof Uint8Array) return bytes.slice();
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes.slice(0));
  if (ArrayBuffer.isView(bytes))
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).slice();
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
  if (new TextEncoder().encode(preparedPassword(password)).length > 127)
    return 'This password is too long. Use a shorter one.';
  return null;
}

/** A PDF that needs a password: error.code is 'password-required' or 'password-incorrect'. */
function passwordError(code, cause) {
  const error = new Error(
    code === 'password-incorrect'
      ? 'That password didn’t open this PDF. Check it and try again.'
      : 'This PDF is password-protected. Enter its password to open it.',
    { cause },
  );
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
        throw new Error(
          'This PDF is protected in a way QFT PDF can’t open, such as with a certificate. Remove the protection in the app that made it, then try again.',
          { cause: error },
        );
      }
      // Keep the parser's own error as the cause; it is logged with the message.
      throw new Error(
        'This file could not be opened as a PDF. Try opening it in a PDF reader and saving a new copy.',
        { cause: error },
      );
    }
  }
  // A file can parse without a usable page tree (a header and little else).
  let pageCount;
  try {
    pageCount = doc.getPageCount();
  } catch (error) {
    throw new Error(
      'This file could not be opened as a PDF. Try opening it in a PDF reader and saving a new copy.',
      { cause: error },
    );
  }
  if (!pageCount) throw new Error('This PDF has no pages.');
  if (doc.context.isDecrypted && !doc.context.trailerInfo.Info) await restoreTrailer(lib, doc, data);
  // Decrypting leaves the encryption dictionary behind with nothing referring to
  // it. Drop it: its password hashes should not travel with an unlocked copy.
  if (doc.context.isDecrypted) {
    const name = (key) => lib.PDFName.of(key);
    for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
      if (
        object instanceof lib.PDFDict &&
        object.get(name('Filter')) === name('Standard') &&
        object.has(name('O')) &&
        object.has(name('U'))
      )
        doc.context.delete(ref);
    }
  }
  return doc;
}

/**
 * Give a decrypted document back the Info (its title, author and the rest) and
 * the ID that its file's trailer names. @cantoo/pdf-lib 2.11.1 decrypts every
 * stream it parses, a cross-reference stream too, which is never encrypted
 * (PDFObjectParser.js, parseDictOrStream). The garbled stream is not read as
 * a cross-reference, so the trailer it carries is lost: Unlock PDF, and every
 * edit of a protected PDF, dropped the document's details. Every file that
 * Protect PDF writes has such a stream. Read without decrypting, the trailer
 * is whole; its Info is a reference, which the decrypted document resolves.
 * Remove this once pdf-lib keeps the trailer of an encrypted file with a
 * cross-reference stream (tests/engine.test.mjs, "unlocking keeps the title").
 */
async function restoreTrailer(lib, doc, data) {
  let trailer;
  try {
    trailer = (await lib.PDFDocument.load(data, { ignoreEncryption: true, updateMetadata: false })).context
      .trailerInfo;
  } catch {
    // The file opened, without its details; it still opens.
    return;
  }
  if (trailer.Info && doc.context.lookup(trailer.Info) instanceof lib.PDFDict)
    doc.context.trailerInfo.Info = trailer.Info;
  if (trailer.ID && !doc.context.trailerInfo.ID) doc.context.trailerInfo.ID = trailer.ID;
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
        if (value instanceof lib.PDFString || value instanceof lib.PDFHexString)
          return lib.PDFHexString.fromBytes(encrypt(value.asBytes()));
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
      if (target instanceof lib.PDFDict)
        for (const [key, value] of target.entries()) target.set(key, encrypted(value));
      else if (target instanceof lib.PDFArray)
        target.asArray().forEach((value, index) => target.set(index, encrypted(value)));
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
    permissions: {
      printing: 'highResolution',
      modifying: true,
      copying: true,
      annotating: true,
      fillingForms: true,
      contentAccessibility: true,
      documentAssembly: true,
    },
  });
}

/** The page as viewers display it: CropBox ∩ MediaBox at the page's /Rotate. */
function visibleGeometry(page) {
  return boxGeometry(visibleBox(page.getMediaBox(), page.getCropBox()), page.getRotation().angle);
}

/** The size of a page's unit in points (/UserUnit): 1, unless the PDF says otherwise. */
function userUnit(page) {
  const { PDFName, PDFNumber } = library();
  const unit = page.node.lookup(PDFName.of('UserUnit'));
  return unit instanceof PDFNumber && unit.asNumber() > 0 ? unit.asNumber() : 1;
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
  const match =
    xml &&
    (/<pdfaid:part>\s*(\d)\s*<\/pdfaid:part>/.exec(xml) || /\bpdfaid:part\s*=\s*["'](\d)["']/.exec(xml));
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

// ---- Forms ---------------------------------------------------------------------

// Annotation flags: Hidden and NoView widgets are not shown.
const NOT_SHOWN = 2 | 32;

/** PDF.js names a widget after its object: "12R", or "12R1" in generation 1. */
function annotationId(ref) {
  return ref ? `${ref.objectNumber}R${ref.generationNumber ? ref.generationNumber : ''}` : null;
}

function decodedText(object) {
  return object && typeof object.decodeText === 'function' ? object.decodeText() : null;
}

/** What a field is called on screen: its tooltip, else the last part of its name. */
function fieldLabel(field) {
  return (
    decodedText(field.acroField.dict.lookup(library().PDFName.of('TU')))?.trim() ||
    field.getName().split('.').pop()
  );
}

/** A field's text size (0: automatic) and colour, from a default appearance such as "/Helv 0 Tf 0 g". */
function appearanceStyle(da = '') {
  const size = /(-?[\d.]+)\s+Tf\b/.exec(da);
  const gray = /(?:^|\s)([\d.]+)\s+g\b/.exec(da);
  const rgb = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg\b/.exec(da);
  const hex = (value) =>
    Math.round(Math.min(1, Math.max(0, Number(value))) * 255)
      .toString(16)
      .padStart(2, '0');
  const color = rgb ? `#${rgb.slice(1).map(hex).join('')}` : gray ? `#${hex(gray[1]).repeat(3)}` : '#000000';
  return { fontSize: size ? Math.max(0, Number(size[1])) : 0, color };
}

function fieldKind(field) {
  const lib = library();
  if (field instanceof lib.PDFTextField) return 'text';
  if (field instanceof lib.PDFCheckBox) return 'checkbox';
  if (field instanceof lib.PDFRadioGroup) return 'radio';
  if (field instanceof lib.PDFDropdown) return 'dropdown';
  if (field instanceof lib.PDFOptionList) return 'list';
  if (field instanceof lib.PDFSignature) return 'signature';
  return 'button';
}

/** A field's value: text, true or false for a check box, a chosen option, or chosen options for a list. */
function fieldValue(field, kind) {
  if (kind === 'text') return field.getText() ?? '';
  if (kind === 'checkbox') return field.isChecked();
  if (kind === 'radio') return field.getSelected() ?? null;
  if (kind === 'dropdown') return field.getSelected()[0] ?? '';
  if (kind === 'list') return field.getSelected();
  return null;
}

function hasAcroForm(doc) {
  const lib = library();
  return Boolean(doc.catalog.lookupMaybe(lib.PDFName.of('AcroForm'), lib.PDFDict));
}

/**
 * The fields of a PDF's form, to fill in: for each field with a visible widget,
 * its name, kind, label (the tooltip, else the last part of the name), value
 * and settings, and each widget's page, rectangle (PDF user space) and the
 * ID PDF.js knows it by. `count` includes fields without a visible widget.
 * `xfa`: the form also has an XFA version (some readers show that instead).
 * `scripts`: it has calculations or actions, which do not run here. Null when
 * the PDF has no form.
 */
function formFields(doc) {
  const lib = library();
  if (!hasAcroForm(doc)) return null;
  const acroForm = doc.catalog.lookup(lib.PDFName.of('AcroForm'), lib.PDFDict);
  const xfa = acroForm.has(lib.PDFName.of('XFA'));
  let scripts = acroForm.has(lib.PDFName.of('CO'));
  let form;
  try {
    form = doc.getForm();
  } catch {
    return null;
  }
  const all = form.getFields();
  const pages = doc.getPages();
  const fields = [];
  for (const field of all) {
    const kind = fieldKind(field);
    const dict = field.acroField.dict;
    scripts ||= dict.has(lib.PDFName.of('AA'));
    const name = field.getName();
    const options = ['radio', 'dropdown', 'list'].includes(kind) ? field.getOptions() : [];
    const widgets = [];
    field.acroField.getWidgets().forEach((widget, index) => {
      scripts ||= widget.dict.has(lib.PDFName.of('AA'));
      const flags = widget.dict.lookup(lib.PDFName.of('F'));
      if (flags instanceof lib.PDFNumber && flags.asNumber() & NOT_SHOWN) return;
      let pageIndex = -1;
      try {
        pageIndex = pages.indexOf(form.findWidgetPage(widget));
      } catch {
        return;
      }
      const { x, y, width, height } = widget.getRectangle();
      if (pageIndex < 0 || !(width > 0 && height > 0)) return;
      const entry = {
        id: annotationId(doc.context.getObjectRef(widget.dict)),
        pageIndex,
        rect: [x, y, width, height],
      };
      // The option a radio button stands for (widgets list them in order).
      if (kind === 'radio') entry.option = options[index] ?? null;
      widgets.push(entry);
    });
    if (!widgets.length) continue;
    const entry = {
      name,
      kind,
      label: fieldLabel(field),
      value: fieldValue(field, kind),
      readOnly: field.isReadOnly(),
      required: field.isRequired(),
      widgets,
    };
    if (kind === 'text') {
      Object.assign(entry, {
        multiline: field.isMultiline(),
        maxLength: field.getMaxLength() ?? null,
        comb: field.isCombed(),
        password: field.isPassword(),
        align: field.getAlignment() ?? 0,
      });
    }
    if (kind === 'radio' || kind === 'dropdown' || kind === 'list') entry.options = [...new Set(options)];
    if (kind === 'list') entry.multiple = field.isMultiselect();
    if (kind === 'text' || kind === 'dropdown' || kind === 'list') {
      const da =
        field.acroField.getDefaultAppearance?.() ?? decodedText(acroForm.lookup(lib.PDFName.of('DA'))) ?? '';
      Object.assign(entry, appearanceStyle(da));
    }
    fields.push(entry);
  }
  return { fields, count: all.length, xfa, scripts };
}

const LINE_FACTOR = 1.35;
const twoDecimals = (value) => Math.floor(value * 100) / 100;

/**
 * The size of a field's text when its default appearance asks for an
 * automatic size (0), worked out as PDF.js does, so the download looks like
 * the editor's preview (and like most readers): one line fills the field's
 * height unless the text is too wide; several lines are about 12 pt, smaller
 * when the text does not fit; a list fits its longest option on each row.
 */
function automaticSize(kind, multiline, rect, font, text, options = []) {
  const width = rect.width - 4;
  const height = rect.height - 2;
  if (width <= 0 || height <= 0) return 4;
  const widthAtOne = (line) => font.widthOfTextAtSize(line, 1);
  const fit = (lineHeight, line) => {
    const lineWidth = widthAtOne(line);
    return twoDecimals(Math.min(lineHeight / LINE_FACTOR, lineWidth ? width / lineWidth : Infinity));
  };
  let size;
  if (kind === 'list') {
    const longest = options.reduce(
      (best, option) => (widthAtOne(option) > widthAtOne(best) ? option : best),
      '',
    );
    size = fit((rect.height - 1) / Math.max(1, options.length), longest);
  } else if (!multiline) {
    size = fit(height, text);
  } else {
    const lines = text.split('\n');
    const sizeFor = (count) => twoDecimals(height / count / LINE_FACTOR);
    const tooBig = (fontSize) => {
      let total = 0;
      for (const line of lines) {
        total += Math.max(1, wrapText(line, font, fontSize, width).length) * fontSize;
        if (total > height) return true;
      }
      return false;
    };
    let count = Math.max(Math.round(height / (12 * LINE_FACTOR)), lines.length, 1);
    if (tooBig(sizeFor(count))) {
      let low = count;
      let high = 2 * count;
      while (tooBig(sizeFor(high)) && high < 1000) {
        low = high;
        high *= 2;
      }
      while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        if (tooBig(sizeFor(middle))) low = middle;
        else high = middle;
      }
      count = high;
    }
    size = sizeFor(count);
  }
  return Math.min(Math.max(size, 1), 1000);
}

/** The text a field shows, to pick a font that has its characters. */
function shownText(field, kind) {
  if (kind === 'text') return field.getText() ?? '';
  if (kind === 'dropdown' || kind === 'list') return field.getSelected().join('\n');
  return '';
}

/**
 * Fill a document's form with values by field name, and flatten it when asked.
 * Changed fields get new appearances, in a font that has their characters;
 * their default appearance (the font and automatic size a reader uses when
 * the field is edited again) is kept. Check boxes and radio buttons keep
 * their own look. `fieldError(name, message)` makes an error for a field.
 */
async function fillForm(doc, values, { flatten, getFont, fieldError }) {
  const lib = library();
  const form = doc.getForm();
  // By name: pdf-lib makes new field objects on each call.
  const changed = new Set();
  for (const [name, value] of Object.entries(values || {})) {
    const field = form.getFieldMaybe(name);
    if (!field || field.isReadOnly()) continue;
    const kind = fieldKind(field);
    try {
      if (kind === 'text') {
        const text = String(value ?? '');
        const limit = field.getMaxLength();
        field.setText(text ? (limit === undefined ? text : text.slice(0, limit)) : undefined);
      } else if (kind === 'checkbox') {
        if (value) field.check();
        else field.uncheck();
      } else if (kind === 'radio' || kind === 'dropdown') {
        if (value) field.select(String(value));
        else field.clear();
      } else if (kind === 'list') {
        const chosen = (Array.isArray(value) ? value : [value]).filter(Boolean).map(String);
        if (chosen.length) field.select(chosen);
        else field.clear();
      } else continue;
    } catch (error) {
      throw fieldError(name, `“${fieldLabel(field)}” can’t take this value. ${error.message}`);
    }
    changed.add(name);
  }
  const da = lib.PDFName.of('DA');
  for (const field of form.getFields()) {
    const kind = fieldKind(field);
    if (!changed.has(field.getName()) && !(flatten && field.needsAppearancesUpdate())) continue;
    if (kind === 'checkbox' || kind === 'radio') {
      if (field.needsAppearancesUpdate()) field.updateAppearances();
      continue;
    }
    if (kind !== 'text' && kind !== 'dropdown' && kind !== 'list') continue;
    let font;
    try {
      font = await getFont(shownText(field, kind));
    } catch (error) {
      if (error.unsupported) throw fieldError(field.getName(), `“${fieldLabel(field)}”: ${error.message}`);
      throw error;
    }
    const kept = [field.acroField.dict, ...field.acroField.getWidgets().map((widget) => widget.dict)].map(
      (dict) => [dict, dict.get(da)],
    );
    // An automatic size is worked out for each widget, and given to pdf-lib in the
    // widget's default appearance while it draws (the original is restored below).
    const appearance =
      field.acroField.getDefaultAppearance?.() ??
      decodedText(form.acroForm.dict.lookup(da)) ??
      '/Helv 0 Tf 0 g';
    if (!appearanceStyle(appearance).fontSize) {
      const text = shownText(field, kind);
      const options = kind === 'list' ? field.getOptions() : [];
      for (const widget of field.acroField.getWidgets()) {
        const size = automaticSize(
          kind,
          kind === 'text' && field.isMultiline(),
          widget.getRectangle(),
          font,
          text,
          options,
        );
        const sized = /-?[\d.]+\s+Tf\b/.test(appearance)
          ? appearance.replace(/-?[\d.]+(\s+Tf\b)/, `${size}$1`)
          : `/Helv ${size} Tf 0 g`;
        widget.dict.set(da, lib.PDFString.of(sized));
      }
    }
    field.updateAppearances(font);
    for (const [dict, value] of kept) {
      if (value === undefined) dict.delete(da);
      else dict.set(da, value);
    }
  }
  if (flatten) flattenForm(form);
  return changed.size > 0 || flatten;
}

/** Draw each visible field on its page as it looks, then remove the form's fields (pdf-lib's flatten draws hidden ones too). */
function flattenForm(form) {
  const lib = library();
  const flagsName = lib.PDFName.of('F');
  for (const field of form.getFields()) {
    for (const widget of field.acroField.getWidgets()) {
      const flags = widget.dict.lookup(flagsName);
      if (flags instanceof lib.PDFNumber && flags.asNumber() & NOT_SHOWN) continue;
      try {
        form.flattenWidgetOntoPage(
          form.findWidgetPage(widget),
          widget,
          form.findWidgetAppearanceRef(field, widget),
        );
      } catch {
        // A widget without an appearance shows nothing.
      }
    }
    form.removeField(field);
  }
  form.flattenOrphanWidgets();
}

function describePdf(doc) {
  const pages = doc.getPages().map((page, index) => {
    const { width, height, rotation, cropBox } = visibleGeometry(page);
    return { index, width, height, rotation, cropBox, userUnit: userUnit(page) };
  });
  const form = formFields(doc);
  return {
    pages,
    pageCount: pages.length,
    hasForm: Boolean(form?.count),
    form,
    details: documentDetails(doc),
    pdfa: pdfaPart(doc),
    encrypted: Boolean(doc.context.isDecrypted),
  };
}

/** The details a PDF keeps about itself (Document properties shows them). */
function documentDetails(doc) {
  const created = detail(() => doc.getCreationDate());
  return {
    title: detail(() => doc.getTitle()) || '',
    author: detail(() => doc.getAuthor()) || '',
    subject: detail(() => doc.getSubject()) || '',
    keywords: detail(() => doc.getKeywords()) || '',
    language: detail(() => doc.getLanguage()) || '',
    creator: detail(() => doc.getCreator()) || '',
    producer: detail(() => doc.getProducer()) || '',
    created: created && !Number.isNaN(created.getTime()) ? created.toISOString() : '',
  };
}

/**
 * Page sizes in visible orientation, for layout before rendering, whether the
 * PDF has interactive form fields (they limit merging and extracting unless
 * flattened) and the fields to fill in (see formFields), the PDF/A part it
 * declares, if any, and whether it is encrypted.
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
  const unlocked = await doc.save({
    useObjectStreams: pdfaPart(doc) !== 1,
    updateFieldAppearances: false,
    addDefaultPage: false,
  });
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

/**
 * Download a font once. GitHub Pages lets browsers cache a file for ten
 * minutes only and marks every file as changed by a deploy, so the deployed
 * site keeps fonts (the CJK font is 16 MB) in Cache Storage under their
 * versioned URL (scripts/stamp-release.mjs: ?v=<hash of the file>), and a font
 * is downloaded again only when its bytes change. Without a version (a local
 * copy of the site), or where Cache Storage is unavailable, it is fetched as usual.
 */
async function fetchFont(url) {
  const version = new URLSearchParams(url.search).get('v');
  const store =
    /^[0-9a-f]{12}$/.test(version || '') && typeof caches !== 'undefined'
      ? await caches.open('qft-fonts').catch(() => null)
      : null;
  const cached = store && (await store.match(url.href).catch(() => null));
  if (cached) return new Uint8Array(await cached.arrayBuffer());
  const response = await fetch(url);
  if (!response.ok) throw new Error('font fetch');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (store) {
    // Only bytes that are the version the URL names are used and kept: a
    // captive portal or a proxy can answer 200 with a page of its own, and a
    // cut-off download is short. Neither may be drawn with or stay in the cache.
    const actual = await versionOf(bytes);
    if (actual && actual !== version) throw new Error('font fetch');
    if (actual) {
      // Only this version of the font is kept.
      const stale = (await store.keys().catch(() => [])).filter(
        (request) => new URL(request.url).pathname === url.pathname,
      );
      await Promise.all(stale.map((request) => store.delete(request))).catch(() => {});
      await store
        .put(url.href, new Response(bytes.slice(), { headers: { 'Content-Length': String(bytes.length) } }))
        .catch(() => {});
    }
  }
  return bytes;
}

/** The version the release stamp gives a file: the first 12 hex digits of its SHA-256. Null where hashing is unavailable. */
async function versionOf(bytes) {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', bytes).catch(() => null);
  return (
    digest && Array.from(new Uint8Array(digest, 0, 6), (byte) => byte.toString(16).padStart(2, '0')).join('')
  );
}

async function getFontBytes(kind) {
  if (!fontBytes.has(kind)) {
    fontBytes.set(
      kind,
      fetchFont(FONT_FILES[kind]).catch(() => {
        fontBytes.delete(kind);
        throw new Error('The font for this text could not be loaded. Check your connection, then try again.');
      }),
    );
  }
  return fontBytes.get(kind);
}

const PLAIN_GLYPHS = { liga: false, clig: false, calt: false };

/** One font per kind for a document, loaded when first needed. */
function fontLoader(doc) {
  const fonts = new Map();
  return (kind) => {
    if (!fonts.has(kind)) {
      const loading = (async () => {
        if (kind === 'standard') return doc.embedFont(library().StandardFonts.Helvetica);
        // fontkit is only needed for non-ASCII text, so it is fetched on demand.
        doc.registerFontkit(await loadFontkit());
        // Only the glyphs used are embedded. @cantoo/fontkit subsets the CJK
        // font's CFF outlines correctly (older fontkit's CFF subsets did not open
        // in every reader, so the whole 16 MB font used to be embedded).
        // Glyphs are plain, as the preview draws them (.ov-text in studio.css): no
        // ligatures or contextual alternates (in Hangul text the CJK font's calt
        // widens spaces). pdf-lib never applies kerning: each glyph keeps its own
        // advance width.
        return doc.embedFont(await getFontBytes(kind), { subset: true, features: PLAIN_GLYPHS });
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
    measuring = loadPdfLib()
      .then((lib) => lib.PDFDocument.create())
      .then(fontLoader);
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
  const options = {
    font,
    size: layout.size,
    color: color(annotation.color),
    opacity: number(annotation.opacity, 1, 0, 1),
  };
  for (const line of layout.lines) page.drawText(line.text, { ...options, x: line.x, y: line.y });
  return layout.lines.length > 0;
}

const embeddedImages = new WeakMap();
/**
 * An image embedded in the document, once per image: a signature placed on
 * every page is stored one time and drawn on each page. Placed copies share
 * the same bytes object, also after the editor's state reaches the worker.
 */
function embeddedImage(doc, annotation) {
  if (!embeddedImages.has(doc)) embeddedImages.set(doc, new Map());
  const images = embeddedImages.get(doc);
  if (!images.has(annotation.imageBytes)) {
    images.set(
      annotation.imageBytes,
      annotation.imageType === 'jpg' || annotation.imageType === 'jpeg'
        ? doc.embedJpg(annotation.imageBytes)
        : doc.embedPng(annotation.imageBytes),
    );
  }
  return images.get(annotation.imageBytes);
}

async function drawAnnotation(doc, page, geometry, annotation, getFont, pageIndex) {
  if (annotation.type === 'text') return drawTextAnnotation(page, geometry, annotation, getFont, pageIndex);
  if (annotation.type === 'drawing') {
    // The preview's path, from the top left of the frame; round ends and corners as in the preview.
    const { LineCapStyle, LineJoinStyle, setLineJoin } = library();
    const { d, strokeWidth } = drawingPath(annotation, geometry);
    page.pushOperators(setLineJoin(LineJoinStyle.Round));
    page.drawSvgPath(d, {
      x: 0,
      y: geometry.height,
      borderColor: color(annotation.color, '#d0342c'),
      borderWidth: strokeWidth,
      borderLineCap: LineCapStyle.Round,
    });
    return true;
  }
  const rect = layoutRect(annotation, geometry);
  if (!rect) return false;
  const options = { ...rect, opacity: number(annotation.opacity, 1, 0, 1) };
  if (annotation.type === 'highlight') {
    page.drawRectangle({
      ...options,
      color: color(annotation.color, '#f5d85c'),
      opacity: number(annotation.opacity, 0.3, 0, 1),
      blendMode: library().BlendMode.Multiply,
    });
    return true;
  } else if (annotation.type === 'image' || annotation.type === 'signature') {
    if (!annotation.imageBytes) throw new Error('Choose a PNG or JPEG image to add to the PDF.');
    try {
      page.drawImage(await embeddedImage(doc, annotation), options);
    } catch {
      throw new Error('This image could not be added. Choose a valid PNG or JPEG image.');
    }
    return true;
  }
  return false;
}

/**
 * In a tagged PDF (one with a structure tree, which screen readers follow),
 * what the export repeats on every page is marked as a pagination artifact of
 * its kind, so readers skip it: `/Artifact <</Type /Pagination /Subtype ...>>
 * BDC` ... `EMC` around each item. Null for an untagged PDF.
 */
function artifactMarker(doc) {
  const { PDFDict, PDFName, PDFOperator, PDFOperatorNames } = library();
  // A structure tree, as copyLosses has it: /MarkInfo alone tags nothing.
  if (!(doc.catalog.lookup(PDFName.of('StructTreeRoot')) instanceof PDFDict)) return null;
  return (subtype) =>
    PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
      PDFName.of('Artifact'),
      doc.context.obj({ Type: 'Pagination', Subtype: subtype }),
    ]);
}

async function drawWatermark(
  page,
  geometry,
  setting,
  getFont,
  pageIndex,
  total,
  artifact = null,
  extra = {},
) {
  const text = watermarkText(setting, pageIndex + 1, total, extra);
  if (!text.trim()) return false;
  const font = await fontFor(getFont, text, pageIndex, 'watermark');
  const mark = layoutWatermark(setting, geometry, font, text);
  if (artifact) page.pushOperators(artifact('Watermark'));
  page.drawText(text, {
    x: mark.x,
    y: mark.y,
    size: mark.size,
    font,
    color: color(setting.color, '#85948e'),
    opacity: number(setting.opacity, 0.15, 0, 1),
    rotate: library().degrees(mark.angle),
  });
  if (artifact) page.pushOperators(library().endMarkedContent());
  return true;
}

async function drawMarginItems(page, geometry, items, hex, getFont, pageIndex, fallback, artifact = null) {
  let drew = false;
  for (const item of items) {
    if (!item.text.trim()) continue;
    const font = await fontFor(getFont, item.text, pageIndex, item.key);
    const placed = layoutMarginText(geometry, item, font);
    if (placed.problem) throw pageError(placed.problem, pageIndex, item.key);
    if (artifact)
      page.pushOperators(
        artifact(item.key === 'pageNumber' ? 'PageNum' : item.key.startsWith('header') ? 'Header' : 'Footer'),
      );
    page.drawText(placed.text, {
      x: placed.x,
      y: placed.y,
      size: placed.size,
      font,
      color: color(hex, fallback),
    });
    if (artifact) page.pushOperators(library().endMarkedContent());
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
// ---- Copying pages ---------------------------------------------------------------
// Deleting, extracting, combining and splitting pages copy them into a new PDF.
// pdf-lib's copyPages copies everything a page refers to, so a link to another
// page would bring that whole page along: outside the page tree, unseen, but
// readable by any PDF tool, and the link would lead to the hidden copy. Here,
// links and bookmarks that lead to a copied page lead to its copy, those that
// lead to a page left behind are dropped, and nothing else on a copied page
// brings another page along. Document details and bookmarks, which belong to the
// document rather than its pages, are copied separately.

/** Whether a name tree (such as /EmbeddedFiles) has any entry. */
function nameTreeHasEntries(node, seen = new Set()) {
  const { PDFArray, PDFDict, PDFName } = library();
  if (!(node instanceof PDFDict) || seen.has(node)) return false;
  seen.add(node);
  const names = node.lookup(PDFName.of('Names'));
  if (names instanceof PDFArray && names.size() >= 2) return true;
  const kids = node.lookup(PDFName.of('Kids'));
  return (
    kids instanceof PDFArray &&
    kids.asArray().some((_, index) => nameTreeHasEntries(kids.lookup(index), seen))
  );
}

/** A number tree's values (such as /PageLabels), as [number, value] pairs. */
function numberTreeEntries(node, entries = [], seen = new Set()) {
  const { PDFArray, PDFDict, PDFName, PDFNumber } = library();
  if (!(node instanceof PDFDict) || seen.has(node)) return entries;
  seen.add(node);
  const nums = node.lookup(PDFName.of('Nums'));
  for (let index = 0; nums instanceof PDFArray && index + 1 < nums.size(); index += 2) {
    const key = nums.lookup(index);
    if (key instanceof PDFNumber) entries.push([key.asNumber(), nums.lookup(index + 1)]);
  }
  const kids = node.lookup(PDFName.of('Kids'));
  for (let index = 0; kids instanceof PDFArray && index < kids.size(); index++)
    numberTreeEntries(kids.lookup(index), entries, seen);
  return entries;
}

/**
 * What a PDF made from copied pages leaves out of `doc` (see the notes of
 * buildPdfWithNotes): page labels other than plain numbers from 1
 * ('labels-dropped'), attached files ('attachments-dropped'), and tags, the
 * structure screen readers use ('tags-dropped'). A part it cannot read is not
 * reported, rather than stopping the download.
 */
export function copyLosses(doc) {
  const { PDFDict, PDFName, PDFNumber } = library();
  const { catalog } = doc;
  const labelled = () => {
    const labels = numberTreeEntries(catalog.lookup(PDFName.of('PageLabels')));
    if (!labels.length) return false;
    const [[first, label]] = labels;
    if (labels.length > 1 || first !== 0 || !(label instanceof PDFDict)) return true;
    const start = label.lookup(PDFName.of('St'));
    const plain =
      label.get(PDFName.of('S')) === PDFName.of('D') &&
      !label.has(PDFName.of('P')) &&
      (start === undefined || (start instanceof PDFNumber && start.asNumber() === 1));
    return !plain;
  };
  const attached = () => {
    const names = catalog.lookup(PDFName.of('Names'));
    return names instanceof PDFDict && nameTreeHasEntries(names.lookup(PDFName.of('EmbeddedFiles')));
  };
  const tagged = () => catalog.lookup(PDFName.of('StructTreeRoot')) instanceof PDFDict;
  return [
    detail(labelled) && 'labels-dropped',
    detail(attached) && 'attachments-dropped',
    detail(tagged) && 'tags-dropped',
  ].filter(Boolean);
}

/** The notes of a PDF made by copying every page of `bytes` into a new one (a handout: see copyLosses). */
export async function copyNotes(bytes) {
  const lib = await loadPdfLib();
  return copyLosses(await lib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }));
}

/** Whether a PDF has a digital signature: a signature field (/FT /Sig) with a value. */
function isSigned(doc) {
  const { PDFArray, PDFDict, PDFName } = library();
  const form = doc.catalog.lookup(PDFName.of('AcroForm'));
  const seen = new Set();
  const signed = (field, type) => {
    if (!(field instanceof PDFDict) || seen.has(field)) return false;
    seen.add(field);
    const fieldType = field.get(PDFName.of('FT')) || type;
    if (fieldType === PDFName.of('Sig') && field.lookup(PDFName.of('V')) instanceof PDFDict) return true;
    const kids = field.lookup(PDFName.of('Kids'));
    return (
      kids instanceof PDFArray && kids.asArray().some((_, index) => signed(kids.lookup(index), fieldType))
    );
  };
  const fields = form instanceof PDFDict ? form.lookup(PDFName.of('Fields')) : null;
  return fields instanceof PDFArray && fields.asArray().some((_, index) => signed(fields.lookup(index)));
}

const destinationNames = new WeakMap();

/** A PDF's named destinations (its /Dests dictionary and /Names tree), by name. */
function namedDestinations(doc) {
  if (destinationNames.has(doc)) return destinationNames.get(doc);
  const { PDFArray, PDFDict, PDFName } = library();
  const names = new Map();
  const dests = doc.catalog.lookup(PDFName.of('Dests'));
  if (dests instanceof PDFDict)
    for (const [key, value] of dests.entries()) names.set(key.decodeText(), value);
  const seen = new Set();
  const walk = (node) => {
    if (!(node instanceof PDFDict) || seen.has(node)) return;
    seen.add(node);
    const pairs = node.lookup(PDFName.of('Names'));
    for (let index = 0; pairs instanceof PDFArray && index + 1 < pairs.size(); index += 2) {
      const key = pairs.lookup(index);
      if (typeof key?.decodeText === 'function') names.set(key.decodeText(), pairs.get(index + 1));
    }
    const kids = node.lookup(PDFName.of('Kids'));
    for (let index = 0; kids instanceof PDFArray && index < kids.size(); index++) walk(kids.lookup(index));
  };
  const tree = doc.catalog.lookup(PDFName.of('Names'));
  if (tree instanceof PDFDict) walk(tree.lookup(PDFName.of('Dests')));
  destinationNames.set(doc, names);
  return names;
}

/** A destination as [page, /XYZ, …], following names and references, or null. */
function explicitDestination(doc, destination) {
  const { PDFArray, PDFDict, PDFHexString, PDFName, PDFRef, PDFString } = library();
  let value = destination instanceof PDFRef ? doc.context.lookup(destination) : destination;
  if (value instanceof PDFName || value instanceof PDFString || value instanceof PDFHexString) {
    value = namedDestinations(doc).get(value.decodeText());
    if (value instanceof PDFRef) value = doc.context.lookup(value);
  }
  if (value instanceof PDFDict) value = value.lookup(PDFName.of('D'));
  return value instanceof PDFArray && value.get(0) instanceof PDFRef ? value : null;
}

/** Where a link or bookmark keeps its destination: its /Dest, or its GoTo action's /D. */
function destinationSlot(item) {
  const { PDFDict, PDFName } = library();
  if (item.has(PDFName.of('Dest'))) return { holder: item, key: PDFName.of('Dest') };
  const action = item.lookup(PDFName.of('A'));
  if (action instanceof PDFDict && action.get(PDFName.of('S')) === PDFName.of('GoTo'))
    return { holder: action, key: PDFName.of('D') };
  return null;
}

/** Whether an object is a page or a node of the page tree. */
function isPageObject(object) {
  const { PDFDict, PDFName } = library();
  const type = object instanceof PDFDict ? object.get(PDFName.of('Type')) : null;
  return type === PDFName.of('Page') || type === PDFName.of('Pages');
}

/** A destination's position on its page ([/XYZ left top zoom] and so on), for a new array. */
function destinationRest(destination) {
  const { PDFNull, PDFRef } = library();
  return destination
    .asArray()
    .slice(1)
    .map((value) => (value instanceof PDFRef ? PDFNull : value.clone()));
}

/**
 * Visit every value that `pages` (page dictionaries) lead to, without entering
 * other pages or the page tree. `change(value)` may return a replacement, which
 * `set(container, key, replacement)` puts in the value's place.
 */
function rewriteFromPages(context, pages, change, set) {
  const { PDFArray, PDFDict, PDFName, PDFRef, PDFStream } = library();
  const parent = PDFName.of('Parent');
  const roots = new Set(pages);
  const seen = new Set();
  const visit = (container) => {
    const entries =
      container instanceof PDFArray
        ? container.asArray().map((value, index) => [index, value])
        : container.entries();
    for (const [key, value] of entries) {
      if (key === parent && roots.has(container)) continue;
      const replacement = change(value);
      if (replacement !== undefined) {
        set(container, key, replacement);
        continue;
      }
      if (value instanceof PDFRef) {
        if (seen.has(value)) continue;
        seen.add(value);
      }
      const target = value instanceof PDFRef ? context.lookup(value) : value;
      if (isPageObject(target)) continue;
      if (target instanceof PDFStream) visit(target.dict);
      else if (target instanceof PDFDict || target instanceof PDFArray) visit(target);
    }
  };
  for (const page of pages) visit(page);
}

/**
 * Copy pages of `source` (by index, in order; an index may repeat) into `doc`.
 * Returns the copies, to add to `doc`, and a map from each copied source page's
 * reference to its first copy's. `source` is left as it was: it is changed while
 * copying and then restored, so the same source can be copied again (Split).
 */
export async function copyPagesWithLinks(doc, source, indices) {
  const { PDFArray, PDFDict, PDFName, PDFNull, PDFObjectCopier, PDFPage, PDFRef } = library();
  const sourcePages = source.getPages();
  const kept = new Set(indices.map((index) => sourcePages[index].ref));
  // Decide first, as links may share one action: links to a copied page get an
  // explicit destination (named ones are resolved); links to other pages go.
  const plans = [];
  for (const ref of kept) {
    const page = source.context.lookup(ref);
    const annots = page.lookup(PDFName.of('Annots'));
    if (!(annots instanceof PDFArray)) continue;
    const plan = { page, keep: [], links: [] };
    for (let index = 0; index < annots.size(); index++) {
      const annotation = annots.lookup(index);
      const slot = annotation instanceof PDFDict ? destinationSlot(annotation) : null;
      if (slot) {
        const destination = explicitDestination(source, slot.holder.get(slot.key));
        if (!destination || !kept.has(destination.get(0))) continue;
        plan.links.push({ slot, destination: [destination.get(0), ...destinationRest(destination)] });
      }
      plan.keep.push(annots.get(index));
    }
    plans.push(plan);
  }
  const undo = [];
  const set = (holder, key, value) => {
    const before = holder.get(key);
    undo.push(() => (before === undefined ? holder.delete(key) : holder.set(key, before)));
    holder.set(key, value);
  };
  for (const { page, keep, links } of plans) {
    for (const { slot, destination } of links) set(slot.holder, slot.key, source.context.obj(destination));
    set(page, PDFName.of('Annots'), source.context.obj(keep));
  }
  // Every reference from the copied pages to a page (links, an annotation's own
  // page, page actions, article beads…): to a copied page, it becomes a stand-in
  // name, pointed at the copy afterwards; to any other page, it becomes null.
  const token = Math.random().toString(36).slice(2);
  const standIns = new Map();
  const standIn = (value) => {
    if (!(value instanceof PDFRef) || !isPageObject(source.context.lookup(value))) return undefined;
    if (!kept.has(value)) return PDFNull;
    const name = PDFName.of(`QFT.page.${token}.${value.objectNumber}.${value.generationNumber}`);
    standIns.set(name, value);
    return name;
  };
  // The layer settings (optional content) go with the pages: without them, every
  // layer would show, including those hidden in this PDF.
  const layers = source.catalog.lookup(PDFName.of('OCProperties'));
  const roots = [...kept].map((ref) => source.context.lookup(ref));
  rewriteFromPages(source.context, layers instanceof PDFDict ? [...roots, layers] : roots, standIn, set);
  let pages;
  let copiedLayers = null;
  try {
    // pdf-lib's copyPages, with a copier of our own, so that the layer settings
    // are copied with the same one and name the layers the copied pages use.
    await source.flush();
    const copier = PDFObjectCopier.for(source.context, doc.context);
    pages = indices.map((index) => {
      const node = copier.copy(sourcePages[index].node);
      return PDFPage.of(node, doc.context.register(node), doc);
    });
    if (layers instanceof PDFDict) copiedLayers = copier.copy(layers);
  } finally {
    for (const step of undo.reverse()) step();
  }
  const refs = new Map();
  indices.forEach((index, position) => {
    if (!refs.has(sourcePages[index].ref)) refs.set(sourcePages[index].ref, pages[position].ref);
  });
  const copyOf = (value) => (standIns.has(value) ? refs.get(standIns.get(value)) : undefined);
  const copies = pages.map((page) => page.node);
  rewriteFromPages(
    doc.context,
    copiedLayers ? [...copies, copiedLayers] : copies,
    copyOf,
    (holder, key, value) => holder.set(key, value),
  );
  if (copiedLayers) addLayers(doc, copiedLayers);
  return { pages, refs };
}

/**
 * Add copied layer settings (/OCProperties) to `doc`, together with those of
 * pages copied before from other PDFs: every layer stays listed, in each PDF's
 * order, and a layer hidden in its PDF stays hidden. The first PDF's other
 * settings apply.
 */
function addLayers(doc, layers) {
  const { PDFArray, PDFDict, PDFName } = library();
  const { context } = doc;
  const key = PDFName.of('OCProperties');
  const existing = doc.catalog.lookup(key);
  if (!(existing instanceof PDFDict)) {
    doc.catalog.set(key, layers);
    return;
  }
  const list = (dict, name) => {
    const value = dict instanceof PDFDict ? dict.lookup(PDFName.of(name)) : null;
    return value instanceof PDFArray ? value.asArray() : [];
  };
  const join = (...arrays) => [...new Set(arrays.flat())];
  // A layer is hidden when it is listed as off, or, in settings that start with
  // every layer off (/BaseState /OFF), when it is not listed as on.
  const hidden = (config, groups) =>
    config instanceof PDFDict && config.get(PDFName.of('BaseState')) === PDFName.of('OFF')
      ? groups.filter((group) => !list(config, 'ON').includes(group))
      : list(config, 'OFF');
  const groups = [list(existing, 'OCGs'), list(layers, 'OCGs')];
  const configs = [existing.lookup(PDFName.of('D')), layers.lookup(PDFName.of('D'))];
  const config = configs[0] instanceof PDFDict ? configs[0] : context.obj({});
  const off = join(hidden(configs[0], groups[0]), hidden(configs[1], groups[1]));
  config.delete(PDFName.of('BaseState'));
  config.delete(PDFName.of('ON'));
  if (off.length) config.set(PDFName.of('OFF'), context.obj(off));
  for (const name of ['Order', 'RBGroups', 'Locked', 'AS']) {
    const values = join(list(configs[0], name), list(configs[1], name));
    if (values.length) config.set(PDFName.of(name), context.obj(values));
  }
  existing.set(PDFName.of('OCGs'), context.obj(join(...groups)));
  existing.set(PDFName.of('D'), config);
}

/**
 * Give each page its own list of content streams and its own annotations when
 * it shares them with an earlier page. Copies of one page do: pdf-lib copies the
 * objects of a page once, however often the page is copied. Content added to a
 * page goes on the end of its list, so with a shared list it would show on every
 * copy. The streams themselves stay shared, as nothing changes them. Shared
 * annotations are copied, each copy pointing at its own page (/P) and at the
 * copies of its pop-up, parent and reply (/Popup, /Parent, /IRT). Form widgets
 * stay as they are: they belong to their field.
 *
 * Its own resources, too. pdf-lib names every font, picture and graphics state
 * it draws with in the page's resources, under a new name each time, and takes
 * the dictionaries it finds there for the page's own. Pages often share them:
 * through the page tree, as one object, or as one /Font dictionary that every
 * page's resources point to (ReportLab writes those). Each page would then
 * carry the names added for all the others, so page numbers on 2,000 such pages
 * made a 1 MB file 125 MB. A page gets a copy of each dictionary an earlier page
 * already holds; the fonts and pictures named in them stay shared.
 */
function separatePages(doc, pages) {
  const { PDFArray, PDFDict, PDFName, PDFRef } = library();
  const { context } = doc;
  const lists = new Set();
  const claimed = new Set();
  const held = new Set();
  const dictionary = (value) => {
    const found = value instanceof PDFRef ? context.lookup(value) : value;
    return found instanceof PDFDict ? found : null;
  };
  // The dictionary itself for the first page that holds it, a copy in `holder` for the next.
  const own = (holder, name, found) => {
    if (!found || !held.has(found)) {
      if (found) held.add(found);
      return found;
    }
    const copy = found.clone(context);
    held.add(copy);
    holder.set(PDFName.of(name), copy);
    return copy;
  };
  for (const page of pages) {
    const resources = own(
      page.node,
      'Resources',
      dictionary(page.node.getInheritableAttribute(PDFName.of('Resources'))),
    );
    if (resources) {
      for (const name of ['Font', 'XObject', 'ExtGState'])
        own(resources, name, dictionary(resources.get(PDFName.of(name))));
    }
    const contents = page.node.lookup(PDFName.of('Contents'));
    if (contents instanceof PDFArray) {
      if (lists.has(contents)) page.node.set(PDFName.of('Contents'), context.obj(contents.asArray()));
      else lists.add(contents);
    }
    const annots = page.node.lookup(PDFName.of('Annots'));
    if (!(annots instanceof PDFArray)) continue;
    const entries = annots.asArray();
    const dictOf = (entry) => (entry instanceof PDFRef ? context.lookup(entry) : entry);
    const shared = (entry) => {
      const annotation = dictOf(entry);
      return (
        annotation instanceof PDFDict &&
        claimed.has(annotation) &&
        annotation.get(PDFName.of('Subtype')) !== PDFName.of('Widget')
      );
    };
    if (entries.some(shared)) {
      // The copies, by the reference (or direct dictionary) they replace.
      const copies = new Map();
      for (const entry of entries.filter(shared)) {
        const copy = dictOf(entry).clone(context);
        copy.set(PDFName.of('P'), page.ref);
        copies.set(
          entry,
          entry instanceof PDFRef ? { copy, entry: context.register(copy) } : { copy, entry: copy },
        );
      }
      for (const { copy } of copies.values()) {
        for (const key of ['Popup', 'Parent', 'IRT']) {
          const target = copies.get(copy.get(PDFName.of(key)));
          if (target) copy.set(PDFName.of(key), target.entry);
        }
      }
      page.node.set(
        PDFName.of('Annots'),
        context.obj(entries.map((entry) => copies.get(entry)?.entry ?? entry)),
      );
    }
    for (const entry of page.node.lookup(PDFName.of('Annots')).asArray()) {
      const annotation = dictOf(entry);
      if (annotation instanceof PDFDict) claimed.add(annotation);
    }
  }
}

/**
 * Let a page reach out to `box` (user space) with blank margins: its content
 * shows only inside `content`, even where the PDF has more, and the MediaBox
 * grows to hold the box. Trim, bleed and art boxes go, so they follow the page.
 */
function addBlankMargins(page, content, box) {
  const lib = library();
  const { context } = page.doc;
  page.node.normalize();
  const start = context.register(
    context.contentStream([
      lib.pushGraphicsState(),
      lib.rectangle(content.x, content.y, content.width, content.height),
      lib.clip(),
      lib.endPath(),
    ]),
  );
  const end = context.register(context.contentStream([lib.popGraphicsState()]));
  page.node.wrapContentStreams(start, end);
  // pdf-lib draws into a stream it keeps on the page once one exists (flattened
  // fields make one), and that stream is now inside the clip: what is drawn from
  // here on (the edits, page numbers, headers and footers, also in the margins)
  // goes into a new stream after the clip ends.
  page.getContentStream(false);
  const media = page.getMediaBox();
  const left = Math.min(media.x, box.x),
    bottom = Math.min(media.y, box.y);
  page.setMediaBox(
    left,
    bottom,
    Math.max(media.x + media.width, box.x + box.width) - left,
    Math.max(media.y + media.height, box.y + box.height) - bottom,
  );
  for (const name of ['TrimBox', 'BleedBox', 'ArtBox']) page.node.delete(lib.PDFName.of(name));
  // Comments, links and fields that lay wholly outside what the page showed were
  // out of sight, and are hidden now that the page reaches them. (One that lay
  // across the edge shows whole: an annotation cannot be cut.)
  const { PDFArray, PDFDict, PDFName, PDFNumber } = lib;
  const annotations = page.node.Annots();
  for (let index = 0; annotations && index < annotations.size(); index++) {
    const annotation = annotations.lookup(index),
      rect = annotation instanceof PDFDict ? annotation.lookup(PDFName.of('Rect')) : null;
    if (!(rect instanceof PDFArray) || rect.size() !== 4) continue;
    const [x1, y1, x2, y2] = rect
      .asArray()
      .map((value) => (value instanceof PDFNumber ? value.asNumber() : NaN));
    const outside =
      Math.max(x1, x2) <= content.x ||
      Math.min(x1, x2) >= content.x + content.width ||
      Math.max(y1, y2) <= content.y ||
      Math.min(y1, y2) >= content.y + content.height;
    // A pop-up is the note of another annotation, and shows only when opened.
    if (!outside || annotation.get(PDFName.of('Subtype')) === PDFName.of('Popup')) continue;
    const flags = annotation.lookup(PDFName.of('F'));
    annotation.set(
      PDFName.of('F'),
      PDFNumber.of((flags instanceof PDFNumber ? flags.asNumber() : 0) | HIDDEN),
    );
  }
}

// The annotation flag "Hidden": not shown, not printed, not reacting.
const HIDDEN = 2;

/**
 * Put a page on its sheet (layout.js: fittedGeometry): everything on it is
 * scaled and moved as one, by a matrix in the page's user space, so its /Rotate
 * stays and its boxes become the sheet, in points. Returns the matrix, for what
 * points at the page from elsewhere (moveDestinations). pdf-lib's own
 * PDFPage.scale is no use here: it scales about the origin of user space, moves
 * nothing, and leaves border widths, text sizes and destinations as they were.
 */
function fitToSheet(page, geometry) {
  const lib = library();
  const { PDFDict, PDFName } = lib;
  const { context } = page.doc;
  const scale = geometry.scale,
    matrix = [scale, 0, 0, scale, -scale * geometry.cropBox.x, -scale * geometry.cropBox.y];
  page.node.normalize();
  page.node.wrapContentStreams(
    context.register(
      context.contentStream([lib.pushGraphicsState(), lib.concatTransformationMatrix(...matrix)]),
    ),
    context.register(context.contentStream([lib.popGraphicsState()])),
  );
  const turned = geometry.rotation % 180 !== 0,
    width = turned ? geometry.height : geometry.width,
    height = turned ? geometry.width : geometry.height;
  page.setMediaBox(0, 0, width, height);
  page.setCropBox(0, 0, width, height);
  // The sheet is measured in points.
  for (const name of ['TrimBox', 'BleedBox', 'ArtBox', 'UserUnit']) page.node.delete(PDFName.of(name));
  const annotations = page.node.Annots();
  for (let index = 0; annotations && index < annotations.size(); index++) {
    const annotation = annotations.lookup(index);
    if (annotation instanceof PDFDict) moveAnnotation(page.doc, annotation, matrix);
  }
  return matrix;
}

/**
 * Move an annotation (a comment, a link, a form field's widget) with its page:
 * `matrix` is a scale and a shift in user space. Every position it keeps goes
 * through the matrix; widths and text sizes are scaled. Its appearance needs
 * nothing: viewers fit it to the annotation's rectangle.
 */
function moveAnnotation(doc, annotation, matrix) {
  const { PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber, PDFString } = library();
  const [scale, , , , shiftX, shiftY] = matrix;
  const numberAt = (array, index) => {
    const value = array.lookup(index);
    return value instanceof PDFNumber ? value.asNumber() : null;
  };
  const points = (array) => {
    for (let index = 0; array instanceof PDFArray && index + 1 < array.size(); index += 2) {
      const x = numberAt(array, index),
        y = numberAt(array, index + 1);
      if (x === null || y === null) continue;
      array.set(index, PDFNumber.of(scale * x + shiftX));
      array.set(index + 1, PDFNumber.of(scale * y + shiftY));
    }
  };
  const lengths = (array, end = Infinity) => {
    for (let index = 0; array instanceof PDFArray && index < Math.min(end, array.size()); index++) {
      const value = array.lookup(index);
      if (value instanceof PDFNumber) array.set(index, PDFNumber.of(value.asNumber() * scale));
      else if (value instanceof PDFArray) lengths(value);
    }
  };
  const get = (name) => annotation.lookup(PDFName.of(name));
  // Its rectangle, and the points of highlights, lines, shapes and ink.
  for (const name of ['Rect', 'QuadPoints', 'Vertices', 'L', 'CL']) points(get(name));
  for (const name of ['InkList', 'Path']) {
    const lists = get(name);
    for (let index = 0; lists instanceof PDFArray && index < lists.size(); index++)
      points(lists.lookup(index));
  }
  // Distances: the space inside its rectangle, leader lines, border widths and dashes.
  lengths(get('RD'));
  for (const name of ['LL', 'LLE', 'LLO']) {
    const value = get(name);
    if (value instanceof PDFNumber) annotation.set(PDFName.of(name), PDFNumber.of(value.asNumber() * scale));
  }
  const style = get('BS');
  if (style instanceof PDFDict) {
    const width = style.lookup(PDFName.of('W'));
    if (width instanceof PDFNumber) style.set(PDFName.of('W'), PDFNumber.of(width.asNumber() * scale));
    lengths(style.lookup(PDFName.of('D')));
  }
  lengths(get('Border'));
  // The size of text a viewer lays out itself: free text, and a field's when it
  // is typed in. A field's is often kept by the field, or by the form, for all
  // its widgets; a widget's own copy is what applies to it, and widgets of one
  // field can be on sheets of different scales.
  let appearance = get('DA');
  if (annotation.get(PDFName.of('Subtype')) === PDFName.of('Widget')) {
    const seen = new Set([annotation]);
    for (let field = annotation; !appearance && field instanceof PDFDict;) {
      field = field.lookup(PDFName.of('Parent'));
      if (seen.has(field)) break;
      seen.add(field);
      appearance = field instanceof PDFDict ? field.lookup(PDFName.of('DA')) : null;
    }
    const form = doc.catalog.lookup(PDFName.of('AcroForm'));
    if (!appearance && form instanceof PDFDict) appearance = form.lookup(PDFName.of('DA'));
  }
  if (appearance instanceof PDFString || appearance instanceof PDFHexString) {
    const text = appearance.decodeText(),
      sized = text.replace(
        /(-?(?:\d+\.?\d*|\.\d+))(\s+Tf)/,
        (_, size, operator) => Math.round(Number(size) * scale * 1000) / 1000 + operator,
      );
    if (sized !== text) annotation.set(PDFName.of('DA'), PDFString.of(sized));
  }
}

/**
 * Links, bookmarks and named destinations that lead to a place on a page keep
 * leading there when the page has been put on a sheet: `moved` maps a page's
 * reference to the matrix that moved what is on it (fitToSheet).
 */
function moveDestinations(doc, moved) {
  const { PDFArray, PDFDict, PDFName, PDFNumber } = library();
  const done = new Set();
  const move = (value) => {
    const destination = value === undefined ? null : explicitDestination(doc, value);
    const matrix = destination && !done.has(destination) ? moved.get(destination.get(0)) : null;
    if (!matrix) return;
    done.add(destination);
    const [scale, , , , shiftX, shiftY] = matrix;
    const kind = destination.lookup(1);
    // Which of the numbers after the kind are positions across (x) and up (y) the page.
    const axes = {
      '/XYZ': 'xy',
      '/FitH': 'y',
      '/FitBH': 'y',
      '/FitV': 'x',
      '/FitBV': 'x',
      '/FitR': 'xyxy',
    }[kind instanceof PDFName ? kind.asString() : ''];
    [...(axes || '')].forEach((axis, index) => {
      const at = destination.lookup(index + 2);
      if (at instanceof PDFNumber)
        destination.set(index + 2, PDFNumber.of(at.asNumber() * scale + (axis === 'x' ? shiftX : shiftY)));
    });
  };
  const follow = (item) => {
    const slot = item instanceof PDFDict ? destinationSlot(item) : null;
    if (slot) move(slot.holder.get(slot.key));
  };
  for (const page of doc.getPages()) {
    const annotations = page.node.Annots();
    for (let index = 0; annotations && index < annotations.size(); index++) follow(annotations.lookup(index));
  }
  const seen = new Set();
  const walk = (parent) => {
    for (
      let item = parent.lookup(PDFName.of('First'));
      item instanceof PDFDict && !seen.has(item);
      item = item.lookup(PDFName.of('Next'))
    ) {
      seen.add(item);
      follow(item);
      walk(item);
    }
  };
  const outlines = doc.catalog.lookup(PDFName.of('Outlines'));
  if (outlines instanceof PDFDict) walk(outlines);
  for (const value of namedDestinations(doc).values()) move(value);
  // Where the document opens.
  const open = doc.catalog.lookup(PDFName.of('OpenAction'));
  if (open instanceof PDFArray) move(open);
  else if (open instanceof PDFDict && open.get(PDFName.of('S')) === PDFName.of('GoTo'))
    move(open.get(PDFName.of('D')));
}

/** Read a document detail, or nothing when it is damaged. */
function detail(read) {
  try {
    return read();
  } catch {
    return undefined;
  }
}

/**
 * Document properties (state.properties): the title, author, subject, keywords
 * and language as set in the editor; an empty one is removed. `clean` (Remove
 * all) also removes every other detail: the app that made the PDF, dates and
 * the rest of its document information. Its XMP metadata, a second copy of
 * these details that some readers prefer, is always removed, so no reader
 * shows the old ones.
 */
function applyProperties(doc, properties) {
  const { PDFHexString, PDFName } = library();
  const info = doc.getInfoDict();
  if (properties.clean) for (const key of info.keys()) info.delete(key);
  const fields = {
    Title: properties.title,
    Author: properties.author,
    Subject: properties.subject,
    Keywords: properties.keywords,
  };
  for (const [key, value] of Object.entries(fields)) {
    const text = String(value ?? '').trim();
    if (text) info.set(PDFName.of(key), PDFHexString.fromText(text));
    else info.delete(PDFName.of(key));
  }
  const language = String(properties.language ?? '').trim();
  if (language) doc.setLanguage(language);
  else doc.catalog.delete(PDFName.of('Lang'));
  // The XMP stream itself goes: pdf-lib writes every object it holds, so a stream
  // only unlinked from the catalog would still be in the file.
  const metadata = doc.catalog.get(PDFName.of('Metadata'));
  if (metadata instanceof library().PDFRef) doc.context.delete(metadata);
  doc.catalog.delete(PDFName.of('Metadata'));
  // Remove all: nothing the document no longer refers to (earlier versions of its
  // details, say) travels with it either.
  if (properties.clean) dropUnreachable(doc);
}

/** Delete the objects nothing in the document refers to, which pdf-lib would still write. */
function dropUnreachable(doc) {
  const { PDFArray, PDFDict, PDFRef, PDFStream } = library();
  const { Root, Info, Encrypt } = doc.context.trailerInfo;
  const reached = new Set();
  const pending = [Root, Info, Encrypt];
  while (pending.length) {
    let value = pending.pop();
    if (value instanceof PDFRef) {
      if (reached.has(value)) continue;
      reached.add(value);
      value = doc.context.lookup(value);
    }
    if (value instanceof PDFStream) value = value.dict;
    if (value instanceof PDFDict) for (const [, entry] of value.entries()) pending.push(entry);
    else if (value instanceof PDFArray) for (const entry of value.asArray()) pending.push(entry);
  }
  for (const [ref] of doc.context.enumerateIndirectObjects()) if (!reached.has(ref)) doc.context.delete(ref);
}

/** Copy a PDF's title, author, subject, keywords, creator, creation date and language. */
export function copyDocumentInfo(doc, source) {
  const { PDFBool, PDFDict, PDFName } = library();
  const preferences = source.catalog.lookup(PDFName.of('ViewerPreferences'));
  const showTitle =
    preferences instanceof PDFDict && preferences.lookup(PDFName.of('DisplayDocTitle')) === PDFBool.True;
  const title = detail(() => source.getTitle());
  if (title) doc.setTitle(title, { showInWindowTitleBar: showTitle });
  const author = detail(() => source.getAuthor());
  if (author) doc.setAuthor(author);
  const subject = detail(() => source.getSubject());
  if (subject) doc.setSubject(subject);
  const keywords = detail(() => source.getKeywords());
  if (keywords) doc.setKeywords([keywords]);
  const creator = detail(() => source.getCreator());
  if (creator) doc.setCreator(creator);
  const created = detail(() => source.getCreationDate());
  if (created && !Number.isNaN(created.getTime())) doc.setCreationDate(created);
  const language = detail(() => source.getLanguage());
  if (language) doc.setLanguage(language);
}

/**
 * Bookmarks for copied pages: those of each part ({ source, refs } from
 * copyPagesWithLinks), one part after another, nested as they were. A bookmark
 * whose page was left behind leads to its first remaining sub-bookmark's page
 * instead, and is dropped when none remains. Web-address bookmarks are kept.
 * Damaged outlines (loops) are read as far as they go. A part with a `title`
 * gets a bookmark of its own, leading to its page `first` (a reference), with
 * its bookmarks under it, closed.
 */
export function copyBookmarks(doc, parts) {
  const { PDFArray, PDFDict, PDFHexString, PDFName, PDFNull, PDFNumber, PDFString } = library();
  const read = (source, refs, first, seen) => {
    const items = [];
    for (
      let item = first;
      item instanceof PDFDict && !seen.has(item);
      item = item.lookup(PDFName.of('Next'))
    ) {
      seen.add(item);
      const children = read(source, refs, item.lookup(PDFName.of('First')), seen);
      const slot = destinationSlot(item);
      const destination = slot && explicitDestination(source, slot.holder.get(slot.key));
      const target = destination && refs.get(destination.get(0));
      const action = item.lookup(PDFName.of('A'));
      const uri =
        action instanceof PDFDict && action.get(PDFName.of('S')) === PDFName.of('URI')
          ? action.lookup(PDFName.of('URI'))
          : null;
      const leadsTo = target
        ? [target, ...destinationRest(destination)]
        : children.find((child) => child.leadsTo)?.leadsTo;
      const web = !leadsTo && (uri instanceof PDFString || uri instanceof PDFHexString) ? uri.clone() : null;
      if (!leadsTo && !web && !children.length) continue;
      const title = item.lookup(PDFName.of('Title'));
      const count = item.lookup(PDFName.of('Count'));
      const color = item.lookup(PDFName.of('C'));
      const flags = item.lookup(PDFName.of('F'));
      items.push({
        title: typeof title?.decodeText === 'function' ? title.decodeText() : '',
        leadsTo,
        uri: web,
        open: count instanceof PDFNumber && count.asNumber() > 0,
        color:
          color instanceof PDFArray && color.size() === 3
            ? color.asArray().map((value) => (value instanceof PDFNumber ? value.asNumber() : 0))
            : null,
        flags: flags instanceof PDFNumber ? flags.asNumber() : 0,
        children,
      });
    }
    return items;
  };
  const items = parts.flatMap(({ source, refs, title, first }) => {
    const outlines = source.catalog.lookup(PDFName.of('Outlines'));
    const own =
      outlines instanceof PDFDict ? read(source, refs, outlines.lookup(PDFName.of('First')), new Set()) : [];
    if (title === undefined) return own;
    return [
      {
        title,
        leadsTo: [first, PDFName.of('XYZ'), PDFNull, PDFNull, PDFNull],
        uri: null,
        open: false,
        color: null,
        flags: 0,
        children: own,
      },
    ];
  });
  if (!items.length) return;
  // Count: how many bookmarks show under an open one (negative when it is closed).
  const write = (list, parent) => {
    const refs = list.map(() => doc.context.nextRef());
    let shown = 0;
    list.forEach((item, index) => {
      const entry = doc.context.obj({ Title: PDFHexString.fromText(item.title), Parent: parent });
      if (item.leadsTo) entry.set(PDFName.of('Dest'), doc.context.obj(item.leadsTo));
      else if (item.uri) entry.set(PDFName.of('A'), doc.context.obj({ S: 'URI', URI: item.uri }));
      if (index > 0) entry.set(PDFName.of('Prev'), refs[index - 1]);
      if (index < list.length - 1) entry.set(PDFName.of('Next'), refs[index + 1]);
      if (item.color) entry.set(PDFName.of('C'), doc.context.obj(item.color));
      if (item.flags) entry.set(PDFName.of('F'), PDFNumber.of(item.flags));
      let below = 0;
      if (item.children.length) {
        const children = write(item.children, refs[index]);
        below = children.shown;
        entry.set(PDFName.of('First'), children.refs[0]);
        entry.set(PDFName.of('Last'), children.refs.at(-1));
        entry.set(PDFName.of('Count'), PDFNumber.of(item.open ? below : -below));
      }
      doc.context.assign(refs[index], entry);
      shown += 1 + (item.open ? below : 0);
    });
    return { refs, shown };
  };
  const root = doc.context.nextRef();
  const top = write(items, root);
  doc.context.assign(
    root,
    doc.context.obj({ Type: 'Outlines', First: top.refs[0], Last: top.refs.at(-1), Count: top.shown }),
  );
  doc.catalog.set(PDFName.of('Outlines'), root);
  if (parts.some(({ source }) => source.catalog.get(PDFName.of('PageMode')) === PDFName.of('UseOutlines'))) {
    doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
  }
}

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
 * because PDF/A forbids encryption. When pages are copied into a new PDF
 * (deleting, extracting, combining, duplicating), what the new PDF leaves out
 * of the sources: 'labels-dropped', 'attachments-dropped', 'tags-dropped' (see
 * copyLosses). 'signature-invalid': a source was digitally signed, and the
 * signature does not match the changed file. state.protection, when on, makes
 * the copy need its password ({ enabled, password }).
 */
export async function buildPdfWithNotes(state, onProgress = () => {}) {
  const lib = await loadPdfLib();
  const sources = state?.sources || [];
  const descriptors = state?.pages || [];
  if (!descriptors.length) throw new Error('Keep at least one page before exporting your PDF.');
  const password = protectionPassword(state.protection);
  if (new Set(descriptors.map((page) => page.id)).size !== descriptors.length)
    throw new Error('The page list contains duplicate page IDs. Reload this document and try again.');
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const loaded = new Map();
  const needed = [...new Set(descriptors.map((page) => page.sourceId))];
  onProgress(0);
  for (const id of needed) {
    if (!sourceMap.has(id)) throw new Error('A source PDF is missing. Add the file again before exporting.');
    loaded.set(id, await loadPdf(sourceMap.get(id).bytes));
  }
  for (const descriptor of descriptors) {
    if (
      !Number.isInteger(descriptor.index) ||
      descriptor.index < 0 ||
      descriptor.index >= loaded.get(descriptor.sourceId).getPageCount()
    ) {
      throw new Error('A selected page does not exist in its source PDF. Reload the file and try again.');
    }
    rotation(descriptor.rotation || 0);
  }
  // Before flattening, which removes signature fields with the others.
  const signed = needed.some((id) => detail(() => isSigned(loaded.get(id))));
  const losses = new Set();
  // Forms: the values typed in Fill form, and flattening (fields become page
  // content, so their pages can also be combined with others).
  const fontManagers = new Map();
  const fontsFor = (target) => {
    if (!fontManagers.has(target)) fontManagers.set(target, fontManager(target));
    return fontManagers.get(target);
  };
  let formFilled = false,
    // Answers typed here and flattened into the pages: content the user added.
    answersFlattened = false;
  for (const id of needed) {
    const sourceDoc = loaded.get(id);
    const values = state.formValues?.[id];
    if (!hasAcroForm(sourceDoc) || !(state.flattenForms || (values && Object.keys(values).length))) continue;
    answersFlattened ||= Boolean(state.flattenForms && values && Object.keys(values).length);
    // A problem with a field is reported on the page that shows it.
    const fieldError = (name, message) => {
      let sourceIndex = -1;
      try {
        const form = sourceDoc.getForm();
        const widget = form.getFieldMaybe(name)?.acroField.getWidgets()[0];
        if (widget) sourceIndex = sourceDoc.getPages().indexOf(form.findWidgetPage(widget));
      } catch {
        // The field is not on a page.
      }
      const pageIndex = descriptors.findIndex(
        (descriptor) => descriptor.sourceId === id && descriptor.index === sourceIndex,
      );
      const itemId = `form:${name}`;
      return pageIndex < 0
        ? Object.assign(new Error(message), { itemId })
        : pageError(message, pageIndex, itemId);
    };
    // Flattening names each field's appearance in its page's resources: the pages
    // get their own first (see separatePages), or pages that share them would each
    // end up naming every field in the document.
    if (state.flattenForms) separatePages(sourceDoc, sourceDoc.getPages());
    formFilled =
      (await fillForm(sourceDoc, values, {
        flatten: Boolean(state.flattenForms),
        getFont: fontsFor(sourceDoc),
        fieldError,
      })) || formFilled;
  }
  onProgress(0.1);
  const oneSource = needed.length === 1;
  // By page object, not by index: a page tree can list one page twice, and its two
  // indexes are then one page, which an edit in place would turn, crop and number twice.
  const noDuplicates =
    new Set(descriptors.map((page) => loaded.get(page.sourceId).getPages()[page.index])).size ===
    descriptors.length;
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
    // form widgets that point at a page keep working). The pages come back directly
    // under the root of the tree, so what a page inherited from a node in between
    // (its size, crop, rotation or resources) is first written onto the page itself.
    if (outputPages.some((page, index) => page !== originalPages[index])) {
      for (const page of originalPages) {
        for (const key of ['Resources', 'MediaBox', 'CropBox', 'Rotate']) {
          const name = lib.PDFName.of(key);
          const inherited = page.node.getInheritableAttribute(name);
          if (inherited && !page.node.has(name)) page.node.set(name, inherited);
        }
      }
      for (let index = doc.getPageCount() - 1; index >= 0; index--) doc.removePage(index);
      for (const page of outputPages) {
        doc.context.assign(page.ref, page.node);
        doc.addPage(page);
      }
    }
  } else {
    for (const source of loaded.values()) {
      if (hasAcroForm(source) && source.getForm().getFields().length)
        throw new Error(
          'Pages of a PDF with form fields can only be combined, duplicated or extracted once its fields are flattened. Turn on “Flatten fields on download” in Fill form, then try again.',
        );
    }
    doc = await lib.PDFDocument.create();
    doc.setProducer('QFT PDF');
    const copies = new Map();
    const parts = [];
    // With state.fileBookmarks, combining two or more PDF files gives each file
    // a bookmark, named after it (pages added blank or made from pictures have none).
    const files = needed.filter((id) => !sourceMap.get(id).blank && !sourceMap.get(id).picture);
    const fileBookmarks = state.fileBookmarks === true && files.length > 1;
    for (const id of needed) {
      const selected = descriptors.filter((descriptor) => descriptor.sourceId === id);
      const { pages, refs } = await copyPagesWithLinks(
        doc,
        loaded.get(id),
        selected.map((page) => page.index),
      );
      selected.forEach((descriptor, index) => copies.set(descriptor.id, pages[index]));
      const part = { source: loaded.get(id), refs };
      if (fileBookmarks && files.includes(id)) {
        part.title =
          String(sourceMap.get(id).name || '')
            .replace(/\.pdf$/i, '')
            .trim() || 'PDF ' + (files.indexOf(id) + 1);
        part.first = pages[0].ref;
      }
      parts.push(part);
    }
    outputPages = descriptors.map((descriptor) => copies.get(descriptor.id));
    outputPages.forEach((page) => doc.addPage(page));
    // The first PDF's details, and every PDF's bookmarks to pages that are kept.
    copyDocumentInfo(doc, loaded.get(descriptors[0].sourceId));
    copyBookmarks(doc, parts);
    for (const id of needed) copyLosses(loaded.get(id)).forEach((loss) => losses.add(loss));
  }
  separatePages(doc, outputPages);
  const getFont = fontsFor(doc);
  const annotations = state.annotations || [];
  const total = outputPages.length;
  // A tagged PDF: repeated content is marked for screen readers to skip, and
  // additions, which are not tagged, are noted.
  const artifact = artifactMarker(doc);
  let added = false,
    annotated = false;
  // Pages put on a sheet, with the matrix that moved what is on them.
  const moved = new Map();
  for (let index = 0; index < total; index++) {
    const page = outputPages[index];
    const descriptor = descriptors[index];
    const source = {
      box: visibleBox(page.getMediaBox(), page.getCropBox()),
      rotation: page.getRotation().angle,
      userUnit: userUnit(page),
    };
    const geometry = pageGeometry(source, descriptor);
    page.setRotation(lib.degrees(geometry.rotation));
    // A page on a sheet (geometry.scale) first reaches out to the sheet in its own
    // units, like a page with margins; when everything is drawn, all of it is
    // scaled onto the sheet (fitToSheet).
    if (descriptor.crop || geometry.scale) {
      const box = geometry.cropBox;
      const content = contentBox(source, descriptor);
      const beyond =
        box.x < content.x - 0.01 ||
        box.y < content.y - 0.01 ||
        box.x + box.width > content.x + content.width + 0.01 ||
        box.y + box.height > content.y + content.height + 0.01;
      if (beyond) addBlankMargins(page, content, box);
      page.setCropBox(box.x, box.y, box.width, box.height);
    }
    for (const annotation of annotations.filter((item) => item.pageId === descriptor.id)) {
      const placement = placementGeometry(source, descriptor, annotation);
      page.pushOperators(lib.pushGraphicsState(), lib.concatTransformationMatrix(...placement.matrix));
      const drew = await drawAnnotation(doc, page, placement, annotation, getFont, index);
      added = drew || added;
      annotated = drew || annotated;
      page.pushOperators(lib.popGraphicsState());
    }
    page.pushOperators(lib.pushGraphicsState(), lib.concatTransformationMatrix(...geometry.matrix));
    // {date} and {filename} on this page.
    const extra = pageVariables(state, descriptor);
    if (applies(state.watermark, descriptor.id))
      added =
        (await drawWatermark(page, geometry, state.watermark, getFont, index, total, artifact, extra)) ||
        added;
    if (applies(state.headerFooter, descriptor.id)) {
      added =
        (await drawMarginItems(
          page,
          geometry,
          headerFooterItems(state.headerFooter, geometry, index + 1, total, extra),
          state.headerFooter.color,
          getFont,
          index,
          '#53635d',
          artifact,
        )) || added;
    }
    if (applies(state.pageNumbers, descriptor.id)) {
      added =
        (await drawMarginItems(
          page,
          geometry,
          [pageNumberItem(state.pageNumbers, geometry, index + 1, total, extra)],
          state.pageNumbers.color,
          getFont,
          index,
          '#53635d',
          artifact,
        )) || added;
    }
    page.pushOperators(lib.popGraphicsState());
    if (geometry.scale) moved.set(page.ref, fitToSheet(page, geometry));
    onProgress(0.1 + (0.8 * (index + 1)) / total);
    // Give the browser time to paint progress during larger exports.
    if (index % 10 === 9) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (moved.size) moveDestinations(doc, moved);
  // Answers flattened into the pages are drawn there untagged, like what was added.
  // (A form flattened as it came says nothing of the kind: nothing was added.)
  if (artifact && (annotated || answersFlattened)) losses.add('additions-untagged');
  const notes = [...losses];
  // New field appearances use fonts that PDF/A requires to be embedded.
  added ||= formFilled;
  const properties = state.properties;
  if (pdfa && (added || password || properties)) {
    // Changed properties remove the XMP metadata, and with it the PDF/A claim.
    if (!properties) removePdfaIdentification(doc);
    pdfa = null;
    if (added) notes.push('pdfa-removed');
    if (password) notes.push('pdfa-removed-password');
    if (properties) notes.push('pdfa-removed-properties');
  }
  if (properties) applyProperties(doc, properties);
  if (password) protectDocument(doc, password);
  if (signed) notes.push('signature-invalid');
  // Object streams keep files small, but PDF/A-1 forbids them. Field appearances
  // are made above, in fonts that have their characters.
  const output = await doc.save({ useObjectStreams: pdfa !== 1, updateFieldAppearances: false });
  onProgress(1);
  return { bytes: output, notes };
}

/** A PDF of one blank page, `width` by `height` points (Insert a blank page). */
export async function blankPdf(width, height) {
  const lib = await loadPdfLib();
  if (!(width >= 1 && height >= 1 && width <= 14400 && height <= 14400))
    throw new Error('A blank page must be between 1 and 14,400 points wide and high.');
  const doc = await lib.PDFDocument.create();
  doc.setProducer('QFT PDF');
  doc.addPage([width, height]);
  return doc.save();
}

/**
 * A PDF with one page per picture ({ bytes, type: 'jpg' | 'png' }), centred.
 * size 'fit' makes each page the picture's size (96 pixels per inch); 'a4' and
 * 'letter' use that paper, turned to match the picture, with the picture as
 * large as fits but not enlarged past 96 pixels per inch. margin is in points.
 * JPEG data is embedded as it is.
 */
export async function imagesToPdf(images, { size = 'fit', margin = 0 } = {}) {
  const lib = await loadPdfLib();
  if (!Array.isArray(images) || !images.length) throw new Error('Choose at least one JPG or PNG picture.');
  if (size !== 'fit' && !Object.hasOwn(PAPER_SIZES, size))
    throw new Error('Choose a page size: the picture’s own size, A4 or Letter.');
  const doc = await lib.PDFDocument.create();
  doc.setProducer('QFT PDF');
  for (const image of images) {
    let picture;
    try {
      picture = image.type === 'png' ? await doc.embedPng(image.bytes) : await doc.embedJpg(image.bytes);
    } catch (error) {
      throw new Error('A picture could not be read. Choose JPG or PNG files.', { cause: error });
    }
    const natural = { width: picture.width * 0.75, height: picture.height * 0.75 };
    let pageWidth, pageHeight;
    if (size === 'fit') {
      pageWidth = natural.width + 2 * margin;
      pageHeight = natural.height + 2 * margin;
    } else {
      const [short, long] = PAPER_SIZES[size];
      [pageWidth, pageHeight] = picture.width > picture.height ? [long, short] : [short, long];
    }
    const scale =
      size === 'fit'
        ? 1
        : Math.min(1, (pageWidth - 2 * margin) / natural.width, (pageHeight - 2 * margin) / natural.height);
    const width = natural.width * scale,
      height = natural.height * scale;
    doc
      .addPage([pageWidth, pageHeight])
      .drawImage(picture, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
  }
  return doc.save();
}

// ---- Pages per sheet -------------------------------------------------------------

/**
 * How `count` pages go on a sheet of `paper` ('a4' | 'letter'): the grid
 * (columns × rows) and the sheet's orientation where pages of `shape` ({ width,
 * height }, as they are shown) come out largest, with `margin` around the sheet
 * and `gap` between pages, in points. Returns { width, height, columns, rows,
 * cellWidth, cellHeight, scale }.
 */
export function sheetLayout(count, paper, shape, margin, gap) {
  let best = null;
  for (const landscape of [false, true]) {
    const [short, long] = PAPER_SIZES[paper];
    const [width, height] = landscape ? [long, short] : [short, long];
    for (let columns = 1; columns <= count; columns++) {
      if (count % columns) continue;
      const rows = count / columns;
      const cellWidth = (width - 2 * margin - (columns - 1) * gap) / columns;
      const cellHeight = (height - 2 * margin - (rows - 1) * gap) / rows;
      if (!(cellWidth > 0 && cellHeight > 0)) continue;
      const scale = Math.min(cellWidth / shape.width, cellHeight / shape.height);
      if (!best || scale > best.scale + 1e-9)
        best = { width, height, columns, rows, cellWidth, cellHeight, scale };
    }
  }
  if (!best) throw new Error('The margins leave no room for the pages. Make them smaller.');
  return best;
}

/**
 * A handout: the pages of the PDF `bytes`, `perSheet` (2 or 4) to a sheet, in
 * reading order (along each row, then down), each turned and cropped as it is
 * shown and as large as fits its cell (see sheetLayout). Pages are embedded as
 * they are, so text and drawings stay sharp; layer settings and the document's
 * details come along. Links, comments and form fields stay behind (flatten
 * the fields first: a PDF with fields is refused). `border` draws a thin frame
 * around each page; `password` protects the handout.
 */
export async function pagesPerSheet(
  bytes,
  { perSheet = 2, paper = 'a4', margin = 28.35, gap = 14.17, border = false, password = null } = {},
) {
  const lib = await loadPdfLib();
  if (![2, 4].includes(perSheet)) throw new Error('Choose 2 or 4 pages per sheet.');
  if (!Object.hasOwn(PAPER_SIZES, paper)) throw new Error('Choose A4 or Letter paper.');
  if (!(margin >= 0 && gap >= 0)) throw new Error('Margins and gaps can’t be negative.');
  const source = await loadPdf(bytes);
  if (hasAcroForm(source) && source.getForm().getFields().length)
    throw new Error(
      'A PDF with form fields goes on sheets once its fields are flattened. Turn on “Flatten fields on download” in Fill form, then try again.',
    );
  const doc = await lib.PDFDocument.create();
  doc.setProducer('QFT PDF');
  copyDocumentInfo(doc, source);
  // Copied with their layer settings and without the pages they link to; only
  // their content is used, and what is left over is removed before saving.
  const { pages } = await copyPagesWithLinks(doc, source, source.getPageIndices());
  // A page with nothing on it (a blank page added in the editor) has no content to embed.
  for (const page of pages)
    if (!page.node.Contents()) page.node.set(lib.PDFName.of('Contents'), doc.context.obj([]));
  const shown = pages.map((page) =>
    boxGeometry(visibleBox(page.getMediaBox(), page.getCropBox()), page.getRotation().angle),
  );
  // Each page as it is shown: clipped to its visible box, and turned upright.
  const embedded = await doc.embedPages(
    pages,
    shown.map(({ cropBox: { x, y, width, height } }) => ({
      left: x,
      bottom: y,
      right: x + width,
      top: y + height,
    })),
    shown.map((geometry) => invert(geometry.matrix)),
  );
  const layout = sheetLayout(perSheet, paper, shown[0], margin, gap);
  for (let first = 0; first < pages.length; first += perSheet) {
    const sheet = doc.addPage([layout.width, layout.height]);
    for (let cell = 0; cell < perSheet && first + cell < pages.length; cell++) {
      const page = shown[first + cell];
      const scale = Math.min(layout.cellWidth / page.width, layout.cellHeight / page.height);
      const width = page.width * scale,
        height = page.height * scale;
      const column = cell % layout.columns,
        row = Math.floor(cell / layout.columns);
      const x = margin + column * (layout.cellWidth + gap) + (layout.cellWidth - width) / 2;
      const y =
        layout.height -
        margin -
        row * (layout.cellHeight + gap) -
        layout.cellHeight +
        (layout.cellHeight - height) / 2;
      const name = sheet.node.newXObject('Page', embedded[first + cell].ref);
      sheet.pushOperators(
        lib.pushGraphicsState(),
        lib.concatTransformationMatrix(scale, 0, 0, scale, x, y),
        lib.drawObject(name),
        lib.popGraphicsState(),
      );
      if (border)
        sheet.drawRectangle({ x, y, width, height, borderColor: lib.grayscale(0.6), borderWidth: 0.5 });
    }
  }
  await doc.flush();
  dropUnreachable(doc);
  if (password !== null) protectDocument(doc, password);
  return doc.save();
}

/** Parse an inclusive, one-based list like "1-3, 5" into zero-based indexes. */
export function parsePageRange(value, pageCount) {
  if (!Number.isInteger(pageCount) || pageCount < 1)
    throw new Error('Open a PDF before choosing a page range.');
  if (!String(value ?? '').trim()) return Array.from({ length: pageCount }, (_, index) => index);
  const result = new Set();
  for (const token of String(value).split(',')) {
    const match = token.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!match) throw new Error('Use page numbers like 1-3, 5.');
    const first = Number(match[1]);
    const last = Number(match[2] || match[1]);
    if (first < 1 || last < first || last > pageCount)
      throw new Error(`Choose page numbers between 1 and ${pageCount}, with each range in ascending order.`);
    for (let page = first; page <= last; page++) result.add(page - 1);
  }
  return [...result];
}
