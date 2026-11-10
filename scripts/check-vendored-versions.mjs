/**
 * Compare the versions of the libraries bundled under dist/assets/vendor
 * (dist/assets/vendor/versions.json) with the latest releases on npm. The
 * bundles are updated by hand (README: "Updating the libraries"); this says
 * when there is something to update.
 *
 *   node scripts/check-vendored-versions.mjs
 *
 * Prints one line per library and exits 1 when a release differs from the
 * bundle. In GitHub Actions (GITHUB_OUTPUT set) it writes `newer` (a count) and
 * `report` (the lines) as step outputs instead, and exits 0, so the Vendored
 * libraries workflow can open or update an issue.
 */
import { execSync } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';

const PACKAGES = ['@cantoo/pdf-lib', 'pdfjs-dist', '@cantoo/fontkit'];
const versions = JSON.parse(
  await readFile(new URL('../dist/assets/vendor/versions.json', import.meta.url), 'utf8'),
);
const rows = PACKAGES.map((name) => {
  // Through a shell: on Windows npm is npm.cmd. The names are the three above.
  const latest = execSync(`npm view ${name} version`, { encoding: 'utf8' }).trim();
  return { name, bundled: versions[name], latest, differs: latest !== versions[name] };
});
const lines = rows.map(
  (row) => `${row.name}: bundled ${row.bundled}, latest on npm ${row.latest}${row.differs ? ' (newer)' : ''}`,
);
console.log(lines.join('\n'));
const differing = rows.filter((row) => row.differs).length;
if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `newer=${differing}\nreport<<END_OF_REPORT\n${lines.map((line) => `- ${line}`).join('\n')}\nEND_OF_REPORT\n`,
  );
} else if (differing) process.exit(1);
