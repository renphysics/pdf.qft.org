/**
 * Generate one page per tool (dist/<slug>/index.html) and dist/sitemap.xml.
 *
 * The home page's tool cards, the editor's tool menu and the phone's tab bar are
 * written into index.html first, from the registry in dist/routes.js (between
 * the tools:cards, tools:menu and tools:tabs comments), so a tool is described
 * in one place. Each tool page is the home page (dist/index.html) with its marked regions
 * replaced from scripts/pages/content.mjs: metadata, hero, upload card, a how-to
 * and FAQ section, and the tools-grid heading. Everything else, including the
 * editor, dialogs and batch workspace, is shared, so the app works the same on
 * every page. Relative links are rewritten for the page's directory, and the
 * page's own card is left out of its "More PDF tools" grid.
 *
 *   node scripts/build-pages.mjs           write the pages and the sitemap
 *   node scripts/build-pages.mjs --check   fail if anything on disk is stale
 *
 * Every page has a Chinese counterpart under zh/ (README, "Chinese"): the
 * template's words from scripts/pages/shell-zh.mjs, each tool page's from
 * scripts/pages/content-zh.mjs, the registry's from dist/i18n-zh.js. Links
 * between pages stay within a language; files (scripts, styles, pictures) are
 * the same for both. Each page names both versions (hreflang), and its
 * language link leads to the other.
 *
 * Edit index.html, content.mjs or content-zh.mjs, then rerun this script; `npm test` runs the
 * check, so a forgotten rebuild fails CI rather than shipping stale pages.
 */
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOLS as TOOLS_ZH } from '../dist/i18n-zh.js';
import { TOOLS, TOOL_PAGES } from '../dist/routes.js';
import { PAGES } from './pages/content.mjs';
import { FEATURES_ZH, HOME_ZH, PAGES_ZH, WORDS_ZH } from './pages/content-zh.mjs';
import { localizeShell, withoutSpacesBetweenChinese } from './pages/localize.mjs';
import { SAME_IN_CHINESE, SHELL_ZH } from './pages/shell-zh.mjs';

const ORIGIN = 'https://pdf.qft.org/';
const site = fileURLToPath(new URL('../dist/', import.meta.url));
const checkOnly = process.argv.includes('--check');

// What differs between the languages, besides the words each source holds.
const LANGUAGES = {
  en: {
    folder: '',
    html: 'en',
    hreflang: 'en',
    locale: 'en_US',
    pages: PAGES,
    words: {
      uploadHeading: 'Start with your PDF.',
      cta: 'Choose a PDF',
      uploadMeta: 'PDF files · no fixed size or page limit',
      moreEyebrow: 'MORE TOOLS',
      moreTitle: 'More PDF tools.',
      moreNote: 'Free, private, and right in your browser.',
      howEyebrow: 'HOW IT WORKS',
      faqEyebrow: 'GOOD TO KNOW',
      faqTitle: 'Questions, answered.',
    },
    link: { name: 'English', lang: 'en' },
  },
  zh: {
    folder: 'zh/',
    html: 'zh-CN',
    hreflang: 'zh-CN',
    locale: 'zh_CN',
    pages: PAGES_ZH,
    words: WORDS_ZH,
    link: { name: '中文', lang: 'zh-CN' },
  },
};
const other = (language) => (language === 'en' ? 'zh' : 'en');
/** A page's address: `slug` is "" for the home page. */
const address = (language, slug) => `${ORIGIN}${LANGUAGES[language].folder}${slug ? slug + '/' : ''}`;
/** The links that name each language's version of a page, and the default. */
const alternates = (slug) =>
  [
    `  <link rel="alternate" hreflang="en" href="${address('en', slug)}">`,
    `  <link rel="alternate" hreflang="zh-CN" href="${address('zh', slug)}">`,
    `  <link rel="alternate" hreflang="x-default" href="${address('en', slug)}">`,
  ].join('\n');
