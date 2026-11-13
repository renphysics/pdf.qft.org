import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { rmSync } from 'node:fs';
import { appendFile, cp, mkdtemp, readdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TOOL_PAGES } from '../dist/routes.js';

// The Pages workflow versions asset URLs on a copy of dist/ before upload
// (scripts/stamp-release.mjs). Check that every reference it versions still
// resolves, that each module keeps one URL, and that releases are deterministic.
const root = fileURLToPath(new URL('../', import.meta.url));
const site = path.join(root, 'dist');
const script = path.join(root, 'scripts/stamp-release.mjs');
const toolPages = [...new Set(Object.values(TOOL_PAGES))].map((slug) => `${slug}/index.html`);
// Every module beside index.html: app.js, the editor's modules, the engine and the rest.
const modules = (await readdir(site)).filter((name) => name.endsWith('.js')).sort();
const files = [
  'index.html',
  'licenses/index.html',
  'licenses/licenses.css',
  ...toolPages,
  ...modules,
  'style.css',
  'studio.css',
  'batch.css',
  'assets/vendor/pdf.mjs',
  'assets/vendor/pdf.worker.mjs',
  'assets/vendor/pdf-lib.min.js',
  'assets/vendor/fontkit.umd.min.js',
  'assets/fonts/NotoSans-Regular.ttf',
  'assets/fonts/NotoSansCJKsc-Regular.otf',
];
const workspace = await mkdtemp(path.join(tmpdir(), 'qft-stamp-'));
async function copySite(name) {
  const target = path.join(workspace, name);
  for (const file of files) await cp(path.join(site, file), path.join(target, file));
  return target;
}
const stamp = (directory) =>
  execFileSync(process.execPath, [script, directory], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const hash = async (file) =>
  createHash('sha256')
    .update(await readFile(file))
    .digest('hex')
    .slice(0, 12);

// Removed when the process ends, however it ends (a hook after the tests would run after the first of them).
process.on('exit', () => rmSync(workspace, { recursive: true, force: true }));

// One stamped copy of the site, read by the tests below.
const first = await copySite('first');
stamp(first);
const read = (name) => readFile(path.join(first, name), 'utf8');
const html = await read('index.html');
const release = html.match(/src="\.\/app\.js\?v=([0-9a-f]{12})"/)?.[1];
const engineUrl = `'./pdf-engine.js?v=${release}'`;
// The modules app.js imports statically are preloaded, with the release, on every page.
const preloads = [...html.matchAll(/rel="modulepreload" href="\.\/([\w-]+\.js)\?v=([0-9a-f]{12})"/g)];
const vendor = (file) => path.join(first, 'assets/vendor', file);

await test('every page loads the same versioned release: app.js, the stylesheets and the preloads', async () => {
  assert(release, 'index.html must load a versioned app.js');
  for (const sheet of ['style', 'studio', 'batch'])
    assert(html.includes(`href="./${sheet}.css?v=${release}"`), `${sheet}.css versioned`);
  const licenses = await read('licenses/index.html');
  for (const sheet of ['../style', '../studio', './licenses'])
    assert(licenses.includes(`href="${sheet}.css?v=${release}"`), `licenses page ${sheet}.css versioned`);
  assert(
    preloads.length >= 2 && preloads.every((match) => match[2] === release),
    'index.html preloads the release modules',
  );
  // Every tool page loads the same release as the home page.
  for (const name of toolPages) {
    const page = await read(name);
    assert(page.includes(`src="../app.js?v=${release}"`), `${name} loads the release's app.js`);
    for (const sheet of ['style', 'studio', 'batch'])
      assert(page.includes(`href="../${sheet}.css?v=${release}"`), `${name} ${sheet}.css versioned`);
    assert.equal(
      page.match(/rel="modulepreload" href="\.\.\/[\w-]+\.js\?v=/g)?.length,
      preloads.length,
      `${name} preloads the modules`,
    );
  }
});

// Each module must be imported through exactly one URL, or it would load twice.
await test('one URL per module: every import between modules carries the release', async () => {
  for (const name of modules) {
    for (const [, specifier, version] of (await read(name)).matchAll(
      /(?:from |import\()'(\.\/[\w-]+\.js)(\?v=[0-9a-f]{12})?'/g,
    )) {
      assert.equal(version, `?v=${release}`, `${name} imports ${specifier} with the release`);
    }
  }
  const app = await read('app.js');
  assert(
    app.includes(`import('./editor.js?v=${release}')`) &&
      app.includes(`from './editor-core.js?v=${release}'`),
    'app.js loads the release editor on demand',
  );
  assert(
    (await read('editor.js')).includes(`from './documents.js?v=${release}'`),
    'editor.js imports the release',
  );
  assert(
    (await read('documents.js')).includes(`new URL('./export-worker.js?v=${release}', import.meta.url)`),
    'export worker versioned',
  );
  const preview = await read('preview.js');
  assert(preview.includes(`from './layout.js?v=${release}'`) && preview.includes(`from ${engineUrl}`));
  assert((await read('export-worker.js')).includes(`from ${engineUrl}`));
  assert((await read('workflows.js')).includes(`from ${engineUrl}`));
  const batchUi = await read('batch-ui.js');
  assert(batchUi.includes(`from ${engineUrl}`) && batchUi.includes(`from './workflows.js?v=${release}'`));
  assert(
    (await read('pdf-engine.js')).includes(`from './layout.js?v=${release}'`),
    'the engine imports the release layout',
  );
});

await test('engine bundles and fonts are versioned by their own bytes', async () => {
  const preview = await read('preview.js');
  assert(preview.includes(`import('./assets/vendor/pdf.mjs?v=${await hash(vendor('pdf.mjs'))}')`));
  assert(
    preview.includes(`assetUrl('./assets/vendor/pdf.worker.mjs?v=${await hash(vendor('pdf.worker.mjs'))}')`),
  );
  const engine = await read('pdf-engine.js');
  assert(
    engine.includes(`new URL('./assets/vendor/pdf-lib.min.js?v=${await hash(vendor('pdf-lib.min.js'))}'`),
  );
  assert(
    engine.includes(
      `new URL('./assets/vendor/fontkit.umd.min.js?v=${await hash(vendor('fontkit.umd.min.js'))}'`,
    ),
  );
  // A page asks for PDF.js and pdf-lib at the first sign of intent (warm-engines) under the same
  // addresses: a second spelling would be a second download, and a second copy of PDF.js.
  const pdfjsLink = `assets/vendor/pdf.mjs?v=${await hash(vendor('pdf.mjs'))}`;
  const pdfLibLink = `assets/vendor/pdf-lib.min.js?v=${await hash(vendor('pdf-lib.min.js'))}`;
  for (const [name, up] of [['index.html', './'], ...toolPages.map((page) => [page, '../'])]) {
    const page = await read(name);
    assert(
      page.includes(`<link rel="modulepreload" href="${up}${pdfjsLink}">`),
      `${name}: PDF.js link versioned`,
    );
    assert(
      page.includes(`<link rel="preload" as="script" href="${up}${pdfLibLink}">`),
      `${name}: pdf-lib link versioned`,
    );
  }
  // Fonts too: the app keeps them in Cache Storage under this URL.
  for (const font of ['NotoSans-Regular.ttf', 'NotoSansCJKsc-Regular.otf']) {
    assert(
      engine.includes(
        `new URL('./assets/fonts/${font}?v=${await hash(path.join(first, 'assets/fonts', font))}'`,
      ),
      `${font} versioned by its bytes`,
    );
  }
});

await test('every versioned reference points at a real file, and every reference is versioned', async () => {
  let checked = 0;
  for (const name of files.filter((file) => /\.(?:html|js)$/.test(file) && !file.startsWith('assets/'))) {
    const text = await read(name);
    for (const match of text.matchAll(/["'](\.{1,2}\/[^"'?]+)\?v=[0-9a-f]{12}["']/g)) {
      await stat(path.join(first, path.dirname(name), match[1]));
      checked++;
    }
  }
  // 4 per page (home and tools: three stylesheets and app.js) plus its preloads (the editor's in the
  // warm-editor template too) and the two engines in warm-engines, 3 on the licenses page (its own
  // stylesheet too), every import between modules, the export worker, PDF.js worker, pdf-lib and fontkit
  // URLs, and two fonts.
  let expected = (4 + preloads.length + 2) * (1 + toolPages.length) + 3 + 4 + 2;
  for (const name of modules)
    expected += [
      ...(await readFile(path.join(site, name), 'utf8')).matchAll(
        /(?:\bfrom\s*|\bimport\s*\(\s*)'\.\/[^']+'/g,
      ),
    ].length;
  assert.equal(
    checked,
    expected,
    'every versioned reference: pages, imports between modules, workers and engines',
  );
});

await test('stamping fails on a page that lost a link it is expected to version', async () => {
  // Each warm-up link has a rule that expects it, so a page written another way fails here
  // and not on a visitor's connection: a link left unversioned is a download of its own.
  const cases = [
    ['<link rel="preload" as="script" href="../assets/vendor/pdf-lib.min.js">', /expected 1 match.*pdf-lib/],
    ['<link rel="modulepreload" href="../assets/vendor/pdf.mjs">', /expected 1 match.*pdf\\\.mjs/],
    ['<link rel="modulepreload" href="../documents.js">', /expected \d+ match.*modulepreload/],
  ];
  for (const [index, [lost, message]] of cases.entries()) {
    const copy = await copySite(`lost-${index}`);
    const name = path.join(copy, toolPages[0]);
    const page = await readFile(name, 'utf8');
    assert(page.includes(lost), `${toolPages[0]} has ${lost}`);
    await writeFile(name, page.replace(lost, ''));
    assert.throws(() => stamp(copy), message, `stamping a page without ${lost} must fail`);
  }
});

await test('stamping is single-shot and deterministic, and the release changes with first-party content, an engine or a font', async () => {
  assert.throws(() => stamp(first), /already stamped/);
  /** The release of a fresh copy of the site, stamped after `change` (a file and what is added to it). */
  const releaseOf = async (name, change) => {
    const copy = await copySite(name);
    if (change) await appendFile(path.join(copy, change[0]), change[1]);
    stamp(copy);
    return (await readFile(path.join(copy, 'index.html'), 'utf8')).match(/app\.js\?v=([0-9a-f]{12})/)[1];
  };
  assert.equal(await releaseOf('second'), release, 'the same site, the same release');
  assert.notEqual(await releaseOf('changed', ['studio.css', '\n/* edit */\n']), release);
  // An engine or a font alone: the modules that name it change with it, so it is a
  // release of its own. (Under one id a browser could keep the module that names the
  // engine before, and the check after a deploy could not tell old from new.)
  for (const file of [
    'assets/vendor/pdf.mjs',
    'assets/vendor/pdf.worker.mjs',
    'assets/vendor/pdf-lib.min.js',
    'assets/vendor/fontkit.umd.min.js',
    'assets/fonts/NotoSans-Regular.ttf',
    'assets/fonts/NotoSansCJKsc-Regular.otf',
  ])
    assert.notEqual(
      await releaseOf(`changed-${path.basename(file)}`, [file, '\n']),
      release,
      `another ${file} is another release`,
    );
});

await test('with --github-output, and only then, the release id is written as a step output', async () => {
  // The Pages workflow passes it to the check after the deploy
  // (scripts/check-live-release.mjs). GITHUB_OUTPUT is set in every step, and
  // test jobs stamp copies too, so the script writes it only when asked.
  const output = path.join(workspace, 'github-output');
  await writeFile(output, 'earlier=1\n');
  const stampWith = (args, env) =>
    execFileSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
  const withOutput = { ...process.env, GITHUB_OUTPUT: output };
  const asked = await copySite('output');
  stampWith(['--github-output', asked], withOutput);
  const stamped = (await readFile(path.join(asked, 'index.html'), 'utf8')).match(
    /src="\.\/app\.js\?v=([0-9a-f]{12})"/,
  )[1];
  assert.equal(stamped, release, 'the same files make the same release');
  assert.equal(
    await readFile(output, 'utf8'),
    `earlier=1\nrelease=${stamped}\n`,
    'the release stamped into index.html is added to the step outputs, after what was there',
  );
  stampWith([await copySite('unasked')], withOutput);
  assert.equal(await readFile(output, 'utf8'), `earlier=1\nrelease=${stamped}\n`, 'not written unless asked');
  // Asked for outside GitHub Actions: refused before anything is stamped.
  const outside = { ...process.env };
  delete outside.GITHUB_OUTPUT;
  const refused = await copySite('refused');
  assert.throws(() => stampWith([refused, '--github-output'], outside), /GITHUB_OUTPUT is not set/);
  assert(
    (await readFile(path.join(refused, 'index.html'), 'utf8')).includes('src="./app.js"'),
    'nothing stamped when refused',
  );
});

await test('the site-integrity suite passes on a stamped copy, as the Pages workflow runs it before it deploys', async () => {
  // pages.yml stamps dist/ and then runs tests/site-integrity.test.mjs on it. A
  // check there that reads only unstamped addresses would stop every deploy.
  const copy = path.join(workspace, 'deploy');
  await cp(site, path.join(copy, 'dist'), { recursive: true });
  for (const file of [
    'tests/site-integrity.test.mjs',
    'package.json',
    'package-lock.json',
    'LICENSE',
    'scripts/asset-checksums.json',
    'scripts/vendor-license-provenance.json',
    'scripts/vendor-pdfjs.mjs',
  ])
    await cp(path.join(root, file), path.join(copy, file));
  // The installed packages too: the suite compares the bundled PDF.js and its records with pdfjs-dist.
  await symlink(path.join(root, 'node_modules'), path.join(copy, 'node_modules'), 'junction');
  stamp(path.join(copy, 'dist'));
  // Run on its own, as the workflow does: not as a part of this test run.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  try {
    execFileSync(process.execPath, [path.join(copy, 'tests/site-integrity.test.mjs')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
  } catch (error) {
    assert.fail(`site-integrity fails on a stamped copy:\n${error.stdout || ''}${error.stderr || ''}`);
  }
});
