/**
 * The tools, in the order they are shown everywhere: on the home page's cards,
 * in the editor's tool menu, in the phone's tab bar. Each has an id, the
 * address of its page (a tool without a page of its own shares one), its name
 * (the menu, the panel's title and its card), its tab label (null: not in the
 * editor's menu), an icon (a symbol in index.html) and, for a card on the home
 * page, its two lines of copy, category, colour and search keywords.
 * scripts/build-pages.mjs writes the cards, the menu and the tabs into
 * index.html from this list and generates one page per address, and the editor
 * names tools from it, so a tool is described once. Keep slugs stable: people
 * bookmark them and search engines index them.
 */
const tool = (id, slug, name, tab, icon, extra = {}) =>
  Object.freeze({ id, slug, name, tab, icon, ...extra });

export const TOOLS = Object.freeze([
  tool('text', 'add-text-to-pdf', 'Add text', 'Text', 'text', {
    title: 'Add text & images',
    category: 'edit',
    color: 'sage',
    card: ['A note, a logo, a final thought.', 'Make your mark on the page.'],
    keywords: 'note label caption type write image picture logo highlight',
  }),
  tool('image', 'add-text-to-pdf', 'Add an image', 'Image', 'image'),
  tool('highlight', 'add-text-to-pdf', 'Highlight', 'Highlight', 'highlight'),
  tool('signature', 'sign-pdf', 'Sign PDF', 'Sign', 'sign', {
    category: 'edit',
    color: 'blue',
    card: ['Draw, type or upload your signature.', 'Place it on one page or every page.'],
    keywords: 'add signature e-sign esign electronic fill',
  }),
  tool('form', 'fill-pdf-form', 'Fill form', 'Form', 'form', {
    category: 'edit',
    color: 'lavender',
    card: ['Type into a form’s fields and tick its boxes.', 'Keep it fillable or flatten it.'],
    keywords: 'form fillable fields fill in checkbox application',
  }),
  tool('properties', 'edit-pdf-metadata', 'Document properties', 'Properties', 'info', {
    category: 'edit',
    color: 'pink',
    card: ['Change the title, author and other details.', 'Or remove them before you share.'],
    keywords: 'metadata properties title author subject keywords language privacy remove details',
  }),
  tool('draw', 'draw-on-pdf', 'Draw', 'Draw', 'draw', {
    category: 'edit',
    color: 'sand',
    card: ['Draw with a pen, or add lines, arrows', 'and shapes to mark up a page.'],
    keywords: 'draw drawing pen annotate markup sketch line arrow rectangle circle ellipse shape',
  }),
  tool('watermark', 'add-watermark-to-pdf', 'Watermark', 'Watermark', 'watermark', {
    category: 'automate',
    color: 'lavender',
    card: ['Give every page a subtle stamp', 'with text, color, and transparency.'],
    keywords: 'add draft confidential stamp mark',
  }),
  tool('footer', 'add-header-and-footer-to-pdf', 'Headers & footers', 'Headers', 'footer', {
    category: 'automate',
    color: 'peach',
    card: ['Your name, your project, your details.', 'In the same place on every page.'],
    keywords: 'add header footer title date name running',
  }),
  tool('numbers', 'add-page-numbers-to-pdf', 'Page numbers', 'Numbers', 'number', {
    category: 'automate',
    color: 'pink',
    card: ['A little order goes a long way.', 'Custom numbers from start to finish.'],
    keywords: 'add numbering pagination',
  }),
  tool('pages', 'organize-pdf', 'Organize pages', 'Organize', 'pages', {
    category: 'organize',
    color: 'sand',
    card: ['Reorder, rotate, remove, or extract', 'just the pages you need.'],
    keywords:
      'add insert reorder rearrange arrange sort order organise rotate extract reverse interleave blank duplicate move',
  }),
  tool('delete', 'delete-pages-from-pdf', 'Delete pages', 'Delete', 'trash', {
    category: 'organize',
    color: 'peach',
    card: ['Leave out what you don’t need.', 'Select pages, delete, and save.'],
    keywords: 'remove',
  }),
  tool('crop', 'crop-pdf', 'Crop PDF', 'Crop', 'crop', {
    category: 'edit',
    color: 'sage',
    card: ['A little less around the edges.', 'Trim margins with a live preview.'],
    keywords: 'trim',
  }),
  tool('margins', 'add-margins-to-pdf', 'Add margins', 'Margins', 'margins', {
    category: 'edit',
    color: 'lavender',
    card: ['A little more room around the edges.', 'Space for notes, binding or punching.'],
    keywords: 'space notes binding punch',
  }),
  tool('resize', 'resize-pdf', 'Resize pages', 'Resize', 'resize', {
    category: 'edit',
    color: 'peach',
    card: ['Every page on A4 or Letter paper.', 'Scaled to fit, with nothing cut off.'],
    keywords:
      'change page size paper a4 a3 a5 legal us letter scale fit enlarge larger bigger shrink smaller standard print mixed sizes file',
  }),
  tool('merge', 'merge-pdf', 'Merge PDFs', 'Merge', 'merge', {
    category: 'organize',
    color: 'blue',
    card: ['Bring a few things together.', 'One document, all in order.'],
    keywords: 'combine join append',
  }),
  tool('split', 'split-pdf', 'Split PDF', 'Split', 'split', {
    category: 'organize',
    color: 'blue',
    card: ['Separate pages, chapters, or ranges.', 'Download them together as a ZIP.'],
    keywords: 'separate chapters',
  }),
  tool('sheets', 'pdf-pages-per-sheet', 'Pages per sheet', 'Sheets', 'sheets', {
    category: 'organize',
    color: 'sand',
    card: ['Two or four pages on each sheet.', 'Handouts that print sharp.'],
    keywords: 'handout 2-up 4-up n-up booklet print',
  }),
  tool('jpgtopdf', 'jpg-to-pdf', 'JPG to PDF', 'JPG to PDF', 'to-pdf', {
    category: 'organize',
    color: 'pink',
    card: ['Photos and pictures as PDF pages.', 'A4, Letter or their own size.'],
    keywords: 'png jpeg image picture photo scan convert',
  }),
  tool('pdftojpg', 'pdf-to-jpg', 'PDF to JPG', 'PDF to JPG', 'to-picture', {
    category: 'organize',
    color: 'peach',
    card: ['Every page as a picture.', 'JPG or PNG, in a ZIP.'],
    keywords: 'png jpeg image picture convert export',
  }),
  tool('protect', 'protect-pdf', 'Protect PDF', 'Protect', 'lock', {
    category: 'organize',
    color: 'lavender',
    card: ['Keep it for the right eyes.', 'Add a password to open your PDF.'],
    keywords: 'password encrypt secure lock',
  }),
  tool('unlock', 'unlock-pdf', 'Unlock PDF', 'Unlock', 'unlock', {
    category: 'organize',
    color: 'sand',
    card: ['Know the password? Leave it behind.', 'Save a copy that opens freely.'],
    keywords: 'password decrypt remove restrictions',
  }),
  tool('batch', 'batch-edit-pdf', 'Batch & presets', null, 'batch', {
    category: 'automate',
    color: 'sage',
    card: ['One setup, many PDFs.', 'Save your settings and process them together.'],
    keywords: 'batch bulk preset many files',
  }),
]);

