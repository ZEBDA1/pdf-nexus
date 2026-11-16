import { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef } from 'pdf-lib';

export type ImageEncoder = (
  jpeg: Uint8Array,
  width: number,
  height: number,
  scale: number,
  quality: number,
) => Promise<{ bytes: Uint8Array; width: number; height: number } | null>;

export interface CompressOptions {
  scale: number;
  quality: number;
  encode: ImageEncoder;
}

export interface CompressResult {
  bytes: Uint8Array;
  images: number;
  recompressed: number;
}

function nameOf(value: unknown): string | undefined {
  return value instanceof PDFName ? value.decodeText() : undefined;
}

function numberOf(value: unknown): number {
  return value instanceof PDFNumber ? value.asNumber() : 0;
}

/**
 * Recompresse localement les images JPEG intégrées (RVB) et supprime les
 * métadonnées. Texte, liens, formulaires et vecteurs sont conservés.
 * Une image n'est remplacée que si le résultat est plus petit.
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
    if (signal?.aborted) throw new DOMException('Opération annulée.', 'AbortError');
    if (!(ref instanceof PDFRef) || !(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (nameOf(dict.lookup(PDFName.of('Subtype'))) !== 'Image') continue;
    images++;
    if (
      nameOf(dict.lookup(PDFName.of('Filter'))) !== 'DCTDecode' ||
      nameOf(dict.lookup(PDFName.of('ColorSpace'))) !== 'DeviceRGB' ||
      dict.has(PDFName.of('Decode')) ||
      dict.has(PDFName.of('Mask')) ||
      dict.has(PDFName.of('DecodeParms'))
    )
      continue;
    const width = numberOf(dict.lookup(PDFName.of('Width')));
    const height = numberOf(dict.lookup(PDFName.of('Height')));
    if (!width || !height) continue;
    const next = await options.encode(obj.contents, width, height, options.scale, options.quality);
    if (!next || next.bytes.length >= obj.contents.length) continue;
    const stream = PDFRawStream.of(dict.clone(doc.context), next.bytes);
    stream.dict.set(PDFName.of('Width'), PDFNumber.of(next.width));
    stream.dict.set(PDFName.of('Height'), PDFNumber.of(next.height));
    stream.dict.set(PDFName.of('Length'), PDFNumber.of(next.bytes.length));
    doc.context.assign(ref, stream);
    recompressed++;
  }
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setProducer('');
  doc.setCreator('');
  const saved = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
  // Ne jamais produire un fichier plus gros que l'original.
  return saved.length < input.length
    ? { bytes: saved, images, recompressed }
    : { bytes: input, images, recompressed: 0 };
}

/** Encodeur navigateur : décodage + redimensionnement + JPEG, 100 % local. */
export const browserImageEncoder: ImageEncoder = async (jpeg, width, height, scale, quality) => {
  const bitmap = await createImageBitmap(new Blob([jpeg as BlobPart], { type: 'image/jpeg' }));
  try {
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h };
  } finally {
    bitmap.close();
  }
};
