import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_PAGES, TOOLS } from '../dist/routes.js';
import { pdfjsBundle, pdfjsRecords } from '../scripts/vendor-pdfjs.mjs';
import { test } from 'node:test';

// This validates exactly the shipped files. One test compares the bundled PDF.js
// with the pdfjs-dist package, so the packages must be installed (npm ci).
const root = fileURLToPath(new URL('../', import.meta.url));
const site = path.join(root, 'dist');
const html = await readFile(path.join(site, 'index.html'), 'utf8');
const canonical = 'https://pdf.qft.org/';
// Every public page and its canonical address: home plus one page per tool.
const PAGES = {
  'index.html': canonical,
  ...Object.fromEntries(
    [...new Set(Object.values(TOOL_PAGES))].map((slug) => [`${slug}/index.html`, `${canonical}${slug}/`]),
  ),
};
// The Pages workflow runs this suite on the copy it deploys, where every address
// between the site's own files carries the release ("./editor.js?v=0123456789ab").
const RELEASE = String.raw`(?:\?v=[0-9a-f]{12})?`;
// The links in a page's <template id="..."> (scripts/build-pages.mjs), which app.js
// puts in the page at the first sign of intent (warmUp).
const template = (page, id) => page.match(new RegExp(`<template id="${id}">([\\s\\S]*?)</template>`))?.[1];
const references = [];
const add = (source, reference) => {
  if (!reference || reference.startsWith('#') || /^(?:https?:|data:|blob:|mailto:)/.test(reference)) return;
  assert(!reference.startsWith('/'), `${source}: root-relative path breaks project hosting: ${reference}`);
  references.push({ source, reference });
};
await test('references are collected from the pages, modules and stylesheets; no module hard-codes a root asset path', async () => {
  for (const name of [...Object.keys(PAGES), 'licenses/index.html']) {
    const source = await readFile(path.join(site, name), 'utf8');
    for (const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) add(name, match[1]);
  }
  for (const name of (await readdir(site)).filter((file) => file.endsWith('.js'))) {
    const source = await readFile(path.join(site, name), 'utf8');
    assert(!/["']\/assets\//.test(source), `${name}: hard-coded root asset path`);
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*)["'](\.[^"']+)["']/g)) add(name, match[1]);
    for (const match of source.matchAll(/(?:assetUrl\s*\(\s*|new URL\s*\(\s*)["'](\.[^"']+)["']/g))
      add(name, match[1]);
  }
  for (const name of ['style.css', 'studio.css', 'batch.css']) {
    const source = await readFile(path.join(site, name), 'utf8');
    for (const match of source.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) add(name, match[1]);
  }
});

await test('module graph: a page loads app.js and its static imports only; the editor loads on demand; nothing imports an entry module back; the preloads match', async () => {
  // The page loads app.js and what it imports statically; the editor (editor.js and
  // its modules) is loaded on demand, and no module imports either entry back.
  {
    const source = async (name) => readFile(path.join(site, name), 'utf8');
    const staticImports = async (name, found = new Set()) => {
      for (const [, dependency] of (await source(name)).matchAll(
        new RegExp(String.raw`from '\./([\w-]+\.js)${RELEASE}'`, 'g'),
      ))
        if (!found.has(dependency)) {
          found.add(dependency);
          await staticImports(dependency, found);
        }
      return found;
    };
    const shell = await staticImports('app.js');
    for (const name of [
      'editor.js',
      'documents.js',
      'tool-panel.js',
      'page-view.js',
      'pdf-engine.js',
      'batch-ui.js',
    ])
      assert(!shell.has(name), `app.js loads ${name} before a file is opened`);
    assert(
      new RegExp(String.raw`import\('\./editor\.js${RELEASE}'\)`).test(await source('app.js')),
      'app.js loads editor.js on demand',
    );
    let shellBytes = 0;
    for (const name of ['app.js', ...shell]) shellBytes += (await stat(path.join(site, name))).size;
    assert(
      shellBytes < 70000,
      `the landing page's modules weigh ${shellBytes} bytes; a stray import into app.js?`,
    );
    for (const name of (await readdir(site)).filter((file) => file.endsWith('.js')))
      assert(
        !new RegExp(String.raw`from '\./(?:app|editor)\.js${RELEASE}'`).test(await source(name)),
        `${name} imports an entry module back`,
      );
    for (const leaf of ['history.js', 'views.js']) {
      const imports = [
        ...(await source(leaf)).matchAll(new RegExp(String.raw`from '\./([\w-]+\.js)${RELEASE}'`, 'g')),
      ].map((match) => match[1]);
      assert(
        imports.every((name) => ['editor-core.js', 'routes.js'].includes(name)),
        `${leaf} imports only editor-core.js and routes.js, so any module can import it`,
      );
    }
    const page = await source('index.html');
    const modulesIn = (markup) =>
      [
        ...markup.matchAll(new RegExp(String.raw`rel="modulepreload" href="\./([\w-]+\.js)${RELEASE}"`, 'g')),
      ].map((match) => match[1]);
    const preloaded = modulesIn(page.replace(/<template[\s\S]*?<\/template>/g, ''));
    assert(preloaded.length >= 2, 'index.html preloads modules');
    assert.deepEqual(
      preloaded.sort(),
      [...shell].sort(),
      'index.html preloads exactly the modules app.js imports',
    );
    // What app.js puts in the page at the first sign of intent (warmUp): every other
    // module the editor imports. editor.js is imported, not preloaded as well.
    const warm = modulesIn(template(page, 'warm-editor') ?? '');
    const editor = [...(await staticImports('editor.js'))].filter((name) => !shell.has(name));
    assert(!warm.includes('editor.js'), 'the warm-editor template must not list editor.js');
    assert.deepEqual(
      warm.sort(),
      editor.sort(),
      'the warm-editor template lists exactly the modules editor.js imports that app.js does not (npm run pages)',
    );
  }
});

await test('panels: every tool with a tab has a panel module that exports fields()', async () => {
  // Each tool's panel is a module (panel-*.js; form-ui.js for Fill form) that
  // exports fields() and is registered once in tool-panel.js's PANELS, which
  // covers exactly the tools with a tab in routes.js.
  {
    const toolPanel = await readFile(path.join(site, 'tool-panel.js'), 'utf8');
    const registry = toolPanel.match(/const PANELS = \{([^}]*)\}/)?.[1];
    assert(registry, 'tool-panel.js registers the panels in PANELS');
    const keys = [...registry.matchAll(/^\s*(\w+)/gm)].map((match) => match[1]).sort();
    assert.deepEqual(
      keys,
      TOOLS.filter((item) => item.tab)
        .map((item) => item.id)
        .sort(),
      'PANELS covers every tool with a tab, and no other',
    );
    const panels = (await readdir(site)).filter((name) => /^panel-[\w-]+\.js$/.test(name));
    assert(panels.length >= 10, 'the panel modules are in dist/');
    for (const name of [...panels, 'form-ui.js']) {
      assert(
        /^export function fields\(/m.test(await readFile(path.join(site, name), 'utf8')),
        `${name} exports fields()`,
      );
      assert.equal(
        toolPanel.match(new RegExp(String.raw`import \* as \w+ from '\./${name}${RELEASE}'`, 'g'))?.length,
        1,
        `tool-panel.js imports ${name} once, as a namespace`,
      );
    }
  }
});

await test('the npm packages are the versions bundled for browsers', async () => {
  // The npm packages the Node suites run against are the versions bundled for
  // browsers: a Dependabot bump of one fails here until the bundle is updated too.
  {
    const bundled = JSON.parse(await readFile(path.join(site, 'assets/vendor/versions.json'), 'utf8'));
    const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    for (const name of ['@cantoo/pdf-lib', 'pdfjs-dist', '@cantoo/fontkit'])
      assert.equal(
        bundled[name],
        manifest.devDependencies[name] ?? manifest.dependencies[name],
        `${name}: package.json and dist/assets/vendor/versions.json name different versions (README: Updating the libraries)`,
      );
  }
});

await test('the bundled PDF.js is the installed npm package, file for file, and its records name that package', async () => {
  // PDF.js is served as npm ships it: scripts/vendor-pdfjs.mjs copies it from
  // node_modules. A bundle that was edited, or left behind by a version bump,
  // or that lacks a file the package now has, fails here.
  const bundle = await pdfjsBundle(),
    { version, changed, added, removed } = bundle;
  assert.deepEqual(
    { changed, added, removed },
    { changed: [], added: [], removed: [] },
    `dist/assets/vendor is not pdfjs-dist ${version} as installed: run node scripts/vendor-pdfjs.mjs (README: Updating the libraries)`,
  );
  // And what is written down about it: the version on the licences page and in
  // versions.json, the sizes and checksums, the npm tarball and each file in the
  // provenance record, PDF.js's licence text. The script keeps them; an edit by
  // hand, or a record put back, fails here.
  const { stale } = await pdfjsRecords({ bundle });
  assert.deepEqual(
    stale,
    [],
    `records that do not match pdfjs-dist ${version} as installed: run node scripts/vendor-pdfjs.mjs (README: Updating the libraries)`,
  );
});

await test('no shipped script names a connection the browser tests cannot count', async () => {
  // The browser tests fail on a request or a WebSocket to another origin, from
  // a page or its workers (tests/browser/helpers.mjs). These are not reported
  // to them in every browser (a worker's EventSource in Firefox, for one), and
  // the site has no use for them: no script it ships may name one, its own or a
  // library's. A prefixed name counts (webkitRTCPeerConnection).
  const uncounted = /(?:EventSource|WebTransport|RTCPeerConnection|RTCDataChannel)\b/;
  const scripts = (await readdir(site, { recursive: true })).filter((file) => /\.m?js$/.test(file));
  assert(scripts.length > 30, 'the scripts were found');
  for (const name of scripts) {
    const found = uncounted.exec(await readFile(path.join(site, name), 'utf8'));
    assert(!found, `${name}: ${found?.[0]}`);
  }
});

await test('every reference resolves at the custom domain and at the GitHub project path', async () => {
  // The first test collects them: selected by name, this one would check nothing.
  assert(references.length > 100, 'the references were collected (run this test with its file)');
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
});

const siteFile = (url) => {
  assert(url.startsWith(canonical), `${url} must use the canonical origin`);
  const relative = decodeURIComponent(new URL(url).pathname.slice(1));
  return path.join(site, relative.endsWith('/') || !relative ? relative + 'index.html' : relative);
};
await test('pages: titles, descriptions, canonical addresses, sharing tags, FAQ data and tool cards', async () => {
  assert.match(html, /<title>QFT PDF/);
  assert.match(html, /href="\.\/licenses\/index\.html"[^>]*>Open-source credits<\/a>/);
  const decode = (text) =>
    text.replace(
      /&(amp|lt|gt|quot|#39);/g,
      (match, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[name],
    );
  const cardIds = new Set([...html.matchAll(/data-card="(\w+)"/g)].map((match) => match[1]));
  // The engines' addresses as the modules load them, beside index.html.
  const engineUrls = {
    pdfjs: (await readFile(path.join(site, 'preview.js'), 'utf8')).match(
      /import\('\.\/(assets\/vendor\/pdf\.mjs[^']*)'\)/,
    )?.[1],
    pdfLib: (await readFile(path.join(site, 'pdf-engine.js'), 'utf8')).match(
      /new URL\('\.\/(assets\/vendor\/pdf-lib\.min\.js[^']*)'/,
    )?.[1],
  };
  assert(engineUrls.pdfjs && engineUrls.pdfLib, 'preview.js and pdf-engine.js name the engines');
  const titles = new Set(),
    descriptions = new Set();
  for (const [name, url] of Object.entries(PAGES)) {
    const page = await readFile(path.join(site, name), 'utf8');
    const meta = (attribute, key) =>
      page.match(new RegExp(`<meta ${attribute}="${key}" content="([^"]*)"`))?.[1];
    // Security and privacy headers that GitHub Pages cannot send are set in every page.
    assert.match(page, /http-equiv="Content-Security-Policy"/, `${name}: CSP`);
    assert.match(
      page,
      /<meta name="referrer" content="strict-origin-when-cross-origin">/,
      `${name}: referrer policy`,
    );
    // One canonical address, a unique title and description that fit in search results.
    assert(page.includes(`<link rel="canonical" href="${url}">`), `${name}: canonical ${url}`);
    assert.equal(meta('property', 'og:url'), url, `${name}: og:url`);
    const title = decode(page.match(/<title>([^<]+)<\/title>/)[1]);
    assert(
      title.includes('QFT PDF') && title.length <= 60,
      `${name}: title must name QFT PDF in 60 characters: ${title}`,
    );
    assert(!titles.has(title), `${name}: duplicate title`);
    titles.add(title);
    const description = decode(meta('name', 'description') || '');
    assert(
      description.length >= 50 && description.length <= 160,
      `${name}: description must be 50-160 characters`,
    );
    assert(!descriptions.has(description), `${name}: duplicate description`);
    descriptions.add(description);
    for (const key of ['og:title', 'og:description', 'og:image:alt'])
      assert(meta('property', key)?.length > 20, `${name}: missing ${key}`);
    assert.equal(meta('name', 'twitter:card'), 'summary_large_image', `${name}: twitter:card`);
    assert.deepEqual(
      [meta('property', 'og:image:width'), meta('property', 'og:image:height')],
      ['1200', '630'],
    );
    const card = await readFile(siteFile(meta('property', 'og:image')));
    assert.equal(card.toString('latin1', 1, 4), 'PNG', `${name}: og:image must be a PNG`);
    assert.deepEqual(
      [card.readUInt32BE(16), card.readUInt32BE(20)],
      [1200, 630],
      `${name}: og:image must be 1200x630`,
    );
    assert.match(page, /<h1 id="landing-title"/, `${name}: page heading`);
    // Keep pages light: pdf-lib, fontkit and PDF.js load on demand. Only the
    // warm-engines template names them, for the first sign of intent, at the very
    // addresses preview.js and pdf-engine.js load them from: another spelling would
    // be a second download, and for PDF.js a second copy of the module.
    const engines = template(page, 'warm-engines');
    assert(
      !/pdf-lib\.min\.js|fontkit\.umd\.min\.js|vendor\/pdf\.mjs/.test(
        page.replace(/<template id="warm-engines">[\s\S]*?<\/template>/, ''),
      ),
      `${name}: must not load the PDF engines eagerly`,
    );
    const up = name === 'index.html' ? './' : '../';
    assert.deepEqual(
      engines?.match(/<link [^>]*>/g),
      [
        `<link rel="modulepreload" href="${up}${engineUrls.pdfjs}">`,
        `<link rel="preload" as="script" href="${up}${engineUrls.pdfLib}">`,
      ],
      `${name}: the warm-engines template asks for PDF.js and pdf-lib as preview.js and pdf-engine.js do`,
    );
    assert.equal(
      template(page, 'warm-editor')?.replaceAll(up, './'),
      template(html, 'warm-editor'),
      `${name}: the same warm-editor template as the home page`,
    );
    const data = JSON.parse(page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    if (name === 'index.html') {
      assert.equal(data['@type'], 'WebApplication');
      assert.equal(data.url, canonical);
      continue;
    }
    // Tool pages: the app opens this page's tool, and the grid lists every other tool.
    const tool = page.match(/<body data-tool="(\w+)">/)?.[1];
    assert(
      tool && `${TOOL_PAGES[tool]}/index.html` === name,
      `${name}: body data-tool must name this page's tool`,
    );
    const listed = new Set([...page.matchAll(/data-card="(\w+)"/g)].map((match) => match[1]));
    assert.deepEqual(listed, new Set([...cardIds].filter((id) => id !== tool)), `${name}: tools grid`);
    const graph = Object.fromEntries(data['@graph'].map((entry) => [entry['@type'], entry]));
    assert.equal(graph.WebApplication.url, url, `${name}: WebApplication url`);
    assert.equal(graph.BreadcrumbList.itemListElement.at(-1).item, url, `${name}: breadcrumb`);
    // FAQ structured data must match the questions shown on the page.
    const shown = [...page.matchAll(/<summary>([^<]+)<\/summary>/g)].map((match) => decode(match[1]));
    assert(shown.length >= 3, `${name}: at least three questions`);
    assert.deepEqual(
      graph.FAQPage.mainEntity.map((entry) => entry.name),
      shown,
      `${name}: FAQ data matches the page`,
    );
  }
});

await test('one content security policy: no page needs an inline style, and _headers sends the same policy', async () => {
  const policyOf = (page) => page.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1];
  const home = policyOf(html);
  assert(home, 'index.html has a policy');
  for (const name of [...Object.keys(PAGES), 'licenses/index.html']) {
    const page = await readFile(path.join(site, name), 'utf8'),
      policy = policyOf(page);
    assert(policy, `${name}: a policy`);
    assert(!policy.includes("'unsafe-inline'"), `${name}: inline styles and scripts are refused`);
    assert(/style-src 'self'(?:;|$)/.test(policy), `${name}: only the site's own stylesheets`);
    // What the policy refuses is not there to be refused.
    const markup = page.replace(/<script[\s\S]*?<\/script>/g, '');
    assert(!/<style[\s>]/i.test(markup), `${name}: a style block`);
    assert(!/\sstyle\s*=/i.test(markup), `${name}: a style attribute`);
    // The licenses page runs no script at all; every other page has the home page's policy.
    if (name === 'licenses/index.html') assert(policy.includes("script-src 'none'"), `${name}: no scripts`);
    else assert.equal(policy, home, `${name}: the home page's policy`);
  }
  // A host that reads _headers sends its policy for every path on top of the page's
  // own, the licenses page included: it is the home page's policy.
  const headers = await readFile(path.join(site, '_headers'), 'utf8');
  assert.equal(
    headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1].trim(),
    home,
    '_headers sends the policy the pages declare',
  );
});

