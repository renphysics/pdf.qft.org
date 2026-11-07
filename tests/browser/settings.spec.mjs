// Watermark, headers and footers, page numbers: on as soon as they open, edge
// margins down to 0, and a number out of range set to the nearest one allowed.
import { test, expect, openSample, useTool } from './helpers.mjs';

const toggle = (page) => page.locator('[data-action="toggle-setting"]');
const overlay = (page) => page.locator('.page-view.current .page-overlay');

test('Page numbers and Watermark are on when they open; turned off or undone, they stay off', async ({
  page,
}) => {
  await openSample(page);
  await useTool(page, 'numbers');
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
  await expect(overlay(page)).toContainText('Page 1 of 3');
  // One undo step takes them away, and opening the tool again leaves them off.
  await page.click('#undo-button');
  await expect(overlay(page)).not.toContainText('Page 1 of 3');
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
  await useTool(page, 'text');
  await useTool(page, 'numbers');
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');

  await useTool(page, 'watermark');
  await expect(overlay(page)).toContainText('DRAFT');
  await toggle(page).click();
  await expect(overlay(page)).not.toContainText('DRAFT');
  await useTool(page, 'text');
  await useTool(page, 'watermark');
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
});

test('Headers & footers are on before anything is typed, without counting as an edit', async ({ page }) => {
  await openSample(page, 'add-header-and-footer-to-pdf/');
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#undo-button')).toBeDisabled();
  await expect(page.locator('#tool-panel')).toContainText('“Page {page} of {total}” shows as “Page 2 of 5”.');
  await page.fill('#tool-form [name="headerRight"]', 'Test {page}');
  await expect(overlay(page)).toContainText('Test 1');
  await toggle(page).click();
  await expect(overlay(page)).not.toContainText('Test 1');
});

test('the edge margin goes down to 0; a number out of range is set to the nearest allowed', async ({
  page,
}) => {
  await openSample(page, 'add-page-numbers-to-pdf/');
  // How far the page number sits above the bottom of the page, in points. It is read from the
  // drawing (getBBox): WebKit gives Playwright the box of SVG text at the page's top left, wherever
  // the text is drawn. Found and measured in one step, as the overlay may be drawn again between
  // two steps; null until it is drawn.
  const gap = () =>
    page.evaluate(() => {
      const texts = document.querySelectorAll('.page-view.current .page-overlay text');
      const text = [...texts].find((node) => node.textContent.includes('Page 1 of 3'));
      if (!text) return null;
      const box = text.getBBox();
      return text.ownerSVGElement.viewBox.baseVal.height - (box.y + box.height);
    });
  await expect.poll(gap).not.toBeNull();
  const before = await gap();
  const margin = page.locator('#tool-form [name="margin"]');
  await margin.fill('5');
  await margin.press('Tab');
  await expect(margin).toHaveValue('5');
  await expect.poll(gap).toBeLessThan(before - 10);

  await margin.fill('500');
  await margin.press('Tab');
  await expect(margin).toHaveValue('100');
  await expect(page.locator('#toast-message')).toHaveText(
    '“Edge margin (pt)” can be 0 to 100, so it’s set to 100.',
  );
  await expect.poll(gap).toBeGreaterThan(before + 40);
});

