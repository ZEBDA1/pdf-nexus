import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

test('Une signature suit tout le geste, même hors de la page, puis se déplace une seconde fois', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([595, 842]).drawText('Texte de reference', { x: 70, y: 700, size: 20, font });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'gestes.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await pdf.save()),
    });
  await page.locator('summary').filter({ hasText: 'Remplir et signer' }).click();
  await page.getByRole('button', { name: 'Signer', exact: true }).click();
  await page.getByRole('button', { name: 'Saisir mon nom', exact: true }).click();
  await page.getByLabel('Votre nom', { exact: true }).fill('Signature mobile');
  await page.getByRole('button', { name: 'Placer la signature', exact: true }).click();
  await page.locator('.page-scroller .annotation-layer').click({ position: { x: 120, y: 300 } });
  // A placed signature is immediately movable, without changing modes.
  const signature = page.locator('.page-scroller .annotation-layer image');
  const original = (await signature.boundingBox())!;
  await page.mouse.move(original.x + original.width / 2, original.y + original.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    original.x + original.width / 2 + 80,
    original.y + original.height / 2 + 45,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect.poll(async () => (await signature.boundingBox())!.x).toBeCloseTo(original.x + 80, 0);
  await expect.poll(async () => (await signature.boundingBox())!.y).toBeCloseTo(original.y + 45, 0);
  const moved = (await signature.boundingBox())!;
  // Fast movement outside the SVG must keep pointer capture, including mouse-up.
  await page.mouse.move(moved.x + 10, moved.y + 10);
  await page.mouse.down();
  await page.mouse.move(90, moved.y + 70, { steps: 2 });
  await page.mouse.move(moved.x + 50, moved.y + 30, { steps: 2 });
  await page.mouse.up();
  await expect.poll(async () => (await signature.boundingBox())!.x).toBeCloseTo(moved.x + 40, 0);
  await page.getByRole('button', { name: 'Annuler (Ctrl+Z)', exact: true }).click();
  await expect.poll(async () => (await signature.boundingBox())!.x).toBeCloseTo(moved.x, 0);
  await page.getByRole('button', { name: 'Rétablir (Ctrl+Maj+Z)', exact: true }).click();
  await expect.poll(async () => (await signature.boundingBox())!.x).toBeCloseTo(moved.x + 40, 0);
  const imageBounds = await signature.evaluate((el) => ({
    x: Number(el.getAttribute('x')),
    y: Number(el.getAttribute('y')),
    width: Number(el.getAttribute('width')),
    height: Number(el.getAttribute('height')),
  }));
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter le PDF', exact: true }).click();
  const exported = await readFile((await (await pending).path())!);
  const ink = await page.evaluate(
    async ({ bytes, bounds }) => {
      const { loadPdf } = await import('/' + 'src/pdf/reader.ts');
      const pdf = await loadPdf(new Uint8Array(bytes));
      try {
        const p = await pdf.getPage(1),
          canvas = document.createElement('canvas'),
          viewport = p.getViewport({ scale: 1 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await p.render({ canvas, viewport }).promise;
        const ctx = canvas.getContext('2d')!;
        const count = (x: number, y: number) => {
          const data = ctx.getImageData(
            Math.floor(x),
            Math.floor(y),
            Math.ceil(bounds.width),
            Math.ceil(bounds.height),
          ).data;
          let ink = 0;
          for (let i = 0; i < data.length; i += 4)
            if (data[i] < 100 && data[i + 1] < 100 && data[i + 2] < 100) ink++;
          return ink;
        };
        return { final: count(bounds.x, 842 + bounds.y), original: count(120, 300) };
      } finally {
        await pdf.loadingTask.destroy();
      }
    },
    { bytes: Array.from(exported), bounds: imageBounds },
  );
  expect(ink.final).toBeGreaterThan(20);
  expect(ink.original).toBe(0);
});

test('Un texte répété puis renommé reste aligné après déplacement et réédition', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  const p = pdf.addPage([595, 842]);
  p.drawText('Texte identique', { x: 80, y: 720, font, size: 20 });
  p.drawText('Texte identique', { x: 80, y: 640, font, size: 20 });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'doublons.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await pdf.save()),
    });
  await page
    .locator('.page-scroller .textLayer span')
    .filter({ hasText: 'Texte identique' })
    .nth(1)
    .click();
  const input = page.getByLabel('Modifier ce texte sur la page');
  await input.fill('Texte renomme');
  const handle = page.getByRole('button', { name: 'Déplacer ce texte', exact: true });
  await handle.focus();
  for (let i = 0; i < 5; i++) await handle.press('Shift+ArrowRight');
  await input.press('Enter');
  const rendered = page
    .locator('.page-scroller .textLayer span')
    .filter({ hasText: 'Texte renomme' });
  await expect(rendered).toBeVisible();
  const before = (await rendered.boundingBox())!;
  await rendered.click();
  expect(Math.abs((await input.boundingBox())!.x - before.x)).toBeLessThan(3);
  const frameBefore = (await input.boundingBox())!;
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 20, grip.y + grip.height / 2 + 10);
  const scrolled = await page.locator('.page-scroller').evaluate((el) => {
    const before = el.scrollTop;
    el.scrollTop += 40;
    return el.scrollTop - before;
  });
  expect(scrolled).toBe(40);
  await page.mouse.move(grip.x + grip.width / 2 + 50, grip.y + grip.height / 2 + 20);
  await page.mouse.up();
  await expect.poll(async () => (await input.boundingBox())!.x).toBeCloseTo(frameBefore.x + 50, 0);
  await expect.poll(async () => (await input.boundingBox())!.y).toBeCloseTo(frameBefore.y + 20, 0);
  await input.press('Enter');
  await expect.poll(async () => (await rendered.boundingBox())!.x).toBeCloseTo(before.x + 50, 0);
});

