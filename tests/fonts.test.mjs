// The common Chinese font (dist/assets/fonts/NotoSansCJKsc-GB2312.woff2, made by
// scripts/subset-cjk-font.py): every character of GB 2312, the same glyphs and
// widths as the full CJK font, and the only CJK font that a download with
// GB 2312 text fetches. Text with rarer characters fetches the full font.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || path.join(root, 'node_modules');
globalThis.PDFLib = require(path.join(runtime, '@cantoo/pdf-lib'));
globalThis.fontkit = require(path.join(runtime, '@cantoo/fontkit'));
// The files the engine fetches, by name: fonts come from dist/assets/fonts.
const fetched = [];
globalThis.fetch = async (url) => {
  fetched.push(path.basename(new URL(url).pathname));
  return new Response(await readFile(new URL(url)));
};
const { buildPdf, characterSet, measuringFont, textFont } = await import('../dist/pdf-engine.js');
const { PDFDocument } = globalThis.PDFLib;

/** Every character GB 2312 encodes, as browsers decode it (GBK), without GBK's private-use cells. */
function gb2312() {
  const bytes = [];
  for (let row = 0xa1; row <= 0xf7; row++) for (let cell = 0xa1; cell <= 0xfe; cell++) bytes.push(row, cell);
  return [...new TextDecoder('gbk').decode(new Uint8Array(bytes))].filter(
    (char) => char !== '�' && !/[-]/u.test(char),
  );
}
const blank = await (async () => {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  return doc.save();
})();
const download = (texts) =>
  buildPdf({
    sources: [{ id: 's', bytes: blank }],
    pages: [{ id: 'p', sourceId: 's', index: 0 }],
    annotations: texts.map((text, index) => ({
      id: `t${index}`,
      type: 'text',
      pageId: 'p',
      pageRotation: 0,
      text,
      x: 0.05,
      y: 0.1 + index * 0.1,
      autoWidth: true,
      fontSize: 14,
    })),
  });

await test('a download with GB 2312 text fetches the common font only, 1.4 MB, and not the full 16 MB', async () => {
  await download(['中文：你好，世界！第 3 页，共 12 页。', '“引号”——破折号……省略号', 'Mixed 混合 ABC é']);
  // (Each text has Chinese in it, so none is drawn with the Latin font.)
  assert.deepEqual([...fetched], ['NotoSansCJKsc-GB2312.woff2']);
  const { size } = await stat(path.join(root, 'dist/assets/fonts', fetched[0]));
  assert(size < 1.5e6, `the common font is ${size} bytes`);
  // A rarer character (Traditional, Japanese or Korean) needs the full font, for that text only.
  fetched.length = 0;
  await download(['简体', '繁體字測試：臺灣']);
  assert.deepEqual([...fetched], ['NotoSansCJKsc-Regular.otf']);
});

await test('the common font has every character of GB 2312: its 6,763 hanzi and its symbols', async () => {
  const font = await measuringFont('cjk'),
    has = characterSet(font),
    chars = gb2312();
  assert.deepEqual(
    chars.filter((char) => !has.has(char.codePointAt(0))),
    [],
    'characters of GB 2312 the common font lacks',
  );
  const hanzi = chars.filter((char) => /\p{Script=Han}/u.test(char) && char >= '一' && char <= '鿿');
  assert.equal(new Set(hanzi).size, 6763, 'the hanzi of GB 2312');
  for (const char of '，。、；：？！“”‘’（）《》【】—…·０１ＡＢ　€ⅰ①')
    assert(has.has(char.codePointAt(0)), `“${char}”`);
});

await test('the common font draws and measures as the full font does, and text picks the full font only when it must', async () => {
  const common = await measuringFont('cjk'),
    full = await measuringFont('cjk-full');
  const differ = [...characterSet(common)]
    .map((code) => String.fromCodePoint(code))
    .filter(
      (char) => Math.abs(common.widthOfTextAtSize(char, 100) - full.widthOfTextAtSize(char, 100)) > 1e-9,
    );
  assert.deepEqual(differ, [], 'characters whose width differs between the two fonts');
  // Glyphs the full font composes (ccmp): two em dashes make one long dash in both.
  for (const text of ['——', '中文“引号”——破折号……', 'Mixed 混合 ABC abc 123'])
    assert.equal(common.widthOfTextAtSize(text, 14), full.widthOfTextAtSize(text, 14), text);
  assert.equal(common.heightAtSize(14), full.heightAtSize(14));
  // Fonts are compared by identity: assert.equal on two font objects would print them
  // whole when it fails, and run out of memory before naming the text.
  for (const [text, font] of [
    ['你好，世界', common],
    ['ひらがな、カタカナ', common],
    ['繁體字', full],
    ['한국어', full],
    ['龘', full],
  ])
    assert.ok((await textFont(text, measuringFont)) === font, `“${text}” is drawn with the wrong font`);
});

const { CJK, blockingCharacter, wrapText } = await import('../dist/layout.js');
const pdfjs = await import(pathToFileURL(path.join(runtime, 'pdfjs-dist/legacy/build/pdf.mjs')));
/** The page's text, as PDF.js reads it. */
async function pageText(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const text = (await (await doc.getPage(1)).getTextContent()).items.map((item) => item.str).join(' ');
  await doc.loadingTask.destroy();
  return text;
}

