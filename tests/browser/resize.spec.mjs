// Resize pages (tests/QA-CHECKLIST.md): pages go on A4 or Letter paper, scaled
// to fit, and stay on their sheet when they are cropped or given margins.
import {
  test,
  expect,
  fixture,
  openFiles,
  ready,
  useTool,
  expectToast,
  download,
  pdfText,
  previewDifference,
  writeTemporary,
  PDFLib,
} from './helpers.mjs';

const A4 = [595.28, 841.89],
  LETTER = [612, 792],
  MM = 72 / 25.4;
/** Each page's size as a viewer shows it: its CropBox, turned by its /Rotate. */
const sizes = async (bytes) =>
  (await PDFLib.PDFDocument.load(bytes)).getPages().map((page) => {
    const { width, height } = page.getCropBox(),
      turned = page.getRotation().angle % 180 !== 0;
    return [turned ? height : width, turned ? width : height].map((value) => Math.round(value * 100) / 100);
  });
/** Pages of four sizes: one small, one A4 lying on its side, one square and turned, one long receipt. */
async function mixedSizes() {
  const pdf = await PDFLib.PDFDocument.create();
  pdf.addPage([400, 500]).drawText('Small page', { x: 40, y: 400, size: 20 });
  pdf.addPage([842, 595]).drawText('Already A4', { x: 40, y: 400, size: 20 });
  const square = pdf.addPage([300, 300]);
  square.setRotation(PDFLib.degrees(90));
  square.drawText('Square, turned', { x: 40, y: 150, size: 20 });
  pdf.addPage([226, 900]).drawText('Receipt', { x: 40, y: 800, size: 20 });
  return writeTemporary('mixed-sizes.pdf', await pdf.save());
}
const submit = '#tool-form [type="submit"]';
const save = async (page) => (await download(page, () => page.click('#download-button'))).bytes;
/** The current page's shape on screen: its width over its height. */
const shape = (page) =>
  page.locator('.page-view.current').evaluate((node) => {
    const box = node.getBoundingClientRect();
    return box.width / box.height;
  });

test('pages of mixed sizes go on A4 or Letter paper, as one undo step, and get their own size back', async ({
  page,
}) => {
  await openFiles(page, await mixedSizes(), 'resize-pdf/');
  await expect(page.locator('#tool-select')).toHaveValue('resize');
  const original = await sizes(await save(page));
  expect(original).toEqual([
    [400, 500],
    [842, 595],
    [300, 300],
    [226, 900],
  ]);

  // Every page on A4: three change, and the one that is A4 already is left as it is.
  await page.selectOption('#tool-form [name="resizePaper"]', 'a4');
  await expect(page.locator('#resize-summary')).toHaveText(
    '3 of 4 pages go on A4 paper; 1 is that size already.',
  );
  await page.click(submit);
  await expectToast(page, '3 pages are on A4 paper now. 1 was that size already.');
  await expect.poll(() => shape(page)).toBeCloseTo(A4[0] / A4[1], 2);
  // Its picture in the page strip is drawn again, as a sheet.
  await expect
    .poll(() =>
      page
        .locator('#page-list [data-page-open] canvas')
        .first()
        .evaluate((canvas) => canvas.width / canvas.height),
    )
    .toBeCloseTo(A4[0] / A4[1], 2);
  await expect(page.locator('#resize-summary')).toHaveText('All 4 pages are on A4 paper already.');
  const resized = await download(page, () => page.click('#download-button'));
  expect(resized.name).toBe('mixed-sizes-resized.pdf');
  expect(await sizes(resized.bytes)).toEqual([A4, [842, 595], A4, A4]);
  // Text stays text.
  expect((await pdfText(resized.bytes)).map((text) => text.trim())).toEqual([
    'Small page',
    'Already A4',
    'Square, turned',
    'Receipt',
  ]);

  // One undo step brings every page's own size back.
  await page.click('#undo-button');
  await expectToast(page, 'Undone: Resize pages.');
  await expect.poll(() => shape(page)).toBeCloseTo(400 / 500, 2);
  expect(await sizes(await save(page))).toEqual(original);

  // Letter, for the current page only; the receipt keeps its own shape.
  await useTool(page, 'resize');
  await page.selectOption('#tool-form [name="resizePaper"]', 'letter');
  await page.selectOption('#tool-form [name="resizeScope"]', 'current');
  await expect(page.locator('#resize-summary')).toHaveText('');
  await page.click(submit);
  await expectToast(page, 'The page is on Letter paper now.');
  expect(await sizes(await save(page))).toEqual([LETTER, ...original.slice(1)]);
  await page.click(submit);
  await expectToast(page, 'The page is already on Letter paper.');

  // Its own size again; with nothing to restore, the button says so.
  await page.click('[data-action="resize-restore"]');
  await expectToast(page, 'The page has its own size again.');
  expect(await sizes(await save(page))).toEqual(original);
  await page.click('[data-action="resize-restore"]');
  await expectToast(page, 'These pages have their own size.');

  // Selected pages: two of them; with none selected, the summary says what is missing.
  await page.selectOption('#tool-form [name="resizeScope"]', 'selected');
  await page.locator('[data-page-select]').nth(1).check();
  await page.locator('[data-page-select]').nth(3).check();
  await expect(page.locator('#resize-summary')).toHaveText('Both pages go on Letter paper.');
  await page.locator('[data-page-select]').nth(1).uncheck();
  await page.locator('[data-page-select]').nth(3).uncheck();
  await expect(page.locator('#resize-summary')).toHaveText(
    'Select at least one page in the page strip, or choose Every page.',
  );
});