/** A tool's words in a language: its name, title, tab, card and keywords. */
const local = (item, language) => (language === 'zh' ? { ...item, ...TOOLS_ZH[item.id] } : item);

const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char],
  );
const LINK = /\[([^\]]+)\]\(tool:([a-z]+)\)/g;
// [label](tool:id) becomes a link to that tool's page (written relative to the
// site root here; the depth rewrite below adjusts it for the page's directory).
const rich = (text) =>
  escapeHtml(text).replace(LINK, (match, label, tool) => {
    if (!TOOL_PAGES[tool]) throw new Error(`Unknown tool in link: ${match}`);
    return `<a href="./${TOOL_PAGES[tool]}/">${label}</a>`;
  });
// In plain text (the FAQ's structured data) a linked name keeps a mark: English
// capitalises it; Chinese, which cannot, quotes it, as it does a name it does not
// link (在“填写表单”里), with no space after the closing quote.
const plain = (text, language = 'en') =>
  language === 'zh' ? text.replace(/\[([^\]]+)\]\(tool:[a-z]+\) ?/g, '“$1”') : text.replace(LINK, '$1');
/** The sharing card's address: a Chinese page shares the Chinese card (scripts/social-card/card-zh.html). */
const card = (text, language) =>
  language === 'zh' ? text.replace('/social-card.png', '/social-card-zh.png') : text;

function region(html, name) {
  const open = `<!-- page:${name} -->\n`,
    close = `<!-- /page:${name} -->`;
  const start = html.indexOf(open),
    end = html.indexOf(close);
  if (start < 0 || end < start) throw new Error(`index.html is missing the page:${name} region.`);
  return { start: start + open.length, end: html.lastIndexOf('\n', end) + 1 };
}
const read = (html, name) => {
  const { start, end } = region(html, name);
  return html.slice(start, end);
};
function replace(html, name, content) {
  const { start, end } = region(html, name);
  return html.slice(0, start) + (content ? content.replace(/\n?$/, '\n') : '') + html.slice(end);
}
const line = (block, pattern) => {
  const found = block.split('\n').find((text) => pattern.test(text));
  if (!found) throw new Error(`index.html: no line matches ${pattern}`);
  return found;
};

/** The text between two inline comments, replaced. */
function replaceBetween(html, name, content, kind = 'tools') {
  const open = `<!-- ${kind}:${name} -->`,
    close = `<!-- /${kind}:${name} -->`;
  const start = html.indexOf(open),
    end = html.indexOf(close);
  if (start < 0 || end < start) throw new Error(`index.html is missing the ${kind}:${name} region.`);
  return html.slice(0, start + open.length) + content + html.slice(end);
}
/** The modules a page loads at once: what app.js imports statically, in the order they are found. */
function staticModules(entry = 'app.js') {
  const found = [];
  const visit = (name) => {
    for (const [, dependency] of readFileSync(path.join(site, name), 'utf8').matchAll(
      /from '\.\/([\w-]+\.js)'/g,
    ))
      if (!found.includes(dependency)) {
        found.push(dependency);
        visit(dependency);
      }
  };
  visit(entry);
  return found;
}
/**
 * index.html with a modulepreload link for each module app.js needs, so they load
 * alongside it, not after it; and with what app.js asks for at the first sign of
 * intent (warmUp), in two templates, where links do nothing until they are put in
 * the page. warm-editor: the editor's modules, but not editor.js, which app.js
 * imports itself, nor those the page has already. warm-engines: PDF.js and
 * pdf-lib, at the addresses preview.js and pdf-engine.js load them from, and
 * pdf-lib without crossorigin, as its script element has none: a link that
 * differs is a second download. Not the PDF.js worker: WebKit downloads a worker
 * again whatever the hint.
 */
