// axe-core finds no accessibility violations on the pages, in the editor's
// tools and states, and in the dialogs.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, fixture, openSample, ready, useTool } from './helpers.mjs';

async function violations(page) {
  const { violations: found } = await new AxeBuilder({ page }).analyze();
  return found.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).slice(0, 3).join(', ')}`);
}

test('home page, tool pages, licenses and batch', async ({ page }) => {
  for (const address of ['./', 'merge-pdf/', 'protect-pdf/', 'sign-pdf/', 'jpg-to-pdf/', 'pdf-to-jpg/', 'licenses/']) {
    await page.goto(address);
    expect(await violations(page), address).toEqual([]);
  }
  await page.goto('batch-edit-pdf/');
  await page.locator('[data-action="batch-choose"]').first().click().catch(() => {});
  await page.setInputFiles('#batch-file-input', [fixture('rotated-cropped.pdf')]);
  expect(await violations(page), 'batch with a file').toEqual([]);
});

test('every editor tool, with items selected and settings shown', async ({ page }) => {
  await openSample(page, 'add-text-to-pdf/');
  await page.click('[data-action="add-text"]');
  await page.keyboard.type('Accessible note');
  expect(await violations(page), 'typing on the page').toEqual([]);
  await page.keyboard.press('Escape');
  expect(await violations(page), 'text selected').toEqual([]);
  await useTool(page, 'highlight');
  await page.click('[data-action="add-highlight"]');
  expect(await violations(page), 'highlight selected').toEqual([]);
  for (const tool of ['watermark', 'footer', 'numbers']) {
    await useTool(page, tool);
    await page.click('[data-action="toggle-setting"]');
    await page.selectOption('#tool-form [name="scope"]', 'pages');
    expect(await violations(page), `${tool}, on some pages`).toEqual([]);
  }
  for (const tool of ['image', 'pages', 'delete', 'crop', 'merge', 'split', 'jpgtopdf', 'pdftojpg', 'protect', 'unlock', 'signature']) {
    await useTool(page, tool);
    await ready(page);
    expect(await violations(page), tool).toEqual([]);
  }
  // Sign PDF: typing a signature, the signature ready to place, and a placed one.
  await page.locator('label:has(input[name="signatureMode"][value="type"])').click();
  await page.fill('#tool-form [name="signatureText"]', 'Alex Morgan');
  expect(await violations(page), 'typing a signature').toEqual([]);
  await page.click('[data-action="signature-use"]');
  expect(await violations(page), 'signature ready').toEqual([]);
  await page.click('[data-action="signature-place"]');
  expect(await violations(page), 'signature placed').toEqual([]);
  await page.locator('.tool-sidebar [data-action="help"]').click();
  await expect(page.locator('#info-dialog')).toBeVisible();
  expect(await violations(page), 'help dialog').toEqual([]);
});

test('the password prompt, with and without an error', async ({ page }) => {
  await page.goto('./');
  await page.setInputFiles('#file-input', fixture('password-aes128.pdf'));
  await expect(page.locator('#password-dialog')).toBeVisible();
  expect(await violations(page), 'password prompt').toEqual([]);
  await page.fill('#password-input', 'wrong');
  await page.click('#password-submit');
  await expect(page.locator('#password-error')).toBeVisible();
  expect(await violations(page), 'password prompt with an error').toEqual([]);
});
