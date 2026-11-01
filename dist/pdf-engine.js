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
 * Form fields are described when a PDF opens (formFields), filled from
 * state.formValues on export, and flattened into their pages when
 * state.flattenForms is on, which also lets their pages be combined.
 *
 * Geometry and text layout live in layout.js, shared with the editor preview.
 */
import {
  applies, boxGeometry, fontKind, hexColor, headerFooterItems, layoutMarginText, layoutRect,
  layoutTextAnnotation, layoutWatermark, number, pageGeometry, pageNumberItem, placementGeometry, rotation, textValue,
  unsupportedCharacter, unsupportedMessage, visibleBox, watermarkText, wrapText,
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
  if (typeof document === 'undefined' && typeof WorkerGlobalScope === 'undefined') return Promise.reject(new Error(failure));
  if (!scriptLoads.has(name)) {
    const loading = runScript(name, VENDOR_SCRIPTS[name].href).then(
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
  // A file can parse without a usable page tree (a header and little else).
  let pageCount;
  try {
    pageCount = doc.getPageCount();
  } catch (error) {
    throw new Error('This file could not be opened as a PDF. Try opening it in a PDF reader and saving a new copy.', { cause: error });
  }
  if (!pageCount) throw new Error('This PDF has no pages.');
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
  return decodedText(field.acroField.dict.lookup(library().PDFName.of('TU')))?.trim() || field.getName().split('.').pop();
}

/** A field's text size (0: automatic) and colour, from a default appearance such as "/Helv 0 Tf 0 g". */
function appearanceStyle(da = '') {
  const size = /(-?[\d.]+)\s+Tf\b/.exec(da);
  const gray = /(?:^|\s)([\d.]+)\s+g\b/.exec(da);
  const rgb = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg\b/.exec(da);
  const hex = (value) => Math.round(Math.min(1, Math.max(0, Number(value))) * 255).toString(16).padStart(2, '0');
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
      const entry = { id: annotationId(doc.context.getObjectRef(widget.dict)), pageIndex, rect: [x, y, width, height] };
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
      const da = field.acroField.getDefaultAppearance?.() ?? decodedText(acroForm.lookup(lib.PDFName.of('DA'))) ?? '';
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
    const longest = options.reduce((best, option) => (widthAtOne(option) > widthAtOne(best) ? option : best), '');
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
    const kept = [field.acroField.dict, ...field.acroField.getWidgets().map((widget) => widget.dict)].map((dict) => [dict, dict.get(da)]);
    // An automatic size is worked out for each widget, and given to pdf-lib in the
    // widget's default appearance while it draws (the original is restored below).
    const appearance = field.acroField.getDefaultAppearance?.() ?? decodedText(form.acroForm.dict.lookup(da)) ?? '/Helv 0 Tf 0 g';
    if (!appearanceStyle(appearance).fontSize) {
      const text = shownText(field, kind);
      const options = kind === 'list' ? field.getOptions() : [];
      for (const widget of field.acroField.getWidgets()) {
        const size = automaticSize(kind, kind === 'text' && field.isMultiline(), widget.getRectangle(), font, text, options);
        const sized = /-?[\d.]+\s+Tf\b/.test(appearance) ? appearance.replace(/-?[\d.]+(\s+Tf\b)/, `${size}$1`) : `/Helv ${size} Tf 0 g`;
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
        form.flattenWidgetOntoPage(form.findWidgetPage(widget), widget, form.findWidgetAppearanceRef(field, widget));
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
    return { index, width, height, rotation, cropBox };
  });
  const form = formFields(doc);
  return { pages, pageCount: pages.length, hasForm: Boolean(form?.count), form, pdfa: pdfaPart(doc), encrypted: Boolean(doc.context.isDecrypted) };
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
    images.set(annotation.imageBytes, annotation.imageType === 'jpg' || annotation.imageType === 'jpeg'
      ? doc.embedJpg(annotation.imageBytes)
      : doc.embedPng(annotation.imageBytes));
  }
  return images.get(annotation.imageBytes);
}

async function drawAnnotation(doc, page, geometry, annotation, getFont, pageIndex) {
  if (annotation.type === 'text') return drawTextAnnotation(page, geometry, annotation, getFont, pageIndex);
  const rect = layoutRect(annotation, geometry);
  if (!rect) return false;
  const options = { ...rect, opacity: number(annotation.opacity, 1, 0, 1) };
  if (annotation.type === 'highlight') {
    page.drawRectangle({ ...options, color: color(annotation.color, '#f5d85c'), opacity: number(annotation.opacity, 0.3, 0, 1), blendMode: library().BlendMode.Multiply });
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
  // Forms: the values typed in Fill form, and flattening (fields become page
  // content, so their pages can also be combined with others).
  const fontManagers = new Map();
  const fontsFor = (target) => {
    if (!fontManagers.has(target)) fontManagers.set(target, fontManager(target));
    return fontManagers.get(target);
  };
  let formFilled = false;
  for (const id of needed) {
    const sourceDoc = loaded.get(id);
    const values = state.formValues?.[id];
    if (!hasAcroForm(sourceDoc) || !(state.flattenForms || (values && Object.keys(values).length))) continue;
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
      const pageIndex = descriptors.findIndex((descriptor) => descriptor.sourceId === id && descriptor.index === sourceIndex);
      const itemId = `form:${name}`;
      return pageIndex < 0 ? Object.assign(new Error(message), { itemId }) : pageError(message, pageIndex, itemId);
    };
    formFilled = (await fillForm(sourceDoc, values, { flatten: Boolean(state.flattenForms), getFont: fontsFor(sourceDoc), fieldError })) || formFilled;
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
      if (hasAcroForm(source) && source.getForm().getFields().length) throw new Error('Pages of a PDF with form fields can only be combined, duplicated or extracted once its fields are flattened. Turn on “Flatten fields on download” in Fill form, then try again.');
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
  const getFont = fontsFor(doc);
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
  // New field appearances use fonts that PDF/A requires to be embedded.
  added ||= formFilled;
  if (pdfa && (added || password)) {
    removePdfaIdentification(doc);
    pdfa = null;
    if (added) notes.push('pdfa-removed');
    if (password) notes.push('pdfa-removed-password');
  }
  if (password) protectDocument(doc, password);
  // Object streams keep files small, but PDF/A-1 forbids them. Field appearances
  // are made above, in fonts that have their characters.
  const output = await doc.save({ useObjectStreams: pdfa !== 1, updateFieldAppearances: false });
  onProgress(1);
  return { bytes: output, notes };
}

// Paper sizes in points, portrait.
const PAPER = { a4: [595.28, 841.89], letter: [612, 792] };

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
  if (size !== 'fit' && !PAPER[size]) throw new Error('Choose a page size: the picture’s own size, A4 or Letter.');
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
      const [short, long] = PAPER[size];
      [pageWidth, pageHeight] = picture.width > picture.height ? [long, short] : [short, long];
    }
    const scale = size === 'fit' ? 1 : Math.min(1, (pageWidth - 2 * margin) / natural.width, (pageHeight - 2 * margin) / natural.height);
    const width = natural.width * scale, height = natural.height * scale;
    doc.addPage([pageWidth, pageHeight]).drawImage(picture, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
  }
  return doc.save();
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
