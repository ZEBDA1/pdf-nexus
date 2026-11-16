import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { compressPdfImages } from '../src/pdf/compress';

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
});
