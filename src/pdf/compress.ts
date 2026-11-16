import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRawStream,
  PDFRef,
  PDFStream,
} from 'pdf-lib';
import { unzlibSync } from 'fflate';

export type PixelKind = 'jpeg' | 'rgb' | 'gray';

export interface EncodeInput {
  kind: PixelKind;
  data: Uint8Array;
  width: number;
  height: number;
  scale: number;
  quality: number;
}

export type ImageEncoder = (
  input: EncodeInput,
) => Promise<{ bytes: Uint8Array; width: number; height: number } | null>;

export interface CompressOptions {
  /** Facteur d'échelle appliqué aux images (1 = taille d'origine). */
  scale: number;
  /** Qualité JPEG, de 0 à 1. */
  quality: number;
  /** Dimension maximale (px) au-delà de laquelle les images sont réduites. */
  maxDimension?: number;
  encode: ImageEncoder;
}

export interface CompressResult {
  bytes: Uint8Array;
  images: number;
  recompressed: number;
  removed: number;
}

export interface Preset {
  scale: number;
  quality: number;
  maxDimension: number;
}

export const PRESETS: Record<'light' | 'balanced' | 'strong', Preset> = {
  light: { scale: 0.9, quality: 0.85, maxDimension: 3000 },
  balanced: { scale: 0.65, quality: 0.7, maxDimension: 2000 },
  strong: { scale: 0.45, quality: 0.5, maxDimension: 1400 },
};

const N = (name: string) => PDFName.of(name);

function nameOf(value: unknown): string | undefined {
  return value instanceof PDFName ? value.decodeText() : undefined;
}

function numberOf(value: unknown): number {
  return value instanceof PDFNumber ? value.asNumber() : 0;
}

function abortIf(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Opération annulée.', 'AbortError');
}

function children(obj: PDFObject): PDFObject[] {
  if (obj instanceof PDFStream) return children(obj.dict);
  if (obj instanceof PDFDict) return obj.values();
  if (obj instanceof PDFArray) return obj.asArray();
  return [];
}

/** Supprime les objets qui ne sont plus atteignables depuis la racine du document. */
export function removeOrphans(doc: PDFDocument): number {
  const ctx = doc.context;
  const seen = new Set<PDFRef>();
  const stack: PDFObject[] = [
    ctx.trailerInfo.Root,
    ctx.trailerInfo.Info,
    ctx.trailerInfo.Encrypt,
  ].filter(Boolean) as PDFObject[];
  while (stack.length) {
    const obj = stack.pop() as PDFObject;
    if (obj instanceof PDFRef) {
      if (seen.has(obj)) continue;
      seen.add(obj);
      const target = ctx.lookup(obj);
      if (target) stack.push(target);
    } else stack.push(...children(obj));
  }
  let removed = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) {
    if (!seen.has(ref)) {
      ctx.delete(ref);
      removed++;
    }
  }
  return removed;
}

function fnv(bytes: Uint8Array) {
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h;
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Fusionne les flux binaires identiques (même dictionnaire, mêmes octets) en
 * redirigeant les références vers un seul exemplaire. Renvoie le nombre de doublons.
 */
export function mergeDuplicateStreams(doc: PDFDocument): number {
  const ctx = doc.context;
  const groups = new Map<string, [PDFRef, PDFRawStream][]>();
  const canonical = new Map<PDFRef, PDFRef>();
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(ref instanceof PDFRef) || !(obj instanceof PDFRawStream)) continue;
    const key = `${obj.contents.length}:${fnv(obj.contents)}:${obj.dict.toString()}`;
    const group = groups.get(key) ?? [];
    const first = group.find(([, o]) => sameBytes(o.contents, obj.contents));
    if (first) canonical.set(ref, first[0]);
    else group.push([ref, obj]);
    groups.set(key, group);
  }
  if (!canonical.size) return 0;
  const redirect = (v: PDFObject | undefined) =>
    v instanceof PDFRef ? (canonical.get(v) ?? v) : v;
  const fix = (obj: PDFObject) => {
    if (obj instanceof PDFStream) return fix(obj.dict);
    if (obj instanceof PDFDict) {
      for (const [k, v] of obj.entries()) {
        const r = redirect(v);
        if (r !== v) obj.set(k, r as PDFObject);
        else fix(v);
      }
    } else if (obj instanceof PDFArray) {
      for (let i = 0; i < obj.size(); i++) {
        const v = obj.get(i);
        const r = redirect(v);
        if (r !== v) obj.set(i, r as PDFObject);
        else fix(v);
      }
    }
  };
  for (const [, obj] of ctx.enumerateIndirectObjects()) fix(obj);
  if (ctx.trailerInfo.Root) fix(ctx.trailerInfo.Root);
  return canonical.size;
}

/** Retire les vignettes de page (/Thumb), régénérables par les lecteurs. */
export function removeThumbnails(doc: PDFDocument) {
  for (const page of doc.getPages()) page.node.delete(N('Thumb'));
}

