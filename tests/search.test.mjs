// The tool search (dist/routes.js): which cards a search finds, and the notes it
// shows where the site has no tool for what was typed. The notes stay true as
// tools come and go: each links to tools that exist and is one sentence, and none
// says "can’t" about what a tool offers.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  SEARCH_NOTES,
  TOOLS,
  TOOL_PAGES,
  searchFinds,
  searchNote,
  searchText,
  searchWords,
} from '../dist/routes.js';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
// A card is found by its category's name too, as its filter button shows it.
const labels = Object.fromEntries(
  [...html.matchAll(/data-tool-filter="(\w+)"[^>]*>([^<]+)</g)].map(([, id, label]) => [
    id,
    label.replaceAll('&amp;', '&'),
  ]),
);
const cards = TOOLS.filter((item) => item.card);
const cardText = (item) => searchText(item) + ' ' + labels[item.category];
/** The cards a search shows on the home page, as app.js finds them. */
const found = (query) =>
  cards.filter((item) => searchFinds(searchWords(query), cardText(item))).map((item) => item.id);
const noteFor = (query) => searchNote(searchWords(query))?.id || null;
const LINK = /\[([^\]]+)\]\(tool:([a-z]+)\)/g;

await test('searchWords: the lowercase words of a text, without accents or punctuation', () => {
  for (const [text, words] of [
    ['Add text & images', ['add', 'text', 'images']],
    ['e-sign', ['e', 'sign']],
    ['  PDF   to  Word ', ['pdf', 'to', 'word']],
    ['Résumé', ['resume']],
    ['2-up, 4-up', ['2', 'up', '4', 'up']],
    ['Leave out what you don’t need.', ['leave', 'out', 'what', 'you', 'don', 't', 'need']],
    ['', []],
  ])
    assert.deepEqual(searchWords(text), words, `searchWords(${JSON.stringify(text)})`);
});

await test('cards: found by the start of their words, not by a word inside another; pdf, to and the count for nothing', () => {
  const edit = cards.filter((item) => item.category === 'edit').map((item) => item.id);
  for (const [query, ids] of [
    ['password', ['protect', 'unlock']],
    // "word" was found in "password" and "keywords", "pen" in "open" and "append".
    ['word', []],
    ['wor', []],
    ['pdf to word', []],
    ['pen', ['draw']],
    ['lock', ['protect']],
    // The category's name: "edit" finds the cards under Edit & annotate.
    ['edit', edit],
    ['edit pdf', edit],
    ['rotate pdf', ['pages']],
    ['delete pdf pages', ['delete']],
    ['merge pdf', ['merge']],
    ['MERGE', ['merge']],
    ['mer', ['merge']],
    ['e-sign', ['signature']],
    ['scan', ['jpgtopdf']],
    ['stamp', ['watermark']],
    ['mark', ['text', 'draw', 'watermark']],
    // A plural finds the singular: "sheets" finds "Pages per sheet".
    ['sheets', ['sheets']],
    ['number pages', ['numbers']],
    ['add page numbers', ['numbers']],
    ['add watermark', ['watermark']],
    ['add header', ['footer']],
    ['add signature', ['signature']],
    ['insert page', ['pages']],
    // "Draw, type or upload your signature" is on the Sign card.
    ['add drawing', ['signature', 'draw']],
    // "to" counts for nothing, here too.
    ['add text to pdf', ['text', 'watermark']],
    ['add signature to pdf', ['signature']],
    // The ending of a verb or a noun, whole or still being typed: the word without it is found.
    ['merging', ['merge']],
    ['merger', ['merge']],
    ['merged pdfs', ['merge']],
    ['splitt', ['split']],
    ['splitti', ['split']],
    ['splitting', ['split']],
    ['splitter', ['split']],
    ['cropping', ['crop']],
    ['rotation', ['pages']],
    ['rotating pages', ['pages']],
    ['signing', ['signature']],
    ['watermarking', ['watermark']],
    ['encryption', ['protect']],
    ['deleting pages', ['delete']],
    ['password remover', ['unlock']],
    ['resizing', ['resize']],
    ['mergers', ['merge']],
    ['rotations', ['pages']],
    // The last letter doubles, or a final "e" goes; not both: "filling" is "fill", and "notting" is not "note".
    ['filling', ['signature', 'form']],
    ['notting', []],
    // "Scaled to fit, with nothing cut off" is on the Resize card; cutting is what Crop and Split do.
    ['cut', ['crop', 'resize', 'split']],
    ['cutting pages', ['crop', 'resize', 'split']],
    // Every tool works on a PDF file, a document: those words name none of them.
    ['merge pdf files', ['merge']],
    ['split pdf file', ['split']],
    ['sign a document', ['signature']],
    ['protect document', ['protect']],
    ['add text to document', ['text', 'watermark']],
    ['convert jpg to pdf file', ['jpgtopdf', 'pdftojpg']],
    ['merge pdf online free', ['merge']],
    // Tools for pages whose cards did not say "pages".
    ['crop pages', ['crop']],
    ['add margins to pages', ['margins']],
    ['merge pages', ['merge']],
    // Other words, which only start like a card's word.
    ['pending', []],
    ['wording', []],
    ['penal', []],
    // A word of two letters takes no ending: "up" (2-up) is not found by "upper".
    ['upper', []],
    ['watermark remover', []],
    // Words people use that the cards did not have.
    ['electronic signature', ['signature']],
    ['bulk', ['batch']],
    ['organise', ['pages']],
    ['rearrange pages', ['pages']],
    ['sort pages', ['pages']],
    ['translate', []],
  ])
    assert.deepEqual(found(query), ids, `"${query}" shows the wrong cards`);
  for (const query of ['', 'pdf', 'the pdf', 'pdf files', 'my document', 'free'])
    assert.equal(found(query).length, cards.length, `"${query}" shows every card`);
  // "s" alone is not a plural, nor is "ss".
  assert(!found('ss').length, '"ss" finds a card');
  assert.deepEqual(found('press'), [], '"press" finds a card: "ss" was read as a plural');
});