test('a resized page looks in the preview as in the download: the sheet is blank beside it', async ({
  page,
  baseURL,
}) => {
  // The page shows a square, 300 points each way, of a taller sheet: its CropBox
  // hides a red bar above and one below, where the A4 sheet will be blank.
  const pdf = await PDFLib.PDFDocument.create();
  const sheet = pdf.addPage([300, 500]);
  sheet.drawText('Kept in the middle', { x: 40, y: 250, size: 16 });
  for (const y of [20, 420])
    sheet.drawRectangle({ x: 40, y, width: 220, height: 60, color: PDFLib.rgb(1, 0, 0) });
  sheet.setCropBox(0, 100, 300, 300);
  await openFiles(page, await writeTemporary('hidden-bars.pdf', await pdf.save()), 'resize-pdf/');
  await page.selectOption('#tool-form [name="resizePaper"]', 'a4');
  await page.click(submit);
  await expectToast(page, 'The page is on A4 paper now.');
  // A page number, at the foot of the sheet, and a note on the page.
  await useTool(page, 'numbers');
  await expectToast(page, /^Page numbers/);
  await useTool(page, 'text');
  await page.click('[data-action="add-text"]');
  await page.keyboard.type('On the sheet');
  await page.keyboard.press('Escape');
  await ready(page);
  // The note was placed on the sheet, and is drawn there as it is: at its own
  // size, not scaled with the page under it.
  await expect(page.locator('.page-view.current .page-overlay g[transform]')).toHaveAttribute(
    'transform',
    'matrix(1 0 0 1 0 0)',
  );
  const pixels = () =>
    page.locator('.page-view.current canvas').evaluate((canvas) => {
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      let red = 0,
        dark = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] > 200 && data[index + 1] < 80 && data[index + 2] < 80) red++;
        if (data[index] < 100 && data[index + 1] < 100 && data[index + 2] < 100) dark++;
      }
      return { red, dark };
    });
  const drawn = await pixels();
  expect(drawn.dark, 'the text is drawn').toBeGreaterThan(50);
  expect(drawn.red, 'the bars the CropBox hid stay hidden on the blank of the sheet').toBe(0);
  const bytes = await save(page);
  expect(await sizes(bytes)).toEqual([A4]);
  expect(await previewDifference(page, bytes, 1, baseURL)).toBeLessThan(0.003);
  const [text] = await pdfText(bytes);
  for (const words of ['Kept in the middle', 'On the sheet', '1']) expect(text).toContain(words);
});

