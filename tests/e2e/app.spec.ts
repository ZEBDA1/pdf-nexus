import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
async function sourcePdf(pages = 3) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const p = d.addPage([595, 842]);
    p.drawText('Projet Nexus - Page ' + (i + 1), { x: 48, y: 740, size: 24, font: f });
    p.drawText('Le budget est de 200 EUR. La date est le 12/10/2026.', {
      x: 48,
      y: 700,
      size: 13,
      font: f,
    });
  }
  return Buffer.from(await d.save());
}
test('Tableau de bord, édition, export, historique et suppression locale', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
  await expect(page.getByRole('heading', { name: 'Les PDF, simplement.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard.png', fullPage: true });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'projet.pdf', mimeType: 'application/pdf', buffer: await sourcePdf() });
  await expect(page.getByText('projet.pdf', { exact: true })).toBeVisible();
  await expect(page.locator('.page-scroller .textLayer').first()).toContainText('Projet Nexus');
  await page.getByRole('button', { name: 'Ajouter du texte', exact: true }).click();
  await page
    .locator('.page-scroller .annotation-layer')
    .first()
    .click({ position: { x: 100, y: 200 } });
  const added = page.getByRole('textbox', { name: 'Écrire directement sur le PDF' });
  await expect(added).toBeFocused();
  await added.fill('Annotation exportée');
  await added.press('Control+Enter');
  await expect(page.locator('.reader-status')).toContainText('1 annotation');
  await page.getByRole('button', { name: 'Annuler (Ctrl+Z)', exact: true }).click();
  await expect(page.locator('.reader-status')).toContainText('0 annotation');
  await page.getByRole('button', { name: 'Rétablir (Ctrl+Maj+Z)', exact: true }).click();
  await expect(page.locator('.reader-status')).toContainText('1 annotation');
  await page.getByRole('button', { name: 'Dupliquer la page courante', exact: true }).click();
  await expect(page.locator('.document-title')).toContainText('4 pages');
  await page.getByRole('button', { name: 'Faire pivoter la page courante', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter le PDF', exact: true }).click();
  await page.getByRole('button', { name: 'Télécharger le PDF', exact: true }).click();
  const download = await downloadPromise;
  const bytes = await readFile((await download.path())!);
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(4);
  expect(pdf.getPage(0).getRotation().angle).toBe(90);
  const exportedText = await page.evaluate(async (data) => {
    const { loadPdf, extractAll } = await import('/' + 'src/pdf/reader.ts');
    const doc = await loadPdf(new Uint8Array(data));
    try {
      return (await extractAll(doc)).map((p: { text: string }) => p.text).join('\n');
    } finally {
      await doc.loadingTask.destroy();
    }
  }, Array.from(bytes));
  expect(exportedText).toContain('Annotation exportée');
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await page.getByRole('textbox', { name: 'Votre question' }).fill('Quel est le budget ?');
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toContainText('200 EUR');
  await page.screenshot({ path: 'test-results/editor.png' });
  await page.getByRole('button', { name: 'Tableau de bord', exact: true }).click();
  await expect(page.locator('.recent-row')).toContainText('projet.pdf');
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', {
      name: 'Effacer les données locales',
      exact: true,
    })
    .click();
  await expect(page.locator('.recent-row')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('Conversions en worker, vrais formats, rendu PNG/JPEG et OCR sur un scan', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
  const source = Array.from(await sourcePdf(1));
  const result = await page.evaluate(async (bytes) => {
    const { loadPdf, extractAll, canvasBytes } = await import('/' + 'src/pdf/reader.ts');
    const { processJob, getFont } = await import('/' + 'src/workers/client.ts');
    const { convertSources } = await import('/' + 'src/converters/index.ts');
    const { recognize } = await import('/' + 'src/ocr/index.ts');
    const doc = await loadPdf(new Uint8Array(bytes));
    const pages = await extractAll(doc);
    const font = await getFont();
    const source = { name: 'test.pdf', bytes: new Uint8Array(bytes) };
    const files: Record<string, number[]> = {};
    for (const format of ['txt', 'docx', 'html'] as const) {
      const [file] = await processJob({ kind: 'convert', source, format, text: pages, font });
      files[format] = Array.from(file.bytes);
    }
    for (const format of ['png', 'jpg'] as const) {
      const [file] = await convertSources(
        [source],
        format,
        '',
        1,
        new AbortController().signal,
        () => {},
      );
      files[format] = Array.from(file.bytes);
    }
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 500;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#000';
    ctx.font = '46px Arial';
    ctx.fillText('Bonjour Paris. PDF Nexus fonctionne.', 40, 110);
    ctx.fillText('Le budget est de 200 euros.', 40, 200);
    const image = await canvasBytes(c, 'png');
    const [scan] = await processJob({
      kind: 'rasterPdf',
      pages: [{ bytes: image, width: 600, height: 250, format: 'png' }],
      font,
      name: 'scan.pdf',
    });
    const scanned = await loadPdf(scan.bytes);
    const before = await extractAll(scanned);
    const recognized = await recognize(
      scanned,
      0,
      'fra+eng',
      new AbortController().signal,
      () => {},
    );
    const [searchable] = await processJob({
      kind: 'rasterPdf',
      pages: [{ bytes: image, width: 600, height: 250, format: 'png', words: recognized.items }],
      font,
      name: 'recherchable.pdf',
    });
    const searchableDoc = await loadPdf(searchable.bytes);
    const after = await extractAll(searchableDoc);
    await doc.loadingTask.destroy();
    await scanned.loadingTask.destroy();
    await searchableDoc.loadingTask.destroy();
    return {
      files,
      before: before[0].text,
      recognized: recognized.text,
      words: recognized.items.length,
      after: after[0].text,
    };
  }, source);
  expect(new TextDecoder().decode(new Uint8Array(result.files.txt))).toContain('200 EUR');
  expect(unzipSync(new Uint8Array(result.files.docx))['word/document.xml']).toBeDefined();
  expect(result.files.png.slice(0, 4)).toEqual([137, 80, 78, 71]);
  expect(result.files.jpg.slice(0, 2)).toEqual([255, 216]);
  expect(result.before).toBe('');
  expect(result.recognized).toMatch(/Bonjour Paris/i);
  expect(result.words).toBeGreaterThan(3);
  expect(result.after).toMatch(/Bonjour/i);
});

