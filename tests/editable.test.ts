import { describe, it, expect } from 'vitest';
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
  StandardFonts,
} from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { exportWorkspace } from '../src/pdf/operations';
import { restoreEditableSource } from '../src/pdf/editable';
import { listNativeRuns } from '../src/pdf/native-text';
import type { Annotation, Workspace } from '../src/types';

const font = new Uint8Array(await readFile('public/fonts/NotoSans-Regular.ttf'));
async function workspace(): Promise<Workspace> {
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([400, 600]).drawText('Contenu original', { x: 25, y: 550, font: f });
  pdf.addPage([300, 500]).drawText('Page retiree', { x: 25, y: 450, font: f });
  return {
    name: 'reeditable.pdf',
    sources: [{ name: 'source.pdf', bytes: await pdf.save() }],
    pages: [{ id: 'p', source: 0, index: 0, rotation: 0, annotations: [] }],
    watermark: '',
    numbering: false,
    cleanMetadata: false,
    encrypted: false,
  };
}
const a: Annotation = {
  id: 'a',
  type: 'checkbox',
  checked: true,
  x: 25,
  y: 450,
  width: 16,
  height: 16,
  color: '#000000',
  size: 12,
};
async function reopen(w: Workspace) {
  const result = await restoreEditableSource({
    name: w.name,
    bytes: await exportWorkspace(w, font),
  });
  return {
    ...w,
    sources: [result.source],
    pages: w.pages.map((p, i) => ({
      ...p,
      index: i,
      source: 0,
      rotation: 0,
      nativeEdits: [],
      annotations: result.annotations[i] ?? [],
    })),
    watermark: '',
    numbering: false,
  };
}
async function streams(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(0);
  const contents = page.node.lookup(PDFName.of('Contents'), PDFArray);
  return contents
    .asArray()
    .map((ref) =>
      new TextDecoder().decode(
        decodePDFRawStream(pdf.context.lookup(ref) as PDFRawStream).decode(),
      ),
    )
    .join('\n');
}

