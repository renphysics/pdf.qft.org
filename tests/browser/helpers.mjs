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

/**
 * Every test fails on an uncaught error in the page, and on a content security
 * policy violation in the document: the page reports one through the console
 * (an inline style, a blob: worker, a data: font would each be one). The page
 * also keeps a list of the notices it has shown and of what it has told screen
 * readers, for expectToast.
 *
 * And every test fails on a request to another origin, from the page or from its
 * workers. That files never leave the device is the site's promise, and the
 * document's policy does not bind the workers that read them, so the requests
 * are counted here and not left to the policy.
 */
export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const errors = [],
      violations = [],
      elsewhere = [],
      { origin } = new URL(baseURL);
    page.on('pageerror', (error) => errors.push(String(error)));
    page.context().on('request', (request) => {
      const url = request.url();
      if (!/^(blob|data|about):/.test(url) && new URL(url).origin !== origin) elsewhere.push(url);
    });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        // While it takes a screenshot, Playwright adds a style element of its own, which
        // WebKit holds to the page's policy: not the site's doing (see previewDifference).
        if (window.qaScreenshot && event.violatedDirective === 'style-src-elem' && !event.sourceFile) return;
        console.error(
          `CSP violation: ${event.violatedDirective} blocked ${event.blockedURI || 'inline'} at ${event.sourceFile}:${event.lineNumber}`,
        );
      });
    });
    await page.addInitScript(() => {
      // The notices shown since the page loaded, each when it became visible or
      // changed while visible: a notice that was only written, or hidden at once,
      // is not in the list.
      window.qaNotices = [];
      window.qaNoticesRead = 0;
      // The name the app gives each file it hands to the browser: the download
      // attribute of the link it clicks (see download below).
      window.qaDownloadNames = [];
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.hasAttribute('download')) window.qaDownloadNames.push(this.download);
        return click.call(this);
      };
      // What screen readers were told: each text put into the two live regions,
      // and into which ('status' waits its turn, 'alert' interrupts).
      window.qaSpoken = [];
      document.addEventListener('DOMContentLoaded', () => {
        for (const kind of ['status', 'alert']) {
          const region = document.querySelector('#announce-' + kind),
            said = () => region.textContent && window.qaSpoken.push({ kind, text: region.textContent });
          if (!region) continue;
          said();
          new MutationObserver(said).observe(region, { childList: true, characterData: true, subtree: true });
        }
        const notice = document.querySelector('#toast'),
          message = document.querySelector('#toast-message');
        if (!notice || !message) return;
        const shown = () =>
          !notice.hidden &&
          window.qaNotices.push({ text: message.textContent, error: notice.classList.contains('error') });
        // One shown as the page started (its modules run before this event).
        shown();
        new MutationObserver(shown).observe(notice, {
          attributes: true,
          attributeFilter: ['hidden'],
          childList: true,
          characterData: true,
          subtree: true,
        });
      });
    });
    page.on('console', (message) => {
      if (message.text().startsWith('CSP violation:')) violations.push(message.text());
    });
    await use(page);
    expect(errors, 'uncaught errors in the page').toEqual([]);
    expect(violations, 'content security policy violations').toEqual([]);
    expect(elsewhere, 'requests to another origin').toEqual([]);
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

/** A downloaded PDF's bookmarks, as PDF.js reads them: [{ title, page (index), items? }]. */
export async function pdfOutline(bytes) {
  const lib = await pdfjsLib();
  const doc = await lib.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const read = (items = []) =>
    Promise.all(
      items.map(async (item) => {
        const destination = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest;
        const page = destination ? await doc.getPageIndex(destination[0]) : null;
        return { title: item.title, page, ...(item.items.length ? { items: await read(item.items) } : {}) };
      }),
    );
  const outline = await read((await doc.getOutline()) || []);
  await doc.loadingTask.destroy();
  return outline;
}

