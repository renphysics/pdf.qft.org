/**
 * The editor's live preview. Pages are rendered from their source PDFs by
 * PDF.js, turned and cropped as the page list says, and every edit is drawn on
 * top as SVG with the export's own layout (layout.js) and fonts. What the
 * editor shows is what Download produces, without building a PDF per edit.
 */
import {
  applies,
  boxGeometry,
  cropMarginsForRotation,
  fontKind,
  headerFooterItems,
  hexColor,
  layoutMarginText,
  layoutRect,
  layoutTextAnnotation,
  layoutWatermark,
  number,
  pageGeometry,
  pageNumberItem,
  placementGeometry,
  rotation,
  TEXT_LINE_HEIGHT,
  textBox,
  textValue,
  unsupportedCharacter,
  unsupportedMessage,
  viewTransform,
  watermarkText,
} from './layout.js';
import { characterSet, fontFile, measuringFont } from './pdf-engine.js';

// Resolve assets beside this module, including GitHub Pages project subpaths.
const assetUrl = (path) => new URL(path, import.meta.url).href;

// ---- PDF.js -------------------------------------------------------------------

let pdfjsModule = null;
/** Load PDF.js on first use. Safe to call early to warm it up. */
export function loadPdfjs() {
  if (!pdfjsModule) {
    pdfjsModule = import('./assets/vendor/pdf.mjs').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = assetUrl('./assets/vendor/pdf.worker.mjs');
      return lib;
    });
    pdfjsModule.catch(() => (pdfjsModule = null));
  }
  return pdfjsModule;
}

