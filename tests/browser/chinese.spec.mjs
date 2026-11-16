// The site in Chinese (README, "Chinese"): English stays the default, a chosen
// 中文 is remembered, the editor and its notices speak Chinese, downloads are
// named in Chinese, the search reads Chinese, and Chinese text in a PDF needs
// the 1.4 MB common font, not the 16 MB one.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, expectToast, openSample, useTool, download, pdfText } from './helpers.mjs';

const KEY = 'qft-pdf-language';
const chosen = (page) => page.evaluate((key) => localStorage.getItem(key), KEY);

test.describe('with a browser that prefers Chinese', () => {
  test.use({ locale: 'zh-CN' });
  test('English is the default; 中文, once chosen, is remembered, and so is English', async ({ page }) => {
    // Nothing guesses: a Chinese browser sees the English pages until 中文 is chosen.
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.goto('./merge-pdf/');
    await expect(page.locator('#landing-title')).toContainText('Merge');
    expect(await chosen(page)).toBeNull();
    // The link leads to this page in Chinese, and remembers the choice.
    await page.locator('.language-link').click();
    await page.waitForURL(/\/zh\/merge-pdf\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('#landing-title')).toContainText('合并');
    expect(await chosen(page)).toBe('zh');
    // An English address now opens its Chinese counterpart, before it shows.
    await page.goto('./');
    await page.waitForURL(/\/zh\/$/);
    await page.goto('./split-pdf/');
    await page.waitForURL(/\/zh\/split-pdf\/$/);
    await expect(page.locator('.language-link')).toHaveText('English');
    // English, chosen again, is remembered too.
    await page.locator('.language-link').click();
    await page.waitForURL(/\/split-pdf\/$/);
    expect(page.url()).not.toContain('/zh/');
    expect(await chosen(page)).toBe('en');
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(page.url()).not.toContain('/zh/');
  });
});

test('the editor speaks Chinese, and a download is named in Chinese', async ({ page }) => {
  const fonts = [];
  page.on('request', (request) => {
    if (request.url().includes('/assets/fonts/'))
      fonts.push(new URL(request.url()).pathname.split('/').pop());
  });
  await openSample(page, './zh/add-watermark-to-pdf/');
  // The opening notice, and what Watermark shows at once: 草稿, DRAFT in Chinese.
  await expectToast(
    page,
    '你的 PDF 已经打开。一切都在你的设备上完成。已在每一页显示水印“草稿”。撤销可以去掉它。',
  );
  await expect(page.locator('#tool-panel h2').first()).toHaveText('水印');
  await expect(page.locator('#document-name')).toHaveText('示例文档.pdf');
  const { name, bytes } = await download(page, () => page.click('#download-button'));
  expect(name).toBe('示例文档-已加水印.pdf');
  await expectToast(page, '已下载编辑后的 PDF。');
  expect((await pdfText(bytes)).join(' ')).toContain('草稿');
  // Chinese in the PDF: the common font of GB 2312 (1.4 MB), not the full one (16 MB).
  expect(fonts).toContain('NotoSansCJKsc-GB2312.woff2');
  expect(fonts).not.toContain('NotoSansCJKsc-Regular.otf');
  // Undo says what it takes back, in Chinese.
  await useTool(page, 'numbers');
  await expectToast(page, '已在每一页显示页码。撤销可以去掉它们。');
  await page.click('#undo-button');
  await expectToast(page, /^已撤销/);
});

test('text the common font lacks is drawn with the full font, and both read back as typed', async ({
  page,
}) => {
  const fonts = [];
  page.on('request', (request) => {
    if (request.url().includes('/assets/fonts/'))
      fonts.push(new URL(request.url()).pathname.split('/').pop());
  });
  await openSample(page, './zh/add-text-to-pdf/');
  await page.click('[data-action="add-text"]');
  await page.keyboard.type('简体中文，繁體中文');
  await page.keyboard.press('Escape');
  const { name, bytes } = await download(page, () => page.click('#download-button'));
  expect(name).toBe('示例文档-已编辑.pdf');
  expect((await pdfText(bytes)).join(' ')).toContain('简体中文，繁體中文');
  expect(fonts).toContain('NotoSansCJKsc-GB2312.woff2');
  expect(fonts).toContain('NotoSansCJKsc-Regular.otf');
});

