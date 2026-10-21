import { test, expect, type Page } from '@playwright/test';
import {
  PDFDocument,
  PDFName,
  StandardFonts,
  setTextRenderingMode,
  TextRenderingMode,
} from 'pdf-lib';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
});
async function open(page: Page, form = false) {
  const pdf = await PDFDocument.create(),
    p = pdf.addPage([595, 842]);
  pdf.addPage([595, 842]);
  p.drawText('Document original', { x: 60, y: 760, size: 20 });
  if (form)
    pdf
      .getForm()
      .createTextField('Identité')
      .addToPage(p, { x: 60, y: 680, width: 200, height: 24 });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'outils.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await pdf.save()),
    });
  await expect(page.locator('.page-scroller .pdf-page').first()).toBeVisible();
}
async function addText(page: Page, text: string, x = 80, y = 210) {
  await page.getByRole('button', { name: 'Ajouter du texte', exact: true }).click();
  await page.locator('.page-scroller .annotation-layer').first().click({ position: { x, y } });
  await page.getByLabel('Écrire directement sur le PDF', { exact: true }).fill(text);
  await page.getByLabel('Écrire directement sur le PDF', { exact: true }).press('Control+Enter');
}
test('Objets : renommage, visibilité, verrouillage, sélection multiple et copie entre pages', async ({
  page,
}) => {
  await open(page);
  await addText(page, 'Sous le second texte');
  await addText(page, 'Au premier plan', 85, 215);
  await page.getByRole('button', { name: 'Objets ajoutés', exact: true }).click();
  const rows = page.locator('.object-row');
  await expect(rows).toHaveCount(2);
  await rows
    .last()
    .getByRole('button', { name: /^Texte/ })
    .click();
  await page.getByLabel('Nom de l’objet').fill('Note client');
  await page.getByRole('button', { name: 'Masquer l’objet', exact: true }).click();
  await expect(page.locator('.page-scroller [data-annotation-id]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Afficher l’objet', exact: true }).click();
  await page.getByRole('button', { name: 'Verrouiller l’objet', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Masquer l’objet', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Supprimer les objets sélectionnés', exact: true }),
  ).toBeDisabled();
  await expect(rows).toHaveCount(2);
  await page.getByRole('button', { name: 'Déverrouiller l’objet', exact: true }).click();
  await page.getByRole('button', { name: 'Avancer l’objet', exact: true }).click();
  await expect(rows.first()).toContainText('Note client');
  await rows
    .last()
    .getByRole('button', { name: /^Texte/ })
    .click({ modifiers: ['Shift'] });
  await expect(page.locator('.objects-actions')).toContainText('2 sélectionné');
  await page.getByRole('button', { name: 'Copier les objets', exact: true }).click();
  await page.getByLabel('Numéro de page', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Coller les objets', exact: true }).click();
  await expect(rows).toHaveCount(4);
  await expect(
    page.locator('.page-scroller .pdf-page').nth(1).locator('[data-annotation-id]'),
  ).toHaveCount(2);
  await page
    .getByRole('button', { name: 'Supprimer les objets sélectionnés', exact: true })
    .click();
  await expect(rows).toHaveCount(2);
  await page.getByRole('button', { name: 'Annuler (Ctrl+Z)', exact: true }).click();
  await expect(rows).toHaveCount(4);
  await page.screenshot({ path: 'test-results/panneau-objets.png' });
});
test('Redimensionnement après rotation et zoom, police et texte sur plusieurs lignes', async ({
  page,
}) => {
  await open(page);
  await addText(page, 'Première ligne\nDeuxième ligne');
  await page.getByRole('button', { name: 'Lire et sélectionner le texte', exact: true }).click();
  await page.locator('.page-scroller [data-annotation-id]').click();
  await page.getByLabel('Police de l’objet', { exact: true }).selectOption('Times-Bold');
  await page.getByRole('button', { name: 'Faire pivoter la page courante', exact: true }).click();
  await page.getByLabel('Zoom', { exact: true }).selectOption('125');
  const before = Number(await page.getByLabel('Largeur de l’annotation').inputValue());
  const handle = page.locator('.page-scroller [data-resize-corner="11"]');
  const r = (await handle.boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + 35, r.y + r.height / 2 + 70, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => Number(await page.getByLabel('Largeur de l’annotation').inputValue()))
    .toBeGreaterThan(before + 30);
  await expect(page.getByLabel('Police de l’objet')).toHaveValue('Times-Bold');
  await page
    .getByLabel('Modifier le texte sélectionné')
    .fill('Une ligne\nDeux lignes\nTrois lignes');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter le PDF', exact: true }).click();
  await page.getByRole('button', { name: 'Télécharger le PDF', exact: true }).click();
  const pdf = await PDFDocument.load(await readFile((await (await pending).path())!));
  expect(pdf.getPage(0).getRotation().angle).toBe(90);
});
test('Aperçu puis export aplati : aucun objet masqué ni donnée de réédition, champs figés', async ({
  page,
}) => {
  await open(page, true);
  await page.getByLabel('Identité', { exact: true }).fill('Élodie');
  await addText(page, 'Contenu à masquer');
  await page.getByRole('button', { name: 'Objets ajoutés', exact: true }).click();
  await page
    .locator('.object-row')
    .first()
    .getByRole('button', { name: /^Texte/ })
    .click();
  await page.getByRole('button', { name: 'Masquer l’objet', exact: true }).click();
  await page.getByRole('button', { name: 'Exporter le PDF', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Exporter votre document', exact: true });
  await dialog.getByRole('radio', { name: /Partager une copie aplatie/ }).check();
  await expect(dialog.getByLabel('Aperçu du PDF exporté')).toHaveAttribute('aria-busy', 'false');
  await dialog.getByRole('button', { name: 'Page suivante de l’aperçu', exact: true }).click();
  await expect(dialog.getByLabel('Aperçu du PDF exporté')).toContainText('2 / 2');
  await page.screenshot({ path: 'test-results/choix-export.png' });
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Télécharger le PDF', exact: true }).click();
  const bytes = await readFile((await (await pending).path())!),
    pdf = await PDFDocument.load(bytes);
  expect(pdf.getForm().getFields()).toHaveLength(0);
  expect(pdf.getPages().every((p) => !p.node.has(PDFName.of('NexusEdits')))).toBe(true);
  const content = await page.evaluate(async (data) => {
    const { loadPdf, extractPage } = await import('/' + 'src/pdf/reader.ts');
    const doc = await loadPdf(new Uint8Array(data));
    try {
      return (await extractPage(doc, 0)).text;
    } finally {
      await doc.loadingTask.destroy();
    }
  }, Array.from(bytes));
  expect(content).toContain('Élodie');
  expect(content).not.toContain('Contenu à masquer');
});
test('Recherche : surlignage, occurrence suivante, remplacement avec aperçu et exclusion du texte non compatible', async ({
  page,
}) => {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    p = pdf.addPage([595, 842]);
  p.drawText('Bonjour Nexus et Nexus', { x: 60, y: 700, size: 18, font });
  const p2 = pdf.addPage([595, 842]);
  p2.drawText('Nexus suivant', { x: 60, y: 700, size: 18, font });
  p2.pushOperators(setTextRenderingMode(TextRenderingMode.Outline));
  p2.drawText('Nexus contour', { x: 60, y: 640, size: 18, font });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'recherche.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await pdf.save()),
    });
  await page.getByLabel('Rechercher dans le PDF', { exact: true }).fill('Nexus');
  await page.getByLabel('Rechercher dans le PDF', { exact: true }).press('Enter');
  await expect(page.locator('.search-results')).toContainText('Occurrence 1 sur 4');
  await expect(
    page.locator('.page-scroller .pdf-page').first().locator('.search-occurrence'),
  ).toHaveCount(2);
  await page.getByRole('button', { name: 'Occurrence suivante', exact: true }).click();
  await expect(page.locator('.search-results')).toContainText('Occurrence 2 sur 4');
  await page.getByRole('button', { name: 'Occurrence suivante', exact: true }).click();
  await expect(page.getByLabel('Numéro de page')).toHaveValue('2');
  await expect(
    page.locator('.page-scroller .pdf-page').nth(1).locator('.search-occurrence.active'),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Rechercher et remplacer', exact: true }).click();
  await page.getByLabel('Texte à rechercher', { exact: true }).fill('Nexus');
  await page.getByLabel('Remplacer par', { exact: true }).fill('Paris');
  await page.getByRole('button', { name: 'Prévisualiser les remplacements', exact: true }).click();
  await expect(page.locator('.replace-list .replace-row')).toHaveCount(2);
  await expect(page.getByRole('dialog')).toContainText('1 occurrence(s) exclue');
  await page
    .getByRole('button', { name: 'Appliquer les remplacements sélectionnés', exact: true })
    .click();
  await expect(page.locator('.page-scroller .textLayer').nth(1)).toContainText(
    'Paris suivantNexus contour',
  );
  await page.getByLabel('Numéro de page', { exact: true }).fill('1');
  await expect(page.locator('.page-scroller .textLayer').first()).toContainText(
    'Bonjour Paris et Paris',
  );
  await page.getByRole('button', { name: 'Annuler (Ctrl+Z)', exact: true }).click();
  await expect(page.locator('.page-scroller .textLayer').first()).toContainText(
    'Bonjour Nexus et Nexus',
  );
  await page.screenshot({ path: 'test-results/recherche-occurrences.png' });
});
