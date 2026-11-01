// PDF/A files and password-protected PDFs, opened, edited and downloaded.
import {
  test, expect, fixture, openFiles, ready, useTool, toastText, download, pdfText, opensWith, writeTemporary, PDFLib,
} from './helpers.mjs';

/** A one-page PDF that declares PDF/A-1b in its XMP metadata, saved without object streams. */
async function pdfaFile() {
  const pdf = await PDFLib.PDFDocument.create();
  pdf.addPage([400, 300]).drawText('Archived page', { x: 40, y: 200, size: 18, font: await pdf.embedFont(PDFLib.StandardFonts.Helvetica) });
  const xmp = '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>1</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
  pdf.catalog.set(PDFLib.PDFName.of('Metadata'), pdf.context.register(pdf.context.stream(new TextEncoder().encode(xmp), { Type: 'Metadata', Subtype: 'XML' })));
  return writeTemporary('archive-pdfa1.pdf', await pdf.save({ useObjectStreams: false }));
}
const dialog = (page) => page.locator('#password-dialog');

test('a PDF/A-1 file downloads, and stops claiming PDF/A once content is added', async ({ page }) => {
  await openFiles(page, await pdfaFile());
  const unchanged = await download(page, () => page.click('#download-button'));
  expect(await opensWith(unchanged.bytes)).toBe('open');
  expect(await toastText(page)).toBe('Your edited PDF has been downloaded.');
  await useTool(page, 'watermark');
  await page.click('[data-action="toggle-setting"]');
  const marked = await download(page, () => page.click('#download-button'));
  expect((await pdfText(marked.bytes))[0]).toContain('DRAFT');
  expect(await toastText(page)).toContain('no longer marked as PDF/A');
});

test('asks for the password, keeps asking while it is wrong, and keeps it for the download', async ({ page }) => {
  await page.goto('./');
  await page.setInputFiles('#file-input', fixture('password-aes128.pdf'));
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator('#password-file')).toHaveText('“password-aes128.pdf”');
  await expect(page.locator('#password-input')).toBeFocused();
  await page.click('#password-submit');
  await expect(page.locator('#password-error')).toHaveText('Enter the password.');
  await page.fill('#password-input', 'not it');
  await page.press('#password-input', 'Enter');
  await expect(page.locator('#password-error')).toContainText('didn’t open this PDF');
  await expect(page.locator('#password-input')).toHaveAttribute('aria-invalid', 'true');
  await page.check('#password-show');
  await expect(page.locator('#password-input')).toHaveAttribute('type', 'text');
  await page.fill('#password-input', 'open sesame');
  await page.click('#password-submit');
  await ready(page);
  await expect(dialog(page)).toBeHidden();
  expect(await toastText(page)).toContain('keep the same password');
  await expect(page.locator('#download-button use')).toHaveAttribute('href', '#i-lock');
  await expect(page.locator('#download-button')).toHaveAccessibleName('Download PDF (protected with a password)');

  const kept = await download(page, () => page.click('#download-button'));
  expect(kept.name).toBe('password-aes128-protected.pdf');
  expect(await opensWith(kept.bytes)).toBe('password');
  expect(await pdfText(kept.bytes, 'open sesame')).toEqual(['Secret page 1', 'Secret page 2']);

  // Unlock PDF removes it; Undo brings it back.
  await useTool(page, 'unlock');
  await page.click('[data-action="remove-protection"]');
  await expect(page.locator('#tool-panel')).toContainText('Unlocked');
  const unlocked = await download(page, () => page.locator('#tool-panel [data-action="download"]').click());
  expect(unlocked.name).toBe('password-aes128-unlocked.pdf');
  expect(await opensWith(unlocked.bytes)).toBe('open');
  await page.click('#undo-button');
  await expect(page.locator('#download-button use')).toHaveAttribute('href', '#i-lock');
});

test('Protect PDF sets a new password, also for split parts', async ({ page }) => {
  await openFiles(page, fixture('rotated-cropped.pdf'), 'protect-pdf/');
  await page.click('[data-action="download-protected"]');
  await expect(page.locator('#protect-status')).toHaveText('Enter a password to protect your PDF.');
  await page.fill('#tool-form [name="password"]', '\u0007');
  await expect(page.locator('#protect-status')).toContainText('control characters');
  await page.fill('#tool-form [name="password"]', 'Grüße 1');
  await expect(page.locator('#protect-status')).toHaveText('Your download will need this password to open.');
  const whole = await download(page, () => page.click('[data-action="download-protected"]'));
  expect(await opensWith(whole.bytes)).toBe('password');
  expect(await opensWith(whole.bytes, 'Grüße 1')).toBe('open');

  await useTool(page, 'split');
  await page.click('#tool-form [type="submit"]');
  expect(await toastText(page)).toContain('Each needs your password to open');
  const part = await download(page, () => page.locator('[data-action="download-split"]').first().click());
  expect(await opensWith(part.bytes)).toBe('password');
  expect((await pdfText(part.bytes, 'Grüße 1'))[0]).toContain('ROTATION 0');
});

test('a PDF that only restricts changes opens without asking, and its limits are not kept', async ({ page }) => {
  await openFiles(page, fixture('owner-only-aes256.pdf'), 'add-page-numbers-to-pdf/');
  await expect(dialog(page)).toBeHidden();
  expect(await toastText(page)).toContain('limits on printing, copying or changes');
  const copy = await download(page, () => page.click('#download-button'));
  expect(await opensWith(copy.bytes)).toBe('open');
});

test('Cancel and Escape open nothing, and the next file asks again', async ({ page }) => {
  await page.goto('./');
  await page.setInputFiles('#file-input', fixture('password-rc4.pdf'));
  await expect(dialog(page)).toBeVisible();
  await page.click('#password-cancel');
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(page.locator('#landing')).toBeVisible();
  // Straight away again: the earlier prompt's close event must not close this one.
  await page.setInputFiles('#file-input', fixture('password-rc4.pdf'));
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(page.locator('#landing')).toBeVisible();
});

test('opening several files skips the one whose password is not given', async ({ page }) => {
  await page.goto('merge-pdf/');
  await page.setInputFiles('#file-input', [fixture('rotated-cropped.pdf'), fixture('password-rc4.pdf'), fixture('owner-only-aes256.pdf')]);
  await expect(page.locator('#password-cancel')).toHaveText('Skip this file');
  await page.click('#password-cancel');
  await ready(page);
  expect(await toastText(page)).toContain('“password-rc4.pdf” wasn’t opened');
  await expect(page.locator('#document-info')).toHaveText(/^6 pages/);
});

test('on Unlock PDF, a file opened with its password downloads without one', async ({ page }) => {
  await page.goto('unlock-pdf/');
  await page.setInputFiles('#file-input', fixture('password-aes256-unicode.pdf'));
  await page.fill('#password-input', 'Grüße 密码');
  await page.click('#password-submit');
  await ready(page);
  expect(await toastText(page)).toContain('Your PDF is unlocked');
  const copy = await download(page, () => page.click('#download-button'));
  expect(await opensWith(copy.bytes)).toBe('open');
  expect(await pdfText(copy.bytes)).toEqual(['Secret page 1', 'Secret page 2']);
});
