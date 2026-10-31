/**
 * Generate one page per tool (dist/<slug>/index.html) and dist/sitemap.xml.
 *
 * Each tool page is the home page (dist/index.html) with its marked regions
 * replaced from scripts/pages/content.mjs: metadata, hero, upload card, a how-to
 * and FAQ section, and the tools-grid heading. Everything else, including the
 * editor, dialogs and batch workspace, is shared, so the app works the same on
 * every page. Relative links are rewritten for the page's directory, and the
 * page's own card is left out of its "More PDF tools" grid.
 *
 *   node scripts/build-pages.mjs           write the pages and the sitemap
 *   node scripts/build-pages.mjs --check   fail if anything on disk is stale
 *
 * Edit index.html or content.mjs, then rerun this script; `npm test` runs the
 * check, so a forgotten rebuild fails CI rather than shipping stale pages.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_PAGES } from '../dist/routes.js';
import { PAGES } from './pages/content.mjs';

const ORIGIN = 'https://pdf.qft.org/';
const site = fileURLToPath(new URL('../dist/', import.meta.url));
const checkOnly = process.argv.includes('--check');

const escapeHtml = (text) =>
  String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
const LINK = /\[([^\]]+)\]\(tool:([a-z]+)\)/g;
// [label](tool:id) becomes a link to that tool's page (written relative to the
// site root here; the depth rewrite below adjusts it for the page's directory).
const rich = (text) =>
  escapeHtml(text).replace(LINK, (match, label, tool) => {
    if (!TOOL_PAGES[tool]) throw new Error(`Unknown tool in link: ${match}`);
    return `<a href="./${TOOL_PAGES[tool]}/">${label}</a>`;
  });
const plain = (text) => text.replace(LINK, '$1');

function region(html, name) {
  const open = `<!-- page:${name} -->\n`, close = `<!-- /page:${name} -->`;
  const start = html.indexOf(open), end = html.indexOf(close);
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

function toolPage(template, page) {
  const slug = TOOL_PAGES[page.tool];
  if (!slug) throw new Error(`No address for tool "${page.tool}" in routes.js.`);
  const url = `${ORIGIN}${slug}/`;
  const meta = read(template, 'meta');
  const homeData = JSON.parse(line(meta, /application\/ld\+json/).match(/>(.*)<\/script>/)[1]);
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: `${page.name} — QFT PDF`,
        url,
        description: page.description,
        image: homeData.image,
        applicationCategory: homeData.applicationCategory,
        operatingSystem: homeData.operatingSystem,
        browserRequirements: homeData.browserRequirements,
        isAccessibleForFree: true,
        offers: homeData.offers,
        isPartOf: { '@type': 'WebSite', name: 'QFT PDF', url: ORIGIN },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'QFT PDF', item: ORIGIN },
          { '@type': 'ListItem', position: 2, name: page.name, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: page.faqs.map(([question, answer]) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: plain(answer) },
        })),
      },
    ],
  };
  // Keep the data block inert inside HTML.
  const json = JSON.stringify(graph).replace(/</g, '\\u003c');
  const shared = (pattern) => line(meta, pattern);
  const metaBlock = [
    `  <title>${escapeHtml(page.title)}</title>`,
    `  <meta name="description" content="${escapeHtml(page.description)}">`,
    `  <link rel="canonical" href="${url}">`,
    shared(/property="og:type"/),
    shared(/property="og:site_name"/),
    `  <meta property="og:url" content="${url}">`,
    `  <meta property="og:title" content="${escapeHtml(page.title.replace(/ — QFT PDF$/, ''))}">`,
    `  <meta property="og:description" content="${escapeHtml(page.description)}">`,
    shared(/property="og:image"/),
    shared(/property="og:image:width"/),
    shared(/property="og:image:height"/),
    shared(/property="og:image:alt"/),
    shared(/property="og:locale"/),
    shared(/name="twitter:card"/),
    shared(/rel="icon"/),
    shared(/rel="apple-touch-icon"/),
    `  <script type="application/ld+json">${json}</script>`,
  ].join('\n');

  const benefits = line(read(template, 'hero'), /class="hero-benefits"/);
  const hero = [
    `          <div class="eyebrow"><span class="status-dot"></span> ${escapeHtml(page.eyebrow)}</div>`,
    `          <h1 id="landing-title" tabindex="-1">${escapeHtml(page.heading[0])}<br><em>${escapeHtml(page.heading[1])}</em></h1>`,
    `          <p>${escapeHtml(page.intro)}</p>`,
    benefits,
  ].join('\n');

  const upload = page.upload || {};
  const uploadBlock = [
    `          <h2>${escapeHtml(upload.heading || 'Start with your PDF.')}</h2>`,
    `          <p>${escapeHtml(upload.text)}</p>`,
    `          <button class="button primary upload-button" data-action="${page.tool === 'batch' ? 'batch-choose' : 'open'}"><svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg> ${escapeHtml(upload.cta || 'Choose a PDF')} <svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></button>`,
    `          <span class="upload-meta">${escapeHtml(upload.meta || 'PDF files · no fixed size or page limit')}</span>`,
  ].join('\n');

  // The home page offers a batch shortcut and the sample; tool pages keep what fits.
  const extras = read(template, 'upload-extras');
  const shortcut = extras.slice(0, extras.indexOf('<div class="sample-row">'));
  const sample = extras.slice(extras.indexOf('<div class="sample-row">')).trimEnd();
  const extrasBlock =
    (page.batchShortcut ? shortcut : '          ') + (page.sample === false ? '' : sample);

  const tools = [
    '        <div class="section-heading"><div><div class="eyebrow">MORE TOOLS</div><h2 id="tools-title" tabindex="-1">More PDF tools.</h2></div><p>Free, private, and right in your browser.</p></div>',
  ].join('\n');

  const steps = page.steps
    .map(
      ([title, text], index) =>
        `        <div class="how-step"><span>0${index + 1}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>`,
    )
    .join('\n');
  const faqs = page.faqs
    .map(([question, answer]) => `          <details class="faq-item"><summary>${escapeHtml(question)}</summary><p>${rich(answer)}</p></details>`)
    .join('\n');
  const sections = [
    '      <section class="how-section tool-how section-wrap" aria-labelledby="how-title">',
    `        <div class="how-title"><div class="eyebrow">HOW IT WORKS</div><h2 id="how-title">${escapeHtml(page.how[0])}<br> <em>${escapeHtml(page.how[1])}</em></h2></div>`,
    steps,
    '      </section>',
    '      <section class="faq-section section-wrap" aria-labelledby="faq-title">',
    '        <div class="faq-heading"><div class="eyebrow">GOOD TO KNOW</div><h2 id="faq-title">Questions, answered.</h2></div>',
    '        <div class="faq-list">',
    faqs,
    '        </div>',
    '      </section>',
  ].join('\n');

  let html = template;
  html = replace(html, 'meta', metaBlock);
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
  // One directory deeper than index.html: ./x becomes ../x.
  html = html.replace(/((?:href|src)=")\.\//g, '$1../');
  return { file: `${slug}/index.html`, html, url };
}

const template = await readFile(path.join(site, 'index.html'), 'utf8');
const outputs = PAGES.map((page) => toolPage(template, page));
if (new Set(outputs.map((output) => output.file)).size !== outputs.length) throw new Error('Two pages share an address.');
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...[ORIGIN, ...outputs.map((output) => output.url), `${ORIGIN}licenses/`].map((url) => `  <url><loc>${url}</loc></url>`),
  '</urlset>',
  '',
].join('\n');
const files = [...outputs.map(({ file, html }) => [file, html]), ['sitemap.xml', sitemap]];

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
  console.error(`Generated pages are out of date: ${stale.join(', ')}.\nRun: node scripts/build-pages.mjs`);
  process.exit(1);
}
console.log(checkOnly ? `Tool pages are up to date (${outputs.length} pages and the sitemap).` : `Wrote ${outputs.length} tool pages and the sitemap.`);
