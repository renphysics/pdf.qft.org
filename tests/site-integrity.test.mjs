import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// No package installation is needed: this validates exactly the shipped files.
const root = fileURLToPath(new URL('../', import.meta.url));
const site = path.join(root, 'dist');
const html = await readFile(path.join(site, 'index.html'), 'utf8');
const references = [];
const add = (source, reference) => {
  if (!reference || reference.startsWith('#') || /^(?:https?:|data:|blob:|mailto:)/.test(reference)) return;
  assert(!reference.startsWith('/'), `${source}: root-relative path breaks project hosting: ${reference}`);
  references.push({ source, reference });
};

for (const name of ['index.html', 'licenses/index.html']) {
  const source = await readFile(path.join(site, name), 'utf8');
  for (const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) add(name, match[1]);
}
for (const name of ['app.js', 'pdf-engine.js', 'workflows.js', 'batch-ui.js']) {
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
    await stat(file);
  }
}

assert.match(html, /<link rel="canonical" href="https:\/\/pdf\.qft\.org\/">/);
assert.match(html, /<title>QFT PDF/);
assert.match(html, /http-equiv="Content-Security-Policy"/);
assert.match(html, /<meta name="referrer" content="strict-origin-when-cross-origin">/);
assert.match(html, /href="\.\/licenses\/index\.html"[^>]*>Open-source credits<\/a>/);
// Sharing and search metadata: absolute URLs on the canonical origin that exist in dist/.
const canonical = 'https://pdf.qft.org/';
const meta = (attribute, name) => html.match(new RegExp(`<meta ${attribute}="${name}" content="([^"]*)"`))?.[1];
const siteFile = (url) => {
  assert(url.startsWith(canonical), `${url} must use the canonical origin`);
  const relative = decodeURIComponent(new URL(url).pathname.slice(1));
  return path.join(site, relative.endsWith('/') || !relative ? relative + 'index.html' : relative);
};
assert.equal(meta('property', 'og:url'), canonical);
for (const key of ['og:title', 'og:description', 'og:image:alt']) assert(meta('property', key)?.length > 20, `Missing ${key}`);
assert(meta('name', 'description')?.length <= 160, 'Meta description should fit in search results (160 characters)');
assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
const card = await readFile(siteFile(meta('property', 'og:image')));
assert.equal(card.toString('latin1', 1, 4), 'PNG', 'og:image must be a PNG');
assert.deepEqual([card.readUInt32BE(16), card.readUInt32BE(20)], [1200, 630], 'og:image must be 1200x630');
assert.deepEqual([meta('property', 'og:image:width'), meta('property', 'og:image:height')], ['1200', '630']);
const structured = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
assert.equal(structured['@type'], 'WebApplication');
assert.equal(structured.url, canonical);
const robots = await readFile(path.join(site, 'robots.txt'), 'utf8');
assert.match(robots, /^Sitemap: https:\/\/pdf\.qft\.org\/sitemap\.xml$/m);
const sitemap = await readFile(path.join(site, 'sitemap.xml'), 'utf8');
const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert(locations.includes(canonical), 'Sitemap must list the home page');
for (const location of locations) await stat(siteFile(location));
// Keep the landing page light: pdf-lib, fontkit and PDF.js load on demand.
assert(!/pdf-lib\.min\.js|fontkit\.umd\.min\.js|vendor\/pdf\.mjs/.test(html), 'index.html must not load the PDF engines eagerly');
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
console.log(`Static site verified: ${references.length} references work at the custom domain and GitHub project path; required notices and distribution files are present.`);
