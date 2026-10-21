import { test, expect } from '@playwright/test';
import { PDFDocument, degrees, rgb } from 'pdf-lib';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
});

test('Un scan de texte ne crée aucun repère sur les lettres ; seules les vraies cases sont proposées', async ({
  page,
}) => {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 595;
    canvas.height = 842;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    for (let i = 0; i < 7; i++) {
      ctx.font = `${i % 2 ? 'bold' : ''} ${14 + i * 2}px ${i % 2 ? 'Times New Roman' : 'Arial'}`;
      ctx.fillText('O 0 D B P Q R a e o b d p q 8 9 6 Bonjour', 45, 45 + i * 37);
    }
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.strokeRect(60, 350 + i * 40, 14, 14);
      ctx.font = '18px Arial';
      ctx.fillText('Option ' + (i + 1), 85, 363 + i * 40);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(Buffer.from(png, 'base64'));
  pdf.addPage([595, 842]).drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'scan-lettres.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await pdf.save()),
    });
  await page.locator('summary').filter({ hasText: 'Remplir et signer' }).click();
  await page.getByRole('button', { name: 'Repérer les cases', exact: true }).click();
  const boxes = page.locator('.page-scroller .printed-checkbox');
  await expect(boxes.first()).toBeVisible();
  await expect(boxes).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const top = await boxes
      .nth(i)
      .evaluate((element) => parseFloat((element as HTMLElement).style.top));
    expect(Math.abs(top - (350 + i * 40))).toBeLessThan(1.5);
  }
  await page.screenshot({ path: 'test-results/checkbox-scan-sans-faux-positifs.png' });
  await boxes.first().click({ button: 'right' });
  await expect(boxes).toHaveCount(2);
  await boxes.first().focus();
  await page.keyboard.press('Delete');
  await expect(boxes).toHaveCount(1);
  await expect(page.locator('.reader-status')).toContainText('0 annotation');
  for (let i = 0; i < 2; i++) {
    await page.locator('summary').filter({ hasText: 'Remplir et signer' }).click();
    await page.getByRole('button', { name: 'Repérer les cases', exact: true }).click();
  }
  await expect(boxes).toHaveCount(3);
});

test('Les repères restent sur les contours après rotation, recadrage et changement de zoom', async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  const p = pdf.addPage([640, 900]);
  p.setCropBox(25, 35, 580, 810);
  p.drawText('Formulaire tourne', { x: 80, y: 760, size: 20 });
  p.drawRectangle({
    x: 90,
    y: 600,
    width: 14,
    height: 14,
    borderWidth: 1,
    borderColor: rgb(0, 0, 0),
  });
  p.setRotation(degrees(90));
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'case-tournee.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await pdf.save()),
    });
  await page.locator('summary').filter({ hasText: 'Remplir et signer' }).click();
  await page.getByRole('button', { name: 'Repérer les cases', exact: true }).click();
  const box = page.locator('.page-scroller .printed-checkbox');
  await expect(box).toHaveCount(1);
  await box.click();
  const addition = page.locator('.page-scroller [data-annotation-type="checkbox"]');
  for (const zoom of ['50', '150', '200', '100']) {
    await page.getByLabel('Zoom', { exact: true }).selectOption(zoom);
    await expect(box).toBeChecked();
    const b = (await box.boundingBox())!,
      a = (await addition.boundingBox())!;
    expect(Math.abs(b.x - a.x)).toBeLessThan(2);
    expect(Math.abs(b.y - a.y)).toBeLessThan(2);
    expect(Math.abs(b.width - a.width)).toBeLessThan(3);
  }
  const sheet = page.locator('.page-scroller .pdf-page');
  for (let i = 0; i < 4; i++) {
    const before = (await sheet.boundingBox())!;
    await page.getByRole('button', { name: 'Faire pivoter la page courante', exact: true }).click();
    await expect.poll(async () => (await sheet.boundingBox())!.width).toBeCloseTo(before.height, 0);
    await expect(box).toHaveCount(1);
    await expect(box).toBeChecked();
    const b = (await box.boundingBox())!,
      a = (await addition.boundingBox())!;
    expect(Math.abs(b.x - a.x)).toBeLessThan(2);
    expect(Math.abs(b.y - a.y)).toBeLessThan(2);
    await expect(addition).toHaveCount(1);
  }
});
