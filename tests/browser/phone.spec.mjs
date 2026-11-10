// Phones (iPhone 13 size, touch): the document comes first, tools sit in a
// bottom bar, controls are large enough to tap, and nothing scrolls sideways.
import { test, expect, fixture, openFiles, openSample, ready, overlayLines } from './helpers.mjs';

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

/** Whether something else (a notice) is on top of the middle of an element. */
async function covers(page, locator) {
  return locator.evaluate((node) => {
    const box = node.getBoundingClientRect(),
      top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return !node.contains(top);
  });
}

/** Elements wider than the screen, outside the areas that scroll on purpose. */
function overflow(page) {
  return page.evaluate(() => ({
    page: document.documentElement.scrollWidth - innerWidth,
    wide: [...document.querySelectorAll('body *')]
      .filter((element) => {
        if (
          !element.getClientRects().length ||
          element.closest('.canvas-scroll, .tool-tabs, .page-list, [hidden]')
        )
          return false;
        return element.getBoundingClientRect().right > innerWidth + 1;
      })
      .slice(0, 5)
      .map(
        (element) =>
          element.tagName.toLowerCase() +
          (element.id ? '#' + element.id : '') +
          '.' +
          String(element.className).split(' ')[0],
      ),
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
  await expect(page.locator('[data-action="toggle-setting"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.page-view.current .page-overlay')).toContainText('DRAFT');
});

/** Swipe with one finger, as a touch screen sends it (Playwright has taps only). */
async function swipe(page, x, fromY, toY) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: fromY }] });
  for (let step = 1; step <= 12; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: fromY + ((toY - fromY) * step) / 12 }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('in Draw, one finger draws instead of scrolling', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Touches are sent through the Chromium DevTools protocol');
  await openSample(page, 'draw-on-pdf/');
  await page.click('[data-action="dismiss-toast"]');
  const sheet = await page.locator('.page-view.current').boundingBox();
  await swipe(page, sheet.x + sheet.width / 2, sheet.y + sheet.height * 0.3, sheet.y + sheet.height * 0.6);
  await expect(page.locator('.page-view[data-number="1"] path.ov-drawing')).toHaveCount(1);
  await expect(page.locator('#page-jump')).toHaveValue('1');
});

