// Editing journeys on a desktop screen (tests/QA-CHECKLIST.md).
import {
  test, expect, fixture, openSample, openFiles, ready, useTool, toastText, download, overlayLines, pdfText,
  previewDifference, lineWidths, writeTemporary, PDFLib,
} from './helpers.mjs';

test('opens the sample from the home page', async ({ page }) => {
  await openSample(page);
  await expect(page.locator('#document-name')).toHaveText('A little room to create.pdf');
  await expect(page.locator('#document-info')).toHaveText(/^3 pages/);
  await expect(page.locator('[data-page-open]')).toHaveCount(3);
  await expect(page.locator('.page-view.current .page-canvas')).toBeVisible();
});

test('adds text, moves it with keys and the mouse, edits, deletes, undoes and redoes', async ({ page }) => {
  await openSample(page, 'add-text-to-pdf/');
  const item = page.locator('.edit-layer [data-item-id]');
  await page.click('[data-action="add-text"]');
  await expect(page.locator('#inline-editor')).toBeFocused();
  await page.keyboard.type('Keyboard text');
  await page.keyboard.press('Escape');
  await expect(item).toBeFocused();
  expect(await overlayLines(page)).toEqual(['Keyboard text']);

  // Quick presses all count, even within one animation frame: five move five times one.
  const x = () => page.evaluate(() => Number(document.querySelector('.edit-layer [data-item-id]').style.transform.split(',')[4]));
  const start = await x();
  await page.keyboard.press('ArrowRight');
  await expect.poll(x).not.toBe(start);
  const step = (await x()) - start;
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(async () => Math.round(((await x()) - start) / step)).toBe(6);

  // Drag it with the mouse.
  const box = await item.boundingBox();
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + box.height / 2 + 60, { steps: 6 });
  await page.mouse.up();
  const moved = await item.boundingBox();
  expect(moved.x).toBeGreaterThan(box.x + 80);
  expect(moved.y).toBeGreaterThan(box.y + 40);

  // Enter edits again; Control+Enter finishes.
  await item.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#inline-editor')).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.type(', edited');
  await page.keyboard.press('Control+Enter');
  expect(await overlayLines(page)).toEqual(['Keyboard text, edited']);

  await page.keyboard.press('Delete');
  expect(await overlayLines(page)).toEqual([]);
  await page.keyboard.press('Control+z');
  expect(await overlayLines(page)).toEqual(['Keyboard text, edited']);
  await page.keyboard.press('Control+Shift+z');
  expect(await overlayLines(page)).toEqual([]);
  await page.click('#undo-button');
  await page.click('#undo-button');
  expect(await overlayLines(page)).toEqual(['Keyboard text']);
});

test('reports characters the fonts cannot draw, on their page', async ({ page }) => {
  await openSample(page, 'add-text-to-pdf/');
  await page.click('[data-action="add-text"]');
  await page.keyboard.type('Unicorn 🦄');
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel-problems')).toContainText('cannot display');
  await page.locator('[data-page-open]').nth(2).click();
  await page.click('#download-button');
  expect(await toastText(page)).toMatch(/^Page 1: The available font cannot display/);
  await expect(page.locator('#page-jump')).toHaveValue('1');
});

test('watermark, headers and footers and page numbers: the download matches the preview', async ({ page, baseURL }) => {
  await openSample(page);
  await useTool(page, 'watermark');
  await page.click('[data-action="toggle-setting"]');
  await page.selectOption('#tool-form [name="scope"]', 'pages');
  await page.fill('#tool-form [name="scopePages"]', '2-3');
  await useTool(page, 'footer');
  await page.fill('#tool-form [name="footerLeft"]', 'Left {page}');
  await page.fill('#tool-form [name="headerRight"]', 'Header right');
  await useTool(page, 'numbers');
  await page.click('[data-action="toggle-setting"]');
  await useTool(page, 'text');
  const surface = await page.locator('.page-view.current').boundingBox();
  await page.mouse.click(surface.x + surface.width * 0.15, surface.y + surface.height * 0.3);
  await page.keyboard.type('Placed note');
  await page.keyboard.press('Escape');
  const { name, bytes } = await download(page, () => page.click('#download-button'));
  expect(name).toBe('A little room to create-edited.pdf');
  const text = await pdfText(bytes);
  expect(text[0]).toContain('Placed note');
  expect(text[0]).not.toContain('DRAFT');
  expect(text[1]).toContain('DRAFT');
  expect(text[2]).toContain('Left 3');
  expect(text[2]).toContain('Page 3 of 3');
  for (const pageNumber of [1, 2]) expect(await previewDifference(page, bytes, pageNumber, baseURL)).toBeLessThan(0.0002);
});

