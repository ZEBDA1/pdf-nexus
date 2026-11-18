import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import { zlibSync } from 'fflate';
import {
  compressPdfImages,
  compressToTarget,
  unfilterPredictor,
  type ImageEncoder,
} from '../src/pdf/compress';

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
  width: Math.max(1, Math.round(width * scale)),
  height: Math.max(1, Math.round(height * scale)),
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

  it('conserve les métadonnées quand stripMetadata est faux', async () => {
    const input = await pdfWithImage();
    const out = await compressPdfImages(input, {
      scale: 0.5,
      quality: 0.5,
      stripMetadata: false,
      encode: small,
    });
    const reloaded = await PDFDocument.load(out.bytes);
    expect(reloaded.getTitle()).toBe('Titre secret');
  });

  it('décode les images Flate avec prédicteur PNG 12, profil ICCBased, CMJN et redimensionne le SMask', async () => {
    const w = 32;
    const h = 32;
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);

    // Image RVB avec prédicteur PNG 12 (Up = 2, scanline = [2, ...]) + profil ICCBased N=3 + SMask
    const rgbPayload = new Uint8Array((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) {
      const row = y * (w * 3 + 1);
      rgbPayload[row] = 2; // Up filter
      for (let x = 0; x < w * 3; x++) rgbPayload[row + 1 + x] = y === 0 ? (x * 5) % 256 : 1;
    }
    const iccRef = doc.context.register(
      PDFRawStream.of(
        doc.context.obj({ N: 3, Filter: 'FlateDecode' }),
        zlibSync(new Uint8Array(32)),
      ),
    );
    const maskRef = doc.context.register(
      PDFRawStream.of(
        doc.context.obj({
          Type: 'XObject',
          Subtype: 'Image',
          Width: w,
          Height: h,
          ColorSpace: 'DeviceGray',
          BitsPerComponent: 8,
          Filter: 'FlateDecode',
        }),
        zlibSync(new Uint8Array(w * h).fill(200), { level: 0 }),
      ),
    );
    const rgbRef = doc.context.register(
      PDFRawStream.of(
        doc.context.obj({
          Type: 'XObject',
          Subtype: 'Image',
          Width: w,
          Height: h,
          ColorSpace: [PDFName.of('ICCBased'), iccRef],
          BitsPerComponent: 8,
          Filter: 'FlateDecode',
          DecodeParms: { Predictor: 12, Colors: 3, BitsPerComponent: 8, Columns: w },
          SMask: maskRef,
        }),
        zlibSync(rgbPayload, { level: 0 }),
      ),
    );
    page.node.setXObject?.(PDFName.of('ImRgb'), rgbRef);

    // Image CMJN sans prédicteur
    const cmykRef = doc.context.register(
      PDFRawStream.of(
        doc.context.obj({
          Type: 'XObject',
          Subtype: 'Image',
          Width: w,
          Height: h,
          ColorSpace: 'DeviceCMYK',
          BitsPerComponent: 8,
          Filter: 'FlateDecode',
        }),
        zlibSync(new Uint8Array(w * h * 4).fill(64), { level: 0 }),
      ),
    );
    page.node.setXObject?.(PDFName.of('ImCmyk'), cmykRef);

    const input = await doc.save({ useObjectStreams: false });
    let seenGrayscale = false;
    const out = await compressPdfImages(input, {
      scale: 0.5,
      quality: 0.6,
      grayscale: true,
      encode: async (enc) => {
        if (enc.grayscale) seenGrayscale = true;
        return small(enc);
      },
    });
    expect(seenGrayscale).toBe(true);
    expect(out.images).toBe(2);
    expect(out.recompressed).toBe(2);

    const reloaded = await PDFDocument.load(out.bytes);
    const images = [...reloaded.context.enumerateIndirectObjects()]
      .map(([, o]) => o)
      .filter(
        (o): o is PDFRawStream =>
          o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'),
      );
    const resizedMask = images.find(
      (s) => s.dict.get(PDFName.of('ColorSpace')) === PDFName.of('DeviceGray'),
    );
    expect((resizedMask?.dict.get(PDFName.of('Width')) as PDFNumber)?.asNumber()).toBe(16);
    expect((resizedMask?.dict.get(PDFName.of('Height')) as PDFNumber)?.asNumber()).toBe(16);
  });

  it('décode le prédicteur TIFF 2 et PNG Sub', () => {
    const tiff = new Uint8Array([10, 20, 30, 5, 5, 5]);
    expect(Array.from(unfilterPredictor(tiff, 2, 1, 3, 2) ?? [])).toEqual([10, 20, 30, 15, 25, 35]);
    const pngSub = new Uint8Array([1, 10, 20, 30, 5, 5, 5]);
    expect(Array.from(unfilterPredictor(pngSub, 2, 1, 3, 15) ?? [])).toEqual([
      10, 20, 30, 15, 25, 35,
    ]);
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