test('a resized page stays on its sheet when it is cropped or given margins', async ({ page, baseURL }) => {
  // One page, 400 by 500 points, with a frame along its edges: on A4 it is 1.488
  // times its size, with 49 points of blank sheet above and below.
  const pdf = await PDFLib.PDFDocument.create();
  const sheet = pdf.addPage([400, 500]);
  sheet.drawRectangle({
    x: 2,
    y: 2,
    width: 396,
    height: 496,
    borderWidth: 4,
    borderColor: PDFLib.rgb(0, 0, 0),
  });
  sheet.drawText('Stays on A4', { x: 120, y: 250, size: 20 });
  await openFiles(page, await writeTemporary('framed.pdf', await pdf.save()), 'resize-pdf/');
  await page.selectOption('#tool-form [name="resizePaper"]', 'a4');
  await page.click(submit);
  await expectToast(page, 'The page is on A4 paper now.');

  // Crop: the margins are of the sheet as it is shown. An outline that leaves out
  // only blank sheet has nothing to crop, and one that lies on the blank is refused.
  await useTool(page, 'crop');
  await expect(page.locator('#tool-form .field-hint').last()).toContainText(
    'A resized page stays on its sheet',
  );
  await page.fill('#tool-form [name="top"]', '5');
  await page.click(submit);
  await expectToast(
    page,
    'The outlined area keeps the whole page: only blank sheet lies outside it. Outline less of the page.',
  );
  await page.fill('#tool-form [name="top"]', '0');
  await page.fill('#tool-form [name="bottom"]', '96');
  await page.click(submit);
  await expectToast(
    page,
    'On page 1, the outlined area is on the blank part of its sheet. Outline part of the page itself.',
  );
  // A tenth off each side: what is kept is fitted to the sheet again.
  await page.fill('#tool-form [name="bottom"]', '0');
  await page.fill('#tool-form [name="left"]', '10');
  await page.fill('#tool-form [name="right"]', '10');
  await page.click(submit);
  await expectToast(page, 'Page cropped.');
  // (Away from Crop, which outlines the page.)
  await useTool(page, 'resize');
  await ready(page);
  // The narrower page fills the sheet's height, with 28 points of blank sheet on
  // either side. The frame's upper and lower lines run on into what the crop took
  // away: on the sheet, they end where the page ends.
  const darkAt = (points) =>
    page.locator('.page-view.current canvas').evaluate((canvas, share) => {
      const x = Math.round(share * canvas.width),
        { data } = canvas.getContext('2d').getImageData(x, 0, 1, canvas.height);
      let dark = 0;
      for (let index = 0; index < data.length; index += 4) if (data[index] < 100) dark++;
      return dark;
    }, points / A4[0]);
  expect(await darkAt(100), 'the frame’s lines cross the page').toBeGreaterThan(4);
  expect(await darkAt(10), 'the sheet is blank beside the page').toBe(0);
  let bytes = await save(page);
  expect(await sizes(bytes)).toEqual([A4]);
  expect(await previewDifference(page, bytes, 1, baseURL)).toBeLessThan(0.003);
  await page.click('#undo-button');
  await expectToast(page, 'Undone: Crop.');

  // Margins: 30 mm on the left of the sheet. The page is made smaller to leave them.
  await useTool(page, 'margins');
  await expect(page.locator('#tool-form .field-hint').last()).toContainText(
    'the page is made smaller to leave the margins',
  );
  await page.fill('#tool-form [name="marginLeft"]', '30');
  await page.click(submit);
  await expectToast(page, 'Margins added to the page.');
  await ready(page);
  bytes = await save(page);
  expect(await sizes(bytes)).toEqual([A4]);
  expect(await previewDifference(page, bytes, 1, baseURL)).toBeLessThan(0.003);
  // The frame's left edge is 30 mm from the sheet's: the first dark pixel of the middle row.
  const edge = await page.locator('.page-view.current canvas').evaluate((canvas) => {
    const row = Math.round(canvas.height / 2),
      { data } = canvas.getContext('2d').getImageData(0, row, canvas.width, 1);
    for (let x = 0; x < canvas.width; x++) if (data[x * 4] < 100) return x / canvas.width;
    return -1;
  });
  expect(edge * A4[0]).toBeGreaterThan(30 * MM - 1);
  expect(edge * A4[0]).toBeLessThan(30 * MM + 1.5);
});

