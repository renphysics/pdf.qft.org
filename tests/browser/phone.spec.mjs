// Phones (iPhone 13 size, touch): the document comes first, tools sit in a
// bottom bar, controls are large enough to tap, and nothing scrolls sideways.
import { test, expect, openSample, ready, overlayLines } from './helpers.mjs';

const TOOLS = ['text', 'image', 'highlight', 'signature', 'watermark', 'footer', 'numbers', 'pages', 'delete', 'crop', 'merge', 'split', 'jpgtopdf', 'pdftojpg', 'protect', 'unlock', 'form'];

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
  const surface = await page.locator('.page-view.current').boundingBox();
  expect(surface.y, 'the page starts near the top of the screen').toBeLessThan(200);
  await expect(page.locator('.tool-tabs')).toBeVisible();
  await page.touchscreen.tap(surface.x + surface.width * 0.2, surface.y + surface.height * 0.3);
  await expect(page.locator('#inline-editor')).toBeFocused();
  await page.keyboard.type('Signed on site');
  await page.keyboard.press('Escape');
  expect(await overlayLines(page)).toEqual(['Signed on site']);
  await page.locator('.tool-tabs [data-tool="watermark"]').click();
  await page.click('[data-action="toggle-setting"]');
  await expect(page.locator('.page-view.current .page-overlay')).toContainText('DRAFT');
});

/** Swipe with one finger, as a touch screen sends it (Playwright has taps only). */
async function swipe(page, x, fromY, toY) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: fromY }] });
  for (let step = 1; step <= 12; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: fromY + ((toY - fromY) * step) / 12 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('swiping moves through the pages, one at a time, and typing goes on meanwhile', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Swipes are sent through the Chromium DevTools protocol');
  await openSample(page, 'add-text-to-pdf/');
  await page.click('[data-action="dismiss-toast"]');
  const stage = await page.locator('#canvas-scroll').boundingBox();
  // Each page fits the stage; a swipe brings the next one to its middle.
  const centred = (number) =>
    page.evaluate((number) => {
      const area = document.querySelector('#canvas-scroll').getBoundingClientRect();
      const view = document.querySelector(`.page-view[data-number="${number}"]`).getBoundingClientRect();
      return Math.abs(view.top + view.height / 2 - (area.top + area.height / 2)) < 3 && view.height < area.height;
    }, number);
  expect((await page.locator('.page-view.current').boundingBox()).height).toBeLessThan(stage.height);
  await swipe(page, stage.x + stage.width / 2, stage.y + stage.height * 0.8, stage.y + stage.height * 0.25);
  await expect(page.locator('#page-jump')).toHaveValue('2');
  await expect.poll(() => centred(2)).toBe(true);

  // Tap page 2 and type; a swipe back to page 1 does not end the typing.
  const second = await page.locator('.page-view[data-number="2"]').boundingBox();
  await page.touchscreen.tap(second.x + second.width * 0.2, second.y + second.height * 0.3);
  await expect(page.locator('#inline-editor')).toBeFocused();
  await page.keyboard.type('Second page');
  const now = await page.locator('#canvas-scroll').boundingBox();
  await swipe(page, now.x + 8, now.y + now.height * 0.2, now.y + now.height * 0.8);
  await expect(page.locator('#page-jump')).toHaveValue('1');
  await expect(page.locator('#inline-editor')).toBeFocused();
  await page.keyboard.type(', signed');
  await page.keyboard.press('Escape');
  await expect(page.locator('.page-view[data-number="2"] .page-overlay tspan')).toHaveText(['Second page, signed']);
});

test('controls in the editor are at least 44 px', async ({ page }) => {
  await openSample(page);
  for (const tool of ['text', 'signature', 'watermark', 'pages', 'jpgtopdf', 'pdftojpg', 'protect']) {
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
