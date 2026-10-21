import { test, expect, chromium } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

for (const channel of ['chromium', 'msedge'] as const) {
  test(`Extension MV3 dans ${channel} : popup, export et OCR hors connexion`, async () => {
    const extension = resolve('dist');
    const context = await chromium.launchPersistentContext('', {
      channel,
      headless: true,
      viewport: { width: 1440, height: 1000 },
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    try {
      let worker = context.serviceWorkers()[0];
      if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
      const id = worker.url().split('/')[2];
      await expect.poll(() => context.pages().some((p) => p.url().endsWith('#setup'))).toBe(true);
      let page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const external: string[] = [];
      context.on('request', (r) => {
        if (/^https?:/.test(r.url())) external.push(r.url());
      });
      await context.setOffline(true);
      await page.goto(`chrome-extension://${id}/popup.html`);
      await expect(page.getByRole('button', { name: /Ouvrir un PDF/ })).toBeVisible();
      await worker.evaluate(() =>
        chrome.storage.local.set({ preferences: { setupCompleted: true } }),
      );
      const doc = await PDFDocument.create(),
        font = await doc.embedFont(StandardFonts.Helvetica);
      const p = doc.addPage([595, 842]);
      p.drawText('Bonjour Nexus. Test local du navigateur.', { x: 40, y: 730, font, size: 20 });
      const editorOpened = context.waitForEvent('page');
      await page
        .locator('input[type=file]')
        .first()
        .setInputFiles({
          name: 'offline.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from(await doc.save()),
        });
      page = await editorOpened;
      page.on('pageerror', (e) => errors.push(e.message));
      await expect(page.locator('.page-scroller .textLayer').first()).toContainText(
        'Bonjour Nexus',
      );
      await page.getByRole('button', { name: 'Modifier le texte existant', exact: true }).click();
      await page
        .locator('.page-scroller .textLayer span')
        .filter({ hasText: 'Bonjour Nexus' })
        .click();
      await page
        .getByLabel('Modifier ce texte sur la page')
        .fill('Bonjour Nexus. Modification directe.');
      await expect(page.locator('.page-scroller .textLayer')).toContainText('Modification directe');
      await page.getByLabel('Modifier ce texte sur la page').press('Enter');
      await page.getByRole('button', { name: 'Ajouter du texte', exact: true }).click();
      await page
        .locator('.page-scroller .annotation-layer')
        .first()
        .click({ position: { x: 120, y: 220 } });
      await page.getByLabel('Écrire directement sur le PDF').fill('Hors connexion');
      const promise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Exporter le PDF', exact: true }).click();
      await page.getByRole('button', { name: 'Télécharger le PDF', exact: true }).click();
      const downloaded = await promise;
      const exported = await readFile((await downloaded.path())!);
      const pdf = await PDFDocument.load(exported);
      expect(pdf.getPageCount()).toBe(1);
      await page.locator('input[type=file]').first().setInputFiles({
        name: 'reouvert-nexus.pdf',
        mimeType: 'application/pdf',
        buffer: exported,
      });
      await expect(page.locator('.document-title')).toContainText('reouvert-nexus.pdf');
      const restored = page.locator('.page-scroller [data-annotation-id]');
      await expect(restored).toHaveCount(1);
      await page
        .getByRole('button', { name: 'Lire et sélectionner le texte', exact: true })
        .click();
      await restored.click();
      await page
        .getByRole('button', { name: 'Supprimer l’annotation sélectionnée', exact: true })
        .click();
      await expect(restored).toHaveCount(0);
      // Replace only the disposable test document, accepting the product's draft warning.
      const canvas = createCanvas(1400, 600);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 1400, 600);
      ctx.fillStyle = '#000';
      ctx.font = '50px Arial';
      ctx.fillText('Bonjour Paris. PDF Nexus.', 70, 170);
      ctx.fillText('Un document local en francais.', 70, 270);
      const scan = await PDFDocument.create();
      const img = await scan.embedPng(canvas.toBuffer('image/png'));
      scan.addPage([700, 300]).drawImage(img, { x: 0, y: 0, width: 700, height: 300 });
      await page
        .locator('input[type=file]')
        .first()
        .setInputFiles({
          name: 'scan.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from(await scan.save()),
        });
      await expect(page.locator('.document-title')).toContainText('scan.pdf');
      await page.getByRole('button', { name: /Outils du document/ }).click();
      await page
        .getByRole('button', { name: 'Reconnaître les pages sans texte', exact: true })
        .click();
      await expect(page.getByText(/page\(s\) reconnue\(s\)/)).toBeVisible({ timeout: 90000 });
      const txtPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Exporter le texte TXT', exact: true }).click();
      const txt = await readFile((await (await txtPromise).path())!, 'utf8');
      expect(txt).toMatch(/Bonjour Paris/i);
      expect(errors).toEqual([]);
      expect(external).toEqual([]);
      await page.screenshot({ path: `test-results/extension-${channel}.png` });
      // The production popup follows the chosen app language, independently of
      // the browser locale used for the extension manifest description.
      await worker.evaluate(() =>
        chrome.storage.local.set({ preferences: { setupCompleted: true, language: 'en' } }),
      );
      const english = await context.newPage();
      await english.goto(`chrome-extension://${id}/popup.html`);
      await expect(english.getByRole('button', { name: 'Open a PDF', exact: true })).toBeVisible();
      await expect(
        english.getByRole('button', { name: 'Configure local PDFs and downloads', exact: true }),
      ).toBeVisible();
      expect(
        await worker.evaluate(() => chrome.i18n.getMessage('extensionDescription')),
      ).toBeTruthy();
    } finally {
      await context.close();
    }
  });
}
