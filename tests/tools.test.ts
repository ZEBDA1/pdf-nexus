import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { unzlibSync, zlibSync } from 'fflate';
import {
  expandTemplate,
  extractImages,
  formatOutline,
  parseOutline,
  readMetadata,
  readOutline,
  stampPages,
  writeMetadata,
  writeOutline,
} from '../src/pdf/tools';
import { mergeDuplicateStreams } from '../src/pdf/compress';

async function sample(pages = 3) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]).drawText('Page ' + (i + 1));
  return doc;
}

describe('outils PDF', () => {
  it('écrit et relit les métadonnées', async () => {
    const bytes = await (await sample()).save();
    const out = await writeMetadata(bytes, {
      title: 'Titre',
      author: 'Moi',
      subject: 'Sujet',
      keywords: 'a, b ,,c',
    });
    const meta = await readMetadata(out);
    expect(meta).toMatchObject({ title: 'Titre', author: 'Moi', subject: 'Sujet' });
    expect(meta.keywords).toBe('a b c');
  });

  it('développe les modèles de numérotation et Bates', () => {
    expect(expandTemplate('{n}/{total}', 2, 5)).toBe('2/5');
    expect(expandTemplate('{bates}', 3, 9, { prefix: 'AB-', start: 10, digits: 5 })).toBe(
      'AB-00012',
    );
  });

  it('tamponne chaque page sans changer leur nombre', async () => {
    const bytes = await (await sample()).save();
    const out = await stampPages(bytes, {
      footer: 'Page {n} sur {total}',
      bates: { prefix: 'X', start: 1, digits: 3 },
    });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(3);
    expect(out.length).toBeGreaterThan(bytes.length);
  });

  it('crée, relit et supprime des signets', async () => {
    const bytes = await (await sample()).save();
    const items = parseOutline('Intro | 1\nSuite | 3', 3);
    const out = await writeOutline(bytes, items);
    expect(await readOutline(out)).toEqual(items);
    expect(formatOutline(items)).toBe('Intro | 1\nSuite | 3');
    expect(await readOutline(await writeOutline(out, []))).toEqual([]);
    expect(() => parseOutline('Mauvais | 9', 3)).toThrow();
  });

  it('extrait une image Flate en PNG valide', async () => {
    const doc = await sample(1);
    const raw = new Uint8Array(4 * 4 * 3).fill(120);
    doc.context.register(
      PDFRawStream.of(
        doc.context.obj({
          Type: 'XObject',
          Subtype: 'Image',
          Width: 4,
          Height: 4,
          ColorSpace: 'DeviceRGB',
          BitsPerComponent: 8,
          Filter: 'FlateDecode',
        }),
        zlibSync(raw),
      ),
    );
    const images = await extractImages(await doc.save());
    expect(images).toHaveLength(1);
    expect(images[0].name.endsWith('.png')).toBe(true);
    expect([...images[0].bytes.slice(0, 4)]).toEqual([137, 80, 78, 71]);
    expect(unzlibSync(images[0].bytes.slice(33 + 8, -12)).length).toBe(4 * (4 * 3 + 1));
  });

  it('fusionne les flux identiques', async () => {
    const doc = await sample(1);
    const make = () =>
      doc.context.register(
        PDFRawStream.of(doc.context.obj({ Subtype: 'Image' }), new Uint8Array([1, 2, 3])),
      );
    const a = make();
    const b = make();
    doc.getPages()[0].node.set(PDFName.of('A'), a);
    doc.getPages()[0].node.set(PDFName.of('B'), b);
    expect(mergeDuplicateStreams(doc)).toBe(1);
    expect(doc.getPages()[0].node.get(PDFName.of('B'))).toBe(a);
  });
});
