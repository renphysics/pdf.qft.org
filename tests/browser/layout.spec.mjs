// Tablet and desktop widths: nothing scrolls sideways on the home page, in the
// editor's tools or in batch, and the header keeps its links.
import { test, expect, openSample, ready, useTool } from './helpers.mjs';

const TOOLS = ['text', 'image', 'highlight', 'signature', 'watermark', 'footer', 'numbers', 'pages', 'delete', 'crop', 'merge', 'split', 'jpgtopdf', 'pdftojpg', 'protect', 'unlock'];
const sideways = (page) =>
  page.evaluate(() => [
    document.documentElement.scrollWidth - innerWidth,
    ...[...document.querySelectorAll('#workspace *, #landing *')]
      .filter((element) => element.getClientRects().length && !element.closest('.canvas-scroll, .tool-tabs, .page-list'))
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
