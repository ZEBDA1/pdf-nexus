import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRawStream,
  PDFRef,
  PDFString,
  StandardFonts,
  rgb,
} from 'pdf-lib';
import { unzlibSync, zipSync, zlibSync } from 'fflate';

const N = (name: string) => PDFName.of(name);

/* ---------- Métadonnées (point 12) ---------- */

export interface Metadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
}

export async function readMetadata(bytes: Uint8Array): Promise<Metadata> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return {
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    keywords: doc.getKeywords() ?? '',
  };
}

export async function writeMetadata(bytes: Uint8Array, meta: Metadata): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  doc.setTitle(meta.title.trim());
  doc.setAuthor(meta.author.trim());
  doc.setSubject(meta.subject.trim());
  doc.setKeywords(
    meta.keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean),
  );
  return doc.save();
}

/* ---------- Numérotation, en-têtes, pieds de page, Bates (point 11) ---------- */

export interface StampOptions {
  /** Modèle : {n} page, {total} pages, {bates} numéro Bates. */
  header?: string;
  footer?: string;
  bates?: { prefix: string; start: number; digits: number };
  size?: number;
}

export function expandTemplate(
  template: string,
  n: number,
  total: number,
  bates?: StampOptions['bates'],
) {
  const code = bates
    ? bates.prefix + String(bates.start + n - 1).padStart(Math.max(1, bates.digits), '0')
    : '';
  return template
    .replaceAll('{n}', String(n))
    .replaceAll('{total}', String(total))
    .replaceAll('{bates}', code);
}

export async function stampPages(bytes: Uint8Array, options: StampOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = options.size ?? 10;
  const pages = doc.getPages();
  const draw = (page: (typeof pages)[number], text: string, top: boolean, align: 'c' | 'r') => {
    if (!text) return;
    const { width, height } = page.getSize();
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: align === 'c' ? (width - w) / 2 : width - w - 36,
      y: top ? height - 28 : 20,
      size,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  };
  pages.forEach((page, i) => {
    const n = i + 1;
    if (options.header)
      draw(page, expandTemplate(options.header, n, pages.length, options.bates), true, 'c');
    if (options.footer)
      draw(page, expandTemplate(options.footer, n, pages.length, options.bates), false, 'c');
    if (options.bates && !(options.header + (options.footer ?? '')).includes('{bates}'))
      draw(page, expandTemplate('{bates}', n, pages.length, options.bates), false, 'r');
  });
  return doc.save();
}

/* ---------- Signets (point 13) ---------- */

export interface OutlineItem {
  title: string;
  /** Numéro de page, à partir de 1. */
  page: number;
}

/** Format texte : une ligne « Titre | page » par signet. */
export function parseOutline(text: string, pageCount: number): OutlineItem[] {
  const items: OutlineItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cut = line.lastIndexOf('|');
    const title = (cut < 0 ? line : line.slice(0, cut)).trim();
    const page = cut < 0 ? NaN : Number(line.slice(cut + 1).trim());
    if (!title || !Number.isInteger(page) || page < 1 || page > pageCount)
      throw new Error(
        `Signet invalide : « ${line.trim()} » (format : Titre | page, 1–${pageCount}).`,
      );
    items.push({ title, page });
  }
  return items;
}

export function formatOutline(items: OutlineItem[]) {
  return items.map((i) => `${i.title} | ${i.page}`).join('\n');
}

export async function readOutline(bytes: Uint8Array): Promise<OutlineItem[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const pageRefs = doc.getPages().map((p) => p.ref);
  const first = doc.catalog.lookupMaybe(N('Outlines'), PDFDict)?.get(N('First'));
  const items: OutlineItem[] = [];
  let ref: PDFObject | undefined = first;
  for (let guard = 0; ref instanceof PDFRef && guard < 5000; guard++) {
    const node = doc.context.lookup(ref, PDFDict);
    const title = node.lookup(N('Title'));
    const dest = node.lookup(N('Dest'));
    const target = dest instanceof PDFArray ? dest.get(0) : undefined;
    const page = target instanceof PDFRef ? pageRefs.indexOf(target) : -1;
    if ((title instanceof PDFString || title instanceof PDFHexString) && page >= 0)
      items.push({ title: title.decodeText(), page: page + 1 });
    ref = node.get(N('Next'));
  }
  return items;
}

