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
import { unzlibSync, zlibSync } from 'fflate';

export type PixelKind = 'jpeg' | 'rgb' | 'gray';

export interface EncodeInput {
  kind: PixelKind;
  data: Uint8Array;
  width: number;
  height: number;
  scale: number;
  quality: number;
  grayscale?: boolean;
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
  /** Convertit les images couleur en niveaux de gris avant encodage. */
  grayscale?: boolean;
  /** Supprime les métadonnées Info/XMP (vrai par défaut). */
  stripMetadata?: boolean;
  /** Progression (0 à 1). */
  onProgress?: (n: number) => void;
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

function resolveColorSpace(dict: PDFDict): 'DeviceRGB' | 'DeviceGray' | 'DeviceCMYK' | null {
  const cs = dict.lookup(N('ColorSpace'));
  const direct = nameOf(cs);
  if (direct === 'DeviceRGB' || direct === 'DeviceGray' || direct === 'DeviceCMYK') return direct;
  if (cs instanceof PDFArray && cs.size() >= 2 && nameOf(cs.lookup(0)) === 'ICCBased') {
    const profile = cs.lookup(1);
    if (profile instanceof PDFStream) {
      const n = numberOf(profile.dict.lookup(N('N')));
      if (n === 1) return 'DeviceGray';
      if (n === 3) return 'DeviceRGB';
      if (n === 4) return 'DeviceCMYK';
    }
  }
  return null;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function unfilterPredictor(
  raw: Uint8Array,
  width: number,
  height: number,
  colors: number,
  predictor: number,
): Uint8Array | null {
  if (predictor <= 1) return raw;
  const rowBytes = width * colors;
  if (predictor === 2) {
    if (raw.length < rowBytes * height) return null;
    const out = new Uint8Array(rowBytes * height);
    for (let y = 0; y < height; y++) {
      const base = y * rowBytes;
      for (let x = 0; x < rowBytes; x++) {
        const left = x >= colors ? out[base + x - colors] : 0;
        out[base + x] = (raw[base + x] + left) & 0xff;
      }
    }
    return out;
  }
  if (predictor >= 10 && predictor <= 15) {
    const stride = rowBytes + 1;
    if (raw.length < stride * height) return null;
    const out = new Uint8Array(rowBytes * height);
    for (let y = 0; y < height; y++) {
      const src = y * stride;
      const dst = y * rowBytes;
      const filter = raw[src];
      for (let x = 0; x < rowBytes; x++) {
        const val = raw[src + 1 + x];
        const a = x >= colors ? out[dst + x - colors] : 0;
        const b = y > 0 ? out[dst - rowBytes + x] : 0;
        const c = y > 0 && x >= colors ? out[dst - rowBytes + x - colors] : 0;
        if (filter === 0) out[dst + x] = val;
        else if (filter === 1) out[dst + x] = (val + a) & 0xff;
        else if (filter === 2) out[dst + x] = (val + b) & 0xff;
        else if (filter === 3) out[dst + x] = (val + ((a + b) >> 1)) & 0xff;
        else if (filter === 4) out[dst + x] = (val + paeth(a, b, c)) & 0xff;
        else return null;
      }
    }
    return out;
  }
  return null;
}

function cmykToRgb(cmyk: Uint8Array, pixelCount: number): Uint8Array {
  const rgb = new Uint8Array(pixelCount * 3);
  for (let i = 0; i < pixelCount; i++) {
    const c = cmyk[i * 4] / 255;
    const m = cmyk[i * 4 + 1] / 255;
    const y = cmyk[i * 4 + 2] / 255;
    const k = cmyk[i * 4 + 3] / 255;
    rgb[i * 3] = Math.round(255 * (1 - c) * (1 - k));
    rgb[i * 3 + 1] = Math.round(255 * (1 - m) * (1 - k));
    rgb[i * 3 + 2] = Math.round(255 * (1 - y) * (1 - k));
  }
  return rgb;
}

function imageKind(
  dict: PDFDict,
  contents: Uint8Array,
): { kind: PixelKind; data: Uint8Array } | null {
  const filter = nameOf(dict.lookup(N('Filter')));
  const space = resolveColorSpace(dict);
  if (dict.has(N('Decode')) || dict.has(N('Mask')) || dict.has(N('ImageMask'))) return null;
  if (filter === 'DCTDecode') {
    if ((space !== 'DeviceRGB' && space !== 'DeviceGray') || dict.has(N('DecodeParms')))
      return null;
    return { kind: 'jpeg', data: contents };
  }
  if (filter === 'FlateDecode') {
    if (numberOf(dict.lookup(N('BitsPerComponent'))) !== 8) return null;
    if (!space) return null;
    const width = numberOf(dict.lookup(N('Width')));
    const height = numberOf(dict.lookup(N('Height')));
    if (!width || !height) return null;
    const parms = dict.lookup(N('DecodeParms'));
    if (parms && !(parms instanceof PDFDict)) return null;
    const predictor = parms instanceof PDFDict ? numberOf(parms.lookup(N('Predictor'))) : 1;
    const colors = space === 'DeviceRGB' ? 3 : space === 'DeviceCMYK' ? 4 : 1;
    if (parms instanceof PDFDict) {
      const parmColors = numberOf(parms.lookup(N('Colors')));
      const parmBpc = numberOf(parms.lookup(N('BitsPerComponent')));
      const parmCols = numberOf(parms.lookup(N('Columns')));
      if (parmColors && parmColors !== colors) return null;
      if (parmBpc && parmBpc !== 8) return null;
      if (parmCols && parmCols !== width) return null;
    }
    try {
      const inflated = unzlibSync(contents);
      const pixels = unfilterPredictor(inflated, width, height, colors, predictor);
      if (!pixels || pixels.length < width * height * colors) return null;
      if (space === 'DeviceCMYK') return { kind: 'rgb', data: cmykToRgb(pixels, width * height) };
      return { kind: space === 'DeviceRGB' ? 'rgb' : 'gray', data: pixels };
    } catch {
      return null;
    }
  }
  return null;
}

function resampleGray(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8Array {
  const out = new Uint8Array(dstW * dstH);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / dstW));
      out[y * dstW + x] = src[sy * srcW + sx];
    }
  }
  return out;
}