test('swiping moves through the pages, one at a time, and typing goes on meanwhile', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Swipes are sent through the Chromium DevTools protocol');
  await openSample(page, 'add-text-to-pdf/');
  await page.click('[data-action="dismiss-toast"]');
  const stage = await page.locator('#canvas-scroll').boundingBox();
  // Each page fits the stage; a swipe brings the next one to its middle.
  const centred = (number) =>
    page.evaluate((number) => {
      const area = document.querySelector('#canvas-scroll').getBoundingClientRect();
      const view = document.querySelector(`.page-view[data-number="${number}"]`).getBoundingClientRect();
      return (
        Math.abs(view.top + view.height / 2 - (area.top + area.height / 2)) < 3 && view.height < area.height
      );
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
  await expect(page.locator('.page-view[data-number="2"] .page-overlay tspan')).toHaveText([
    'Second page, signed',
  ]);
});

test('controls in the editor are at least 44 px', async ({ page }) => {
  await openSample(page);
  for (const tool of ['text', 'signature', 'watermark', 'pages', 'jpgtopdf', 'pdftojpg', 'protect']) {
    await page.locator(`.tool-tabs [data-tool="${tool}"]`).click();
    await ready(page);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('#workspace :is(button, input, select, textarea, [tabindex="0"])')]
        .filter(
          (element) => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden',
        )
        .filter((element) => {
          // A checkbox counts by its label, which is the target.
          const target =
            element.type === 'checkbox' || element.type === 'radio'
              ? element.closest('label') || element
              : element;
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

test('Fill form zooms the page to the field you tap, and Fit shows it whole again', async ({ page }) => {
  await openFiles(page, fixture('form-fields.pdf'));
  // Escape puts the opened notice away, if it is still showing.
  await page.keyboard.press('Escape');
  const name = page.locator('.form-field[data-field="applicant.name"]').first();
  expect((await name.boundingBox()).height).toBeLessThan(20);
  await name.tap();
  await expect(name).toBeFocused();
  // (The zoom aims at 44 px and takes half a px less: pages are laid out on whole px.)
  await expect.poll(async () => (await name.boundingBox()).height).toBeGreaterThanOrEqual(43.5);
  const stage = await page.locator('#canvas-scroll').boundingBox();
  const within = async (locator) => {
    const box = await locator.boundingBox();
    return box.y >= stage.y && box.y + box.height <= stage.y + stage.height;
  };
  expect(await within(name)).toBe(true);
  await expect(page.locator('#zoom-label')).not.toHaveText('Fit');
  await expect(page.locator('.tool-sidebar')).toHaveClass(/collapsed/);
  // Tab: the next field is in view, as large.
  await page.keyboard.press('Tab');
  const next = page.locator('.form-field:focus');
  await expect(next).toHaveCount(1);
  await expect.poll(() => within(next)).toBe(true);
  expect((await next.boundingBox()).height).toBeGreaterThanOrEqual(23.5);
  // Fit shows the whole page again. The field keeps focus, as it does on an iPhone,
  // where a tapped button takes none (dispatchEvent: a click that moves no focus),
  // and it is not zoomed to a second time when the stage is laid out again: the
  // zoom was set by hand.
  await page.locator('[data-action="zoom-fit"]').dispatchEvent('click');
  await expect(page.locator('#zoom-label')).toHaveText('Fit');
  await expect(next).toBeFocused();
  await page.setViewportSize({ width: 390, height: 600 });
  // The stage is laid out again a little after its size changes.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 600)));
  await expect(page.locator('#zoom-label')).toHaveText('Fit');
});

test('at Fit a tap on a form field reaches that field; a tapped check box is ticked, then zoomed to', async ({
  page,
}) => {
  await openFiles(page, fixture('form-fields.pdf'));
  // Escape puts the opened notice away, if it is still showing.
  await page.keyboard.press('Escape');
  await expect(page.locator('#toast')).toBeHidden();
  await expect(page.locator('#zoom-label')).toHaveText('Fit');
  // No field's tap area lies over another field: in the middle and towards the
  // corners of each field, that field is what a tap reaches.
  const covered = await page.evaluate(() =>
    [...document.querySelectorAll('.page-view.current .form-field')].flatMap((field) => {
      const box = field.getBoundingClientRect();
      return [
        [0.5, 0.5],
        [0.2, 0.2],
        [0.8, 0.2],
        [0.2, 0.8],
        [0.8, 0.8],
      ]
        .map(([x, y]) => document.elementFromPoint(box.left + box.width * x, box.top + box.height * y))
        .filter((top) => !field.contains(top))
        .map((top) => `${field.dataset.field} is under ${top?.dataset?.field || top?.tagName}`);
    }),
  );
  expect(covered).toEqual([]);

  // The first tap, on a box a few px wide: it is ticked, not a neighbour, and the page zooms to it.
  const member = page.locator('.form-field[data-field="member"]');
  await expect(member).not.toBeChecked();
  expect((await member.boundingBox()).height).toBeLessThan(12);
  await member.tap();
  await expect(member).toBeChecked();
  await expect(page.locator('.form-field[type="radio"]:checked')).toHaveCount(0);
  await expect.poll(async () => (await member.boundingBox()).height).toBeGreaterThanOrEqual(23.5);
  expect((await member.boundingBox()).height).toBeLessThan(40);
  await expect(page.locator('.tool-sidebar')).toHaveClass(/collapsed/);
  // Zoomed, the box has a finger-sized tap area: a tap beside it unticks it.
  const zoomed = await member.boundingBox();
  const room = await member.evaluate((input) => parseFloat(input.style.getPropertyValue('--tap')));
  expect(zoomed.height + 2 * room).toBeGreaterThanOrEqual(43);
  await page.touchscreen.tap(zoomed.x + zoomed.width + room - 3, zoomed.y + zoomed.height / 2);
  await expect(member).not.toBeChecked();
  // Still no field under another's tap area.
  expect(
    await page.evaluate(
      () =>
        [...document.querySelectorAll('.page-view.current .form-field')].filter((field) => {
          const box = field.getBoundingClientRect(),
            stage = document.querySelector('#canvas-scroll').getBoundingClientRect(),
            x = box.left + box.width / 2,
            y = box.top + box.height / 2;
          // Only fields in view: the others are behind the bars around the stage.
          if (x < stage.left || x > stage.right || y < stage.top || y > stage.bottom) return false;
          return !field.contains(document.elementFromPoint(x, y));
        }).length,
    ),
  ).toBe(0);
  // Leaving Fill form puts the zoom back as it was before the field.
  await page.locator('.tool-tabs [data-tool="text"]').click();
  await expect(page.locator('#zoom-label')).toHaveText('Fit');
});

test('the first tap ticks a check box on the last page, with the tool sheet open', async ({ page }) => {
  await openFiles(page, fixture('form-fields.pdf'));
  await page.keyboard.press('Escape');
  await page.locator('[data-action="next"]').tap();
  await expect(page.locator('#page-jump')).toHaveValue('2');
  await ready(page);
  // The sheet is open and the page is at the end of the scroll: folding the sheet
  // before the tap was delivered moved the box away from under the finger.
  await expect(page.locator('.tool-sidebar')).not.toHaveClass(/collapsed/);
  const agree = page.locator('.page-view.current .form-field[data-field="agree"]');
  await expect(agree).not.toBeChecked();
  await agree.tap();
  await expect(agree).toBeChecked();
  await expect(page.locator('.tool-sidebar')).toHaveClass(/collapsed/);
  await expect.poll(async () => (await agree.boundingBox()).height).toBeGreaterThanOrEqual(23.5);
});

test('a text field on a turned page is zoomed to as well: across its line, which lies sideways', async ({
  page,
}) => {
  await openFiles(page, fixture('form-fields.pdf'));
  await page.keyboard.press('Escape');
  await page.locator('[data-action="next"]').tap();
  await expect(page.locator('#page-jump')).toHaveValue('2');
  await ready(page);
  // The fixture's second page is turned a quarter: its fields are taller than wide on the screen.
  const name = page.locator('.page-view.current .form-field[data-field="applicant.name"]');
  const before = await name.boundingBox();
  expect(before.height).toBeGreaterThan(before.width);
  expect(before.width).toBeLessThan(20);
  await name.tap();
  await expect(name).toBeFocused();
  await expect.poll(async () => (await name.boundingBox()).width).toBeGreaterThanOrEqual(43.5);
  await expect(page.locator('#zoom-label')).not.toHaveText('Fit');
});

test('a field focused with the phone on its side is zoomed to when the phone is turned upright, also after the zoom buttons were used', async ({
  page,
}) => {
  // On its side the window is wider than the phone layout: nothing zooms there.
  await page.setViewportSize({ width: 750, height: 342 });
  await openFiles(page, fixture('form-fields.pdf'));
  await page.keyboard.press('Escape');
  // (dispatchEvent: in a window this low the page strip lies over the zoom buttons.)
  await page.locator('[data-action="zoom-in"]').dispatchEvent('click');
  await expect(page.locator('#zoom-label')).not.toHaveText('Fit');
  await page.locator('[data-action="zoom-fit"]').dispatchEvent('click');
  await expect(page.locator('#zoom-label')).toHaveText('Fit');
  const name = page.locator('.form-field[data-field="applicant.name"]').first();
  await name.tap();
  await expect(name).toBeFocused();
  await expect(page.locator('#zoom-label')).toHaveText('Fit');
  // Upright: the phone layout, with the field still in focus. The zoom set by hand
  // was before this field got focus, so it does not hold the field small.
  await page.setViewportSize({ width: 390, height: 664 });
  await expect(name).toBeFocused();
  await expect.poll(async () => (await name.boundingBox()).height).toBeGreaterThanOrEqual(43.5);
});

test('a notice is put away when a field is tapped: it lay over the zoom buttons', async ({ page }) => {
  await openFiles(page, fixture('form-fields.pdf'));
  // A notice shown now, by the editor's own function: the one from opening may
  // have gone by itself on a slow machine.
  await page.evaluate(async () => (await import('/editor-core.js')).toast('A notice that is still showing.'));
  await expect(page.locator('#toast')).toBeVisible();
  const name = page.locator('.form-field[data-field="applicant.name"]').first();
  // The notice may lie over the first fields: tap one below it.
  const email = page.locator('.form-field[data-field="applicant.email"]').first();
  await ((await covers(page, name)) ? email : name).tap();
  // At once: left alone, it would stay for five seconds and more.
  await expect(page.locator('#toast')).toBeHidden({ timeout: 2000 });
  await expect(page.locator('#zoom-label')).not.toHaveText('Fit');
});

test('the notice’s close button has a finger-sized tap area', async ({ page }) => {
  await openSample(page);
  const close = page.locator('.toast-close');
  await expect(close).toBeVisible();
  const area = await close.evaluate((button) => {
    const before = getComputedStyle(button, '::before');
    return [parseFloat(before.width), parseFloat(before.height)];
  });
  expect(area[0]).toBeGreaterThanOrEqual(44);
  expect(area[1]).toBeGreaterThanOrEqual(44);
});
