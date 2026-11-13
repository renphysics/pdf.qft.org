import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { rmSync } from 'node:fs';
import { cp, mkdtemp, readdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { TOOL_PAGES } from '../dist/routes.js';
import { freshUrl, PAGES, parseArgs, problems } from '../scripts/check-live-release.mjs';

// The GitHub Actions workflows, which cannot run here: how the browser jobs get
// Playwright's image, the rules every workflow keeps, and the check after a
// deploy (scripts/check-live-release.mjs), run against a local server. The
// workflows are read as text, without a YAML library: each job is the block
// under its name in `jobs:`.
const root = fileURLToPath(new URL('../', import.meta.url));
const folder = path.join(root, '.github/workflows');
const workflows = Object.fromEntries(
  await Promise.all(
    (await readdir(folder))
      .filter((name) => /\.ya?ml$/.test(name))
      .map(async (name) => [name, await readFile(path.join(folder, name), 'utf8')]),
  ),
);
const run = promisify(execFile);
const workspace = await mkdtemp(path.join(tmpdir(), 'qft-ci-'));
// Removed when the process ends, however it ends.
process.on('exit', () => rmSync(workspace, { recursive: true, force: true }));

const indent = (line) => line.match(/^ */)[0].length;
const meaningful = (line) => line.trim() && !line.trim().startsWith('#');
/** A line without the comment after its value. */
const bare = (line) => line.replace(/\s+#.*$/, '');
/**
 * The lines under lines[at] that are indented further: the value of a key. A
 * comment indented no further belongs to what follows.
 */
function under(lines, at) {
  const found = [];
  for (const line of lines.slice(at + 1)) {
    if (line.trim() && indent(line) <= indent(lines[at])) break;
    found.push(line);
  }
  return found;
}
/** Each job of a workflow, by id: { lines, needs, outputs, steps }. */
function jobsOf(text) {
  const lines = text.split('\n');
  const all = under(lines, lines.indexOf('jobs:'));
  const jobs = {};
  all.forEach((line, at) => {
    const id = line.match(/^ {2}([\w-]+):\s*$/)?.[1];
    if (!id) return;
    const body = under(all, at);
    const needs = body.find((entry) => /^ {4}needs:/.test(entry))?.replace(/^ {4}needs:\s*/, '') ?? '';
    const outputsAt = body.findIndex((entry) => /^ {4}outputs:\s*$/.test(entry));
    const outputs = Object.fromEntries(
      (outputsAt < 0 ? [] : under(body, outputsAt))
        .map((entry) => entry.match(/^\s+([\w-]+):\s*(.+)$/))
        .filter(Boolean)
        .map((match) => [match[1], match[2]]),
    );
    const steps = body.map((entry) => entry.match(/^\s+(?:- )?id:\s*([\w-]+)\s*$/)?.[1]).filter(Boolean);
    jobs[id] = {
      lines: body,
      needs: needs
        .replace(/[[\]\s]/g, '')
        .split(',')
        .filter(Boolean),
      outputs,
      steps,
    };
  });
  return jobs;
}
/** The script of the step with this id, as the runner gets it (the block under `run: |`). */
function scriptOf(job, stepId) {
  const at = job.lines.findIndex((line) => new RegExp(`^\\s+(?:- )?id:\\s*${stepId}\\s*$`).test(line));
  assert(at >= 0, `no step with id ${stepId}`);
  const runAt = job.lines.findIndex((line, index) => index > at && /^\s+run: \|\s*$/.test(line));
  assert(runAt > at, `the step ${stepId} has no "run: |" script`);
  const body = under(job.lines, runAt);
  const margin = Math.min(...body.filter(meaningful).map(indent));
  return body.map((line) => line.slice(margin)).join('\n');
}
/**
 * The permissions a block grants: { scope: level }, or { '*': level } for
 * read-all and the like. However they are written: as lines under the key, on
 * the key's own line ({ contents: read }), with or without a comment after.
 */
function permissionsIn(lines) {
  const found = [];
  const pairs = (entries) =>
    Object.fromEntries(entries.filter((entry) => entry.trim()).map((entry) => entry.trim().split(/:\s*/)));
  lines.forEach((line, at) => {
    const match = bare(line).match(/^(\s*)permissions:\s*(.*?)\s*$/);
    if (!match) return;
    const [, margin, value] = match;
    const inline = value.match(/^\{(.*)\}$/);
    found.push({
      indent: margin.length,
      grants: inline
        ? pairs(inline[1].split(','))
        : value
          ? { '*': value }
          : pairs(under(lines, at).filter(meaningful).map(bare)),
    });
  });
  return found;
}
const readOnly = (grants) =>
  Object.values(grants).every((level) => ['read', 'none', 'read-all'].includes(level));

const test_yml = jobsOf(workflows['test.yml']);
const pages_yml = jobsOf(workflows['pages.yml']);

await test('the browser jobs run in the Playwright image that the image job names, and no workflow installs browsers', () => {
  const { browser, image } = test_yml;
  assert(image && browser, 'test.yml has the jobs "image" and "browser"');
  assert.deepEqual(browser.needs, ['image'], 'the browser jobs wait for the image job');
  const container = browser.lines.findIndex((line) => /^ {4}container:\s*$/.test(line));
  assert(container >= 0, 'the browser jobs run in a container');
  const settings = under(browser.lines, container).map((line) => line.trim());
  assert(
    settings.includes('image: ${{ needs.image.outputs.name }}'),
    `the container is the image job's output, not a name written in the file: ${settings.join(' | ')}`,
  );
  assert(
    settings.includes('options: --user 1001 --ipc=host'),
    "the container runs as the runner's user (1001), with --ipc=host for Chromium",
  );
  assert.equal(
    image.outputs.name,
    '${{ steps.image.outputs.name }}',
    'the image job outputs its step\'s "name"',
  );
  for (const [name, text] of Object.entries(workflows)) {
    const installs = text
      .split('\n')
      .filter(meaningful)
      .filter((line) => /playwright\s+install|install-deps/.test(line));
    assert.deepEqual(installs, [], `${name} installs browsers or their system packages again`);
  }
});

await test("the image job's script names the image of the installed Playwright, from the real package-lock.json", async () => {
  // The step's own script, run as the runner runs it (bash -e), on the real
  // lockfile: it fails here if the lockfile changes shape or the script drifts.
  const script = path.join(workspace, 'image.sh');
  await writeFile(script, scriptOf(test_yml.image, 'image'));
  const output = path.join(workspace, 'image-output');
  await writeFile(output, '');
  await run('bash', ['-e', script], { cwd: root, env: { ...process.env, GITHUB_OUTPUT: output } });
  const installed = JSON.parse(
    await readFile(path.join(root, 'node_modules/@playwright/test/package.json'), 'utf8'),
  ).version;
  assert.equal(
    await readFile(output, 'utf8'),
    `name=mcr.microsoft.com/playwright:v${installed}-noble\n`,
    `the image job must name Playwright ${installed}'s Ubuntu 24.04 image (if the lockfile names another version, run npm ci)`,
  );
  // Without the entry, the step fails and says why, instead of naming an image that does not exist.
  const elsewhere = path.join(workspace, 'no-playwright');
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  delete lock.packages['node_modules/@playwright/test'];
  await cp(script, path.join(elsewhere, 'image.sh'));
  await writeFile(path.join(elsewhere, 'package-lock.json'), JSON.stringify(lock));
  const failed = await run('bash', ['-e', 'image.sh'], {
    cwd: elsewhere,
    env: { ...process.env, GITHUB_OUTPUT: output },
  }).then(
    () => null,
    (error) => error,
  );
  assert(failed, 'the image step fails when package-lock.json has no @playwright/test');
  assert.match(failed.stdout, /::error::package-lock\.json gives no version of @playwright\/test/);
});

await test('every action is pinned to a commit, with its version beside it', () => {
  // README, "GitHub Pages": the workflows use pinned action revisions. Dependabot
  // updates the commit and the comment together.
  let count = 0;
  for (const [name, text] of Object.entries(workflows))
    for (const line of text.split('\n').filter(meaningful)) {
      const uses = line.match(/^\s*(?:- )?uses:\s*(.+)$/)?.[1];
      if (!uses) continue;
      count++;
      if (uses.startsWith('./')) continue; // a workflow of this repository
      assert.match(
        uses,
        /^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+(?:\.\d+)*$/,
        `${name}: "${uses}" is not pinned to a 40-character commit with a "# v..." comment`,
      );
    }
  assert(count >= 10, `only ${count} "uses:" lines were found: is the reader still reading the workflows?`);
});

await test('the jobs that run the container can only read: no write permission and no secrets', () => {
  // test.yml runs in pull requests and is called by pages.yml, whose caller
  // job's permissions are the most it gets.
  const tests = workflows['test.yml'].split('\n');
  const granted = permissionsIn(tests);
  assert(
    granted.some((entry) => entry.indent === 0),
    'test.yml sets its permissions (otherwise the repository default applies)',
  );
  for (const { grants } of granted)
    assert(readOnly(grants), `test.yml grants more than read: ${JSON.stringify(grants)}`);
  assert.deepEqual(
    tests
      .filter(meaningful)
      .map(bare)
      .filter((line) => /\bsecrets\b/.test(line)),
    [],
    'test.yml uses no secrets, however they are written (secrets.X, secrets[...], toJSON(secrets))',
  );
  const pages = workflows['pages.yml'].split('\n');
  const top = permissionsIn(pages).find((entry) => entry.indent === 0);
  assert(top && readOnly(top.grants), 'pages.yml reads only, unless a job says otherwise');
  const callers = Object.entries(pages_yml).filter(([, job]) =>
    job.lines.some((line) => /uses:\s*\.\/\.github\/workflows\/test\.yml/.test(line)),
  );
  assert.equal(callers.length, 1, 'pages.yml calls test.yml once');
  const [, caller] = callers[0];
  for (const { grants } of permissionsIn(caller.lines))
    assert(readOnly(grants), `the job that calls test.yml grants more than read: ${JSON.stringify(grants)}`);
  assert(
    !caller.lines.some((line) => /^\s+secrets:/.test(line)),
    'the job that calls test.yml passes no secrets',
  );
  // The reader itself: every way a workflow can write a grant.
  const read = (text) => permissionsIn(text.split('\n')).map((entry) => entry.grants);
  assert.deepEqual(read('permissions: write-all # for the report'), [{ '*': 'write-all' }]);
  assert.deepEqual(read('    permissions: { contents: write, pages: write }'), [
    { contents: 'write', pages: 'write' },
  ]);
  assert.deepEqual(read('permissions: {}'), [{}]);
  assert.deepEqual(read('permissions:\n  contents: read # the checkout\n  id-token: write'), [
    { contents: 'read', 'id-token': 'write' },
  ]);
  for (const [grants, only] of [
    [{ '*': 'write-all' }, false],
    [{ contents: 'write' }, false],
    [{ contents: 'read', 'id-token': 'write' }, false],
    [{ contents: 'read' }, true],
    [{ '*': 'read-all' }, true],
    [{}, true],
  ])
    assert.equal(
      readOnly(grants),
      only,
      `${JSON.stringify(grants)} read as ${only ? 'more than' : 'only'} read`,
    );
});

await test('every job output is wired at both ends, and no job waits on itself', () => {
  for (const [name, text] of Object.entries(workflows)) {
    const jobs = jobsOf(text);
    for (const [id, job] of Object.entries(jobs)) {
      for (const needed of job.needs)
        assert(jobs[needed], `${name}: ${id} needs ${needed}, which is not a job`);
      for (const [, from, output] of job.lines.join('\n').matchAll(/needs\.([\w-]+)\.outputs\.([\w-]+)/g)) {
        assert(job.needs.includes(from), `${name}: ${id} reads needs.${from} without needing it`);
        assert(jobs[from].outputs[output], `${name}: ${from} has no output "${output}" for ${id}`);
      }
      for (const [output, value] of Object.entries(job.outputs))
        for (const [, step] of value.matchAll(/steps\.([\w-]+)\.outputs/g))
          assert(
            job.steps.includes(step),
            `${name}: the output ${id}.${output} names a step ${step} it lacks`,
          );
    }
    // Jobs that need nothing go first, then those whose needs went before.
    const done = new Set();
    for (let progress = true; progress;) {
      progress = false;
      for (const [id, job] of Object.entries(jobs))
        if (!done.has(id) && job.needs.every((needed) => done.has(needed))) {
          done.add(id);
          progress = true;
        }
    }
    const waiting = Object.keys(jobs).filter((id) => !done.has(id));
    assert.deepEqual(waiting, [], `${name}: these jobs wait on each other in a circle`);
  }
});

await test('after the deploy, the live job checks the release the build stamped, for longer than Pages caches a file', () => {
  const { build, deploy, live } = pages_yml;
  assert(build && deploy && live, 'pages.yml has the jobs build, deploy and live');
  assert.match(
    scriptOf(build, 'stamp'),
    /node scripts\/stamp-release\.mjs dist --github-output\n/,
    'the build stamps dist/ and writes the release as a step output',
  );
  assert.equal(build.outputs.release, '${{ steps.stamp.outputs.release }}');
  assert.equal(deploy.outputs.page_url, '${{ steps.deployment.outputs.page_url }}');
  assert.deepEqual(live.needs.toSorted(), ['build', 'deploy']);
  const body = live.lines.join('\n');
  // Through env, not written into the script: a value is never run as shell.
  assert.match(body, /PAGE_URL: \$\{\{ needs\.deploy\.outputs\.page_url \}\}/);
  assert.match(body, /RELEASE: \$\{\{ needs\.build\.outputs\.release \}\}/);
  // The whole line: nothing after the check that would let it fail unseen (|| true).
  const command = body.match(
    /^\s+run: node scripts\/check-live-release\.mjs "\$PAGE_URL" "\$RELEASE" (\d+)\s*$/m,
  );
  assert(command, 'the live job runs the check, and nothing else on that line');
  const seconds = Number(command[1]);
  assert(seconds > 600, `the check waits ${seconds} s: GitHub Pages lets caches keep a file for 600 s`);
  const timeouts = live.lines.filter((line) => /^\s+timeout-minutes:/.test(line));
  assert.deepEqual(timeouts.map(indent), [4], 'one time limit, the job’s own: none on a step cuts the wait');
  const minutes = Number(timeouts[0].match(/(\d+)/)[1]);
  assert(
    minutes * 60 > seconds + 60,
    `the job's ${minutes} minutes leave the ${seconds} s check too little room`,
  );
  // Nothing that lets the job pass without the check, runs it after a deploy that
  // failed or was skipped, or runs it where the script is not.
  assert.deepEqual(
    live.lines
      .filter(meaningful)
      .filter((line) => /^\s+(?:- )?(?:if|continue-on-error|working-directory|shell):/.test(line)),
    [],
    'the live job has no condition, no continue-on-error and no other working directory',
  );
  // One deploy at a time, and one that runs is never cancelled (README, "What a deploy does").
  const lines = workflows['pages.yml'].split('\n');
  assert.deepEqual(
    under(lines, lines.indexOf('concurrency:'))
      .filter(meaningful)
      .map((line) => line.trim()),
    ['group: pages', 'cancel-in-progress: false'],
    'pages.yml: one group for every deploy, never cancelled in progress',
  );
});

await test('the live check: its arguments, its addresses and what it counts as this release', () => {
  const { site, release, seconds } = parseArgs(['https://pdf.qft.org', '0123456789ab']);
  assert.equal(site.href, 'https://pdf.qft.org/', 'a site address without its last "/" is the folder');
  assert.equal(seconds, 660, 'by default it waits longer than the ten minutes caches may keep a file');
  for (const args of [
    [],
    ['pdf.qft.org', release],
    ['ftp://pdf.qft.org/', release],
    ['https://pdf.qft.org/', '0123'],
    ['https://pdf.qft.org/', release, '0'],
  ])
    assert.throws(() => parseArgs(args), /Usage/, `wrong arguments are refused: ${args.join(' ')}`);
  const project = new URL('https://example.github.io/pdf.qft.org/');
  const first = freshUrl(project, 'merge-pdf/', 'run-1');
  assert.equal(first.href, 'https://example.github.io/pdf.qft.org/merge-pdf/?deploy-check=run-1');
  assert.equal(
    freshUrl(project, `app.js?v=${release}`, 'run-2').href,
    `https://example.github.io/pdf.qft.org/app.js?v=${release}&deploy-check=run-2`,
    'the release query is kept, and the check query added',
  );
  const page = (text, status = 200) => ({ url: 'page', status, text, headers: '' });
  const pages = PAGES.map(() => page(`<script type="module" src="./app.js?v=${release}"></script>`));
  const app = page(`import { x } from './editor-core.js?v=${release}';`);
  assert.deepEqual(problems(release, pages, app), [], 'this release, everywhere');
  assert.match(problems(release, [pages[0], page('src="../app.js?v=ba9876543210"')], app)[0], /ba9876543210/);
  assert.match(problems(release, [pages[0], page('src="../app.js"')], app)[0], /no versioned app\.js/);
  assert.match(
    problems(release, pages, page("from './editor-core.js?v=ba9876543210'"))[0],
    /not the app\.js/,
  );
  assert.match(problems(release, pages, page('Not found', 404))[0], /status 404/);
});

// Two stamped copies of the site, of two releases, served the way GitHub Pages
// serves the project address, from a server in this process.
const site = path.join(root, 'dist');
const files = [
  'index.html',
  'licenses/index.html',
  'licenses/licenses.css',
  ...[...new Set(Object.values(TOOL_PAGES))].map((slug) => `${slug}/index.html`),
  ...(await readdir(site)).filter((name) => name.endsWith('.js')),
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
async function stamped(name, change) {
  const target = path.join(workspace, name);
  for (const file of files) await cp(path.join(site, file), path.join(target, file));
  if (change) await appendFile(path.join(target, 'studio.css'), change);
  await run(process.execPath, [path.join(root, 'scripts/stamp-release.mjs'), target]);
  const release = (await readFile(path.join(target, 'index.html'), 'utf8')).match(
    /app\.js\?v=([0-9a-f]{12})/,
  )[1];
  return { root: target, release };
}
const older = await stamped('older', '\n/* the release before */\n');
const newer = await stamped('newer');
const prefix = '/pdf.qft.org/';
// What the server answers: a file of a copy, chosen per address by `serving`.
let serving = () => newer.root;
const requests = [];
const server = createServer(async (request, response) => {
  requests.push(request.url);
  const address = new URL(request.url, 'http://localhost').pathname;
  const copy = address.startsWith(prefix) && serving(address.slice(prefix.length));
  const file =
    copy && path.join(copy, address.slice(prefix.length), address.endsWith('/') ? 'index.html' : '');
  const body = file && (await readFile(file).catch(() => null));
  response.writeHead(body ? 200 : 404, { 'Cache-Control': 'no-store', Age: '0' });
  response.end(body || 'Not found');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
// It does not keep the process alive once the tests are done, failed or not.
server.unref();
const base = `http://127.0.0.1:${server.address().port}${prefix}`;
/** Run the check as the workflow does; its exit code, what it printed and how long it took. */
async function check(url, release, seconds) {
  const start = Date.now();
  const script = path.join(root, 'scripts/check-live-release.mjs');
  // Stopped after 30 s (its code is then null): a check that hangs fails its test, not the whole run.
  const { code = 0, stdout } = await run(process.execPath, [script, url, release, String(seconds)], {
    timeout: 30_000,
  }).catch((error) => error);
  return { code, stdout, elapsed: (Date.now() - start) / 1000 };
}

await test('the live check passes when the site serves the release, and asks past every cache', async () => {
  serving = () => newer.root;
  requests.length = 0;
  const result = await check(base, newer.release, 5);
  assert.equal(result.code, 0, `the right release passes:\n${result.stdout}`);
  assert.match(result.stdout, new RegExp(`serves release ${newer.release} \\(attempt 1,`));
  assert.equal(requests.length, 3, 'the home page, a tool page and app.js');
  assert(
    requests.every((url) => /[?&]deploy-check=[\w-]+$/.test(url)),
    `each request has a query of its own: ${requests.join(' ')}`,
  );
});

await test('the live check waits for the release while the old one is still served', async () => {
  // Serves the old release for a second, as a cache would, then the new one.
  const switched = Date.now() + 1000;
  serving = () => (Date.now() < switched ? older.root : newer.root);
  requests.length = 0;
  const result = await check(base, newer.release, 6);
  assert.equal(result.code, 0, `it passes once the new release is served:\n${result.stdout}`);
  assert.match(result.stdout, new RegExp(`Attempt 1, .*loads the app.js of release ${older.release}`));
  assert.match(result.stdout, /serves release \w+ \(attempt [2-9],/);
  assert.equal(new Set(requests).size, requests.length, `no address is asked twice: ${requests.join(' ')}`);
});

await test('the live check fails, with what was served, when the time runs out on another release', async () => {
  serving = () => older.root;
  const result = await check(base, newer.release, 1.5);
  assert.equal(result.code, 1, 'another release fails');
  assert(result.elapsed >= 1.5, `it gave up after ${result.elapsed} s of the 1.5 s it was given`);
  assert.match(result.stdout, new RegExp(`::error::${base} does not serve release ${newer.release} after`));
  assert.match(result.stdout, /\(([2-9]|\d{2,}) attempts\)/, 'it asked more than once');
  // The annotation itself carries the evidence (its lines joined by %0A, as GitHub
  // reads them): the run's summary page shows the annotation, not the log.
  const annotation = result.stdout.split('\n').filter((line) => line.startsWith('::error::'));
  assert.equal(annotation.length, 1, 'one annotation');
  const [, served] = annotation[0].split('What it served:');
  assert.match(
    served,
    new RegExp(`%0A\\S+merge-pdf/\\?deploy-check=\\S+: loads the app.js of release ${older.release}`),
    'the annotation lists what was served',
  );
  assert.match(served, /%0AWhat to do: README, "When a deploy goes wrong"\.$/, 'and where to read on');
  assert.match(
    await readFile(path.join(root, 'README.md'), 'utf8'),
    /^#+ When a deploy goes wrong$/m,
    'the README has the section the annotation names',
  );
});

await test('the live check reads the tool page and app.js too, not only the home page', async () => {
  // The home page of the new release, the rest of the old one.
  serving = (file) => (file === '' ? newer.root : older.root);
  const toolPage = await check(base, newer.release, 1);
  assert.equal(toolPage.code, 1, `a tool page of the old release fails:\n${toolPage.stdout}`);
  assert.match(toolPage.stdout, /merge-pdf\/\S+: loads the app\.js of release/);
  // Every page of the new release, and app.js of the old one: it answers 200 under the new query.
  serving = (file) => (file === 'app.js' ? older.root : newer.root);
  const app = await check(base, newer.release, 1);
  assert.equal(app.code, 1, `the old app.js under the new release's address fails:\n${app.stdout}`);
  assert.match(app.stdout, /app\.js\?v=\w+&deploy-check=\S+: \d+ bytes, not the app\.js of release/);
});

await test('the live check fails on a missing site and on a host that does not answer', async () => {
  const missing = await check(`http://127.0.0.1:${server.address().port}/elsewhere/`, newer.release, 1);
  assert.equal(missing.code, 1, 'a 404 fails');
  assert.match(missing.stdout, /elsewhere\/\?deploy-check=\S+: status 404/);
  // A port that was just closed: nothing answers there.
  const closed = createServer();
  await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve));
  const { port } = closed.address();
  await new Promise((resolve) => closed.close(resolve));
  const gone = await check(`http://127.0.0.1:${port}/`, newer.release, 1);
  assert.equal(gone.code, 1, 'an unreachable host fails');
  assert.match(gone.stdout, /::error::/);
  assert.match(gone.stdout, /ECONNREFUSED/, 'and says why');
  assert.match(
    gone.stdout,
    new RegExp(`http://127\\.0\\.0\\.1:${port}/\\S*\\?\\S*deploy-check=\\S+: [^%]*ECONNREFUSED`),
    'and which address did not answer',
  );
});

await test('the live check gives up on an answer that never ends, when its time is up', async () => {
  // Headers and the start of a page, and then nothing: without a limit of its own the
  // check would wait until the job's fifteen minutes ran out, and say nothing.
  const sockets = new Set();
  const hanging = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.write('<html>');
  });
  hanging.on('connection', (socket) => sockets.add(socket));
  await new Promise((resolve) => hanging.listen(0, '127.0.0.1', resolve));
  try {
    const result = await check(`http://127.0.0.1:${hanging.address().port}/`, newer.release, 2);
    assert.equal(result.code, 1, `an answer that never ends fails:\n${result.stdout}`);
    assert(result.elapsed < 8, `it gave up after ${result.elapsed} s of the 2 s it was given`);
    assert.match(
      result.stdout,
      /::error::.*deploy-check=\S+: [^%]*timeout/i,
      'and says which address timed out',
    );
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => hanging.close(resolve));
  }
});
