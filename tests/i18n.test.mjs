// The Chinese version (README, "Chinese"): the catalog of the interface's words
// (dist/i18n-zh.js) against what the modules ask for, the registry's and the
// tool pages' Chinese against their English, and the small script that keeps
// the visitor's choice of language (dist/language.js).
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { LANGUAGE, LANGUAGE_KEY, fill, localMessage, pageAddress, t, tn, userError } from '../dist/i18n.js';
import { PASSAGES, TOOLS as TOOLS_ZH, ZH } from '../dist/i18n-zh.js';
import { TOOLS } from '../dist/routes.js';
import { PAGES } from '../scripts/pages/content.mjs';
import { HOME_ZH, PAGES_ZH, WORDS_ZH } from '../scripts/pages/content-zh.mjs';

const dist = new URL('../dist/', import.meta.url);
const modules = Object.fromEntries(
  await Promise.all(
    (await readdir(dist))
      .filter((name) => name.endsWith('.js') && !name.startsWith('i18n'))
      .map(async (name) => [name, await readFile(new URL(name, dist), 'utf8')]),
  ),
);

/**
 * Each call of t(), tn(), userError() and passage() in a module: its name, its
 * arguments as written, and its line.
 */
function calls(source) {
  const found = [];
  for (const match of source.matchAll(/(?<![\w.$])(t|tn|userError|passage)\(/g)) {
    const args = [];
    let depth = 0,
      quote = null,
      start = match.index + match[0].length,
      at = start;
    for (; at < source.length; at++) {
      const char = source[at];
      if (quote) {
        if (char === '\\') at++;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === "'" || char === '"' || char === '`') quote = char;
      else if ('([{'.includes(char)) depth++;
      else if (')]}'.includes(char)) {
        if (depth === 0) break;
        depth--;
      } else if (char === ',' && depth === 0) {
        args.push(source.slice(start, at).trim());
        start = at + 1;
      }
    }
    args.push(source.slice(start, at).trim());
    found.push({
      name: match[1],
      args: args.filter(Boolean),
      line: source.slice(0, match.index).split('\n').length,
    });
  }
  return found;
}
/** A string literal's value, or undefined when the argument is not one (a template literal with ${} is not). */
function literal(argument) {
  if (!/^(['"])(?:[^\\]|\\.)*?\1$/s.test(argument) && !/^`(?:[^`\\$]|\\.)*`$/s.test(argument))
    return undefined;
  return new Function(`return ${argument};`)();
}
/** Every English text the modules ask the catalog for, with where each is asked. */
const asked = new Map();
const problems = [];
for (const [name, source] of Object.entries(modules))
  for (const call of calls(source)) {
    const where = `${name}:${call.line}`;
    const texts =
      call.name === 'tn' ? call.args.slice(1, 3) : call.name === 'passage' ? [] : call.args.slice(0, 1);
    for (const argument of texts) {
      const text = literal(argument);
      if (text === undefined)
        problems.push(`${where}: ${call.name}() is given ${argument}, not the text itself`);
      else asked.set(text, [...(asked.get(text) || []), where]);
    }
    if (call.name === 'passage' && !Object.hasOwn(PASSAGES, literal(call.args[0]) ?? ''))
      problems.push(`${where}: passage ${call.args[0]} has no Chinese`);
  }
const names = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

await test('every text the modules show is asked for as itself, so it can be found and translated', () => {
  assert.deepEqual(problems, []);
  assert(asked.size >= 25, `only ${asked.size} texts were found: is the reader still reading the modules?`);
});

await test('the Chinese catalog has every text the modules ask for, and nothing else', () => {
  const missing = [...asked.keys()].filter((text) => !Object.hasOwn(ZH, text));
  assert.deepEqual(
    missing.map((text) => `${asked.get(text)[0]}: ${text}`),
    [],
    'these texts have no Chinese in dist/i18n-zh.js',
  );
  const unused = Object.keys(ZH).filter((text) => !asked.has(text));
  assert.deepEqual(unused, [], 'dist/i18n-zh.js has Chinese for texts no module asks for');
});

await test('each Chinese text names the same values as its English, and is Chinese', () => {
  for (const [english, chinese] of Object.entries(ZH)) {
    assert.deepEqual(names(chinese), names(english), `the values of “${english}”: ${chinese}`);
    // A copy of the English is a text left untranslated (a title of the form “{tool} · QFT PDF” is not).
    assert(chinese !== english || !/[A-Za-z]{2}/.test(english), `“${english}” is not translated`);
  }
  for (const [name, html] of Object.entries(PASSAGES))
    assert.match(html, /[一-鿿]/, `the ${name} passage is not translated`);
});

await test('in English, as in Node and in the export worker, t() gives the English with its values', () => {
  assert.equal(LANGUAGE, 'en');
  assert.equal(t('Page {page} of {total}', { page: 2, total: 9 }), 'Page 2 of 9');
  assert.equal(fill('{a} and {b}', { a: 1 }), '1 and {b}', 'a value not given stays as it is');
  assert.equal(tn(1, '{count} page', '{count} pages'), '1 page');
  assert.equal(tn(3, '{count} page', '{count} pages'), '3 pages');
  // An error keeps its English and values, so the page can say it in its own language.
  const error = userError('Page {page} is missing.', { page: 4 });
  assert.equal(error.message, 'Page 4 is missing.');
  assert.deepEqual([error.text, error.params], ['Page {page} is missing.', { page: 4 }]);
  const sent = structuredClone({ message: error.message, text: error.text, params: error.params });
  assert.equal(localMessage(Object.assign(new Error(sent.message), sent)), 'Page 4 is missing.');
  assert.equal(localMessage(new Error('plain')), 'plain');
  assert.equal(pageAddress('/pdf.qft.org/', 'merge-pdf', 'zh'), '/pdf.qft.org/zh/merge-pdf/');
  assert.equal(pageAddress('/', '', 'en'), '/');
});

await test('every tool has its Chinese name, tab label, card and keywords', () => {
  assert.deepEqual(
    Object.keys(TOOLS_ZH),
    TOOLS.map((tool) => tool.id),
    'i18n-zh.js has Chinese for each tool of routes.js, in its order, and for no other',
  );
  for (const tool of TOOLS) {
    const zh = TOOLS_ZH[tool.id];
    assert(zh.name, `${tool.id} has no Chinese name`);
    assert.equal(Boolean(zh.tab), Boolean(tool.tab), `${tool.id}: a Chinese tab label when it has a tab`);
    assert.equal(Boolean(zh.title), Boolean(tool.title), `${tool.id}: a Chinese title when it has a title`);
    if (tool.card) {
      assert.equal(zh.card?.length, tool.card.length, `${tool.id}: its Chinese card`);
      assert(zh.keywords, `${tool.id} has no Chinese keywords`);
    } else assert(!zh.card && !zh.keywords, `${tool.id} has no card, so no Chinese card`);
    for (const text of [zh.name, zh.title, zh.tab, ...(zh.card || [])].filter(Boolean))
      assert.match(text, /[一-鿿]/, `${tool.id}: “${text}” is not Chinese`);
  }
});

await test('each Chinese tool page says what its English page says: the same steps, the same questions', () => {
  assert.deepEqual(
    PAGES_ZH.map((page) => page.tool),
    PAGES.map((page) => page.tool),
    'the same tools, in the same order',
  );
  for (const [index, page] of PAGES.entries()) {
    const zh = PAGES_ZH[index];
    assert.equal(zh.steps.length, page.steps.length, `${page.tool}: its steps`);
    assert.equal(zh.faqs.length, page.faqs.length, `${page.tool}: its questions`);
    assert.deepEqual(
      Object.keys(zh.upload || {}),
      Object.keys(page.upload || {}),
      `${page.tool}: its upload card`,
    );
    for (const key of ['batchShortcut', 'sample']) assert.equal(zh[key], page[key], `${page.tool}: ${key}`);
    assert(zh.title.endsWith(' · QFT PDF'), `${page.tool}: its title ends with the brand`);
    // Links to other tools, by their Chinese names.
    const links = (text) => [...text.matchAll(/\[([^\]]+)\]\(tool:([a-z]+)\)/g)];
    for (const [english, chinese] of page.faqs.map((faq, at) => [faq, zh.faqs[at]])) {
      assert.deepEqual(
        links(chinese[1]).map((link) => link[2]),
        links(english[1]).map((link) => link[2]),
        `${page.tool}: “${chinese[0]}” links to the tools its English does`,
      );
      for (const [, label, id] of links(chinese[1])) {
        const tool = TOOLS.find((item) => item.id === id);
        assert(
          [TOOLS_ZH[tool.id].title, TOOLS_ZH[tool.id].name].includes(label),
          `${page.tool}: [${label}] is not ${id}’s Chinese name`,
        );
      }
    }
  }
  for (const text of [...Object.values(HOME_ZH), ...Object.values(WORDS_ZH)])
    assert.match(text, /[一-鿿]/, `“${text}” is not Chinese`);
});

// ---- language.js, in a pretend browser ----------------------------------------------------

const script = await readFile(new URL('language.js', dist), 'utf8');
/**
 * language.js run on `path` under the site's `root`, with `stored` as the kept
 * choice: where it sent the page, and what a click on a language link did.
 */
function visit(path, stored = null, { root = '/', search = '', hash = '' } = {}) {
  const storage = new Map(stored ? [[LANGUAGE_KEY, stored]] : []);
  const went = [];
  const listeners = {};
  const window = {
    location: {
      pathname: path,
      search,
      hash,
      replace: (to) => went.push(['replace', to]),
      assign: (to) => went.push(['assign', to]),
    },
    history: { state: null, replaceState: (state, title, to) => went.push(['shown', to]) },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  };
  const document = {
    currentScript: { src: `https://example.org${root}language.js?v=0123456789ab` },
    addEventListener: (type, listener) => (listeners[type] = listener),
  };
  vm.runInNewContext(script, { window, document, URL });
  /** An event of `type` (a click by default) on a link to `language`; the event's own fields as given. */
  const press = (language, fields = {}, type = 'click') => {
    const link = {
      getAttribute: (name) => (name === 'data-language' ? language : null),
      setAttribute: (name, value) => (link[name] = value),
    };
    const event = {
      target: { closest: (selector) => (selector === 'a[data-language]' ? link : null) },
      button: 0,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...fields,
    };
    listeners[type]?.(event);
    return Object.assign(event, { link });
  };
  return { went, stored: () => storage.get(LANGUAGE_KEY) ?? null, press };
}

await test('a language link opened another way than a click keeps the choice it names, and the address loses it', () => {
  // "Open link in new tab" from the English link, with 中文 chosen: English, now chosen.
  const tab = visit('/merge-pdf/', 'zh', { search: '?language=en' });
  assert.deepEqual(tab.went, [['shown', '/merge-pdf/']]);
  assert.equal(tab.stored(), 'en');
  const chinese = visit('/zh/crop-pdf/', 'en', { search: '?a=1&language=zh&b=2', hash: '#tools' });
  assert.deepEqual(chinese.went, [['shown', '/zh/crop-pdf/?a=1&b=2#tools']]);
  assert.equal(chinese.stored(), 'zh');
  // Only a language of the site counts.
  assert.deepEqual(visit('/merge-pdf/', 'zh', { search: '?language=fr' }).went, [
    ['replace', '/zh/merge-pdf/?language=fr'],
  ]);
});

await test('language.js keeps the same name for the choice as i18n.js', () => {
  assert.match(script, new RegExp(`var KEY = '${LANGUAGE_KEY}';`));
});

await test('English is the default: nothing guesses the language, and an English page stays English', () => {
  for (const path of ['/', '/merge-pdf/', '/index.html'])
    assert.deepEqual(visit(path).went, [], `${path}, nothing chosen`);
  assert.deepEqual(visit('/merge-pdf/', 'en').went, [], 'English chosen');
});

await test('chosen Chinese is remembered: an English page goes to its Chinese counterpart before it shows', () => {
  assert.deepEqual(visit('/', 'zh').went, [['replace', '/zh/']]);
  assert.deepEqual(visit('/crop-pdf/', 'zh', { search: '?a=1', hash: '#tools' }).went, [
    ['replace', '/zh/crop-pdf/?a=1#tools'],
  ]);
  assert.deepEqual(visit('/pdf.qft.org/merge-pdf/', 'zh', { root: '/pdf.qft.org/' }).went, [
    ['replace', '/pdf.qft.org/zh/merge-pdf/'],
  ]);
  // A Chinese address shows Chinese, whatever was chosen: it was asked for.
  assert.deepEqual(visit('/zh/merge-pdf/', 'en').went, []);
  assert.deepEqual(visit('/zh/', null).went, []);
});

await test('the language link remembers the choice and leads to the counterpart of the page as it is now', () => {
  // The editor changed the address to another tool's: the link follows the address.
  const english = visit('/crop-pdf/');
  const event = english.press('zh');
  assert.equal(english.stored(), 'zh');
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(english.went, [['assign', '/zh/crop-pdf/']]);
  const chinese = visit('/zh/merge-pdf/', 'zh');
  chinese.press('en');
  assert.equal(chinese.stored(), 'en');
  assert.deepEqual(chinese.went, [['assign', '/merge-pdf/']]);
  // Opened in a new tab: remembered, and the browser opens the link's own address.
  const tab = visit('/');
  assert.equal(tab.press('zh', { ctrlKey: true }).defaultPrevented, false);
  assert.equal(tab.stored(), 'zh');
  assert.deepEqual(tab.went, []);
  // Its address names its language, kept up to date before the link is opened in
  // a new tab from its menu, or copied.
  for (const type of ['pointerover', 'pointerdown', 'focusin', 'contextmenu']) {
    const menu = visit('/zh/merge-pdf/', 'zh', { search: '?a=1', hash: '#faq-title' });
    assert.equal(menu.press('en', {}, type).link.href, '/merge-pdf/?a=1&language=en#faq-title', type);
    assert.equal(menu.stored(), 'zh', `${type} chooses nothing`);
  }
  // A middle click opens it in a new tab, and is a choice as a click is.
  const middle = visit('/zh/merge-pdf/', 'zh');
  middle.press('en', { button: 1 }, 'auxclick');
  assert.equal(middle.stored(), 'en');
  assert.deepEqual(middle.went, []);
  // The editor asked first (unsaved work) and the visitor stayed: nothing changes.
  const stay = visit('/merge-pdf/');
  stay.press('zh', { defaultPrevented: true });
  assert.equal(stay.stored(), null);
  assert.deepEqual(stay.went, []);
});
