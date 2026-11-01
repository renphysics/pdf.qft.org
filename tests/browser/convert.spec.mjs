// JPG to PDF and PDF to JPG.
import { createRequire } from 'node:module';
import path from 'node:path';
import { test, expect, fixture, openSample, ready, useTool, download, writeTemporary, PDFLib, root } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { createCanvas } = require(path.join(root, 'node_modules/@napi-rs/canvas'));

/** A picture with a left and a right half in different colours. */
function picture(width, height, type) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#c0392b';
  context.fillRect(0, 0, width / 2, height);
  context.fillStyle = '#2c6fbb';
  context.fillRect(width / 2, 0, width / 2, height);
  return canvas.toBuffer(type === 'png' ? 'image/png' : 'image/jpeg');
}

/** A JPEG with an EXIF orientation tag, as phone cameras write it (6: turn 90° clockwise to view). */
function withOrientation(jpeg, orientation) {
  const tiff = Buffer.alloc(26);
  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x0112, 10);
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientation, 18);
  tiff.writeUInt32LE(0, 22);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const marker = Buffer.alloc(4);
  marker.writeUInt16BE(0xffe1, 0);
  marker.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), marker, payload, jpeg.subarray(2)]);
}

const pageSizes = async (bytes) =>
  (await PDFLib.PDFDocument.load(bytes)).getPages().map((page) => [Math.round(page.getWidth()), Math.round(page.getHeight())]);

test('pictures become pages: turned upright, on Letter or their own size, in one PDF', async ({ page }) => {
  const wide = await writeTemporary('wide.png', picture(800, 400, 'png'));
  // Stored 400 x 200, shown upright as 200 x 400.
  const photo = await writeTemporary('photo.jpg', withOrientation(picture(400, 200, 'jpg'), 6));
  await page.goto('jpg-to-pdf/');
  await expect(page.locator('#landing .upload-button')).toContainText('Choose pictures');
  await page.setInputFiles('#file-input', [wide, photo]);
  await ready(page);
  await expect(page.locator('#tool-select')).toHaveValue('jpgtopdf');
  await expect(page.locator('#document-info')).toHaveText(/^2 pages/);
  await expect(page.locator('#toast-message')).toContainText('2 pictures are PDF pages now');
  // The browser's language is en-US: Letter, turned to suit each picture.
  await expect(page.locator('#tool-form [name="pictureSize"]')).toHaveValue('letter');
  let file = await download(page, () => page.click('#download-button'));
  expect(file.name).toBe('combined-converted.pdf');
  expect(await pageSizes(file.bytes)).toEqual([[792, 612], [612, 792]]);

  // Their own size, no margin; undo brings Letter back.
  await page.selectOption('#tool-form [name="pictureSize"]', 'fit');
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await page.selectOption('#tool-form [name="pictureMargin"]', '0');
  await expect(page.locator('#busy-overlay')).toBeHidden();
  file = await download(page, () => page.click('#download-button'));
  expect(await pageSizes(file.bytes)).toEqual([[600, 300], [150, 300]]);
  // The photo's page shows it upright: red at the top (its stored left half), blue below.
  const doc = await PDFLib.PDFDocument.load(file.bytes);
  const jpeg = doc.context.enumerateIndirectObjects().find(([, object]) => object.dict?.get(PDFLib.PDFName.of('Filter')) === PDFLib.PDFName.of('DCTDecode'))[1];
  expect([jpeg.dict.get(PDFLib.PDFName.of('Width')).asNumber(), jpeg.dict.get(PDFLib.PDFName.of('Height')).asNumber()]).toEqual([200, 400]);

  // PDFs join the pictures.
  await page.click('[data-action="add-files"]');
  await page.setInputFiles('#file-input', fixture('rotated-cropped.pdf'));
  await expect(page.locator('#document-info')).toHaveText(/^6 pages/);
});

test('pages become JPG pictures in a ZIP, or one PNG', async ({ page }) => {
  await openSample(page, 'pdf-to-jpg/');
  await expect(page.locator('#tool-select')).toHaveValue('pdftojpg');
  const zip = await download(page, () => page.click('#tool-form [type="submit"]'));
  expect(zip.name).toBe('A little room to create-pictures.zip');
  const text = Buffer.from(zip.bytes).toString('latin1');
  expect(text.split('PK\u0003\u0004').length - 1).toBe(3);
  expect(text).toContain('A little room to create-page-1.jpg');
  expect(text).toContain('ÿØÿ');

  await page.locator('label:has(input[name="pictureFormat"][value="png"])').click();
  await page.selectOption('#tool-form [name="pictureScope"]', 'current');
  const png = await download(page, () => page.click('#tool-form [type="submit"]'));
  expect(png.name).toBe('A little room to create-page-1.png');
  const header = Buffer.from(png.bytes);
  expect(header.subarray(1, 4).toString('latin1')).toBe('PNG');
  // 150 dpi: an A4 page is 1240 x 1753 pixels.
  expect([header.readUInt32BE(16), header.readUInt32BE(20)]).toEqual([1240, 1753]);
});

test('with Add an image, a picture added from the page strip goes on the page', async ({ page }) => {
  const logo = await writeTemporary('logo.png', picture(200, 100, 'png'));
  await openSample(page, 'add-text-to-pdf/');
  await useTool(page, 'image');
  await page.locator('.pages-heading [data-action="add-files"]').click();
  await page.setInputFiles('#file-input', logo);
  await expect(page.locator('#edit-layer [data-item-id]')).toHaveCount(1);
  await expect(page.locator('#document-info')).toHaveText(/^3 pages/);
});
