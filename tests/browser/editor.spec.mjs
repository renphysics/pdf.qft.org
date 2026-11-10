// Editing journeys on a desktop screen (tests/QA-CHECKLIST.md).
import { createRequire } from 'node:module';
import {
  test,
  expect,
  fixture,
  openSample,
  openFiles,
  ready,
  useTool,
  expectToast,
  download,
  overlayLines,
  pdfText,
  pdfOutline,
  previewDifference,
  lineWidths,
  writeTemporary,
  PDFLib,
  root,
} from './helpers.mjs';

const { createCanvas } = createRequire(import.meta.url)(`${root}/node_modules/@napi-rs/canvas`);

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
  const x = () =>
    page.evaluate(() =>
      Number(document.querySelector('.edit-layer [data-item-id]').style.transform.split(',')[4]),
    );
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
  await expectToast(page, /^Page 1: The available font cannot display/);
  await expect(page.locator('#page-jump')).toHaveValue('1');
});

test('watermark, headers and footers and page numbers: the download matches the preview', async ({
  page,
  baseURL,
}) => {
  await openSample(page);
  // Watermark and Page numbers are on as soon as they open.
  await useTool(page, 'watermark');
  await expect(page.locator('[data-action="toggle-setting"]')).toHaveAttribute('aria-checked', 'true');
  await page.selectOption('#tool-form [name="scope"]', 'pages');
  await page.fill('#tool-form [name="scopePages"]', '2-3');
  await useTool(page, 'footer');
  await page.fill('#tool-form [name="footerLeft"]', 'Left {page}');
  await page.fill('#tool-form [name="headerRight"]', 'Header right');
  await useTool(page, 'numbers');
  await expect(page.locator('[data-action="toggle-setting"]')).toHaveAttribute('aria-checked', 'true');
  await useTool(page, 'text');
  const surface = await page.locator('.page-view.current').boundingBox();
  await page.mouse.click(surface.x + surface.width * 0.15, surface.y + surface.height * 0.3);
  await page.keyboard.type('Placed note');
  await page.keyboard.press('Escape');
  // A highlight and a picture on page 1 too: both must be in the download. The
  // comparison treats pixels within 60 of each other as the same, and the default
  // highlight (a pale yellow at 35%) changes a pixel by at most 60, so a missing
  // one would pass. This one changes the red channel by about 100: enough to be
  // seen, but not so much that its half-covered edge pixels differ from both
  // neighbours by more than 60, which would count each engine's own anti-aliasing.
  await useTool(page, 'highlight');
  await page.click('[data-action="add-highlight"]');
  await page.fill('#tool-form [name="color"]', '#1b4fa0');
  await page.fill('#tool-form [name="opacity"]', '44');
  await page.keyboard.press('Escape');
  await useTool(page, 'image');
  const logo = createCanvas(120, 60);
  logo.getContext('2d').fillStyle = '#2244aa';
  logo.getContext('2d').fillRect(0, 0, 120, 60);
  await page.locator('.pages-heading [data-action="add-files"]').click();
  await page.setInputFiles('#file-input', await writeTemporary('logo.png', logo.toBuffer('image/png')));
  await expect(page.locator('.edit-layer [data-item-id]')).toHaveCount(3);
  await page.keyboard.press('Escape');
  const { name, bytes } = await download(page, () => page.click('#download-button'));
  expect(name).toBe('A little room to create-edited.pdf');
  const text = await pdfText(bytes);
  expect(text[0]).toContain('Placed note');
  expect(text[0]).not.toContain('DRAFT');
  expect(text[1]).toContain('DRAFT');
  expect(text[2]).toContain('Left 3');
  expect(text[2]).toContain('Page 3 of 3');
  const first = (await PDFLib.PDFDocument.load(bytes)).getPage(0).node.Resources();
  expect(first.lookup(PDFLib.PDFName.of('XObject')).keys().length, 'the picture is on page 1').toBe(1);
  const states = first.lookup(PDFLib.PDFName.of('ExtGState'));
  expect(
    states
      .keys()
      .some((key) => states.lookup(key).get(PDFLib.PDFName.of('BM')) === PDFLib.PDFName.of('Multiply')),
    'the highlight is on page 1',
  ).toBe(true);
  expect(await previewDifference(page, bytes, 1, baseURL)).toBeLessThan(0.002);
  expect(await previewDifference(page, bytes, 2, baseURL)).toBeLessThan(0.0002);
});