function imageKind(
  dict: PDFDict,
  contents: Uint8Array,
): { kind: PixelKind; data: Uint8Array } | null {
  const filter = nameOf(dict.lookup(N('Filter')));
  const space = nameOf(dict.lookup(N('ColorSpace')));
  if (dict.has(N('Decode')) || dict.has(N('Mask')) || dict.has(N('ImageMask'))) return null;
  if (filter === 'DCTDecode') {
    if (space !== 'DeviceRGB' || dict.has(N('DecodeParms'))) return null;
    return { kind: 'jpeg', data: contents };
  }
  if (filter === 'FlateDecode') {
    if (numberOf(dict.lookup(N('BitsPerComponent'))) !== 8) return null;
    if (space !== 'DeviceRGB' && space !== 'DeviceGray') return null;
    const parms = dict.lookup(N('DecodeParms'));
    if (parms instanceof PDFDict && numberOf(parms.lookup(N('Predictor'))) > 1) return null;
    if (parms && !(parms instanceof PDFDict)) return null;
    try {
      return { kind: space === 'DeviceRGB' ? 'rgb' : 'gray', data: unzlibSync(contents) };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Recompresse localement les images intégrées (JPEG RVB, Flate RVB/gris, réduction
 * des très grandes images), retire vignettes, objets orphelins et métadonnées.
 * Texte, liens et formulaires sont conservés. Le résultat n'est jamais plus gros
 * que l'original.
 */
export async function compressPdfImages(
  input: Uint8Array,
  options: CompressOptions,
  signal?: AbortSignal,
): Promise<CompressResult> {
  const doc = await PDFDocument.load(input, { updateMetadata: false });
  let images = 0;
  let recompressed = 0;
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    abortIf(signal);
    if (!(ref instanceof PDFRef) || !(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (nameOf(dict.lookup(N('Subtype'))) !== 'Image') continue;
    images++;
    const pixels = imageKind(dict, obj.contents);
    if (!pixels) continue;
    const width = numberOf(dict.lookup(N('Width')));
    const height = numberOf(dict.lookup(N('Height')));
    if (!width || !height) continue;
    if (
      pixels.kind !== 'jpeg' &&
      pixels.data.length < width * height * (pixels.kind === 'rgb' ? 3 : 1)
    )
      continue;
    let scale = options.scale;
    if (options.maxDimension)
      scale = Math.min(scale, options.maxDimension / Math.max(width, height));
    const next = await options.encode({
      kind: pixels.kind,
      data: pixels.data,
      width,
      height,
      scale: Math.min(1, scale),
      quality: options.quality,
    });
    if (!next || next.bytes.length >= obj.contents.length) continue;
    const copy = dict.clone(doc.context);
    copy.set(N('Filter'), N('DCTDecode'));
    copy.set(N('ColorSpace'), N('DeviceRGB'));
    copy.set(N('BitsPerComponent'), PDFNumber.of(8));
    copy.delete(N('DecodeParms'));
    copy.set(N('Width'), PDFNumber.of(next.width));
    copy.set(N('Height'), PDFNumber.of(next.height));
    copy.set(N('Length'), PDFNumber.of(next.bytes.length));
    doc.context.assign(ref, PDFRawStream.of(copy, next.bytes));
    recompressed++;
  }
  removeThumbnails(doc);
  mergeDuplicateStreams(doc);
  const removed = removeOrphans(doc);
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setProducer('');
  doc.setCreator('');
  const saved = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
  return saved.length < input.length
    ? { bytes: saved, images, recompressed, removed }
    : { bytes: input, images, recompressed: 0, removed: 0 };
}

/**
 * Cherche automatiquement le meilleur réglage pour passer sous une taille cible,
 * en réduisant d'abord la qualité puis l'échelle. Renvoie le meilleur résultat
 * obtenu, même si la cible n'est pas atteinte.
 */
export async function compressToTarget(
  input: Uint8Array,
  targetBytes: number,
  base: Omit<CompressOptions, 'quality' | 'scale'> & { scale?: number },
  signal?: AbortSignal,
): Promise<CompressResult & { reached: boolean }> {
  const steps = [
    [1, 0.85],
    [0.8, 0.7],
    [0.6, 0.6],
    [0.45, 0.5],
    [0.35, 0.4],
    [0.25, 0.3],
  ];
  let best: CompressResult | undefined;
  for (const [scale, quality] of steps) {
    abortIf(signal);
    const result = await compressPdfImages(input, { ...base, scale, quality }, signal);
    if (!best || result.bytes.length < best.bytes.length) best = result;
    if (result.bytes.length <= targetBytes) return { ...result, reached: true };
  }
  return { ...(best as CompressResult), reached: false };
}

/** Encodeur navigateur : décodage, redimensionnement et JPEG, 100 % local. */
export const browserImageEncoder: ImageEncoder = async ({
  kind,
  data,
  width,
  height,
  scale,
  quality,
}) => {
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  let bitmap: ImageBitmap;
  if (kind === 'jpeg') {
    bitmap = await createImageBitmap(new Blob([data as BlobPart], { type: 'image/jpeg' }));
  } else {
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      if (kind === 'rgb') {
        rgba[i * 4] = data[i * 3];
        rgba[i * 4 + 1] = data[i * 3 + 1];
        rgba[i * 4 + 2] = data[i * 3 + 2];
      } else rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = data[i];
      rgba[i * 4 + 3] = 255;
    }
    bitmap = await createImageBitmap(new ImageData(rgba, width, height));
  }
  try {
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h };
  } finally {
    bitmap.close();
  }
};
