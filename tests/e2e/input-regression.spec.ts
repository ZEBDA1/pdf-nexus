import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

test('Saisie de taille naturelle, barre contextuelle et ajout exporté sans validation', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([595, 842]).drawText('Texte du document', { x: 50, y: 710, size: 18, font });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'saisie.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await pdf.save()),
    });
  await expect(page.locator('.annotation-toolbar')).toBeVisible();
  await expect(page.getByLabel('Couleur de l’annotation')).toHaveCount(0);
  await page
    .locator('.page-scroller .textLayer span')
    .filter({ hasText: 'Texte du document' })
    .click();
  await page.getByLabel('Adapter à la largeur').uncheck();
  const size = page.getByLabel('Taille du texte', { exact: true });
  await size.fill('');
  await size.pressSequentially('24', { delay: 80 });
  await expect(size).toHaveValue('24');
  await size.press('Enter');
  const text = page.getByLabel('Modifier ce texte sur la page');
  await expect(text).toBeFocused();
  await text.fill('Texte corrigé');
  await expect(page.locator('.page-scroller .textLayer')).toContainText('Texte corrigé');
  await expect(size).toHaveValue('24');
  await page.screenshot({ path: 'test-results/saisie-simplifiee.png' });
  await page.getByRole('button', { name: 'Ajouter du texte', exact: true }).click();
  await expect(page.getByLabel('Texte de l’annotation')).toHaveCount(0);
  await page.locator('.page-scroller .annotation-layer').click({ position: { x: 70, y: 260 } });
  await page.getByLabel('Écrire directement sur le PDF').fill('Ajout conservé immédiatement');
  await expect(page.locator('.reader-status')).toContainText('1 annotation');
  const pending = page.waitForEvent('download');
  // Export directly from the focused field: no validation or blur is required.
  await page.getByLabel('Écrire directement sur le PDF').press('Control+s');
  const bytes = await readFile((await (await pending).path())!);
  const result = await page.evaluate(async (data) => {
    const { loadPdf, extractAll } = await import('/' + 'src/pdf/reader.ts');
    const { listNativeRuns } = await import('/' + 'src/pdf/native-text.ts');
    const bytes = new Uint8Array(data),
      doc = await loadPdf(bytes);
    try {
      return { text: (await extractAll(doc))[0].text, runs: await listNativeRuns(bytes, 0) };
    } finally {
      await doc.loadingTask.destroy();
    }
  }, Array.from(bytes));
  expect(result.text).toContain('Ajout conservé immédiatement');
  expect(
    result.runs.some(
      (r: { text: string; size: number }) => r.text === 'Texte corrigé' && r.size === 24,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Lire et sélectionner le texte' }).click();
  const annotations = page
    .locator('.annotation-menu')
    .filter({ has: page.locator('summary').filter({ hasText: 'Annoter' }) });
  await annotations.locator('summary').click();
  await page.getByRole('button', { name: 'Surligner une zone', exact: true }).click();
  await expect(annotations).not.toHaveAttribute('open');
  await expect(page.getByLabel('Couleur de l’annotation')).toBeVisible();
});
