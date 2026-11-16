/**
 * The page template's words in another language (scripts/build-pages.mjs). The
 * template is dist/index.html; a language's dictionary maps each of its English
 * texts to its own (scripts/pages/shell-zh.mjs). Translated: every text between
 * tags, and every aria-label, title, placeholder and alt. Left alone: the
 * scripts, styles, icons and templates, and the regions that are written from
 * other sources (the head's metadata from content, the tool cards, menu and
 * tabs from the registry, the module links from the module graph).
 *
 * A text without its translation stops the build, and so does a translation
 * that no text asks for: the template and the dictionary change together.
 */

// Regions written from elsewhere: <!-- name --> ... <!-- /name -->.
const WRITTEN_ELSEWHERE = ['page:meta', 'tools:cards', 'tools:menu', 'tools:tabs', 'modules:preload'];
// Elements whose content is not text a visitor reads.
const RAW = /^<(script|style|svg|template)\b/i;
const ATTRIBUTES = /(\s(?:aria-label|title|placeholder|alt)=")([^"]*)(")/g;
// A piece of the template: a comment, a raw element, a tag, or text.
const PIECES = /<!--[\s\S]*?-->|<(script|style|svg|template)\b[\s\S]*?<\/\1>|<[^>]*>|[^<]+/gi;

/** Whether a text has words to translate: letters, beyond names that stay as they are. */
const wordy = (text, same) => /[A-Za-z]/.test(text) && !same.has(text);

/**
 * The template with each text passed through `translate(text)` (its trimmed
 * form; the spaces around it stay), outside the regions written elsewhere.
 */
function eachText(html, translate) {
  let skipping = null;
  return html.replace(PIECES, (piece) => {
    if (piece.startsWith('<!--')) {
      const name = piece.match(/^<!--\s*(\/?)([\w:-]+)\s*-->$/);
      if (name && WRITTEN_ELSEWHERE.includes(name[2])) skipping = name[1] ? null : name[2];
      return piece;
    }
    if (skipping || RAW.test(piece)) return piece;
    if (piece.startsWith('<'))
      return piece.replace(ATTRIBUTES, (all, open, value, close) => open + translate(value) + close);
    const text = piece.trim();
    return text ? piece.replace(text, translate(text)) : piece;
  });
}

/** The English texts of the template that a translation must give, in order, each once. */
export function shellTexts(html, same = new Set()) {
  const found = [];
  eachText(html, (text) => {
    if (wordy(text, same) && !found.includes(text)) found.push(text);
    return text;
  });
  return found;
}

// Chinese, and its punctuation; the inline tags a heading puts between its words.
const CHINESE = '\\p{Script=Han}，。、：；！？“”‘’（）《》…—';
const INLINE = '<\\/?(?:br|em|strong)\\b[^>]*>';
const SPACED = new RegExp(
  `([${CHINESE}])((?:${INLINE})*) +((?:${INLINE})*)(?=[${CHINESE}]|(?:${INLINE})+[${CHINESE}])`,
  'gu',
);
/**
 * Chinese without the spaces the template puts between its words: where two
 * Chinese texts meet across <br> or <em>, "从打开<br> 到 <em>完成。</em>" reads
 * "从打开<br>到<em>完成。</em>". A space beside a Latin word stays, and so does
 * a line break between elements.
 */
export function withoutSpacesBetweenChinese(html) {
  return html.replace(SPACED, '$1$2$3');
}

/**
 * The template in another language: `dictionary` maps each English text to
 * its translation; `same` lists texts that stay as they are (QFT PDF). Throws,
 * naming them, when a text has no translation or a translation no text.
 */
export function localizeShell(html, dictionary, same = new Set()) {
  const missing = [],
    used = new Set();
  const localized = eachText(html, (text) => {
    if (!wordy(text, same)) return text;
    if (!Object.hasOwn(dictionary, text)) {
      missing.push(text);
      return text;
    }
    used.add(text);
    return dictionary[text];
  });
  const unused = Object.keys(dictionary).filter((text) => !used.has(text));
  if (missing.length || unused.length)
    throw new Error(
      [
        missing.length && `These texts of index.html have no translation:\n  ${missing.join('\n  ')}`,
        unused.length && `These translations match no text of index.html:\n  ${unused.join('\n  ')}`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  return localized;
}