function withPreloads(html, language = 'en') {
  const shell = staticModules();
  // A Chinese page also needs the Chinese catalog, which zh.js hands to i18n.js
  // before app.js runs (dist/zh.js).
  const links = [...shell, ...(language === 'zh' ? ['i18n-zh.js'] : [])].map(
    (name) => `\n  <link rel="modulepreload" href="./${name}">`,
  );
  if (language === 'zh') {
    const app = '<script type="module" src="./app.js"></script>';
    if (!html.includes(app)) throw new Error(`index.html has no ${app}.`);
    html = html.replace(app, `<script type="module" src="./zh.js"></script>\n  ${app}`);
  }
  const editor = staticModules('editor.js').filter((name) => !shell.includes(name));
  const warm = [
    '\n  <template id="warm-editor">',
    ...editor.map((name) => `\n    <link rel="modulepreload" href="./${name}">`),
    '\n  </template>',
    '\n  <template id="warm-engines">',
    '\n    <link rel="modulepreload" href="./assets/vendor/pdf.mjs">',
    '\n    <link rel="preload" as="script" href="./assets/vendor/pdf-lib.min.js">',
    '\n  </template>',
  ];
  return replaceBetween(html, 'preload', links.join('') + warm.join('') + '\n  ', 'modules');
}
const svg = (icon) => `<svg class="icon" aria-hidden="true"><use href="#i-${icon}"/></svg>`;
/**
 * index.html with its cards, tool menu and tabs written from the registry
 * (dist/routes.js). A card names its tool (data-card); the tool search and the
 * category filter read the tool's keywords and category from the registry.
 */
function withTools(html, language = 'en') {
  // Where a card's line break is hidden, its two lines run on: with a space in
  // English, and none in Chinese, which has no spaces between sentences.
  const between = language === 'zh' ? '<br>' : '<br> ';
  const cards = TOOLS.filter((item) => item.card).map((tool) => {
    const item = local(tool, language);
    const start = item.tab ? `data-start-tool="${item.id}"` : `data-action="${item.id}"`;
    return `          <a class="tool-card" ${start} href="./${item.slug}/" data-card="${item.id}"><span class="tool-icon ${item.color}">${svg(item.icon)}</span><span class="tool-card-copy"><strong>${escapeHtml(item.title || item.name)}</strong><span>${escapeHtml(item.card[0])}${between}${escapeHtml(item.card[1])}</span></span><svg class="icon card-arrow" aria-hidden="true"><use href="#i-arrow"/></svg></a>`;
  });
  const menu = TOOLS.filter((item) => item.tab).map((item) => local(item, language));
  const options = menu.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  const tabs = menu
    .map(
      (item) =>
        `<button type="button" data-tool="${item.id}" aria-pressed="false">${svg(item.icon)}<span>${escapeHtml(item.tab)}</span></button>`,
    )
    .join('');
  html = replaceBetween(html, 'cards', `\n${cards.join('\n')}\n        `);
  html = replaceBetween(html, 'menu', options);
  return replaceBetween(html, 'tabs', tabs);
}

/** A page's metadata block: title, description, addresses, sharing cards and structured data. */
function metaBlock(meta, language, { slug, title, description, ogTitle, ogDescription, imageAlt, graph }) {
  const url = address(language, slug);
  const shared = (pattern) => line(meta, pattern);
  // Keep the data block inert inside HTML.
  const json = JSON.stringify(graph).replace(/</g, '\\u003c');
  return [
    `  <title>${escapeHtml(title)}</title>`,
    `  <meta name="description" content="${escapeHtml(description)}">`,
    `  <link rel="canonical" href="${url}">`,
    alternates(slug),
    shared(/property="og:type"/),
    shared(/property="og:site_name"/),
    `  <meta property="og:url" content="${url}">`,
    `  <meta property="og:title" content="${escapeHtml(ogTitle)}">`,
    `  <meta property="og:description" content="${escapeHtml(ogDescription)}">`,
    card(shared(/property="og:image"/), language),
    shared(/property="og:image:width"/),
    shared(/property="og:image:height"/),
    imageAlt
      ? `  <meta property="og:image:alt" content="${escapeHtml(imageAlt)}">`
      : shared(/property="og:image:alt"/),
    `  <meta property="og:locale" content="${LANGUAGES[language].locale}">`,
    `  <meta property="og:locale:alternate" content="${LANGUAGES[other(language)].locale}">`,
    shared(/name="twitter:card"/),
    shared(/rel="icon"/),
    shared(/rel="apple-touch-icon"/),
    `  <script type="application/ld+json">${json}</script>`,
  ].join('\n');
}

