import { it, expect } from 'vitest';
import {
  PDFDocument,
  StandardFonts,
  PDFName,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib';
import { listNativeRuns, nativePreview } from '../src/pdf/native-text';
import { defaultWatermark, watermarkPositions } from '../src/pdf/watermark';
import { textToPdf } from '../src/pdf/operations';
import { closestFont } from '../src/pdf/text-style';
import { readFile } from 'node:fs/promises';

async function fixture() {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.HelveticaBold);
  const p = d.addPage();
  p.drawRectangle({ x: 20, y: 500, width: 400, height: 200 });
  p.drawText('Bonjour (Nexus)', { x: 50, y: 650, size: 20, font });
  p.drawText('Une autre ligne', { x: 50, y: 600, size: 12, font });
  return d.save();
}
it('remplace les opérandes natifs en préservant police et instructions graphiques', async () => {
  const source = await fixture(),
    runs = await listNativeRuns(source, 0);
  expect(runs.map((r) => r.text)).toEqual(['Bonjour (Nexus)', 'Une autre ligne']);
  const run = runs[0];
  const result = await nativePreview(source, 0, [
    { id: run.id, original: run.text, text: 'Bonsoir (Paris)', size: 18 },
  ]);
  const next = await listNativeRuns(result, 0);
  expect(next[0]).toMatchObject({ text: 'Bonsoir (Paris)', font: 'Helvetica-Bold', size: 18 });
  expect(next[1].text).toBe('Une autre ligne');
  const doc = await PDFDocument.load(result),
    contents = doc.getPage(0).node.Contents() as PDFArray;
  const streams = contents.asArray().map((r) => doc.context.lookup(r) as PDFRawStream);
  const text = streams
    .map((r) => new TextDecoder().decode(decodePDFRawStream(r).decode()))
    .join('');
  expect(text).toContain('400 0 l');
  expect(text).not.toContain('426F6E6A6F7572');
});
it('refuse les caractères indisponibles puis permet une police de remplacement', async () => {
  const source = await textToPdf(
    'Bonjour Nexus',
    new Uint8Array(await readFile('public/fonts/NotoSans-Regular.ttf')),
  );
  const [run] = await listNativeRuns(source, 0);
  expect(run.text).toBe('Bonjour Nexus');
  await expect(
    nativePreview(source, 0, [{ id: run.id, original: run.text, text: 'Été' }]),
  ).rejects.toThrow('absent');
  const result = await nativePreview(source, 0, [
    { id: run.id, original: run.text, text: 'Été', font: StandardFonts.TimesRoman },
  ]);
  expect((await listNativeRuns(result, 0))[0]).toMatchObject({ text: 'Été', font: 'Times-Roman' });
});
it('refuse les identifiants périmés et ne modifie pas un bloc incompatible', async () => {
  const source = await fixture();
  await expect(
    nativePreview(source, 0, [{ id: 'absent', original: 'Bonjour', text: 'Autre' }]),
  ).rejects.toThrow('ne peut pas');
  const [run] = await listNativeRuns(source, 0);
  await expect(
    nativePreview(source, 0, [{ id: run.id, original: run.text, text: 'a\nb' }]),
  ).rejects.toThrow('seule ligne');
});
it('sélectionne les bonnes pages et positions de filigrane', () => {
  const w = { ...defaultWatermark, text: 'CONFIDENTIEL', pages: 'odd' as const, repeat: true };
  expect(watermarkPositions(w, 600, 800, 1)).toHaveLength(6);
  expect(watermarkPositions(w, 600, 800, 2)).toEqual([]);
  expect(watermarkPositions({ ...w, repeat: false, position: 'bottom' }, 600, 800, 1)).toEqual([
    { x: 300, y: 70 },
  ]);
});

it('modifie une ligne dans un objet multiligne sans modifier la police de la suivante', async () => {
  const d = await PDFDocument.create(),
    f = await d.embedFont(StandardFonts.Helvetica);
  const p = d.addPage();
  const name = p.node.newFontDictionary(f.name, f.ref).toString();
  p.node.set(
    PDFName.of('Contents'),
    d.context.register(
      d.context.flateStream(
        `BT ${name} 14 Tf 1 0 0 1 40 700 Tm (Premiere) Tj 0 -20 Td (Seconde) Tj ET`,
      ),
    ),
  );
  const bytes = await d.save(),
    runs = await listNativeRuns(bytes, 0);
  expect(runs).toHaveLength(2);
  const output = await nativePreview(bytes, 0, [
    {
      id: runs[0].id,
      original: runs[0].text,
      text: 'Modifiee',
      size: 18,
      font: StandardFonts.TimesRomanBold,
    },
  ]);
  const edited = await listNativeRuns(output, 0);
  expect(edited[0]).toMatchObject({ text: 'Modifiee', font: 'Times-Bold', size: 18 });
  expect(edited[1]).toMatchObject({ text: 'Seconde', font: 'Helvetica', size: 14 });
});

it('adapte automatiquement une police sous-ensemble sans conserver le texte remplacé', async () => {
  const fontBytes = new Uint8Array(await readFile('public/fonts/NotoSans-Regular.ttf'));
  const bytes = await textToPdf('Bonjour Nexus', fontBytes);
  const [run] = await listNativeRuns(bytes, 0);
  const output = await nativePreview(
    bytes,
    0,
    [{ id: run.id, original: run.text, text: 'Été à Paris', autoAdapt: true }],
    fontBytes,
  );
  expect((await listNativeRuns(output, 0))[0]).toMatchObject({
    text: 'Été à Paris',
    font: 'Helvetica',
  });
  const unicode = await nativePreview(
    bytes,
    0,
    [{ id: run.id, original: run.text, text: 'Привет', autoAdapt: true }],
    fontBytes,
  );
  expect((await listNativeRuns(unicode, 0))[0].text).toBe('Привет');
  expect(closestFont('ABCDEF+TimesNewRoman-BoldItalic')).toBe('Times-BoldItalic');
  expect(closestFont('CourierNewPS-Bold')).toBe('Courier-Bold');
});