test('a form on resized pages is filled in where its fields are shown', async ({ page, baseURL }) => {
  await openFiles(page, fixture('form-fields.pdf'), 'resize-pdf/');
  await page.selectOption('#tool-form [name="resizePaper"]', 'a4');
  await page.click(submit);
  await expectToast(page, '2 pages are on A4 paper now.');
  await useTool(page, 'form');
  await ready(page);
  // The box to type in lies on its field: Letter on A4 is 0.973 of its size, 36 points up the sheet.
  const input = page.locator('.form-field[data-field="applicant.email"]');
  const [box, sheet] = [await input.boundingBox(), await page.locator('.page-view.current').boundingBox()];
  const widget = (await PDFLib.PDFDocument.load(await save(page)))
    .getForm()
    .getTextField('applicant.email')
    .acroField.getWidgets()[0]
    .getRectangle();
  const scale = sheet.width / A4[0];
  expect(Math.abs(box.x - sheet.x - widget.x * scale)).toBeLessThan(1.5);
  expect(Math.abs(box.y - sheet.y - (A4[1] - widget.y - widget.height) * scale)).toBeLessThan(1.5);
  expect(Math.abs(box.width - widget.width * scale)).toBeLessThan(1.5);
  await input.fill('zoe@example.org');
  await useTool(page, 'resize');
  await ready(page);
  const bytes = await save(page);
  expect(await sizes(bytes)).toEqual([A4, [A4[1], A4[0]]]);
  const form = (await PDFLib.PDFDocument.load(bytes)).getForm();
  expect(form.getTextField('applicant.email').getText()).toBe('zoe@example.org');
  expect(await previewDifference(page, bytes, 1, baseURL)).toBeLessThan(0.003);
});

test('what was placed before a resize: a copied signature keeps its shape, and the handles their size', async ({
  page,
}) => {
  await openFiles(page, await mixedSizes(), 'sign-pdf/');
  await page.locator('label:has(input[name="signatureMode"][value="type"])').click();
  await page.fill('#tool-form [name="signatureText"]', 'Alex Morgan');
  await page.click('[data-action="signature-use"]');
  await page.click('[data-action="signature-place"]');
  const signature = page.locator('.page-view.current .page-overlay image');
  await expect(signature).toHaveCount(1);
  const shapeOf = async () => {
    const box = await signature.boundingBox();
    return box.width / box.height;
  };
  const own = await shapeOf();

  // The first page, 400 by 500 points, goes on A4 with the others: the signature is 1.488 times its size.
  await useTool(page, 'resize');
  await page.selectOption('#tool-form [name="resizePaper"]', 'a4');
  await page.click(submit);
  await expectToast(page, '3 pages are on A4 paper now. 1 was that size already.');
  await ready(page);
  expect(await shapeOf()).toBeCloseTo(own, 1);

  // Selected, it has handles of the usual size, though it is drawn at its page's scale.
  await useTool(page, 'signature');
  await page.locator('.page-view.current .edit-layer [data-item-id]').click();
  await expect(page.locator('#tool-panel h2')).toHaveText('Edit signature');
  const handle = () =>
    page
      .locator('.page-view.current .item-box.selected .handle')
      .first()
      .evaluate((node) => node.getBoundingClientRect().width);
  const scaled = await handle();
  // Copied to every page, it has its shape and its size on each, whatever sheet the page is on.
  const width =
    (await signature.boundingBox()).width / (await page.locator('.page-view.current').boundingBox()).width;
  await page.click('[data-action="signature-copy"]');
  await expectToast(page, 'Signature added to 3 more pages.');
  for (const number of [2, 3, 4]) {
    await page
      .locator('[data-page-open]')
      .nth(number - 1)
      .click();
    await ready(page);
    await expect(signature, `page ${number}`).toHaveCount(1);
    expect(await shapeOf(), `the signature's shape on page ${number}`).toBeCloseTo(own, 1);
  }
  // The same width in points on the last page, an A4 sheet like the first.
  expect(
    (await signature.boundingBox()).width / (await page.locator('.page-view.current').boundingBox()).width,
  ).toBeCloseTo(width, 2);
  // A copy was placed on its sheet, and is not scaled: its handles are the same size.
  await page.locator('.page-view.current .edit-layer [data-item-id]').click();
  expect(Math.abs((await handle()) - scaled), 'handles of a scaled item and of one that is not').toBeLessThan(
    0.5,
  );
});

