import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';

const file = process.argv[2];
if (!file) throw new Error('Indiquez le ZIP du Chrome Web Store.');
const entries = unzipSync(await readFile(file));
const names = Object.keys(entries);
if (!entries['manifest.json']) throw new Error('manifest.json doit être à la racine du ZIP.');
const manifest = JSON.parse(Buffer.from(entries['manifest.json']).toString('utf8'));
const sourceFiles = names.filter((name) => /^(?:src|tests|docs|scripts)\//.test(name));
if (sourceFiles.length) throw new Error(`Fichiers source interdits : ${sourceFiles.join(', ')}`);

const banned = [
  /cdn\.jsdelivr\.net/i,
  /unpkg\.com/i,
  /cdnjs\.cloudflare\.com/i,
  /workerBlobURL/i,
  /importScripts\s*\(\s*["'`]https?:/i,
  /\.importScripts\s*\(\s*[a-z_$][\w$]*\s*\)/i,
  /new\s+Worker\s*\(\s*["'`]https?:/i,
];
const failures = [];
for (const name of names) {
  if (!/\.(?:js|mjs|html)$/i.test(name)) continue;
  const source = Buffer.from(entries[name]).toString('utf8');
  for (const pattern of banned) if (pattern.test(source)) failures.push(`${name} : ${pattern}`);
}
if (failures.length) throw new Error(`Code distant détecté dans le ZIP :\n${failures.join('\n')}`);
console.log(
  `ZIP Store valide : version ${manifest.version}, ${names.length} fichiers, manifeste à la racine, aucun code CDN distant.`,
);
