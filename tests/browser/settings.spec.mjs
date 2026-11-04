// Watermark, headers and footers, page numbers: on as soon as they open, edge
// margins down to 0, and a number out of range set to the nearest one allowed.
import { test, expect, openSample, useTool } from './helpers.mjs';

const toggle = (page) => page.locator('[data-action="toggle-setting"]');
const overlay = (page) => page.locator('.page-view.current .page-overlay');

test('Page numbers and Watermark are on when they open; turned off or undone, they stay off', async ({ page }) => {
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

test('the edge margin goes down to 0; a number out of range is set to the nearest allowed', async ({ page }) => {
  await openSample(page, 'add-page-numbers-to-pdf/');
  const number = overlay(page).locator('text', { hasText: 'Page 1 of 3' });
  // How far the page number sits above the bottom of the page, in screen pixels.
  const gap = async () => {
    const sheet = await page.locator('.page-view.current').boundingBox();
    const box = await number.boundingBox();
    return sheet.y + sheet.height - (box.y + box.height);
  };
  const before = await gap();
  const margin = page.locator('#tool-form [name="margin"]');
  await margin.fill('5');
  await margin.press('Tab');
  await expect(margin).toHaveValue('5');
  await expect.poll(gap).toBeLessThan(before - 10);

  await margin.fill('500');
  await margin.press('Tab');
  await expect(margin).toHaveValue('100');
  await expect(page.locator('#toast-message')).toHaveText('“Edge margin (pt)” can be 0 to 100, so it’s set to 100.');
  await expect.poll(gap).toBeGreaterThan(before + 40);
});