test('a turned page in larger units, cropped at the top, looks on its sheet as in the download', async ({
  page,
  baseURL,
}) => {
  // 300 by 400 units of two points, turned a quarter: it shows 800 by 600 points.
  // Beside it, a page with Letter's numbers in the same units: twice Letter.
  const pdf = await PDFLib.PDFDocument.create();
  for (const [width, height, turn] of [
    [300, 400, 90],
    [612, 792, 0],
  ]) {
    const sheet = pdf.addPage([width, height]);
    sheet.node.set(PDFLib.PDFName.of('UserUnit'), PDFLib.PDFNumber.of(2));
    sheet.setRotation(PDFLib.degrees(turn));
    sheet.drawRectangle({ x: 4, y: 4, width: width - 8, height: height - 8, borderWidth: 3 });
    sheet.drawText('Units of two points', { x: 40, y: height / 2, size: 14 });
  }
  await openFiles(page, await writeTemporary('larger-units.pdf', await pdf.save()), 'crop-pdf/');
  await page.fill('#tool-form [name="top"]', '20');
  await page.click(submit);
  await expectToast(page, 'Page cropped.');
  await useTool(page, 'resize');
  await page.selectOption('#tool-form [name="resizePaper"]', 'letter');
  // The second page has Letter's numbers, and is not Letter.
  await expect(page.locator('#resize-summary')).toHaveText('Both pages go on Letter paper.');
  await page.click(submit);
  await expectToast(page, '2 pages are on Letter paper now.');
  await ready(page);
  const bytes = await save(page);
  expect(await sizes(bytes)).toEqual([[LETTER[1], LETTER[0]], LETTER]);
  expect(await previewDifference(page, bytes, 1, baseURL)).toBeLessThan(0.003);
  expect(await previewDifference(page, bytes, 2, baseURL)).toBeLessThan(0.003);
});

test('a blank page after a resized page is on its paper; refusals name the page they are about', async ({
  page,
}) => {
  await openFiles(page, await mixedSizes(), 'resize-pdf/');
  // Two pages selected, one of them A4 already.
  await page.selectOption('#tool-form [name="resizePaper"]', 'a4');
  await page.selectOption('#tool-form [name="resizeScope"]', 'selected');
  await page.locator('[data-page-select]').nth(1).check();
  await page.locator('[data-page-select]').nth(0).check();
  await expect(page.locator('#resize-summary')).toHaveText(
    '1 of 2 pages goes on A4 paper; 1 is that size already.',
  );
  await page.selectOption('#tool-form [name="resizeScope"]', 'all');
  await page.click(submit);
  await expectToast(page, '3 pages are on A4 paper now. 1 was that size already.');

  // A blank page after the first, then 20 mm on every side of every page: all stay on A4.
  await useTool(page, 'pages');
  await page.click('[data-action="insert-blank"]');
  await expect(page.locator('#document-info')).toHaveText(/^5 pages/);
  await useTool(page, 'margins');
  for (const edge of ['marginTop', 'marginBottom', 'marginLeft', 'marginRight'])
    await page.fill(`#tool-form [name="${edge}"]`, '20');
  await page.click(submit);
  await expectToast(page, 'Margins added to 5 pages.');
  expect(await sizes(await save(page))).toEqual([A4, A4, [A4[1], A4[0]], A4, A4]);
  await page.click('#undo-button');
  await expectToast(page, 'Undone: Add margins.');

  // A crop that leaves only blank sheet of the long receipt, the last page: the
  // refusal names it and shows it, and no page is cropped.
  await useTool(page, 'crop');
  await page.selectOption('#tool-form [name="scope"]', 'all');
  await page.fill('#tool-form [name="right"]', '70');
  await page.click(submit);
  await expectToast(
    page,
    'On page 5, the outlined area is on the blank part of its sheet. Outline part of the page itself.',
  );
  await expect(page.locator('#page-jump')).toHaveValue('5');
  expect(await sizes(await save(page))).toEqual([A4, A4, [842, 595], A4, A4]);
});

test('margins many times the size of a small page are refused before anything changes', async ({ page }) => {
  const pdf = await PDFLib.PDFDocument.create();
  pdf.addPage([12, 12]);
  await openFiles(page, await writeTemporary('tiny.pdf', await pdf.save()), 'add-margins-to-pdf/');
  await page.fill('#tool-form [name="marginLeft"]', '100');
  await page.click(submit);
  await expectToast(
    page,
    'These margins are too large for page 1: more than 20 times its size. Make them smaller.',
  );
  await expect(page.locator('#undo-button')).toBeDisabled();
  // A margin the page can take is added as before.
  await page.fill('#tool-form [name="marginLeft"]', '10');
  await page.click(submit);
  await expectToast(page, 'Margins added to the page.');
});