export async function writeOutline(bytes: Uint8Array, items: OutlineItem[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const ctx = doc.context;
  const pages = doc.getPages();
  if (!items.length) {
    doc.catalog.delete(N('Outlines'));
    return doc.save();
  }
  const rootRef = ctx.nextRef();
  const refs = items.map(() => ctx.nextRef());
  items.forEach((item, i) => {
    if (item.page < 1 || item.page > pages.length) throw new Error('Page de signet invalide.');
    const entries: Record<string, PDFObject> = {
      Title: PDFHexString.fromText(item.title),
      Parent: rootRef,
      Dest: ctx.obj([pages[item.page - 1].ref, N('Fit')]),
    };
    if (i > 0) entries.Prev = refs[i - 1];
    if (i < items.length - 1) entries.Next = refs[i + 1];
    ctx.assign(refs[i], ctx.obj(entries));
  });
  ctx.assign(
    rootRef,
    ctx.obj({
      Type: 'Outlines',
      First: refs[0],
      Last: refs[refs.length - 1],
      Count: PDFNumber.of(items.length),
    }),
  );
  doc.catalog.set(N('Outlines'), rootRef);
  return doc.save();
}

/* ---------- Extraction des images (point 14) ---------- */

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function encodePng(pixels: Uint8Array, width: number, height: number, channels: 1 | 3) {
  const stride = width * channels;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++)
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  header[8] = 8;
  header[9] = channels === 3 ? 2 : 0;
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlibSync(raw)),
    chunk('IEND', new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export interface ExtractedImage {
  name: string;
  bytes: Uint8Array;
}

/** Extrait les images JPEG (telles quelles) et Flate RVB/gris 8 bits (en PNG). */
export async function extractImages(bytes: Uint8Array): Promise<ExtractedImage[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const out: ExtractedImage[] = [];
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if ((dict.lookup(N('Subtype')) as PDFName | undefined)?.decodeText() !== 'Image') continue;
    const filter = (dict.lookup(N('Filter')) as PDFName | undefined)?.decodeText();
    const space = (dict.lookup(N('ColorSpace')) as PDFName | undefined)?.decodeText();
    const width = (dict.lookup(N('Width')) as PDFNumber | undefined)?.asNumber() ?? 0;
    const height = (dict.lookup(N('Height')) as PDFNumber | undefined)?.asNumber() ?? 0;
    const label = `image-${String(out.length + 1).padStart(3, '0')}`;
    if (filter === 'DCTDecode' && space !== 'DeviceCMYK') {
      out.push({ name: `${label}.jpg`, bytes: obj.contents });
    } else if (
      filter === 'FlateDecode' &&
      (space === 'DeviceRGB' || space === 'DeviceGray') &&
      width &&
      height &&
      (dict.lookup(N('BitsPerComponent')) as PDFNumber | undefined)?.asNumber() === 8 &&
      !dict.has(N('DecodeParms'))
    ) {
      try {
        const channels = space === 'DeviceRGB' ? 3 : 1;
        const pixels = unzlibSync(obj.contents);
        if (pixels.length >= width * height * channels)
          out.push({ name: `${label}.png`, bytes: encodePng(pixels, width, height, channels) });
      } catch {
        /* flux illisible : ignoré */
      }
    }
    void ref;
  }
  return out;
}

export function zipImages(images: ExtractedImage[]) {
  const entries: Record<string, Uint8Array> = {};
  for (const i of images) entries[i.name] = i.bytes;
  return zipSync(entries, { level: 0 });
}
