// Watermark, headers and footers, page numbers: on as soon as they open, edge
// margins down to 0, a number out of range set to the nearest one allowed,
// {date} and {filename}, and settings remembered on this device.
import { test, expect, download, expectToast, openSample, pdfText, useTool } from './helpers.mjs';

const toggle = (page) => page.locator('[data-action="toggle-setting"]');
const overlay = (page) => page.locator('.page-view.current .page-overlay');
const remember = (page) => page.locator('#tool-form [name="rememberSetting"]');
/** What the editor keeps in this browser for "Remember these settings on this device". */
const STORAGE = 'qft-pdf.settings.v1';
const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), STORAGE);

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

test('a page range outside the document is announced', async ({ page }) => {
  await openSample(page, 'add-page-numbers-to-pdf/');
  await page.selectOption('#tool-form [name="scope"]', 'pages');
  const hint = page.locator('#scope-hint');
  await expect(hint).toHaveAttribute('aria-live', 'polite');
  await page.fill('#tool-form [name="scopePages"]', '99');
  await page.keyboard.press('Tab');
  await expect(hint).toContainText('between 1 and 3');
  await expect(hint).toHaveClass(/invalid/);
});

test('{date} and {filename} in a footer and a page number, in the preview and in the download', async ({
  page,
}) => {
  await openSample(page, 'add-header-and-footer-to-pdf/');
  await expect(page.locator('#tool-panel')).toContainText(
    '{date} is today’s date and {filename} the file’s name.',
  );
  // The browser's time zone is UTC (playwright.config.mjs); the test may run across midnight.
  const today = () => new Date().toISOString().slice(0, 10);
  const before = today();
  await page.fill('#tool-form [name="footerLeft"]', '{filename}, {date}');
  await useTool(page, 'numbers');
  await page.fill('#tool-form [name="format"]', '{filename} {page}/{total}');
  await expect(overlay(page)).toContainText('A little room to create 1/3');
  const shown = (await overlay(page).textContent()).match(/A little room to create, (\d{4}-\d{2}-\d{2})/);
  expect(shown, 'the footer in the preview').not.toBeNull();
  expect([before, today()]).toContain(shown[1]);
  const { bytes } = await download(page, () => page.click('#download-button'));
  const text = await pdfText(bytes);
  expect(text).toHaveLength(3);
  for (let index = 0; index < 3; index++) {
    expect(text[index]).toContain(`A little room to create ${index + 1}/3`);
    expect([before, today()].some((date) => text[index].includes('A little room to create, ' + date))).toBe(
      true,
    );
  }
});

test.describe('where the date is already tomorrow', () => {
  test.use({ timezoneId: 'Pacific/Auckland' });
  test('{date} is the date where the reader is', async ({ page }) => {
    // Half past noon in UTC on 4 March is half past one at night on 5 March in Auckland.
    await page.clock.setFixedTime(new Date('2026-03-04T12:30:00Z'));
    await openSample(page, 'add-watermark-to-pdf/');
    await page.fill('#tool-form [name="text"]', 'Copy of {date}');
    await expect(overlay(page)).toContainText('Copy of 2026-03-05');
  });
});

test('ticked, the settings of Page numbers start the tool next time, follow edits and Undo, and are forgotten when unticked', async ({
  page,
}) => {
  await openSample(page, 'add-page-numbers-to-pdf/');
  await expect(remember(page)).not.toBeChecked();
  await page.fill('#tool-form [name="format"]', 'p. {page}');
  await page.selectOption('#tool-form [name="position"]', 'bottom-center');
  await page.selectOption('#tool-form [name="scope"]', 'pages');
  // Nothing is kept unless it is asked for.
  expect(await stored(page)).toBeNull();
  await remember(page).check();
  // The text and options: not whether they are shown, nor on which pages.
  expect(await stored(page)).toEqual({
    pageNumbers: {
      format: 'p. {page}',
      start: 1,
      size: 10,
      color: '#53635d',
      margin: 28,
      position: 'bottom-center',
      mirror: false,
    },
  });
  // What is remembered follows what is used: an edit, and its Undo.
  await page.fill('#tool-form [name="format"]', 'x {page}');
  await expect.poll(() => stored(page)).toMatchObject({ pageNumbers: { format: 'x {page}' } });
  await page.click('#undo-button');
  await expect(overlay(page)).toContainText('p. 1');
  await expect.poll(() => stored(page)).toMatchObject({ pageNumbers: { format: 'p. {page}' } });

  // The next PDF starts from them, on every page, and the notice says whose they are.
  await openSample(page, 'add-page-numbers-to-pdf/');
  await expect(overlay(page)).toContainText('p. 1');
  await expectToast(
    page,
    'Your PDF is ready. Everything happens on your device. Your saved page numbers are shown on every page. Undo takes them away.',
  );
  await expect(remember(page)).toBeChecked();
  await expect(page.locator('#tool-form [name="position"]')).toHaveValue('bottom-center');
  await expect(page.locator('#tool-form [name="scope"]')).toHaveValue('all');
  // Undo takes them off this PDF; they stay remembered.
  await page.click('#undo-button');
  await expect(overlay(page)).not.toContainText('p. 1');
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
  expect(await stored(page)).toMatchObject({ pageNumbers: { format: 'p. {page}' } });

  // Unticked, they are forgotten, and the tool starts as it does for everyone.
  await remember(page).uncheck();
  expect(await stored(page)).toBeNull();
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE)).toBeNull();
  await openSample(page, 'add-page-numbers-to-pdf/');
  await expect(overlay(page)).toContainText('Page 1 of 3');
  await expect(remember(page)).not.toBeChecked();
  await expectToast(
    page,
    'Your PDF is ready. Everything happens on your device. Page numbers shown on every page. Undo takes them away.',
  );
});