/** How a downloaded PDF opens: 'open', 'password' (needs one) or 'invalid'. */
export async function opensWith(bytes, password) {
  try {
    await PDFLib.PDFDocument.load(bytes, password === undefined ? {} : { password });
    return 'open';
  } catch (error) {
    return error.constructor.name === 'EncryptedPDFError' || /password/i.test(error.message)
      ? 'password'
      : 'invalid';
  }
}

/** Files made for a test, under tests/output. */
export async function writeTemporary(name, bytes) {
  const file = path.join(root, 'tests/output/browser-files', name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return file;
}

/** The editor is showing the document and has finished drawing the current page. */
export async function ready(page) {
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(page.locator('#workspace')).toBeVisible();
  await page.waitForFunction(() => {
    const current = document.querySelector('.page-view.current');
    return current && !current.classList.contains('render-pending');
  });
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

/**
 * A notice with `expected` was shown: a string is its whole text, a pattern a
 * part of it. Looks through the notices the page has shown since the last one
 * found (the list kept by the fixture above), and waits for it. So a notice
 * that hid itself during a slow step still counts, one that was written but
 * never shown does not, and neither does one from before the last expectation.
 *
 * The notice must have been said as well as shown: its text put into the live
 * region for screen readers, the one that interrupts when the notice is an error.
 */
export async function expectToast(page, expected) {
  const wanted =
    expected instanceof RegExp ? { source: expected.source, flags: expected.flags } : { text: expected };
  // The page is loading (a test that reloads it): asked again in a moment.
  const loading = (error) => ['(the page was loading: ' + String(error.message).split('\n')[0] + ')'];
  let notice;
  await expect
    .poll(
      async () => {
        const found = await page
          .evaluate((wanted) => {
            const pattern = 'source' in wanted ? new RegExp(wanted.source, wanted.flags) : null,
              shown = window.qaNotices.slice(window.qaNoticesRead),
              found = shown.findIndex(({ text }) => (pattern ? pattern.test(text) : text === wanted.text));
            if (found < 0) return shown.map(({ text }) => text);
            window.qaNoticesRead += found + 1;
            return { notice: shown[found] };
          }, wanted)
          .catch(loading);
        if (!found.notice) return found;
        notice = found.notice;
        return true;
      },
      {
        message: `a notice ${expected instanceof RegExp ? 'with ' + expected : JSON.stringify(expected)} was shown`,
      },
    )
    .toBe(true);
  await expect
    .poll(
      () =>
        page
          .evaluate(({ text, error }) => {
            const kind = error ? 'alert' : 'status',
              at = window.qaSpoken.findIndex((said) => said.kind === kind && said.text === text);
            if (at < 0) return window.qaSpoken.map((said) => said.kind + ': ' + said.text);
            // Each announcement answers for one notice: the same notice shown twice is said twice.
            window.qaSpoken.splice(at, 1);
            return true;
          }, notice)
          .catch(loading),
      {
        message: `the notice ${JSON.stringify(notice.text)} was announced to screen readers${notice.error ? ', as an alert' : ''}`,
      },
    )
    .toBe(true);
}

/**
 * Click something that downloads a file; returns its name and bytes. The name
 * is the one the app chose: the download attribute of the link it clicked. A
 * browser may offer the file under its own spelling of that name, and one does:
 * WebKit on Linux writes spaces as underscores, since the libsoup 3.6.6 that
 * Playwright 1.65 ships inside it. (Safari does not use libsoup.) So the name
 * the browser offers is checked against the app's, in either spelling.
 */
export async function download(page, click) {
  const [file] = await Promise.all([page.waitForEvent('download'), click()]);
  const name = await page.evaluate(() => window.qaDownloadNames.at(-1));
  expect(name, 'the app named the file it downloaded').toEqual(expect.any(String));
  expect(
    [name, name.replace(/\s/g, '_')],
    'the browser offers the file under the name the app chose',
  ).toContain(file.suggestedFilename());
  return { name, bytes: new Uint8Array(await readFile(await file.path())) };
}

/** Text lines the preview draws on the current page, after it has painted. */
export async function overlayLines(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  return page.locator('.page-view.current .page-overlay tspan').allTextContents();
}

/**
 * The share of pixels that differ between the preview of a page and the same
 * page of a downloaded PDF, drawn by PDF.js at the preview's scale in the page.
 * A pixel counts as the same if a pixel within one pixel of it in the other
 * image matches: anti-aliasing and font hinting vary between systems by less
 * than a pixel, while misplaced text is off by more.
 */
export async function previewDifference(page, bytes, pageNumber, siteRoot) {
  // The whole page must be on screen, clear of the status bar and notices.
  const { width } = page.viewportSize();
  await page.setViewportSize({ width, height: 2000 });
  await page
    .locator('[data-page-open]')
    .nth(pageNumber - 1)
    .click();
  await ready(page);
  // Hidden through each element's own style object while the picture is taken: a
  // style element would break the content security policy, which every test
  // checks. (Playwright's own, added for the screenshot, is let through: qaScreenshot.)
  const hide = (hidden) =>
    page.evaluate((hidden) => {
      window.qaScreenshot = hidden;
      for (const element of document.querySelectorAll('.edit-layer, .toast, .stage-caption'))
        if (hidden) element.style.setProperty('visibility', 'hidden', 'important');
        else element.style.removeProperty('visibility');
    }, hidden);
  await hide(true);
  const preview = (await page.locator('.page-view.current').screenshot()).toString('base64');
  await hide(false);
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
        return paint(context, canvas).then(
          () => context.getImageData(0, 0, canvas.width, canvas.height).data,
        );
      };
      const a = await draw(async (context) => context.drawImage(image, 0, 0));
      const b = await draw(
        (context, canvas) => pdfPage.render({ canvasContext: context, viewport, canvas }).promise,
      );
      await doc.loadingTask.destroy();
      const width = image.width,
        height = image.height;
      const near = (from, to, x, y) => {
        const i = (y * width + x) * 4;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const j = (ny * width + nx) * 4;
            if (
              Math.max(
                Math.abs(from[i] - to[j]),
                Math.abs(from[i + 1] - to[j + 1]),
                Math.abs(from[i + 2] - to[j + 2]),
              ) <= 60
            )
              return true;
          }
        }
        return false;
      };
      let different = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) if (!near(a, b, x, y) || !near(b, a, x, y)) different++;
      }
      return different / (width * height);
    },
    { preview, data: Buffer.from(bytes).toString('base64'), pageNumber, siteRoot },
  );
}

