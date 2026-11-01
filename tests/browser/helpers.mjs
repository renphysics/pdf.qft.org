// Shared helpers for the browser tests (playwright.config.mjs).
import { test as base, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const fixture = (name) => path.join(root, 'tests/fixtures', name);
export const PDFLib = require('@cantoo/pdf-lib');
export { expect };

/** Every test fails on an uncaught error in the page. */
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await use(page);
    expect(errors, 'uncaught errors in the page').toEqual([]);
  },
});

let pdfjs;
async function pdfjsLib() {
  pdfjs ||= await import(pathToFileURL(path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
  return pdfjs;
}

/** Each page's text, as PDF.js reads it from the downloaded file. */
export async function pdfText(bytes, password) {
  const lib = await pdfjsLib();
  const doc = await lib.getDocument({ data: bytes.slice(), password, verbosity: 0 }).promise;
  const pages = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const content = await (await doc.getPage(number)).getTextContent();
    pages.push(content.items.map((item) => item.str).join(' '));
  }
  await doc.loadingTask.destroy();
  return pages;
}

/** How a downloaded PDF opens: 'open', 'password' (needs one) or 'invalid'. */
export async function opensWith(bytes, password) {
  try {
    await PDFLib.PDFDocument.load(bytes, password === undefined ? {} : { password });
    return 'open';
  } catch (error) {
    return error.constructor.name === 'EncryptedPDFError' || /password/i.test(error.message) ? 'password' : 'invalid';
  }
}

/** Files made for a test, under tests/output. */
export async function writeTemporary(name, bytes) {
  const file = path.join(root, 'tests/output/browser-files', name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return file;
}

/** The editor is showing the document and has finished drawing the page. */
export async function ready(page) {
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(page.locator('#workspace')).toBeVisible();
  await page.waitForFunction(() => !document.querySelector('#page-surface').classList.contains('render-pending'));
}

export async function openSample(page, address = './') {
  await page.goto(address);
  await page.locator('[data-action="sample"]').first().click();
  await ready(page);
}

export async function openFiles(page, files, address = './') {
  await page.goto(address);
  await page.setInputFiles('#file-input', files);
  await ready(page);
}

export async function useTool(page, tool) {
  if (await page.locator('#tool-select').isVisible()) await page.selectOption('#tool-select', tool);
  else await page.locator(`.tool-tabs [data-tool="${tool}"]`).click();
}

export async function toastText(page) {
  await expect(page.locator('#toast')).toBeVisible();
  return page.locator('#toast-message').textContent();
}

/** Click something that downloads a file; returns its name and bytes. */
export async function download(page, click) {
  const [file] = await Promise.all([page.waitForEvent('download'), click()]);
  return { name: file.suggestedFilename(), bytes: new Uint8Array(await readFile(await file.path())) };
}

/** Text lines the preview draws on the current page, after it has painted. */
export async function overlayLines(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.locator('#page-overlay tspan').allTextContents();
}

/**
 * The share of pixels that differ between the preview of a page and the same
 * page of a downloaded PDF, drawn by PDF.js at the preview's scale in the page.
 */
export async function previewDifference(page, bytes, pageNumber, siteRoot) {
  // The whole page must be on screen, clear of the status bar and notices.
  const { width } = page.viewportSize();
  await page.setViewportSize({ width, height: 2000 });
  await page.locator('[data-page-open]').nth(pageNumber - 1).click();
  await ready(page);
  await page.addStyleTag({ content: '#edit-layer, .toast, .stage-caption { visibility: hidden !important; }' });
  const preview = (await page.locator('#page-surface').screenshot()).toString('base64');
  return page.evaluate(
    async ({ preview, data, pageNumber, siteRoot }) => {
      const lib = await import(new URL('assets/vendor/pdf.mjs', siteRoot).href);
      lib.GlobalWorkerOptions.workerSrc = new URL('assets/vendor/pdf.worker.mjs', siteRoot).href;
      const doc = await lib.getDocument({
        data: Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
        standardFontDataUrl: new URL('assets/vendor/standard_fonts/', siteRoot).href,
      }).promise;
      const pdfPage = await doc.getPage(pageNumber);
      const image = new Image();
      image.src = 'data:image/png;base64,' + preview;
      await image.decode();
      const scale = image.width / pdfPage.getViewport({ scale: 1 }).width;
      const viewport = pdfPage.getViewport({ scale });
      const draw = (paint) => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        return paint(context, canvas).then(() => context.getImageData(0, 0, canvas.width, canvas.height).data);
      };
      const a = await draw(async (context) => context.drawImage(image, 0, 0));
      const b = await draw((context, canvas) => pdfPage.render({ canvasContext: context, viewport, canvas }).promise);
      await doc.loadingTask.destroy();
      let different = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 60) different++;
      }
      return different / (a.length / 4);
    },
    { preview, data: Buffer.from(bytes).toString('base64'), pageNumber, siteRoot },
  );
}
