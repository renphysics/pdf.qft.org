// Add margins and Pages per sheet (tests/QA-CHECKLIST.md).
import { test, expect, openSample, openFiles, useTool, toastText, download, pdfText, previewDifference, writeTemporary, PDFLib } from './helpers.mjs';

const MM = 72 / 25.4;
const size = async (bytes, index = 0) => {
  const page = (await PDFLib.PDFDocument.load(bytes)).getPage(index);
  const { width, height } = page.getCropBox();
  return [Math.round(width * 100) / 100, Math.round(height * 100) / 100];
};

test('adds margins to every page or one, as one undo step, and removes them', async ({ page }) => {
  await openSample(page, 'add-margins-to-pdf/');
  const sheet = page.locator('.page-view.current');
  const before = await sheet.boundingBox();
  const original = await size((await download(page, () => page.click('#download-button'))).bytes);

  // A wide right margin for notes, on every page.
  await page.click('[data-action="margins-notes"]');
  await expect(page.locator('#tool-form [name="marginRight"]')).toHaveValue('60');
  await page.click('#tool-form [type="submit"]');
  expect(await toastText(page)).toBe('Margins added to 3 pages.');
  await expect.poll(async () => (await sheet.boundingBox()).width / (await sheet.boundingBox()).height).toBeGreaterThan(before.width / before.height + 0.15);
  const { bytes } = await download(page, () => page.click('#download-button'));
  for (const index of [0, 1, 2]) {
    const [width, height] = await size(bytes, index);
    expect(width).toBeCloseTo(original[0] + 60 * MM, 1);
    expect(height).toBeCloseTo(original[1], 1);
  }
  expect((await pdfText(bytes))[0]).toContain('A little room');

  // Undo, then 10 mm at the top of the current page only.
  await page.click('#undo-button');
  await useTool(page, 'margins');
  await page.selectOption('#tool-form [name="marginScope"]', 'current');
  await page.fill('#tool-form [name="marginTop"]', '10');
  await page.click('#tool-form [type="submit"]');
  expect(await toastText(page)).toBe('Margins added to the page.');
  const once = (await download(page, () => page.click('#download-button'))).bytes;
  expect((await size(once, 0))[1]).toBeCloseTo(original[1] + 10 * MM, 1);
  expect(await size(once, 1)).toEqual(original);

  // Remove added margins brings the page back.
  await page.click('[data-action="margins-remove"]');
  expect(await toastText(page)).toBe('The added margins are removed.');
  expect(await size((await download(page, () => page.click('#download-button'))).bytes, 0)).toEqual(original);
});

test('added margins are blank, in the preview as in the download', async ({ page, baseURL }) => {
  // The page's CropBox hides its right 100 points, where a red square is: the new margin covers it.
  const pdf = await PDFLib.PDFDocument.create();
  const sheet = pdf.addPage([400, 300]);
  sheet.drawText('Notes go on the right', { x: 40, y: 150, size: 16 });
  sheet.drawRectangle({ x: 320, y: 100, width: 60, height: 100, color: PDFLib.rgb(1, 0, 0) });
  sheet.setCropBox(0, 0, 300, 300);
  await openFiles(page, await writeTemporary('hidden-square.pdf', await pdf.save()), 'add-margins-to-pdf/');
  for (const [edge, value] of [['marginTop', '15'], ['marginLeft', '25'], ['marginRight', '40']]) await page.fill(`#tool-form [name="${edge}"]`, value);
  await page.click('#tool-form [type="submit"]');
  await expect(page.locator('#toast-message')).toHaveText('Margins added to the page.');
  const red = () =>
    page.locator('.page-view.current canvas').evaluate((canvas) => {
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      let count = 0;
      for (let index = 0; index < data.length; index += 4) if (data[index] > 200 && data[index + 1] < 80 && data[index + 2] < 80) count++;
      return count;
    });
  await expect.poll(async () => (await page.locator('.page-view.current').boundingBox()).width).toBeGreaterThan(0);
  await expect.poll(red).toBe(0);
  const { bytes } = await download(page, () => page.click('#download-button'));
  // (This hides notices for the rest of the test.)
  expect(await previewDifference(page, bytes, 1, baseURL)).toBeLessThan(0.003);
});

test('puts 2 or 4 pages on each sheet, with the edits, and the document stays as it is', async ({ page }) => {
  await openSample(page, 'pdf-pages-per-sheet/');
  await page.selectOption('#tool-form [name="sheetPaper"]', 'a4');
  await expect(page.locator('#sheet-summary')).toHaveText('3 pages on 2 landscape A4 sheets: 2 across, 1 down.');
  await page.locator('label:has(input[name="sheetCount"][value="4"])').click();
  await expect(page.locator('#sheet-summary')).toHaveText('3 pages on 1 portrait A4 sheet: 2 across, 2 down.');
  const sheets = await download(page, () => page.click('#tool-form [type="submit"]'));
  expect(sheets.name).toBe('A little room to create-4-per-sheet.pdf');
  expect(await toastText(page)).toBe('Your sheet has been downloaded.');
  const doc = await PDFLib.PDFDocument.load(sheets.bytes);
  expect(doc.getPageCount()).toBe(1);
  expect(await size(sheets.bytes)).toEqual([595.28, 841.89]);
  const [text] = await pdfText(sheets.bytes);
  for (const number of ['1 / 3', '2 / 3', '3 / 3']) expect(text).toContain(number);
  // The document itself is unchanged: three pages.
  await expect(page.locator('#document-info')).toHaveText(/^3 pages/);

  await page.selectOption('#tool-form [name="sheetPaper"]', 'letter');
  await page.locator('label:has(input[name="sheetCount"][value="2"])').click();
  await page.locator('#tool-form [name="sheetBorder"]').check();
  const two = await download(page, () => page.click('#tool-form [type="submit"]'));
  expect(two.name).toBe('A little room to create-2-per-sheet.pdf');
  expect((await PDFLib.PDFDocument.load(two.bytes)).getPageCount()).toBe(2);
  expect(await size(two.bytes)).toEqual([792, 612]);
});
