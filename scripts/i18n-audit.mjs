import { parse } from '@babel/parser';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const apply = process.argv.includes('--wrap');
const keys = new Map();
function add(key, file) {
  if (key && /[A-Za-zÀ-ÿ]/.test(key)) keys.set(key, [...(keys.get(key) ?? []), file]);
}
async function visit(dir) {
  for (const f of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, f.name);
    if (f.isDirectory()) {
      await visit(path);
      continue;
    }
    if (!/\.tsx?$/.test(f.name) || f.name === 'i18n.ts' || dir.includes('locales')) continue;
    let code = await readFile(path, 'utf8');
    const ast = parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    const patches = [];
    function wrap(n, jsx = false) {
      const value = n.type === 'JSXText' ? n.value.replace(/\s+/g, ' ').trim() : n.value;
      if (!value || !/[A-Za-zÀ-ÿ]/.test(value)) return;
      add(value, path);
      patches.push({
        start: n.start,
        end: n.end,
        text: jsx ? `{t(${JSON.stringify(value)})}` : `t(${JSON.stringify(value)})`,
      });
    }
    function walk(n, parent, ancestors = []) {
      if (!n || typeof n !== 'object') return;
      if (n.type === 'JSXText') wrap(n, true);
      if (n.type === 'StringLiteral') {
        // Include conditional/fallback messages, optional callbacks and the
        // literal values of dictionaries passed to t().
        if (
          !ancestors.some(
            (a, i) => a.type === 'ConditionalExpression' && a.test === (ancestors[i + 1] ?? n),
          ) &&
          ancestors.some(
            (a, i) =>
              ['CallExpression', 'OptionalCallExpression', 'NewExpression'].includes(a.type) &&
              ['t', 'run', 'notify', 'onError', 'setError', 'Error', 'DOMException'].includes(
                a.callee?.name,
              ) &&
              a.arguments[0] === (ancestors[i + 1] ?? n),
          ) &&
          !(parent?.type === 'ObjectProperty' && parent.key === n)
        )
          add(n.value, path);
        if (ancestors.some((a) => a.type === 'VariableDeclarator' && a.id?.name === 'limitations'))
          add(n.value, path);
        if (
          parent?.type === 'CallExpression' &&
          ['confirm', 'prompt'].includes(parent.callee?.property?.name) &&
          parent.arguments[0] === n
        )
          wrap(n);
        if (
          parent?.type === 'CallExpression' &&
          parent.callee?.name === 'run' &&
          parent.arguments[0] === n
        )
          add(n.value, path);
        if (parent?.type === 'CallExpression' && parent.callee?.name === 't') add(n.value, path);
        if (
          parent?.type === 'JSXAttribute' &&
          ['title', 'aria-label', 'placeholder', 'alt', 'label', 'description'].includes(
            parent.name?.name,
          )
        )
          wrap(n, true);
        if (parent?.type === 'JSXExpressionContainer' && ancestors.at(-2)?.type !== 'JSXAttribute')
          wrap(n);
        if (
          parent?.type === 'ConditionalExpression' &&
          ['consequent', 'alternate'].some((k) => parent[k] === n)
        ) {
          const attr = ancestors.findLast((a) => a.type === 'JSXAttribute');
          if (
            ancestors.some((a) => a.type === 'JSXExpressionContainer') &&
            (!attr || ['title', 'aria-label', 'placeholder', 'label'].includes(attr.name?.name))
          )
            wrap(n);
        }
        if (parent?.type === 'NewExpression' && parent.callee?.name === 'Error') add(n.value, path);
        if (
          parent?.type === 'CallExpression' &&
          ['notify', 'onError', 'setError'].includes(parent.callee?.name)
        )
          add(n.value, path);
        if (
          parent?.type === 'ObjectProperty' &&
          ['name', 'label', 'description', 'title', 'hint'].includes(parent.key?.name)
        )
          add(n.value, path);
      }
      for (const [key, v] of Object.entries(n))
        if (!['loc', 'extra', 'comments', 'tokens'].includes(key)) {
          if (Array.isArray(v)) v.forEach((c) => walk(c, n, [...ancestors, n]));
          else if (v?.type) walk(v, n, [...ancestors, n]);
        }
    }
    walk(ast, null);
    if (apply && patches.length) {
      const unique = [...new Map(patches.map((p) => [p.start, p])).values()].sort(
        (a, b) => b.start - a.start,
      );
      for (const p of unique) code = code.slice(0, p.start) + p.text + code.slice(p.end);
      if (!/import\s*\{[^}]*\bt\b[^}]*\}\s*from ['"].*i18n/.test(code))
        code = `import { t } from '${dir === 'src' ? './i18n' : '../i18n'}';\n` + code;
      await writeFile(path, code);
    }
  }
}
await visit('src');
const catalog = parse(await readFile('src/i18n.ts', 'utf8'), {
  sourceType: 'module',
  plugins: ['typescript'],
});
const known = new Set();
function catalogWalk(n) {
  if (!n || typeof n !== 'object') return;
  if (n.type === 'ObjectProperty' && n.value?.type === 'StringLiteral')
    known.add(n.key.value ?? n.key.name);
  for (const v of Object.values(n))
    if (Array.isArray(v)) v.forEach(catalogWalk);
    else if (v?.type) catalogWalk(v);
}
catalogWalk(catalog);
for (const k of Object.keys(JSON.parse(await readFile('src/locales/en.json', 'utf8'))))
  known.add(k);
const missing = Object.fromEntries(
  [...keys].filter(([k]) => !known.has(k)).sort(([a], [b]) => a.localeCompare(b)),
);
await writeFile('scripts/i18n-missing.json', JSON.stringify(missing, null, 2) + '\n');
console.log(`${keys.size} libellés, ${Object.keys(missing).length} traductions à compléter.`);
if (process.argv.includes('--check') && Object.keys(missing).length) process.exitCode = 1;
