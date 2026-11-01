// The pages scroll continuously, one under another: the page in view is the
// current page, every page can be edited where it is, and long documents keep
// only the pages near the view.
import { test, expect, openSample, openFiles, ready, useTool, download, pdfText, writeTemporary, PDFLib } from './helpers.mjs';

/** Scroll the stage so that a page's top edge is at the top of the view. */
async function scrollToTop(page, number) {
  await page.evaluate((number) => {
    const scroll = document.querySelector('#canvas-scroll');
    const view = document.querySelector(`.page-view[data-number="${number}"]`);
    scroll.scrollTop = view.offsetTop - 8;
  }, number);
}

/** Where a page is in the stage's view: its top and bottom, in pixels from the top of the view. */
const placeInView = (page, number) =>
  page.evaluate((number) => {
    const area = document.querySelector('#canvas-scroll').getBoundingClientRect();
    const view = document.querySelector(`.page-view[data-number="${number}"]`)?.getBoundingClientRect();
    return view ? { top: view.top - area.top, bottom: view.bottom - area.top, height: area.height } : null;
  }, number);

test('the pages show one under another, and the page in view is the current page', async ({ page }) => {
  await openSample(page, 'add-text-to-pdf/');
  const first = await placeInView(page, 1);
  const second = await placeInView(page, 2);
  expect(second.top, 'page 2 follows page 1').toBeGreaterThan(first.bottom);
  await expect(page.locator('#page-jump')).toHaveValue('1');

  // Scrolling to page 2 makes it current: the page number, the page strip and the tools follow.
  await scrollToTop(page, 2);
  await expect(page.locator('#page-jump')).toHaveValue('2');
  await expect(page.locator('[data-page-open]').nth(1)).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-action="add-text"]')).toHaveText(/Add text to page 2/);
  await expect(page.locator('#selection-caption')).toHaveText(/^Page 2/);
  await expect(page.locator('[data-action="previous"]')).toBeEnabled();

  // Next and Previous bring a page's top into view.
  await page.click('[data-action="next"]');
  await expect(page.locator('#page-jump')).toHaveValue('3');
  await expect(page.locator('[data-action="next"]')).toBeDisabled();
  expect(Math.abs((await placeInView(page, 3)).top)).toBeLessThan(40);
  await page.click('[data-action="previous"]');
  await expect(page.locator('#page-jump')).toHaveValue('2');
  // The page strip goes to a page too, and so does the page number box.
  await page.locator('[data-page-open]').first().click();
  await expect(page.locator('#page-jump')).toHaveValue('1');
  expect((await placeInView(page, 1)).top).toBeGreaterThanOrEqual(0);
  await page.fill('#page-jump', '3');
  await page.press('#page-jump', 'Enter');
  await ready(page);
  expect(Math.abs((await placeInView(page, 3)).top)).toBeLessThan(40);
});

test('any page can be edited where it is; undo shows the page of the change', async ({ page }) => {
  await openSample(page, 'add-text-to-pdf/');
  await scrollToTop(page, 2);
  await expect(page.locator('#page-jump')).toHaveValue('2');
  // Page 2 is under page 1's end: click it without going to it first.
  const box = await page.locator('.page-view[data-number="2"]').boundingBox();
  await page.mouse.click(box.x + box.width * 0.2, box.y + 120);
  await page.keyboard.type('On page two');
  await page.keyboard.press('Escape');
  await expect(page.locator('.page-view[data-number="2"] .page-overlay tspan')).toHaveText(['On page two']);
  await expect(page.locator('.page-view[data-number="1"] .page-overlay tspan')).toHaveCount(0);
  const { bytes } = await download(page, () => page.click('#download-button'));
  const text = await pdfText(bytes);
  expect(text[1]).toContain('On page two');
  expect(text[0]).not.toContain('On page two');

  // Away on page 3, undo brings page 2 back into view, without the text; redo shows it there again.
  await page.locator('[data-page-open]').nth(2).click();
  await expect(page.locator('#page-jump')).toHaveValue('3');
  await page.click('#undo-button');
  await expect(page.locator('#page-jump')).toHaveValue('2');
  const shown = await placeInView(page, 2);
  expect(shown.bottom > 0 && shown.top < shown.height, 'page 2 is in view').toBe(true);
  await expect(page.locator('.page-view[data-number="2"] .page-overlay tspan')).toHaveCount(0);
  await page.locator('[data-page-open]').nth(0).click();
  await page.click('#redo-button');
  await expect(page.locator('#page-jump')).toHaveValue('2');
  await expect(page.locator('.page-view[data-number="2"] .page-overlay tspan')).toHaveText(['On page two']);
});

