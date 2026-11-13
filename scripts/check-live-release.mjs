/**
 * After a deploy: does the live site serve the release that was just built?
 * The Pages workflow runs this once deploy-pages reports success.
 *
 *   node scripts/check-live-release.mjs <site URL> <release id> [seconds to wait]
 *
 * The release id is the one scripts/stamp-release.mjs gave the build (with
 * --github-output it is the build job's output `release`). It holds when:
 * - the home page and one tool page load app.js under this release, and
 * - app.js under this release is this release's: it imports its neighbours
 *   under the same id. (A server ignores the query, so a 200 alone would
 *   prove nothing.)
 * GitHub Pages lets caches keep every file for ten minutes under the same URL,
 * so every request carries a query of its own that no cache has stored
 * (?deploy-check=...). It asks again every ten seconds until all hold, and
 * exits 0; when the time is up (default 660 seconds) it prints an ::error::
 * line and what was served instead, and exits 1. It changes nothing on the
 * site.
 */
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The pages asked for, besides app.js: the home page and one tool page (each
// tool page is generated apart from the home page: scripts/build-pages.mjs).
export const PAGES = ['', 'merge-pdf/'];
const HEADERS = ['age', 'x-cache', 'x-served-by', 'last-modified'];
const USAGE = 'Usage: node scripts/check-live-release.mjs <site URL> <12-digit release id> [seconds]';

/** The site's address (ending in "/"), the release and the seconds to wait, or an error saying why not. */
export function parseArgs([base, release, seconds = '660']) {
  const wrong = (what) => new Error(`${what}. ${USAGE}`);
  if (!base) throw wrong('No site URL');
  let site;
  try {
    site = new URL(base.endsWith('/') ? base : `${base}/`);
  } catch {
    throw wrong(`Not a URL: ${base}`);
  }
  if (!/^https?:$/.test(site.protocol)) throw wrong(`Not a web address: ${base}`);
  if (!/^[0-9a-f]{12}$/.test(release || '')) throw wrong(`Not a release id: ${release}`);
  const limit = Number(seconds);
  if (!(limit > 0)) throw wrong(`Not a number of seconds: ${seconds}`);
  return { site, release, seconds: limit };
}

/** A page's address with a query that no cache has stored (`tag` differs on every attempt). */
export function freshUrl(site, page, tag) {
  const url = new URL(page, site);
  url.searchParams.set('deploy-check', tag);
  return url;
}

/**
 * What is wrong with what the site served, one sentence each with the evidence;
 * empty when it is all this release. `pages` are the responses for PAGES, `app`
 * for app.js under the release: { url, status, text, headers }.
 */
export function problems(release, pages, app) {
  const found = [];
  for (const page of pages) {
    const served = page.text.match(/app\.js\?v=([0-9a-f]{12})/)?.[1];
    if (page.status !== 200) found.push(`${page.url}: status ${page.status} (${page.headers})`);
    else if (served !== release)
      found.push(
        `${page.url}: loads ${served ? `the app.js of release ${served}` : 'no versioned app.js'}, not ${release} (${page.headers})`,
      );
  }
  if (app.status !== 200) found.push(`${app.url}: status ${app.status} (${app.headers})`);
  else if (!app.text.includes(`?v=${release}'`))
    found.push(`${app.url}: ${app.text.length} bytes, not the app.js of release ${release} (${app.headers})`);
  return found;
}

async function main() {
  const { site, release, seconds } = parseArgs(process.argv.slice(2));
  const start = Date.now();
  const deadline = start + seconds * 1000;
  // Every ten seconds; more often when the time given is short, so a short
  // wait still asks more than once.
  const every = Math.min(10_000, (seconds * 1000) / 4);
  const run = process.env.GITHUB_RUN_ID || 'local';
  for (let attempt = 1; ; attempt++) {
    const tag = `${run}-${Date.now()}-${attempt}`;
    const get = async (page) => {
      const url = freshUrl(site, page, tag);
      // A request that hangs ends with the wait (and at most 30 seconds in).
      const wait = Math.max(1000, Math.min(30_000, deadline - Date.now()));
      const response = await fetch(url, {
        headers: { 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(wait),
      });
      const headers = HEADERS.map((name) => `${name}: ${response.headers.get(name) ?? '-'}`);
      if (response.redirected) headers.unshift(`redirected to ${response.url}`);
      return {
        url: url.href,
        status: response.status,
        text: await response.text(),
        headers: headers.join(', '),
      };
    };
    const found = await Promise.all([Promise.all(PAGES.map(get)), get(`app.js?v=${release}`)]).then(
      ([pages, app]) => problems(release, pages, app),
      (error) => [`${site.href}: ${error.cause?.message || error.message}`],
    );
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    if (!found.length) {
      console.log(`${site.href} serves release ${release} (attempt ${attempt}, after ${elapsed} s).`);
      return;
    }
    const left = deadline - Date.now();
    if (left <= 0) {
      console.log(
        `::error::${site.href} does not serve release ${release} after ${elapsed} s (${attempt} attempts). What it served:`,
      );
      for (const problem of found) console.log(problem);
      process.exitCode = 1;
      return;
    }
    console.log(`Attempt ${attempt}, after ${elapsed} s: ${found.join('; ')}`);
    await new Promise((resolve) => setTimeout(resolve, Math.min(every, left)));
  }
}

/**
 * Run as a script, not imported (as in scripts/vendor-pdfjs.mjs): real paths
 * are compared, as the repository may be reached through a linked folder.
 */
function runAsScript() {
  try {
    const self = realpathSync(fileURLToPath(import.meta.url));
    return path.relative(realpathSync(process.argv[1]), self) === '';
  } catch {
    return false; // no script was named, or what was named is not a file
  }
}
if (runAsScript())
  await main().catch((error) => {
    console.log(`::error::${error.message}`);
    process.exitCode = 1;
  });
