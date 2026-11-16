// The samples a visitor can try (README, "Chinese"): the English sample, and on a
// page under zh/ the same three pages in Chinese (scripts/create-sample-zh.py),
// with their fonts inside, text that reads back, and the document's language.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = path.join(root, 'node_modules');
const { PDFDocument, PDFDict, PDFName } = require(path.join(runtime, '@cantoo/pdf-lib'));
const pdfjs = await import(pathToFileURL(path.join(runtime, 'pdfjs-dist/legacy/build/pdf.mjs')));

const sample = (name) => readFile(path.join(root, 'dist/assets', name));
const english = await sample('sample.pdf');
const chinese = await sample('sample-zh.pdf');

/** Each page's text, as PDF.js reads it. */
async function pagesText(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const pages = [];
  for (let number = 1; number <= doc.numPages; number++)
    pages.push((await (await doc.getPage(number)).getTextContent()).items.map((item) => item.str).join(''));
  await doc.loadingTask.destroy();
  return pages;
}

await test('the Chinese sample is the English one’s three A4 pages, in Chinese', async () => {
  const [en, zh] = await Promise.all([english, chinese].map((bytes) => PDFDocument.load(bytes)));
  assert.equal(zh.getPageCount(), 3);
  assert.deepEqual(
    zh.getPages().map((page) => page.getSize()),
    en.getPages().map((page) => page.getSize()),
  );
  const pages = await pagesText(chinese);
  for (const [index, words] of [
    ['留一点空间', '给创作。', '更清楚的文档。', '可以试试这些', '加一条备注', '项目简介', '1 / 3'],
    ['小小的修改，', '更好的文档。', '试试水印', '下载编辑后的 PDF。', '修改清单', '2 / 3'],
    ['给自己', '留一点空间。', '记住一件事', '你的笔记', '3 / 3'],
  ].entries())
    for (const text of words) assert(pages[index].includes(text), `page ${index + 1}: “${text}”`);
  // No English but the name, and PDF.
  for (const [index, text] of pages.entries())
    assert.deepEqual(
      (text.match(/[A-Za-z]+/g) || []).filter((word) => !['QFT', 'PDF'].includes(word)),
      [],
      `English on page ${index + 1}`,
    );
  // The title, subject and language say so too.
  assert.equal(zh.getTitle(), 'QFT PDF - 留一点空间给创作');
  assert.match(zh.getSubject(), /示例文档/);
  assert.equal(zh.catalog.lookup(PDFName.of('Lang'))?.decodeText?.(), 'zh-CN');
});

await test('the Chinese sample carries its own fonts, cut to its characters, and is small', async () => {
  const zh = await PDFDocument.load(chinese);
  const fonts = new Set();
  for (const [, object] of zh.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict) || object.lookup(PDFName.of('Type')) !== PDFName.of('FontDescriptor'))
      continue;
    assert(object.lookup(PDFName.of('FontFile2')), 'every font is embedded');
    fonts.add(
      object
        .lookup(PDFName.of('FontName'))
        .decodeText()
        .replace(/^[A-Z]{6}\+/, ''),
    );
  }
  assert.deepEqual([...fonts].sort(), ['NotoSans-Regular', 'NotoSansCJKsc-Regular']);
  assert(chinese.length < 80_000, `the Chinese sample is ${chinese.length} bytes`);
});
