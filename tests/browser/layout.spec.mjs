// Tablet and desktop widths: nothing scrolls sideways on the home page, in the
// editor's tools or in batch, and the header keeps its links.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect, openSample, ready, root, useTool } from './helpers.mjs';

const TOOLS = [
  'text',
  'image',
  'highlight',
  'signature',
  'watermark',
  'footer',
  'numbers',
  'pages',
  'delete',
  'crop',
  'margins',
  'merge',
  'split',
  'sheets',
  'jpgtopdf',
  'pdftojpg',
  'protect',
  'unlock',
  'form',
  'properties',
  'draw',
];
const sideways = (page) =>
  page.evaluate(() => [
    document.documentElement.scrollWidth - innerWidth,
    ...[...document.querySelectorAll('#workspace *, #landing *')]
      .filter(
        (element) =>
          element.getClientRects().length && !element.closest('.canvas-scroll, .tool-tabs, .page-list'),
      )
      .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
      .slice(0, 3)
      .map((element) => element.tagName + '.' + String(element.className).split(' ')[0]),
  ]);

for (const width of [721, 768, 1024, 1280]) {
  test(`no sideways scrolling at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await expect(page.locator('.main-nav [data-action="tools-home"]')).toBeVisible();
    await expect(page.locator('.main-nav [data-action="privacy"]')).toBeVisible();
    expect(await sideways(page), 'home').toEqual([0]);
    await page.locator('[data-action="sample"]').first().click();
    await ready(page);
    for (const tool of TOOLS) {
      await useTool(page, tool);
      expect(await sideways(page), tool).toEqual([0]);
    }
    await page.locator('.batch-editor-link').click();
    await expect(page.locator('body')).toHaveClass(/batching/);
    expect(await sideways(page), 'batch').toEqual([0]);
  });
}

// A notice sits where it covers no control: in the toolbar's gap between page
// navigation and zoom, or, where that is too narrow, at the foot of the pages.
for (const width of [800, 1024, 1280, 1600]) {
  test(`a notice covers neither page navigation nor zoom at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openSample(page, 'add-page-numbers-to-pdf/');
    const toast = page.locator('#toast');
    await expect(toast).toBeVisible();
    const boxes = await page.evaluate(() =>
      ['#toast', '.page-navigation', '.zoom-controls', '.stage-caption', '#canvas-scroll'].map((selector) => {
        const { left, top, right, bottom } = document.querySelector(selector).getBoundingClientRect();
        return { left, top, right, bottom };
      }),
    );
    const [notice, navigation, zoom, status, stage] = boxes;
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    expect(overlaps(notice, navigation), 'page navigation is clear').toBe(false);
    expect(overlaps(notice, zoom), 'zoom is clear').toBe(false);
    expect(overlaps(notice, status), 'the status line is clear').toBe(false);
    expect(notice.left).toBeGreaterThanOrEqual(stage.left);
    expect(notice.right).toBeLessThanOrEqual(stage.right);
  });
}

// The editor is at least 520 px high, so in a shorter window the pages end below
// its edge: a notice at their foot would be out of sight.
for (const [width, height] of [
  [1024, 500],
  [844, 390],
]) {
  test(`a notice stays in a window ${width} px wide and ${height} px high`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openSample(page, 'add-page-numbers-to-pdf/');
    await expect(page.locator('#toast')).toBeVisible();
    const notice = await page.locator('#toast').boundingBox();
    expect(notice.y).toBeGreaterThanOrEqual(0);
    expect(notice.y + notice.height).toBeLessThanOrEqual(height);
    expect(notice.x).toBeGreaterThanOrEqual(0);
    expect(notice.x + notice.width).toBeLessThanOrEqual(width);
  });
}

// GitHub Pages sends no policy of its own; a host that reads dist/_headers sends
// that policy with every response, and a browser then holds a page to both.
test('with the policy of _headers sent too, the licenses page keeps its styles and the editor opens', async ({
  page,
}) => {
  const policy = (await readFile(path.join(root, 'dist/_headers'), 'utf8'))
    .match(/^\s*Content-Security-Policy:\s*(.+)$/m)[1]
    .trim();
  await page.route('**/*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
  });
  await page.goto('licenses/');
  await expect(page.locator('h1')).toHaveText('Licenses & credits.');
  // From licenses/licenses.css: an inline style block would be refused. (The
  // fixture fails the test on any violation.)
  expect(await page.locator('.license-wrap').evaluate((node) => getComputedStyle(node).maxWidth)).toBe(
    '1000px',
  );
  await openSample(page);
  await expect(page.locator('#document-info')).toHaveText(/^3 pages/);
});
