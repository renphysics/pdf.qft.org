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
 * new release's addresses, as a stamped copy of the site does. `hold`: a promise
 * the editor waits for before it is served.
 */
async function deployNewRelease(page, { deployed = () => true, hold = null } = {}) {
  await page.route(/\.js(\?v=next)?$/, async (route) => {
    const url = new URL(route.request().url()),
      editor = /\/editor\.js$/.test(url.pathname);
    if (editor) await hold;
    if (url.searchParams.get('v') !== 'next' && !(editor && deployed())) return route.continue();
    const response = await route.fetch();
    const body = (await response.text()).replace(/(from |import\()'(\.\/[\w-]+\.js)'/g, "$1'$2?v=next'");
    await route.fulfill({ response, body });
  });
}
/** How many times the page has been loaded again, and how many file pickers it has opened, since this was called. */
function watch(page) {
  const seen = { reloads: 0, pickers: 0 };
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) seen.reloads++;
  });
  page.on('filechooser', () => seen.pickers++);
  return seen;
}
/**
 * The editor's modules have run: they put the batch workspace's file input in the
 * page as they start. (The page's "network idle" is no sign of it: that is said
 * once, when the page has loaded.)
 */
const editorRan = (page) => expect(page.locator('#batch-file-input')).toBeAttached();
const UPDATED = 'QFT PDF has been updated, so this page was reloaded. Please try again.';
const choosePdf = '#drop-zone [data-action="open"]';

test('a page from before a deploy: the chosen file brings a reload into the new release and a notice, not silence', async ({
  page,
}) => {
  // The editor arrives while the file picker is open, as it does after a click on
  // Choose PDF: the page must not reload under the picker. The first editor asked
  // for is the new release's; the page that reloads is that release's own.
  let asked = 0,
    arrive;
  const held = new Promise((resolve) => (arrive = resolve));
  await deployNewRelease(page, { deployed: () => asked++ === 0, hold: held });
  await page.goto('./');
  const seen = watch(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(choosePdf)]);
  arrive();
  // The new release's editor has run, and the page is as it was: the picker is
  // still the page's, and the file chosen in it arrives.
  await editorRan(page);
  expect(seen.reloads).toBe(0);
  await chooser.setFiles(fixture('rotated-cropped.pdf'));
  await expectToast(page, UPDATED);
  expect(seen.reloads).toBe(1);
  await expect(page.locator('#workspace')).toBeHidden();
  // One release now: the file opens, and adding a PDF adds to it.
  await page.setInputFiles('#file-input', fixture('rotated-cropped.pdf'));
  await ready(page);
  await expect(page.locator('#document-info')).toHaveText(/^4 pages/);
  await page.locator('[data-action="add-files"]').first().click();
  await page.setInputFiles('#file-input', fixture('rotated-cropped.pdf'));
  await expect(page.locator('#document-info')).toHaveText(/^8 pages/);
  expect(seen.reloads).toBe(1);
});

test('a warm-up that meets a new release leaves the page alone; the next click reloads before a file is chosen in vain', async ({
  page,
}) => {
  await deployNewRelease(page);
  await page.goto('./');
  const seen = watch(page);
  await page.fill('#tool-search', 'merge');
  // The pointer on the upload area loads the editor: another release's.
  await page.hover('#drop-zone');
  await editorRan(page);
  expect(seen.reloads).toBe(0);
  await expect(page.locator('#tool-search')).toHaveValue('merge');
  await expect(page.locator('.tool-card[data-card="crop"]')).toBeHidden();
  await expect(page.locator('#toast')).toBeHidden();
  // Choose PDF: known by now, so the page reloads at once instead of opening a picker.
  await page.click(choosePdf);
  await expectToast(page, UPDATED);
  expect(seen).toEqual({ reloads: 1, pickers: 0 });
  // Still two releases (a cache that keeps serving the old page): no second reload.
  await page.locator('[data-action="sample"]').first().click();
  await expectToast(page, 'QFT PDF was updated while this page was open. Please reload the page.');
  await expect(page.locator('#toast')).toHaveClass(/error/);
  expect(seen.reloads).toBe(1);
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
