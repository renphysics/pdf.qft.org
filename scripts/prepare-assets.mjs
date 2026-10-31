import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Assemble the unchanged font from chunks kept below the repository API's
// upload limit. This is packaging only: the deployed font is byte-identical
// to the original licensed font, and no remote download is needed.
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../vendor/fonts/manifest.json', import.meta.url), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const buffers = [];
for (const part of manifest.parts) {
  const bytes = await readFile(path.join(root, part.path));
  if (bytes.length !== part.size || sha256(bytes) !== part.sha256) {
    throw new Error(`Font chunk integrity check failed: ${part.path}`);
  }
  buffers.push(bytes);
}
const font = Buffer.concat(buffers);
if (font.length !== manifest.size || sha256(font) !== manifest.sha256) {
  throw new Error('Reconstructed font integrity check failed.');
}
const target = path.join(root, manifest.output);
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, font);
console.log(`Prepared ${manifest.output} (${font.length} bytes; SHA-256 verified).`);