test('remembered headers and footers go on the next PDF when the tool opens, as one step to undo', async ({
  page,
}) => {
  await openSample(page, 'add-header-and-footer-to-pdf/');
  // Remembered with nothing typed, there is nothing to put on the next PDF.
  await remember(page).check();
  await openSample(page, 'add-header-and-footer-to-pdf/');
  await expect(remember(page)).toBeChecked();
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#undo-button')).toBeDisabled();
  await page.fill('#tool-form [name="footerLeft"]', 'Draft of {filename}');
  await page.locator('#tool-form [name="mirror"]').check();
  await expect
    .poll(() => stored(page))
    .toMatchObject({ headerFooter: { footerLeft: 'Draft of {filename}', mirror: true } });

  // Opened on another tool, the PDF is left as it is until Headers & footers is used.
  await openSample(page);
  await expect(overlay(page)).not.toContainText('Draft of');
  await expect(page.locator('#undo-button')).toBeDisabled();
  await useTool(page, 'footer');
  await expect(overlay(page)).toContainText('Draft of A little room to create');
  await expectToast(page, 'Your saved headers and footers are shown on every page. Undo takes them away.');
  await expect(page.locator('#tool-form [name="footerLeft"]')).toHaveValue('Draft of {filename}');
  await expect(page.locator('#tool-form [name="mirror"]')).toBeChecked();
  // One step takes them away; the switch then says they are off, and puts them back.
  await page.click('#undo-button');
  await expect(overlay(page)).not.toContainText('Draft of');
  await expect(page.locator('#undo-button')).toBeDisabled();
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
  await toggle(page).click();
  await expect(overlay(page)).toContainText('Draft of A little room to create');
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
});

test('what the browser kept is used only where it is of the kind the tool expects', async ({ page }) => {
  await page.goto('add-page-numbers-to-pdf/');
  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        pageNumbers: {
          format: 7,
          size: 'big',
          start: 5,
          position: 'bottom-left',
          enabled: false,
          pages: ['nowhere'],
          more: 'x',
        },
        watermark: 'DRAFT',
        headerFooter: ['Left'],
      }),
    );
  }, STORAGE);
  await openSample(page, 'add-page-numbers-to-pdf/');
  // The start and the position are taken; the format and the size are the tool's own; shown, on every page.
  await expect(overlay(page)).toContainText('Page 5 of 3');
  await expect(page.locator('#tool-form [name="size"]')).toHaveValue('10');
  await expect(page.locator('#tool-form [name="position"]')).toHaveValue('bottom-left');
  await expect(page.locator('#tool-form [name="scope"]')).toHaveValue('all');
  await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
  // The next edit writes them back as the tool keeps them.
  await page.fill('#tool-form [name="format"]', 'n {page}');
  await expect
    .poll(() => stored(page))
    .toMatchObject({
      pageNumbers: { format: 'n {page}', start: 5, size: 10, position: 'bottom-left' },
    });
  const kept = (await stored(page)).pageNumbers;
  for (const name of ['enabled', 'pages', 'more']) expect(kept).not.toHaveProperty(name);
  // Something that is not a set of settings is not one: the watermark is the tool's own.
  await useTool(page, 'watermark');
  await expect(overlay(page)).toContainText('DRAFT');
  await expect(remember(page)).not.toBeChecked();
  await expectToast(page, 'Watermark “DRAFT” shown on every page. Undo takes it away.');
  await useTool(page, 'footer');
  await expect(remember(page)).not.toBeChecked();
  await expect(page.locator('#tool-form [name="headerLeft"]')).toHaveValue('');

  // Text that cannot be read at all is nothing remembered.
  await page.evaluate((key) => localStorage.setItem(key, '{"pageNumbers":'), STORAGE);
  await openSample(page, 'add-page-numbers-to-pdf/');
  await expect(overlay(page)).toContainText('Page 1 of 3');
  await expect(remember(page)).not.toBeChecked();
});

test('a browser that will not keep the settings says so, and the box is left unticked', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
  });
  await openSample(page, 'add-watermark-to-pdf/');
  // A click, not check(): the box is expected to be unticked again.
  await remember(page).click();
  await expectToast(page, 'This browser could not keep these settings.');
  await expect(remember(page)).not.toBeChecked();
  // The watermark itself is unaffected.
  await page.fill('#tool-form [name="text"]', 'SAMPLE');
  await expect(overlay(page)).toContainText('SAMPLE');
});
