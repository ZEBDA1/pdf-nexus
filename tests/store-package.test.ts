import { describe, expect, it } from 'vitest';
import { readFile, writeFile, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { zipSync, strToU8 } from 'fflate';
import { auditExecutable, pdfJsForChrome } from '../scripts/vendor-policy.mjs';

const rejectedEditor = `var SCRIPT = 'script'; var JS = 'java' + SCRIPT + ':';
var NullProtoObjectViaActiveX = function (activeXDocument) {
  activeXDocument.write('<script></script>');
};`;
const rejectedWorker = `function NullProtoObject() {
  try { activeXDocument = new ActiveXObject('htmlfile'); } catch (error) {}
}`;

describe('Régression Red Titanium et Blue Argon', () => {
  for (const name of ['pdf.mjs', 'pdf.worker.mjs']) {
    it(`supprime le repli complet de ${name} et conserve Object.create natif`, async () => {
      const original = await readFile(`node_modules/pdfjs-dist/legacy/build/${name}`, 'utf8');
      expect(auditExecutable(name, original).length).toBeGreaterThan(0);
      const transformed = pdfJsForChrome(original);
      expect(auditExecutable(name, transformed)).toEqual([]);
      expect(transformed).not.toContain('document.F=Object');
      const start = transformed.indexOf(
        '// MODULE: ./node_modules/core-js/internals/object-create.js',
      );
      const end = transformed.indexOf('// MODULE:', start + 10);
      const create = runInNewContext(
        transformed.slice(start, end) + '\nobject_create_namespaceFn();',
        {
          Object,
          __webpack_require__: {
            cw: (factory: (module: { exports: unknown }) => void) => {
              const module = { exports: {} };
              factory(module);
              return () => module.exports;
            },
          },
        },
      ) as typeof Object.create;
      expect(create).toBe(Object.create);
      expect(Object.getPrototypeOf(create(null))).toBeNull();
      const prototype = { inherited: 42 };
      const object = create(prototype, { answer: { value: 7, enumerable: true } });
      expect(Object.getPrototypeOf(object)).toBe(prototype);
      expect(object.answer).toBe(7);
      expect(Object.keys(object)).toEqual(['answer']);
      expect(() => Reflect.apply(create, Object, [4])).toThrow(TypeError);
      expect(() => pdfJsForChrome(original.replace('old IE, WSH', 'changed upstream'))).toThrow(
        'a changé',
      );
    });
  }

  it('refuse les deux extraits signalés et la construction du schéma après minification', () => {
    for (const snippet of [rejectedEditor, rejectedWorker, 'var t="java"+f+":";'])
      expect(auditExecutable('bundle.js', snippet).length).toBeGreaterThan(0);
    expect(auditExecutable('bundle.js', 'const object = Object.create(null);')).toEqual([]);
    expect(auditExecutable('lodash.js', 'var uid = keys.IE_PROTO;')).toEqual([]);
  });

  it('vérifie le bundle ExcelJS réellement choisi sans supprimer la conversion', async () => {
    const source = await readFile('node_modules/exceljs/dist/exceljs.bare.js', 'utf8');
    expect(auditExecutable('exceljs.bare.js', source)).toEqual([]);
    expect(source).toContain('Workbook');
  });

  it('bloque toujours les Workers distants et les imports OCR dynamiques', () => {
    for (const source of [
      'new Worker("https://example.org/worker.js")',
      'global.importScripts(corePathImportFile)',
      'const worker = "https://cdn.jsdelivr.net/npm/tesseract.js"',
    ])
      expect(auditExecutable('worker.js', source).length).toBeGreaterThan(0);
  });

  for (const [label, source, accepted] of [
    ['local', 'const object = Object.create(null);', true],
    ['Red Titanium', rejectedEditor, false],
    ['Blue Argon', 'importScripts("https://example.org/core.js")', false],
  ] as const) {
    it(`inspecte réellement les octets du ZIP : ${label}`, async () => {
      const directory = await mkdtemp(join(tmpdir(), 'pdf-nexus-store-audit-'));
      const file = join(directory, 'extension.zip');
      try {
        await writeFile(
          file,
          zipSync({
            'manifest.json': strToU8(JSON.stringify({ manifest_version: 3, version: '1.7.1' })),
            'assets/editor.js': strToU8(source),
          }),
        );
        const result = spawnSync(
          process.execPath,
          [resolve('scripts/audit-store-package.mjs'), file],
          {
            encoding: 'utf8',
            timeout: 15_000,
          },
        );
        expect(result.error).toBeUndefined();
        expect(result.status === 0, result.stderr).toBe(accepted);
        expect(result.stdout + result.stderr).toContain(
          accepted ? 'ZIP contrôlé' : 'Audit du ZIP refusé',
        );
      } finally {
        await unlink(file).catch(() => {});
        await rmdir(directory);
      }
    });
  }
});
