// The landing page works before the editor loads: until a file is opened, or a
// visitor shows intent, only app.js and the modules it preloads are fetched.
import { test, expect, expectToast, fixture, ready } from './helpers.mjs';

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

/**
 * After a deploy, the editor a waiting page asks for is the new release's. Its
 * modules have other addresses (each carries its release), so they are second
 * copies with a state of their own. Here the editor, while `deployed()` holds,
 * and every module asked for under the new release, import each other under the
 * new release's addresses, as a stamped copy of the site does.
 */
async function deployNewRelease(page, deployed = () => true) {
  await page.route(/\.js(\?v=next)?$/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('v') !== 'next' && !(/\/editor\.js$/.test(url.pathname) && deployed()))
      return route.continue();
    const response = await route.fetch();
    const body = (await response.text()).replace(/(from |import\()'(\.\/[\w-]+\.js)'/g, "$1'$2?v=next'");
    await route.fulfill({ response, body });
  });
}
/** How many times the page has been loaded again since this was called. */
function countReloads(page) {
  const counter = { reloads: 0 };
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) counter.reloads++;
  });
  return counter;
}
// dispatchEvent: a click without the pointer movement that would load the editor first.
const openSampleByClick = (page) => page.locator('[data-action="sample"]').first().dispatchEvent('click');

test('a page from before a deploy reloads into the new release, once, and says a file must be chosen again', async ({
  page,
}) => {
  let asked = 0;
  // The first time the editor is asked for, it is the new release's. The page that
  // reloads is the new release's own: its editor is then served as it is.
  await deployNewRelease(page, () => asked++ === 0);
  await page.goto('./');
  const counter = countReloads(page);
  await openSampleByClick(page);
  await expectToast(
    page,
    'QFT PDF has been updated, so this page was reloaded. Please choose your file again.',
  );
  expect(counter.reloads).toBe(1);
  await expect(page.locator('#workspace')).toBeHidden();
  // One release now: the editor works on the page's own state, and adding a PDF adds.
  await page.locator('[data-action="sample"]').first().click();
  await ready(page);
  await expect(page.locator('#document-info')).toHaveText(/^3 pages/);
  await page.locator('[data-action="add-files"]').first().click();
  await page.setInputFiles('#file-input', fixture('rotated-cropped.pdf'));
  await expect(page.locator('#document-info')).toHaveText(/^7 pages/);
  expect(counter.reloads).toBe(1);
});

test('a warm-up that meets a new release reloads without a notice; a reload that does not help says so', async ({
  page,
}) => {
  await deployNewRelease(page);
  await page.goto('./');
  const counter = countReloads(page),
    loadedAgain = page.waitForEvent('load');
  await page.hover('#drop-zone');
  await loadedAgain;
  expect(counter.reloads).toBe(1);
  await expect(page.locator('#toast')).toBeHidden();
  // Still two releases (a cache that keeps serving the old page): no second reload.
  await openSampleByClick(page);
  await expectToast(page, 'QFT PDF was updated while this page was open. Please reload the page.');
  await expect(page.locator('#toast')).toHaveClass(/error/);
  expect(counter.reloads).toBe(1);
  await expect(page.locator('#workspace')).toBeHidden();
});

test('when the editor cannot be fetched, the notice says what to do, and the same file can be chosen again', async ({
  page,
}) => {
  let refused = 0;
  await page.route('**/editor.js', (route) => {
    refused++;
    return route.abort('internetdisconnected');
  });
  await page.goto('./');
  // A warm-up that fails says nothing.
  await page.hover('#drop-zone');
  await expect.poll(() => refused).toBeGreaterThan(0);
  await expect(page.locator('#toast')).toBeHidden();
  await page.setInputFiles('#file-input', fixture('rotated-cropped.pdf'));
  await expectToast(page, 'The editor could not be loaded. Check your connection, then reload the page.');
  await expect(page.locator('#toast')).toHaveClass(/error/);
  // The picker is empty again: choosing the same file after a reload, or now, is a change.
  expect(await page.locator('#file-input').evaluate((input) => input.files.length)).toBe(0);
  await expect(page.locator('#workspace')).toBeHidden();
});

test('on the batch page, Choose PDFs opens the picker at once, and the files reach the batch when the editor arrives', async ({
  page,
}) => {
  // The editor is held back: a picker can only be opened during the click itself.
  let arrive;
  const held = new Promise((resolve) => (arrive = resolve));
  await page.route('**/editor.js', async (route) => {
    await held;
    await route.continue();
  });
  // Firefox and WebKit hold the page's load event until the editor has arrived.
  await page.goto('batch-edit-pdf/', { waitUntil: 'domcontentloaded' });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5000 }),
    page.locator('[data-action="batch-choose"]').first().click(),
  ]);
  expect(chooser.isMultiple()).toBe(true);
  await chooser.setFiles([fixture('rotated-cropped.pdf'), fixture('form-fields.pdf')]);
  await expect(page.locator('#batch-workspace')).toBeHidden();
  arrive();
  await expect(page.locator('#batch-workspace')).toBeVisible();
  await expect(page.locator('#batch-file-list')).toContainText('rotated-cropped.pdf');
  await expect(page.locator('#batch-file-list')).toContainText('form-fields.pdf');
});
