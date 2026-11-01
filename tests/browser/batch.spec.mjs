// Batch & presets: one setup applied to several PDFs, each processed separately.
import { test, expect, fixture, download, pdfText, PDFLib } from './helpers.mjs';
import path from 'node:path';
import { root } from './helpers.mjs';

test('applies a footer and a crop to each PDF, isolates one that needs a password, and zips the rest', async ({ page }) => {
  await page.goto('batch-edit-pdf/');
  await page.locator('[data-action="batch-choose"]').first().click().catch(() => {});
  await page.setInputFiles('#batch-file-input', [
    path.join(root, 'dist/assets/sample.pdf'), fixture('rotated-cropped.pdf'), fixture('password-aes128.pdf'),
  ]);
  await page.locator('input[name="enable-footer"]').check();
  await page.fill('[name="footerCenter"]', 'Batch footer {page}/{total}');
  await page.locator('input[name="enable-crop"]').check();
  await page.fill('[name="crop-top"]', '5');
  await page.click('[data-batch-action="process"]');
  await expect(page.locator('#batch-status')).toHaveText(/2 files ready · 1 could not be processed/, { timeout: 60_000 });
  await expect(page.locator('#batch-file-list')).toContainText('Remove it with Unlock PDF');

  const first = await download(page, () => page.locator('[data-batch-action="download-file"]').first().click());
  expect(first.name).toBe('sample-processed.pdf');
  const text = await pdfText(first.bytes);
  expect(text[0]).toContain('Batch footer 1/3');
  expect(text[2]).toContain('Batch footer 3/3');
  const doc = await PDFLib.PDFDocument.load(first.bytes);
  expect(doc.getPage(0).getCropBox().height).toBeCloseTo(841.89 * 0.95, 0);

  const zip = await download(page, () => page.click('[data-batch-action="download-zip"]'));
  expect(zip.name).toMatch(/\.zip$/);
  expect(Buffer.from(zip.bytes).toString('latin1').split('PK\u0003\u0004').length - 1).toBe(2);
});

test('settings from the editor open in batch as a preset', async ({ page }) => {
  await page.goto('./');
  await page.locator('[data-action="sample"]').first().click();
  await expect(page.locator('#workspace')).toBeVisible();
  await page.selectOption('#tool-select', 'watermark');
  await page.click('[data-action="toggle-setting"]');
  await page.fill('#tool-form [name="text"]', 'CONFIDENTIAL');
  await page.click('[data-action="batch-from-editor"]');
  await expect(page.locator('body')).toHaveClass(/batching/);
  await expect(page).toHaveURL(/batch-edit-pdf\/$/);
  await expect(page.locator('[name="watermark-text"]')).toHaveValue('CONFIDENTIAL');
  await expect(page.locator('input[name="enable-watermark"]')).toBeChecked();
});
