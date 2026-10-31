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
