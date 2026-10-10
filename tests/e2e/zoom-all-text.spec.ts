import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
test('Zoom du PDF seul et modification de tous les textes sur plusieurs pages', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([595, 842]).drawText('Premiere page', { x: 40, y: 730, size: 24, font });
  const second = doc.addPage([595, 842]),
    resource = second.node.newFontDictionary(font.name, font.ref);
  second.node.addContentStream(
    doc.context.register(
      doc.context.flateStream(`BT ${resource} 20 Tf 1 0 0 1 40 730 Tm (Bloc) Tj ( complexe) Tj ET`),
    ),
  );
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'tout.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await doc.save()),
    });
  const pdf = page.locator('.page-scroller .pdf-page').first(),
    sidebar = page.locator('.app-sidebar');
  await expect(page.locator('.page-scroller .textLayer').first()).toContainText('Premiere page');
  const initial = (await pdf.boundingBox())!.width,
    sideWidth = (await sidebar.boundingBox())!.width;
  await page.keyboard.press('Control+=');
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('115');
  await expect.poll(async () => (await pdf.boundingBox())!.width).toBeGreaterThan(initial * 1.1);
  expect((await sidebar.boundingBox())!.width).toBe(sideWidth);
  await pdf.dispatchEvent('wheel', {
    ctrlKey: true,
    deltaY: -100,
    clientX: 600,
    clientY: 400,
    bubbles: true,
    cancelable: true,
  });
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('155');
  expect((await sidebar.boundingBox())!.width).toBe(sideWidth);
  await page.keyboard.press('Control+0');
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('100');
  await page.getByRole('button', { name: 'Modifier tout le texte', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Modifier tout le texte' });
  const input = panel.getByLabel('Modifier ce texte sur la page');
  await expect(input).toHaveValue('Premiere page');
  await input.fill('Une phrase très longue qui nécessite une adaptation de la taille');
  await expect(panel.getByLabel('Taille du texte')).toHaveValue('24');
  await input.fill('Court');
  await expect(page.locator('.page-scroller .textLayer').first()).toContainText('Court');
  await expect(panel.getByLabel('Taille du texte')).toHaveValue('24');
  await input.fill('Premier texte modifié');
  await expect(page.locator('.page-scroller .textLayer').first()).toContainText(
    'Premier texte modifié',
  );
  await page.getByRole('button', { name: 'Annuler (Ctrl+Z)', exact: true }).click();
  await expect(input).toHaveValue('Premiere page');
  await input.fill('Premier texte final');
  await panel.getByLabel('Page du texte à modifier').selectOption({ label: '2 / 2' });
  await expect(input).toHaveValue('Bloc complexe');
  await expect(panel.locator('.text-list-item')).toContainText('Correction visuelle');
  await input.fill('Deuxième texte final');
  await expect(page.locator('.reader-status')).toContainText('1 correction(s) visuelle(s)');
  await page.screenshot({ path: 'test-results/all-text.png' });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter le PDF', exact: true }).click();
  const bytes = await readFile((await (await pending).path())!);
  const text = await page.evaluate(async (bytes) => {
    const { loadPdf, extractAll } = await import('/' + 'src/pdf/reader.ts');
    const pdf = await loadPdf(new Uint8Array(bytes));
    try {
      return (await extractAll(pdf)).map((p: { text: string }) => p.text);
    } finally {
      await pdf.loadingTask.destroy();
    }
  }, Array.from(bytes));
  expect(text[0]).toContain('Premier texte final');
  expect(text[0]).not.toContain('Premiere page');
  expect(text[1]).toContain('Deuxième texte final');
  expect(text[1]).toContain('Bloc complexe');
});
