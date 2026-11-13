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
  if (!Number.isFinite(angle) || angle % 90 !== 0)
    throw new Error('Page rotation must be a multiple of 90 degrees.');
  return ((angle % 360) + 360) % 360;
}

/** A #rrggbb colour, or the fallback when the value is not a #rgb or #rrggbb colour. */
export function hexColor(value, fallback = '#142c28') {
  let text = typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value) ? value : fallback;
  if (text.length === 4) text = '#' + [...text.slice(1)].map((x) => x + x).join('');
  return text.toLowerCase();
}

export function textValue(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ');
}

/** Which bundled font draws this text: the standard Helvetica for plain ASCII, Noto Sans CJK, or Noto Sans. */
export function fontKind(value) {
  const text = textValue(value);
  return ASCII.test(text) ? 'standard' : CJK.test(text) ? 'cjk' : 'latin';
}

/** The first character a font cannot draw, if any. `supported` is a Set of code points. */
export function unsupportedCharacter(value, supported) {
  return [...textValue(value)].find(
    (character) => character !== '\n' && !supported.has(character.codePointAt(0)),
  );
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

// A page can grow by added margins up to this many times its own size on each side.
const MAX_GROWTH = 20;

/** Margins chosen at rotation `from`, in the axes of rotation `to`. */
function turnMargins(margins, from, to) {
  const turns = rotation(rotation(to) - rotation(from)) / 90;
  for (let turn = 0; turn < turns; turn++) {
    margins = { left: margins.bottom, top: margins.left, right: margins.top, bottom: margins.right };
  }
  return margins;
}

/**
 * Crop margins (fractions of the original visible box) expressed in the axes
 * of the current page rotation. A crop records the descriptor rotation it was
 * chosen in, so a later rotation keeps the same rectangle of paper. A negative
 * margin makes the page larger on that side: blank space added around it
 * (Add margins), which keeps what it shows in crop.content (see contentMargins).
 */
export function cropMarginsForRotation(crop, currentRotation = 0) {
  const margins = { left: 0, top: 0, right: 0, bottom: 0 };
  if (!crop) return margins;
  for (const edge of Object.keys(margins)) {
    const value = crop[edge] === undefined ? 0 : Number(crop[edge]);
    if (!Number.isFinite(value) || value <= -MAX_GROWTH || value >= 1) {
      throw new Error(
        'Crop margins must be less than 100% of the page, and added margins less than ' +
          MAX_GROWTH +
          ' times its size.',
      );
    }
    margins[edge] = value;
  }
  if (margins.left + margins.right >= 1 || margins.top + margins.bottom >= 1) {
    throw new Error('Crop margins must leave some of the page visible.');
  }
  return turnMargins(margins, crop.rotation ?? currentRotation, currentRotation);
}

/**
 * The part of the original visible box a page still shows the content of, as
 * margins like crop margins (fractions, in the axes of the current rotation).
 * When margins are added around a page, crop.content records what it showed
 * then; the added space is blank, even where the PDF has content (outside an
 * earlier crop, or outside its own visible box). Without margins: all of it.
 */
export function contentMargins(crop, currentRotation = 0) {
  const margins = { left: 0, top: 0, right: 0, bottom: 0 };
  if (!crop?.content) return margins;
  for (const edge of Object.keys(margins)) {
    const value = Number(crop.content[edge] ?? 0);
    if (!Number.isFinite(value) || value < 0 || value >= 1)
      throw new Error('Crop margins must leave some of the page visible.');
    margins[edge] = value;
  }
  return turnMargins(margins, crop.rotation ?? currentRotation, currentRotation);
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
  const box = userBox(
    original.matrix,
    margins.left * original.width,
    margins.bottom * original.height,
    (1 - margins.right) * original.width,
    (1 - margins.top) * original.height,
  );
  if (!(box.width >= 1 && box.height >= 1))
    throw new Error('The cropped page must be at least 1 PDF point wide and high.');
  return boxGeometry(box, angle);
}

/** A rectangle of a view (display coordinates; `matrix` is the view's) as a box in user space. */
function userBox([a, b, c, d, e, f], left, bottom, right, top) {
  const xs = [],
    ys = [];
  for (const x of [left, right])
    for (const y of [bottom, top]) {
      xs.push(a * x + c * y + e);
      ys.push(b * x + d * y + f);
    }
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Paper sizes in points, portrait. */
export const PAPER_SIZES = Object.freeze({ a4: [595.28, 841.89], letter: [612, 792] });

// A page within this many points of a sheet, each way, is on that sheet already
// (half a millimetre: 595 × 842 is A4).
const SAME_SIZE = 1.5;

/** A sheet of `paper`, lying on its side (`landscape`) or upright: [width, height] in points. */
function sheetOf(paper, landscape) {
  if (!Object.hasOwn(PAPER_SIZES, paper)) throw new Error('Choose a paper size: A4 or Letter.');
  const [short, long] = PAPER_SIZES[paper];
  return landscape ? [long, short] : [short, long];
}

/**
 * A page put on a sheet of `paper` ('a4' | 'letter'; Resize pages). The sheet
 * lies the way the page does, and the page is scaled in proportion until it
 * fits, in the middle, so the sheet is blank beside it where their shapes
 * differ. `geometry` is the page as it is shown without the sheet, in its own
 * units of `unit` points each (/UserUnit). The result is the sheet: width and
 * height in points, cropBox the sheet in the page's user space, a matrix from
 * points on the sheet to user space, and `scale`, the points a user unit
 * becomes. A page that is that sheet already is returned as it is.
 */
export function fittedGeometry(geometry, paper, unit = 1) {
  const [width, height] = sheetOf(paper, geometry.width > geometry.height);
  if (
    unit === 1 &&
    Math.abs(width - geometry.width) < SAME_SIZE &&
    Math.abs(height - geometry.height) < SAME_SIZE
  )
    return geometry;
  const scale = Math.min(width / geometry.width, height / geometry.height);
  // The sheet around the page, in the page's display coordinates.
  const left = (geometry.width - width / scale) / 2,
    bottom = (geometry.height - height / scale) / 2;
  const sheet = boxGeometry(
    userBox(geometry.matrix, left, bottom, left + width / scale, bottom + height / scale),
    geometry.rotation,
  );
  return {
    ...sheet,
    width,
    height,
    matrix: multiply(sheet.matrix, [1 / scale, 0, 0, 1 / scale, 0, 0]),
    scale,
  };
}

/**
 * The geometries an exported page uses. `source` describes the source page:
 * its visible `box`, its own `rotation` and its `userUnit` (when not 1). The
 * page geometry places repeated settings; an annotation keeps the geometry of
 * the view it was placed in.
 */
export function pageGeometry(source, descriptor) {
  const geometry = ownGeometry(source, descriptor);
  return descriptor.paper ? fittedGeometry(geometry, descriptor.paper, source.userUnit || 1) : geometry;
}

/**
 * A page as it is before it is put on a sheet (descriptor.paper): turned and
 * cropped, with its added margins, in its own units. Crop and Add margins
 * change this page; the sheet then holds what they leave.
 */
export function ownGeometry(source, descriptor) {
  const descriptorRotation = descriptor.rotation || 0;
  return croppedGeometry(
    source.box,
    rotation(source.rotation + rotation(descriptorRotation)),
    descriptor.crop,
    descriptorRotation,
  );
}

/**
 * Crop margins drawn on a page's sheet (fractions of the sheet, as it is
 * shown), as fractions of the page fitted on it: the page is what gets cropped,
 * and what the crop keeps is fitted to the sheet again. `sheet` and `own` are
 * the page's geometry with and without its sheet. The blank of the sheet
 * beside the page counts for nothing.
 */
export function sheetCrop(margins, sheet, own) {
  if (!sheet.scale) return margins;
  const width = sheet.scale * own.width,
    height = sheet.scale * own.height;
  const share = (margin, whole, part) =>
    Math.min(1, Math.max(0, (margin * whole - (whole - part) / 2) / part));
  return {
    left: share(margins.left, sheet.width, width),
    right: share(margins.right, sheet.width, width),
    top: share(margins.top, sheet.height, height),
    bottom: share(margins.bottom, sheet.height, height),
  };
}

/**
 * Margins to add to a page on a sheet of `paper`, in the page's own units, so
 * that they measure `added` (points) on the sheet once the page, with them, is
 * fitted to it again: the page is made smaller to leave them. `own` is the
 * page's geometry without its sheet. The sheet lies the way the page with its
 * margins does, which wide margins can change.
 */
export function sheetMargins(added, own, paper) {
  const across = added.left + added.right,
    down = added.top + added.bottom;
  const wide = own.width > own.height;
  for (const landscape of [wide, !wide]) {
    const [width, height] = sheetOf(paper, landscape);
    const scale = Math.min((width - across) / own.width, (height - down) / own.height);
    if (!(scale > 0)) continue;
    const grown = { width: own.width + across / scale, height: own.height + down / scale };
    if (grown.width > grown.height === landscape)
      return Object.fromEntries(Object.entries(added).map(([edge, value]) => [edge, value / scale]));
  }
  throw new Error('These margins leave no room for the page on its sheet. Make them smaller.');
}

/**
 * The crop of a page whose source box changes from `from` to `to` ({ width,
 * height }), with its added margins the same size in points (they were typed in
 * millimetres) and its crop and content the same fractions of the page. An edge
 * has an added margin where its crop margin is below its content margin.
 */
export function rescaledMargins(crop, from, to) {
  if (!crop?.content) return crop;
  const turned = rotation(crop.rotation || 0) % 180 !== 0;
  const size = (box) => ({
    left: turned ? box.height : box.width,
    right: turned ? box.height : box.width,
    top: turned ? box.width : box.height,
    bottom: turned ? box.width : box.height,
  });
  const before = size(from),
    after = size(to);
  const next = { ...crop };
  for (const edge of ['left', 'top', 'right', 'bottom']) {
    const content = Number(crop.content[edge] ?? 0),
      value = Number(crop[edge] ?? 0);
    if (value < content) next[edge] = content - ((content - value) * before[edge]) / after[edge];
  }
  return next;
}

/**
 * Where a page shows its source's content, in user space: what its crop keeps
 * of its source's visible box, and, of that, the part recorded when margins
 * were added (crop.content). Added margins outside it are blank, and so is the
 * sheet beside a resized page, where a crop would otherwise show what it hid.
 */
export function contentBox(source, descriptor) {
  const descriptorRotation = descriptor.rotation || 0;
  const angle = rotation(source.rotation + rotation(descriptorRotation));
  const crop = descriptor.crop;
  if (!crop) return boxGeometry(source.box, angle).cropBox;
  const cut = cropMarginsForRotation(crop, descriptorRotation),
    shown = contentMargins(crop, descriptorRotation);
  return croppedGeometry(
    source.box,
    angle,
    {
      ...Object.fromEntries(Object.keys(cut).map((edge) => [edge, Math.max(cut[edge], shown[edge])])),
      rotation: descriptorRotation,
    },
    descriptorRotation,
  ).cropBox;
}

/**
 * The view of its page an item was placed in: the page as it was turned and
 * cropped then, and on the sheet it had then (pageRotation, pageCrop and
 * pagePaper record them), so the item stays where it is on the paper when its
 * page is turned, cropped or resized later.
 */
export function placementGeometry(source, descriptor, annotation) {
  const placed = annotation.pageRotation ?? descriptor.rotation ?? 0;
  const geometry = croppedGeometry(
    source.box,
    source.rotation + rotation(placed),
    annotation.pageCrop,
    placed,
  );
  return annotation.pagePaper
    ? fittedGeometry(geometry, annotation.pagePaper, source.userUnit || 1)
    : geometry;
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
    if (!paragraph) {
      lines.push('');
      continue;
    }
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
  const width = Math.max(
    1,
    Math.min(number(annotation.width, 0.8, 0.01, 1) * geometry.width, geometry.width - x),
  );
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
    const offset =
      annotation.align === 'right'
        ? width - lineWidth
        : annotation.align === 'center'
          ? (width - lineWidth) / 2
          : 0;
    const baseline = top - ascent - index * lineHeight;
    if (baseline < 0 && !problem)
      problem = 'A text annotation extends below its page. Move it up or use a smaller font.';
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

// ---- Drawings ------------------------------------------------------------------
// Pen strokes, lines, arrows, rectangles and ellipses (Draw). A drawing keeps
// its box like other items, and its points (pen, line, arrow) as fractions of
// that box, so moving and resizing it work as they do for images.

export const DRAWING_SHAPES = ['pen', 'line', 'arrow', 'rect', 'ellipse'];
// The Bézier constant for quarter ellipses, as pdf-lib uses.
const KAPPA = 4 * ((Math.SQRT2 - 1) / 3);
const round2 = (value) => Math.round(value * 100) / 100;

/** A drawing's box in display coordinates from the top left of its frame (not clipped to the page). */
export function drawingBox(annotation, geometry) {
  return {
    x: number(annotation.x, 0.1, 0, 1) * geometry.width,
    top: number(annotation.y, 0.1, 0, 1) * geometry.height,
    width: number(annotation.width, 0.2, 0.0001, 2) * geometry.width,
    height: number(annotation.height, 0.1, 0.0001, 2) * geometry.height,
  };
}

/**
 * A drawing as SVG path data in its frame, from the top left (y down), and its
 * stroke width. The preview draws it as a <path>; the export gives the same
 * data to pdf-lib's drawSvgPath, so the download matches the preview.
 */
export function drawingPath(annotation, geometry) {
  const { x, top, width, height } = drawingBox(annotation, geometry);
  const strokeWidth = number(annotation.strokeWidth, 2, 0.25, 48);
  const point = ([u, v]) => [x + number(u, 0, 0, 1) * width, top + number(v, 0, 0, 1) * height];
  const text = ([px, py]) => round2(px) + ' ' + round2(py);
  if (annotation.shape === 'rect') {
    const corners = [
      [x, top],
      [x + width, top],
      [x + width, top + height],
      [x, top + height],
    ];
    return { d: 'M' + corners.map(text).join('L') + 'Z', strokeWidth };
  }
  if (annotation.shape === 'ellipse') {
    const rx = width / 2,
      ry = height / 2,
      cx = x + rx,
      cy = top + ry,
      ox = rx * KAPPA,
      oy = ry * KAPPA;
    const curves = [
      [
        [cx - rx, cy - oy],
        [cx - ox, cy - ry],
        [cx, cy - ry],
      ],
      [
        [cx + ox, cy - ry],
        [cx + rx, cy - oy],
        [cx + rx, cy],
      ],
      [
        [cx + rx, cy + oy],
        [cx + ox, cy + ry],
        [cx, cy + ry],
      ],
      [
        [cx - ox, cy + ry],
        [cx - rx, cy + oy],
        [cx - rx, cy],
      ],
    ];
    return {
      d: 'M' + text([cx - rx, cy]) + curves.map((curve) => 'C' + curve.map(text).join(' ')).join('') + 'Z',
      strokeWidth,
    };
  }
  // Pen, line and arrow: through their points (a single point is a dot).
  const points = (
    Array.isArray(annotation.points) && annotation.points.length
      ? annotation.points
      : [
          [0, 0],
          [1, 1],
        ]
  ).map(point);
  let d =
    'M' +
    text(points[0]) +
    (points.length > 1
      ? points
          .slice(1)
          .map((p) => 'L' + text(p))
          .join('')
      : 'L' + text(points[0]));
  if (annotation.shape === 'arrow' && points.length > 1) {
    // An open head at the end, along the last segment.
    const tip = points.at(-1),
      from = points.at(-2),
      length = Math.hypot(from[0] - tip[0], from[1] - tip[1]) || 1,
      back = [(from[0] - tip[0]) / length, (from[1] - tip[1]) / length],
      size = Math.min(strokeWidth * 3 + 6, length * 0.6),
      side = (angle) => [
        tip[0] + size * (back[0] * Math.cos(angle) - back[1] * Math.sin(angle)),
        tip[1] + size * (back[0] * Math.sin(angle) + back[1] * Math.cos(angle)),
      ];
    d += 'M' + text(side(0.5)) + 'L' + text(tip) + 'L' + text(side(-0.5));
  }
  return { d, strokeWidth };
}

/** Whether a repeated setting (watermark, headers and footers, page numbers) is shown on a page. */
export function applies(setting, pageId) {
  return (
    Boolean(setting) &&
    setting.enabled !== false &&
    (!setting.pages || setting.pages === 'all' || setting.pages.includes(pageId))
  );
}

/** Today's date as 2026-11-10: read the same in every language, and drawn by every font. */
export function isoDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}
/**
 * A file's name without the extension of a file the editor opens: "Report
 * v1.2.pdf" is "Report v1.2". In composed form (NFC): macOS hands names over
 * decomposed, and the fonts have no glyphs for Hangul letters on their own.
 */
export function baseName(name) {
  return String(name ?? '')
    .normalize('NFC')
    .replace(/\.(pdf|jpe?g|png)$/i, '');
}
/**
 * What {date} and {filename} stand for on a page: today's date, and the name of
 * the file the page came from, without its extension (nothing for a blank page).
 */
export function pageVariables(state, descriptor) {
  const source = state?.sources?.find((item) => item.id === descriptor?.sourceId);
  return { date: isoDate(), filename: !source || source.blank ? '' : baseName(source.name) };
}
/**
 * Fill in {page}, {total}, {date} and {filename} (the last two from
 * pageVariables). The file's name goes in last and as it is: braces or a "$"
 * in it stand for nothing.
 */
export function variables(text, page, total, extra = {}) {
  return textValue(text)
    .replaceAll('{page}', String(page))
    .replaceAll('{total}', String(total))
    .replaceAll('{date}', () => extra.date ?? '')
    .replaceAll('{filename}', () => extra.filename ?? '');
}

export function watermarkText(setting, pageNumber, total, extra) {
  return variables(setting.text, pageNumber, total, extra).replace(/\n/g, ' ');
}

/** Place a watermark: shrunk to fit the page, including its rotated bounding box. */
export function layoutWatermark(setting, geometry, font, text) {
  let size = number(setting.size, 48, 4, 240);
  const angle = number(setting.angle, -35, -180, 180);
  const radians = (angle * Math.PI) / 180;
  const originalWidth = font.widthOfTextAtSize(text, size);
  const originalHeight = font.heightAtSize(size, { descender: false });
  const boundingWidth =
    Math.abs(originalWidth * Math.cos(radians)) + Math.abs(originalHeight * Math.sin(radians));
  const boundingHeight =
    Math.abs(originalWidth * Math.sin(radians)) + Math.abs(originalHeight * Math.cos(radians));
  size *= Math.min(
    1,
    (geometry.width * 0.86) / Math.max(1, boundingWidth),
    (geometry.height * 0.7) / Math.max(1, boundingHeight),
  );
  const width = font.widthOfTextAtSize(text, size);
  const height = font.heightAtSize(size, { descender: false });
  const rotatedHeight = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians));
  let centerY = geometry.height / 2;
  if (setting.position === 'top')
    centerY = geometry.height - Math.max(28 + rotatedHeight / 2, geometry.height * 0.15);
  if (setting.position === 'bottom') centerY = Math.max(28 + rotatedHeight / 2, geometry.height * 0.15);
  const centerX = geometry.width / 2;
  return {
    text,
    size,
    angle,
    width,
    height,
    x: centerX - (width * Math.cos(radians) - height * Math.sin(radians)) / 2,
    y: centerY - (width * Math.sin(radians) + height * Math.cos(radians)) / 2,
  };
}

