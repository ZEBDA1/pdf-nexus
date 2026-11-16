import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { zlibSync } from 'fflate';
import { compressPdfImages, compressToTarget, type ImageEncoder } from '../src/pdf/compress';

async function pdfWithImage(w = 64, h = 64) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  page.drawText('Texte conservé');
  const raw = new Uint8Array(w * h * 3).map((_, i) => (i * 7) % 256);
  const ref = doc.context.register(
    PDFRawStream.of(
      doc.context.obj({
        Type: 'XObject',
        Subtype: 'Image',
        Width: w,
        Height: h,
        ColorSpace: 'DeviceRGB',
        BitsPerComponent: 8,
        Filter: 'FlateDecode',
      }),
      zlibSync(raw, { level: 0 }),
    ),
  );
  page.node.setXObject?.(PDFName.of('Im0'), ref);
  doc.context.register(doc.context.obj({ Orphan: 'x'.repeat(5000) }));
  doc.setTitle('Titre secret');
  return doc.save({ useObjectStreams: false });
}

const small: ImageEncoder = async ({ width, height, scale }) => ({
  bytes: new Uint8Array(40),
  width: Math.round(width * scale),
  height: Math.round(height * scale),
});

describe('compressPdfImages', () => {
  it('conserve un PDF sans image et ne grossit jamais', async () => {
    const doc = await PDFDocument.create();
    doc.addPage().drawText('Bonjour');
    const input = await doc.save({ useObjectStreams: false });
    const out = await compressPdfImages(input, {
      scale: 0.5,
      quality: 0.5,
      encode: async () => null,
    });
    expect(out.bytes.length).toBeLessThanOrEqual(input.length);
    expect(out.images).toBe(0);
    expect((await PDFDocument.load(out.bytes)).getPageCount()).toBe(1);
  });

  it('recompresse une image Flate, réduit sa taille et supprime orphelins et métadonnées', async () => {
    const input = await pdfWithImage();
    const out = await compressPdfImages(input, { scale: 0.5, quality: 0.5, encode: small });
    expect(out.recompressed).toBe(1);
    expect(out.removed).toBeGreaterThan(0);
    expect(out.bytes.length).toBeLessThan(input.length);
    const reloaded = await PDFDocument.load(out.bytes);
    expect(reloaded.getTitle() ?? '').toBe('');
    const streams = [...reloaded.context.enumerateIndirectObjects()]
      .map(([, o]) => o)
      .filter((o): o is PDFRawStream => o instanceof PDFRawStream);
    const image = streams.find((s) => s.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'));
    expect(image?.dict.get(PDFName.of('Filter'))).toBe(PDFName.of('DCTDecode'));
  });

  it('plafonne les très grandes images avec maxDimension', async () => {
    let seen = 1;
    const input = await pdfWithImage(100, 50);
    await compressPdfImages(input, {
      scale: 1,
      quality: 0.5,
      maxDimension: 50,
      encode: async (i) => {
        seen = i.scale;
        return null;
      },
    });
    expect(seen).toBe(0.5);
  });

  it('ajuste les réglages pour atteindre une taille cible', async () => {
    const input = await pdfWithImage();
    const out = await compressToTarget(input, input.length * 10, { encode: small });
    expect(out.reached).toBe(true);
    const miss = await compressToTarget(input, 10, { encode: small });
    expect(miss.reached).toBe(false);
  });

  it('laisse intact un PDF protégé ou invalide sans le corrompre', async () => {
    await expect(
      compressPdfImages(new Uint8Array([1, 2, 3]), { scale: 1, quality: 1, encode: small }),
    ).rejects.toBeTruthy();
  });
});
