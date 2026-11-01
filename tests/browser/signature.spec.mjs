// Sign PDF: draw, type or upload a signature, place it, and download.
import { createRequire } from 'node:module';
import { test, expect, openSample, ready, useTool, download, writeTemporary, PDFLib, root } from './helpers.mjs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { PDFName, PDFRawStream } = PDFLib;

/** Image objects in a PDF, and how many images each page uses. */
async function images(bytes) {
  const doc = await PDFLib.PDFDocument.load(bytes);
  const count = doc.context
    .enumerateIndirectObjects()
    .filter(([, object]) => object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')).length;
  const perPage = doc.getPages().map((page) => page.node.Resources()?.lookup(PDFName.of('XObject'))?.keys().length || 0);
  return { count, perPage };
}

async function drawSignature(page) {
  const pad = await page.locator('#signature-pad').boundingBox();
  const at = (x, y) => [pad.x + pad.width * x, pad.y + pad.height * y];
  await page.mouse.move(...at(0.15, 0.6));
  await page.mouse.down();
  for (const [x, y] of [[0.25, 0.3], [0.35, 0.7], [0.45, 0.35], [0.55, 0.65], [0.7, 0.4], [0.85, 0.55]]) await page.mouse.move(...at(x, y), { steps: 4 });
  await page.mouse.up();
}

test('draw a signature, place it on one page and on every page; the PDF stores it once', async ({ page }) => {
  const original = await images(new Uint8Array(await (await import('node:fs/promises')).readFile(path.join(root, 'dist/assets/sample.pdf'))));
  await openSample(page, 'sign-pdf/');
  await expect(page.locator('#tool-select')).toHaveValue('signature');
  await expect(page.locator('[data-action="signature-use"]')).toBeDisabled();
  await drawSignature(page);
  await expect(page.locator('[data-action="signature-use"]')).toBeEnabled();
  await page.click('[data-action="signature-use"]');
  await expect(page.locator('.signature-preview img')).toBeVisible();

  // Click the page to place it there.
  const surface = await page.locator('.page-view.current').boundingBox();
  await page.mouse.click(surface.x + surface.width * 0.3, surface.y + surface.height * 0.45);
  await expect(page.locator('.edit-layer [data-item-id]')).toHaveCount(1);
  await expect(page.locator('#tool-panel h2')).toHaveText('Edit signature');
  // Copy it to every other page, then undo that.
  await page.click('[data-action="signature-copy"]');
  await page.locator('[data-page-open]').nth(2).click();
  await ready(page);
  await expect(page.locator('.page-view.current .page-overlay image')).toHaveCount(1);
  // Undo returns to page 1, where the copy was made; page 3 is clear again.
  await page.click('#undo-button');
  await page.locator('[data-page-open]').nth(2).click();
  await ready(page);
  await expect(page.locator('.page-view.current .page-overlay image')).toHaveCount(0);
  await page.click('#redo-button');

  const { bytes } = await download(page, () => page.click('#download-button'));
  const signed = await images(bytes);
  // A PNG with transparency is an image and its mask: two objects, however many pages.
  expect(signed.count - original.count).toBe(2);
  expect(signed.perPage.map((n, i) => n - original.perPage[i])).toEqual([1, 1, 1]);
});

test('type a signature and add it to every page', async ({ page }) => {
  await openSample(page, 'sign-pdf/');
  await page.locator('label:has(input[name="signatureMode"][value="type"])').click();
  await page.fill('#tool-form [name="signatureText"]', 'Alex Morgan');
  await expect(page.locator('#signature-typed')).toHaveText('Alex Morgan');
  await page.locator('label:has(input[name="signatureColor"][value="#1d3f9e"])').click();
  await page.click('[data-action="signature-use"]');
  await expect(page.locator('.signature-preview img')).toBeVisible();
  // The ink is the chosen blue: check a dark pixel of the typed signature.
  const blue = await page.evaluate(async () => {
    const image = document.querySelector('.signature-preview img');
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255) return [data[i], data[i + 1], data[i + 2]];
    return null;
  });
  expect(blue).toEqual([0x1d, 0x3f, 0x9e]);
  await page.click('[data-action="signature-place-all"]');
  await expect(page.locator('#toast-message')).toContainText('on all 3 pages');
  const { bytes } = await download(page, () => page.click('#download-button'));
  const signed = await images(bytes);
  expect(signed.perPage.every((n) => n >= 1)).toBe(true);
});

test('upload a picture of a signature: the paper becomes transparent', async ({ page }) => {
  const { createCanvas } = require(path.join(root, 'node_modules/@napi-rs/canvas'));
  const canvas = createCanvas(600, 240);
  const context = canvas.getContext('2d');
  context.fillStyle = '#f2efe6'; // slightly grey paper
  context.fillRect(0, 0, 600, 240);
  context.strokeStyle = '#202020';
  context.lineWidth = 8;
  context.beginPath();
  context.moveTo(60, 160);
  context.bezierCurveTo(160, 20, 260, 220, 360, 90);
  context.bezierCurveTo(420, 30, 480, 200, 540, 120);
  context.stroke();
  const file = await writeTemporary('signature-photo.png', canvas.toBuffer('image/png'));

  await openSample(page, 'sign-pdf/');
  await page.locator('label:has(input[name="signatureMode"][value="upload"])').click();
  await expect(page.locator('#tool-form [name="removeBackground"]')).toBeChecked();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-action="signature-choose"]')]);
  await chooser.setFiles(file);
  await expect(page.locator('.signature-preview img')).toBeVisible();
  const corners = await page.evaluate(async () => {
    const image = document.querySelector('.signature-preview img');
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const alpha = (x, y) => context.getImageData(x, y, 1, 1).data[3];
    return { size: [canvas.width, canvas.height], corners: [alpha(0, 0), alpha(canvas.width - 1, canvas.height - 1)] };
  });
  expect(corners.corners).toEqual([0, 0]);
  // Cropped to the ink, not the whole photo.
  expect(corners.size[0]).toBeLessThan(600);
  expect(corners.size[1]).toBeLessThan(240);
});

test('a signature is kept on this device only when asked', async ({ page }) => {
  await openSample(page, 'sign-pdf/');
  await drawSignature(page);
  await page.click('[data-action="signature-use"]');
  const keep = page.locator('#tool-form [name="keepSignature"]');
  await expect(keep).not.toBeChecked();
  await page.reload();
  await openSample(page, 'sign-pdf/');
  await expect(page.locator('#signature-pad')).toBeVisible();

  await drawSignature(page);
  await page.click('[data-action="signature-use"]');
  await keep.check();
  await page.reload();
  await openSample(page, 'sign-pdf/');
  await expect(page.locator('.signature-preview img')).toBeVisible();
  await page.locator('#tool-form [name="keepSignature"]').uncheck();
  await page.reload();
  await openSample(page, 'sign-pdf/');
  await expect(page.locator('#signature-pad')).toBeVisible();
});

test('clicking the page before making a signature explains what to do', async ({ page }) => {
  await openSample(page, 'sign-pdf/');
  const surface = await page.locator('.page-view.current').boundingBox();
  await page.mouse.click(surface.x + surface.width * 0.5, surface.y + surface.height * 0.5);
  await expect(page.locator('#toast-message')).toContainText('Make your signature first');
  await expect(page.locator('.edit-layer [data-item-id]')).toHaveCount(0);
  await useTool(page, 'text');
  await useTool(page, 'signature');
});
