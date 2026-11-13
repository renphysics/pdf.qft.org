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
    keywords: 'signature e-sign esign fill',
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
    keywords: 'draw pen annotate markup sketch line arrow rectangle circle ellipse shape',
  }),
  tool('watermark', 'add-watermark-to-pdf', 'Watermark', 'Watermark', 'watermark', {
    category: 'automate',
    color: 'lavender',
    card: ['Give every page a subtle stamp', 'with text, color, and transparency.'],
    keywords: 'draft confidential stamp',
  }),
  tool('footer', 'add-header-and-footer-to-pdf', 'Headers & footers', 'Headers', 'footer', {
    category: 'automate',
    color: 'peach',
    card: ['Your name, your project, your details.', 'In the same place on every page.'],
    keywords: 'header footer title date name running',
  }),
  tool('numbers', 'add-page-numbers-to-pdf', 'Page numbers', 'Numbers', 'number', {
    category: 'automate',
    color: 'pink',
    card: ['A little order goes a long way.', 'Custom numbers from start to finish.'],
    keywords: 'numbering pagination',
  }),
  tool('pages', 'organize-pdf', 'Organize pages', 'Organize', 'pages', {
    category: 'organize',
    color: 'sand',
    card: ['Reorder, rotate, remove, or extract', 'just the pages you need.'],
    keywords: 'reorder rotate extract reverse interleave blank duplicate move',
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
    keywords: 'page size paper a4 letter scale fit enlarge shrink standard print mixed sizes',
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
    keywords: 'png jpeg image picture photo convert',
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
    keywords: 'batch preset many files',
  }),
]);

/** Each tool's address (the slug of its page). The app shows it while the tool is in use. */
export const TOOL_PAGES = Object.freeze(Object.fromEntries(TOOLS.map((item) => [item.id, item.slug])));
