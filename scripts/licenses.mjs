import { readdir, readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const packages = [];
await mkdir('public/licenses', { recursive: true });
for (const [path, value] of Object.entries(lock.packages)) {
  if (!path || !path.includes('node_modules/')) continue;
  let p;
  try {
    p = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
  } catch {
    continue;
  }
  const name = p.name ?? path.split('node_modules/').at(-1),
    id = `${name.replace(/[@/]/g, '_')}-${p.version}`;
  const texts = [];
  for (const file of await readdir(path))
    if (/^(licen[sc]e|copying|notice)(\.|$)/i.test(file)) {
      try {
        const data = await readFile(join(path, file), 'utf8');
        texts.push(data);
      } catch {}
    }
  if (texts.length) await writeFile(`public/licenses/${id}.txt`, texts.join('\n\n'));
  packages.push({
    name,
    version: p.version,
    license: p.license ?? value.license ?? 'Voir le paquet',
    developmentOnly: !!value.dev,
    notice: texts.length ? `licenses/${id}.txt` : null,
  });
}
packages.push(
  {
    name: 'Noto Sans',
    version: 'embarquée / SHA-256 assets-lock.json',
    license: 'OFL-1.1',
    notice: 'fonts/OFL.txt',
  },
  {
    name: 'tessdata_fast (fra, eng)',
    version: '4.1.0',
    license: 'Apache-2.0',
    notice:
      'licenses/tesseract.js-core-' +
      JSON.parse(await readFile('node_modules/tesseract.js-core/package.json', 'utf8')).version +
      '.txt',
  },
);
packages.sort((a, b) => a.name.localeCompare(b.name));
await writeFile('public/licenses.json', JSON.stringify(packages, null, 2));
await mkdir('docs', { recursive: true });
const p = JSON.parse(await readFile('package.json', 'utf8'));
const direct = packages.filter(
  (x) => x.name in p.dependencies || x.name === 'Noto Sans' || x.name.startsWith('tessdata'),
);
await writeFile(
  'docs/LICENSES.md',
  '# Bibliothèques et licences\n\nInventaire généré depuis package-lock.json. Notices complètes et dépendances transitives : `public/licenses/` et `public/licenses.json`, également embarqués dans la distribution.\n\n| Bibliothèque | Version | Licence |\n|---|---|---|\n' +
    direct.map((x) => `| ${x.name} | ${x.version} | ${x.license} |`).join('\n') +
    '\n',
);
// Pin every direct dependency to the exact audited installed version.
for (const kind of ['dependencies', 'devDependencies'])
  for (const name of Object.keys(p[kind]))
    p[kind][name] = JSON.parse(
      await readFile(join('node_modules', name, 'package.json'), 'utf8'),
    ).version;
await writeFile('package.json', JSON.stringify(p, null, 2) + '\n');
console.log(`${packages.length} licences inventoriées.`);
