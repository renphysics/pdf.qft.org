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
 * release load as one consistent set. The editor is fetched later than the
 * page (app.js loads it on first use), so a page from before a deploy can be
 * given the next release's editor: app.js checks for that (sameRelease) and
 * reloads when the visitor opens something (refresh).
 *
 * - First-party files share one release id: a hash of their contents and of
 *   the ids of the engines and fonts they name, so redeploying identical code
 *   keeps visitors' caches. An update of an engine alone is a release of its
 *   own: the modules that name the engine change with it, and under the old id
 *   a browser could keep the module that names the engine before. (The check
 *   after a deploy could not tell the two apart either.)
 * - Each engine bundle (pdf-lib, fontkit, PDF.js and its worker) is versioned
 *   by a hash of its own bytes, so it is downloaded again only when it changes.
 * - The three text fonts (Latin, the common Chinese of GB 2312, the full CJK
 *   font) are versioned the same way; the app keeps them in Cache Storage
 *   under that URL (pdf-engine.js fetchFont), so they outlive Pages' ten-minute
 *   cache and are downloaded again only when they change.
 *
 * Usage: node scripts/stamp-release.mjs [siteDirectory] [--github-output]
 *
 * The site directory defaults to dist. With --github-output, the release id is
 * also written as the step output `release` (to the file GitHub Actions names
 * in GITHUB_OUTPUT): the Pages workflow checks after the deploy that the live
 * site serves it (scripts/check-live-release.mjs). Only on request, because
 * test jobs stamp copies of the site too.
 */
