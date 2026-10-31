import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_PAGES } from '../dist/routes.js';

// No package installation is needed: this validates exactly the shipped files.
const root = fileURLToPath(new URL('../', import.meta.url));
const site = path.join(root, 'dist');
const html = await readFile(path.join(site, 'index.html'), 'utf8');
const canonical = 'https://pdf.qft.org/';
// Every public page and its canonical address: home plus one page per tool.
const PAGES = {
  'index.html': canonical,
  ...Object.fromEntries([...new Set(Object.values(TOOL_PAGES))].map((slug) => [`${slug}/index.html`, `${canonical}${slug}/`])),
};
const references = [];
const add = (source, reference) => {
  if (!reference || reference.startsWith('#') || /^(?:https?:|data:|blob:|mailto:)/.test(reference)) return;
  assert(!reference.startsWith('/'), `${source}: root-relative path breaks project hosting: ${reference}`);
  references.push({ source, reference });
};

for (const name of [...Object.keys(PAGES), 'licenses/index.html']) {
  const source = await readFile(path.join(site, name), 'utf8');
  for (const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) add(name, match[1]);
}
for (const name of ['app.js', 'routes.js', 'layout.js', 'pdf-engine.js', 'workflows.js', 'batch-ui.js']) {
  const source = await readFile(path.join(site, name), 'utf8');
  assert(!/["']\/assets\//.test(source), `${name}: hard-coded root asset path`);
  for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*)["'](\.[^"']+)["']/g)) add(name, match[1]);
  for (const match of source.matchAll(/(?:assetUrl\s*\(\s*|new URL\s*\(\s*)["'](\.[^"']+)["']/g)) add(name, match[1]);
}
for (const name of ['style.css', 'studio.css', 'batch.css']) {
  const source = await readFile(path.join(site, name), 'utf8');
  for (const match of source.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) add(name, match[1]);
}

for (const base of ['https://pdf.qft.org/', 'https://renphysics.github.io/pdf.qft.org/']) {
  const baseURL = new URL(base);
  for (const { source, reference } of references) {
    const resolved = new URL(reference, new URL(source, baseURL));
    assert.equal(resolved.origin, baseURL.origin, `${source}: external resource`);
    assert(resolved.pathname.startsWith(baseURL.pathname), `${source}: resource escapes hosting base`);
    const relative = decodeURIComponent(resolved.pathname.slice(baseURL.pathname.length));
    const file = path.resolve(site, relative);
    assert(file === site || file.startsWith(site + path.sep), `${source}: resource escapes dist`);
    // In a page, a link to a directory is a page address and must reach its
    // index.html. Scripts also name asset directories (PDF.js cmaps, fonts).
    const pageLink = source.endsWith('.html') && (!relative || relative.endsWith('/'));
    await stat(pageLink ? path.join(file, 'index.html') : file);
  }
}

assert.match(html, /<title>QFT PDF/);
assert.match(html, /href="\.\/licenses\/index\.html"[^>]*>Open-source credits<\/a>/);
const siteFile = (url) => {
  assert(url.startsWith(canonical), `${url} must use the canonical origin`);
  const relative = decodeURIComponent(new URL(url).pathname.slice(1));
  return path.join(site, relative.endsWith('/') || !relative ? relative + 'index.html' : relative);
};
const decode = (text) =>
  text.replace(/&(amp|lt|gt|quot|#39);/g, (match, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[name]);
const cardIds = new Set([...html.matchAll(/data-card="(\w+)"/g)].map((match) => match[1]));
const titles = new Set(), descriptions = new Set();
for (const [name, url] of Object.entries(PAGES)) {
  const page = await readFile(path.join(site, name), 'utf8');
  const meta = (attribute, key) => page.match(new RegExp(`<meta ${attribute}="${key}" content="([^"]*)"`))?.[1];
  // Security and privacy headers that GitHub Pages cannot send are set in every page.
  assert.match(page, /http-equiv="Content-Security-Policy"/, `${name}: CSP`);
  assert.match(page, /<meta name="referrer" content="strict-origin-when-cross-origin">/, `${name}: referrer policy`);
  // One canonical address, a unique title and description that fit in search results.
  assert(page.includes(`<link rel="canonical" href="${url}">`), `${name}: canonical ${url}`);
  assert.equal(meta('property', 'og:url'), url, `${name}: og:url`);
  const title = decode(page.match(/<title>([^<]+)<\/title>/)[1]);
  assert(title.includes('QFT PDF') && title.length <= 60, `${name}: title must name QFT PDF in 60 characters: ${title}`);
  assert(!titles.has(title), `${name}: duplicate title`);
  titles.add(title);
  const description = decode(meta('name', 'description') || '');
  assert(description.length >= 50 && description.length <= 160, `${name}: description must be 50-160 characters`);
  assert(!descriptions.has(description), `${name}: duplicate description`);
  descriptions.add(description);
  for (const key of ['og:title', 'og:description', 'og:image:alt']) assert(meta('property', key)?.length > 20, `${name}: missing ${key}`);
  assert.equal(meta('name', 'twitter:card'), 'summary_large_image', `${name}: twitter:card`);
  assert.deepEqual([meta('property', 'og:image:width'), meta('property', 'og:image:height')], ['1200', '630']);
  const card = await readFile(siteFile(meta('property', 'og:image')));
  assert.equal(card.toString('latin1', 1, 4), 'PNG', `${name}: og:image must be a PNG`);
  assert.deepEqual([card.readUInt32BE(16), card.readUInt32BE(20)], [1200, 630], `${name}: og:image must be 1200x630`);
  assert.match(page, /<h1 id="landing-title"/, `${name}: page heading`);
  // Keep pages light: pdf-lib, fontkit and PDF.js load on demand.
  assert(!/pdf-lib\.min\.js|fontkit\.umd\.min\.js|vendor\/pdf\.mjs/.test(page), `${name}: must not load the PDF engines eagerly`);
  const data = JSON.parse(page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  if (name === 'index.html') {
    assert.equal(data['@type'], 'WebApplication');
    assert.equal(data.url, canonical);
    continue;
  }
  // Tool pages: the app opens this page's tool, and the grid lists every other tool.
  const tool = page.match(/<body data-tool="(\w+)">/)?.[1];
  assert(tool && `${TOOL_PAGES[tool]}/index.html` === name, `${name}: body data-tool must name this page's tool`);
  const listed = new Set([...page.matchAll(/data-card="(\w+)"/g)].map((match) => match[1]));
  assert.deepEqual(listed, new Set([...cardIds].filter((id) => id !== tool)), `${name}: tools grid`);
  const graph = Object.fromEntries(data['@graph'].map((entry) => [entry['@type'], entry]));
  assert.equal(graph.WebApplication.url, url, `${name}: WebApplication url`);
  assert.equal(graph.BreadcrumbList.itemListElement.at(-1).item, url, `${name}: breadcrumb`);
  // FAQ structured data must match the questions shown on the page.
  const shown = [...page.matchAll(/<summary>([^<]+)<\/summary>/g)].map((match) => decode(match[1]));
  assert(shown.length >= 3, `${name}: at least three questions`);
  assert.deepEqual(graph.FAQPage.mainEntity.map((entry) => entry.name), shown, `${name}: FAQ data matches the page`);
}
const robots = await readFile(path.join(site, 'robots.txt'), 'utf8');
assert.match(robots, /^Sitemap: https:\/\/pdf\.qft\.org\/sitemap\.xml$/m);
const sitemap = await readFile(path.join(site, 'sitemap.xml'), 'utf8');
const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert.deepEqual(new Set(locations), new Set([...Object.values(PAGES), `${canonical}licenses/`]), 'Sitemap lists every page');
for (const location of locations) await stat(siteFile(location));
assert.equal(await readFile(path.join(root, 'LICENSE'), 'utf8'), await readFile(path.join(site, 'licenses/QFT-PDF-MIT.txt'), 'utf8'), 'Served MIT license must match the repository license');
assert.equal((await readFile(path.join(site, 'CNAME'), 'utf8')).trim(), 'pdf.qft.org');
await stat(path.join(site, '.nojekyll'));

// These upstream license files must accompany the files sent to visitors.
for (const name of [
  'licenses/QFT-PDF-MIT.txt', 'licenses/THIRD-PARTY.txt', 'licenses/pdf-lib-MIT.txt', 'licenses/pdfjs-Apache-2.0.txt',
  'licenses/pdf-lib-dependencies.txt', 'licenses/fontkit-dependencies/NOTICES.txt', 'licenses/fontkit-dependencies/README.md',
  'licenses/fontkit-MIT.txt', 'licenses/NotoSans-OFL.txt', 'licenses/NotoSansCJK-OFL.txt',
  'assets/vendor/cmaps/LICENSE', 'assets/vendor/standard_fonts/LICENSE_FOXIT',
  'assets/vendor/standard_fonts/LICENSE_LIBERATION', 'assets/vendor/iccs/LICENSE',
  'assets/vendor/wasm/LICENSE_JBIG2', 'assets/vendor/wasm/LICENSE_OPENJPEG',
  'assets/vendor/wasm/LICENSE_QCMS', 'assets/vendor/wasm/LICENSE_PDFJS_JBIG2',
  'assets/vendor/wasm/LICENSE_PDFJS_OPENJPEG', 'assets/vendor/wasm/LICENSE_PDFJS_QCMS',
]) {
  assert((await readFile(path.join(site, name), 'utf8')).trim().length > 100, `Missing license: ${name}`);
}

async function inspectDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert(!['.git', '.openai', 'node_modules'].includes(entry.name), `Private/build directory in website: ${entry.name}`);
    assert(!/^\.env(?:\.|$)/.test(entry.name), `Environment file in website: ${entry.name}`);
    assert(!entry.isSymbolicLink(), `Symlink is not supported by Pages artifacts: ${entry.name}`);
    if (entry.isDirectory()) await inspectDirectory(path.join(directory, entry.name));
  }
}
await inspectDirectory(site);
console.log(`Static site verified: ${Object.keys(PAGES).length} pages; ${references.length} references work at the custom domain and GitHub project path; metadata, notices and distribution files are present.`);
