// Tablet and desktop widths: nothing scrolls sideways on the home page, in the
// editor's tools or in batch, and the header keeps its links.
import { test, expect, openSample, ready, useTool } from './helpers.mjs';

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
