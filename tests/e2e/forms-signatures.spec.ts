import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

test('Texte déplacé, cases interactives et signature réellement exportés', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  const p = pdf.addPage([595, 842]);
  p.drawText('Texte mobile', { x: 70, y: 710, font, size: 20 });
  p.drawText('Texte fixe', { x: 70, y: 650, font, size: 20 });
  pdf
    .getForm()
    .createCheckBox('Consentement')
    .addToPage(p, { x: 70, y: 590, width: 18, height: 18 });
  const original = pdf.getForm().createCheckBox('Deja cochee');
  original.addToPage(p, { x: 110, y: 590, width: 18, height: 18 });
  original.check();
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'formulaire.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await pdf.save()),
    });
  const mobile = page.locator('.page-scroller .textLayer span').filter({ hasText: 'Texte mobile' });
  const before = await mobile.boundingBox();
  await mobile.click();
  const handle = page.getByRole('button', { name: 'Déplacer ce texte', exact: true });
  const bounds = (await handle.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 70, bounds.y + bounds.height / 2 + 30, {
    steps: 8,
  });
  await page.mouse.up();
  await page.getByLabel('Modifier ce texte sur la page').press('Enter');
  await expect.poll(async () => (await mobile.boundingBox())?.x).toBeCloseTo(before!.x + 70, 0);
  // Reopen the moved passage: editor and rendered text remain aligned.
  await mobile.click();
  const inputBox = (await page.getByLabel('Modifier ce texte sur la page').boundingBox())!;
  expect(Math.abs(inputBox.x - (await mobile.boundingBox())!.x)).toBeLessThan(3);
  await page.getByLabel('Modifier ce texte sur la page').press('Enter');
  await page.getByRole('checkbox', { name: 'Case à cocher : Consentement', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Case à cocher : Deja cochee', exact: true }).uncheck();
  await page.locator('summary').filter({ hasText: 'Remplir et signer' }).click();
  await page.getByRole('button', { name: 'Signer', exact: true }).click();
  await page.getByRole('button', { name: 'Saisir mon nom', exact: true }).click();
  await page.getByLabel('Votre nom', { exact: true }).fill('Test Nexus');
  await page.getByRole('button', { name: 'Placer la signature', exact: true }).click();
  await page.locator('.page-scroller .annotation-layer').click({ position: { x: 170, y: 370 } });
  await expect(page.locator('.page-scroller .annotation-layer image')).toHaveCount(1);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter le PDF', exact: true }).click();
  await page.getByRole('button', { name: 'Télécharger le PDF', exact: true }).click();
  const bytes = await readFile((await (await pending).path())!);
  const result = await page.evaluate(async (bytes) => {
    const { loadPdf } = await import('/' + 'src/pdf/reader.ts');
    const pdf = await loadPdf(new Uint8Array(bytes));
    try {
      const p = await pdf.getPage(1),
        content = await p.getTextContent();
      const c = document.createElement('canvas'),
        viewport = p.getViewport({ scale: 1 });
      c.width = 595;
      c.height = 842;
      await p.render({ canvas: c, viewport }).promise;
      const ctx = c.getContext('2d')!;
      function dark(x: number, y: number, w: number, h: number) {
        const a = ctx.getImageData(x, y, w, h).data;
        let count = 0;
        for (let i = 0; i < a.length; i += 4)
          if (a[i] < 100 && a[i + 1] < 100 && a[i + 2] < 100) count++;
        return count;
      }
      return {
        items: content.items
          .filter((i: any) => 'str' in i)
          .map((i: any) => ({ text: i.str, x: i.transform[4], y: i.transform[5] })),
        checked: dark(74, 238, 10, 10),
        empty: dark(114, 238, 10, 10),
        signature: dark(170, 370, 150, 45),
      };
    } finally {
      await pdf.loadingTask.destroy();
    }
  }, Array.from(bytes));
  expect(result.items.find((i: any) => i.text === 'Texte mobile')).toMatchObject({
    x: 140,
    y: 680,
  });
  expect(result.items.find((i: any) => i.text === 'Texte fixe')).toMatchObject({ x: 70, y: 650 });
  expect(result.checked).toBeGreaterThan(10);
  expect(result.empty).toBe(0);
  expect(result.signature).toBeGreaterThan(10);
  await page.screenshot({ path: 'test-results/formulaire-signature.png' });
});

test('Déplacement en coordonnées de page malgré une matrice graphique et une rotation', async ({
  page,
}) => {
  await page.goto('/editor.html');
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  const p = pdf.addPage([595, 842]);
  p.drawText('Sous matrice', { x: 40, y: 80, font, size: 20 });
  p.scaleContent(2, 2);
  p.setRotation(degrees(90));
  const result = await page.evaluate(
    async (data) => {
      const { listNativeRuns, nativePreview } = await import('/' + 'src/pdf/native-text.ts');
      const { loadPdf } = await import('/' + 'src/pdf/reader.ts');
      const bytes = new Uint8Array(data),
        [run] = await listNativeRuns(bytes, 0);
      const changed = await nativePreview(bytes, 0, [
        { id: run.id, original: run.text, text: run.text, offset: { x: 50, y: -30 } },
      ]);
      const pdf = await loadPdf(changed);
      try {
        const p = await pdf.getPage(1),
          text = await p.getTextContent();
        return { rotation: p.rotate, item: text.items.find((i: any) => i.str === 'Sous matrice') };
      } finally {
        await pdf.loadingTask.destroy();
      }
    },
    Array.from(await pdf.save()),
  );
  expect(result.rotation).toBe(90);
  expect(result.item.transform.slice(4)).toEqual([130, 130]);
});
