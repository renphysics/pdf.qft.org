// Fill form: a PDF's fields are filled in on the page, kept fillable or
// flattened in the download, and shown with their values in the other tools.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, fixture, openFiles, openSample, ready, useTool, download, toastText, pdfText, PDFLib } from './helpers.mjs';

const field = (page, name) => page.locator(`.form-field[data-field="${name}"]`);
const summary = (page) => page.locator('#form-summary');

/** A fingerprint of a canvas's pixels, to tell whether what it shows changed. */
const pixels = (locator) =>
  locator.evaluate((canvas) => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0;
    for (let i = 0; i < data.length; i += 16) hash = (hash * 31 + data[i]) | 0;
    return hash;
  });

test('a form opens in Fill form, its fields fill in on the page, and the download keeps them fillable', async ({ page }) => {
  await openFiles(page, fixture('form-fields.pdf'));
  await expect(page.locator('#tool-select')).toHaveValue('form');
  expect(await toastText(page)).toContain('fields to fill in');
  await expect(summary(page)).toContainText('0 of 11 fields filled in.');
  await expect(summary(page)).toContainText('2 required fields are still empty.');
  // A read-only field shows as it is, with nothing to type in.
  await expect(field(page, 'reference')).toHaveCount(0);

  await field(page, 'applicant.name').first().fill('Zoë Łukasz');
  await field(page, 'applicant.address').fill('12 Harbour Road\nKingston');
  await field(page, 'applicant.postcode').fill('1234567');
  await expect(field(page, 'applicant.postcode')).toHaveValue('12345');
  await field(page, 'member').check();
  await page.locator('.form-field[data-field="plan"][value="Plus"]').check();
  await field(page, 'country').selectOption('Japan');
  await field(page, 'interests').selectOption(['Music', 'Travel']);
  await expect(summary(page)).toContainText('7 of 11 fields filled in.');

  // Undo and redo, field by field.
  await page.click('#undo-button');
  await expect(field(page, 'interests')).toHaveValues([]);
  await page.click('#redo-button');
  await expect(field(page, 'interests')).toHaveValues(['Music', 'Travel']);

  // The next empty field, and Tab on to the next page's fields.
  await page.click('[data-action="form-next"]');
  await expect(field(page, 'applicant.email')).toBeFocused();
  await page.keyboard.type('zoe@example.org');
  await field(page, 'interests').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#page-jump')).toHaveValue('2');
  expect(await page.evaluate(() => document.activeElement.closest('.page-view')?.dataset.number)).toBe('2');
  await field(page, 'comments').fill('Thank you');
  await field(page, 'agree').check();
  await expect(summary(page)).toContainText('10 of 11 fields filled in.');
  await expect(summary(page)).not.toContainText('required');

  const { name, bytes } = await download(page, () => page.click('#tool-form [data-action="download"]'));
  expect(name).toBe('form-fields-edited.pdf');
  const form = (await PDFLib.PDFDocument.load(bytes)).getForm();
  expect(form.getFields()).toHaveLength(12);
  expect(form.getTextField('applicant.name').getText()).toBe('Zoë Łukasz');
  expect(form.getTextField('applicant.address').getText()).toBe('12 Harbour Road\nKingston');
  expect(form.getTextField('applicant.postcode').getText()).toBe('12345');
  expect(form.getTextField('applicant.email').getText()).toBe('zoe@example.org');
  expect(form.getCheckBox('member').isChecked()).toBe(true);
  expect(form.getRadioGroup('plan').getSelected()).toBe('Plus');
  expect(form.getDropdown('country').getSelected()).toEqual(['Japan']);
  expect(form.getOptionList('interests').getSelected()).toEqual(['Music', 'Travel']);
  expect(form.getTextField('comments').getText()).toBe('Thank you');
  expect(form.getCheckBox('agree').isChecked()).toBe(true);
  expect(form.getTextField('reference').getText()).toBe('QFT-1001');
});

test('the other tools and the page strip show the values typed', async ({ page }) => {
  await openFiles(page, fixture('form-fields.pdf'));
  await useTool(page, 'text');
  await ready(page);
  const pageImage = page.locator('.page-view[data-number="1"] canvas');
  const thumbnail = page.locator('[data-page-open]').first().locator('canvas');
  await expect(thumbnail).toBeAttached();
  const before = [await pixels(pageImage), await pixels(thumbnail)];
  await useTool(page, 'form');
  await field(page, 'applicant.name').first().fill('Zoë Łukasz');
  await field(page, 'member').check();
  await useTool(page, 'text');
  await ready(page);
  expect(await pixels(pageImage), 'the page image shows the values').not.toBe(before[0]);
  await expect.poll(() => pixels(thumbnail), { message: 'the thumbnail shows them too' }).not.toBe(before[1]);
});

test('flattened downloads, and flattening lets a form join other PDFs', async ({ page }) => {
  await openFiles(page, fixture('form-fields.pdf'));
  await field(page, 'applicant.name').first().fill('Zoë Łukasz');
  await field(page, 'country').selectOption('Japan');
  // Fields stay fillable: another PDF can't join.
  await page.click('[data-action="add-files"]');
  await page.setInputFiles('#file-input', fixture('rotated-cropped.pdf'));
  expect(await toastText(page)).toContain('Flatten fields on download');
  await page.click('[data-action="dismiss-toast"]');
  await expect(page.locator('#document-info')).toHaveText(/^2 pages/);

  await page.locator('#tool-form [name="flattenForms"]').check();
  await page.click('[data-action="add-files"]');
  await page.setInputFiles('#file-input', fixture('rotated-cropped.pdf'));
  await expect(page.locator('#document-info')).toHaveText(/^6 pages/);
  const { bytes } = await download(page, () => page.click('#download-button'));
  const doc = await PDFLib.PDFDocument.load(bytes);
  expect(doc.getForm().getFields()).toHaveLength(0);
  expect(doc.getPageCount()).toBe(6);
  const text = await pdfText(bytes);
  expect(text[0]).toContain('Zoë Łukasz');
  expect(text[0]).toContain('Japan');
  expect(text[0]).toContain('QFT-1001');
});

test('a character no font has is reported on its field', async ({ page }) => {
  await openFiles(page, fixture('form-fields.pdf'));
  await field(page, 'comments').fill('Unicorn 🦄');
  await useTool(page, 'text');
  await page.click('#download-button');
  await expect(page.locator('#toast-message')).toHaveText(/^Page 2: “Comments”: The available font cannot display/);
  await expect(page.locator('#tool-select')).toHaveValue('form');
  await expect(field(page, 'comments')).toBeFocused();
});

test('a PDF without fields says so, and offers Add text', async ({ page }) => {
  await openSample(page, 'fill-pdf-form/');
  await expect(page.locator('#tool-select')).toHaveValue('form');
  await expect(page.locator('#tool-panel')).toContainText('This PDF has no form fields to fill in.');
  await page.locator('#tool-form [data-tool="text"]').click();
  await expect(page.locator('#tool-select')).toHaveValue('text');
});

test('Fill form has no accessibility violations', async ({ page }) => {
  await openFiles(page, fixture('form-fields.pdf'));
  await field(page, 'applicant.name').first().fill('Alex Morgan');
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
});