test('page numbers swap sides on even pages, for printing on both sides, and Batch keeps it', async ({
  page,
}) => {
  await openSample(page, 'add-page-numbers-to-pdf/');
  // Whether a page's number is on the left half of the page (found and measured in one step, as above).
  const onLeft = (number) =>
    page.evaluate((number) => {
      const texts = document.querySelectorAll(`.page-view[data-number="${number}"] .page-overlay text`);
      const text = [...texts].find((node) => node.textContent.includes(`Page ${number} of 3`));
      return text ? text.getBBox().x < text.ownerSVGElement.viewBox.baseVal.width / 2 : null;
    }, number);
  await page.locator('.page-view[data-number="2"]').scrollIntoViewIfNeeded();
  await expect.poll(() => onLeft(2)).toBe(false);
  await page.locator('#tool-form [name="mirror"]').check();
  await expect.poll(() => onLeft(2)).toBe(true);
  await expect.poll(() => onLeft(1)).toBe(false);
  await page.locator('.page-view[data-number="3"]').scrollIntoViewIfNeeded();
  await expect.poll(() => onLeft(3)).toBe(false);
  await page.click('#undo-button');
  await expect(page.locator('#tool-form [name="mirror"]')).not.toBeChecked();
  await page.locator('#tool-form [name="mirror"]').check();
  await page.click('[data-action="batch-from-editor"]');
  await expect(page.locator('input[name="numbers-mirror"]')).toBeChecked();
  await expect(page.locator('input[name="footer-mirror"]')).not.toBeChecked();
  // Batch margins go down to 0 too, as in the editor.
  await expect(page.locator('input[name="numbers-margin"]')).toHaveAttribute('min', '0');
  await expect(page.locator('input[name="footer-margin"]')).toHaveAttribute('min', '0');
});

test('arrowing through the tool menu does not turn settings on; settling on one does, with a notice', async ({
  page,
}) => {
  await openSample(page);
  const menu = page.locator('#tool-select');
  await menu.focus();
  // Down past Watermark and Page numbers and back: nothing changed.
  const count = await menu.evaluate((select) => select.options.length);
  for (let step = 1; step < count; step++) await page.keyboard.press('ArrowDown');
  for (let step = 1; step < count; step++) await page.keyboard.press('ArrowUp');
  await expect(menu).toHaveValue('text');
  await page.keyboard.press('Tab');
  await expect(page.locator('#undo-button')).toBeDisabled();
  await expect(overlay(page)).not.toContainText('DRAFT');
  await expect(overlay(page)).not.toContainText('Page 1 of 3');
  // Arrow to Page numbers and move on into the panel: now they show, and the notice says so.
  await menu.focus();
  const numbers = await menu.evaluate((select) =>
    [...select.options].findIndex((option) => option.value === 'numbers'),
  );
  for (let step = 0; step < numbers; step++) await page.keyboard.press('ArrowDown');
  await expect(menu).toHaveValue('numbers');
  await expect(overlay(page)).not.toContainText('Page 1 of 3');
  await page.keyboard.press('Tab');
  await expect(overlay(page)).toContainText('Page 1 of 3');
  await expect(page.locator('#toast-message')).toHaveText(
    'Page numbers shown on every page. Undo takes them away.',
  );
  await expect(page.locator('#undo-button')).toBeEnabled();
  // The panel, drawn while the menu was being arrowed through, agrees with the page.
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
  await toggle(page).click();
  await expect(overlay(page)).not.toContainText('Page 1 of 3');
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
});

test('leaving the editor with Back while arrowed onto Watermark changes nothing', async ({ page }) => {
  await openSample(page);
  const menu = page.locator('#tool-select');
  await menu.focus();
  const watermark = await menu.evaluate((select) =>
    [...select.options].findIndex((option) => option.value === 'watermark'),
  );
  for (let step = 0; step < watermark; step++) await page.keyboard.press('ArrowDown');
  await expect(menu).toHaveValue('watermark');
  await page.goBack();
  await expect(page.locator('#workspace')).toBeHidden();
  await expect(page.locator('#toast-message')).not.toContainText('shown on every page');
  await page.goForward();
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(overlay(page)).not.toContainText('DRAFT');
  await expect(page.locator('#undo-button')).toBeDisabled();
});

test('opened on the Watermark page, the opened message says the watermark is shown', async ({ page }) => {
  await openSample(page, 'add-watermark-to-pdf/');
  await expect(overlay(page)).toContainText('DRAFT');
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#toast-message')).toHaveText(
    'Your PDF is ready. Everything happens on your device. Watermark “DRAFT” shown on every page. Undo takes it away.',
  );
});