test('Texte ajouté : glisser sur page tournée à 150 %, puis export aux bonnes coordonnées', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]).setRotation(degrees(90));
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'tourne.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await pdf.save()),
    });
  await page.getByRole('button', { name: 'Ajouter du texte', exact: true }).click();
  await page.locator('.page-scroller .annotation-layer').click({ position: { x: 250, y: 180 } });
  await page.getByLabel('Écrire directement sur le PDF').fill('Texte ajoute mobile');
  await page.getByLabel('Écrire directement sur le PDF').press('Control+Enter');
  await page.getByRole('button', { name: 'Lire et sélectionner le texte', exact: true }).click();
  await page.getByLabel('Zoom', { exact: true }).selectOption('150');
  const annotation = page.locator('.page-scroller [data-annotation-id]');
  const hitbox = annotation.locator(':scope > rect').first();
  const x = Number(await hitbox.getAttribute('x')),
    y = Number(await hitbox.getAttribute('y'));
  const original = (await hitbox.boundingBox())!;
  await page.mouse.move(original.x + original.width / 2, original.y + 20);
  await page.mouse.down();
  await page.mouse.move(original.x + original.width / 2 + 60, original.y + 50, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number(await hitbox.getAttribute('x'))).toBeCloseTo(x + 20, 1);
  await expect.poll(async () => Number(await hitbox.getAttribute('y'))).toBeCloseTo(y + 40, 1);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter le PDF', exact: true }).click();
  const exported = await readFile((await (await pending).path())!);
  const result = await page.evaluate(async (bytes) => {
    const { loadPdf } = await import('/' + 'src/pdf/reader.ts');
    const doc = await loadPdf(new Uint8Array(bytes));
    try {
      const p = await doc.getPage(1),
        text = await p.getTextContent();
      return text.items.find((i: any) => i.str === 'Texte ajoute mobile');
    } finally {
      await doc.loadingTask.destroy();
    }
  }, Array.from(exported));
  expect(result.transform[4]).toBeCloseTo(x + 20 + 4, 1);
});