/** The brand's suffix to a page's own title, by language. */
const SUFFIX = { en: ' — QFT PDF', zh: ' · QFT PDF' };

function toolPage(template, page, language = 'en') {
  const slug = TOOL_PAGES[page.tool];
  if (!slug) throw new Error(`No address for tool "${page.tool}" in routes.js.`);
  const { words } = LANGUAGES[language];
  const url = address(language, slug);
  const meta = read(template, 'meta');
  const homeData = JSON.parse(line(meta, /application\/ld\+json/).match(/>(.*)<\/script>/)[1]);
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: `${page.name}${SUFFIX[language]}`,
        url,
        description: page.description,
        inLanguage: LANGUAGES[language].html,
        image: card(homeData.image, language),
        applicationCategory: homeData.applicationCategory,
        operatingSystem: homeData.operatingSystem,
        browserRequirements: language === 'zh' ? HOME_ZH.browserRequirements : homeData.browserRequirements,
        isAccessibleForFree: true,
        offers: homeData.offers,
        isPartOf: { '@type': 'WebSite', name: 'QFT PDF', url: address(language, '') },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'QFT PDF', item: address(language, '') },
          { '@type': 'ListItem', position: 2, name: page.name, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: page.faqs.map(([question, answer]) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: plain(answer, language) },
        })),
      },
    ],
  };
  const block = metaBlock(meta, language, {
    slug,
    title: page.title,
    description: page.description,
    ogTitle: page.title.slice(0, -SUFFIX[language].length),
    ogDescription: page.description,
    imageAlt: language === 'zh' ? HOME_ZH.imageAlt : null,
    graph,
  });
  if (!page.title.endsWith(SUFFIX[language]))
    throw new Error(`The title of ${slug} (${language}) must end in "${SUFFIX[language]}".`);

  const benefits = line(read(template, 'hero'), /class="hero-benefits"/);
  const hero = [
    `          <div class="eyebrow"><span class="status-dot"></span> ${escapeHtml(page.eyebrow)}</div>`,
    `          <h1 id="landing-title" tabindex="-1">${escapeHtml(page.heading[0])}<br><em>${escapeHtml(page.heading[1])}</em></h1>`,
    `          <p>${escapeHtml(page.intro)}</p>`,
    benefits,
  ].join('\n');

  const upload = page.upload || {};
  const uploadBlock = [
    `          <h2>${escapeHtml(upload.heading || words.uploadHeading)}</h2>`,
    `          <p>${escapeHtml(upload.text)}</p>`,
    `          <button class="button primary upload-button" data-action="${page.tool === 'batch' ? 'batch-choose' : 'open'}"><svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg> ${escapeHtml(upload.cta || words.cta)} <svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></button>`,
    `          <span class="upload-meta">${escapeHtml(upload.meta || words.uploadMeta)}</span>`,
  ].join('\n');

  // The home page offers a batch shortcut and the sample; tool pages keep what fits.
  const extras = read(template, 'upload-extras');
  const shortcut = extras.slice(0, extras.indexOf('<div class="sample-row">'));
  const sample = extras.slice(extras.indexOf('<div class="sample-row">')).trimEnd();
  const extrasBlock = (page.batchShortcut ? shortcut : '          ') + (page.sample === false ? '' : sample);

  const tools = [
    `        <div class="section-heading"><div><div class="eyebrow">${escapeHtml(words.moreEyebrow)}</div><h2 id="tools-title" tabindex="-1">${escapeHtml(words.moreTitle)}</h2></div><p>${escapeHtml(words.moreNote)}</p></div>`,
  ].join('\n');

  const steps = page.steps
    .map(
      ([title, text], index) =>
        `        <div class="how-step"><span>0${index + 1}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>`,
    )
    .join('\n');
  const faqs = page.faqs
    .map(
      ([question, answer]) =>
        `          <details class="faq-item"><summary>${escapeHtml(question)}</summary><p>${rich(answer)}</p></details>`,
    )
    .join('\n');
  const sections = [
    '      <section class="how-section tool-how section-wrap" aria-labelledby="how-title">',
    `        <div class="how-title"><div class="eyebrow">${escapeHtml(words.howEyebrow)}</div><h2 id="how-title">${escapeHtml(page.how[0])}<br> <em>${escapeHtml(page.how[1])}</em></h2></div>`,
    steps,
    '      </section>',
    '      <section class="faq-section section-wrap" aria-labelledby="faq-title">',
    `        <div class="faq-heading"><div class="eyebrow">${escapeHtml(words.faqEyebrow)}</div><h2 id="faq-title">${escapeHtml(words.faqTitle)}</h2></div>`,
    '        <div class="faq-list">',
    faqs,
    '        </div>',
    '      </section>',
  ].join('\n');

  let html = template;
  html = replace(html, 'meta', block);
  html = replace(html, 'hero', hero);
  html = replace(html, 'upload', uploadBlock);
  html = replace(html, 'upload-extras', extrasBlock.trim() ? extrasBlock : '');
  html = replace(html, 'tools-heading', tools);
  html = replace(html, 'before-tools', sections);
  html = replace(html, 'sections', '');
  // This page's own card is not listed under "More PDF tools".
  const ownCard = new RegExp(`\\n[ ]*<a class="tool-card[^\\n]*data-card="${page.tool}"[^\\n]*</a>(?=\\n)`);
  if (!ownCard.test(html)) throw new Error(`index.html has no card with data-card="${page.tool}".`);
  html = html.replace(ownCard, '');
  // The app reads the page's tool from here; brand links go home for real.
  html = html.replace('<body>', `<body data-tool="${page.tool}">`).replaceAll(' data-action="home"', '');
  return { file: `${LANGUAGES[language].folder}${slug}/index.html`, html: placed(html, language, slug), url };
}

