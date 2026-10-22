import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync } from 'fflate';
const files = {};
async function walk(dir, prefix = '') {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + e.name;
    if (e.isDirectory()) await walk(join(dir, e.name), name + '/');
    else files[name] = new Uint8Array(await readFile(join(dir, e.name)));
  }
}
await walk('dist');
const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
for (const size of ['16', '32', '48', '128'])
  if (!files[manifest.icons[size]]) throw new Error(`Icône ${size} manquante.`);
for (const path of [
  'vendor/ocr/worker.min.js',
  'vendor/pdfjs/pdf.worker.mjs',
  'vendor/BUILD-NOTES.txt',
  'vendor/ocr/fra.traineddata',
  'vendor/ocr/eng.traineddata',
  'fonts/NotoSans-Regular.ttf',
  'licenses.json',
  'background.js',
  'permissions.html',
  '_locales/fr/messages.json',
  '_locales/en/messages.json',
])
  if (!files[path]) throw new Error(`Ressource manquante : ${path}`);
await mkdir('release', { recursive: true });
await writeFile(`release/pdf-nexus-${manifest.version}.zip`, zipSync(files, { level: 6 }));
for (const key of Object.keys(files)) delete files[key];
for (const directory of ['src', 'public', 'docs', 'tests', 'scripts'])
  await walk(directory, directory + '/');
for (const name of [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'playwright.config.ts',
  'editor.html',
  'popup.html',
  'permissions.html',
  'assets-lock.json',
  'README.md',
  'LICENSE',
  '.gitignore',
  '.gitattributes',
  '.prettierrc.json',
  '.prettierignore',
])
  files[name] = new Uint8Array(await readFile(name));
await writeFile(`release/pdf-nexus-source-${manifest.version}.zip`, zipSync(files, { level: 6 }));
console.log(
  `Extension prête : dist/, release/pdf-nexus-${manifest.version}.zip et archive source complète.`,
);
