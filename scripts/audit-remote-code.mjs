import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const root = resolve('dist');
const executable = [];
async function walk(directory) {
  for (const entry of await readdir(directory)) {
    const path = join(directory, entry);
    if ((await stat(path)).isDirectory()) await walk(path);
    else if (/\.(?:js|mjs|html)$/i.test(entry)) executable.push(path);
  }
}
await walk(root);

const banned = [
  /cdn\.jsdelivr\.net/i,
  /unpkg\.com/i,
  /cdnjs\.cloudflare\.com/i,
  /workerBlobURL/i,
  /new\s+Blob\s*\(\s*\[[^\]]*importScripts/is,
  /importScripts\s*\(\s*["'`]https?:/i,
  /\.importScripts\s*\(\s*[a-z_$][\w$]*\s*\)/i,
  /new\s+Worker\s*\(\s*["'`]https?:/i,
];
const failures = [];
for (const path of executable) {
  const source = await readFile(path, 'utf8');
  for (const pattern of banned)
    if (pattern.test(source)) failures.push(`${relative(root, path)} : ${pattern}`);
}
if (failures.length)
  throw new Error(`Code distant détecté dans le paquet :\n${failures.join('\n')}`);

const worker = await readFile(join(root, 'vendor/ocr/worker.min.js'), 'utf8');
if (!worker.includes('./local-core-v') || !worker.includes('./local-language-data/'))
  throw new Error('Le Worker OCR local verrouillé est absent du paquet.');
console.log(`${executable.length} fichiers exécutables contrôlés : aucun code CDN distant.`);
