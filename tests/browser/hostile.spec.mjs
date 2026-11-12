// A PDF with HTML and JavaScript in every string the editor shows (made by
// scripts/make-hostile-fixture.mjs: title, author, creator, producer, field
// names, labels, options, a bookmark, an OpenAction, a javascript: link), plus
// a hostile file name and image name, and the same typed into the editor:
// nothing runs and nothing is injected, in every panel that shows those strings
// and on the page, where what is added is drawn as markup. Every test also fails
// on a content security policy violation (helpers.mjs).
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import {
  test,
  expect,
  download,
  fixture,
  openFiles,
  overlayLines,
  ready,
  root,
  useTool,
} from './helpers.mjs';

const { createCanvas } = createRequire(import.meta.url)(`${root}/node_modules/@napi-rs/canvas`);
const NAME = '<img src=x onerror="window.__xssName=1">.pdf';

test('a PDF with HTML and script in its strings runs nothing and injects nothing', async ({ page }) => {
  // Given to the page as bytes with a name: no file system has to take the name
  // (Windows refuses these characters).
  const file = {
    name: NAME,
    mimeType: 'application/pdf',
    buffer: await readFile(fixture('hostile-metadata.pdf')),
  };
  await openFiles(page, file, 'fill-pdf-form/');
  const leaked = () => page.evaluate(() => Object.keys(window).filter((key) => key.startsWith('__xss')));
  const injected = () => page.locator('img[src="x"], [data-xss]').count();
  const check = async (where) => {
    expect(await leaked(), `${where}: a payload ran`).toEqual([]);
    expect(await injected(), `${where}: a payload was injected`).toBe(0);
  };
  // Fill form: labels and options are text.
  await expect(page.locator('#tool-select')).toHaveValue('form');
  await expect(page.locator('.form-field').first()).toHaveAttribute(
    'aria-label',
    /<script data-xss="FieldLabel">/,
  );
  await expect(page.locator('select.form-dropdown option', { hasText: 'onerror' }).first()).toHaveText(
    '<img src=x onerror="window.__xssOption=1">',
  );
  await check('Fill form');
  // The document bar, Document properties and Merge PDFs show the names as typed.
  await expect(page.locator('#document-name')).toHaveText(NAME);
  await useTool(page, 'properties');
  await expect(page.locator('#tool-form [name="title"]')).toHaveValue(
    '<img src=x onerror="window.__xssTitle=1">',
  );
  await expect(page.locator('#properties-extra')).toContainText(
    'made with <img src=x onerror="window.__xssCreator=1">',
  );
  await check('Document properties');
  await useTool(page, 'merge');
  await expect(page.locator('.file-list-item')).toContainText(NAME);
  await check('Merge PDFs');
  await useTool(page, 'pages');
  await ready(page);
  await check('Organize pages');
  // An image with a hostile name.
  const logo = createCanvas(40, 40);
  logo.getContext('2d').fillStyle = '#123456';
  logo.getContext('2d').fillRect(0, 0, 40, 40);
  await useTool(page, 'image');
  await page.setInputFiles('#image-input', {
    name: '<img src=x onerror="window.__xssImage=1">.png',
    mimeType: 'image/png',
    buffer: logo.toBuffer('image/png'),
  });
  await expect(page.locator('.edit-layer [data-item-id]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.file-chosen')).toHaveText('<img src=x onerror="window.__xssImage=1">.png');
  await check('Add an image');
  // What is typed is drawn on the page as markup, and listed in the panel: text in both.
  const typed = '<img src=x onerror="window.__xssTyped=1">';
  // Everything written on the current page, line by line (a watermark is one line).
  const written = async () => {
    await overlayLines(page);
    return page.locator('.page-view.current .page-overlay text').allTextContents();
  };
  await useTool(page, 'text');
  await page.click('[data-action="add-text"]');
  await page.keyboard.insertText(typed);
  await page.keyboard.press('Escape');
  expect(await written()).toContain(typed);
  await expect(page.locator('.annotation-list')).toContainText('Text: “' + typed.slice(0, 40) + '…”');
  await expect(page.locator('.annotation-list [data-remove-annotation]').last()).toHaveAttribute(
    'aria-label',
    'Delete Text: “' + typed.slice(0, 40) + '…”',
  );
  await check('Add text');
  // A watermark and a header take the file's name through {filename}, and their own text.
  const named = NAME.replace(/\.pdf$/, '');
  await useTool(page, 'watermark');
  await page.fill('#tool-form [name="text"]', '{filename} <b data-xss="Watermark">!</b>');
  await useTool(page, 'footer');
  await page.fill('#tool-form [name="headerLeft"]', '{filename} <b data-xss="Header">!</b>');
  await expect
    .poll(written)
    .toEqual(
      expect.arrayContaining([
        named + ' <b data-xss="Watermark">!</b>',
        named + ' <b data-xss="Header">!</b>',
      ]),
    );
  await check('Watermark and header');
  // The download's name is made safe by the editor, not left to the browser: read
  // from the link it clicks.
  await page.evaluate(() => {
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) window.qaDownloadName = this.download;
      return click.call(this);
    };
  });
  const { name } = await download(page, () => page.click('#download-button'));
  const given = await page.evaluate(() => window.qaDownloadName);
  expect(given).toBe('_img src=x onerror=_window.__xssName=1__-edited.pdf');
  expect(name).toBe(given);
  // The batch workspace lists the file by name, as text.
  await useTool(page, 'watermark');
  await page.click('[data-action="batch-from-editor"]');
  await page.setInputFiles('#batch-file-input', file);
  await expect(page.locator('.batch-file-row').first()).toContainText(NAME);
  await check('Batch');
});

test('a file name that reads like character references is shown as it is, in the parts of a split too', async ({
  page,
}) => {
  // The parts of a split are named after the file. The name is made safe for a
  // file system first, which takes out "<" and ">" but leaves "&": text that
  // markup would read as a character reference still has to come out as typed.
  const name = 'a&lt;b&gt;&amp;c.pdf';
  await openFiles(
    page,
    { name, mimeType: 'application/pdf', buffer: await readFile(fixture('rotated-cropped.pdf')) },
    'split-pdf/',
  );
  await expect(page.locator('#document-name')).toHaveText(name);
  await page.selectOption('#tool-form [name="mode"]', 'chunks');
  await page.fill('#tool-form [name="size"]', '2');
  await page.click('#tool-form [type="submit"]');
  const part = page.locator('.split-result').first();
  await expect(part.locator('strong')).toHaveText(/^a&lt;b&gt;&amp;c\b.*\.pdf$/);
  await expect(part.locator('[data-action="download-split"]')).toHaveAttribute(
    'aria-label',
    /^Download a&lt;b&gt;&amp;c\b.*\.pdf$/,
  );
  expect(await page.locator('.split-result b, .split-result img').count()).toBe(0);
});
