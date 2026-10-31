/**
 * Give every first-party module, stylesheet and PDF engine URL a version query
 * in a built copy of the site. The Pages workflow runs this on dist/ just
 * before upload; the committed sources stay unversioned.
 *
 * Why: GitHub Pages serves every file with `Cache-Control: max-age=600` and the
 * URLs never change between releases. After a deploy, a normal reload fetches
 * the new index.html but may reuse the previous release's app.js and modules
 * from cache for up to ten minutes. Mixed releases can fail in confusing ways
 * (for example, every PDF reported as unreadable). Versioned URLs make each
 * release load as one consistent set.
 *
 * - First-party files share one release id: a hash of their contents, so
 *   redeploying identical code keeps visitors' caches.
 * - Each engine bundle (pdf-lib, fontkit, PDF.js and its worker) is versioned
 *   by a hash of its own bytes, so it is downloaded again only when it changes.
 *
 * Usage: node scripts/stamp-release.mjs [siteDirectory]   (default: dist)
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const site = path.resolve(process.argv[2] || fileURLToPath(new URL('../dist', import.meta.url)));
// One generated page per tool address (routes.js; scripts/build-pages.mjs).
const { TOOL_PAGES } = await import(pathToFileURL(path.join(site, 'routes.js')).href);
const TOOL_PAGE_FILES = [...new Set(Object.values(TOOL_PAGES))].map((slug) => `${slug}/index.html`);
const FIRST_PARTY = [
  'index.html', 'licenses/index.html', ...TOOL_PAGE_FILES, 'app.js', 'routes.js', 'layout.js', 'pdf-engine.js',
  'workflows.js', 'batch-ui.js', 'style.css', 'studio.css', 'batch.css',
];
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const sources = Object.fromEntries(
  await Promise.all(FIRST_PARTY.map(async (name) => [name, await readFile(path.join(site, name), 'utf8')])),
);
if (Object.values(sources).some((text) => /\?v=[0-9a-f]{10,}/.test(text))) {
  throw new Error(`${site} is already stamped. Run this once, on a fresh copy of the site.`);
}
const release = sha256(FIRST_PARTY.map((name) => `${name}\0${sources[name]}`).join('\0')).slice(0, 12);
const engine = async (file) => sha256(await readFile(path.join(site, 'assets/vendor', file))).slice(0, 12);
const pdfjs = await engine('pdf.mjs');
const worker = await engine('pdf.worker.mjs');
const pdfLib = await engine('pdf-lib.min.js');
const fontkit = await engine('fontkit.umd.min.js');

// [pattern, replacement, expected number of matches]. A mismatch means the
// sources changed shape and this script must be updated, so it fails loudly.
const RULES = {
  'index.html': [
    [/(href="\.\/(?:style|studio|batch)\.css)"/g, `$1?v=${release}"`, 3],
    [/(src="\.\/app\.js)"/g, `$1?v=${release}"`, 1],
  ],
  'licenses/index.html': [[/(href="\.\.\/(?:style|studio)\.css)"/g, `$1?v=${release}"`, 2]],
  ...Object.fromEntries(
    TOOL_PAGE_FILES.map((name) => [
      name,
      [
        [/(href="\.\.\/(?:style|studio|batch)\.css)"/g, `$1?v=${release}"`, 3],
        [/(src="\.\.\/app\.js)"/g, `$1?v=${release}"`, 1],
      ],
    ]),
  ),
  'app.js': [
    [/(from '\.\/(?:pdf-engine|workflows|batch-ui|routes)\.js)'/g, `$1?v=${release}'`, 4],
    [/(import\('\.\/assets\/vendor\/pdf\.mjs)'/g, `$1?v=${pdfjs}'`, 1],
    [/(assetUrl\('\.\/assets\/vendor\/pdf\.worker\.mjs)'/g, `$1?v=${worker}'`, 1],
  ],
  'layout.js': [],
  'pdf-engine.js': [
    [/(from '\.\/layout\.js)'/g, `$1?v=${release}'`, 2],
    [/(new URL\('\.\/assets\/vendor\/pdf-lib\.min\.js)'/g, `$1?v=${pdfLib}'`, 1],
    [/(new URL\('\.\/assets\/vendor\/fontkit\.umd\.min\.js)'/g, `$1?v=${fontkit}'`, 1],
  ],
  'workflows.js': [[/(from '\.\/pdf-engine\.js)'/g, `$1?v=${release}'`, 1]],
  'batch-ui.js': [[/(from '\.\/(?:workflows|pdf-engine)\.js)'/g, `$1?v=${release}'`, 2]],
};

for (const [name, rules] of Object.entries(RULES)) {
  let text = sources[name];
  for (const [pattern, replacement, expected] of rules) {
    const found = text.match(pattern)?.length ?? 0;
    if (found !== expected) throw new Error(`${name}: expected ${expected} match(es) for ${pattern}, found ${found}.`);
    text = text.replace(pattern, replacement);
  }
  // Every relative import must be versioned: an unversioned URL could load a
  // stale copy, and two spellings of one URL would load a module twice.
  const unversioned = [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"](\.[^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((specifier) => !specifier.includes('?v='));
  if (unversioned.length) throw new Error(`${name}: unversioned import(s): ${unversioned.join(', ')}`);
  await writeFile(path.join(site, name), text);
}
console.log(`Stamped release ${release} (pdf.js ${pdfjs}, worker ${worker}, pdf-lib ${pdfLib}, fontkit ${fontkit}) in ${site}.`);
