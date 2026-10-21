import { it, expect } from 'vitest';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { moveObject, resizeObject, snapObject, correctionBox } from '../src/pdf/objects';
import { exportWorkspace } from '../src/pdf/operations';
import { restoreEditableSource } from '../src/pdf/editable';
import { previewReplacement } from '../src/pdf/replace';
import { occurrences } from '../src/pdf/search';
import type { Annotation, Workspace } from '../src/types';

const drawing: Annotation = {
  id: 'drawing',
  type: 'pen',
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  size: 12,
  color: '#000000',
  points: [
    { x: 10, y: 20 },
    { x: 60, y: 70 },
    { x: 110, y: 20 },
  ],
};
it('étend une correction multiligne vers le bas sans déplacer sa première ligne, même après réédition', () => {
  for (const angle of [0, 90]) {
    const anchor = { x: 50, y: 700, height: 24.4, size: 20, angle };
    const box = correctionBox(anchor, undefined, 'Première\nSeconde', 20, { x: 0, y: 0 });
    expect(box.height).toBeCloseTo(50.4);
    const rad = (angle * Math.PI) / 180;
    expect(box.x - Math.sin(rad) * box.baseline).toBeCloseTo(anchor.x);
    expect(box.y + Math.cos(rad) * box.baseline).toBeCloseTo(anchor.y);
    const previous = {
      ...drawing,
      ...box,
      type: 'text' as const,
      size: 20,
      text: 'Première\nSeconde',
      replacement: {
        font: 'Helvetica',
        background: '#ffffff',
        original: 'Source',
        angle,
        baseline: box.baseline,
      },
    };
    const again = correctionBox(
      { ...anchor, height: box.height },
      previous,
      'Une seule ligne',
      20,
      { x: 0, y: 0 },
    );
    expect(again.baseline).toBeCloseTo(4.4);
    expect(again.height).toBeCloseTo(24.4);
  }
});
it('déplace et redimensionne les points du dessin avec ses limites, sans muter l’original', () => {
  const moved = moveObject(drawing, 30, -10);
  const resized = resizeObject(moved, { x: 40, y: 10, width: 200, height: 100 });
  expect(resized.points).toEqual([
    { x: 40, y: 10 },
    { x: 140, y: 110 },
    { x: 240, y: 10 },
  ]);
  expect(drawing.points![0]).toEqual({ x: 10, y: 20 });
  const corrected = moveObject(
    {
      ...drawing,
      replacement: {
        font: 'Helvetica',
        background: '#ffffff',
        original: 'secret',
        angle: 0,
        baseline: 3,
        mask: { x: 5, y: 15, width: 90, height: 40 },
      },
    },
    20,
    30,
  );
  expect(corrected.replacement?.mask).toMatchObject({ x: 25, y: 45 });
});
it('aligne les objets sur les bords et centres, ignore les objets masqués et respecte la tolérance', () => {
  expect(snapObject({ ...drawing, x: 248 }, [], [0, 0, 600, 800], 5)).toMatchObject({
    annotation: { x: 250 },
    guides: { x: 300 },
  });
  expect(snapObject({ ...drawing, x: 247 }, [], [0, 0, 600, 800], 2).guides.x).toBeUndefined();
  expect(
    snapObject(drawing, [{ ...drawing, id: 'hidden', x: 12, hidden: true }], [0, 0, 600, 800], 5)
      .guides.x,
  ).toBeUndefined();
});
it('conserve les propriétés des objets dans Nexus et les exclut entièrement de la copie aplatie', async () => {
  const font = new Uint8Array(await readFile('public/fonts/NotoSans-Regular.ttf'));
  const source = await PDFDocument.create();
  source.addPage();
  const workspace: Workspace = {
    name: 'objects.pdf',
    sources: [{ name: 'base.pdf', bytes: await source.save() }],
    encrypted: false,
    watermark: '',
    numbering: false,
    cleanMetadata: true,
    pages: [
      {
        id: 'p',
        source: 0,
        index: 0,
        rotation: 0,
        annotations: [
          { ...drawing, hidden: true, name: 'Dessin masqué', locked: true },
          {
            ...drawing,
            id: 'texte',
            type: 'text',
            text: 'Plusieurs\nlignes',
            width: 250,
            height: 80,
            font: 'Times-Bold',
          },
        ],
      },
    ],
  };
  const bytes = await exportWorkspace(workspace, font, undefined, {
    mode: 'editable',
    preserveForms: true,
  });
  const restored = await restoreEditableSource({ name: 'objects.pdf', bytes });
  expect(restored.annotations[0][0]).toMatchObject({
    hidden: true,
    locked: true,
    name: 'Dessin masqué',
  });
  expect(restored.annotations[0][1]).toMatchObject({
    font: 'Times-Bold',
    text: 'Plusieurs\nlignes',
  });
  const flat = await PDFDocument.load(
    await exportWorkspace(workspace, font, undefined, { mode: 'flattened', preserveForms: true }),
  );
  expect(flat.getPage(0).node.has(PDFName.of('NexusEdits'))).toBe(false);
  expect(new TextDecoder().decode(await flat.save({ useObjectStreams: false }))).not.toContain(
    'Dessin masqu',
  );
});
it('prévisualise les remplacements exacts, valide les caractères et exclut les blocs incompatibles', async () => {
  const fontBytes = new Uint8Array(await readFile('public/fonts/NotoSans-Regular.ttf'));
  const d = await PDFDocument.create(),
    font = await d.embedFont(StandardFonts.Helvetica);
  d.addPage().drawText('Nexus et Nexus', { x: 40, y: 700, size: 14, font });
  const source = await d.save();
  const proposed = await previewReplacement(source, 0, [], 'Nexus', 'Paris', fontBytes);
  expect(proposed.candidates[0]).toMatchObject({
    before: 'Nexus et Nexus',
    after: 'Paris et Paris',
    count: 2,
  });
  const unsupported = await previewReplacement(source, 0, [], 'Nexus', '😀', fontBytes);
  expect(unsupported.candidates).toHaveLength(0);
  expect(unsupported.excluded).toBe(2);
  expect(occurrences('École, école et ÉCOLE', 'école')).toHaveLength(3);
  expect(occurrences('aaa', '')).toHaveLength(0);
});
