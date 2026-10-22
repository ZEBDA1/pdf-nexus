import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { auditExecutable } from './vendor-policy.mjs';

const version = JSON.parse(await readFile('public/manifest.json', 'utf8')).version;
const file = process.argv[2] ?? `release/pdf-nexus-${version}.zip`;
const entries = unzipSync(await readFile(file));
const names = Object.keys(entries);
if (!entries['manifest.json']) throw new Error('manifest.json doit être à la racine du ZIP.');
const manifest = JSON.parse(Buffer.from(entries['manifest.json']).toString('utf8'));
const sourceFiles = names.filter((name) => /^(?:src|tests|docs|scripts)\//.test(name));
if (sourceFiles.length) throw new Error(`Fichiers source interdits : ${sourceFiles.join(', ')}`);

const failures = [];
for (const name of names) {
  if (!/\.(?:js|mjs|html)$/i.test(name)) continue;
  const source = Buffer.from(entries[name]).toString('utf8');
  failures.push(...auditExecutable(name, source));
}
if (failures.length) throw new Error(`Audit du ZIP refusé :\n${failures.join('\n')}`);
console.log(
  `ZIP contrôlé : version ${manifest.version}, ${names.length} fichiers, manifeste à la racine, aucun code CDN ni repli IE signalé.`,
);
