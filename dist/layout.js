/**
 * Page geometry and text layout shared by the PDF engine and the on-page
 * preview, so the editor shows every item exactly where the downloaded PDF
 * puts it. Pure functions: no DOM and no PDF library.
 *
 * Units are PDF points. A geometry describes a page as a viewer displays it:
 * its visible box (CropBox ∩ MediaBox, or a crop of it) turned by a multiple of
 * 90°. Its `matrix` maps display coordinates (origin bottom-left, y up) to the
 * page's user space. Layout results use those display coordinates; the engine
 * draws them directly and the preview flips them to screen axes (y down).
 *
 * Text is measured with a font object offering pdf-lib's PDFFont methods:
 * widthOfTextAtSize(text, size) and heightAtSize(size, { descender }). The
 * engine passes the embedded font; the preview passes the same font loaded
 * from the same file, so line breaks, sizes and positions match.
 */

export const CJK = /[⺀-鿿가-힯豈-﫿\u{20000}-\u{2FA1F}]/u;
const ASCII = /^[\u0009\u000A\u000D -~]*$/u;

export function number(value, fallback, min = -Infinity, max = Infinity) {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
}

export function rotation(value = 0) {
  const angle = Number(value);
  if (!Number.isFinite(angle) || angle % 90 !== 0) throw new Error('Page rotation must be a multiple of 90 degrees.');
  return ((angle % 360) + 360) % 360;
}

/** A #rrggbb colour, or the fallback when the value is not a #rgb or #rrggbb colour. */
export function hexColor(value, fallback = '#142c28') {
  let text = typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value) ? value : fallback;
  if (text.length === 4) text = '#' + [...text.slice(1)].map((x) => x + x).join('');
  return text.toLowerCase();
}

export function textValue(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
}

/** Which bundled font draws this text: the standard Helvetica for plain ASCII, Noto Sans CJK, or Noto Sans. */
export function fontKind(value) {
  const text = textValue(value);
  return ASCII.test(text) ? 'standard' : CJK.test(text) ? 'cjk' : 'latin';
}

/** The first character a font cannot draw, if any. `supported` is a Set of code points. */
export function unsupportedCharacter(value, supported) {
  return [...textValue(value)].find((character) => character !== '\n' && !supported.has(character.codePointAt(0)));
}

export function unsupportedMessage(character) {
  return `The available font cannot display “${character}”. Remove that character or use a supported alphabet.`;
}

// ---- Page geometry ------------------------------------------------------------

/** The box viewers display: the intersection of CropBox and MediaBox, or the MediaBox when they do not overlap. */
export function visibleBox(media, crop = media) {
  const x = Math.max(media.x, crop.x);
  const y = Math.max(media.y, crop.y);
  const width = Math.min(media.x + media.width, crop.x + crop.width) - x;
  const height = Math.min(media.y + media.height, crop.y + crop.height) - y;
  if (!(width > 0 && height > 0)) return { x: media.x, y: media.y, width: media.width, height: media.height };
  return { x, y, width, height };
}

/** Geometry of a user-space box displayed at a rotation (degrees clockwise, like /Rotate). */
export function boxGeometry(box, angle = 0) {
  const { x, y, width: w, height: h } = box;
  const turn = rotation(angle);
  const matrices = {
    0: [1, 0, 0, 1, x, y],
    90: [0, 1, -1, 0, x + w, y],
    180: [-1, 0, 0, -1, x + w, y + h],
    270: [0, -1, 1, 0, x, y + h],
  };
  return {
    width: turn % 180 ? h : w,
    height: turn % 180 ? w : h,
    rotation: turn,
    cropBox: { x, y, width: w, height: h },
    matrix: matrices[turn],
  };
}

/**
 * Crop margins (fractions of the original visible box) expressed in the axes
 * of the current page rotation. A crop records the descriptor rotation it was
 * chosen in, so a later rotation keeps the same rectangle of paper.
 */
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

/**
 * Geometry of a page after a descriptor crop. `originalBox` is the source
 * page's visible box in user space; `angle` is the total display rotation
 * (source /Rotate plus the descriptor rotation).
 */
export function croppedGeometry(originalBox, angle, crop, descriptorRotation) {
  const original = boxGeometry(originalBox, angle);
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
  return boxGeometry({ x, y, width, height }, angle);
}