describe('Réouverture des ajouts Nexus', () => {
  it('restaure toutes les familles et les images sans incorporer les pages retirées', async () => {
    const w = await workspace();
    const image = new Uint8Array(await readFile('public/icons/128.png'));
    w.pages[0].annotations = [
      'text',
      'note',
      'stamp',
      'highlight',
      'underline',
      'strike',
      'pen',
      'rect',
      'ellipse',
      'line',
      'arrow',
      'link',
      'image',
      'checkbox',
    ].map((type, i) => ({
      ...a,
      type: type as Annotation['type'],
      id: 'a' + i,
      y: 20 + i * 30,
      width: 180,
      height: 28,
      text: 'Ajout',
      points: [
        { x: 20, y: 20 },
        { x: 40, y: 35 },
      ],
      ...(type === 'link' ? { url: 'https://example.com/' } : {}),
      ...(type === 'image' ? { image, imageType: 'png' as const } : {}),
    }));
    const result = await reopen(w);
    expect(result.pages[0].annotations).toEqual(w.pages[0].annotations);
    expect((await PDFDocument.load(result.sources[0].bytes)).getPageCount()).toBe(1);
    expect(await streams(result.sources[0].bytes)).not.toContain('006a006f0075');
    expect((await listNativeRuns(result.sources[0].bytes, 0)).map((r) => r.text)).toEqual([
      'Contenu original',
    ]);
    const pdf = await PDFDocument.load(result.sources[0].bytes);
    expect(pdf.getPage(0).node.normalizedEntries().XObject.keys()).toHaveLength(0);
  });
  it('supprime une case et un dessin, conserve le texte natif corrigé et évite les doublons après deux cycles', async () => {
    const w = await workspace();
    const [run] = await listNativeRuns(w.sources[0].bytes, 0);
    w.pages[0].nativeEdits = [{ id: run.id, original: run.text, text: 'Contenu corrige' }];
    w.pages[0].annotations = [
      a,
      {
        ...a,
        id: 'dessin',
        type: 'pen',
        points: [
          { x: 80, y: 450 },
          { x: 120, y: 480 },
        ],
      },
    ];
    const again = await reopen(w);
    expect(again.pages[0].annotations).toHaveLength(2);
    again.pages[0].annotations = [];
    const final = await exportWorkspace(again, font);
    const p = (await PDFDocument.load(final)).getPage(0);
    expect(p.node.has(PDFName.of('NexusEdits'))).toBe(false);
    expect((await listNativeRuns(final, 0)).map((r) => r.text)).toEqual(['Contenu corrige']);
    const twice = await reopen(await reopen(w));
    expect(twice.pages[0].annotations).toEqual(w.pages[0].annotations);
  });
  it('garde filigrane, pagination et rotation sans les dupliquer au nouvel export', async () => {
    const w = await workspace();
    w.pages[0].annotations = [a];
    w.pages[0].rotation = 90;
    w.watermark = 'CONFIDENTIEL';
    w.numbering = true;
    w.cleanMetadata = true;
    const again = await reopen(w);
    const pdf = await PDFDocument.load(await exportWorkspace(again, font), {
      updateMetadata: false,
    });
    expect(pdf.getPage(0).getRotation().angle).toBe(90);
    expect(pdf.context.trailerInfo.Info).toBeUndefined();
    const restored = await restoreEditableSource({
      name: 'test.pdf',
      bytes: await exportWorkspace(again, font),
    });
    expect(restored.annotations[0]).toEqual([a]);
    expect(
      (await listNativeRuns(restored.source.bytes, 0)).filter((r) => r.text === 'CONFIDENTIEL'),
    ).toHaveLength(1);
  });
  it('ne masque pas le rendu si les données sont invalides ou contiennent un lien exécutable', async () => {
    const w = await workspace();
    w.pages[0].annotations = [a];
    const pdf = await PDFDocument.load(await exportWorkspace(w, font));
    const state = pdf.getPage(0).node.lookup(PDFName.of('NexusEdits'), PDFDict);
    const unsafe = [{ ...a, type: 'link', url: 'javascript:alert(1)' }];
    state.set(PDFName.of('Data'), pdf.context.register(pdf.context.stream(JSON.stringify(unsafe))));
    const source = { name: 'test.pdf', bytes: await pdf.save() };
    const result = await restoreEditableSource(source);
    expect(result.invalidPages).toBe(1);
    expect(result.source).toBe(source);
    expect(result.annotations).toEqual([]);
  });
  it('laisse inchangés les PDF ordinaires, les anciens exports et les entrées malformées', async () => {
    const w = await workspace();
    const source = w.sources[0];
    expect((await restoreEditableSource(source)).source).toBe(source);
    const bad = { name: 'bad.pdf', bytes: new Uint8Array([1, 2, 3]) };
    expect((await restoreEditableSource(bad)).source).toBe(bad);
  });
  it('valide les widgets sauvegardés avant toute mutation, même si une autre page est récupérable', async () => {
    const w = await workspace();
    w.pages[0].annotations = [a];
    w.pages.push({
      ...w.pages[0],
      id: 'second',
      index: 1,
      annotations: [{ ...a, id: 'second-case' }],
    });
    const pdf = await PDFDocument.load(await exportWorkspace(w, font));
    const page = pdf.getPage(1);
    const before = page.node
      .lookup(PDFName.of('Contents'), PDFArray)
      .asArray()
      .map((ref) => Array.from((pdf.context.lookup(ref) as PDFRawStream).getContents()));
    page.node
      .lookup(PDFName.of('NexusEdits'), PDFDict)
      .set(PDFName.of('BaseAnnots'), PDFName.of('Invalid'));
    const result = await restoreEditableSource({
      name: 'partially-damaged.pdf',
      bytes: await pdf.save(),
    });
    expect(result.invalidPages).toBe(1);
    expect(result.annotations[0]).toEqual([a]);
    const restored = await PDFDocument.load(result.source.bytes);
    const after = restored
      .getPage(1)
      .node.lookup(PDFName.of('Contents'), PDFArray)
      .asArray()
      .map((ref) => Array.from((restored.context.lookup(ref) as PDFRawStream).getContents()));
    expect(after).toEqual(before);
    expect(restored.getPage(1).node.has(PDFName.of('NexusEdits'))).toBe(true);
  });
  it('conserve les changements d’un autre éditeur au lieu de restaurer un fond devenu obsolète', async () => {
    const w = await workspace();
    w.pages[0].annotations = [a];
    const pdf = await PDFDocument.load(await exportWorkspace(w, font));
    pdf.getPage(0).drawText('Autre editeur', { x: 20, y: 20 });
    const source = { name: 'autre-editeur.pdf', bytes: await pdf.save() };
    const result = await restoreEditableSource(source);
    expect(result.source).toBe(source);
    expect(result.invalidPages).toBe(1);
    expect(
      (await listNativeRuns(result.source.bytes, 0)).some((r) => r.text === 'Autre editeur'),
    ).toBe(true);
  });
});
