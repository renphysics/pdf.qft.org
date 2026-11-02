// Draw: pen strokes and shapes on the page, saved as lines and curves that
// look in the download exactly as in the preview.
import { test, expect, openSample, ready, download, previewDifference, PDFLib } from './helpers.mjs';

const paths = (page) => page.locator('.page-view[data-number="1"] path.ov-drawing');
const selected = (page) => page.locator('.page-view[data-number="1"] .item-box.selected');

/** Drag across page 1 through points given as fractions of the page (its upper part is in view). */
async function drag(page, points) {
  const box = await page.locator('.page-view[data-number="1"]').boundingBox();
  const at = ([u, v]) => [box.x + u * box.width, box.y + v * box.height];
  await page.mouse.move(...at(points[0]));
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(...at(point), { steps: 8 });
  await page.mouse.up();
}
/**
 * Where the first drawing is on screen, once the page has settled. The overlay
 * may be redrawn while it is measured (boundingBox does not retry), so measure
 * until a box comes back.
 */
async function placeOf(page) {
  await ready(page);
  let box = null;
  await expect.poll(async () => (box = await paths(page).first().boundingBox())).not.toBeNull();
  return box;
}
async function tap(page, [u, v]) {
  const box = await page.locator('.page-view[data-number="1"]').boundingBox();
  await page.mouse.click(box.x + u * box.width, box.y + v * box.height);
}

test('draws pen strokes and shapes; the download shows them as the preview does', async ({ page, baseURL }) => {
  await openSample(page, 'draw-on-pdf/');
  await expect(page.locator('#tool-select')).toHaveValue('draw');

  // Pen strokes are not selected, so the next one can start over the last.
  await drag(page, [[0.15, 0.3], [0.25, 0.38], [0.35, 0.28], [0.45, 0.4]]);
  await expect(paths(page)).toHaveCount(1);
  await expect(selected(page)).toHaveCount(0);
  await drag(page, [[0.3, 0.33], [0.3, 0.45]]);
  await expect(paths(page)).toHaveCount(2);

  // A rectangle is selected when drawn, and its colour can change.
  await page.selectOption('#tool-form [name="shape"]', 'rect');
  await drag(page, [[0.55, 0.3], [0.85, 0.45]]);
  await expect(paths(page)).toHaveCount(3);
  await expect(selected(page)).toHaveCount(1);
  await expect(page.locator('#tool-form [data-action="delete-item"]')).toHaveText('Delete rectangle');
  await page.locator('#tool-form [name="color"]').fill('#2255cc');
  await expect(paths(page).nth(2)).toHaveAttribute('stroke', '#2255cc');

  // A tap elsewhere ends the selection; then an arrow, and an ellipse with the button.
  await tap(page, [0.5, 0.52]);
  await expect(selected(page)).toHaveCount(0);
  await page.selectOption('#tool-form [name="shape"]', 'arrow');
  await drag(page, [[0.2, 0.5], [0.5, 0.47]]);
  await page.selectOption('#tool-form [name="shape"]', 'ellipse');
  await page.click('#tool-form [data-action="add-drawing"]');
  await expect(paths(page)).toHaveCount(5);
  await expect(page.locator('#tool-form [data-action="delete-item"]')).toHaveText('Delete ellipse');

  // Each drawing is one undo step.
  await page.click('#undo-button');
  await expect(paths(page)).toHaveCount(4);
  await page.click('#redo-button');
  await expect(paths(page)).toHaveCount(5);

  // A tap on a drawing that is not selected selects it.
  await tap(page, [0.15, 0.3]);
  await expect(page.locator('#tool-form [data-action="delete-item"]')).toHaveText('Delete drawing');

  const { bytes } = await download(page, () => page.click('#download-button'));
  const doc = await PDFLib.PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(3);
  expect(await previewDifference(page, bytes, 1, baseURL)).toBeLessThan(0.002);
});

test('a selected drawing moves when dragged, and keeps its shape', async ({ page }) => {
  await openSample(page, 'draw-on-pdf/');
  await page.selectOption('#tool-form [name="shape"]', 'line');
  await drag(page, [[0.2, 0.3], [0.6, 0.4]]);
  await expect(selected(page)).toHaveCount(1);
  const before = await placeOf(page);
  await drag(page, [[0.4, 0.35], [0.5, 0.45]]);
  await expect(paths(page)).toHaveCount(1);
  await expect
    .poll(async () => ((await paths(page).first().boundingBox())?.x ?? before.x) - before.x, { message: 'the drawing moved' })
    .toBeGreaterThan(20);
  const after = await placeOf(page);
  expect(after.x - before.x).toBeGreaterThan(20);
  expect(after.y - before.y).toBeGreaterThan(20);
  expect(Math.abs(after.width - before.width)).toBeLessThan(2);
  expect(Math.abs(after.height - before.height)).toBeLessThan(2);
});