test('the search reads Chinese, and says in Chinese what the site can’t do', async ({ page }) => {
  await page.goto('./zh/');
  const shown = () =>
    page.locator('.tool-card:visible').evaluateAll((cards) => cards.map((card) => card.dataset.card));
  await page.fill('#tool-search', '合并');
  await expect.poll(shown).toEqual(['merge']);
  await page.fill('#tool-search', '怎么给pdf加页码');
  await expect.poll(shown).toEqual(['numbers']);
  // English still works here.
  await page.fill('#tool-search', 'crop');
  await expect.poll(shown).toEqual(['crop']);
  await page.fill('#tool-search', '压缩');
  const note = page.locator('#search-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('QFT PDF 不能压缩 PDF');
  await expect(note.locator('a', { hasText: '删除页面' })).toHaveAttribute(
    'href',
    /\/zh\/delete-pages-from-pdf\/$/,
  );
  await expect(page.locator('#no-tools')).toBeHidden();
});

test('leaving for English with unsaved work asks first, in Chinese', async ({ page }) => {
  await openSample(page, './zh/add-text-to-pdf/');
  await page.click('[data-action="add-text"]');
  await page.keyboard.type('还没下载');
  await page.keyboard.press('Escape');
  await page.locator('.language-link').evaluate((link) => link.click());
  await expect(page.locator('#confirm-dialog')).toBeVisible();
  await expect(page.locator('#confirm-title')).toHaveText('要离开你的文档吗？');
  await page.locator('[data-confirm="cancel"]').click();
  await expect(page.locator('#confirm-dialog')).toBeHidden();
  expect(page.url()).toMatch(/\/zh\/add-text-to-pdf\/$/);
  expect(await chosen(page)).toBeNull();
});

test('no English is left in the Chinese editor, in any tool', async ({ page }) => {
  // Words that are the same in Chinese: names, formats, units and keys.
  const same = new Set(
    'QFT PDF PDFs JPG JPEG PNG ZIP A4 A3 A5 Letter OCR Word Excel PowerPoint Office XFA AES MB KB dpi Ctrl Shift Alt Tab Enter Delete Escape Control English zh CN en GB de'.split(
      ' ',
    ),
  );
  const english = async () =>
    (
      await page.evaluate(() => {
        const texts = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const element = walker.currentNode.parentElement;
          // (#properties-extra names the apps that made the PDF, in the PDF's own words.)
          if (!element || element.closest('svg, template, script, style, .page-view, #properties-extra'))
            continue;
          if (!element.checkVisibility() || !walker.currentNode.textContent.trim()) continue;
          texts.push(walker.currentNode.textContent.trim());
        }
        for (const element of document.querySelectorAll('[aria-label], [title], [placeholder]'))
          if (!element.closest('template'))
            for (const name of ['aria-label', 'title', 'placeholder'])
              if (element.getAttribute(name)) texts.push(element.getAttribute(name));
        return texts;
      })
    ).filter((text) =>
      // A file's own name, and the placeholders {page} and {total}, are not words of the interface.
      (text.replace(/\{\w+\}|\S+\.(pdf|jpg|png)/g, '').match(/[A-Za-z]{2,}/g) || []).some(
        (word) => !same.has(word),
      ),
    );
  await openSample(page, './zh/');
  expect(await english()).toEqual([]);
  const tools = await page
    .locator('#tool-select option')
    .evaluateAll((options) => options.map((option) => option.value));
  expect(tools.length).toBeGreaterThan(20);
  for (const tool of tools) {
    await useTool(page, tool);
    await expect(page.locator('#tool-select')).toHaveValue(tool);
    expect(await english(), `English in ${tool}`).toEqual([]);
  }
});

test('the Chinese pages and the Chinese editor pass axe, and fit 320 px', async ({ page }) => {
  for (const address of ['./zh/', './zh/merge-pdf/', './zh/batch-edit-pdf/']) {
    await page.goto(address);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(
      violations.map((violation) => violation.id),
      address,
    ).toEqual([]);
  }
  await openSample(page, './zh/sign-pdf/');
  expect((await new AxeBuilder({ page }).analyze()).violations.map((violation) => violation.id)).toEqual([]);
  await page.setViewportSize({ width: 320, height: 700 });
  for (const address of ['./zh/', './zh/pdf-pages-per-sheet/']) {
    await page.goto(address);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), address).toBe(0);
  }
});