function edgeMargin(setting, geometry) {
  return number(setting.margin, 28, 0, Math.min(geometry.width, geometry.height) / 3);
}

/**
 * With setting.mirror, left and right change places on even pages (the 2nd, 4th
 * and so on in the document), for printing on both sides: what is on the right of
 * odd pages stays on the outer edge.
 */
function side(align, setting, pageNumber) {
  if (!setting.mirror || pageNumber % 2) return align;
  return align === 'left' ? 'right' : align === 'right' ? 'left' : align;
}

/** The header and footer texts for one page, before measuring. */
export function headerFooterItems(setting, geometry, pageNumber, total, extra) {
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
        text: variables(setting[edge + slot], pageNumber, total, extra),
        size,
        margin,
        maxWidth,
        align: side(slot.toLowerCase(), setting, pageNumber),
        top: edge === 'header',
        problem: 'The header or footer is too long. Shorten it or use more than one text position.',
      });
    }
  }
  return items;
}

export function pageNumberItem(setting, geometry, pageNumber, total, extra) {
  const margin = edgeMargin(setting, geometry);
  const position = setting.position || 'bottom-center';
  return {
    key: 'pageNumber',
    text: variables(
      setting.format || 'Page {page} of {total}',
      pageNumber + number(setting.start, 1, 0, 1000000) - 1,
      total,
      extra,
    ),
    size: number(setting.size, 10, 4, 48),
    margin,
    maxWidth: geometry.width - margin * 2,
    align: side(
      position.endsWith('right') ? 'right' : position.endsWith('left') ? 'left' : 'center',
      setting,
      pageNumber,
    ),
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
  const x =
    item.align === 'right'
      ? geometry.width - item.margin - width
      : item.align === 'center'
        ? (geometry.width - width) / 2
        : item.margin;
  const ascent = font.heightAtSize(size, { descender: false });
  const y = item.top ? geometry.height - item.margin - ascent : item.margin;
  return { text: content, x, y, size, width, ascent, problem: size < 4 ? item.problem : null };
}
