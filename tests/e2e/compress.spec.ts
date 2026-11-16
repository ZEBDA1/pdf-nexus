import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
});

async function pdf(pages: number, label: string) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([300, 300]).drawText(`${label} ${i + 1}`);
  return Buffer.from(await doc.save());
}

test('compression : aperçu avant/après sans perte de pages', async ({ page }) => {
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'a.pdf', mimeType: 'application/pdf', buffer: await pdf(2, 'A') });
  await expect(page.locator('.page-scroller .pdf-page').first()).toBeVisible();
  await page.getByRole('button', { name: 'Outils du document' }).first().click();
  await page.getByRole('button', { name: 'Calculer la compression', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Avant :' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger', exact: true }).click();
  expect((await download).suggestedFilename()).toContain('compresse');
});

test('compression par lot : un ZIP est produit', async ({ page }) => {
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'a.pdf', mimeType: 'application/pdf', buffer: await pdf(1, 'A') });
  await expect(page.locator('.page-scroller .pdf-page').first()).toBeVisible();
  await page.getByRole('button', { name: 'Outils du document' }).first().click();
  const download = page.waitForEvent('download');
  await page.locator('input[type=file][multiple][accept="application/pdf,.pdf"]').setInputFiles([
    { name: 'b.pdf', mimeType: 'application/pdf', buffer: await pdf(1, 'B') },
    { name: 'c.pdf', mimeType: 'application/pdf', buffer: await pdf(1, 'C') },
  ]);
  expect((await download).suggestedFilename()).toBe('nexus-compresses.zip');
});