/** Each tool's address (the slug of its page). The app shows it while the tool is in use. */
export const TOOL_PAGES = Object.freeze(Object.fromEntries(TOOLS.map((item) => [item.id, item.slug])));

/** The words of a text, for the tool search: lowercase letters and digits, "e-sign" as "e" and "sign". */
export const searchWords = (text) =>
  String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
// Words that name no tool: "merge pdf" and "pdf to jpg" find what "merge" and "jpg" find.
const COMMON = new Set('pdf pdfs a an the my to from of in on for and with'.split(' '));
/** What the search reads for a tool: the name and copy on its card, and its keywords. */
export const searchText = (item) =>
  [item.title || item.name, ...(item.card || []), item.keywords || ''].join(' ');
// What a typed word may add to a card's word: "merging", "merged" and "merger"
// find "merge", "rotation" finds "rotate", "cropping" finds "crop".
const ENDINGS = ['ing', 'ings', 'ion', 'ions', 'ed', 'er', 'ers', 'or', 'ors'];
const ending = (rest) => ENDINGS.some((whole) => whole.startsWith(rest));
/**
 * Whether a typed word is a card's word with such an ending, whole or still
 * being typed (so the card stays while "splitting" is typed past "split").
 * Before the ending, the card's word may lose a final "e" ("merg-ing") or
 * double its last letter ("crop-p-ing"). Words of fewer than three letters
 * take no ending: "a" is not found by "aed".
 */
function inflects(word, found) {
  for (const base of found.endsWith('e') ? [found, found.slice(0, -1)] : [found]) {
    if (base.length < 3 || word.length <= base.length || !word.startsWith(base)) continue;
    const rest = word.slice(base.length);
    if (ending(rest) || (rest[0] === base.at(-1) && ending(rest.slice(1)))) return true;
  }
  return false;
}
/**
 * Whether the words typed (searchWords) find a text, such as a card's
 * (searchText, with its category's name). Each typed word must be the start of
 * one of its words, so "word" does not find "password", and words that name no
 * tool are left out. A word ending in a single "s" also counts without it
 * ("pages" finds "Page numbers"), and a word of the text counts with a verb's
 * or a noun's ending (inflects).
 */