const PAGE_SLUGS = new Set(Object.values(TOOL_PAGES));
/**
 * A page in its folder: its language, its links written for its depth, and its
 * language link to its counterpart. Written for the site's root, as index.html
 * is, a link is to a page ("./", "./<slug>/"), which stays in the page's
 * language, or to a file, which both languages share.
 */
function placed(html, language, slug) {
  const { folder } = LANGUAGES[language];
  const depth = (folder ? 1 : 0) + (slug ? 1 : 0);
  const files = '../'.repeat(depth) || './',
    pages = '../'.repeat(slug ? 1 : 0) || './';
  html = html.replace(/((?:href|src)=")\.\/([^"]*)"/g, (whole, attribute, target) => {
    const page = target === '' || (target.endsWith('/') && PAGE_SLUGS.has(target.slice(0, -1)));
    return `${attribute}${page ? pages : files}${target}"`;
  });
  // The other language's version of this page: from the site's root down.
  const counterpart = other(language);
  const link = LANGUAGES[counterpart].link;
  const target = '../'.repeat(depth) + LANGUAGES[counterpart].folder + (slug ? slug + '/' : '');
  const languageLink = /<a class="language-link"[^>]*>[\s\S]*?<\/a>/;
  if (!languageLink.test(html)) throw new Error('index.html has no language link (a.language-link).');
  html = html.replace(
    languageLink,
    // Its address names its language, which language.js keeps as the choice however
    // the link is opened (clicked, in a new tab from its menu, or copied).
    `<a class="language-link" href="${target || './'}?language=${counterpart}" hreflang="${LANGUAGES[counterpart].hreflang}" lang="${link.lang}" data-language="${counterpart}"><svg class="icon" aria-hidden="true"><use href="#i-globe"/></svg>${link.name}</a>`,
  );
  return html.replace(/<html lang="[^"]*">/, `<html lang="${LANGUAGES[language].html}">`);
}

