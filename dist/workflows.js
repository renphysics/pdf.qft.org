/** Reusable, browser-local PDF workflows. No document data is persisted here. */
import {
  inspectPdf,
  buildPdf,
  parsePageRange,
  loadPdfLib,
  loadPdf,
  protectDocument,
  passwordProblem,
  copyPagesWithLinks,
  copyDocumentInfo,
  copyBookmarks,
  copyLosses,
} from './pdf-engine.js';
import { t, userError } from './i18n.js';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const utf8 = new TextEncoder();

function decimal(value, fallback, label, minimum, maximum, integer = false) {
  const raw = value === undefined ? fallback : value;
  if ((typeof raw !== 'number' && typeof raw !== 'string') || (typeof raw === 'string' && !raw.trim())) {
    throw userError('{label} must be a number.', { label });
  }
  const number = Number(raw);
  if (
    !Number.isFinite(number) ||
    number < minimum ||
    number > maximum ||
    (integer && !Number.isInteger(number))
  ) {
    throw integer
      ? userError('{label} must be a whole number between {minimum} and {maximum}.', {
          label,
          minimum,
          maximum,
        })
      : userError('{label} must be a number between {minimum} and {maximum}.', { label, minimum, maximum });
  }
  return number;
}

function text(value, fallback, label, limit = 1000, required = false) {
  const result = value === undefined ? fallback : value;
  if (typeof result !== 'string') throw userError('{label} must be text.', { label });
  if (result.length > limit)
    throw userError('{label} can contain up to {limit} characters.', { label, limit });
  if (required && !result.trim()) throw userError('Enter {label}.', { label: label.toLowerCase() });
  // PDF text does not support arbitrary control codes. Preserve line breaks.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(result))
    throw userError('{label} contains unsupported control characters.', { label });
  return result;
}

