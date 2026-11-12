/**
 * Bring the PDF.js bundled under dist/assets/vendor to the pdfjs-dist version
 * installed in node_modules, together with every record of it.
 *
 *   npm install --save-dev --save-exact pdfjs-dist@<version>
 *   node scripts/vendor-pdfjs.mjs            write the files and the records
 *   node scripts/vendor-pdfjs.mjs --check    say what differs and write nothing (exit 1 if anything does)
 *
 * Bundled: the two legacy builds (pdf.min.mjs and pdf.worker.min.mjs, served as
 * pdf.mjs and pdf.worker.mjs) and the cmaps, iccs, standard_fonts and wasm
 * folders, without the scripting sandbox and its notices (NOT_BUNDLED below):
 * the two builds do not refer to it, which is checked here.
 * Recorded: the version in dist/assets/vendor/versions.json and in
 * dist/licenses/THIRD-PARTY.txt, each file's size and SHA-256 in
 * scripts/asset-checksums.json, the npm tarball and each file's SHA-256 in
 * scripts/vendor-license-provenance.json, and PDF.js's own licence text.
 *
 * A file that is new upstream is bundled, and one that is gone is removed: both
 * are listed. Read that list and the release notes before committing, then run
 * `npm test` and the browser tests (README: "Updating the libraries").
 * tests/site-integrity.test.mjs makes the same comparison, of the files and of
 * the records (pdfjsBundle and pdfjsRecords below), so neither can drift from
 * the package the Node suites use. npm is asked for the tarball only when the
 * provenance record is renewed: a check needs no network.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = path.join(root, 'node_modules/pdfjs-dist');
const vendor = path.join(root, 'dist/assets/vendor');
const BUILDS = { 'pdf.mjs': 'legacy/build/pdf.min.mjs', 'pdf.worker.mjs': 'legacy/build/pdf.worker.min.mjs' };
const FOLDERS = ['cmaps', 'iccs', 'standard_fonts', 'wasm'];
// The scripting sandbox (QuickJS, for JavaScript inside PDFs) and its licence
// notices. The builds served here never load it.
const NOT_BUNDLED = [
  'wasm/quickjs-eval.js',
  'wasm/quickjs-eval.wasm',
  'wasm/LICENSE_QUICKJS',
  'wasm/LICENSE_PDFJS_QUICKJS',
];

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const read = (file) => readFile(path.join(root, file));
const json = async (file) => JSON.parse(await read(file));
const text = (value) => JSON.stringify(value, null, 2) + '\n';
/** The files under a folder, as paths from `base` with forward slashes. */
async function filesUnder(base, folder) {
  const entries = await readdir(path.join(base, folder), { recursive: true, withFileTypes: true }).catch(
    () => [],
  );
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(base, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();
}

/** The installed pdfjs-dist: its version, and what package-lock.json holds for it. */
async function installed() {
  const { version } = await json('node_modules/pdfjs-dist/package.json').catch((error) => {
    throw error.code === 'ENOENT' ? new Error('pdfjs-dist is not installed: run npm ci') : error;
  });
  const locked = (await json('package-lock.json')).packages['node_modules/pdfjs-dist'];
  if (locked?.version !== version)
    throw new Error(
      `node_modules has pdfjs-dist ${version}, package-lock.json has ${locked?.version}: run npm ci`,
    );
  return { version, locked };
}

/**
 * The bundle compared with the installed package: `files` maps each bundled
 * path (under dist/assets/vendor) to its file in the package and that file's
 * bytes; `changed`, `added` and `removed` name the bundled paths that differ.
 */
export async function pdfjsBundle() {
  const { version, locked } = await installed();
  const upstream = new Map(Object.entries(BUILDS));
  for (const folder of FOLDERS)
    for (const name of await filesUnder(pkg, folder))
      if (!NOT_BUNDLED.includes(name)) upstream.set(name, name);
  const held = new Set(Object.keys(BUILDS));
  for (const folder of FOLDERS) for (const name of await filesUnder(vendor, folder)) held.add(name);
  const files = new Map(),
    changed = [],
    added = [];
  for (const [name, source] of upstream) {
    const data = await readFile(path.join(pkg, source));
    if (name in BUILDS && data.includes('quickjs'))
      throw new Error(
        `${source} refers to the scripting sandbox, which is not bundled: decide whether it should be`,
      );
    files.set(name, { source, data });
    const bundled = held.has(name) ? await readFile(path.join(vendor, name)).catch(() => null) : null;
    if (!bundled) added.push(name);
    else if (!bundled.equals(data)) changed.push(name);
  }
  return {
    version,
    locked,
    files,
    changed,
    added,
    removed: [...held].filter((name) => !upstream.has(name)),
  };
}

/** The npm tarball of the installed version: where it is, its SHA-256, and its integrity. */
async function tarball({ version, locked }) {
  // The version goes into a command line.
  if (!/^[0-9A-Za-z.+-]+$/.test(version)) throw new Error(`pdfjs-dist has an odd version: ${version}`);
  const folder = await mkdtemp(path.join(tmpdir(), 'pdfjs-'));
  try {
    // npm pack writes into the folder it runs in, so no path is in the command: a
    // temporary folder with a space in its name would split it. Through a shell
    // because on Windows npm is npm.cmd.
    execFileSync('npm', ['pack', `pdfjs-dist@${version}`, '--silent'], {
      cwd: folder,
      shell: true,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    const data = await readFile(path.join(folder, `pdfjs-dist-${version}.tgz`));
    const integrity = 'sha512-' + createHash('sha512').update(data).digest('base64');
    if (integrity !== locked.integrity)
      throw new Error(`the tarball npm gave for pdfjs-dist ${version} is not the one in package-lock.json`);
    return { tarball: locked.resolved, tarball_sha256: sha256(data), tarball_integrity: integrity };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/**
 * The records of the bundle as the installed package wants them: `records` is
 * each file with its contents, `stale` the files that differ now, `before` the
 * version recorded so far. The provenance record names the npm tarball. Where
 * it names another version, or another tarball than package-lock.json, it is
 * stale; npm is asked for the tarball only to `renew` it.
 */
export async function pdfjsRecords({ bundle, renew = false } = {}) {
  const { version, locked, files, removed } = bundle ?? (await pdfjsBundle());
  const versions = await json('dist/assets/vendor/versions.json'),
    checksums = await json('scripts/asset-checksums.json'),
    provenance = await json('scripts/vendor-license-provenance.json'),
    notices = String(await read('dist/licenses/THIRD-PARTY.txt')),
    licence = await readFile(path.join(pkg, 'LICENSE')),
    before = versions['pdfjs-dist'];

  // The records as they should be, each in the order it has now, with new files at the end.
  versions['pdfjs-dist'] = version;
  const key = (name) => 'assets/vendor/' + name;
  for (const name of removed) delete checksums[key(name)];
  for (const [name, { data }] of files) checksums[key(name)] = { bytes: data.length, sha256: sha256(data) };
  // versions.json is one of the recorded files itself.
  checksums[key('versions.json')] = {
    bytes: Buffer.byteLength(text(versions)),
    sha256: sha256(text(versions)),
  };
  const record = provenance.pdfjs,
    known = new Set(record.verified_assets.map((asset) => asset.path));
  record.verified_assets = record.verified_assets
    .filter((asset) => files.has(asset.path.replace('dist/assets/vendor/', '')))
    .map((asset) => ({
      ...asset,
      sha256: sha256(files.get(asset.path.replace('dist/assets/vendor/', '')).data),
    }));
  for (const [name, { source, data }] of files)
    if (!known.has('dist/' + key(name)))
      record.verified_assets.push({ path: 'dist/' + key(name), upstream_path: source, sha256: sha256(data) });
  const named =
    record.version === version &&
    record.tarball === locked.resolved &&
    record.tarball_integrity === locked.integrity;
  if (!named)
    Object.assign(
      record,
      { version },
      renew
        ? await tarball({ version, locked })
        : { tarball: locked.resolved, tarball_sha256: null, tarball_integrity: locked.integrity },
    );
  record.not_vendored = NOT_BUNDLED.map(
    (name) => name + ' (the scripting sandbox and its notices: the two builds do not refer to it)',
  );
  const line = /^PDF\.js \(pdfjs-dist\) \S+, legacy browser build$/m;
  if (!line.test(notices)) throw new Error('dist/licenses/THIRD-PARTY.txt: the PDF.js line was not found');

  const records = [
    ['dist/assets/vendor/versions.json', text(versions)],
    ['scripts/asset-checksums.json', text(checksums)],
    ['scripts/vendor-license-provenance.json', text(provenance)],
    [
      'dist/licenses/THIRD-PARTY.txt',
      notices.replace(line, `PDF.js (pdfjs-dist) ${version}, legacy browser build`),
    ],
    ['dist/licenses/pdfjs-Apache-2.0.txt', licence],
  ];
  const stale = [];
  for (const [file, wanted] of records)
    if (!Buffer.from(wanted).equals(await read(file).catch(() => Buffer.alloc(0)))) stale.push(file);
  return { records, stale, before };
}

async function main() {
  const check = process.argv.includes('--check');
  const bundle = await pdfjsBundle(),
    { version, files, changed, added, removed } = bundle;
  const { records, stale, before } = await pdfjsRecords({ bundle, renew: !check });

  const list = (title, names) =>
    names.length && console.log(`${title}:\n${names.map((name) => '  ' + name).join('\n')}`);
  console.log(`pdfjs-dist ${version} in node_modules; the bundle records ${before}.`);
  list('Files that differ from the package', changed);
  list('New in the package, not bundled yet', added);
  list('Bundled, but no longer in the package', removed);
  list('Records to bring up to date', stale);
  const differs = changed.length + added.length + removed.length + stale.length;
  if (!differs) return console.log('The bundle and its records match the package.');
  if (check) {
    console.log('Nothing was written (--check). Run node scripts/vendor-pdfjs.mjs to update.');
    process.exitCode = 1;
    return;
  }
  for (const name of removed) await rm(path.join(vendor, name));
  for (const name of [...changed, ...added]) {
    await mkdir(path.dirname(path.join(vendor, name)), { recursive: true });
    await copyFile(path.join(pkg, files.get(name).source), path.join(vendor, name));
  }
  for (const [file, wanted] of records)
    if (stale.includes(file)) await writeFile(path.join(root, file), wanted);
  console.log('Updated. Read the release notes, then run npm test and the browser tests.');
}

// Run as a script, not imported. (path.relative compares as the system does: on
// Windows, without regard to the case of a drive letter.)
if (process.argv[1] && path.relative(path.resolve(process.argv[1]), fileURLToPath(import.meta.url)) === '')
  await main().catch((error) => {
    // What went wrong and what to do about it, without the stack.
    console.error(error.message);
    process.exitCode = 1;
  });
