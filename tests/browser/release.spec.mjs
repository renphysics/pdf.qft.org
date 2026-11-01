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

test('builds downloads on the page where module workers are missing', async ({ page }) => {
  await page.addInitScript(() => {
    delete window.Worker;
  });
  await openSample(page, 'add-page-numbers-to-pdf/');
  await page.click('[data-action="toggle-setting"]');
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
