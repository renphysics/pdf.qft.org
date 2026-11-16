/**
 * The interface's language, and its words (README, "Chinese"). A page states
 * its language in <html lang>: English pages are the default, and their Chinese
 * counterparts, under zh/, are written by scripts/build-pages.mjs. Code keeps
 * its English text and asks t() for it. On a Chinese page the Chinese catalog
 * (i18n-zh.js), which only Chinese pages load, gives the Chinese for each
 * English text; everywhere else (English pages, the export worker, Node) the
 * English is used as it is.
 *
 * A text names the values it takes as {name}: t('{count} pages', { count }).
 * English plurals are two texts (tn), which the catalog may give one Chinese.
 * tests/i18n.test.mjs reads every t(), tn() and userError() in the modules and
 * fails when the catalog lacks one, keeps one no module asks for, or names
 * other values than the English does.
 */

const declared = String(globalThis.document?.documentElement?.lang || 'en');
/** 'zh' on a Chinese page; 'en' everywhere else. */
export const LANGUAGE = /^zh(-|$)/i.test(declared) ? 'zh' : 'en';
// Every module that imports this one waits for the catalog, so a module's own
// constants are in the page's language too.
const catalog = LANGUAGE === 'zh' ? await import('./i18n-zh.js') : null;

/** `text` with each {name} replaced by params[name]; a name without a value stays as it is. */
export function fill(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole));
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
 * A tool of routes.js in the page's language: on a Chinese page with its
 * name, title, tab label, card and search words from the catalog's TOOLS.
 */
export function localTool(item) {
  const chinese = item && catalog?.TOOLS[item.id];
  return chinese ? { ...item, ...chinese } : item;
}
/** A long passage of HTML in the page's language: the catalog's, by name, or the English given. */
export function passage(name, english) {
  return catalog?.PASSAGES[name] ?? english;
}
/**
 * An error a visitor reads. It keeps its English text and values, so that one
 * thrown in the export worker, which works in English, is shown in the page's
 * language (localMessage).
 */
export function userError(text, params) {
  return Object.assign(new Error(t(text, params)), { text, params });
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