/**
 * The geometries an exported page uses. `source` describes the source page:
 * its visible `box` and its own `rotation`. The page geometry places repeated
 * settings; an annotation keeps the geometry of the view it was placed in.
 */
export function pageGeometry(source, descriptor) {
  const descriptorRotation = descriptor.rotation || 0;
  return croppedGeometry(source.box, rotation(source.rotation + rotation(descriptorRotation)), descriptor.crop, descriptorRotation);
}

export function placementGeometry(source, descriptor, annotation) {
  const placed = annotation.pageRotation ?? descriptor.rotation ?? 0;
  return croppedGeometry(source.box, source.rotation + rotation(placed), annotation.pageCrop, placed);
}

/** Compose affine matrices [a b c d e f]: the result applies `inner` first, then `outer`. */
export function multiply(outer, inner) {
  const [a, b, c, d, e, f] = outer;
  const [g, h, i, j, k, l] = inner;
  return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f];
}

export function invert([a, b, c, d, e, f]) {
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/** Matrix from screen axes (y down) of the `from` view to screen axes of the `to` view. */
export function viewTransform(from, to) {
  const flipFrom = [1, 0, 0, -1, 0, from.height];
  const flipTo = [1, 0, 0, -1, 0, to.height];
  return multiply(flipTo, multiply(invert(to.matrix), multiply(from.matrix, flipFrom)));
}

export function applyMatrix([a, b, c, d, e, f], x, y) {
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

// ---- Text and item layout -----------------------------------------------------

/** Break text into lines no wider than maxWidth: at spaces where possible, between characters in CJK text and long words. */
export function wrapText(text, font, size, maxWidth) {
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

export const TEXT_LINE_HEIGHT = 1.25;
export const TEXT_SIZE = { min: 4, max: 200, fallback: 16 };

/**
 * The text box of a text annotation, before measuring: position, wrap width
 * and size. A box with `autoWidth` fits its longest line instead (see
 * layoutTextAnnotation); until measured, it may reach the page's right edge.
 */
export function textBox(annotation, geometry) {
  const size = number(annotation.fontSize, TEXT_SIZE.fallback, TEXT_SIZE.min, TEXT_SIZE.max);
  const x = number(annotation.x, 0.1, 0, 1) * geometry.width;
  const top = geometry.height - number(annotation.y, 0.1, 0, 1) * geometry.height;
  const width = Math.max(1, Math.min(number(annotation.width, 0.8, 0.01, 1) * geometry.width, geometry.width - x));
  return { size, x, top, width };
}

/**
 * Lay out a text annotation in its placement geometry. Returns the lines to
 * draw (x and baseline y in display coordinates), the box they occupy, and a
 * `problem` message when a line would fall below the page.
 */
export function layoutTextAnnotation(annotation, geometry, font) {
  const text = textValue(annotation.text);
  const box = textBox(annotation, geometry);
  const { size, x, top } = box;
  let width = box.width;
  if (annotation.autoWidth) {
    // Lines wrap only at the page edge; the box is as wide as the longest line.
    const widest = Math.max(0, ...text.split('\n').map((line) => font.widthOfTextAtSize(line, size)));
    width = Math.max(1, Math.min(widest + 0.01, geometry.width - x));
  }
  const ascent = font.heightAtSize(size, { descender: false });
  const descent = Math.max(0, font.heightAtSize(size) - ascent);
  const lineHeight = size * TEXT_LINE_HEIGHT;
  const wrapped = text.trim() ? wrapText(text, font, size, width) : [];
  const lines = [];
  let problem = null;
  wrapped.forEach((line, index) => {
    if (!line) return;
    const lineWidth = font.widthOfTextAtSize(line, size);
    const offset = annotation.align === 'right' ? width - lineWidth : annotation.align === 'center' ? (width - lineWidth) / 2 : 0;
    const baseline = top - ascent - index * lineHeight;
    if (baseline < 0 && !problem) problem = 'A text annotation extends below its page. Move it up or use a smaller font.';
    lines.push({ text: line, x: x + offset, y: baseline, width: lineWidth });
  });
  const count = Math.max(1, wrapped.length);
  const height = ascent + (count - 1) * lineHeight + descent;
  return { lines, size, x, top, width, height, ascent, lineHeight, problem };
}

/** Rectangle of a highlight or image annotation in display coordinates, clipped to the page. */
export function layoutRect(annotation, geometry) {
  const x = number(annotation.x, 0.1, 0, 1) * geometry.width;
  const top = number(annotation.y, 0.1, 0, 1) * geometry.height;
  const width = Math.min(number(annotation.width, 0.25, 0.001, 1) * geometry.width, geometry.width - x);
  const height = Math.min(number(annotation.height, 0.08, 0.001, 1) * geometry.height, geometry.height - top);
  if (!(width > 0 && height > 0)) return null;
  return { x, y: geometry.height - top - height, width, height };
}

/** Whether a repeated setting (watermark, headers and footers, page numbers) is shown on a page. */
export function applies(setting, pageId) {
  return Boolean(setting) && setting.enabled !== false && (!setting.pages || setting.pages === 'all' || setting.pages.includes(pageId));
}

export function variables(text, page, total) {
  return textValue(text).replaceAll('{page}', String(page)).replaceAll('{total}', String(total));
}

export function watermarkText(setting, pageNumber, total) {
  return variables(setting.text, pageNumber, total).replace(/\n/g, ' ');
}

/** Place a watermark: shrunk to fit the page, including its rotated bounding box. */
export function layoutWatermark(setting, geometry, font, text) {
  let size = number(setting.size, 48, 4, 240);
  const angle = number(setting.angle, -35, -180, 180);
  const radians = angle * Math.PI / 180;
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
  return {
    text, size, angle, width, height,
    x: centerX - (width * Math.cos(radians) - height * Math.sin(radians)) / 2,
    y: centerY - (width * Math.sin(radians) + height * Math.cos(radians)) / 2,
  };
}

function edgeMargin(setting, geometry) {
  return number(setting.margin, 28, 4, Math.min(geometry.width, geometry.height) / 3);
}

/** The header and footer texts for one page, before measuring. */
export function headerFooterItems(setting, geometry, pageNumber, total) {
  const size = number(setting.size, 10, 4, 48);
  const margin = edgeMargin(setting, geometry);
  const usable = Math.max(1, geometry.width - margin * 2);
  const items = [];
  for (const edge of ['header', 'footer']) {
    const slots = ['Left', 'Center', 'Right'].filter((slot) => textValue(setting[edge + slot]).trim());
    const maxWidth = usable / (slots.length > 1 ? 3 : 1) - (slots.length > 1 ? 8 : 0);
    for (const slot of slots) {
      items.push({
        key: edge + slot,
        text: variables(setting[edge + slot], pageNumber, total),
        size, margin, maxWidth, align: slot.toLowerCase(), top: edge === 'header',
        problem: 'The header or footer is too long. Shorten it or use more than one text position.',
      });
    }
  }
  return items;
}

export function pageNumberItem(setting, geometry, pageNumber, total) {
  const margin = edgeMargin(setting, geometry);
  const position = setting.position || 'bottom-center';
  return {
    key: 'pageNumber',
    text: variables(setting.format || 'Page {page} of {total}', pageNumber + number(setting.start, 1, 0, 1000000) - 1, total),
    size: number(setting.size, 10, 4, 48), margin, maxWidth: geometry.width - margin * 2,
    align: position.endsWith('right') ? 'right' : position.endsWith('left') ? 'left' : 'center',
    top: position.startsWith('top'),
    problem: 'The page number text is too long for the page. Shorten it or use a smaller size.',
  };
}

/** Place one line of header, footer or page-number text, shrinking it to fit its slot. */
export function layoutMarginText(geometry, item, font) {
  if (!item.text.trim()) return null;
  const content = item.text.replace(/\n/g, ' ');
  const intendedWidth = font.widthOfTextAtSize(content, item.size);
  const size = item.size * Math.min(1, item.maxWidth / Math.max(1, intendedWidth));
  const width = font.widthOfTextAtSize(content, size);
  const x = item.align === 'right' ? geometry.width - item.margin - width : item.align === 'center' ? (geometry.width - width) / 2 : item.margin;
  const ascent = font.heightAtSize(size, { descender: false });
  const y = item.top ? geometry.height - item.margin - ascent : item.margin;
  return { text: content, x, y, size, width, ascent, problem: size < 4 ? item.problem : null };
}
