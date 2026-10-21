import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
});

test('Saisie immédiate, police adaptée et export sans valider ni quitter le champ', async ({
  page,
}) => {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await readFile('public/fonts/NotoSans-Regular.ttf'), {
    subset: true,
  });
  doc.addPage([595, 842]).drawText('Bonjour Nexus', { x: 40, y: 730, font, size: 24 });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'live.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await doc.save()),
    });
  await page.getByRole('button', { name: 'Modifier le texte existant', exact: true }).click();
  await page.locator('.page-scroller .textLayer span').filter({ hasText: 'Bonjour Nexus' }).click();
  const input = page.getByLabel('Modifier ce texte sur la page');
  await expect(input).toBeFocused();
  await input.fill('Été à Paris');
  // PDF rendering updates while the focused input and caret remain alive.
  await expect(page.locator('.page-scroller .textLayer')).toContainText('Été à Paris');
  await expect(input).toBeFocused();
  await expect(page.locator('.live-text-tools')).toContainText('Police adaptée');
  await input.press('End');
  await input.pressSequentially(' 2026', { delay: 20 });
  await expect(input).toHaveValue('Été à Paris 2026');
  await page.screenshot({ path: 'test-results/live-editing.png' });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter le PDF', exact: true }).click();
  await page.getByRole('button', { name: 'Télécharger le PDF', exact: true }).click();
  const bytes = await readFile((await (await pending).path())!);
  const text = await page.evaluate(async (data) => {
    const { loadPdf, extractAll } = await import('/' + 'src/pdf/reader.ts');
    const doc = await loadPdf(new Uint8Array(data));
    try {
      return (await extractAll(doc))[0].text;
    } finally {
      await doc.loadingTask.destroy();
    }
  }, Array.from(bytes));
  expect(text).toContain('Été à Paris 2026');
  expect(text).not.toContain('Bonjour Nexus');
  await page.getByRole('button', { name: 'Annuler (Ctrl+Z)', exact: true }).click();
  await expect(page.locator('.page-scroller .textLayer')).toContainText('Bonjour Nexus');
});

test('Bloc complexe : correction visuelle immédiate, réédition et export honnête', async ({
  page,
}) => {
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica);
  const p = doc.addPage([595, 842]),
    resource = p.node.newFontDictionary(font.name, font.ref);
  p.drawRectangle({ x: 20, y: 685, width: 450, height: 100, color: rgb(0.88, 0.92, 1) });
  p.node.addContentStream(
    doc.context.register(
      doc.context.flateStream(`BT ${resource} 20 Tf 1 0 0 1 40 730 Tm (Bloc) Tj ( complexe) Tj ET`),
    ),
  );
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'complexe.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await doc.save()),
    });
  await page.getByRole('button', { name: 'Modifier le texte existant', exact: true }).click();
  await page.locator('.page-scroller .textLayer span').filter({ hasText: 'Bloc complexe' }).click();
  await expect(page.locator('.live-text-tools')).toContainText('Correction visuelle');
  await expect(page.locator('.live-text-tools')).toContainText('origine reste dans le fichier');
  const input = page.getByLabel('Modifier ce texte sur la page');
  await input.fill('Texte adapté');
  await input.press('Enter');
  await input.press('L');
  await expect(input).toHaveValue('Texte adapté\nL');
  await expect(page.locator('.reader-status')).toContainText('1 correction(s) visuelle(s)');
  await expect(page.getByLabel('Fond du remplacement')).not.toHaveValue('#ffffff');
  await input.press('Control+Enter');
  const correction = page
    .locator('.page-scroller .annotation-layer text')
    .filter({ hasText: 'Texte adapté' });
  await correction.locator('xpath=ancestor::*[@data-annotation-id]').click();
  await expect(page.getByLabel('Modifier ce texte sur la page')).toHaveValue('Texte adapté\nL');
  await page.getByLabel('Modifier ce texte sur la page').fill('Correction finale');
  const mask = page.locator('.page-scroller .annotation-layer rect[transform]').first();
  const originalMask = await mask.getAttribute('transform');
  const handle = (await page
    .getByRole('button', { name: 'Déplacer ce texte', exact: true })
    .boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 50, handle.y + handle.height / 2 + 30, {
    steps: 6,
  });
  await page.mouse.up();
  await expect(mask).toHaveAttribute('transform', originalMask!);
  const movedInput = page.getByLabel('Modifier ce texte sur la page');
  const movedX = (await movedInput.boundingBox())!.x;
  const finalText = page
    .locator('.page-scroller .annotation-layer text')
    .filter({ hasText: 'Correction finale' });
  const renderedX = (await finalText.boundingBox())!.x;
  const moveButton = page.getByRole('button', { name: 'Déplacer ce texte', exact: true });
  await moveButton.focus();
  await moveButton.press('Control+z');
  await expect.poll(async () => (await correction.boundingBox())!.x).toBeCloseTo(renderedX - 50, 1);
  await page.getByRole('button', { name: 'Rétablir (Ctrl+Maj+Z)', exact: true }).click();
  await expect.poll(async () => (await finalText.boundingBox())!.x).toBeCloseTo(renderedX, 1);
  await finalText.click();
  await expect(movedInput).toHaveValue('Correction finale');
  await expect.poll(async () => (await movedInput.boundingBox())!.x).toBeCloseTo(movedX, 1);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter le PDF', exact: true }).click();
  await page.getByRole('button', { name: 'Télécharger le PDF', exact: true }).click();
  const bytes = await readFile((await (await pending).path())!);
  const result = await page.evaluate(async (data) => {
    const { loadPdf, extractAll } = await import('/' + 'src/pdf/reader.ts');
    const doc = await loadPdf(new Uint8Array(data));
    try {
      const content = await (await doc.getPage(1)).getTextContent();
      const moved = content.items.find((i: any) => 'str' in i && i.str === 'Correction finale');
      return {
        text: (await extractAll(doc))[0].text,
        position: moved && 'transform' in moved ? moved.transform.slice(4) : [],
      };
    } finally {
      await doc.loadingTask.destroy();
    }
  }, Array.from(bytes));
  expect(result.text).toContain('Correction finale');
  expect(result.position[0]).toBeCloseTo(90, 1);
  expect(result.position[1]).toBeCloseTo(700, 1);
  // A visual correction is not falsely asserted to remove original text.
  expect(result.text).toContain('Bloc complexe');
  // The object inspector and the floating editor must update the same font.
  await page.getByRole('button', { name: 'Objets ajoutés', exact: true }).click();
  await page.locator('.object-row .object-select').click();
  await expect(page.getByLabel('Police de l’objet')).toHaveValue('Helvetica');
  await page.getByLabel('Police de l’objet').selectOption('Times-Roman');
  const changedDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter le PDF', exact: true }).click();
  await page.getByRole('button', { name: 'Télécharger le PDF', exact: true }).click();
  const changed = await readFile((await (await changedDownload).path())!);
  const family = await page.evaluate(async (data) => {
    const { loadPdf } = await import('/' + 'src/pdf/reader.ts');
    const pdf = await loadPdf(new Uint8Array(data));
    try {
      const content = await (await pdf.getPage(1)).getTextContent();
      const item = content.items.find((i: any) => i.str === 'Correction finale') as any;
      return content.styles[item.fontName].fontFamily;
    } finally {
      await pdf.loadingTask.destroy();
    }
  }, Array.from(changed));
  expect(family).toBe('serif');
});
