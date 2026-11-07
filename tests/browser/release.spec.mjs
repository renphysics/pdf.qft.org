// The site as deployed: stamped with versioned URLs (scripts/stamp-release.mjs)
// and served under the GitHub project path, /pdf.qft.org/.
import { test, expect, openSample, download, pdfText } from './helpers.mjs';

test('loads one versioned release and builds downloads in the export worker', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(new URL(request.url())));
  const workers = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  await openSample(page, 'add-text-to-pdf/');
  await page.click('[data-action="add-text"]');
  await page.keyboard.type('Release café 中文 123');
  await page.keyboard.press('Escape');
  const { bytes } = await download(page, () => page.click('#download-button'));
  expect((await pdfText(bytes))[0]).toContain('Release café 中文 123');
  expect(workers.some((url) => /export-worker\.js\?v=[0-9a-f]{12}$/.test(url)), 'the export ran in the versioned worker').toBe(true);

  // Every script, style and engine request carries the release's version.
  const code = requests.filter((url) => /\.(m?js|css)$/.test(url.pathname));
  expect(code.length).toBeGreaterThan(5);
  expect(code.filter((url) => !/^\?v=[0-9a-f]{12}$/.test(url.search)).map((url) => url.pathname)).toEqual([]);
  expect(requests.every((url) => url.pathname.startsWith('/pdf.qft.org/'))).toBe(true);
});

test('a font is downloaded once and then comes from Cache Storage, even when the network no longer serves it', async ({ page }) => {
  const fontRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/assets/fonts/NotoSans-Regular.ttf')) fontRequests.push(request.url());
  });
  await openSample(page, 'add-text-to-pdf/');
  await page.click('[data-action="add-text"]');
  await page.keyboard.type('Café');
  await page.keyboard.press('Escape');
  await expect(page.locator('.page-view.current .page-overlay')).toContainText('Café');
  await expect.poll(() => fontRequests.length).toBe(1);
  expect(fontRequests[0]).toMatch(/NotoSans-Regular\.ttf\?v=[0-9a-f]{12}$/);
  await expect
    .poll(() => page.evaluate(async () => (await (await caches.open('qft-fonts')).keys()).map((request) => request.url)))
    .toEqual([fontRequests[0]]);
  // A second visit: the font comes from the cache; the network is not asked.
  await page.route('**/assets/fonts/NotoSans-Regular.ttf*', (route) => route.abort());
  await openSample(page, 'add-text-to-pdf/');
  await page.click('[data-action="add-text"]');
  await page.keyboard.type('Déjà vu');
  await page.keyboard.press('Escape');
  await expect(page.locator('.page-view.current .page-overlay')).toContainText('Déjà vu');
  await expect(page.locator('#toast-message')).not.toContainText('could not be loaded');
});

test('builds downloads on the page where module workers are missing', async ({ page }) => {
  await page.addInitScript(() => {
    delete window.Worker;
  });
  // Opened on Add page numbers: they are on at once.
  await openSample(page, 'add-page-numbers-to-pdf/');
  await expect(page.locator('[data-action="toggle-setting"]')).toHaveAttribute('aria-checked', 'true');
  const { bytes } = await download(page, () => page.click('#download-button'));
  expect((await pdfText(bytes))[2]).toContain('Page 3 of 3');
});

test('a tool address opens that tool after a reload', async ({ page }) => {
  await page.goto('crop-pdf/');
  await expect(page.locator('#landing h1')).toContainText('Crop PDF pages');
  await page.reload();
  await page.locator('[data-action="sample"]').first().click();
  await expect(page.locator('#tool-select')).toHaveValue('crop');
});
