import fontkit from '@pdf-lib/fontkit';
import { t } from '../i18n';
import { closestFont } from './text-style';
import {
  PDFDocument,
  PDFArray,
  PDFDict,
  PDFName,
  PDFRawStream,
  PDFString,
  PDFHexString,
  decodePDFRawStream,
  StandardFonts,
  type PDFPage,
} from 'pdf-lib';
import type { NativeEdit } from '../types';

type Token = { value: string; start: number; end: number; kind: 'word' | 'string' | 'array' };
// Lexical scanner: never search/replace arbitrary bytes in compressed PDF streams.
function tokens(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const read = (): void => {
    const start = i;
    let kind: Token['kind'] = 'word';
    if (s[i] === '(') {
      kind = 'string';
      i++;
      let depth = 1;
      while (i < s.length && depth) {
        if (s[i] === '\\') {
          i += 2;
          continue;
        }
        if (s[i] === '(') depth++;
        if (s[i] === ')') depth--;
        i++;
      }
      if (depth) throw new Error('Chaîne PDF incomplète.');
    } else if (s[i] === '<' && s[i + 1] !== '<') {
      kind = 'string';
      i = s.indexOf('>', i) + 1;
      if (!i) throw new Error('Chaîne PDF invalide.');
    } else if (s[i] === '[') {
      kind = 'array';
      i++;
      while (i < s.length && s[i] !== ']') {
        if (/\s/.test(s[i])) i++;
        else read();
      }
      if (s[i++] !== ']') throw new Error('Tableau PDF incomplet.');
      while (out.length && out.at(-1)!.start > start) out.pop();
    } else {
      i++;
      while (i < s.length && !/[\s()[\]<>%]/.test(s[i])) i++;
    }
    out.push({ value: s.slice(start, i), start, end: i, kind });
  };
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      i++;
      continue;
    }
    if (s[i] === '%') {
      while (i < s.length && !/[\r\n]/.test(s[i])) i++;
      continue;
    }
    read();
    if (out.at(-1)?.value === 'BI')
      throw new Error('Les images intégrées au flux ne permettent pas encore l’édition native.');
  }
  return out;
}
const binary = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');
const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
function streamText(stream: PDFRawStream) {
  const decoded = decodePDFRawStream(stream).decode();
  if (decoded.length > 8_000_000) throw new Error('Flux trop volumineux pour l’édition native.');
  return binary(decoded);
}
function fontCodec(font: PDFDict) {
  const map = new Map<string, string>();
  const toUnicode = font.lookup(PDFName.of('ToUnicode'));
  let length = 2;
  if (toUnicode instanceof PDFRawStream) {
    const cmap = streamText(toUnicode);
    if (/usecmap/.test(cmap)) throw new Error('CMap héritée non prise en charge.');
    const unicode = (h: string) => {
      let s = '';
      for (let i = 0; i < h.length; i += 4)
        s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
      return s;
    };
    for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
      for (const m of block[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi))
        map.set(m[1].toUpperCase(), unicode(m[2]));
    for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const m of block[1].matchAll(
        /<([\da-f]+)>\s*<([\da-f]+)>\s*(<([\da-f]+)>|\[([^\]]*)\])/gi,
      )) {
        const start = parseInt(m[1], 16),
          end = parseInt(m[2], 16);
        if (end - start > 65536) throw new Error('CMap trop grande.');
        const values = m[5] ? [...m[5].matchAll(/<([\da-f]+)>/gi)].map((v) => v[1]) : undefined;
        for (let n = start; n <= end; n++) {
          const h =
            values?.[n - start] ??
            (parseInt(m[4], 16) + n - start).toString(16).padStart(m[4]?.length ?? 4, '0');
          map.set(n.toString(16).padStart(m[1].length, '0').toUpperCase(), unicode(h));
        }
      }
    }
    const lengths = new Set([...map.keys()].map((k) => k.length));
    if (lengths.size !== 1) throw new Error('Codage de caractères variable non pris en charge.');
    length = [...lengths][0];
    const subtype = font.get(PDFName.of('Subtype'))?.toString();
    if (subtype === '/Type0' && font.get(PDFName.of('Encoding'))?.toString() !== '/Identity-H')
      throw new Error('Police composite non horizontale.');
  } else {
    const encoding = font.get(PDFName.of('Encoding'))?.toString();
    const base = font.get(PDFName.of('BaseFont'))?.toString() ?? '';
    const asciiStandard = !encoding && /^\/(Helvetica|Times|Courier)/.test(base);
    if ((!asciiStandard && encoding !== '/WinAnsiEncoding') || /Symbol|Zapf/.test(base))
      throw new Error('Police sans correspondance Unicode exploitable.');
    const decoder = new TextDecoder('windows-1252');
    for (let n = 32; n < (asciiStandard ? 127 : 256); n++)
      map.set(n.toString(16).padStart(2, '0').toUpperCase(), decoder.decode(new Uint8Array([n])));
  }
  const inverse = new Map([...map].map(([k, v]) => [v, k]));
  return {
    characters: [...inverse.keys()],
    decode(raw: string) {
      const b = raw.startsWith('(')
        ? PDFString.of(raw.slice(1, -1)).asBytes()
        : PDFHexString.of(raw.slice(1, -1)).asBytes();
      const hex = Array.from(b, (c) => c.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
      let result = '';
      for (let i = 0; i < hex.length; i += length) {
        const c = map.get(hex.slice(i, i + length));
        if (c === undefined) throw new Error('Caractère sans correspondance.');
        result += c;
      }
      return result;
    },
    encode(text: string) {
      return (
        '<' +
        Array.from(text, (c) => {
          const hex = inverse.get(c);
          if (!hex)
            throw new Error(
              t(
                'Le caractère « {character} » est absent de la police incorporée. Choisissez une police de remplacement.',
                { character: c },
              ),
            );
          return hex;
        }).join('') +
        '>'
      );
    },
  };
}
export interface NativeRun {
  id: string;
  text: string;
  font: string;
  size: number;
  characters?: string[];
}
interface InternalRun extends NativeRun {
  linear: number[];
  stream: number;
  start: number;
  end: number;
  resource: string;
  encode: (s: string) => string;
}
function inspect(page: PDFPage) {
  const contents = page.node.Contents();
  const raw =
    contents instanceof PDFArray
      ? contents.asArray().map((r) => page.doc.context.lookup(r))
      : contents
        ? [contents]
        : [];
  const streams = raw.map((r) => {
    if (!(r instanceof PDFRawStream)) throw new Error('Flux de page non pris en charge.');
    return streamText(r);
  });
  const fonts = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
  const runs: InternalRun[] = [];
  let linear = [1, 0, 0, 1];
  const matrices: number[][] = [];
  streams.forEach((s, stream) => {
    const t = tokens(s);
    let block = -1;
    for (let i = 0; i < t.length; i++) {
      if (t[i].value === 'q') matrices.push([...linear]);
      if (t[i].value === 'Q') linear = matrices.pop() ?? [1, 0, 0, 1];
      if (t[i].value === 'cm' && i >= 6) {
        const m = t.slice(i - 6, i - 2).map((v) => Number(v.value));
        const [a, b, c, d] = linear;
        linear = [
          a * m[0] + c * m[1],
          b * m[0] + d * m[1],
          a * m[2] + c * m[3],
          b * m[2] + d * m[3],
        ];
      }
      if (t[i].value === 'BT') block = i;
      if (t[i].value !== 'ET' || block < 0) continue;
      const chunk = t.slice(block + 1, i);
      const shows = chunk.filter((x) => ['Tj', 'TJ', "'", '"'].includes(x.value));
      // A following line/matrix reset prevents a longer replacement from shifting another run.
      if (chunk.some((x) => ['Do', 'gs', 'q', 'Q', 'cm'].includes(x.value))) {
        block = -1;
        continue;
      }
      for (const [showIndex, show] of shows.entries()) {
        const at = chunk.indexOf(show),
          before = chunk.slice(0, at);
        const tf = before.map((x) => x.value).lastIndexOf('Tf');
        const tr = before.map((x) => x.value).lastIndexOf('Tr');
        const next = shows[showIndex + 1];
        const independent =
          !next ||
          chunk
            .slice(at + 1, chunk.indexOf(next))
            .some((x) => ['Tm', 'Td', 'TD', 'T*'].includes(x.value));
        if (
          !independent ||
          !['Tj', 'TJ'].includes(show.value) ||
          tf < 2 ||
          (tr >= 0 && Number(before[tr - 1]?.value) !== 0)
        )
          continue;
        const operand = chunk[at - 1],
          name = before[tf - 2],
          size = Number(before[tf - 1].value);
        if (!operand || !name.value.startsWith('/') || !Number.isFinite(size) || size <= 0)
          continue;
        try {
          const resource = name.value.slice(1),
            font = fonts?.lookup(PDFName.of(resource), PDFDict);
          if (!font) continue;
          const codec = fontCodec(font);
          const strings =
            operand.kind === 'array'
              ? tokens(operand.value.slice(1, -1)).filter((x) => x.kind === 'string')
              : [operand];
          const text = strings.map((x) => codec.decode(x.value)).join('');
          if (text.trim())
            runs.push({
              id: `${stream}:${operand.start}`,
              text,
              font: font.get(PDFName.of('BaseFont'))?.toString().slice(1) ?? resource,
              size,
              stream,
              start: operand.start,
              end: show.end,
              resource,
              encode: codec.encode,
              characters: codec.characters,
              linear: [...linear],
            });
        } catch {
          /* Unsupported runs remain read-only. */
        }
      }
      block = -1;
    }
  });
  return { runs, streams };
}
export async function listNativeRuns(bytes: Uint8Array, index: number): Promise<NativeRun[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return inspect(doc.getPage(index)).runs.map(({ id, text, font, size, characters }) => ({
    id,
    text,
    font,
    size,
    characters,
  }));
}
export async function applyNativeEdits(page: PDFPage, edits: NativeEdit[], fontBytes?: Uint8Array) {
  if (!edits.length) return;
  const { runs, streams } = inspect(page);
  const patches = new Map<number, { start: number; end: number; text: string }[]>();
  for (const edit of edits) {
    const run = runs.find((r) => r.id === edit.id && r.text === edit.original);
    if (!run)
      throw new Error(
        'Ce bloc de texte ne peut pas être modifié sans risque de changer le document.',
      );
    if (/[\r\n]/.test(edit.text)) throw new Error('Un bloc natif doit rester sur une seule ligne.');
    let encoded: string | undefined,
      fontName = run.resource;
    let chosenFont = edit.font;
    if (!chosenFont) {
      try {
        encoded = run.encode(edit.text);
      } catch (error) {
        if (!edit.autoAdapt) throw error;
        chosenFont = closestFont(run.font);
      }
    }
    if (chosenFont) {
      let font;
      if (chosenFont !== 'Noto Sans') {
        if (!Object.values(StandardFonts).includes(chosenFont as StandardFonts))
          throw new Error('Police de remplacement inconnue.');
        font = await page.doc.embedFont(chosenFont as StandardFonts);
        try {
          encoded = font.encodeText(edit.text).toString();
        } catch (error) {
          if (!edit.autoAdapt) throw error;
          chosenFont = 'Noto Sans';
        }
      }
      if (chosenFont === 'Noto Sans') {
        if (!fontBytes) throw new Error('La police locale est nécessaire pour ces caractères.');
        page.doc.registerFontkit(fontkit);
        font = await page.doc.embedFont(fontBytes, { subset: true });
        const supported = new Set(font.getCharacterSet());
        if (Array.from(edit.text).some((c) => !supported.has(c.codePointAt(0)!)))
          throw new Error('La police locale ne contient pas certains caractères.');
        encoded = font.encodeText(edit.text).toString();
      }
      fontName = page.node.newFontDictionary(font!.name, font!.ref).decodeText();
    }
    const size = edit.size ?? run.size;
    if (!Number.isFinite(size) || size < 1 || size > 300)
      throw new Error('Taille de police invalide (1 à 300 pt).');
    const list = patches.get(run.stream) ?? [];
    let prefix = '',
      suffix = '';
    if (edit.offset && (edit.offset.x || edit.offset.y)) {
      const [a, b, c, d] = run.linear,
        det = a * d - b * c;
      if (
        !Number.isFinite(det) ||
        Math.abs(det) < 1e-9 ||
        !Number.isFinite(edit.offset.x) ||
        !Number.isFinite(edit.offset.y)
      )
        throw new Error('Impossible de déplacer ce texte : transformation invalide.');
      const dx = (d * edit.offset.x - c * edit.offset.y) / det;
      const dy = (-b * edit.offset.x + a * edit.offset.y) / det;
      // cm uses the current graphics coordinates, so invert its linear part to
      // express the requested displacement in unrotated page points.
      prefix = `q 1 0 0 1 ${dx.toFixed(6)} ${dy.toFixed(6)} cm `;
      suffix = ' Q';
    }
    list.push({
      start: run.start,
      end: run.end,
      text: `${prefix}/${fontName} ${size} Tf ${encoded} Tj /${run.resource} ${run.size} Tf${suffix}`,
    });
    patches.set(run.stream, list);
  }
  const refs = streams.map((stream, i) => {
    for (const patch of (patches.get(i) ?? []).sort((a, b) => b.start - a.start))
      stream = stream.slice(0, patch.start) + patch.text + stream.slice(patch.end);
    return page.doc.context.register(page.doc.context.flateStream(bytes(stream)));
  });
  page.node.set(PDFName.of('Contents'), page.doc.context.obj(refs));
}
export async function nativePreview(
  bytes: Uint8Array,
  index: number,
  edits: NativeEdit[],
  fontBytes?: Uint8Array,
) {
  const source = await PDFDocument.load(bytes, { updateMetadata: false });
  const output = await PDFDocument.create();
  const [page] = await output.copyPages(source, [index]);
  output.addPage(page);
  await applyNativeEdits(page, edits, fontBytes);
  return output.save();
}