test('Chinese, Korean and kana text: a small download that matches the preview', async ({
  page,
  baseURL,
}) => {
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
  await expect(
    page.locator('.page-view.current .page-overlay text[font-family*="CJK"]').first(),
  ).toBeAttached();
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
  for (const line of widths)
    expect(Math.abs(line.preview - line.pdf), JSON.stringify(widths)).toBeLessThan(0.5);
  // Pixels: rasterizers differ a little between systems, so this only guards against gross errors.
  expect(await previewDifference(page, bytes, 1, baseURL)).toBeLessThan(0.003);
});

test('organizes pages: reorder, rotate, delete and extract', async ({ page }) => {
  await openSample(page, 'organize-pdf/');
  await expect(page.locator('#tool-select')).toHaveValue('pages');
  // Pages move by dragging in the strip, or with Move earlier and Move later here.
  await expect(page.locator('#page-list button[data-move-page]')).toHaveCount(0);
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

test('adds a blank page after the current one, shaped as that page shows', async ({ page }) => {
  await openSample(page, 'organize-pdf/');
  // Page 2, turned on its side: the blank page that follows it is landscape too.
  await page.locator('[data-page-open]').nth(1).click();
  await page.click('[data-action="select-none"]');
  await page.locator('[data-page-select]').nth(1).check();
  await page.click('[data-action="rotate"]');
  await page.click('[data-action="insert-blank"]');
  await expect(page.locator('#toast-message')).toHaveText('Blank page added as page 3.');
  await expect(page.locator('#document-info')).toHaveText(/^4 pages/);
  await expect(page.locator('#page-jump')).toHaveValue('3');

  const { bytes } = await download(page, () => page.click('#download-button'));
  const doc = await PDFLib.PDFDocument.load(bytes);
  const shown = (sheet) => {
    const box = sheet.getCropBox();
    return sheet.getRotation().angle % 180 ? [box.height, box.width] : [box.width, box.height];
  };
  const [, turned, blank] = doc.getPages();
  expect(shown(turned)[0]).toBeGreaterThan(shown(turned)[1]);
  expect(shown(blank)[0]).toBeCloseTo(shown(turned)[0], 1);
  expect(shown(blank)[1]).toBeCloseTo(shown(turned)[1], 1);
  const text = await pdfText(bytes);
  expect(text[2].trim()).toBe('');
  expect(text.map((page) => /(\d) \/ 3/.exec(page)?.[1] ?? '-')).toEqual(['1', '2', '-', '3']);

  // One undo step, and back.
  await page.click('#undo-button');
  await expect(page.locator('#document-info')).toHaveText(/^3 pages/);
  await page.click('#redo-button');
  await expect(page.locator('#document-info')).toHaveText(/^4 pages/);
});

test('reverses the pages, and interleaves the fronts and backs of a double-sided scan', async ({ page }) => {
  // Two sheets scanned one side at a time: fronts F1, F2, then the backs from the last sheet, B2, B1.
  const pdf = await PDFLib.PDFDocument.create();
  for (const text of ['F1', 'F2', 'B2', 'B1'])
    pdf.addPage([300, 300]).drawText(text, { x: 40, y: 150, size: 24 });
  await openFiles(page, await writeTemporary('scan.pdf', await pdf.save()), 'organize-pdf/');
  const order = async () =>
    (await pdfText((await download(page, () => page.click('#download-button'))).bytes)).map((text) =>
      text.trim(),
    );
  await page.click('[data-action="interleave-pages"]');
  expect(await order()).toEqual(['F1', 'B1', 'F2', 'B2']);
  await page.click('#undo-button');
  expect(await order()).toEqual(['F1', 'F2', 'B2', 'B1']);
  // Backs scanned from the first sheet: the third page is the back of the first.
  await page.locator('#tool-form [name="backsReversed"]').uncheck();
  await page.click('[data-action="interleave-pages"]');
  expect(await order()).toEqual(['F1', 'B2', 'F2', 'B1']);
  await expect(page.locator('#tool-form [name="backsReversed"]')).not.toBeChecked();
  await page.click('[data-action="reverse-pages"]');
  expect(await order()).toEqual(['B1', 'F2', 'B2', 'F1']);
  await page.click('#undo-button');
  expect(await order()).toEqual(['F1', 'B2', 'F2', 'B1']);
});

test('crops by dragging, and restores the original boundary', async ({ page }) => {
  await openSample(page, 'crop-pdf/');
  // Half size, so that the drag stays on screen (Playwright's Firefox drops mouse moves outside the window).
  await page.click('[data-action="zoom-out"]');
  await page.click('[data-action="zoom-out"]');
  await expect(page.locator('#zoom-label')).toHaveText('50%');
  await ready(page);
  const box = await page.locator('.page-view.current').boundingBox();
  expect(box.y + box.height).toBeLessThan(page.viewportSize().height);
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
  // Margins are kept to 0.1% (0.6 pt on this page) on each side.
  expect(Math.abs(crop.width - 595.28 * 0.8)).toBeLessThan(1.3);
  expect(Math.abs(crop.height - 841.89 * 0.7)).toBeLessThan(1.8);
  await page.click('[data-action="restore-crop"]');
  await expectToast(page, /Original page boundaries restored/);
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
  expect(merged.name).toBe('A little room to create-merged.pdf');
  expect((await pdfText(merged.bytes))[3]).toContain('ROTATION 0');
  // A bookmark for each file, at its first page; turned off, none.
  expect(await pdfOutline(merged.bytes)).toEqual([
    { title: 'A little room to create', page: 0 },
    { title: 'rotated-cropped', page: 3 },
  ]);
  await page.locator('#tool-form [name="fileBookmarks"]').uncheck();
  expect(await pdfOutline((await download(page, () => page.click('#download-button'))).bytes)).toEqual([]);
  await page.click('#undo-button');
  await expect(page.locator('#tool-form [name="fileBookmarks"]')).toBeChecked();

  await useTool(page, 'split');
  await page.selectOption('#tool-form [name="mode"]', 'chunks');
  await page.fill('#tool-form [name="size"]', '3');
  await page.click('#tool-form [type="submit"]');
  await expect(page.locator('[data-action="download-split"]')).toHaveCount(3);
  const zip = await download(page, () => page.click('[data-action="download-split-zip"]'));
  expect(zip.name).toBe('A little room to create-split.zip');
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
  form
    .getForm()
    .createTextField('name')
    .addToPage(form.getPage(0), { x: 50, y: 700, width: 200, height: 24 });
  await openFiles(page, await writeTemporary('form.pdf', await form.save()));
  await useTool(page, 'delete');
  await page.locator('[data-page-select]').nth(1).check();
  await page.locator('[data-page-select]').nth(0).uncheck();
  await page.click('[data-action="delete-pages"]');
  await expectToast(page, /form/i);
  await expect(page.locator('#document-info')).toHaveText(/^2 pages/);
});

test('files that are not PDFs, or are damaged, get a clear message', async ({ page }) => {
  await page.goto('./');
  await page.setInputFiles(
    '#file-input',
    await writeTemporary('notes.txt', new TextEncoder().encode('plain text')),
  );
  await expectToast(page, /Please choose PDF files/);
  await page.click('[data-action="dismiss-toast"]');
  await page.setInputFiles(
    '#file-input',
    await writeTemporary('broken.pdf', new TextEncoder().encode('%PDF-1.7 broken')),
  );
  await expectToast(page, /could not be opened as a PDF/);
  await expect(page.locator('#landing')).toBeVisible();
});

test('Undo and Redo say which step they take, and a notice says what was undone', async ({ page }) => {
  await openSample(page);
  const undo = page.locator('#undo-button'),
    redo = page.locator('#redo-button');
  await expect(undo).not.toHaveAttribute('title');
  await useTool(page, 'numbers');
  await expect(undo).toHaveAttribute('title', 'Undo: Page numbers');
  await expect(undo).toHaveAttribute('aria-label', 'Undo: Page numbers');
  await useTool(page, 'pages');
  await page.click('[data-action="rotate"]');
  await expect(undo).toHaveAttribute('title', 'Undo: Rotate pages');
  await undo.click();
  await expectToast(page, 'Undone: Rotate pages.');
  await expect(undo).toHaveAttribute('title', 'Undo: Page numbers');
  await expect(redo).toHaveAttribute('title', 'Redo: Rotate pages');
  await redo.click();
  await expectToast(page, 'Redone: Rotate pages.');
  await expect(redo).not.toHaveAttribute('title');
  await expect(redo).toBeDisabled();
});

test('Delete pages starts with nothing to delete; pages selected on purpose stay selected', async ({
  page,
}) => {
  await openSample(page);
  // The first page is selected when a document opens: handy for Organize pages, not a choice to delete it.
  await useTool(page, 'delete');
  await expect(page.locator('#tool-panel')).toContainText('0 of 3 pages selected for deletion');
  await expect(page.locator('[data-action="delete-pages"]')).toBeDisabled();
  await expect(page.locator('.page-item.marked-delete')).toHaveCount(0);
  await page.locator('[data-page-select]').nth(1).check();
  await expect(page.locator('#tool-panel')).toContainText('1 of 3 pages selected for deletion');
  // Chosen pages stay chosen through other tools and back.
  await useTool(page, 'pages');
  await useTool(page, 'delete');
  await expect(page.locator('#tool-panel')).toContainText('1 of 3 pages selected for deletion');
  await page.click('[data-action="delete-pages"]');
  await expect(page.locator('#document-info')).toHaveText(/^2 pages/);
  await expect(page.locator('#undo-button')).toHaveAttribute('title', 'Undo: Delete pages');
});

test('Delete pages starts empty on its own page, after Reset, and after Undo', async ({ page }) => {
  const nothing = async () => {
    await expect(page.locator('#tool-panel')).toContainText('0 of 3 pages selected for deletion');
    await expect(page.locator('[data-action="delete-pages"]')).toBeDisabled();
    await expect(page.locator('.page-item.marked-delete')).toHaveCount(0);
    await expect(page.locator('[data-page-select]:checked')).toHaveCount(0);
  };
  // Opened on the tool's own page: the tool is not chosen, it is already there.
  await openSample(page, 'delete-pages-from-pdf/');
  await nothing();
  // A page chosen and deleted; Reset brings the document back with nothing chosen.
  await page.locator('[data-page-select]').nth(2).check();
  await page.click('[data-action="delete-pages"]');
  await expect(page.locator('#document-info')).toHaveText(/^2 pages/);
  await page.click('#reset-button');
  await page.click('#confirm-dialog [data-confirm="confirm"]');
  await expect(page.locator('#document-info')).toHaveText(/^3 pages/);
  await nothing();

  // An edit made in another tool remembers the selection a document opens with;
  // undoing it while Delete pages is open does not select that page for deletion.
  await openSample(page);
  await useTool(page, 'pages');
  await page.click('[data-action="rotate"]');
  await expect(page.locator('#undo-button')).toHaveAttribute('title', 'Undo: Rotate pages');
  await useTool(page, 'delete');
  await nothing();
  await page.click('#undo-button');
  await nothing();
  await page.click('#redo-button');
  await nothing();
  // A selection made on purpose comes back with Undo.
  await page.locator('[data-page-select]').nth(1).check();
  await page.click('[data-action="delete-pages"]');
  await expect(page.locator('#document-info')).toHaveText(/^2 pages/);
  await page.click('#undo-button');
  await expect(page.locator('#tool-panel')).toContainText('1 of 3 pages selected for deletion');
});

test('selected pages are downloaded under the name of the first file among them', async ({ page }) => {
  await openSample(page);
  await page.locator('[data-action="add-files"]').first().click();
  await page.setInputFiles('#file-input', fixture('rotated-cropped.pdf'));
  await expect(page.locator('#document-info')).toHaveText(/^7 pages/);
  await useTool(page, 'pages');
  await page.click('[data-action="select-none"]');
  // Pages 5 and 6 are the second file's.
  await page.locator('[data-page-select]').nth(4).check();
  await page.locator('[data-page-select]').nth(5).check();
  const selected = await download(page, () => page.click('[data-action="extract"]'));
  expect(selected.name).toBe('rotated-cropped-selected.pdf');
  // The whole document is named after its first file.
  const whole = await download(page, () => page.click('#download-button'));
  expect(whole.name).toBe('A little room to create-merged.pdf');
});

test('the first document opened is told its files stay on the device; later ones are simply ready', async ({
  page,
}) => {
  await openSample(page);
  await expectToast(page, 'Your PDF is ready. Everything happens on your device.');
  await page.click('#workspace [data-action="open"]');
  await page.setInputFiles('#file-input', fixture('rotated-cropped.pdf'));
  await expect(page.locator('#document-info')).toHaveText(/^4 pages/);
  await expectToast(page, 'Your PDF is ready.');
});

test('a download’s name says what was done to the file', async ({ page }) => {
  await openSample(page);
  const name = async () => (await download(page, () => page.click('#download-button'))).name;
  await useTool(page, 'numbers');
  expect(await name()).toBe('A little room to create-numbered.pdf');
  await page.click('#undo-button');
  await useTool(page, 'watermark');
  // Undone once, Watermark does not show itself again: the switch does.
  await useTool(page, 'text');
  await useTool(page, 'watermark');
  expect(await name()).toBe('A little room to create-watermarked.pdf');
  await page.click('#undo-button');
  await useTool(page, 'pages');
  await page.click('[data-action="rotate"]');
  expect(await name()).toBe('A little room to create-organized.pdf');
  await useTool(page, 'crop');
  await page.fill('#tool-form [name="top"]', '10');
  await page.click('#tool-form [type="submit"]');
  // Two kinds of change: edited.
  expect(await name()).toBe('A little room to create-edited.pdf');
});
