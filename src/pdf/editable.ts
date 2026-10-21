import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFStream,
  StandardFonts,
  type PDFPage,
} from 'pdf-lib';
import type { Annotation, Source } from '../types';
import { safeUrl } from '../utils/files';

// Private, inert page data. Only the current page's base streams and current
// additions are kept: never attach a source PDF or a previous edit history.
const key = PDFName.of('NexusEdits');
const maxData = 32 * 1024 * 1024;
const types = new Set([
  'text',
  'note',
  'highlight',
  'underline',
  'strike',
  'pen',
  'rect',
  'ellipse',
  'line',
  'arrow',
  'image',
  'link',
  'stamp',
  'checkbox',
]);

function encodeImage(bytes: Uint8Array) {
  let value = '';
  for (let i = 0; i < bytes.length; i += 32768)
    value += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(value);
}
function number(value: unknown, min = -1_000_000, max = 1_000_000): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new TypeError('Invalid annotation number');
  return value;
}
function string(value: unknown, max = 1_000_000): string {
  if (typeof value !== 'string' || value.length > max)
    throw new TypeError('Invalid annotation text');
  return value;
}
function color(value: unknown) {
  const result = string(value, 7);
  if (!/^#[\da-f]{6}$/i.test(result)) throw new TypeError('Invalid annotation color');
  return result;
}
function point(value: any) {
  return { x: number(value.x), y: number(value.y) };
}
function annotation(value: any): Annotation {
  if (!value || !types.has(value.type)) throw new TypeError('Invalid annotation type');
  const result: Annotation = {
    id: string(value.id, 200),
    type: value.type,
    x: number(value.x),
    y: number(value.y),
    width: number(value.width, 0),
    height: number(value.height, 0),
    size: number(value.size, 0.1, 1000),
    color: color(value.color),
  };
  if (value.text !== undefined) result.text = string(value.text);
  if (value.name !== undefined) result.name = string(value.name, 160);
  for (const flag of ['locked', 'hidden'] as const) {
    if (value[flag] !== undefined) {
      if (typeof value[flag] !== 'boolean') throw new TypeError('Invalid object flag');
      result[flag] = value[flag];
    }
  }
  if (value.font !== undefined) {
    if (value.font !== 'Noto Sans' && !Object.values(StandardFonts).includes(value.font))
      throw new TypeError('Invalid font');
    result.font = value.font;
  }
  if (value.checked !== undefined) {
    if (typeof value.checked !== 'boolean') throw new TypeError('Invalid checkbox');
    result.checked = value.checked;
  }
  if (value.url) result.url = safeUrl(string(value.url, 8192));
  if (value.points !== undefined) {
    if (!Array.isArray(value.points) || value.points.length > 100_000)
      throw new TypeError('Invalid annotation points');
    result.points = value.points.map(point);
  }
  if (value.image !== undefined) {
    if (value.imageType !== 'png' && value.imageType !== 'jpg')
      throw new TypeError('Invalid image type');
    const encoded = string(value.image, maxData);
    if (!/^[A-Za-z\d+/]*={0,2}$/.test(encoded)) throw new TypeError('Invalid image data');
    result.image = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    result.imageType = value.imageType;
  }
  if (value.replacement !== undefined) {
    const r = value.replacement;
    if (r.font !== 'Noto Sans' && !Object.values(StandardFonts).includes(r.font))
      throw new TypeError('Invalid font');
    result.replacement = {
      background: color(r.background),
      font: string(r.font, 100),
      original: string(r.original),
      angle: number(r.angle, -360, 360),
      baseline: number(r.baseline),
    };
    if (r.mask)
      result.replacement.mask = {
        ...point(r.mask),
        width: number(r.mask.width, 0),
        height: number(r.mask.height, 0),
      };
  }
  return result;
}

/** Capture before drawing additions on a fresh PDFPage wrapper. Normalizing
 * first isolates the base CTM; clone resource tables before drawing mutates them. */
export function preserveEditablePage(page: PDFPage, annotations: Annotation[]) {
  if (!annotations.length) return;
  if (annotations.length > 2000) throw new Error('Limite de 2 000 ajouts modifiables par page.');
  const { Contents, Resources } = page.node.normalizedEntries();
  const baseResources = Resources.clone();
  for (const [name, value] of Resources.entries()) {
    const child = page.doc.context.lookup(value);
    if (child instanceof PDFDict) baseResources.set(name, child.clone());
  }
  const data = new TextEncoder().encode(
    JSON.stringify(
      annotations.map((a) => ({
        ...a,
        image: a.image ? encodeImage(a.image) : undefined,
      })),
    ),
  );
  if (data.length > maxData)
    throw new Error('Les données d’édition dépassent la limite de 32 Mio par page.');
  page.node.set(
    key,
    page.doc.context.obj({
      Version: 1,
      BaseContents: Contents?.clone() ?? page.doc.context.obj([]),
      BaseResources: baseResources,
      BaseAnnots: page.node.Annots()?.clone() ?? page.doc.context.obj([]),
      Data: page.doc.context.register(page.doc.context.stream(data)),
    }),
  );
}

async function contentDigest(page: PDFPage) {
  const content = page.node.Contents();
  const entries = content instanceof PDFArray ? content.asArray() : content ? [content] : [];
  const parts: Uint8Array[] = [];
  let length = 0;
  for (const entry of entries) {
    const stream = page.doc.context.lookup(entry);
    if (!(stream instanceof PDFStream)) throw new TypeError('Invalid page stream');
    const bytes = stream.getContents();
    const prefix = new Uint8Array(4);
    new DataView(prefix.buffer).setUint32(0, bytes.length);
    parts.push(prefix, bytes);
    length += prefix.length + bytes.length;
  }
  const all = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    all.set(part, offset);
    offset += part.length;
  }
  const hash = await crypto.subtle.digest('SHA-256', all.buffer);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sealEditablePage(page: PDFPage) {
  if (!page.node.has(key)) return;
  page.node
    .lookup(key, PDFDict)
    .set(PDFName.of('ContentDigest'), PDFHexString.of(await contentDigest(page)));
}

export interface RestoredSource {
  source: Source;
  annotations: Annotation[][];
  invalidPages: number;
}

export async function restoreEditableSource(source: Source): Promise<RestoredSource> {
  const result: RestoredSource = { source, annotations: [], invalidPages: 0 };
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(source.bytes, { updateMetadata: false });
  } catch {
    // Leave password handling and malformed ordinary PDFs to the reader.
    return result;
  }
  let restored = false;
  let totalData = 0;
  for (const [index, page] of doc.getPages().entries()) {
    if (!page.node.has(key)) continue;
    try {
      const state = page.node.lookup(key, PDFDict);
      if (state.lookup(PDFName.of('Version'), PDFNumber).asNumber() !== 1)
        throw new TypeError('Unknown version');
      // If another editor changed the visible content while retaining private
      // data, keep that rendering intact rather than reverting to stale streams.
      if (
        state.lookup(PDFName.of('ContentDigest'), PDFHexString).asString() !==
        (await contentDigest(page))
      )
        throw new TypeError('Page contents changed outside Nexus');
      const contents = state.lookup(PDFName.of('BaseContents'), PDFArray);
      const resources = state.lookup(PDFName.of('BaseResources'), PDFDict);
      const stream = doc.context.lookup(state.get(PDFName.of('Data')));
      if (!(stream instanceof PDFRawStream)) throw new TypeError('Invalid edit stream');
      const bytes = stream.getContents();
      totalData += bytes.length;
      if (
        stream.dict.has(PDFName.of('Filter')) ||
        bytes.length > maxData ||
        totalData > 128 * 1024 * 1024
      )
        throw new TypeError('Invalid edit data');
      for (const entry of contents.asArray())
        if (!(doc.context.lookup(entry) instanceof PDFRawStream))
          throw new TypeError('Invalid base stream');
      const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!Array.isArray(data) || data.length > 2000) throw new TypeError('Invalid edit list');
      const annotations = data.map(annotation);
      const annots = state.lookupMaybe(PDFName.of('BaseAnnots'), PDFArray);
      // Mutate only after all state has been validated. Invalid state retains its
      // visible flattened rendering, so a damaged payload never hides content.
      page.node.set(PDFName.of('Contents'), contents.clone());
      page.node.set(PDFName.of('Resources'), resources);
      if (annots) page.node.set(PDFName.of('Annots'), annots.clone());
      else page.node.delete(PDFName.of('Annots'));
      page.node.delete(key);
      result.annotations[index] = annotations;
      restored = true;
    } catch {
      result.invalidPages++;
    }
  }
  if (restored)
    result.source = { name: source.name, bytes: await doc.save({ useObjectStreams: true }) };
  return result;
}
