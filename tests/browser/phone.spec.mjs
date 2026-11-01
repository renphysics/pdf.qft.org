// Phones (iPhone 13 size, touch): the document comes first, tools sit in a
// bottom bar, controls are large enough to tap, and nothing scrolls sideways.
import { test, expect, openSample, ready, overlayLines } from './helpers.mjs';

const TOOLS = ['text', 'image', 'highlight', 'signature', 'watermark', 'footer', 'numbers', 'pages', 'delete', 'crop', 'merge', 'split', 'protect', 'unlock'];

/** Elements wider than the screen, outside the areas that scroll on purpose. */
function overflow(page) {
  return page.evaluate(() => ({
    page: document.documentElement.scrollWidth - innerWidth,
    wide: [...document.querySelectorAll('body *')]
      .filter((element) => {
        if (!element.getClientRects().length || element.closest('.canvas-scroll, .tool-tabs, .page-list, [hidden]')) return false;
        return element.getBoundingClientRect().right > innerWidth + 1;
      })
      .slice(0, 5)
      .map((element) => element.tagName.toLowerCase() + (element.id ? '#' + element.id : '') + '.' + String(element.className).split(' ')[0]),
  }));
}

test('the page comes first, and tapping it adds text', async ({ page }) => {
  await openSample(page, 'add-text-to-pdf/');
  const surface = await page.locator('#page-surface').boundingBox();
  expect(surface.y, 'the page starts near the top of the screen').toBeLessThan(200);
  await expect(page.locator('.tool-tabs')).toBeVisible();
  await page.touchscreen.tap(surface.x + surface.width * 0.2, surface.y + surface.height * 0.3);
  await expect(page.locator('#inline-editor')).toBeFocused();
  await page.keyboard.type('Signed on site');
  await page.keyboard.press('Escape');
  expect(await overlayLines(page)).toEqual(['Signed on site']);
  await page.locator('.tool-tabs [data-tool="watermark"]').click();
  await page.click('[data-action="toggle-setting"]');
  await expect(page.locator('#page-overlay')).toContainText('DRAFT');
});

test('controls in the editor are at least 44 px', async ({ page }) => {
  await openSample(page);
  for (const tool of ['text', 'signature', 'watermark', 'pages', 'protect']) {
    await page.locator(`.tool-tabs [data-tool="${tool}"]`).click();
    await ready(page);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('#workspace :is(button, input, select, textarea, [tabindex="0"])')]
        .filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
        .filter((element) => {
          // A checkbox counts by its label, which is the target.
          const target = element.type === 'checkbox' || element.type === 'radio' ? element.closest('label') || element : element;
          const box = target.getBoundingClientRect();
          return box.width < 44 || box.height < 44;
        })
        .filter((element) => !element.closest('.canvas-scroll'))
        .map((element) => element.outerHTML.slice(0, 90)),
    );
    expect(small, `${tool}: small targets`).toEqual([]);
  }
});

test('nothing scrolls sideways from 320 px to 414 px', async ({ page }) => {
  for (const width of [320, 360, 390, 414]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./');
    expect(await overflow(page), `home at ${width} px`).toEqual({ page: 0, wide: [] });
    await page.locator('[data-action="sample"]').first().click();
    await ready(page);
    for (const tool of TOOLS) {
      await page.locator(`.tool-tabs [data-tool="${tool}"]`).click();
      expect(await overflow(page), `${tool} at ${width} px`).toEqual({ page: 0, wide: [] });
    }
  }
});
