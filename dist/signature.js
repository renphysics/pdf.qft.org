/**
 * Signatures for Sign PDF, made in this browser as transparent PNG images:
 * drawn with a mouse, finger or pen; typed in a handwriting font (Allura); or
 * taken from a picture of a signature, whose light paper can be made
 * transparent. Nothing is sent anywhere, and a signature is kept on this
 * device only when the person asks for it.
 */
const assetUrl = (path) => new URL(path, import.meta.url).href;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const SIGNATURE_FONT = 'QFT Signature';
// Allura's Latin and Latin Extended files (assets/fonts, from @fontsource/allura).
const FONT_FACES = [
  [
    './assets/fonts/allura-latin-400-normal.woff2',
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  ],
  [
    './assets/fonts/allura-latin-ext-400-normal.woff2',
    'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
  ],
];
let fontLoading = null;

/** Load the handwriting font for typed signatures, once. */
export function loadSignatureFont() {
  fontLoading ||= Promise.all(
    FONT_FACES.map(([path, unicodeRange]) => {
      const face = new FontFace(SIGNATURE_FONT, `url("${assetUrl(path)}") format("woff2")`, { unicodeRange });
      document.fonts.add(face);
      return face.load();
    }),
  ).catch((error) => {
    fontLoading = null;
    throw new Error('The signature font could not be loaded. Check your connection, then try again.', {
      cause: error,
    });
  });
  return fontLoading;
}

/** The area of a canvas that has ink on it, or null if it is empty. */
function inkBox(canvas) {
  const { width, height } = canvas;
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        bottom = y;
      }
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** A signature image from the ink on a canvas: cropped, with a little room, as PNG bytes. */
async function signatureFrom(canvas) {
  const box = inkBox(canvas);
  if (!box) throw new Error('There is no signature yet. Draw, type or upload one first.');
  const room = Math.round(Math.max(box.width, box.height) * 0.03) + 2;
  const out = document.createElement('canvas');
  out.width = box.width + room * 2;
  out.height = box.height + room * 2;
  out
    .getContext('2d')
    .drawImage(canvas, box.x, box.y, box.width, box.height, room, room, box.width, box.height);
  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The signature could not be made. Please try again.');
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    type: 'png',
    width: out.width,
    height: out.height,
  };
}

let activePad = null;
/**
 * Let someone draw on a canvas with a mouse, finger or pen. `strokes` keeps
 * the drawing (in fractions of the canvas), so a pad attached to a new canvas
 * after the panel is redrawn shows it again. The canvas keeps three times its
 * on-screen resolution, so the signature stays sharp when printed.
 */
export function signaturePad(canvas, strokes, { color = '#1f2a44', onChange = () => {} } = {}) {
  activePad?.disconnect();
  const SCALE = 3;
  const context = canvas.getContext('2d');
  let current = null;
  const draw = (stroke) => {
    const { width, height } = canvas;
    const points = stroke.points.map(([x, y]) => [x * width, y * height]);
    context.strokeStyle = context.fillStyle = color;
    context.lineWidth = Math.max(2, height * 0.022);
    context.lineCap = context.lineJoin = 'round';
    context.beginPath();
    if (points.length === 1) {
      context.arc(points[0][0], points[0][1], context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
      return;
    }
    // Smooth curves through the midpoints between the points drawn.
    context.moveTo(...points[0]);
    for (let i = 1; i < points.length - 1; i++) {
      const [x, y] = points[i],
        [nx, ny] = points[i + 1];
      context.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    }
    context.lineTo(...points.at(-1));
    context.stroke();
  };
  const redraw = () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    strokes.forEach(draw);
    if (current) draw(current);
  };
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvas.width = Math.round(rect.width * SCALE);
    canvas.height = Math.round(rect.height * SCALE);
    redraw();
  };
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return [
      clamp((event.clientX - rect.left) / rect.width, 0, 1),
      clamp((event.clientY - rect.top) / rect.height, 0, 1),
    ];
  };
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    current = { points: [point(event)] };
    redraw();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!current) return;
    for (const each of event.getCoalescedEvents?.() || [event]) current.points.push(point(each));
    redraw();
  });
  const finish = () => {
    if (!current) return;
    strokes.push(current);
    current = null;
    redraw();
    onChange();
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  activePad = {
    disconnect: () => observer.disconnect(),
    clear() {
      strokes.length = 0;
      current = null;
      redraw();
      onChange();
    },
    setColor(value) {
      color = value;
      redraw();
    },
    toSignature: () => signatureFrom(canvas),
  };
  return activePad;
}

/** A typed signature: the text in the handwriting font, as a PNG image. */
export async function typedSignature(text, color = '#1f2a44') {
  const value = String(text || '').trim();
  if (!value) throw new Error('Type your name to make a signature.');
  await loadSignatureFont();
  const size = 160;
  const font = `${size}px "${SIGNATURE_FONT}"`;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  // Script letters reach well past their advance; leave room on every side.
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(measure.measureText(value).width + size * 1.2);
  canvas.height = Math.ceil(size * 2);
  const context = canvas.getContext('2d');
  context.font = font;
  context.fillStyle = color;
  context.textBaseline = 'middle';
  context.fillText(value, size * 0.6, canvas.height / 2);
  return signatureFrom(canvas);
}

/**
 * A signature from a PNG or JPG picture. With removeBackground, the paper
 * becomes transparent: anything clearly lighter than the picture's typical
 * brightness fades out, and the ink keeps its colour.
 */
export async function uploadedSignature(file, { removeBackground = true } = {}) {
  if (!['image/png', 'image/jpeg'].includes(file.type))
    throw new Error('Choose a PNG or JPG picture of your signature.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Choose a picture smaller than 15 MB.');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (error) {
    throw new Error('This picture could not be read. Choose a PNG or JPG file.', { cause: error });
  }
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  if (removeBackground) {
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    const luminance = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    // Most of a signature picture is paper: its median brightness is the paper's.
    const histogram = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 4) histogram[Math.round(luminance(i))]++;
    let paper = 255;
    for (let level = 0, seen = 0; level < 256; level++) {
      seen += histogram[level];
      if (seen >= data.length / 8) {
        paper = level;
        break;
      }
    }
    for (let i = 0; i < data.length; i += 4) {
      data[i + 3] = Math.round(data[i + 3] * clamp((paper - 20 - luminance(i)) / 50, 0, 1));
    }
    context.putImageData(image, 0, 0);
  }
  return signatureFrom(canvas);
}

const STORAGE_KEY = 'qft-pdf:signature';
const toBase64 = (bytes) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};

/** The signature kept on this device, or null. */
export function savedSignature() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.version !== 1 || typeof saved.png !== 'string') return null;
    const bytes = Uint8Array.from(atob(saved.png), (char) => char.charCodeAt(0));
    return { bytes, type: 'png', width: saved.width, height: saved.height };
  } catch {
    return null;
  }
}

/** Keep a signature on this device. Resolves false if the browser refuses. */
export function saveSignature(signature) {
  try {
    const record = {
      version: 1,
      png: toBase64(signature.bytes),
      width: signature.width,
      height: signature.height,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function forgetSignature() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing kept, nothing to remove.
  }
}