/** Open PDF bytes with PDF.js. Pass a copy: PDF.js takes ownership of the buffer. */
export async function openDocument(bytes) {
  const lib = await loadPdfjs();
  return lib.getDocument({
    data: bytes,
    cMapUrl: assetUrl('./assets/vendor/cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: assetUrl('./assets/vendor/standard_fonts/'),
    wasmUrl: assetUrl('./assets/vendor/wasm/'),
    iccUrl: assetUrl('./assets/vendor/iccs/'),
  });
}

const documents = new Map();
function documentFor(source) {
  if (!documents.has(source.id)) {
    const entry = { task: null, promise: null };
    entry.promise = openDocument(source.bytes.slice()).then((task) => {
      entry.task = task;
      return task.promise;
    });
    entry.promise.catch(() => documents.delete(source.id));
    documents.set(source.id, entry);
  }
  return documents.get(source.id).promise;
}

/**
 * Free what PDF.js keeps for drawing a page (its operator list and the like)
 * once the page is no longer shown, so a long document does not fill memory.
 */
export function releasePage(state, descriptor) {
  const source = state.sources.find((item) => item.id === descriptor.sourceId),
    entry = source && documents.get(source.id);
  entry?.promise
    .then((doc) => doc.getPage(descriptor.index + 1))
    .then((page) => page.cleanup())
    .catch(() => {});
}

/** Release PDF.js documents for sources that are no longer in use. */
export function closeDocuments(keep = new Set()) {
  for (const [id, entry] of documents) {
    if (keep.has(id)) continue;
    documents.delete(id);
    entry.promise.then(() => entry.task.destroy()).catch(() => {});
  }
}

// ---- Fonts ----------------------------------------------------------------------

/** CSS families for the bundled fonts. Liberation Sans has Helvetica's metrics. */
export const FONT_FAMILIES = { standard: 'QFT Helvetica', latin: 'QFT Noto Sans', cjk: 'QFT Noto Sans CJK' };
const fonts = new Map();
const fontListeners = new Set();

/** Call back when a font finishes loading, so previews drawn without it can update. */
export function onFontsReady(callback) {
  fontListeners.add(callback);
}

async function loadFace(kind) {
  const source =
    kind === 'standard'
      ? `url("${assetUrl('./assets/vendor/standard_fonts/LiberationSans-Regular.ttf')}")`
      : await fontFile(kind);
  const face = new FontFace(FONT_FAMILIES[kind], source);
  await face.load();
  document.fonts.add(face);
}

/**
 * The export's font for a kind of text, for measuring, plus the same face for
 * drawing. Returns { font, error }: font is null while it loads (listeners
 * hear when it is ready) and error is set when it could not load.
 */
export function previewFont(kind) {
  let entry = fonts.get(kind);
  if (entry?.error && Date.now() - entry.failedAt > 10000) entry = null; // try again after a while
  if (!entry) {
    entry = { font: null, error: null };
    fonts.set(kind, entry);
    Promise.all([measuringFont(kind), loadFace(kind)])
      .then(
        ([font]) => {
          characterSet(font);
          entry.font = font;
        },
        (error) => {
          entry.error = error?.message?.startsWith('The ')
            ? error
            : new Error('The font for this text could not be loaded. Check your connection, then try again.');
          entry.failedAt = Date.now();
        },
      )
      .then(() => fontListeners.forEach((callback) => callback(kind)));
  }
  return entry;
}

/** Start loading the font for some text before it is first drawn. */
export function warmFont(text) {
  previewFont(fontKind(text));
}

// ---- Geometry -------------------------------------------------------------------

/** The source page a descriptor shows: its visible box and own rotation, from inspectPdf. */
export function sourcePage(state, descriptor) {
  const source = state.sources.find((item) => item.id === descriptor.sourceId);
  return source?.pages?.[descriptor.index] || null;
}

/** The page's display geometry (points), as the export will produce it. */
export function geometryOf(state, descriptor) {
  return pageGeometry(sourcePage(state, descriptor), descriptor);
}

/** A key that changes whenever the rendered page image would change. */
export function renderKey(descriptor) {
  const crop = descriptor.crop;
  return [
    descriptor.sourceId,
    descriptor.index,
    rotation(descriptor.rotation || 0),
    crop ? [crop.left, crop.top, crop.right, crop.bottom, crop.rotation].join(',') : '',
  ].join(':');
}

// ---- Form fields ------------------------------------------------------------------
// PDF.js draws a page's form fields with the values typed in the editor (its
// annotation storage), as the download will show them. While Fill form is
// open, the fields are left out instead (`forms`), and the editor puts its own
// inputs in their place.

/** The value a field shows: the one typed in the editor, else its own. */
export function fieldValue(state, source, field) {
  const values = state.formValues?.[source.id];
  return values && Object.hasOwn(values, field.name) ? values[field.name] : field.value;
}

const fieldsByPage = new WeakMap();
/** The names of the fields with a widget on each page of a source, by page index. */
function pageFields(form) {
  if (!fieldsByPage.has(form)) {
    const pages = new Map();
    for (const field of form.fields)
      for (const widget of field.widgets) {
        if (!pages.has(widget.pageIndex)) pages.set(widget.pageIndex, new Set());
        pages.get(widget.pageIndex).add(field.name);
      }
    fieldsByPage.set(form, pages);
  }
  return fieldsByPage.get(form);
}

/** A key that changes whenever the values typed into a page's fields change ('' when there are none). */
export function formKey(state, descriptor) {
  const values = state.formValues?.[descriptor.sourceId];
  const source = values && state.sources.find((item) => item.id === descriptor.sourceId);
  const names = source?.form && pageFields(source.form).get(descriptor.index);
  if (!names) return '';
  const typed = [...names].filter((name) => Object.hasOwn(values, name)).map((name) => [name, values[name]]);
  return typed.length ? JSON.stringify(typed) : '';
}

/** What PDF.js should draw for a widget: { value } for its storage. */
function storedValue(field, widget, value) {
  if (field.kind === 'text' || field.kind === 'dropdown') return { value: String(value ?? '') };
  if (field.kind === 'checkbox') return { value: Boolean(value) };
  if (field.kind === 'radio') return { value: widget.option !== null && widget.option === value };
  if (field.kind === 'list') return { value: Array.isArray(value) ? value : [] };
  return null;
}

/** Give PDF.js the values typed into a source's fields; fields left as they were draw as in the file. */
function syncFormStorage(doc, state, source) {
  const storage = doc.annotationStorage,
    typed = state.formValues?.[source.id] || {};
  for (const field of source.form.fields) {
    const changed = Object.hasOwn(typed, field.name);
    for (const widget of field.widgets) {
      if (!widget.id) continue;
      const entry = changed && storedValue(field, widget, typed[field.name]);
      if (entry) storage.setValue(widget.id, entry);
      else if (storage.has(widget.id)) storage.remove(widget.id);
    }
  }
}

/**
 * Render a page's source content, turned and cropped, at `scale` canvas
 * pixels per point, with its form fields showing the values typed in the
 * editor (or without its fields: `forms`). Returns { canvas, promise, cancel }.
 */
export function renderPage(state, descriptor, scale, { forms = false } = {}) {
  const canvas = document.createElement('canvas');
  let task = null,
    cancelled = false;
  const promise = (async () => {
    const source = state.sources.find((item) => item.id === descriptor.sourceId);
    const [lib, doc] = await Promise.all([loadPdfjs(), documentFor(source)]);
    const page = await doc.getPage(descriptor.index + 1);
    if (cancelled) throw cancelledError();
    const info = source.pages[descriptor.index];
    const descriptorRotation = descriptor.rotation || 0;
    const angle = rotation(info.rotation + rotation(descriptorRotation));
    const geometry = pageGeometry(info, descriptor);
    const full = boxGeometry(info.box, angle);
    const margins = cropMarginsForRotation(descriptor.crop, descriptorRotation);
    const viewport = page.getViewport({
      scale,
      rotation: angle,
      offsetX: -margins.left * full.width * scale,
      offsetY: -margins.top * full.height * scale,
    });
    canvas.width = Math.max(1, Math.round(geometry.width * scale));
    canvas.height = Math.max(1, Math.round(geometry.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    let annotationMode = lib.AnnotationMode.ENABLE;
    if (source.form?.fields.length) {
      if (forms) annotationMode = lib.AnnotationMode.ENABLE_FORMS;
      else {
        syncFormStorage(doc, state, source);
        annotationMode = lib.AnnotationMode.ENABLE_STORAGE;
      }
    }
    task = page.render({ canvasContext: context, viewport, annotationMode });
    if (cancelled) task.cancel();
    await task.promise;
    return canvas;
  })();
  return {
    canvas,
    promise,
    cancel() {
      cancelled = true;
      task?.cancel();
    },
  };
}

function cancelledError() {
  const error = new Error('Rendering cancelled');
  error.name = 'RenderingCancelledException';
  return error;
}

// ---- Overlay --------------------------------------------------------------------

const escapeXml = (value) =>
  String(value).replace(
    /[&<>"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char],
  );
const fixed = (value) => String(Math.round(value * 1000) / 1000);
const images = new WeakMap();

/** An object URL for an image annotation's bytes, shared by every copy of the annotation. */
export function imageUrl(annotation) {
  const bytes = annotation.imageBytes;
  if (!bytes) return '';
  if (!images.has(bytes)) {
    const type = annotation.imageType === 'png' ? 'image/png' : 'image/jpeg';
    images.set(bytes, URL.createObjectURL(new Blob([bytes], { type })));
  }
  return images.get(bytes);
}

function textElement(lines, height, font, kind, attributes) {
  return (
    '<text class="ov-text" font-family="' +
    FONT_FAMILIES[kind] +
    '" font-size="' +
    fixed(font) +
    '"' +
    attributes +
    '>' +
    lines
      .map(
        (line) =>
          '<tspan x="' +
          fixed(line.x) +
          '" y="' +
          fixed(height - line.y) +
          '">' +
          escapeXml(line.text) +
          '</tspan>',
      )
      .join('') +
    '</text>'
  );
}

/** Measure text with the export's font, noting characters the font cannot draw. */
function fontFor(text, problems, key) {
  const kind = fontKind(text);
  const entry = previewFont(kind);
  if (entry.error) {
    problems.push({ key, message: entry.error.message });
    return null;
  }
  if (!entry.font) return null;
  const missing = unsupportedCharacter(text, characterSet(entry.font));
  if (missing) problems.push({ key, message: unsupportedMessage(missing) });
  return { font: entry.font, kind };
}

/**
 * Everything the export draws on one page, as SVG markup in the page's display
 * coordinates (points, y down), plus each annotation's frame for selection and
 * editing and the problems the export would report.
 *
 * options.hide: annotation IDs to leave out (for example, while typing in one).
 */
export function pageOverlay(state, pageIndex, { hide } = {}) {
  const descriptor = state.pages[pageIndex];
  const info = sourcePage(state, descriptor);
  const geometry = pageGeometry(info, descriptor);
  const total = state.pages.length;
  const parts = [],
    items = [],
    problems = [];
  let loading = false;
  for (const annotation of state.annotations) {
    if (annotation.pageId !== descriptor.id) continue;
    const placement = placementGeometry(info, descriptor, annotation);
    const matrix = viewTransform(placement, geometry);
    const group = (content) =>
      '<g transform="matrix(' + matrix.map(fixed).join(' ') + ')">' + content + '</g>';
    const item = {
      id: annotation.id,
      type: annotation.type,
      annotation,
      placement,
      matrix,
      frame: null,
      problem: null,
    };
    if (annotation.type === 'text') {
      const text = textValue(annotation.text);
      const pageProblems = [];
      const measured = fontFor(text, pageProblems, annotation.id);
      if (!measured) {
        // Until its font loads, the text's box is estimated so it can still be selected.
        const box = textBox(annotation, placement);
        const lines = Math.max(1, text.split('\n').length);
        item.frame = {
          x: box.x,
          y: placement.height - box.top,
          width: box.width,
          height: box.size * TEXT_LINE_HEIGHT * lines,
        };
        loading ||= !pageProblems.length;
        item.problem = pageProblems[0]?.message || null;
        problems.push(...pageProblems);
        items.push(item);
        continue;
      }
      const layout = layoutTextAnnotation(annotation, placement, measured.font);
      item.layout = layout;
      item.kind = measured.kind;
      item.frame = {
        x: layout.x,
        y: placement.height - layout.top,
        width: layout.width,
        height: layout.height,
      };
      item.problem = pageProblems[0]?.message || layout.problem;
      if (item.problem) problems.push({ key: annotation.id, message: item.problem });
      if (layout.lines.length && !hide?.has(annotation.id)) {
        const color = hexColor(annotation.color);
        const opacity = number(annotation.opacity, 1, 0, 1);
        parts.push(
          group(
            textElement(
              layout.lines,
              placement.height,
              layout.size,
              measured.kind,
              ' fill="' + color + '"' + (opacity < 1 ? ' fill-opacity="' + fixed(opacity) + '"' : ''),
            ),
          ),
        );
      }
    } else {
      const rect = layoutRect(annotation, placement);
      if (!rect) continue;
      item.frame = {
        x: rect.x,
        y: placement.height - rect.y - rect.height,
        width: rect.width,
        height: rect.height,
      };
      const { x, y, width, height } = item.frame;
      const box =
        ' x="' +
        fixed(x) +
        '" y="' +
        fixed(y) +
        '" width="' +
        fixed(width) +
        '" height="' +
        fixed(height) +
        '"';
      if (annotation.type === 'highlight') {
        parts.push(
          group(
            '<rect class="ov-highlight"' +
              box +
              ' fill="' +
              hexColor(annotation.color, '#f5d85c') +
              '" fill-opacity="' +
              fixed(number(annotation.opacity, 0.3, 0, 1)) +
              '"/>',
          ),
        );
      } else if (annotation.type === 'image' || annotation.type === 'signature') {
        const opacity = number(annotation.opacity, 1, 0, 1);
        parts.push(
          group(
            '<image' +
              box +
              ' href="' +
              imageUrl(annotation) +
              '" preserveAspectRatio="none"' +
              (opacity < 1 ? ' opacity="' + fixed(opacity) + '"' : '') +
              '/>',
          ),
        );
      }
    }
    items.push(item);
  }
  const flip = (y) => geometry.height - y;
  if (applies(state.watermark, descriptor.id)) {
    const setting = state.watermark;
    const text = watermarkText(setting, pageIndex + 1, total);
    const measured = text.trim() && fontFor(text, problems, 'watermark');
    if (measured) {
      const mark = layoutWatermark(setting, geometry, measured.font, text);
      parts.push(
        '<text class="ov-text" font-family="' +
          FONT_FAMILIES[measured.kind] +
          '" font-size="' +
          fixed(mark.size) +
          '" fill="' +
          hexColor(setting.color, '#85948e') +
          '" fill-opacity="' +
          fixed(number(setting.opacity, 0.15, 0, 1)) +
          '" transform="translate(' +
          fixed(mark.x) +
          ' ' +
          fixed(flip(mark.y)) +
          ') rotate(' +
          fixed(-mark.angle) +
          ')">' +
          escapeXml(text) +
          '</text>',
      );
    } else if (text.trim()) loading ||= !problems.some((problem) => problem.key === 'watermark');
  }
  const margins = [];
  if (applies(state.headerFooter, descriptor.id)) {
    for (const item of headerFooterItems(state.headerFooter, geometry, pageIndex + 1, total))
      margins.push([item, state.headerFooter.color]);
  }
  if (applies(state.pageNumbers, descriptor.id)) {
    margins.push([
      pageNumberItem(state.pageNumbers, geometry, pageIndex + 1, total),
      state.pageNumbers.color,
    ]);
  }
  for (const [item, color] of margins) {
    if (!item.text.trim()) continue;
    const measured = fontFor(item.text, problems, item.key);
    if (!measured) {
      loading ||= !problems.some((problem) => problem.key === item.key);
      continue;
    }
    const placed = layoutMarginText(geometry, item, measured.font);
    if (placed.problem) problems.push({ key: item.key, message: placed.problem });
    parts.push(
      textElement(
        [placed],
        geometry.height,
        placed.size,
        measured.kind,
        ' fill="' + hexColor(color, '#53635d') + '"',
      ),
    );
  }
  return { geometry, markup: parts.join(''), items, problems, loading };
}
