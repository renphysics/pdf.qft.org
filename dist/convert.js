/**
 * Pictures and pages, converted in this browser: JPG and PNG files become PDF
 * pages (photos turned upright first, since PDF ignores a JPEG's orientation
 * tag), and pages are saved as JPG or PNG images, drawn by PDF.js from the
 * PDF as it downloads, edits included.
 */
import { openDocument } from './preview.js';

export const PICTURE_TYPES = ['image/jpeg', 'image/png'];
const MAX_PICTURE_BYTES = 50 * 1024 * 1024;
const MAX_PICTURE_PIXELS = 40_000_000;
// Browsers refuse larger canvases (iOS Safari: 16.7 million pixels).
const MAX_CANVAS_PIXELS = 16_000_000;

export const isPicture = (file) =>
  PICTURE_TYPES.includes(file.type) || /\.(jpe?g|png)$/i.test(file.name || '');

/** The EXIF orientation a JPEG asks for: 1 is as stored, 2 to 8 flip or turn it. */
export function jpegOrientation(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;
  for (let offset = 2; offset + 4 <= view.byteLength; ) {
    const marker = view.getUint16(offset);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
    const length = view.getUint16(offset + 2);
    // APP1 with "Exif\0\0", then a TIFF header: byte order, magic, first directory.
    if (
      marker === 0xffe1 &&
      offset + 10 + 8 <= view.byteLength &&
      view.getUint32(offset + 4) === 0x45786966
    ) {
      const tiff = offset + 10;
      const little = view.getUint16(tiff) === 0x4949;
      const directory = tiff + view.getUint32(tiff + 4, little);
      if (directory + 2 > view.byteLength) return 1;
      const entries = view.getUint16(directory, little);
      for (let i = 0; i < entries; i++) {
        const entry = directory + 2 + i * 12;
        if (entry + 12 > view.byteLength) return 1;
        if (view.getUint16(entry, little) === 0x0112) {
          const value = view.getUint16(entry + 8, little);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
      return 1;
    }
    offset += 2 + length;
  }
  return 1;
}

const toBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('This picture could not be made. Please try again.')),
      type,
      quality,
    ),
  );

/**
 * A JPG or PNG file, ready to become a page: { name, bytes, type, width,
 * height }, upright, with its size in pixels. A turned photo is saved again,
 * upright, as a high-quality JPEG; other pictures keep their own bytes.
 */
export async function pictureForPage(file) {
  if (!isPicture(file)) throw new Error('Choose JPG or PNG pictures, or PDF files.');
  if (file.size > MAX_PICTURE_BYTES)
    throw new Error(`“${file.name}” is larger than 50 MB. Choose a smaller picture.`);
  let bytes = new Uint8Array(await file.arrayBuffer());
  const type = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'png' : 'jpg';
  let bitmap;
  try {
    // Browsers apply the EXIF orientation here.
    bitmap = await createImageBitmap(
      new Blob([bytes], { type: type === 'png' ? 'image/png' : 'image/jpeg' }),
      {
        imageOrientation: 'from-image',
      },
    );
  } catch (error) {
    throw new Error(`“${file.name}” could not be read. Choose JPG or PNG pictures.`, { cause: error });
  }
  const { width, height } = bitmap;
  try {
    if (width * height > MAX_PICTURE_PIXELS)
      throw new Error(`“${file.name}” has more than 40 million pixels. Choose a smaller picture.`);
    if (type === 'jpg' && jpegOrientation(bytes) !== 1) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      bytes = new Uint8Array(await (await toBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer());
    }
  } finally {
    bitmap.close();
  }
  return { name: file.name, bytes, type, width, height };
}

/**
 * Pages of a PDF as pictures: [{ name, bytes }]. pageNumbers are one-based.
 * Each page is drawn on white at `dpi` (fewer if the page is very large).
 */
export async function pagesToImages(
  pdfBytes,
  pageNumbers,
  { format = 'jpg', dpi = 150, baseName = 'page', onProgress = () => {}, shouldCancel = () => false } = {},
) {
  const task = await openDocument(pdfBytes.slice());
  const width = String(Math.max(...pageNumbers)).length;
  const type = format === 'png' ? 'image/png' : 'image/jpeg';
  const results = [];
  try {
    const doc = await task.promise;
    for (const [position, number] of pageNumbers.entries()) {
      if (shouldCancel())
        throw Object.assign(new Error('Stopped. No pictures were saved.'), { name: 'AbortError' });
      const page = await doc.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(dpi / 72, Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height)));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      const blob = await toBlob(canvas, type, 0.9);
      results.push({
        name: `${baseName}-page-${String(number).padStart(width, '0')}.${format === 'png' ? 'png' : 'jpg'}`,
        bytes: new Uint8Array(await blob.arrayBuffer()),
      });
      canvas.width = canvas.height = 0;
      page.cleanup();
      onProgress((position + 1) / pageNumbers.length);
    }
  } finally {
    await task.destroy();
  }
  return results;
}
