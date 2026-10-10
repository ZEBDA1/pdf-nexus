import { test, expect } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';

test('Cases imprimées : détection, bascule après zoom et annulation', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
  const pdf = await PDFDocument.create();
  const p = pdf.addPage([595, 842]);
  p.drawText('Choisir une option', { x: 80, y: 715, size: 18 });
  p.drawRectangle({
    x: 60,
    y: 710,
    width: 12,
    height: 12,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'cases.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await pdf.save()),
    });
  await page.locator('summary').filter({ hasText: 'Remplir et signer' }).click();
  await page.getByRole('button', { name: 'Repérer les cases', exact: true }).click();
  const box = page.getByRole('checkbox', { name: 'Cocher la case imprimée 1', exact: true });
  await expect(box).toBeVisible();
  await box.click();
  await expect(box).toBeChecked();
  await page.getByLabel('Zoom', { exact: true }).selectOption('150');
  await expect(box).toBeChecked();
  await box.click();
  await expect(box).not.toBeChecked();
  await page.getByRole('button', { name: 'Annuler (Ctrl+Z)', exact: true }).click();
  await expect(box).toBeChecked();
});

test('Interface anglaise : outils, édition, signature et paramètres', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'nexus-preferences',
      JSON.stringify({ setupCompleted: true, language: 'en' }),
    ),
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Open a PDF', exact: true }).first()).toBeVisible();
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('Test content', { x: 70, y: 700 });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'english.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await pdf.save()),
    });
  await expect(page.getByRole('button', { name: 'Edit existing text', exact: true })).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Fill and sign' }).click();
  await page.getByRole('button', { name: 'Sign', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Create my signature', exact: true }),
  ).toBeVisible();
  const signatureCanvas = (await page.getByLabel('Signature drawing area').boundingBox())!;
  const place = page.getByRole('button', { name: 'Place signature', exact: true });
  await expect(place).toBeDisabled();
  await page.mouse.move(signatureCanvas.x + 40, signatureCanvas.y + 60);
  await page.mouse.down();
  await page.mouse.move(signatureCanvas.x + 160, signatureCanvas.y + 80, { steps: 5 });
  await page.mouse.up();
  await expect(place).toBeEnabled();
  await page.getByRole('button', { name: 'Clear drawing', exact: true }).click();
  await expect(place).toBeDisabled();
  await page.getByRole('button', { name: 'Type my name', exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Jane Test');
  await expect(page.getByRole('button', { name: 'Place signature', exact: true })).toBeEnabled();
  await page.screenshot({ path: 'test-results/signature-english.png' });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Open local PDFs in Nexus', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Local PDFs in the browser', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
