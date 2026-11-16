/**
 * The interface's language, and its words (README, "Chinese"). A page states
 * its language in <html lang>: English pages are the default, and their Chinese
 * counterparts, under zh/, are written by scripts/build-pages.mjs. Code keeps
 * its English text and asks t() for it. On a Chinese page the Chinese catalog
 * (i18n-zh.js), which only Chinese pages load, gives the Chinese for each
 * English text; everywhere else (English pages, Node) the English is used as
 * it is. The export worker works in its page's language.
 *
 * A text names the values it takes as {name}: t('{count} pages', { count }).
 * English plurals are two texts (tn), which the catalog may give one Chinese.
 * tests/i18n.test.mjs reads every t(), tn() and userError() in the modules and
 * fails when the catalog lacks one, keeps one no module asks for, or names
 * other values than the English does.
 */

// A page says its language in <html lang>; the export worker, which has no
// page, is told its page's in its address (export-worker.js?lang=zh).
const declared = String(
  globalThis.document?.documentElement?.lang ||
    new URLSearchParams(globalThis.location?.search).get('lang') ||
    'en',
);
/** 'zh' on a Chinese page; 'en' everywhere else. */
export const LANGUAGE = /^zh(-|$)/i.test(declared) ? 'zh' : 'en';
/** How dates are written: in Chinese on a Chinese page, else as the browser writes them. */
export const LOCALE = LANGUAGE === 'zh' ? 'zh-CN' : undefined;
// Every module that imports this one waits for the catalog, so a module's own
// constants are in the page's language too.
const catalog = LANGUAGE === 'zh' ? await import('./i18n-zh.js') : null;

const IDEOGRAPH = /[\u3400-\u9fff\uf900-\ufaff]/;
const LATIN = /[A-Za-z]/;
/**
 * `text` with each {name} replaced by params[name]; a name without a value
 * stays as it is. Where a value that starts or ends with a Latin letter meets
 * a Chinese character of the text, a space goes between them, as the catalog
 * writes "打开 PDF": "因为{reasons}" with "PDF/A..." reads "因为 PDF/A...".
 * (The catalog writes the spaces around numbers itself, "第 {page} 页", and
 * leaves them out where a number is part of a file name, "-第{number}页".)
 * The value itself (a file name, say) is never changed.
 */
export function fill(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name, at) => {
    if (!(name in params)) return whole;
    const value = String(params[name]);
    const before = IDEOGRAPH.test(text[at - 1] || '') && LATIN.test(value[0] || '') ? ' ' : '';
    const after = IDEOGRAPH.test(text[at + whole.length] || '') && LATIN.test(value.at(-1) || '') ? ' ' : '';
    return before + value + after;
  });
}
/** The English `text` in the page's language, with its {values} filled. */
export function t(text, params) {
  return fill(catalog?.ZH[text] ?? text, params);
}
/** `one` when count is 1, `other` otherwise, through t(), with {count} filled. */
export function tn(count, one, other, params) {
  return t(count === 1 ? one : other, { count, ...params });
}
/**
 * Sentences (or lists of them) as one text, leaving out empty ones: a space
 * between sentences in English, none in Chinese, whose 。 ends a sentence.
 */
export function sentences(...parts) {
  return parts
    .flat()
    .filter(Boolean)
    .join(LANGUAGE === 'zh' ? '' : ' ');
}
/** Items as a list in a sentence: "a, b and c" in English, "a、b和c" in Chinese. */
export function listOf(items) {
  const [comma, and] = LANGUAGE === 'zh' ? ['、', '和'] : [', ', ' and '];
  return items.length > 1 ? items.slice(0, -1).join(comma) + and + items.at(-1) : (items[0] ?? '');
}
/**
 * A tool of routes.js in the page's language: on a Chinese page with its
 * name, title, tab label, card and search words from the catalog's TOOLS.
 */
export function localTool(item) {
  const chinese = item && catalog?.TOOLS[item.id];
  return chinese ? { ...item, ...chinese } : item;
}
/**
 * A search note of routes.js in the page's language: on a Chinese page with
 * the catalog's sentence (NOTES), and its Chinese searches beside the English.
 */
export function localNote(item) {
  const chinese = item && catalog?.NOTES[item.id];
  return chinese
    ? {
        ...item,
        text: chinese.text,
        words: [...item.words, ...chinese.words],
        missing: [...item.missing, ...chinese.missing],
      }
    : item;
}
/** A long passage of HTML in the page's language: the catalog's, by name, or the English given. */
export function passage(name, english) {
  return catalog?.PASSAGES[name] ?? english;
}
/**
 * An error a visitor reads, in the page's language. It keeps its English text
 * and values (localMessage). `options` as for Error: { cause }.
 */
export function userError(text, params, options) {
  return Object.assign(new Error(t(text, params), options), { text, params });
}
/** What an error says, in the page's language. */
export function localMessage(error) {
  return error?.text ? t(error.text, error.params) : error?.message;
}

/** Where the visitor's choice of language is kept (language.js reads it before a page shows). */
export const LANGUAGE_KEY = 'qft-pdf-language';
/**
 * A page's address under the site's root (`root`, ending in "/"), in a
 * language: `page` is "" for the home page or a tool's slug.
 */
export function pageAddress(root, page, language = LANGUAGE) {
  return root + (language === 'zh' ? 'zh/' : '') + (page ? page + '/' : '');
}