/**
 * Recompresse localement les images intégrées (JPEG RVB/gris, Flate RVB/gris/CMJN
 * avec ou sans prédicteur PNG/TIFF, gestion des masques SMask, profils ICCBased,
 * mode niveaux de gris), retire vignettes, objets orphelins et métadonnées.
 * Texte, liens et formulaires sont conservés. Le résultat n'est jamais plus gros
 * que l'original.
 */
export async function compressPdfImages(
  input: Uint8Array,
  options: CompressOptions,
  signal?: AbortSignal,
): Promise<CompressResult> {
  const doc = await PDFDocument.load(input, { updateMetadata: false });
  const entries = [...doc.context.enumerateIndirectObjects()].filter(
    (entry): entry is [PDFRef, PDFRawStream] =>
      entry[0] instanceof PDFRef &&
      entry[1] instanceof PDFRawStream &&
      nameOf(entry[1].dict.lookup(N('Subtype'))) === 'Image',
  );
  const smaskRefs = new Set<string>();
  for (const [, obj] of entries) {
    const smask = obj.dict.get(N('SMask'));
    if (smask instanceof PDFRef) smaskRefs.add(smask.toString());
  }
  let images = 0;
  let recompressed = 0;
  for (let i = 0; i < entries.length; i++) {
    const [ref, obj] = entries[i];
    abortIf(signal);
    if (smaskRefs.has(ref.toString())) continue;
    const dict = obj.dict;
    images++;
    const pixels = imageKind(dict, obj.contents);
    if (!pixels) {
      options.onProgress?.(((i + 1) / Math.max(1, entries.length)) * 0.9);
      continue;
    }
    const width = numberOf(dict.lookup(N('Width')));
    const height = numberOf(dict.lookup(N('Height')));
    if (!width || !height) continue;
    let scale = options.scale;
    if (options.maxDimension)
      scale = Math.min(scale, options.maxDimension / Math.max(width, height));
    scale = Math.min(1, scale);

    const smaskVal = dict.get(N('SMask'));
    const smaskStream = smaskVal instanceof PDFRef ? doc.context.lookup(smaskVal) : smaskVal;
    let smaskGray: Uint8Array | null = null;
    if (dict.has(N('SMask'))) {
      if (smaskStream instanceof PDFRawStream) {
        const smaskPixels = imageKind(smaskStream.dict, smaskStream.contents);
        const sw = numberOf(smaskStream.dict.lookup(N('Width')));
        const sh = numberOf(smaskStream.dict.lookup(N('Height')));
        if (smaskPixels?.kind === 'gray' && sw === width && sh === height)
          smaskGray = smaskPixels.data;
        else scale = 1;
      } else {
        scale = 1;
      }
    }

    const next = await options.encode({
      kind: pixels.kind,
      data: pixels.data,
      width,
      height,
      scale,
      quality: options.quality,
      grayscale: options.grayscale,
    });
    if (!next || next.bytes.length >= obj.contents.length) {
      options.onProgress?.(((i + 1) / Math.max(1, entries.length)) * 0.9);
      continue;
    }
    const copy = dict.clone(doc.context);
    if (dict.has(N('SMask')) && (next.width !== width || next.height !== height)) {
      if (!smaskGray || !(smaskStream instanceof PDFRawStream)) continue;
      const scaledMask = zlibSync(resampleGray(smaskGray, width, height, next.width, next.height), {
        level: 6,
      });
      const maskDict = smaskStream.dict.clone(doc.context);
      maskDict.set(N('Filter'), N('FlateDecode'));
      maskDict.set(N('ColorSpace'), N('DeviceGray'));
      maskDict.set(N('BitsPerComponent'), PDFNumber.of(8));
      maskDict.delete(N('DecodeParms'));
      maskDict.set(N('Width'), PDFNumber.of(next.width));
      maskDict.set(N('Height'), PDFNumber.of(next.height));
      maskDict.set(N('Length'), PDFNumber.of(scaledMask.length));
      const newMaskRef = doc.context.register(PDFRawStream.of(maskDict, scaledMask));
      copy.set(N('SMask'), newMaskRef);
    }
    copy.set(N('Filter'), N('DCTDecode'));
    copy.set(N('ColorSpace'), N('DeviceRGB'));
    copy.set(N('BitsPerComponent'), PDFNumber.of(8));
    copy.delete(N('DecodeParms'));
    copy.set(N('Width'), PDFNumber.of(next.width));
    copy.set(N('Height'), PDFNumber.of(next.height));
    copy.set(N('Length'), PDFNumber.of(next.bytes.length));
    doc.context.assign(ref, PDFRawStream.of(copy, next.bytes));
    recompressed++;
    options.onProgress?.(((i + 1) / Math.max(1, entries.length)) * 0.9);
  }
  removeThumbnails(doc);
  mergeDuplicateStreams(doc);
  const removed = removeOrphans(doc);
  if (options.stripMetadata !== false) {
    doc.setTitle('');
    doc.setAuthor('');
    doc.setSubject('');
    doc.setKeywords([]);
    doc.setProducer('');
    doc.setCreator('');
    doc.catalog.delete(N('Metadata'));
    doc.context.trailerInfo.Info = undefined;
  }
  const saved = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
  options.onProgress?.(1);
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
  for (let i = 0; i < steps.length; i++) {
    const [scale, quality] = steps[i];
    abortIf(signal);
    const result = await compressPdfImages(
      input,
      {
        ...base,
        scale,
        quality,
        onProgress: (n) => base.onProgress?.((i + n) / steps.length),
      },
      signal,
    );
    if (!best || result.bytes.length < best.bytes.length) best = result;
    if (result.bytes.length <= targetBytes) {
      base.onProgress?.(1);
      return { ...result, reached: true };
    }
  }
  return { ...(best as CompressResult), reached: false };
}

/** Encodeur navigateur : décodage, redimensionnement et JPEG, 100 % local (compatible Worker). */
export const browserImageEncoder: ImageEncoder = async ({
  kind,
  data,
  width,
  height,
  scale,
  quality,
  grayscale,
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
    if (grayscale) {
      const img = ctx.getImageData(0, 0, w, h);
      const px = img.data;
      for (let i = 0; i < px.length; i += 4) {
        const l = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
        px[i] = px[i + 1] = px[i + 2] = l;
      }
      ctx.putImageData(img, 0, 0);
    }
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h };
  } finally {
    bitmap.close();
  }
};
