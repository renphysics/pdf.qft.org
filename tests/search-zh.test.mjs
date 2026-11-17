// The tool search on a Chinese page (dist/routes.js, with the catalog of
// dist/i18n-zh.js): Chinese finds the cards its words are on, English still
// works there, and the notes say in Chinese what the site does not do. The
// export worker is told its language in its address; so is this test.
globalThis.location = new URL('https://pdf.qft.org/zh/?lang=zh');
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// The catalog, handed over as a Chinese page's first module does (dist/zh.js).
await import('../dist/zh.js');
const { LANGUAGE } = await import('../dist/i18n.js');
const { SEARCH_NOTES, TOOLS, local, searchFinds, searchNote, searchText, searchWords, searchedText } =
  await import('../dist/routes.js');
const { NOTES, TOOLS: TOOLS_ZH } = await import('../dist/i18n-zh.js');

const html = await readFile(new URL('../dist/zh/index.html', import.meta.url), 'utf8');
// A card is found by its category's name too, as the Chinese filter button shows it.
const labels = Object.fromEntries(
  [...html.matchAll(/data-tool-filter="(\w+)"[^>]*>([^<]+)</g)].map(([, id, label]) => [id, label]),
);
const cards = TOOLS.filter((item) => item.card);
// As app.js reads a card on a Chinese page: its Chinese, its English, and its category.
const cardText = (item) =>
  [...new Set([searchText(local(item)), searchText(item)])].join(' ') + ' ' + labels[item.category];
const found = (query) =>
  cards
    .filter((item) => searchFinds(searchWords(query), searchedText(item, searchWords(query), cardText)))
    .map((item) => item.id);
const noteFor = (query) => searchNote(searchWords(query))?.id || null;
const LINK = /\[([^\]]+)\]\(tool:([a-z]+)\)/g;

await test('the page is Chinese, and its category buttons are named in Chinese', () => {
  assert.equal(LANGUAGE, 'zh');
  assert.deepEqual(Object.keys(labels).sort(), ['all', 'automate', 'edit', 'organize']);
  for (const label of Object.values(labels)) assert.match(label, /[一-鿿]/, `“${label}” is not Chinese`);
});

await test('searchWords: Chinese is a word of its own beside letters; full-width letters are letters', () => {
  for (const [text, words] of [
    ['合并PDF文件', ['合并', 'pdf', '文件']],
    ['pdf合并', ['pdf', '合并']],
    ['ＰＤＦ转ＪＰＧ', ['pdf', '转', 'jpg']],
    ['给 PDF 加页码！', ['给', 'pdf', '加页码']],
    ['2合1', ['2', '合', '1']],
  ])
    assert.deepEqual(searchWords(text), words, `searchWords(${JSON.stringify(text)})`);
});

await test('cards: Chinese finds the cards it is on, whole or in parts of two characters or more', () => {
  for (const [query, ids] of [
    ['合并', ['merge']],
    ['合并pdf', ['merge']],
    ['pdf合并', ['merge']],
    ['ＰＤＦ合并', ['merge']],
    // Words that name no tool: 文件, 怎么, 把, 成...
    ['合并文件', ['merge']],
    ['怎么合并pdf', ['merge']],
    ['合并成一个pdf', ['merge']],
    ['合成', ['merge']],
    // While it is typed, one character finds every card it is on.
    ['合', ['form', 'merge', 'sheets']],
    ['拆分', ['split']],
    ['分割', ['split']],
    ['加水印', ['watermark']],
    ['加页码', ['numbers']],
    ['怎么给pdf加页码', ['numbers']],
    ['删除页面', ['pages', 'delete']],
    ['旋转页面', ['pages']],
    ['空白页', ['pages']],
    ['裁剪', ['crop']],
    ['切边', ['crop']],
    ['签名', ['signature']],
    ['电子签名', ['signature']],
    ['表格', ['form']],
    ['加密', ['protect']],
    ['设置密码', ['protect']],
    ['去密码', ['unlock']],
    ['解除密码', ['unlock']],
    ['图片转pdf', ['jpgtopdf']],
    ['照片转pdf', ['jpgtopdf']],
    ['扫描件转pdf', ['jpgtopdf']],
    ['pdf转照片', ['pdftojpg']],
    ['pdf拆页', ['split']],
    ['拆分成单页', ['split']],
    // A common word is taken whole, never out of a word (合成 keeps its 成), and every
    // way of cutting is tried (图片 转换 成, where 图片转 is a word too).
    ['多个pdf合成一个', ['merge']],
    ['合成一个pdf', ['merge']],
    ['图片转换成pdf', ['jpgtopdf', 'pdftojpg']],
    ['加签名', ['signature']],
    ['加页眉', ['footer']],
    ['pdf加图片', ['text']],
    // Failing that, cut again without the words that name no tool: 转成图片 is 转图片.
    ['pdf转成图片', ['pdftojpg']],
    ['把pdf转成照片', ['pdftojpg']],
    ['添加签名', ['signature']],
    ['添加页眉页脚', ['footer']],
    ['添加密码', ['protect']],
    ['添加空白页', ['pages']],
    // Batch work named with what it does; the operation alone still finds its own tool.
    ['批量加水印', ['batch']],
    ['批量添加页码', ['batch']],
    ['批量裁剪', ['batch']],
    ['批量加页眉页脚', ['batch']],
    ['添加中文', ['text']],
    ['增加页边距', ['margins']],
    ['增加页码', ['numbers']],
    ['把图片转为pdf', ['jpgtopdf']],
    ['pdf转图片', ['pdftojpg']],
    ['多页合一', ['sheets']],
    ['讲义', ['sheets']],
    ['页眉页脚', ['footer']],
    ['页边距', ['margins']],
    ['缩小', ['resize']],
    ['批量', ['batch']],
    ['元数据', ['properties']],
    ['箭头', ['draw']],
    ['倒序', ['pages']],
    // Single characters are too common to count apart: 打码 is not 打开 and 密码.
    ['打码', []],
    ['去水印', []],
    ['加密码', ['protect']],
    // English still works on a Chinese page.
    ['merge', ['merge']],
    ['crop pages', ['crop']],
    ['rotate pdf', ['pages']],
  ])
    assert.deepEqual(found(query), ids, `“${query}” shows the wrong cards`);
  for (const query of ['', 'pdf', '文件', 'pdf文件', '免费', '在线工具'])
    assert.equal(found(query).length, cards.length, `“${query}” shows every card`);
});