test('Chinese, Korean and kana text: a small download that matches the preview', async ({ page, baseURL }) => {
  await openSample(page, 'add-text-to-pdf/');
  // Large text with several spaces between Hangul words: a glyph or spacing
  // difference between preview and download adds up along the line.
  await page.fill('#tool-form [name="size"]', '26');
  const surface = await page.locator('.page-view.current').boundingBox();
  await page.mouse.click(surface.x + surface.width * 0.05, surface.y + surface.height * 0.35);
  await page.keyboard.type('中文测试 123，世界 2026');
  await page.keyboard.press('Enter');
  await page.keyboard.type('한국어 테스트 안녕 하세요 감사 합니다');
  await page.keyboard.press('Enter');
  await page.keyboard.type('かな 456 · カナ');
  await page.keyboard.press('Escape');
  await useTool(page, 'footer');
  await page.fill('#tool-form [name="footerLeft"]', '量子场论 第 {page} 页');
  // The CJK font loads on first use; the preview redraws when it arrives.
  await expect(page.locator('.page-view.current .page-overlay text[font-family*="CJK"]').first()).toBeAttached();
  await page.waitForFunction(() => document.fonts.check('16px "QFT Noto Sans CJK"', '中'));
  const { bytes } = await download(page, () => page.click('#download-button'));
  expect(bytes.length, 'only the glyphs used are embedded').toBeLessThan(350_000);
  const text = await pdfText(bytes);
  expect(text[0]).toContain('中文测试 123，世界 2026');
  expect(text[0]).toContain('한국어 테스트 안녕 하세요 감사 합니다');
  expect(text[0]).toContain('かな 456 · カナ');
  expect(text[1]).toContain('量子场论 第 2 页');
  // Every line is as wide in the preview as in the PDF: a glyph or spacing
  // difference (such as Hangul spaces widened in the download only) shows here.
  const widths = await lineWidths(page, bytes, 1, baseURL);
  expect(widths.length).toBeGreaterThanOrEqual(3);
  for (const line of widths) expect(Math.abs(line.preview - line.pdf), JSON.stringify(widths)).toBeLessThan(0.5);
  // Pixels: rasterizers differ a little between systems, so this only guards against gross errors.
  expect(await previewDifference(page, bytes, 1, baseURL)).toBeLessThan(0.003);
});

test('organizes pages: reorder, rotate, delete and extract', async ({ page }) => {
  await openSample(page, 'organize-pdf/');
  await expect(page.locator('#tool-select')).toHaveValue('pages');
  await page.locator('[data-page-open]').nth(2).click();
  await page.click('[data-action="move-earlier"]');
  await page.click('[data-action="select-none"]');
  await page.locator('[data-page-select]').nth(0).check();
  await page.click('[data-action="rotate"]');
  const turned = await download(page, () => page.click('#download-button'));
  const order = (await pdfText(turned.bytes)).map((text) => /(\d) \/ 3/.exec(text)[1]);
  expect(order).toEqual(['1', '3', '2']);
  const doc = await PDFLib.PDFDocument.load(turned.bytes);
  expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([90, 0, 0]);

  await page.fill('#tool-form [name="range"]', '2-3');
  await page.click('[data-action="select-range"]');
  const extracted = await download(page, () => page.click('[data-action="extract"]'));
  expect(extracted.name).toBe('A little room to create-selected.pdf');
  expect((await pdfText(extracted.bytes)).map((text) => /(\d) \/ 3/.exec(text)[1])).toEqual(['3', '2']);

  await useTool(page, 'delete');
  await page.click('[data-action="select-none"]');
  await page.locator('[data-page-select]').nth(1).check();
  await page.click('[data-action="delete-pages"]');
  await expect(page.locator('#document-info')).toHaveText(/^2 pages/);
  await page.click('#undo-button');
  await expect(page.locator('#document-info')).toHaveText(/^3 pages/);
});

