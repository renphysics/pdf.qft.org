// Properties: the details a PDF carries, changed or removed in the download.
import { test, expect, openSample, download, PDFLib } from './helpers.mjs';

const field = (page, name) => page.locator(`#tool-form [name="${name}"]`);

/** A download's details, as written (pdf-lib would otherwise stamp its own producer). */
async function details(bytes) {
  const doc = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
  return {
    title: doc.getTitle(),
    author: doc.getAuthor(),
    subject: doc.getSubject(),
    keywords: doc.getKeywords(),
    language: doc.getLanguage(),
    creator: doc.getCreator(),
    producer: doc.getProducer(),
  };
}

test('shows a PDF’s details, and downloads it with the ones changed', async ({ page }) => {
  await openSample(page, 'edit-pdf-metadata/');
  await expect(page.locator('#tool-select')).toHaveValue('properties');
  await expect(field(page, 'title')).toHaveValue('QFT PDF - A little room to create');
  await expect(field(page, 'author')).toHaveValue('QFT PDF');
  await expect(field(page, 'language')).toHaveValue('');
  // What else the file says about itself, which Remove all also removes.
  await expect(page.locator('#properties-extra')).toHaveText(
    /^Also in the file: made with anonymous, saved by ReportLab PDF Library - \(opensource\), created on /,
  );

  await field(page, 'title').fill('Course notes');
  await field(page, 'author').fill('');
  await field(page, 'keywords').fill('physics, fields');
  await field(page, 'language').fill('en-GB');
  const edited = await download(page, () => page.click('#download-button'));
  expect(await details(edited.bytes)).toEqual({
    title: 'Course notes',
    author: undefined,
    subject: 'A sample document for trying PDF editing tools',
    keywords: 'physics, fields',
    language: 'en-GB',
    creator: 'anonymous',
    producer: 'ReportLab PDF Library - (opensource)',
  });

  // Each field is its own undo step.
  await page.click('#undo-button');
  await expect(field(page, 'language')).toHaveValue('');
  await expect(field(page, 'keywords')).toHaveValue('physics, fields');
});

test('Remove all keeps only the language, and undo brings the details back', async ({ page }) => {
  await openSample(page, 'edit-pdf-metadata/');
  await field(page, 'language').fill('en');
  await page.click('[data-action="properties-clear"]');
  await expect(page.locator('#toast-message')).toHaveText('Details removed. Your download won’t include them.');
  await expect(field(page, 'title')).toHaveValue('');
  await expect(field(page, 'subject')).toHaveValue('');
  await expect(field(page, 'language')).toHaveValue('en');
  await expect(page.locator('#properties-extra')).toHaveText('Your download keeps only the details above.');
  const cleaned = await download(page, () => page.click('#download-button'));
  expect(await details(cleaned.bytes)).toEqual({
    title: undefined,
    author: undefined,
    subject: undefined,
    keywords: undefined,
    language: 'en',
    creator: undefined,
    producer: undefined,
  });

  await page.click('#undo-button');
  await expect(field(page, 'title')).toHaveValue('QFT PDF - A little room to create');
  await expect(page.locator('#properties-extra')).toContainText('made with anonymous');
});