/** The Chinese home page: the template's words in Chinese, and its own metadata. */
function chineseHome(template) {
  const meta = read(template, 'meta');
  const homeData = JSON.parse(line(meta, /application\/ld\+json/).match(/>(.*)<\/script>/)[1]);
  const graph = {
    ...homeData,
    url: address('zh', ''),
    description: HOME_ZH.description,
    inLanguage: 'zh-CN',
    image: card(homeData.image, 'zh'),
    browserRequirements: HOME_ZH.browserRequirements,
    featureList: FEATURES_ZH,
  };
  const block = metaBlock(meta, 'zh', {
    slug: '',
    title: HOME_ZH.title,
    description: HOME_ZH.description,
    ogTitle: HOME_ZH.ogTitle,
    ogDescription: HOME_ZH.ogDescription,
    imageAlt: HOME_ZH.imageAlt,
    graph,
  });
  return {
    file: 'zh/index.html',
    html: placed(replace(template, 'meta', block), 'zh', ''),
    url: address('zh', ''),
  };
}

const source = await readFile(path.join(site, 'index.html'), 'utf8');
const template = withPreloads(withTools(source));
const chinese = withPreloads(
  withTools(withoutSpacesBetweenChinese(localizeShell(source, SHELL_ZH, SAME_IN_CHINESE)), 'zh'),
  'zh',
);
const englishPages = PAGES.map((page) => toolPage(template, page, 'en'));
// Every English tool page has its Chinese counterpart, and the other way round.
const missing = PAGES.filter((page) => !PAGES_ZH.some((zh) => zh.tool === page.tool)).map(
  (page) => page.tool,
);
const extra = PAGES_ZH.filter((zh) => !PAGES.some((page) => page.tool === zh.tool)).map((page) => page.tool);
if (missing.length || extra.length)
  throw new Error(
    `content-zh.mjs must have one page for each of content.mjs: missing ${missing.join(', ') || 'none'}, extra ${extra.join(', ') || 'none'}.`,
  );
const chinesePages = [chineseHome(chinese), ...PAGES_ZH.map((page) => toolPage(chinese, page, 'zh'))];
const outputs = [...englishPages, ...chinesePages];
if (new Set(outputs.map((output) => output.file)).size !== outputs.length)
  throw new Error('Two pages share an address.');
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...[ORIGIN, ...outputs.map((output) => output.url), `${ORIGIN}licenses/`].map(
    (url) => `  <url><loc>${url}</loc></url>`,
  ),
  '</urlset>',
  '',
].join('\n');
const files = [
  ['index.html', template],
  ...outputs.map(({ file, html }) => [file, html]),
  ['sitemap.xml', sitemap],
];

const stale = [];
for (const [file, content] of files) {
  const target = path.join(site, file);
  const current = await readFile(target, 'utf8').catch(() => null);
  if (current === content) continue;
  if (checkOnly) stale.push(file);
  else {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}
if (checkOnly && stale.length) {
  console.error(`Generated pages are out of date: ${stale.join(', ')}.\nRun: npm run pages`);
  process.exit(1);
}
console.log(
  checkOnly
    ? `Pages are up to date (${englishPages.length} tool pages, ${chinesePages.length} Chinese pages and the sitemap).`
    : `Wrote ${englishPages.length} tool pages, ${chinesePages.length} Chinese pages and the sitemap.`,
);