test('crops by dragging, and restores the original boundary', async ({ page }) => {
  await openSample(page, 'crop-pdf/');
  const box = await page.locator('.page-view.current').boundingBox();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.8, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#tool-form [name="top"]')).not.toHaveValue('0');
  await page.click('#tool-form [type="submit"]');
  await ready(page);
  expect((await page.locator('.page-view.current').boundingBox()).height).toBeLessThan(box.height);
  const cropped = await download(page, () => page.click('#download-button'));
  const crop = (await PDFLib.PDFDocument.load(cropped.bytes)).getPage(0).getCropBox();
  expect(crop.width).toBeCloseTo(595.28 * 0.8, 0);
  expect(crop.height).toBeCloseTo(841.89 * 0.7, 0);
  await page.click('[data-action="restore-crop"]');
  expect(await toastText(page)).toContain('Original page boundaries restored');
});

test('merges another PDF, undoes and redoes it, and splits into a ZIP', async ({ page }) => {
  await openSample(page, 'merge-pdf/');
  await page.evaluate(() => document.querySelector('[data-action="add-files"]').click());
  await page.setInputFiles('#file-input', fixture('rotated-cropped.pdf'));
  await expect(page.locator('#document-info')).toHaveText(/^7 pages/);
  await page.click('#undo-button');
  await expect(page.locator('#document-info')).toHaveText(/^3 pages/);
  await page.click('#redo-button');
  await expect(page.locator('#document-info')).toHaveText(/^7 pages/);
  const merged = await download(page, () => page.click('#download-button'));
  expect(merged.name).toBe('combined-edited.pdf');
  expect((await pdfText(merged.bytes))[3]).toContain('ROTATION 0');

  await useTool(page, 'split');
  await page.selectOption('#tool-form [name="mode"]', 'chunks');
  await page.fill('#tool-form [name="size"]', '3');
  await page.click('#tool-form [type="submit"]');
  await expect(page.locator('[data-action="download-split"]')).toHaveCount(3);
  const zip = await download(page, () => page.click('[data-action="download-split-zip"]'));
  expect(zip.name).toBe('combined-split.zip');
  const entries = Buffer.from(zip.bytes).toString('latin1').split('PK\u0003\u0004').length - 1;
  expect(entries).toBe(3);
});

test('the address follows the tool; Back returns to the page and Forward to the editor', async ({ page }) => {
  await openSample(page, 'add-watermark-to-pdf/');
  await expect(page).toHaveURL(/add-watermark-to-pdf\/$/);
  await useTool(page, 'numbers');
  await expect(page).toHaveURL(/add-page-numbers-to-pdf\/$/);
  await expect(page).toHaveTitle(/Page numbers/);
  await page.goBack();
  await expect(page).toHaveURL(/add-watermark-to-pdf\/$/);
  await expect(page.locator('#landing')).toBeVisible();
  await page.goForward();
  await ready(page);
  await expect(page).toHaveURL(/add-page-numbers-to-pdf\/$/);
  await expect(page.locator('#document-info')).toHaveText(/^3 pages/);
});

test('PDFs with form fields keep them, and refuse changes that would lose them', async ({ page }) => {
  const form = await PDFLib.PDFDocument.create();
  for (let i = 0; i < 2; i++) form.addPage();
  form.getForm().createTextField('name').addToPage(form.getPage(0), { x: 50, y: 700, width: 200, height: 24 });
  await openFiles(page, await writeTemporary('form.pdf', await form.save()));
  await useTool(page, 'delete');
  await page.locator('[data-page-select]').nth(1).check();
  await page.locator('[data-page-select]').nth(0).uncheck();
  await page.click('[data-action="delete-pages"]');
  expect(await toastText(page)).toMatch(/form/i);
  await expect(page.locator('#document-info')).toHaveText(/^2 pages/);
});

test('files that are not PDFs, or are damaged, get a clear message', async ({ page }) => {
  await page.goto('./');
  await page.setInputFiles('#file-input', await writeTemporary('notes.txt', new TextEncoder().encode('plain text')));
  expect(await toastText(page)).toContain('Please choose PDF files');
  await page.click('[data-action="dismiss-toast"]');
  await page.setInputFiles('#file-input', await writeTemporary('broken.pdf', new TextEncoder().encode('%PDF-1.7 broken')));
  expect(await toastText(page)).toContain('could not be opened as a PDF');
  await expect(page.locator('#landing')).toBeVisible();
});