await test('cards: each is found by its Chinese name, tab label, each keyword and its category', () => {
  for (const item of cards) {
    const zh = TOOLS_ZH[item.id];
    for (const name of [zh.title, zh.name, zh.tab, ...zh.keywords.split(' '), labels[item.category]].filter(
      Boolean,
    ))
      assert(found(name).includes(item.id), `“${name}” does not find the ${item.id} card`);
  }
});

await test('notes: each Chinese search brings its note, in Chinese, one sentence, naming tools by their Chinese names', () => {
  assert.deepEqual(
    Object.keys(NOTES).sort(),
    SEARCH_NOTES.map((item) => item.id).sort(),
    'i18n-zh.js has Chinese for each note of routes.js, and for no other',
  );
  for (const item of SEARCH_NOTES) {
    const zh = NOTES[item.id];
    for (const search of zh.words)
      assert.equal(noteFor(search), item.id, `“${search}” does not bring the ${item.id} note`);
    assert.equal(searchNote(searchWords(zh.words[0])).text, zh.text, `the ${item.id} note is not in Chinese`);
    for (const [, label, id] of zh.text.matchAll(LINK)) {
      const tool = TOOLS_ZH[id];
      assert(tool && TOOLS.find((entry) => entry.id === id)?.card, `the ${item.id} note links to “${id}”`);
      assert([tool.title, tool.name].includes(label), `the ${item.id} note calls ${id} “${label}”`);
    }
    const text = zh.text.replace(LINK, '$1');
    assert.match(text, /^(QFT PDF|[一-鿿]).*。$/u, `the ${item.id} note is not a sentence: ${text}`);
    assert.deepEqual(
      text.match(/[。！？]/g),
      ['。'],
      `the ${item.id} note is more than one sentence: ${text}`,
    );
    assert.match(text, /不能/, `the ${item.id} note does not say what the site can’t do: ${text}`);
  }
  // English searches bring the note too, in Chinese.
  for (const [query, id] of [
    ['pdf to word', 'office'],
    ['ocr', 'ocr'],
    ['compress', 'compress'],
    ['pdf转word', 'office'],
    ['压缩pdf', 'compress'],
    ['减小pdf大小', 'compress'],
    ['pdf瘦身', 'compress'],
    ['pdf太大', 'compress'],
    ['怎么让pdf变小', 'compress'],
    // Chinese typed around other letters is put together: 修改 + 文字.
    ['修改PDF的文字', 'edit-text'],
    ['提取PDF图片', 'images-out'],
    ['缩小pdf', 'compress'],
    ['怎么压缩文件', 'compress'],
    ['文字识别', 'ocr'],
    ['打码', 'redact'],
    ['修改文字', 'edit-text'],
    ['提取图片', 'images-out'],
    ['书签', 'bookmarks'],
    ['数字签名', 'digital-signature'],
  ])
    assert.equal(noteFor(query), id, `“${query}” brings the wrong note`);
  // A tool's name, and what a tool does, bring none.
  for (const query of [
    ...Object.values(TOOLS_ZH).flatMap((zh) => [zh.name, zh.title, zh.tab]),
    '合并',
    '签名',
    '电子签名',
    '图片',
    '表格',
    '删除页面',
  ].filter(Boolean))
    assert.equal(noteFor(query), null, `“${query}” brings a note`);
});

await test('notes: no tool’s Chinese words offer what a note says the site can’t do', () => {
  for (const tool of TOOLS) {
    const zh = TOOLS_ZH[tool.id],
      offered = [zh.name, zh.title, zh.tab, ...(zh.card || []), zh.keywords].filter(Boolean).join(' ');
    for (const note of Object.values(NOTES))
      for (const phrase of note.missing)
        assert(!offered.includes(phrase), `${tool.id} offers “${phrase}”, which a note says no tool does`);
  }
});