export function searchFinds(typed, text) {
  const own = searchWords(text);
  return typed
    .filter((word) => !COMMON.has(word))
    .every((word) => {
      const single = word.length > 3 && /[^s]s$/.test(word) ? word.slice(0, -1) : word;
      return own.some((found) => found.startsWith(word) || found.startsWith(single) || inflects(word, found));
    });
}

/**
 * What the tool search says where the site has no tool for what was typed: one
 * true sentence each, naming the nearest tool where it helps ([label](tool:id),
 * the links of scripts/pages/content.mjs). `words` are the searches that bring
 * it: each is one or more words that must all be typed, whole, or as the start
 * of a typed word where they end in "*" ("compress*" also finds "compression";
 * "word" is not found in "password"). `missing` names
 * what no tool does: tests/search.test.mjs fails when a tool's name, copy or
 * keywords come to offer it, so that the sentence goes when the tool comes.
 */
const note = (id, words, text, missing) => Object.freeze({ id, words, text, missing });
export const SEARCH_NOTES = Object.freeze([
  note(
    'compress',
    [
      'compress*',
      'shrink*',
      'smaller',
      'optimi*',
      'reduce size',
      'reduce file',
      'file size',
      'pdf size',
      'resize file*',
      'downsiz*',
    ],
    'QFT PDF can’t compress a PDF, but leaving out pages you don’t need, with [Delete pages](tool:delete) or [Split PDF](tool:split), can make the copy smaller.',
    ['compress', 'compression', 'optimize', 'file size'],
  ),
  note(
    'ocr',
    ['ocr', 'searchable', 'recogni*', 'scan text', 'scan* to text', 'text recogni*'],
    'QFT PDF can’t turn a scan into text (OCR): scanned pages stay pictures, which [JPG to PDF](tool:jpgtopdf) can put in a PDF but not make searchable.',
    ['ocr', 'searchable', 'text recognition'],
  ),
  note(
    'redact',
    [
      'redact*',
      'black out',
      'blackout',
      'censor*',
      'remove text',
      'hide text',
      'delete text',
      'erase*',
      'white out',
      'whiteout',
      'anonymi*',
    ],
    'QFT PDF can’t redact: what you add on top of a page, or crop away, only hides what is there, and it stays in the file.',
    ['redact', 'redaction', 'black out', 'censor'],
  ),
  note(
    'edit-text',
    [
      'edit text',
      'change text',
      'replace text',
      'modify text',
      'fix text',
      'correct text',
      'edit words',
      'change words',
      'typo*',
      'rewrite',
      'edit existing',
    ],
    'QFT PDF can’t change the text already in a PDF; [Add text](tool:text) puts new text on top of the page.',
    ['edit text', 'change text', 'replace text', 'edit existing'],
  ),
  note(
    'office',
    // "doc" and "docs" only beside another word: alone they are typed on the way
    // to "document", and "docs" may mean any documents.
    [
      'word',
      'docx',
      'to doc',
      'convert* doc',
      'doc file*',
      'google docs',
      'excel',
      'xls*',
      'powerpoint',
      'ppt*',
      'office',
      'odt',
      'rtf',
    ],
    'QFT PDF can’t convert between PDF and Word, Excel or PowerPoint; to make a PDF from an Office file, save it as PDF in the app that made it.',
    ['word', 'docx', 'excel', 'powerpoint'],
  ),
  note(
    'images-out',
    ['extract image*', 'extract picture*', 'extract photo*', 'image* out', 'picture* out'],
    'QFT PDF can’t take the pictures out of a PDF; [PDF to JPG](tool:pdftojpg) saves whole pages as pictures.',
    ['extract images', 'extract pictures'],
  ),
  note(
    'bookmarks',
    ['bookmark*', 'outline', 'table of contents', 'toc'],
    'QFT PDF can’t add or edit bookmarks, except that [Merge PDFs](tool:merge) can give each PDF it combines a bookmark of its own.',
    ['bookmark', 'bookmarks', 'outline'],
  ),
  note(
    'digital-signature',
    ['digital signature*', 'digital sign*', 'digitally', 'certif*'],
    '[Sign PDF](tool:signature) places a picture of your signature; QFT PDF can’t add a certificate-based digital signature.',
    ['digital signature', 'certificate'],
  ),
]);
const wordMatches = (wanted, typed) =>
  wanted.endsWith('*') ? typed.startsWith(wanted.slice(0, -1)) : typed === wanted;
/** The note for the words typed (searchWords), or null: the first whose search is all there. */
export function searchNote(typed) {
  return (
    SEARCH_NOTES.find((item) =>
      item.words.some((search) =>
        search.split(' ').every((wanted) => typed.some((word) => wordMatches(wanted, word))),
      ),
    ) || null
  );
}
