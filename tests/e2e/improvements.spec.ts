import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

test('Configuration initiale : langue, thème et persistance', async ({ page }) => {
  await page.goto('/editor.html#setup');
  await expect(page.getByRole('heading', { name: 'Commençons par votre langue.' })).toBeVisible();
  await page.locator('.setup-card select').selectOption('en');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Get started', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'PDFs, made simple.' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.setup-card')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'PDFs, made simple.' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: 'test-results/setup-english-dark.png', fullPage: true });
});

test('Saisie sur page, remplacement natif, annulation et filigrane réellement exportés', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < 2; i++) {
    const p = doc.addPage([595, 842]);
    p.drawRectangle({ x: 30, y: 700, width: 500, height: 70, color: rgb(0.9, 0.93, 1) });
    p.drawText('Bonjour Nexus', { x: 48, y: 730, size: 24, font, color: rgb(0.2, 0.1, 0.5) });
  }
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'edition.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await doc.save()),
    });
  await expect(page.locator('.page-scroller .textLayer').first()).toContainText('Bonjour Nexus');
  await page.getByRole('button', { name: 'Ajouter du texte', exact: true }).click();
  await page
    .locator('.page-scroller .annotation-layer')
    .first()
    .click({ position: { x: 80, y: 220 } });
  const input = page.getByRole('textbox', { name: 'Écrire directement sur le PDF' });
  await expect(input).toBeFocused();
  await input.fill('Écrit directement sur la page');
  await input.press('Control+Enter');
  await expect(page.locator('.reader-status')).toContainText('1 annotation');
  await page.getByRole('button', { name: 'Modifier le texte existant', exact: true }).click();
  await page
    .locator('.page-scroller .textLayer span')
    .filter({ hasText: 'Bonjour Nexus' })
    .first()
    .click();
  await expect(page.getByLabel('Modifier ce texte sur la page', { exact: true })).toHaveValue(
    'Bonjour Nexus',
  );
  await page.getByLabel('Modifier ce texte sur la page', { exact: true }).fill('Bonsoir Paris');
  await page.getByLabel('Adapter à la largeur').uncheck();
  await page.getByLabel('Taille du texte', { exact: true }).fill('22');
  await page.getByLabel('Modifier ce texte sur la page', { exact: true }).press('Enter');
  await expect(page.locator('.page-scroller .textLayer').first()).toContainText('Bonsoir Paris');
  await expect(page.locator('.page-scroller .textLayer').first()).not.toContainText(
    'Bonjour Nexus',
  );
  await page.getByRole('button', { name: 'Annuler (Ctrl+Z)', exact: true }).click();
  await expect(page.locator('.page-scroller .textLayer').first()).toContainText('Bonjour Nexus');
  await page.getByRole('button', { name: 'Rétablir (Ctrl+Maj+Z)', exact: true }).click();
  await expect(page.locator('.page-scroller .textLayer').first()).toContainText('Bonsoir Paris');
  await page.screenshot({ path: 'test-results/native-editor.png' });

  await page.getByRole('button', { name: 'Outils du document' }).click();
  await page.locator('.watermark-controls input[maxlength]').fill('CONFIDENTIEL');
  await page.getByLabel('Pages du filigrane').selectOption('odd');
  await page.getByRole('button', { name: 'Appliquer le filigrane', exact: true }).click();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter le PDF', exact: true }).click();
  const bytes = await readFile((await (await pending).path())!);
  const result = await page.evaluate(async (data) => {
    const { loadPdf, extractAll } = await import('/' + 'src/pdf/reader.ts');
    const { listNativeRuns } = await import('/' + 'src/pdf/native-text.ts');
    const bytes = new Uint8Array(data),
      doc = await loadPdf(bytes);
    try {
      return { pages: await extractAll(doc), runs: await listNativeRuns(bytes, 0) };
    } finally {
      await doc.loadingTask.destroy();
    }
  }, Array.from(bytes));
  expect(result.pages[0].text).toContain('Bonsoir Paris');
  expect(result.pages[0].text).not.toContain('Bonjour Nexus');
  expect(result.pages[0].text).toContain('Écrit directement');
  expect(result.pages[0].text).toContain('CONFIDENTIEL');
  expect(result.pages[1].text).not.toContain('CONFIDENTIEL');
  expect(result.pages[1].text).toContain('Bonjour Nexus');
  expect(result.runs[0]).toMatchObject({ text: 'Bonsoir Paris', font: 'Helvetica-Bold', size: 22 });
  expect(errors).toEqual([]);
});

test('Deux textes identiques : modifier uniquement le bloc cliqué', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica);
  const p = doc.addPage([595, 842]);
  p.drawText('Texte identique', { x: 40, y: 740, font, size: 18 });
  p.drawText('Texte identique', { x: 40, y: 640, font, size: 18 });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'doublons.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await doc.save()),
    });
  const texts = page
    .locator('.page-scroller .textLayer span')
    .filter({ hasText: 'Texte identique' });
  await expect(texts).toHaveCount(2);
  await page.getByRole('button', { name: 'Modifier le texte existant', exact: true }).click();
  await texts.nth(1).click();
  await page
    .getByLabel('Modifier ce texte sur la page', { exact: true })
    .fill('Deuxieme bloc modifie');
  await page.getByLabel('Modifier ce texte sur la page', { exact: true }).press('Enter');
  await expect(
    page.locator('.page-scroller .textLayer span').filter({ hasText: 'Deuxieme bloc modifie' }),
  ).toBeVisible();
  await expect(texts).toHaveCount(1);
  const remaining = await texts.boundingBox();
  const changed = await page
    .locator('.page-scroller .textLayer span')
    .filter({ hasText: 'Deuxieme bloc modifie' })
    .boundingBox();
  expect(changed!.y).toBeGreaterThan(remaining!.y);
});