/**
 * Each line of text the preview draws on a page, with its width there and in a
 * downloaded PDF (points, from PDF.js). Widths come from the fonts' advances,
 * so unlike pixels they do not depend on how a system rasterizes text.
 */
export async function lineWidths(page, bytes, pageNumber, siteRoot) {
  await page
    .locator('[data-page-open]')
    .nth(pageNumber - 1)
    .click();
  await ready(page);
  return page.evaluate(
    async ({ data, pageNumber, siteRoot }) => {
      const lib = await import(new URL('assets/vendor/pdf.mjs', siteRoot).href);
      lib.GlobalWorkerOptions.workerSrc = new URL('assets/vendor/pdf.worker.mjs', siteRoot).href;
      const doc = await lib.getDocument({ data: Uint8Array.from(atob(data), (c) => c.charCodeAt(0)) })
        .promise;
      const items = (await (await doc.getPage(pageNumber)).getTextContent()).items;
      await doc.loadingTask.destroy();
      return [...document.querySelectorAll('.page-view.current .page-overlay tspan')]
        .filter((span) => span.textContent.trim())
        .map((span) => ({
          text: span.textContent,
          preview: Math.round(span.getComputedTextLength() * 100) / 100,
          pdf: Math.round((items.find((item) => item.str === span.textContent)?.width ?? NaN) * 100) / 100,
        }));
    },
    { data: Buffer.from(bytes).toString('base64'), pageNumber, siteRoot },
  );
}
