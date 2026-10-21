import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFHexString, StandardFonts, PDFArray } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { exportWorkspace } from '../src/pdf/operations';
import { restoreEditableSource } from '../src/pdf/editable';
import type { Workspace } from '../src/types';

const font = new Uint8Array(await readFile('public/fonts/NotoSans-Regular.ttf'));
async function fixture(): Promise<Workspace> {
  const pdf = await PDFDocument.create(),
    f = await pdf.embedFont(StandardFonts.Helvetica),
    form = pdf.getForm();
  const p = pdf.addPage([595, 842]),
    p2 = pdf.addPage([595, 842]);
  p.drawText('Document original', { x: 40, y: 780, size: 20, font: f });
  const name = form.createTextField('Nom');
  name.addToPage(p, { x: 60, y: 700, width: 200, height: 24, font: f });
  name.setText('Avant');
  const date = form.createTextField('Date');
  date.addToPage(p, { x: 60, y: 650, width: 200, height: 24, font: f });
  date.setMaxLength(10);
  const comment = form.createTextField('Commentaire');
  comment.enableMultiline();
  comment.addToPage(p, { x: 60, y: 550, width: 200, height: 70, font: f });
  const checkbox = form.createCheckBox('Accord');
  checkbox.addToPage(p, { x: 60, y: 500, width: 18, height: 18 });
  checkbox.check();
  const radio = form.createRadioGroup('Choix');
  radio.addOptionToPage('Oui', p, { x: 60, y: 450, width: 16, height: 16 });
  radio.addOptionToPage('Non', p2, { x: 60, y: 700, width: 16, height: 16 });
  const countries = form.createDropdown('Pays');
  countries.setOptions(['France', 'Belgique']);
  countries.addToPage(p, { x: 60, y: 400, width: 200, height: 25, font: f });
  countries.acroField.setOptions([
    { value: PDFHexString.fromText('FR'), display: PDFHexString.fromText('France') },
    { value: PDFHexString.fromText('BE'), display: PDFHexString.fromText('Belgique') },
  ]);
  const list = form.createOptionList('Annexes');
  list.setOptions(['A', 'B', 'C']);
  list.enableMultiselect();
  list.addToPage(p, { x: 60, y: 250, width: 200, height: 80, font: f });
  const ref = form.createTextField('Reference');
  ref.addToPage(p, { x: 60, y: 200, width: 200, height: 24, font: f });
  ref.setText('NE PAS MODIFIER');
  ref.enableReadOnly();
  return {
    name: 'formulaire.pdf',
    sources: [{ name: 'formulaire.pdf', bytes: await pdf.save() }],
    pages: [0, 1].map((index) => ({
      id: 'p' + index,
      source: 0,
      index,
      rotation: 0,
      formGroup: 'form',
      annotations: [],
      formValues: {
        Nom: 'Élodie',
        Date: '20/10/2026',
        Commentaire: 'Première ligne\nDeuxième ligne',
        Accord: false,
        Choix: 'Non',
        Pays: 'BE',
        Annexes: ['B', 'C'],
        Reference: 'INTERDIT',
      },
    })),
    watermark: '',
    numbering: false,
    cleanMetadata: false,
    encrypted: false,
  };
}

describe('Formulaires natifs et export', () => {
  it('conserve les valeurs Unicode, dates, choix, radios sur plusieurs pages et champs en lecture seule', async () => {
    const w = await fixture();
    const pdf = await PDFDocument.load(
      await exportWorkspace(w, font, undefined, { mode: 'editable', preserveForms: true }),
    );
    const form = pdf.getForm();
    expect(form.getTextField('Nom').getText()).toBe('Élodie');
    expect(form.getTextField('Date').getText()).toBe('20/10/2026');
    expect(form.getTextField('Commentaire').getText()).toContain('\nDeuxième ligne');
    expect(form.getTextField('Commentaire').isMultiline()).toBe(true);
    expect(form.getCheckBox('Accord').isChecked()).toBe(false);
    expect(form.getRadioGroup('Choix').getSelected()).toBe('Non');
    expect(form.getRadioGroup('Choix').acroField.getWidgets()).toHaveLength(2);
    expect(form.getDropdown('Pays').getSelected()).toEqual(['BE']);
    expect(form.getDropdown('Pays').getOptions()).toEqual(['France', 'Belgique']);
    expect(form.getOptionList('Annexes').getSelected()).toEqual(['B', 'C']);
    expect(form.getTextField('Reference').getText()).toBe('NE PAS MODIFIER');
    expect(form.getTextField('Reference').isReadOnly()).toBe(true);
  });
  it('la copie aplatie retire les champs et les données privées de réédition', async () => {
    const w = await fixture();
    w.pages[0].annotations.push({
      id: 'annotation',
      type: 'text',
      x: 300,
      y: 650,
      width: 150,
      height: 30,
      color: '#000000',
      size: 12,
      text: 'Ajout à partager',
    });
    const pdf = await PDFDocument.load(
      await exportWorkspace(w, font, undefined, { mode: 'flattened', preserveForms: true }),
    );
    expect(pdf.getForm().getFields()).toHaveLength(0);
    expect(pdf.getPage(0).node.has(PDFName.of('NexusEdits'))).toBe(false);
    expect(pdf.getPageCount()).toBe(2);
  });
  it('réouvrir un ajout éditable conserve les widgets natifs sans liens actifs importés', async () => {
    const w = await fixture();
    w.pages[0].annotations.push({
      id: 'case',
      type: 'checkbox',
      x: 300,
      y: 700,
      width: 16,
      height: 16,
      color: '#000000',
      size: 12,
      checked: true,
    });
    const bytes = await exportWorkspace(w, font, undefined, {
      mode: 'editable',
      preserveForms: true,
    });
    const restored = await restoreEditableSource({ name: 'modifie.pdf', bytes });
    expect(restored.invalidPages).toBe(0);
    expect(restored.annotations[0]).toHaveLength(1);
    const pdf = await PDFDocument.load(restored.source.bytes);
    expect(pdf.getForm().getTextField('Nom').getText()).toBe('Élodie');
    expect(pdf.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).size()).toBeGreaterThan(4);
  });
  it('les copies de pages ont des noms distincts et ne recopient pas les pages omises', async () => {
    const w = await fixture();
    w.pages = [
      { ...w.pages[0], formGroup: 'a', formValues: { Nom: 'Alpha' } },
      { ...w.pages[0], id: 'copy', formGroup: 'b', formValues: { Nom: 'Beta' } },
    ];
    const pdf = await PDFDocument.load(
      await exportWorkspace(w, font, undefined, { mode: 'editable', preserveForms: true }),
    );
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getForm().getTextField('Nom').getText()).toBe('Alpha');
    expect(pdf.getForm().getTextField('Nom (2)').getText()).toBe('Beta');
  });
});