await test('cards: each is found by its name, its tab label, each keyword and its category', () => {
  for (const item of cards) {
    const names = [
      item.title || item.name,
      item.name,
      item.tab,
      ...item.keywords.split(' '),
      labels[item.category],
    ];
    for (const name of names.filter(Boolean))
      assert(found(name).includes(item.id), `"${name}" does not find the ${item.id} card`);
  }
});

await test('notes: each links only to tools that exist, by their names, and is one sentence', () => {
  assert(SEARCH_NOTES.length >= 8, 'the notes are there');
  assert.equal(
    new Set(SEARCH_NOTES.map((item) => item.id)).size,
    SEARCH_NOTES.length,
    'two notes share an id',
  );
  for (const item of SEARCH_NOTES) {
    for (const [, label, id] of item.text.matchAll(LINK)) {
      const tool = TOOLS.find((entry) => entry.id === id);
      assert(tool, `the ${item.id} note links to "${id}", which is no tool`);
      assert(tool.card, `the ${item.id} note links to "${id}", which has no card or page`);
      assert(
        [tool.title, tool.name].includes(label),
        `the ${item.id} note calls ${id} "${label}", which is not its name`,
      );
    }
    const text = item.text.replace(LINK, '$1');
    assert.match(text, /^[A-Z[].*\.$/, `the ${item.id} note is not a sentence: ${text}`);
    assert.deepEqual(text.match(/[.!?]/g), ['.'], `the ${item.id} note is more than one sentence: ${text}`);
  }
  // The owner named five; the redact note names no tool, on purpose: none redacts.
  for (const id of ['compress', 'ocr', 'redact', 'edit-text', 'office'])
    assert(
      SEARCH_NOTES.some((item) => item.id === id),
      `no ${id} note`,
    );
  assert.doesNotMatch(
    SEARCH_NOTES.find((item) => item.id === 'redact').text,
    LINK,
    'the redact note names a tool',
  );
});

/** What a tool offers in words: its names, card copy and keywords. */
const offered = (item) =>
  ` ${searchWords([item.name, item.title, item.tab, ...(item.card || []), item.keywords].filter(Boolean).join(' ')).join(' ')} `;
/** The things the notes say the site can’t do that a tool's words offer. */
const claims = (item) =>
  SEARCH_NOTES.flatMap((note) => note.missing).filter((phrase) =>
    offered(item).includes(` ${searchWords(phrase).join(' ')} `),
  );

await test('notes: no tool offers what a note says the site can’t do', () => {
  for (const tool of TOOLS)
    assert.deepEqual(
      claims(tool),
      [],
      `${tool.id} offers what a note says no tool does: the note is no longer true`,
    );
  const missing = SEARCH_NOTES.flatMap((note) => note.missing);
  for (const phrase of ['compress', 'file size', 'ocr', 'redact', 'word'])
    assert(missing.includes(phrase), `no note forbids a tool to offer "${phrase}"`);
  // A tool that resizes pages may say so; one that claims to compress may not.
  const resize = {
    name: 'Resize pages',
    keywords: 'resize scale page size paper size a4 letter fit enlarge shrink',
  };
  assert.deepEqual(claims(resize), [], 'resizing pages counts as compressing');
  for (const [keywords, claim] of [
    ['compress', 'compress'],
    ['reduce file size', 'file size'],
    ['ocr scan', 'ocr'],
    ['redact', 'redact'],
    ['pdf to word', 'word'],
  ])
    assert(
      claims({ name: 'A tool', keywords }).includes(claim),
      `a tool with "${keywords}" may claim "${claim}"`,
    );
});

await test('notes: each search finds its own note; typing its start, or a tool’s name, finds none', () => {
  for (const item of SEARCH_NOTES)
    for (const search of item.words)
      assert.equal(
        noteFor(search.replaceAll('*', '')),
        item.id,
        `"${search}" does not bring the ${item.id} note`,
      );
  // While "compress" is typed, "c", "co", "com"... bring nothing (each is said to a screen reader).
  const triggers = SEARCH_NOTES.flatMap((item) => item.words.filter((search) => !search.includes(' ')));
  const whole = (word) =>
    triggers.some((trigger) =>
      trigger.endsWith('*') ? word.startsWith(trigger.slice(0, -1)) : word === trigger,
    );
  for (const trigger of triggers) {
    const word = trigger.replace('*', '');
    for (let length = 1; length < word.length; length++) {
      const start = word.slice(0, length);
      if (!whole(start))
        assert.equal(noteFor(start), null, `"${start}", the start of "${word}", brings a note`);
    }
  }
  for (const tool of TOOLS)
    for (const name of [tool.name, tool.title, tool.tab].filter(Boolean))
      assert.equal(noteFor(name), null, `"${name}" brings a note`);
  // Words a page-size tool will be found by bring no note.
  for (const query of ['resize', 'scale', 'page size', 'paper size', 'a4', 'letter', 'fit'])
    assert.equal(noteFor(query), null, `"${query}" brings a note`);
});

await test('notes: whole words, so no false alarms; the note for what was asked', () => {
  for (const query of [
    'password',
    'keywords',
    'document',
    'words',
    'edit',
    'edit pdf',
    'text',
    'add text',
    'signature',
    'sign',
    'scan',
    'convert',
    'images',
    'extract',
    'extract pages',
    'remove',
    'remove pages',
    'delete pages',
    'size',
    // On the way to "document", and any documents: not Word's.
    'doc',
    'docs',
    'merge docs',
  ])
    assert.equal(noteFor(query), null, `"${query}" brings a note`);
  for (const [query, id] of [
    ['compress my pdf', 'compress'],
    ['Compression', 'compress'],
    ['make it smaller', 'compress'],
    ['OCR', 'ocr'],
    ['scan to text', 'ocr'],
    ['scans to text', 'ocr'],
    ['redact names', 'redact'],
    ['black out a name', 'redact'],
    ['remove text', 'redact'],
    ['edit text', 'edit-text'],
    ['change the text', 'edit-text'],
    ['pdf to word', 'office'],
    ['Microsoft Word', 'office'],
    ['DOCX', 'office'],
    ['google docs', 'office'],
    ['pdf to doc', 'office'],
    ['doc to pdf', 'office'],
    ['convert doc', 'office'],
    // Two notes could answer: the first in the list does.
    ['compress word file', 'compress'],
    ['edit text in word', 'edit-text'],
    ['xlsx', 'office'],
    ['extract images', 'images-out'],
    ['bookmarks', 'bookmarks'],
    ['digitally sign', 'digital-signature'],
    ['certificate', 'digital-signature'],
    // What people type for the five things the owner named.
    ['shrink pdf', 'compress'],
    ['reduce file size', 'compress'],
    ['pdf size', 'compress'],
    ['resize pdf file', 'compress'],
    ['searchable pdf', 'ocr'],
    ['blackout', 'redact'],
    ['fix a typo', 'edit-text'],
    ['excel', 'office'],
    ['powerpoint', 'office'],
  ])
    assert.equal(noteFor(query), id, `"${query}" brings the wrong note`);
  // A size can be a page's: these bring the note and the Resize card under it.
  for (const query of ['pdf size', 'smaller pages', 'resize pdf file'])
    assert(found(query).includes('resize'), `"${query}" does not show Resize pages`);
  assert.deepEqual(found('a3 to a4'), ['resize'], '"a3 to a4" shows Resize pages');
});

// ---- What the site does not do, wherever a visitor reads of it ----------------------------

// The five the owner named. Changing one of these sentences is a decision, not a
// slip: a note that began "can’t" could go on to promise the thing.
const SAID = {
  compress:
    'QFT PDF can’t compress a PDF, but leaving out pages you don’t need, with [Delete pages](tool:delete) or [Split PDF](tool:split), can make the copy smaller.',
  ocr: 'QFT PDF can’t turn a scan into text (OCR): scanned pages stay pictures, which [JPG to PDF](tool:jpgtopdf) can put in a PDF but not make searchable.',
  redact:
    'QFT PDF can’t redact: what you add on top of a page, or crop away, only hides what is there, and it stays in the file.',
  'edit-text':
    'QFT PDF can’t change the text already in a PDF; [Add text](tool:text) puts new text on top of the page.',
  office:
    'QFT PDF can’t convert between PDF and Word, Excel or PowerPoint; to make a PDF from an Office file, save it as PDF in the app that made it.',
};
// A sentence that names one of these...
const NAMES = /\bcompress|\bOCR\b|\bsearchable\b|\bredact|\bWord\b|\bPowerPoint\b|\bExcel\b/;
// ...says that the site does not do it.
const DENIES = /can’t|cannot|doesn’t|does not|don’t|isn’t|\bnot\b|\bno\b/i;
/** The statements in a text as a visitor reads it: no markup, and no questions (a question claims nothing). */
const statements = (text) =>
  text
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&amp;', '&')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence && !sentence.endsWith('?'));
const dist = new URL('../dist/', import.meta.url);
const pageFiles = ['index.html', ...new Set(Object.values(TOOL_PAGES).map((slug) => `${slug}/index.html`))];
const pageText = Object.fromEntries(
  await Promise.all(pageFiles.map(async (name) => [name, await readFile(new URL(name, dist), 'utf8')])),
);
// What the editor says is in its modules, as text between quotes.
const moduleText = Object.fromEntries(
  await Promise.all(
    (await readdir(dist))
      .filter((name) => name.endsWith('.js'))
      .map(async (name) => [
        name,
        [
          ...(await readFile(new URL(name, dist), 'utf8')).matchAll(
            /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g,
          ),
        ]
          .map((match) => match[1] ?? match[2])
          .filter((literal) => literal.includes(' '))
          .join('\n'),
      ]),
  ),
);

await test('the five notes the owner named say what they said', () => {
  for (const [id, text] of Object.entries(SAID))
    assert.equal(SEARCH_NOTES.find((item) => item.id === id)?.text, text, `the ${id} note`);
});

await test('wherever a page or the editor names compressing, OCR, redacting or Word, it says the site does not do it', () => {
  let read = 0;
  for (const [name, text] of [...Object.entries(pageText), ...Object.entries(moduleText)])
    for (const sentence of text.split('\n').flatMap(statements)) {
      if (!NAMES.test(sentence)) continue;
      read++;
      assert.match(
        sentence,
        DENIES,
        `${name} names something the site does not do, without saying so: “${sentence}”`,
      );
    }
  assert(
    read >= 12,
    `only ${read} such sentences were read: is the reader still reading the pages and modules?`,
  );
  // The reader itself: a promise is caught, a denial and a question pass.
  const caught = (sentence) => statements(sentence).some((entry) => NAMES.test(entry) && !DENIES.test(entry));
  assert(caught('Yes. Resizing compresses the file.'));
  assert(caught('<p>QFT PDF reads the text in a picture (OCR).</p>'));
  assert(caught('Convert your PDF to Word here.'));
  assert(!caught('No. QFT PDF does not compress PDFs.'));
  assert(!caught('Can I convert PDF to Word?'));
  // Where a visitor would otherwise expect the thing, the page says it is not there.
  for (const [page, names] of [
    ['delete-pages-from-pdf', /can’t compress a PDF/],
    ['resize-pdf', /does not compress PDFs/],
    ['jpg-to-pdf', /can’t read the text in a picture \(OCR\)/],
    ['jpg-to-pdf', /Can I convert Word or PowerPoint files\?<\/summary><p>Not here\./],
    ['pdf-to-jpg', /Can I convert PDF to Word\?<\/summary><p>Not here\./],
    ['crop-pdf', /not a secure way to redact/],
    ['add-text-to-pdf', /not secure redaction/],
  ])
    assert.match(pageText[`${page}/index.html`], names, `the ${page} page no longer says it`);
  assert.match(
    moduleText['editor-core.js'],
    /QFT PDF doesn’t compress PDFs, read the text in scans \(OCR\), or convert to or from Word\./,
    'the help says what QFT PDF does not do',
  );
});
