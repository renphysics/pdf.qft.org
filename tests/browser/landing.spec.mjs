// The landing page works before the editor loads: until a file is opened, or a
// visitor shows intent, only app.js and the modules it preloads are fetched.
import { test, expect, fixture, ready } from './helpers.mjs';

const EDITOR = /\/(?:editor|tool-panel|pdf-engine|documents|page-view|panel-[\w-]+)\.js/;
const scriptsRequested = (page) => {
  const paths = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/\.js$/.test(url.pathname)) paths.push(url.pathname);
  });
  return paths;
};

test('the search and the dialogs need none of the editor; opening a file loads it', async ({ page }) => {
  const scripts = scriptsRequested(page);
  await page.goto('./');
  await page.fill('#tool-search', 'merge');
  await expect(page.locator('.tool-card[data-card="merge"]')).toBeVisible();
  await expect(page.locator('.tool-card[data-card="crop"]')).toBeHidden();
  // dispatchEvent: a click without the pointer movement that would show intent.
  await page.locator('[data-action="privacy"]').first().dispatchEvent('click');
  await expect(page.locator('#info-dialog')).toBeVisible();
  await expect(page.locator('#dialog-title')).toHaveText('Private by design.');
  await page.keyboard.press('Escape');
  await expect(page.locator('#info-dialog')).toBeHidden();
  await page.locator('[data-action="tools-home"]').first().dispatchEvent('click');
  await expect(page.locator('#tools-title')).toBeFocused();
  expect(scripts.filter((path) => EDITOR.test(path))).toEqual([]);
  expect([...new Set(scripts)].sort()).toEqual(['/app.js', '/editor-core.js', '/routes.js', '/views.js']);
  await page.setInputFiles('#file-input', fixture('rotated-cropped.pdf'));
  await ready(page);
  expect(scripts.some((path) => /\/editor\.js$/.test(path))).toBe(true);
});

test('hovering the upload area loads the editor before a file is chosen', async ({ page }) => {
  const scripts = scriptsRequested(page);
  await page.goto('./');
  await page.hover('#drop-zone');
  await expect.poll(() => scripts.some((path) => /\/editor\.js$/.test(path))).toBe(true);
});