test('Document de 120 pages : navigation et libération des canvases hors écran', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: '120-pages.pdf',
      mimeType: 'application/pdf',
      buffer: await sourcePdf(120),
    });
  await expect(page.locator('.document-title')).toContainText('120 pages');
  await page.getByLabel('Numéro de page', { exact: true }).fill('120');
  await expect(page.locator('.page-scroller .textLayer').last()).toContainText('Page 120');
  const canvases = await page
    .locator('.page-scroller canvas')
    .evaluateAll((elements) => elements.filter((e) => (e as HTMLCanvasElement).width > 0).length);
  expect(canvases).toBeLessThan(8);
  expect(canvases).toBeGreaterThan(0);
});
test('Assistant API : succès, clé invalide, réseau absent et annulation', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
  const result = await page.evaluate(async () => {
    const { answer } = await import('/' + 'src/ai/index.ts');
    const { setKey } = await import('/' + 'src/storage/index.ts');
    const { defaultPreferences } = await import('/' + 'src/types.ts');
    const prefs = {
      ...defaultPreferences,
      aiMode: 'api' as const,
      endpoint: 'https://provider.example/v1/chat/completions',
      model: 'test',
    };
    const pages = [{ page: 1, text: 'Budget : 200 euros.', items: [] }];
    await setKey('test-key-not-a-secret');
    const original = globalThis.fetch;
    let payload = '';
    globalThis.fetch = async (_url, options) => {
      payload = String(options?.body);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '200 euros [p. 1]' } }] }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    };
    const ok = await answer(pages, 'budget', prefs, [], new AbortController().signal);
    globalThis.fetch = async () => new Response('', { status: 401 });
    let invalid = '';
    try {
      await answer(pages, 'budget', prefs, [], new AbortController().signal);
    } catch (e) {
      invalid = (e as Error).message;
    }
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    let offline = '';
    try {
      await answer(pages, 'budget', prefs, [], new AbortController().signal);
    } catch (e) {
      offline = (e as Error).message;
    }
    globalThis.fetch = original;
    await setKey('');
    const { processJob, getFont } = await import('/' + 'src/workers/client.ts');
    const c = new AbortController();
    c.abort();
    let cancelled = false;
    try {
      await processJob(
        { kind: 'textPdf', text: 'test', font: await getFont(), name: 't.pdf' },
        c.signal,
      );
    } catch (e) {
      cancelled = (e as Error).name === 'AbortError';
    }
    return { ok, invalid, offline, cancelled, payload };
  });
  expect(result.ok).toContain('[p. 1]');
  expect(result.invalid).toContain('clé');
  expect(result.offline).toContain('fetch');
  expect(result.cancelled).toBe(true);
  expect(result.payload).not.toContain('test-key-not-a-secret');
});
