// The tool search says plainly what the site does not do (SEARCH_NOTES in
// routes.js), shows a note's tools as links that work as cards do, answers a
// search for a tool page's own tool, and tells a screen reader about a dead end
// once, when typing rests. Which cards each search finds is tested in Node
// (tests/search.test.mjs).
import AxeBuilder from '@axe-core/playwright';
import { test, expect, openSample, ready, useTool } from './helpers.mjs';
import { TOOLS } from '../../dist/routes.js';

// Every tool with a card; a tool page has all but its own.
const CARDS = TOOLS.filter((item) => item.card).length;

const note = (page) => page.locator('#search-note');
const visibleCards = (page) =>
  page.$$eval('.tool-card', (cards) => cards.filter((card) => !card.hidden).map((card) => card.dataset.card));
const violations = async (page) =>
  (await new AxeBuilder({ page }).analyze()).violations.map(
    (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  );
/** From now on, what the polite live region is given and when, and when the search was last typed in. */
const listen = (page) =>
  page.evaluate(() => {
    window.qaSaid = [];
    window.qaTyped = 0;
    const region = document.querySelector('#announce-status');
    new MutationObserver(
      () => region.textContent && window.qaSaid.push({ text: region.textContent, at: performance.now() }),
    ).observe(region, { childList: true, characterData: true, subtree: true });
    document
      .querySelector('#tool-search')
      .addEventListener('input', () => (window.qaTyped = performance.now()));
  });
const said = (page) => page.evaluate(() => window.qaSaid.map((entry) => entry.text));

// The five dead ends the owner named, and the start of each note.
const DEAD_ENDS = [
  ['compress my pdf', /^QFT PDF can’t compress a PDF/, ['delete', 'split']],
  ['ocr', /^QFT PDF can’t turn a scan into text \(OCR\)/, ['jpgtopdf']],
  ['redact', /^QFT PDF can’t redact/, []],
  ['change text', /^QFT PDF can’t change the text already in a PDF/, ['text']],
  ['convert to word', /^QFT PDF can’t convert between PDF and Word/, []],
];

for (const address of ['./', 'crop-pdf/'])
  test(`the five dead ends each end at one sentence, not at “No tools match” (${address})`, async ({
    page,
  }) => {
    await page.goto(address);
    for (const [query, start, tools] of DEAD_ENDS) {
      await page.fill('#tool-search', query);
      await expect(note(page), query).toHaveText(start);
      await expect(page.locator('#no-tools'), query).toBeHidden();
      expect(await visibleCards(page), `"${query}" shows cards`).toEqual([]);
      const links = await note(page)
        .getByRole('link')
        .evaluateAll((nodes) => nodes.map((node) => node.dataset.startTool));
      expect(links, `the tools "${query}" names`).toEqual(tools);
    }
    await page.fill('#tool-search', 'translate');
    await expect(page.locator('#no-tools')).toBeVisible();
    await expect(note(page)).toBeHidden();
    await page.fill('#tool-search', '');
    await expect(note(page)).toBeHidden();
    await expect(page.locator('#no-tools')).toBeHidden();
    expect((await visibleCards(page)).length).toBe(address === './' ? CARDS : CARDS - 1);
  });

test('a note stands above cards that match but do not do it; with no note, nothing is above them', async ({
  page,
}) => {
  await page.goto('./');
  await page.fill('#tool-search', 'edit text');
  await expect(note(page)).toHaveText(/can’t change the text already in a PDF/);
  expect(await visibleCards(page)).toEqual(['text']);
  const noteBox = await note(page).boundingBox(),
    cardBox = await page.locator('.tool-card[data-card="text"]').boundingBox();
  expect(noteBox.y + noteBox.height, 'the note is above the card').toBeLessThanOrEqual(cardBox.y);
  for (const query of ['edit', 'password', 'scan', 'add page numbers']) {
    await page.fill('#tool-search', query);
    await expect(note(page), query).toBeHidden();
  }
});

test('a note’s link works as its card does: its address, and with a document open the tool in place', async ({
  page,
}) => {
  await page.goto('./');
  await page.fill('#tool-search', 'compress');
  const link = note(page).getByRole('link', { name: 'Delete pages' });
  await expect(link).toHaveAttribute('href', '/delete-pages-from-pdf/');
  await expect(link).toHaveAttribute('data-start-tool', 'delete');
  expect(await violations(page), 'axe, with a note').toEqual([]);
  // A page one directory deeper links to the same address.
  await page.goto('crop-pdf/');
  await page.fill('#tool-search', 'extract images');
  await expect(note(page).getByRole('link', { name: 'PDF to JPG' })).toHaveAttribute('href', '/pdf-to-jpg/');
  expect(await violations(page), 'axe, with a note on a tool page').toEqual([]);
  // No document: the link goes to the tool's page.
  await page.fill('#tool-search', 'typo');
  await note(page).getByRole('link', { name: 'Add text' }).click();
  await expect(page).toHaveURL(/\/add-text-to-pdf\/$/);
  await expect(page.locator('#landing-title')).toContainText('Add text to a PDF.');
  // A document open: the editor switches to the tool, and the document stays.
  await openSample(page, './');
  await page.click('[data-action="back"]');
  await page.fill('#tool-search', 'pdf to word');
  await expect(note(page)).toBeVisible();
  await page.fill('#tool-search', 'digital signature');
  await note(page).getByRole('link', { name: 'Sign PDF' }).click();
  await ready(page);
  await expect(page).toHaveURL(/\/sign-pdf\/$/);
  await expect(page.locator('#sheet-title')).toHaveText('Sign PDF');
  await expect(page.locator('#document-name')).toHaveText('A little room to create.pdf');
});

test('on a tool page, a search for the page’s own tool says the visitor is on it', async ({ page }) => {
  for (const [address, query, text] of [
    ['crop-pdf/', 'crop', 'You are on Crop PDF: choose a PDF above.'],
    ['merge-pdf/', 'combine pdfs', 'You are on Merge PDFs: choose PDFs to merge above.'],
    ['jpg-to-pdf/', 'photos', 'You are on JPG to PDF: choose pictures above.'],
    ['batch-edit-pdf/', 'presets', 'You are on Batch & presets: choose PDFs above.'],
    ['add-text-to-pdf/', 'logo', 'You are on Add text & images: choose a PDF above.'],
  ]) {
    await page.goto(address);
    await page.fill('#tool-search', query);
    await expect(note(page), address).toHaveText(text);
    await expect(page.locator('#no-tools'), address).toBeHidden();
    expect(await visibleCards(page), address).toEqual([]);
  }
  expect(await violations(page), 'axe, with the own-tool message').toEqual([]);
  // Under a filter that hides the page's tool, the search ends as it would with its card there.
  await page.goto('crop-pdf/');
  await page.click('[data-tool-filter="organize"]');
  await page.fill('#tool-search', 'crop');
  await expect(note(page)).toBeHidden();
  await expect(page.locator('#no-tools')).toBeVisible();
  // With a document open, a link takes the document to the page's tool. (No axe here:
  // Firefox crashes when axe runs on a tool page's landing with a document open.)
  await openSample(page, 'crop-pdf/');
  await useTool(page, 'margins');
  await expect(page).toHaveURL(/\/add-margins-to-pdf\/$/);
  await page.click('[data-action="back"]');
  await page.fill('#tool-search', 'trim');
  await expect(note(page)).toHaveText('You are on Crop PDF: use it on your open document.');
  await note(page).getByRole('link', { name: 'use it on your open document' }).click();
  await ready(page);
  await expect(page.locator('#sheet-title')).toHaveText('Crop PDF');
  await expect(page).toHaveURL(/\/crop-pdf\/$/);
  await expect(page.locator('#document-name')).toHaveText('A little room to create.pdf');
});

test('a dead end is said once, after typing rests; cards that match are not said', async ({ page }) => {
  await page.goto('./');
  await listen(page);
  await page.locator('#tool-search').pressSequentially('compress my pdf', { delay: 60 });
  const text = await note(page).textContent();
  await expect.poll(() => said(page)).toEqual([text]);
  const { at, typed } = await page.evaluate(() => ({ at: window.qaSaid[0].at, typed: window.qaTyped }));
  expect(at - typed, 'said before typing rested for 700 ms').toBeGreaterThanOrEqual(650);
  // Ordinary results, typed and left to rest, are not said; the next dead end is, once.
  await page.fill('#tool-search', '');
  await page.locator('#tool-search').pressSequentially('merge', { delay: 60 });
  await page.waitForFunction(() => performance.now() - window.qaTyped > 1200);
  await page.locator('#tool-search').fill('');
  await page.locator('#tool-search').pressSequentially('translate', { delay: 60 });
  await expect.poll(() => said(page)).toEqual([text, await page.locator('#no-tools').textContent()]);
  // The same dead end again, after an ordinary result, is said again.
  const empty = await page.locator('#no-tools').textContent();
  await page.fill('#tool-search', 'merge');
  await page.waitForFunction(() => performance.now() - window.qaTyped > 1000);
  await page.fill('#tool-search', 'translate');
  await expect.poll(() => said(page)).toEqual([text, empty, empty]);
  // Another search that finds nothing, typed straight over this one, is a dead end of
  // its own: silence would mean that cards were found.
  await page.waitForFunction(() => performance.now() - window.qaTyped > 1000);
  await page.locator('#tool-search').selectText();
  await page.locator('#tool-search').pressSequentially('zzzz', { delay: 60 });
  await expect.poll(() => said(page)).toEqual([text, empty, empty, empty]);
  // A filter that changes nothing about a note says nothing more; under one that
  // leaves a search with no card, that is said.
  await page.fill('#tool-search', 'compress');
  await expect.poll(() => said(page)).toEqual([text, empty, empty, empty, text]);
  await page.click('[data-tool-filter="automate"]');
  await page.waitForFunction(() => performance.now() - window.qaTyped > 1000);
  await page.fill('#tool-search', 'merge');
  await expect.poll(() => said(page)).toEqual([text, empty, empty, empty, text, empty]);
  // Another filter, and still no card: the visitor asked again, and hears the answer.
  await page.waitForFunction(() => performance.now() - window.qaTyped > 1000);
  await page.click('[data-tool-filter="edit"]');
  await expect.poll(() => said(page)).toEqual([text, empty, empty, empty, text, empty, empty]);
  await page.click('[data-tool-filter="all"]');
  await expect(page.locator('.tool-card[data-card="merge"]')).toBeVisible();
});

test('what the search was about to say is dropped when the visitor moves on', async ({ page }) => {
  await page.goto('./');
  await listen(page);
  await page.locator('#tool-search').pressSequentially('compress', { delay: 30 });
  await expect(note(page)).toBeVisible();
  // At once: the note has not been said yet, and the editor has its own to say.
  await page.click('[data-action="sample"]');
  await ready(page);
  await expect.poll(() => said(page)).toContain('Your PDF is ready. Everything happens on your device.');
  await page.waitForTimeout(1000);
  expect(
    (await said(page)).filter((entry) => entry.includes('compress')),
    'the note was said after the visitor had gone on to a PDF',
  ).toEqual([]);
});

test('on a tool page, a note names the page’s own tool without a link to it', async ({ page }) => {
  await page.goto('delete-pages-from-pdf/');
  await page.fill('#tool-search', 'compress');
  await expect(note(page)).toHaveText(/with Delete pages or Split PDF, can make the copy smaller\.$/);
  // A link to this page would load it again and empty the search.
  await expect(note(page).getByRole('link')).toHaveText(['Split PDF']);
  // With a document open the name is a link again: it takes the document to the tool.
  await openSample(page, 'delete-pages-from-pdf/');
  await useTool(page, 'crop');
  await page.click('[data-action="back"]');
  await page.fill('#tool-search', 'make it smaller');
  await expect(note(page).getByRole('link')).toHaveText(['Delete pages', 'Split PDF']);
  await note(page).getByRole('link', { name: 'Delete pages' }).click();
  await ready(page);
  await expect(page.locator('#sheet-title')).toHaveText('Delete pages');
});

test('at 320 px, every note fits without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('./');
  for (const query of [
    'compress',
    'ocr',
    'redact',
    'edit text',
    'word',
    'extract images',
    'bookmarks',
    'certificate',
  ]) {
    await page.fill('#tool-search', query);
    await expect(note(page), query).toBeVisible();
    const fit = await note(page).evaluate((node) => ({
      page: document.documentElement.scrollWidth - innerWidth,
      right: node.getBoundingClientRect().right - innerWidth,
    }));
    expect(fit.page, `"${query}" scrolls the page sideways`).toBeLessThanOrEqual(0);
    expect(fit.right, `"${query}": the note is wider than the screen`).toBeLessThanOrEqual(0);
  }
});