import { createHash } from 'node:crypto';
import { appendFile, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const toStepOutput = args.includes('--github-output');
if (toStepOutput && !process.env.GITHUB_OUTPUT)
  throw new Error('--github-output: GITHUB_OUTPUT is not set (GitHub Actions sets it in every step).');
const site = path.resolve(
  args.find((arg) => !arg.startsWith('--')) || fileURLToPath(new URL('../dist', import.meta.url)),
);
// The home page and one generated page per tool address (routes.js;
// scripts/build-pages.mjs), in English and, under zh/, in Chinese.
const { TOOL_PAGES } = await import(pathToFileURL(path.join(site, 'routes.js')).href);
const SLUGS = [...new Set(Object.values(TOOL_PAGES))];
const PAGE_FILES = ['', 'zh/'].flatMap((folder) => [
  `${folder}index.html`,
  ...SLUGS.map((slug) => `${folder}${slug}/index.html`),
]);
// Every module beside index.html (app.js and the editor's modules, the engine...).
const MODULES = (await readdir(site)).filter((name) => name.endsWith('.js')).sort();
const FIRST_PARTY = [
  ...PAGE_FILES,
  'licenses/index.html',
  'licenses/licenses.css',
  ...MODULES,
  'style.css',
  'studio.css',
  'batch.css',
];
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const sources = Object.fromEntries(
  await Promise.all(FIRST_PARTY.map(async (name) => [name, await readFile(path.join(site, name), 'utf8')])),
);
if (Object.values(sources).some((text) => /\?v=[0-9a-f]{10,}/.test(text))) {
  throw new Error(`${site} is already stamped. Run this once, on a fresh copy of the site.`);
}
const hashOf = async (file) =>
  sha256(
    await readFile(path.join(site, file)).catch(() => {
      // The CJK font is assembled by scripts/prepare-assets.mjs; it is not in the repository.
      throw new Error(`${file} is missing from ${site}. Run node scripts/prepare-assets.mjs first.`);
    }),
  ).slice(0, 12);
const engine = (file) => hashOf(`assets/vendor/${file}`);
const pdfjs = await engine('pdf.mjs');
const worker = await engine('pdf.worker.mjs');
const pdfLib = await engine('pdf-lib.min.js');
const fontkit = await engine('fontkit.umd.min.js');
const latinFont = await hashOf('assets/fonts/NotoSans-Regular.ttf');
const commonFont = await hashOf('assets/fonts/NotoSansCJKsc-GB2312.woff2');
const cjkFont = await hashOf('assets/fonts/NotoSansCJKsc-Regular.otf');
const release = sha256(
  [
    ...FIRST_PARTY.map((name) => `${name}\0${sources[name]}`),
    pdfjs,
    worker,
    pdfLib,
    fontkit,
    latinFont,
    commonFont,
    cjkFont,
  ].join('\0'),
).slice(0, 12);

// [pattern, replacement, expected number of matches, or null for any number].
// A mismatch means the sources changed shape and this script must be updated,
// so it fails loudly. Every module's imports of its neighbours are versioned,
// static (from) and dynamic (import()); the check below fails on any relative
// import left unversioned.
const imports = [/((?:from |import\()'\.\/[\w-]+\.js)'/g, `$1?v=${release}'`, null];
// A page names the site's files from where it is: "./" from index.html, "../"
// from a tool page, "../../" from a Chinese tool page.
const upFrom = (name) => '../'.repeat(name.split('/').length - 1) || './';
const pattern = (text) => text.replace(/[./]/g, (char) => `\\${char}`);
// The modules a page preloads (scripts/build-pages.mjs): those app.js imports, the
// catalog on a Chinese page, and the editor's in the warm-editor template. Each
// tool page preloads what its home page does, counted with the rule's own pattern;
// the engine links in warm-engines have rules of their own, with the engines' ids.
const preloadLink = (up) => new RegExp(`(rel="modulepreload" href="${pattern(up)}[\\w-]+\\.js)"`, 'g');
const preloads = {
  '': (sources['index.html'].match(preloadLink('./')) || []).length,
  'zh/': (sources['zh/index.html'].match(preloadLink('../')) || []).length,
};
/** A page's rules: its stylesheets, language.js and app.js, its preloads and the engines' links. */
const pageRules = (name) => {
  const up = pattern(upFrom(name));
  return [
    [new RegExp(`(href="${up}(?:style|studio|batch)\\.css)"`, 'g'), `$1?v=${release}"`, 3],
    [new RegExp(`(src="${up}language\\.js)"`, 'g'), `$1?v=${release}"`, 1],
    [new RegExp(`(src="${up}app\\.js)"`, 'g'), `$1?v=${release}"`, 1],
    [preloadLink(upFrom(name)), `$1?v=${release}"`, preloads[name.startsWith('zh/') ? 'zh/' : '']],
    [new RegExp(`(href="${up}assets\\/vendor\\/pdf\\.mjs)"`, 'g'), `$1?v=${pdfjs}"`, 1],
    [new RegExp(`(href="${up}assets\\/vendor\\/pdf-lib\\.min\\.js)"`, 'g'), `$1?v=${pdfLib}"`, 1],
  ];
};
const RULES = {
  ...Object.fromEntries(MODULES.map((name) => [name, [imports]])),
  ...Object.fromEntries(PAGE_FILES.map((name) => [name, pageRules(name)])),
  'licenses/index.html': [[/(href="(?:\.\.\/(?:style|studio)|\.\/licenses)\.css)"/g, `$1?v=${release}"`, 3]],
  'documents.js': [
    imports,
    // The export worker is a module too: one URL per release.
    [/(new URL\('\.\/export-worker\.js)'/g, `$1?v=${release}'`, 1],
  ],
  'preview.js': [
    imports,
    [/(import\('\.\/assets\/vendor\/pdf\.mjs)'/g, `$1?v=${pdfjs}'`, 1],
    [/(assetUrl\('\.\/assets\/vendor\/pdf\.worker\.mjs)'/g, `$1?v=${worker}'`, 1],
  ],
  'pdf-engine.js': [
    imports,
    [/(new URL\('\.\/assets\/vendor\/pdf-lib\.min\.js)'/g, `$1?v=${pdfLib}'`, 1],
    [/(new URL\('\.\/assets\/vendor\/fontkit\.umd\.min\.js)'/g, `$1?v=${fontkit}'`, 1],
    [/(new URL\('\.\/assets\/fonts\/NotoSans-Regular\.ttf)'/g, `$1?v=${latinFont}'`, 1],
    [/(new URL\('\.\/assets\/fonts\/NotoSansCJKsc-GB2312\.woff2)'/g, `$1?v=${commonFont}'`, 1],
    [/(new URL\('\.\/assets\/fonts\/NotoSansCJKsc-Regular\.otf)'/g, `$1?v=${cjkFont}'`, 1],
  ],
};

for (const [name, rules] of Object.entries(RULES)) {
  let text = sources[name];
  for (const [pattern, replacement, expected] of rules) {
    const found = text.match(pattern)?.length ?? 0;
    if (expected !== null && found !== expected)
      throw new Error(`${name}: expected ${expected} match(es) for ${pattern}, found ${found}.`);
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
if (toStepOutput) await appendFile(process.env.GITHUB_OUTPUT, `release=${release}\n`);
console.log(
  `Stamped release ${release} (pdf.js ${pdfjs}, worker ${worker}, pdf-lib ${pdfLib}, fontkit ${fontkit}, fonts ${latinFont} ${commonFont} ${cjkFont}) in ${site}.`,
);
