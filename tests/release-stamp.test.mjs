import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, cp, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_PAGES } from '../dist/routes.js';

// The Pages workflow versions asset URLs on a copy of dist/ before upload
// (scripts/stamp-release.mjs). Check that every reference it versions still
// resolves, that each module keeps one URL, and that releases are deterministic.
const root = fileURLToPath(new URL('../', import.meta.url));
const site = path.join(root, 'dist');
const script = path.join(root, 'scripts/stamp-release.mjs');
const toolPages = [...new Set(Object.values(TOOL_PAGES))].map((slug) => `${slug}/index.html`);
const files = [
  'index.html', 'licenses/index.html', ...toolPages, 'app.js', 'routes.js', 'layout.js', 'preview.js', 'pdf-engine.js',
  'export-worker.js', 'workflows.js', 'batch-ui.js', 'style.css', 'studio.css', 'batch.css',
  'assets/vendor/pdf.mjs', 'assets/vendor/pdf.worker.mjs', 'assets/vendor/pdf-lib.min.js', 'assets/vendor/fontkit.umd.min.js',
];
const workspace = await mkdtemp(path.join(tmpdir(), 'qft-stamp-'));
async function copySite(name) {
  const target = path.join(workspace, name);
  for (const file of files) await cp(path.join(site, file), path.join(target, file));
  return target;
}
const stamp = (directory) =>
  execFileSync(process.execPath, [script, directory], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const hash = async (file) => createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 12);

try {
  const first = await copySite('first');
  stamp(first);
  const read = (name) => readFile(path.join(first, name), 'utf8');
  const html = await read('index.html');
  const release = html.match(/src="\.\/app\.js\?v=([0-9a-f]{12})"/)?.[1];
  assert(release, 'index.html must load a versioned app.js');
  for (const sheet of ['style', 'studio', 'batch']) assert(html.includes(`href="./${sheet}.css?v=${release}"`), `${sheet}.css versioned`);
  const licenses = await read('licenses/index.html');
  for (const sheet of ['style', 'studio']) assert(licenses.includes(`href="../${sheet}.css?v=${release}"`), `licenses page ${sheet}.css versioned`);
  // Every tool page loads the same release as the home page.
  for (const name of toolPages) {
    const page = await read(name);
    assert(page.includes(`src="../app.js?v=${release}"`), `${name} loads the release's app.js`);
    for (const sheet of ['style', 'studio', 'batch']) assert(page.includes(`href="../${sheet}.css?v=${release}"`), `${name} ${sheet}.css versioned`);
  }

  // Each module must be imported through exactly one URL, or it would load twice.
  const engineUrl = `'./pdf-engine.js?v=${release}'`;
  const app = await read('app.js');
  assert(app.includes(`from ${engineUrl}`) && app.includes(`from './workflows.js?v=${release}'`) && app.includes(`from './batch-ui.js?v=${release}'`));
  assert(app.includes(`from './routes.js?v=${release}'`), 'routes.js versioned');
  assert(app.includes(`from './layout.js?v=${release}'`) && app.includes(`from './preview.js?v=${release}'`));
  assert(app.includes(`new URL('./export-worker.js?v=${release}', import.meta.url)`), 'export worker versioned');
  const preview = await read('preview.js');
  assert(preview.includes(`from './layout.js?v=${release}'`) && preview.includes(`from ${engineUrl}`));
  assert((await read('export-worker.js')).includes(`from ${engineUrl}`));
  assert((await read('workflows.js')).includes(`from ${engineUrl}`));
  const batchUi = await read('batch-ui.js');
  assert(batchUi.includes(`from ${engineUrl}`) && batchUi.includes(`from './workflows.js?v=${release}'`));

  // Engine bundles are versioned by their own bytes.
  const vendor = (file) => path.join(first, 'assets/vendor', file);
  assert(preview.includes(`import('./assets/vendor/pdf.mjs?v=${await hash(vendor('pdf.mjs'))}')`));
  assert(preview.includes(`assetUrl('./assets/vendor/pdf.worker.mjs?v=${await hash(vendor('pdf.worker.mjs'))}')`));
  const engine = await read('pdf-engine.js');
  assert(engine.includes(`from './layout.js?v=${release}'`), 'the engine imports the release layout');
  assert(engine.includes(`new URL('./assets/vendor/pdf-lib.min.js?v=${await hash(vendor('pdf-lib.min.js'))}'`));
  assert(engine.includes(`new URL('./assets/vendor/fontkit.umd.min.js?v=${await hash(vendor('fontkit.umd.min.js'))}'`));

  // Every versioned reference still points at a real file.
  let checked = 0;
  for (const name of files.filter((file) => /\.(?:html|js)$/.test(file) && !file.startsWith('assets/'))) {
    const text = await read(name);
    for (const match of text.matchAll(/["'](\.{1,2}\/[^"'?]+)\?v=[0-9a-f]{12}["']/g)) {
      await stat(path.join(first, path.dirname(name), match[1]));
      checked++;
    }
  }
  const expected = 4 + 2 + 4 * toolPages.length + 7 + 4 + 4 + 1 + 1 + 2;
  assert.equal(checked, expected, 'versioned references: 4 per page (home and tools), 2 licenses, 7 app.js, 4 preview, 4 engine, 1 export worker, 1 workflows, 2 batch');

  // Stamping is single-shot, deterministic, and changes with first-party content.
  assert.throws(() => stamp(first), /already stamped/);
  const second = await copySite('second');
  stamp(second);
  assert.equal((await readFile(path.join(second, 'index.html'), 'utf8')).match(/app\.js\?v=([0-9a-f]{12})/)[1], release);
  const changed = await copySite('changed');
  await appendFile(path.join(changed, 'studio.css'), '\n/* edit */\n');
  stamp(changed);
  assert.notEqual((await readFile(path.join(changed, 'index.html'), 'utf8')).match(/app\.js\?v=([0-9a-f]{12})/)[1], release);
  console.log(JSON.stringify({ status: 'passed', checks: ['versioned modules, styles and engines', 'one URL per module', `${checked} references resolve`, 'deterministic release id'] }, null, 2));
} finally {
  await rm(workspace, { recursive: true, force: true });
}
