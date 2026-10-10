import { parse } from '@babel/parser';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
async function visit(dir) {
  for (const f of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, f.name);
    if (f.isDirectory()) {
      if (f.name !== 'locales') await visit(path);
      continue;
    }
    if (!/\.tsx?$/.test(f.name) || f.name === 'i18n.ts') continue;
    const ast = parse(await readFile(path, 'utf8'), {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });
    function walk(n, ancestors = []) {
      if (!n || typeof n !== 'object') return;
      if (['StringLiteral', 'TemplateLiteral'].includes(n.type)) {
        const value = n.value ?? n.quasis.map((q) => q.value.cooked).join('{}');
        const handled =
          ancestors.some(
            (a) =>
              a.type === 'CallExpression' &&
              ['t', 'label', 'notify', 'onError', 'setError', 'run'].includes(a.callee?.name),
          ) ||
          (n.type === 'StringLiteral' && ancestors.at(-1)?.type === 'NewExpression');
        if (
          !handled &&
          /[éèêàçùîôœ]|\b(?:les|des|pour|avec|sans|du|bloc|sur|vers|fichier|origine)\b/.test(value)
        )
          console.log(`${path}:${n.loc.start.line} ${value}`);
      }
      for (const [key, v] of Object.entries(n))
        if (!['loc', 'extra', 'comments', 'tokens'].includes(key)) {
          if (Array.isArray(v)) v.forEach((c) => walk(c, [...ancestors, n]));
          else if (v?.type) walk(v, [...ancestors, n]);
        }
    }
    walk(ast);
  }
}
await visit('src');
