import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import { resolve } from 'node:path';
import { launchExtension } from './browser';

for (const channel of ['chromium', 'msedge', 'chrome'] as const) {
  test(`Cases dans l’extension compilée ${channel} : scan textuel, champs natifs et absence de doublons`, async () => {
    const context = await launchExtension(channel, resolve('dist'));
    try {
      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      await worker.evaluate(() =>
        chrome.storage.local.set({ preferences: { setupCompleted: true } }),
      );
      const id = worker.url().split('/')[2];
      const page = await context.newPage();
      const errors: string[] = [],
        requests: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      context.on('request', (r) => {
        if (/^https?:/.test(r.url())) requests.push(r.url());
      });
      await context.setOffline(true);
      await page.goto(`chrome-extension://${id}/editor.html`);
      const canvas = createCanvas(595, 842),
        ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 595, 842);
      ctx.fillStyle = '#000';
      ctx.font = '20px Arial';
      for (let i = 0; i < 5; i++)
        ctx.fillText('Bonjour PDF Nexus - B D P Q O 0 8', 45, 40 + i * 35);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) ctx.strokeRect(60, 300 + i * 40, 14, 14);
      const pdf = await PDFDocument.create();
      const image = await pdf.embedPng(canvas.toBuffer('image/png'));
      const p = pdf.addPage([595, 842]);
      p.drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
      pdf.getForm().createCheckBox('Accord').addToPage(p, { x: 60, y: 100, width: 16, height: 16 });
      await page
        .locator('input[type=file]')
        .first()
        .setInputFiles({
          name: 'scan-et-formulaire.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from(await pdf.save()),
        });
      await page.locator('summary').filter({ hasText: 'Remplir et signer' }).click();
      await page.getByRole('button', { name: 'Repérer les cases', exact: true }).click();
      await expect(
        page.getByRole('checkbox', { name: 'Case à cocher : Accord', exact: true }),
      ).toHaveCount(1);
      const printed = page.locator('.page-scroller .printed-checkbox');
      await expect(printed).toHaveCount(3);
      await printed.first().click();
      await expect(printed.first()).toBeChecked();
      await printed.last().click({ button: 'right' });
      await expect(printed).toHaveCount(2);
      await expect(page.locator('.page-scroller [data-annotation-type="checkbox"]')).toHaveCount(1);
      expect(errors).toEqual([]);
      expect(requests).toEqual([]);
      await page.screenshot({ path: `test-results/checkbox-extension-${channel}.png` });
    } finally {
      await context.close();
    }
  });
}
