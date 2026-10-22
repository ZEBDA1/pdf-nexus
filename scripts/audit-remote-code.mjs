import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { auditExecutable } from './vendor-policy.mjs';

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

const failures = [];
for (const path of executable) {
  const source = await readFile(path, 'utf8');
  failures.push(...auditExecutable(relative(root, path), source));
}
if (failures.length) throw new Error(`Audit du code refusé :\n${failures.join('\n')}`);

const worker = await readFile(join(root, 'vendor/ocr/worker.min.js'), 'utf8');
if (!worker.includes('./local-core-v') || !worker.includes('./local-language-data/'))
  throw new Error('Le Worker OCR local verrouillé est absent du paquet.');
console.log(
  `${executable.length} fichiers exécutables contrôlés : aucun code CDN ni repli IE signalé.`,
);
