import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

test('Champs natifs : saisie, Tab, boutons radio, listes, récupération et export dans un autre lecteur', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
  const pdf = await PDFDocument.create(),
    p = pdf.addPage([595, 842]),
    p2 = pdf.addPage([595, 842]),
    form = pdf.getForm();
  const name = form.createTextField('Nom complet');
  name.addToPage(p, { x: 60, y: 700, width: 240, height: 24 });
  const date = form.createTextField('Date de naissance');
  date.addToPage(p, { x: 60, y: 650, width: 240, height: 24 });
  const note = form.createTextField('Remarques');
  note.enableMultiline();
  note.addToPage(p, { x: 60, y: 540, width: 240, height: 80 });
  form.createCheckBox('Consentement').addToPage(p, { x: 60, y: 480, width: 18, height: 18 });
  const radio = form.createRadioGroup('Réponse');
  radio.addOptionToPage('Oui', p, { x: 60, y: 420, width: 16, height: 16 });
  radio.addOptionToPage('Non', p, { x: 120, y: 420, width: 16, height: 16 });
  const list = form.createDropdown('Pays');
  list.setOptions(['France', 'Belgique']);
  list.addToPage(p2, { x: 60, y: 700, width: 240, height: 24 });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'champs.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await pdf.save()),
    });
  await page.getByRole('textbox', { name: 'Nom complet', exact: true }).fill('Élodie Martin');
  await page.getByRole('textbox', { name: 'Nom complet', exact: true }).press('Tab');
  await expect(page.getByRole('textbox', { name: 'Date de naissance', exact: true })).toBeFocused();
  await page.getByRole('textbox', { name: 'Date de naissance', exact: true }).fill('20/10/2000');
  await page
    .getByRole('textbox', { name: 'Remarques', exact: true })
    .fill('Première ligne\nDeuxième ligne');
  await page.getByRole('checkbox', { name: 'Case à cocher : Consentement', exact: true }).check();
  await page.getByRole('radio', { name: 'Réponse : Oui', exact: true }).check();
  await page.getByRole('radio', { name: 'Réponse : Non', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'Réponse : Oui', exact: true })).not.toBeChecked();
  await page.getByRole('radio', { name: 'Réponse : Non', exact: true }).press('Tab');
  await expect(page.getByRole('combobox', { name: 'Pays', exact: true })).toBeFocused();
  await page.getByRole('combobox', { name: 'Pays', exact: true }).selectOption('Belgique');
  await expect(page.locator('.autosave-status.saved')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Reprendre champs.pdf', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Nom complet', exact: true })).toHaveValue(
    'Élodie Martin',
  );
  await expect(page.getByRole('combobox', { name: 'Pays', exact: true })).toHaveValue('Belgique');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter le PDF', exact: true }).click();
  await page.getByRole('button', { name: 'Télécharger le PDF', exact: true }).click();
  const output = await PDFDocument.load(await readFile((await (await pending).path())!));
  expect(output.getForm().getTextField('Nom complet').getText()).toBe('Élodie Martin');
  expect(output.getForm().getTextField('Date de naissance').getText()).toBe('20/10/2000');
  expect(output.getForm().getTextField('Remarques').getText()).toContain('\nDeuxième ligne');
  expect(output.getForm().getCheckBox('Consentement').isChecked()).toBe(true);
  expect(output.getForm().getRadioGroup('Réponse').getSelected()).toBe('Non');
  expect(output.getForm().getDropdown('Pays').getSelected()).toEqual(['Belgique']);
  await page.screenshot({ path: 'test-results/formulaires-natifs.png' });
});