function color(value, fallback, label) {
  const result = value === undefined ? fallback : value;
  if (typeof result !== 'string' || !/^#[a-f\d]{6}$/i.test(result))
    throw userError('{label} must be a six-digit hex color, such as #244e41.', { label });
  return result.toLowerCase();
}

function choice(value, fallback, label, options) {
  const result = value === undefined ? fallback : value;
  if (!options.includes(result)) throw userError('Choose a valid {label}.', { label: label.toLowerCase() });
  return result;
}

function operation(value, label) {
  if (value === undefined || value === null || value === false) return null;
  if (!isObject(value)) throw userError('{label} settings must be an object.', { label });
  if (value.enabled === false) return null;
  return value;
}

/** Validate a JSON-compatible preset and emit a small, versioned safe schema.
 * Opacity/crop values are fractions, never percentages. All page scopes are
 * intentionally omitted: a batch preset applies to every page of each file.
 */
export function normalizePreset(input) {
  if (!isObject(input)) throw userError('Choose or create a valid preset.');
  if (own(input, 'version') && input.version !== 1) throw userError('This preset version is not supported.');
  const result = {
    version: 1,
    name: text(input.name, t('Untitled preset'), t('Preset name'), 80, true).trim(),
    watermark: null,
    headerFooter: null,
    pageNumbers: null,
    crop: null,
  };
  const watermark = operation(input.watermark, t('Watermark'));
  if (watermark) {
    result.watermark = {
      text: text(watermark.text, t('DRAFT'), t('Watermark text'), 300, true),
      size: decimal(watermark.size, 48, t('Watermark size'), 8, 150),
      color: color(watermark.color, '#7c8c76', t('Watermark color')),
      opacity: decimal(watermark.opacity, 0.18, t('Watermark opacity'), 0, 1),
      angle: decimal(watermark.angle, -35, t('Watermark angle'), -90, 90),
      position: choice(watermark.position, 'center', t('Watermark position'), ['center', 'top', 'bottom']),
    };
  }
  const headerFooter = operation(input.headerFooter, t('Headers and footers'));
  if (headerFooter) {
    const slots = ['headerLeft', 'headerCenter', 'headerRight', 'footerLeft', 'footerCenter', 'footerRight'];
    result.headerFooter = Object.fromEntries(
      slots.map((slot) => [slot, text(headerFooter[slot], '', t('Header or footer text'), 300)]),
    );
    if (!slots.some((slot) => result.headerFooter[slot].trim()))
      throw userError('Enter text in at least one header or footer position.');
    Object.assign(result.headerFooter, {
      size: decimal(headerFooter.size, 10, t('Header/footer size'), 6, 24),
      color: color(headerFooter.color, '#53635d', t('Header/footer color')),
      margin: decimal(headerFooter.margin, 28, t('Header/footer margin'), 0, 100),
      // Left and right change places on even pages (printing on both sides).
      mirror: headerFooter.mirror === true,
    });
  }
  const pageNumbers = operation(input.pageNumbers, t('Page numbers'));
  if (pageNumbers) {
    result.pageNumbers = {
      format: text(pageNumbers.format, t('Page {page} of {total}'), t('Page number format'), 300, true),
      start: decimal(pageNumbers.start, 1, t('First page number'), 1, 1000000, true),
      size: decimal(pageNumbers.size, 10, t('Page number size'), 6, 24),
      color: color(pageNumbers.color, '#53635d', t('Page number color')),
      margin: decimal(pageNumbers.margin, 28, t('Page number margin'), 0, 100),
      position: choice(pageNumbers.position, 'bottom-right', t('Page number position'), [
        'bottom-left',
        'bottom-center',
        'bottom-right',
      ]),
      mirror: pageNumbers.mirror === true,
    };
  }
  const crop = operation(input.crop, t('Crop'));
  if (crop) {
    const labels = {
      left: t('Crop left margin'),
      top: t('Crop top margin'),
      right: t('Crop right margin'),
      bottom: t('Crop bottom margin'),
    };
    result.crop = Object.fromEntries(
      Object.entries(labels).map(([edge, label]) => [edge, decimal(crop[edge], 0, label, 0, 0.99)]),
    );
    if (result.crop.left + result.crop.right >= 0.99 || result.crop.top + result.crop.bottom >= 0.99) {
      throw userError('Crop margins must keep more than 1% of each page’s width and height.');
    }
    if (!Object.values(result.crop).some((value) => value > 0))
      throw userError('Set at least one crop margin above zero, or turn off cropping.');
  }
  if (!result.watermark && !result.headerFooter && !result.pageNumbers && !result.crop) {
    throw userError('Enable at least one operation: watermark, header/footer, page numbers, or crop.');
  }
  return result;
}

/**
 * The order that puts paper printed on both sides, scanned one side at a time,
 * in reading order. Of `count` pages, the first half (the larger half when the
 * count is odd) are the fronts and the rest are the backs; `backsReversed` when
 * the backs were scanned from the last sheet, as when the stack is turned over.
 * Returns the zero-based page indexes in their new order.
 */
export function interleaveOrder(count, backsReversed = true) {
  const fronts = Math.ceil(count / 2);
  const backs = Array.from({ length: count - fronts }, (_, index) => fronts + index);
  if (backsReversed) backs.reverse();
  return Array.from({ length: fronts }, (_, index) =>
    index < backs.length ? [index, backs[index]] : [index],
  ).flat();
}

/** Return groups of zero-based page indexes. A semicolon starts a new output. */
export function planSplit(options, total) {
  if (!Number.isSafeInteger(total) || total < 1)
    throw userError('Open a PDF before choosing how to split it.');
  if (!isObject(options)) throw userError('Choose how to split this PDF.');
  const mode = options.mode;
  if (mode === 'each') return Array.from({ length: total }, (_, index) => [index]);
  if (mode === 'chunks') {
    const size = decimal(options.size, 1, t('Pages per PDF'), 1, Number.MAX_SAFE_INTEGER, true);
    const groups = [];
    for (let first = 0; first < total; first += size)
      groups.push(Array.from({ length: Math.min(size, total - first) }, (_, index) => first + index));
    return groups;
  }
  if (mode === 'ranges') {
    if (typeof options.ranges !== 'string' || !options.ranges.trim())
      throw userError('Enter page groups such as 1-3; 4-6; 7. Each semicolon starts a new PDF.');
    // "；", as a Chinese keyboard types it, is a semicolon too (NFKC).
    const entries = options.ranges.normalize('NFKC').split(';');
    if (entries.some((entry) => !entry.trim()))
      throw userError(
        'Each page group needs at least one page. Remove empty groups or a trailing semicolon.',
      );
    return entries.map((entry, index) => {
      try {
        return parsePageRange(entry.trim(), total);
      } catch (error) {
        throw userError('Output {number}: {message}', { number: index + 1, message: error.message });
      }
    });
  }
  throw userError('Choose individual pages, a fixed number of pages, or custom page groups.');
}

function pdfBytes(input) {
  if (input instanceof Uint8Array) return input.slice();
  if (input instanceof ArrayBuffer) return new Uint8Array(input.slice(0));
  throw userError('Choose a PDF file to continue.');
}

function cancelled(shouldCancel) {
  if (shouldCancel?.()) {
    const error = userError('Splitting stopped. Your original PDF is unchanged.');
    error.name = 'AbortError';
    throw error;
  }
}

/** Copy already-edited page contents. Printed page numbers are not regenerated.
 * `password`: protect every output PDF with it. Returns { parts, notes }: the
 * PDFs, and what they leave out of the PDF split (see copyLosses).
 */
export async function splitPdf(
  bytes,
  groups,
  { onProgress = () => {}, shouldCancel = () => false, password = null } = {},
) {
  cancelled(shouldCancel);
  if (password !== null) {
    const problem = passwordProblem(password);
    if (problem) throw new Error(problem);
  }
  const PDFLib = await loadPdfLib();
  const source = await loadPdf(bytes);
  if (!Array.isArray(groups) || !groups.length) throw userError('Choose at least one output page group.');
  const total = source.getPageCount();
  for (const group of groups) {
    if (
      !Array.isArray(group) ||
      !group.length ||
      group.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= total)
    ) {
      throw userError('Each output must contain valid page numbers between 1 and {total}.', { total });
    }
  }
  if (source.getForm().getFields().length)
    throw userError(
      'A PDF with form fields can only be split once its fields are flattened. Turn on “Flatten fields on download” in Fill form, then try again.',
    );
  const outputs = [];
  onProgress(0);
  for (let index = 0; index < groups.length; index++) {
    cancelled(shouldCancel);
    const output = await PDFLib.PDFDocument.create();
    output.setProducer('QFT PDF');
    // Links and bookmarks to pages in this part keep working; the others are dropped.
    const { pages, refs } = await copyPagesWithLinks(output, source, groups[index]);
    pages.forEach((page) => output.addPage(page));
    copyDocumentInfo(output, source);
    if (output.getTitle())
      output.setTitle(t('{title} — part {part}', { title: output.getTitle(), part: index + 1 }));
    copyBookmarks(output, [{ source, refs }]);
    if (password !== null) protectDocument(output, password);
    outputs.push(await output.save());
    onProgress((index + 1) / groups.length);
    // Permit the progress UI and a cancellation request to reach the event loop.
    if (index < groups.length - 1) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  cancelled(shouldCancel);
  return { parts: outputs, notes: copyLosses(source) };
}

/** Process one file using a repeatable recipe, resetting numbering per file. */
export async function applyPreset(bytes, input, onProgress = () => {}, name = '') {
  const preset = normalizePreset(input);
  const sourceBytes = pdfBytes(bytes);
  onProgress(0);
  let inspected;
  try {
    inspected = await inspectPdf(sourceBytes);
  } catch (error) {
    // Batches don't ask for passwords; PDFs that only restrict changes still open.
    if (error.code === 'password-required')
      throw Object.assign(
        userError(
          'This PDF needs a password. Remove it with Unlock PDF, then add the unlocked copy here.',
          null,
          { cause: error },
        ),
        { code: error.code },
      );
    throw error;
  }
  const pages = inspected.pages.map((_, index) => ({
    id: `preset-page-${index}`,
    sourceId: 'preset-source',
    index,
    rotation: 0,
    ...(preset.crop ? { crop: { ...preset.crop, rotation: 0 } } : {}),
  }));
  return buildPdf(
    {
      sources: [{ id: 'preset-source', bytes: sourceBytes, name }],
      pages,
      annotations: [],
      watermark: preset.watermark ? { ...preset.watermark, pages: 'all' } : null,
      headerFooter: preset.headerFooter ? { ...preset.headerFooter, pages: 'all' } : null,
      pageNumbers: preset.pageNumbers ? { ...preset.pageNumbers, pages: 'all' } : null,
    },
    (progress) => onProgress(0.05 + 0.95 * progress),
  );
}

function portableFilename(name, fallback = t('document')) {
  const leaf = String(name ?? '')
    .split(/[\\/]/)
    .at(-1)
    .normalize('NFC');
  let result = leaf.replace(/[\u0000-\u001F\u007F<>:"|?*]/g, '_').replace(/^[.\s]+|[.\s]+$/g, '');
  if (!result) result = fallback;
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result)) result = '_' + result;
  // Leave room for collision suffixes on common filesystems and never split UTF-8.
  while (utf8.encode(result).length > 220) result = [...result].slice(0, -1).join('');
  return result || fallback;
}

export function safeBaseName(name) {
  return portableFilename(String(name ?? '').replace(/\.pdf$/i, ''), t('document'));
}

/** Reserve and return a portable unique filename. Matching is case-insensitive. */
export function uniqueFilename(name, existing = new Set()) {
  const cleaned = portableFilename(name, t('document') + '.pdf');
  const dot = cleaned.lastIndexOf('.');
  const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned;
  const extension = dot > 0 ? cleaned.slice(dot) : '';
  const used = new Set(
    [...existing].map((value) => String(value).normalize('NFC').toLocaleLowerCase('en-US')),
  );
  let result = cleaned,
    counter = 2;
  while (used.has(result.toLocaleLowerCase('en-US'))) result = `${stem} (${counter++})${extension}`;
  existing.add(result);
  return result;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function header(size) {
  const bytes = new Uint8Array(size);
  return [bytes, new DataView(bytes.buffer)];
}
function zipLimit() {
  throw userError(
    'This ZIP would exceed the ZIP32 format’s size or file-count limit. Download the PDFs individually or use smaller groups.',
  );
}

/** ZIP STORE preserves already-compressed PDF bytes without recompressing them.
 * Local/central headers use UTF-8, CRC32 and no directory paths. ZIP32 has real
 * 4-GiB/65,535-entry format limits; callers can still offer individual downloads.
 */
export function createZip(entries) {
  if (!Array.isArray(entries) || !entries.length) throw userError('There are no completed PDFs to download.');
  if (entries.length > 65535) zipLimit();
  const MAX32 = 0xffffffff;
  const date = new Date(),
    year = Math.max(1980, Math.min(2107, date.getFullYear()));
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const parts = [],
    central = [],
    names = new Set();
  let offset = 0,
    centralSize = 0;
  for (const entry of entries) {
    if (!isObject(entry) || !(entry.bytes instanceof Uint8Array))
      throw userError('A completed PDF is missing its file data.');
    const bytes = entry.bytes,
      name = utf8.encode(uniqueFilename(entry.name, names));
    const localSize = 30 + name.length + bytes.byteLength;
    if (bytes.byteLength >= MAX32 || offset + localSize >= MAX32) zipLimit();
    const checksum = crc32(bytes);
    const [local, lv] = header(30);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, bytes.byteLength, true);
    lv.setUint32(22, bytes.byteLength, true);
    lv.setUint16(26, name.length, true);
    parts.push(local, name, bytes);
    const [record, cv] = header(46);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, checksum, true);
    cv.setUint32(20, bytes.byteLength, true);
    cv.setUint32(24, bytes.byteLength, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.push(record, name);
    offset += localSize;
    centralSize += record.length + name.length;
  }
  if (offset + centralSize + 22 >= MAX32) zipLimit();
  const [end, ev] = header(22);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
