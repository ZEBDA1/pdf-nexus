import { mkdir, cp, readFile, writeFile, access, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { pdfJsForChrome } from './vendor-policy.mjs';
const root = resolve('public');
await mkdir(join(root, 'vendor/ocr/core'), { recursive: true });
await mkdir(join(root, 'fonts'), { recursive: true });
const tesseractWorker = await readFile('node_modules/tesseract.js/dist/worker.min.js', 'utf8');
const localTesseractWorker = tesseractWorker
  // Explicit local paths are supplied at runtime. Remove upstream CDN fallbacks
  // as well, so no executable resource can leave the MV3 extension package.
  .replaceAll('https://cdn.jsdelivr.net/npm/tesseract.js-core@v', './local-core-v')
  .replaceAll('https://cdn.jsdelivr.net/npm/@tesseract.js-data/', './local-language-data/')
  .replace(
    'r.g.importScripts(l)',
    'r.g.importScripts(self.location.origin+"/vendor/ocr/core/tesseract-core-simd-lstm.wasm.js")',
  );
if (
  localTesseractWorker === tesseractWorker ||
  /cdn\.jsdelivr\.net/i.test(localTesseractWorker) ||
  localTesseractWorker.includes('r.g.importScripts(l)') ||
  !localTesseractWorker.includes('core/tesseract-core-simd-lstm.wasm.js')
)
  throw new Error('Les chemins distants du Worker OCR n’ont pas été neutralisés.');
await writeFile(join(root, 'vendor/ocr/worker.min.js'), localTesseractWorker);
for (const name of await readdir('node_modules/tesseract.js-core'))
  if (/\.wasm\.js$/.test(name))
    await cp(`node_modules/tesseract.js-core/${name}`, join(root, 'vendor/ocr/core', name));
for (const dir of ['cmaps', 'standard_fonts', 'wasm'])
  await cp(`node_modules/pdfjs-dist/${dir}`, join(root, 'vendor/pdfjs', dir), { recursive: true });
const pdfWorker = pdfJsForChrome(
  await readFile('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', 'utf8'),
).replace(/^\/\/# sourceMappingURL=.*$/gm, '');
await writeFile(join(root, 'vendor/pdfjs/pdf.worker.mjs'), pdfWorker);
await writeFile(
  join(root, 'vendor/BUILD-NOTES.txt'),
  `PDF Nexus - packaged dependency build notes

PDF.js 6.4.299 (Apache-2.0)
Upstream: node_modules/pdfjs-dist/legacy/build/pdf.mjs and pdf.worker.mjs.
These are the unminified compatibility builds. In BOTH files, the entire core-js
internals/object-create.js module is replaced by module.exports = Object.create.
Chrome / Edge 131+ provide native Object.create, including in Web Workers.
The removed module contained obsolete ActiveX, hidden-iframe and script-writing
fallbacks. No equivalent script construction or execution remains in its place.
Other recent-API polyfills are retained to preserve Chrome 131 compatibility.
The replacement is guarded by the upstream module's SHA-256, not a loose search.
See scripts/vendor-policy.mjs in the source archive for the exact transformation.

ExcelJS 4.4.0 (MIT)
Uses upstream dist/exceljs.bare.js, the unminified browser bundle without core-js
polyfills, instead of the default polyfilled dist/exceljs.min.js browser entry.
The same alias applies to the editor and the document-processing Web Worker.

Nexus application bundles and processing worker: Vite build.minify = false.
No obfuscator, encrypted code, string-table encoding or remote executable loader
is added by the build. Upstream library notices are included in licenses/.

OCR: the upstream Tesseract worker and WASM libraries remain packaged locally.
Its CDN fallbacks and dynamic core import are replaced with extension-local paths
by scripts/assets.mjs. This local-only restriction is checked again in the ZIP.
`,
);
const downloads = [
  [
    'vendor/ocr/eng.traineddata',
    'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/eng.traineddata',
  ],
  [
    'vendor/ocr/fra.traineddata',
    'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/fra.traineddata',
  ],
  [
    'fonts/NotoSans-Regular.ttf',
    'https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf',
  ],
  ['fonts/OFL.txt', 'https://raw.githubusercontent.com/notofonts/noto-fonts/main/LICENSE'],
];
const lockPath = resolve('assets-lock.json');
let lock = {};
try {
  lock = JSON.parse(await readFile(lockPath, 'utf8'));
} catch {}
for (const [path, url] of downloads) {
  const dest = join(root, path);
  let bytes;
  try {
    await access(dest);
    bytes = await readFile(dest);
  } catch {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Asset ${url}: ${r.status}`);
    bytes = Buffer.from(await r.arrayBuffer());
  }
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (lock[path] && lock[path].sha256 !== sha)
    throw new Error(`Checksum modifié pour ${path}. Vérifier la source avant mise à jour.`);
  await writeFile(dest, bytes);
  lock[path] = { url, sha256: sha };
  console.log(path, bytes.length);
}
await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
function crc(b) {
  let c = 0xffffffff;
  for (const n of b) {
    c ^= n;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type),
    length = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([length, t, data, checksum]);
}
await mkdir(join(root, 'icons'), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const border = x < size * 0.08 || y < size * 0.08 || x > size * 0.92 || y > size * 0.92;
      const line =
        x > size * 0.3 &&
        x < size * 0.7 &&
        ((y > size * 0.33 && y < size * 0.4) ||
          (y > size * 0.48 && y < size * 0.55) ||
          (y > size * 0.63 && y < size * 0.7));
      raw[i] = line ? 255 : 96;
      raw[i + 1] = line ? 255 : 85;
      raw[i + 2] = line ? 255 : 239;
      raw[i + 3] = border ? 0 : 255;
    }
  const hdr = Buffer.alloc(13);
  hdr.writeUInt32BE(size);
  hdr.writeUInt32BE(size, 4);
  hdr[8] = 8;
  hdr[9] = 6;
  await writeFile(
    join(root, 'icons', `${size}.png`),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', hdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
