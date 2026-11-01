/**
 * Serve the site locally, as GitHub Pages would: for browser tests and previews.
 *
 *   node scripts/serve.mjs [directory] [port] [path prefix] [--release]
 *
 * Defaults: dist, port 4173, prefix "/". With --release, a copy of the site is
 * stamped like a deployment (scripts/stamp-release.mjs) and served instead, so
 * tests can load the versioned release under the GitHub project path, for
 * example "/pdf.qft.org/". Files are sent uncached, with GitHub Pages' types.
 */
import { createServer } from 'node:http';
import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter((arg) => arg !== '--release');
const release = process.argv.includes('--release');
let root = path.resolve(project, args[0] || 'dist');
const port = Number(args[1] || 4173);
const prefix = args[2] || '/';
if (!prefix.startsWith('/') || !prefix.endsWith('/')) throw new Error('The path prefix starts and ends with "/".');

if (release) {
  const copy = path.join(project, 'tests/output', `release-site-${port}`);
  await rm(copy, { recursive: true, force: true });
  await mkdir(path.dirname(copy), { recursive: true });
  await cp(root, copy, { recursive: true });
  execFileSync(process.execPath, [path.join(project, 'scripts/stamp-release.mjs'), copy], { stdio: 'inherit' });
  root = copy;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.pfb': 'application/octet-stream', '.bcmap': 'application/octet-stream', '.icc': 'application/octet-stream',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml', '.webmanifest': 'application/manifest+json',
};

createServer(async (request, response) => {
  try {
    const address = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!address.startsWith(prefix)) throw Object.assign(new Error('outside the site'), { status: 404 });
    let file = path.join(root, address.slice(prefix.length));
    if (file !== root && !file.startsWith(root + path.sep)) throw Object.assign(new Error('outside the site'), { status: 403 });
    if ((await stat(file).catch(() => null))?.isDirectory()) file = path.join(file, 'index.html');
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    response.writeHead(error.status || 404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Serving ${path.relative(project, root) || '.'} at http://127.0.0.1:${port}${prefix}`));
