import { test, expect } from '@playwright/test';
import { PDFDocument, PDFName } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchExtension } from './browser';

for (const channel of ['msedge', 'chrome'] as const) {
  test(`Version compilée ${channel} : brouillon, formulaire et exports au choix hors connexion`, async () => {
    const context = await launchExtension(channel, resolve('dist'));
    try {
      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      await worker.evaluate(() =>
        chrome.storage.local.set({ preferences: { setupCompleted: true } }),
      );
      const id = worker.url().split('/')[2],
        page = await context.newPage(),
        requests: string[] = [],
        errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      context.on('request', (r) => {
        if (/^https?:/.test(r.url())) requests.push(r.url());
      });
      await context.setOffline(true);
      await page.goto(`chrome-extension://${id}/editor.html`);
      const doc = await PDFDocument.create(),
        p = doc.addPage([595, 842]);
      p.drawText('Dossier local', { x: 60, y: 760, size: 20 });
      doc.getForm().createTextField('Nom').addToPage(p, { x: 60, y: 690, width: 200, height: 24 });
      await page
        .locator('input[type=file]')
        .first()
        .setInputFiles({
          name: 'local.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from(await doc.save()),
        });
      await page.getByRole('textbox', { name: 'Nom', exact: true }).fill('Élodie');
      await page.getByRole('button', { name: 'Ajouter du texte', exact: true }).click();
      await page.locator('.page-scroller .annotation-layer').click({ position: { x: 80, y: 250 } });
      await page.getByLabel('Écrire directement sur le PDF').fill('Ajout local\nPlusieurs lignes');
      await page.getByLabel('Écrire directement sur le PDF').press('Control+Enter');
      await expect(page.locator('.autosave-status.saved')).toBeVisible();
      await page.reload();
      await page.getByRole('button', { name: 'Reprendre local.pdf', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Nom', exact: true })).toHaveValue('Élodie');
      await expect(page.locator('.page-scroller [data-annotation-type="text"]')).toContainText(
        'Plusieurs lignes',
      );
      await page.getByRole('button', { name: 'Objets ajoutés', exact: true }).click();
      await page.locator('.object-row .object-select').click();
      await page.getByLabel('Nom de l’objet').fill('Note de suivi');
      const editableDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Exporter le PDF', exact: true }).click();
      await page.getByRole('button', { name: 'Télécharger le PDF', exact: true }).click();
      const editable = await PDFDocument.load(
        await readFile((await (await editableDownload).path())!),
      );
      expect(editable.getForm().getTextField('Nom').getText()).toBe('Élodie');
      expect(editable.getPage(0).node.has(PDFName.of('NexusEdits'))).toBe(true);
      await page.getByRole('button', { name: 'Exporter le PDF', exact: true }).click();
      await page.getByRole('radio', { name: /Partager une copie aplatie/ }).check();
      const flatDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Télécharger le PDF', exact: true }).click();
      const flat = await PDFDocument.load(await readFile((await (await flatDownload).path())!));
      expect(flat.getForm().getFields()).toHaveLength(0);
      expect(flat.getPage(0).node.has(PDFName.of('NexusEdits'))).toBe(false);
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${id}/popup.html`);
      await expect(
        popup.getByRole('button', { name: 'Reprendre mon travail (1)', exact: true }),
      ).toBeVisible();
      expect(requests).toEqual([]);
      expect(errors).toEqual([]);
      await page.screenshot({ path: `test-results/roadmap-extension-${channel}.png` });
    } finally {
      await context.close();
    }
  });
}