await test('full-width forms and the symbols of GB 2312, alone, are drawn with the Chinese font and read back', async () => {
  // Noto Sans has none of these: a text of them alone went to it and failed to export.
  for (const text of ['（2026）', '１２３', '，', '①②③', '★ ■ →', 'Ⅻ'])
    assert.ok(
      (await textFont(text, measuringFont)) === (await measuringFont('cjk')),
      `${text}: not the common Chinese font`,
    );
  const bytes = await buildPdf({
    sources: [{ id: 's', bytes: blank }],
    pages: [{ id: 'p', sourceId: 's', index: 0 }],
    annotations: ['（2026）', '１２３', '，'].map((text, index) => ({
      id: `t${index}`,
      type: 'text',
      pageId: 'p',
      pageRotation: 0,
      text,
      x: 0.05,
      y: 0.1 + index * 0.1,
      autoWidth: true,
      fontSize: 14,
    })),
    // A page number set in full-width brackets: （1）.
    pageNumbers: { format: '（{page}）', position: 'bottom-right', margin: 24, size: 10 },
  });
  const text = await pageText(bytes);
  for (const expected of ['（2026）', '１２３', '，', '（1）'])
    assert(text.includes(expected), `${expected}: ${text}`);
});

await test('the Chinese fonts take exactly what they have and Noto Sans lacks, beside the CJK blocks', async () => {
  const latin = characterSet(await measuringFont('latin')),
    common = characterSet(await measuringFont('cjk')),
    full = characterSet(await measuringFont('cjk-full'));
  const blocks = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\u{20000}-\u{2FA1F}]/u;
  const wrong = [];
  for (const code of new Set([...latin, ...common, ...full])) {
    // (U+FFFF ends a font's character map; it is no character.)
    if (code <= 0x7e || code === 0xffff) continue;
    const char = String.fromCodePoint(code);
    const chinese = (common.has(code) || full.has(code)) && !latin.has(code);
    if (CJK.test(char) !== (blocks.test(char) || chinese)) wrong.push(char);
  }
  assert.deepEqual(
    wrong.map((char) => char.codePointAt(0).toString(16)),
    [],
    'characters drawn with the wrong font',
  );
});

await test('symbols only the full Chinese font has, alone, are drawn with it and read back', async () => {
  // Not in GB 2312, nor in Noto Sans: ⑪, a check mark, a double arrow.
  const full = await measuringFont('cjk-full');
  for (const text of ['⑪', '✓ Done', 'A ↔ B', 'x ⇒ y'])
    assert.ok((await textFont(text, measuringFont)) === full, `${text}: not the full Chinese font`);
  const text = await pageText(await download(['⑪', '✓ Done', 'A ↔ B']));
  for (const expected of ['⑪', '✓', 'Done', '↔']) assert(text.includes(expected), `${expected}: ${text}`);
});

await test('a text that cannot be drawn names the character in its way', async () => {
  // A symbol only the Chinese fonts have takes Latin text to them, and they lack
  // some letters Noto Sans has (Ł): the symbol is what to remove, not the letter.
  assert.equal(blockingCharacter('Łódź → Kraków', 'Ł'), '→');
  assert.equal(blockingCharacter('① Zażółć', 'ż'), '①');
  // Chinese beside such a letter: the letter is what the font lacks.
  assert.equal(blockingCharacter('中文 Ł', 'Ł'), 'Ł');
  // Without Chinese fonts in play, the missing character itself.
  assert.equal(blockingCharacter('Unicorn 🦄', '🦄'), '🦄');
  await assert.rejects(download(['Łódź → Kraków']), /“→”/);
  await assert.rejects(download(['中文 Ł']), /“Ł”/);
  // Without the symbol the letters are drawn, with Noto Sans.
  assert.match(await pageText(await download(['Łódź – Kraków'])), /Łódź/);
});

await test('lines break at spaces unless they hold Chinese, Japanese or Korean, whatever their font', async () => {
  const cjk = await measuringFont('cjk');
  // English with one symbol only the Chinese fonts have: drawn with them, broken at spaces.
  for (const text of [
    '→ Please return the signed contract before Friday, together with the invoice.',
    'Speed ≤ 30 km/h in the residential streets around the school.',
  ]) {
    const lines = wrapText(text, cjk, 14, 180);
    assert(lines.length > 1, text);
    assert.equal(lines.join(' '), text, `broken inside a word: ${JSON.stringify(lines)}`);
  }
  // Chinese breaks between any two characters, so its lines fill the width.
  const chinese = '我们在这里写一段很长的中文文字，用来看看它在窄的文本框里怎样换行。';
  const lines = wrapText(chinese, cjk, 14, 120);
  assert(lines.length > 2, JSON.stringify(lines));
  assert.equal(lines.join(''), chinese);
  for (const line of lines.slice(0, -1))
    assert(cjk.widthOfTextAtSize(line, 14) > 120 - 2 * 14, `a short line: ${line}`);
});