await test('robots.txt and the sitemap list every page; the license, CNAME and .nojekyll are served', async () => {
  const robots = await readFile(path.join(site, 'robots.txt'), 'utf8');
  assert.match(robots, /^Sitemap: https:\/\/pdf\.qft\.org\/sitemap\.xml$/m);
  const sitemap = await readFile(path.join(site, 'sitemap.xml'), 'utf8');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(
    new Set(locations),
    new Set([...Object.values(PAGES), `${canonical}licenses/`]),
    'Sitemap lists every page',
  );
  for (const location of locations) await stat(siteFile(location));
  assert.equal(
    await readFile(path.join(root, 'LICENSE'), 'utf8'),
    await readFile(path.join(site, 'licenses/QFT-PDF-MIT.txt'), 'utf8'),
    'Served MIT license must match the repository license',
  );
  assert.equal((await readFile(path.join(site, 'CNAME'), 'utf8')).trim(), 'pdf.qft.org');
  await stat(path.join(site, '.nojekyll'));
});

await test('upstream license files accompany the bundled files; nothing unexpected is distributed', async () => {
  // These upstream license files must accompany the files sent to visitors.
  for (const name of [
    'licenses/QFT-PDF-MIT.txt',
    'licenses/THIRD-PARTY.txt',
    'licenses/pdf-lib-MIT.txt',
    'licenses/pdfjs-Apache-2.0.txt',
    'licenses/pdf-lib-dependencies.txt',
    'licenses/fontkit-dependencies.txt',
    'licenses/fontkit-MIT.txt',
    'licenses/NotoSans-OFL.txt',
    'licenses/NotoSansCJK-OFL.txt',
    'licenses/Allura-OFL.txt',
    'assets/vendor/cmaps/LICENSE',
    'assets/vendor/standard_fonts/LICENSE_FOXIT',
    'assets/vendor/standard_fonts/LICENSE_LIBERATION',
    'assets/vendor/iccs/LICENSE',
    'assets/vendor/wasm/LICENSE_JBIG2',
    'assets/vendor/wasm/LICENSE_OPENJPEG',
    'assets/vendor/wasm/LICENSE_QCMS',
    'assets/vendor/wasm/LICENSE_PDFJS_JBIG2',
    'assets/vendor/wasm/LICENSE_PDFJS_OPENJPEG',
    'assets/vendor/wasm/LICENSE_PDFJS_QCMS',
  ]) {
    assert((await readFile(path.join(site, name), 'utf8')).trim().length > 100, `Missing license: ${name}`);
  }

  async function inspectDirectory(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      assert(
        !['.git', '.openai', 'node_modules'].includes(entry.name),
        `Private/build directory in website: ${entry.name}`,
      );
      assert(!/^\.env(?:\.|$)/.test(entry.name), `Environment file in website: ${entry.name}`);
      assert(!entry.isSymbolicLink(), `Symlink is not supported by Pages artifacts: ${entry.name}`);
      if (entry.isDirectory()) await inspectDirectory(path.join(directory, entry.name));
    }
  }
  await inspectDirectory(site);
});

await test('bundled libraries, fonts and the sample match their recorded size and SHA-256, and all are recorded', async () => {
  // The bundled libraries, fonts and sample are the files recorded in
  // scripts/asset-checksums.json (size and SHA-256), and every file under
  // assets/vendor and assets/fonts is recorded there.
  const checksums = JSON.parse(await readFile(path.join(root, 'scripts/asset-checksums.json'), 'utf8'));
  for (const [name, expected] of Object.entries(checksums)) {
    const data = await readFile(path.join(site, name));
    assert.equal(
      data.length,
      expected.bytes,
      `${name}: ${data.length} bytes; scripts/asset-checksums.json records ${expected.bytes}`,
    );
    assert.equal(
      createHash('sha256').update(data).digest('hex'),
      expected.sha256,
      `${name}: its SHA-256 differs from scripts/asset-checksums.json`,
    );
  }
  for (const folder of ['assets/vendor', 'assets/fonts']) {
    for (const entry of await readdir(path.join(site, folder), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const name = path.relative(site, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
      assert(name in checksums, `${name} is not recorded in scripts/asset-checksums.json`);
    }
  }
});
