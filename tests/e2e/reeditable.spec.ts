import { test, expect } from '@playwright/test';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
});

test('Texte noir, ajouts exportés puis supprimés après une nouvelle session Nexus', async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]).drawText('Document original', { x: 50, y: 740, size: 20 });
  const file = page.locator('input[type=file]').first();
  await file.setInputFiles({
    name: 'ajouts.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  });
  await page.getByRole('button', { name: 'Ajouter du texte', exact: true }).click();
  await expect(page.getByLabel('Couleur de l’annotation')).toHaveValue('#000000');
  const layer = page.locator('.page-scroller .annotation-layer');
  await layer.click({ position: { x: 70, y: 220 } });
  const text = page.getByLabel('Écrire directement sur le PDF');
  await expect(text).toHaveCSS('color', 'rgb(0, 0, 0)');
  await text.fill('Texte à conserver');
  await text.press('Control+Enter');
  const menu = page.locator('summary').filter({ hasText: 'Annoter' });
  await menu.click();
  await page.getByLabel('Autres annotations').selectOption('checkbox');
  await layer.click({ position: { x: 80, y: 330 } });
  await menu.click();
  await page.getByRole('button', { name: 'Dessiner', exact: true }).click();
  const bounds = (await layer.boundingBox())!;
  await page.mouse.move(bounds.x + 180, bounds.y + 320);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 220, bounds.y + 350, { steps: 10 });
  await page.mouse.move(bounds.x + 260, bounds.y + 320, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.reader-status')).toContainText('3 annotation');
  // Tool defaults are independent: switching back from a violet drawing gives black text.
  await page.getByRole('button', { name: 'Ajouter du texte', exact: true }).click();
  await expect(page.getByLabel('Couleur de l’annotation')).toHaveValue('#000000');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter le PDF', exact: true }).click();
  await page.getByRole('button', { name: 'Télécharger le PDF', exact: true }).click();
  const bytes = await readFile((await (await pending).path())!);
  // A reload ensures this does not depend on a draft kept in React or IndexedDB.
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'ajouts-nexus.pdf', mimeType: 'application/pdf', buffer: bytes });
  await expect(page.locator('.reader-status')).toContainText('3 annotation');
  const annotations = page.locator('.page-scroller [data-annotation-id]');
  await expect(annotations).toHaveCount(3);
  await page.getByRole('button', { name: 'Lire et sélectionner le texte', exact: true }).click();
  await page.locator('.page-scroller [data-annotation-type="checkbox"]').click();
  await page.getByRole('checkbox', { name: 'Case cochée', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Case cochée', exact: true }).check();
  await annotations
    .filter({ has: page.locator('polyline') })
    .first()
    .click();
  await page
    .getByRole('button', { name: 'Supprimer l’annotation sélectionnée', exact: true })
    .click();
  await annotations
    .filter({ has: page.locator('polyline') })
    .first()
    .click();
  await page.keyboard.press('Delete');
  await expect(annotations).toHaveCount(1);
  await expect(page.locator('.reader-status')).toContainText('1 annotation');
  const finalDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter le PDF', exact: true }).click();
  await page.getByRole('button', { name: 'Télécharger le PDF', exact: true }).click();
  const final = await readFile((await (await finalDownload).path())!);
  const rendered = await page.evaluate(async (data) => {
    const { loadPdf, extractPage } = await import('/' + 'src/pdf/reader.ts');
    const doc = await loadPdf(new Uint8Array(data));
    try {
      const p = await doc.getPage(1),
        canvas = document.createElement('canvas');
      const viewport = p.getViewport({ scale: 1 });
      canvas.width = 595;
      canvas.height = 842;
      await p.render({ canvas, viewport }).promise;
      const pixels = canvas.getContext('2d')!.getImageData(60, 300, 240, 80).data;
      let ink = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i] < 240 || pixels[i + 1] < 240 || pixels[i + 2] < 240) ink++;
      return { ink, text: (await extractPage(doc, 0)).text };
    } finally {
      await doc.loadingTask.destroy();
    }
  }, Array.from(final));
  expect(rendered.ink).toBe(0);
  expect(rendered.text).toContain('Texte à conserver');
  expect(rendered.text).toContain('Document original');
  await page.screenshot({ path: 'test-results/ajouts-reouverts.png' });
});

test('Cases petites, grises, cochées et scannées : détection stable à tous les zooms', async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  const p = pdf.addPage([595, 842]);
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  p.drawText('O 0 D B - Formulaire', { x: 55, y: 745, size: 20, font: f });
  const specs = [
    { x: 60, y: 680, width: 6, height: 6, borderColor: rgb(0, 0, 0), borderWidth: 0.5 },
    { x: 60, y: 630, width: 12, height: 12, borderColor: rgb(0.78, 0.78, 0.78), borderWidth: 0.5 },
    { x: 60, y: 580, width: 15, height: 13, borderColor: rgb(0, 0, 0), borderWidth: 0.7 },
    { x: 60, y: 530, width: 12, height: 12, borderColor: rgb(0, 0, 0), borderWidth: 1 },
  ];
  for (const spec of specs) p.drawRectangle(spec);
  // Gaps that the previous connected-component detector discarded.
  p.drawRectangle({ x: 65, y: 592, width: 1, height: 2, color: rgb(1, 1, 1) });
  p.drawRectangle({ x: 59, y: 585, width: 2, height: 1, color: rgb(1, 1, 1) });
  p.drawLine({ start: { x: 62, y: 532 }, end: { x: 70, y: 540 }, thickness: 1 });
  p.drawRectangle({
    x: 50,
    y: 350,
    width: 350,
    height: 60,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });
  // A true scanned image on a second page, not vector rectangles.
  const scan = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 595;
    c.height = 842;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 595, 842);
    ctx.strokeStyle = '#777';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) ctx.strokeRect(60, 120 + 40 * i, 12, 12);
    return c.toDataURL('image/png').split(',')[1];
  });
  const image = await pdf.embedPng(Buffer.from(scan, 'base64'));
  pdf.addPage([595, 842]).drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'reperage.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await pdf.save()),
    });
  await page.locator('summary').filter({ hasText: 'Remplir et signer' }).click();
  await page.getByRole('button', { name: 'Repérer les cases', exact: true }).click();
  const printed = page.locator('.page-scroller .pdf-page[data-page="1"] .printed-checkbox');
  await expect(printed.first()).toBeVisible();
  await expect(printed).toHaveCount(4);
  await expect(printed.last()).toBeChecked();
  await printed.last().click();
  await expect(printed.last()).not.toBeChecked();
  for (const zoom of ['50', '150', '200']) {
    await page.getByLabel('Zoom', { exact: true }).selectOption(zoom);
    await expect(printed).toHaveCount(4);
    await expect(printed.last()).not.toBeChecked();
  }
  await page.getByLabel('Zoom', { exact: true }).selectOption('100');
  const scanned = page.locator('.page-scroller .pdf-page[data-page="2"]');
  await scanned.scrollIntoViewIfNeeded();
  await expect(scanned.locator('.printed-checkbox')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/cases-scan-detection.png' });
});