test('zooming keeps the page in view, with the buttons and with Control and the wheel', async ({ page }) => {
  await openSample(page);
  await page.locator('[data-page-open]').nth(2).click();
  await ready(page);
  const before = await placeInView(page, 3);
  await page.click('[data-action="zoom-in"]');
  await page.click('[data-action="zoom-in"]');
  await expect(page.locator('#zoom-label')).toHaveText('150%');
  await ready(page);
  await expect(page.locator('#page-jump')).toHaveValue('3');
  const zoomed = await placeInView(page, 3);
  expect(zoomed.bottom - zoomed.top).toBeCloseTo((before.bottom - before.top) * 1.5, -1);
  expect(Math.abs(zoomed.top - before.top), 'the top of page 3 stays where it was').toBeLessThan(4);
  // The page is now wider than the view, and centred in it.
  const sideways = await page.evaluate(() => {
    const scroll = document.querySelector('#canvas-scroll');
    return [scroll.scrollWidth > scroll.clientWidth, scroll.scrollLeft > 0];
  });
  expect(sideways).toEqual([true, true]);

  await page.click('#zoom-label');
  await expect(page.locator('#zoom-label')).toHaveText('Fit');
  await expect(page.locator('#page-jump')).toHaveValue('3');

  // Control and the wheel zoom around the pointer.
  const view = await page.locator('.page-view.current').boundingBox();
  await page.mouse.move(view.x + view.width / 2, view.y + 200);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await expect(page.locator('#zoom-label')).toHaveText(/^1\d\d%$/);
  await expect(page.locator('#page-jump')).toHaveValue('3');
  await ready(page);
});

test('crop outlines the pages it applies to, and Delete pages marks the pages to delete', async ({ page }) => {
  await openSample(page, 'crop-pdf/');
  const shown = () => page.locator('.page-view:has(.crop-overlay:not([hidden]))');
  await expect(shown()).toHaveCount(1);
  await expect(page.locator('.page-view.current .crop-overlay')).toBeVisible();
  await page.selectOption('#tool-form [name="scope"]', 'all');
  await expect(shown()).toHaveCount(await page.locator('.page-view').count());

  await useTool(page, 'delete');
  await page.click('[data-action="select-none"]');
  await page.locator('[data-page-select]').nth(1).check();
  await expect(page.locator('.page-view[data-number="2"]')).toHaveClass(/marked-delete/);
  await expect(page.locator('.page-view[data-number="1"]')).not.toHaveClass(/marked-delete/);
  await expect(page.locator('.page-view[data-number="2"] canvas')).toHaveAttribute('aria-label', 'Page 2 of 3, marked for deletion');
  await page.click('[data-action="delete-pages"]');
  await expect(page.locator('#document-info')).toHaveText(/^2 pages/);
  await expect(page.locator('.page-view.marked-delete')).toHaveCount(0);
});

test('a 400-page document keeps only the pages near the view', async ({ page }) => {
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  for (let number = 1; number <= 400; number++) {
    // Now and then a page turned on its side.
    const sheet = doc.addPage(number % 40 === 0 ? [842, 595] : [595, 842]);
    sheet.drawText('Page ' + number, { x: 60, y: sheet.getHeight() - 120, size: 60, font });
  }
  await openFiles(page, await writeTemporary('long.pdf', await doc.save()));
  await expect(page.locator('#document-info')).toHaveText(/^400 pages/);
  const kept = () =>
    page.evaluate(() => ({
      pages: document.querySelectorAll('.page-view').length,
      drawn: [...document.querySelectorAll('.page-view canvas')].filter((canvas) => canvas.width > 1).length,
    }));
  expect((await kept()).pages).toBeLessThanOrEqual(6);

  await page.fill('#page-jump', '350');
  await page.press('#page-jump', 'Enter');
  await ready(page);
  await expect(page.locator('.page-view.current')).toHaveAttribute('data-number', '350');
  await expect(page.locator('.page-view.current canvas')).toHaveAttribute('aria-label', 'Page 350 of 400');

  // Scroll up through many pages with the wheel: the page number follows, and only nearby pages are kept.
  const view = await page.locator('#canvas-scroll').boundingBox();
  await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -1200);
  await expect.poll(async () => Number(await page.locator('#page-jump').inputValue())).toBeLessThan(330);
  await ready(page);
  const after = await kept();
  expect(after.pages).toBeLessThanOrEqual(8);
  expect(after.drawn).toBeLessThanOrEqual(8);
  // Whole pages are drawn for the pages in view.
  const current = Number(await page.locator('#page-jump').inputValue());
  await expect(page.locator(`.page-view[data-number="${current}"]`)).not.toHaveClass(/blank/);
});
