import { test, expect } from '@playwright/test';
import { launchExtension } from './browser';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { PDFDocument } from 'pdf-lib';

for (const channel of ['chromium', 'msedge', 'chrome'] as const) {
  test(`Ouverture automatique d’un PDF HTTP dans ${channel}`, async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'nexus-permissions-test-'));
    const extension = join(fixture, 'extension');
    await cp(resolve('dist'), extension, { recursive: true });
    const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
    // Headless cannot operate the browser's optional-permission prompt. Pregrant only
    // in this disposable manifest; production has only storage and activeTab.
    manifest.permissions.push('webRequest', 'downloads');
    manifest.host_permissions = ['http://*/*', 'https://*/*', 'file:///*'];
    await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText('Document web ouvert dans Nexus');
    const bytes = await pdf.save();
    const rouen = await readFile('tests/fixtures/rouen-diplome.pdf');
    const server = createServer((req, res) => {
      if (req.url === '/demande-envoi-diplome-2025-2026_1768315513331-pdf') {
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline;filename="demande.pdf"',
        });
        res.end(rouen);
        return;
      }
      if (req.url === '/site') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<a href="/download" download="copie.pdf">Télécharger</a>');
        return;
      }
      if (req.url === '/download') {
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="copie.pdf"',
        });
        res.end(bytes);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.end(bytes);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const address = server.address() as { port: number };
    let context = await launchExtension(channel, extension, join(fixture, 'profile'));
    try {
      let worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      const id = worker.url().split('/')[2];
      await worker.evaluate(() =>
        chrome.storage.local.set({ preferences: { setupCompleted: true } }),
      );
      const page = await context.newPage();
      await page.goto(`chrome-extension://${id}/editor.html#settings`);
      await page
        .getByRole('button', { name: 'Activer l’ouverture des PDF web', exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: 'Désactiver l’ouverture automatique', exact: true }),
      ).toBeVisible();
      await page.reload();
      await page
        .getByRole('button', { name: 'Ouvrir les PDF locaux dans Nexus', exact: true })
        .click();
      await expect(
        page.getByText('Activé pour les fichiers locaux.', { exact: true }),
      ).toBeVisible();
      const localPath = join(fixture, 'document local.pdf');
      await writeFile(localPath, bytes);
      const local = await context.newPage();
      await local.goto(pathToFileURL(localPath).href).catch(() => {});
      await expect(local.locator('.page-scroller .textLayer')).toContainText(
        'Document web ouvert dans Nexus',
      );
      expect(local.url()).toBe(`chrome-extension://${id}/editor.html`);
      await local.close();
      await page
        .getByRole('button', { name: 'Ouvrir aussi les PDF téléchargés', exact: true })
        .click();
      await expect(
        page.getByRole('button', {
          name: 'Désactiver l’ouverture des téléchargements',
          exact: true,
        }),
      ).toBeVisible();
      await page.goto(`http://127.0.0.1:${address.port}/rapport.pdf?download=1`);
      await expect(page.locator('.document-title')).toContainText('rapport.pdf');
      await expect(page.locator('.page-scroller .textLayer')).toContainText(
        'Document web ouvert dans Nexus',
      );
      expect(page.url()).toBe(`chrome-extension://${id}/editor.html`);
      const width = await page
        .locator('.app-sidebar')
        .evaluate((el) => el.getBoundingClientRect().width);
      await page.evaluate(async () => {
        const tab = await chrome.tabs.getCurrent();
        await chrome.tabs.setZoom(tab!.id!, 1.5);
      });
      await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('150');
      expect(
        await page.locator('.app-sidebar').evaluate((el) => el.getBoundingClientRect().width),
      ).toBe(width);
      // Native wheel gestures and toolbar changes must not feed back through tabs.setZoom.
      await page.getByLabel('Zoom', { exact: true }).selectOption('100');
      await page.locator('.page-scroller').hover();
      await page.keyboard.down('Control');
      for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -12);
      await page.keyboard.up('Control');
      const zoomAfter = Number(await page.getByLabel('Zoom', { exact: true }).inputValue());
      expect(zoomAfter).toBeGreaterThan(100);
      const samples = await page.evaluate(async () => {
        const values: string[] = [];
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 30));
          values.push(
            (document.querySelector('select[aria-label="Zoom"]') as HTMLSelectElement).value,
          );
        }
        return values;
      });
      expect(new Set(samples).size).toBe(1);
      expect(
        await page.locator('.app-sidebar').evaluate((el) => el.getBoundingClientRect().width),
      ).toBe(width);
      await page.goto(`http://127.0.0.1:${address.port}/sans-extension`);
      await expect(page.locator('.document-title')).toContainText('sans-extension.pdf');
      await expect(page.locator('.page-scroller .textLayer')).toContainText(
        'Document web ouvert dans Nexus',
      );
      const site = await context.newPage();
      await site.goto(`http://127.0.0.1:${address.port}/site`);
      const before = new Set(context.pages());
      await site.getByText('Télécharger').click();
      const newEditor = () =>
        context
          .pages()
          .find(
            (p) => !before.has(p) && p.url().startsWith(`chrome-extension://${id}/editor.html`),
          );
      await expect.poll(() => !!newEditor(), { timeout: 15000 }).toBe(true);
      const downloaded = newEditor()!;
      await downloaded.waitForLoadState();
      // File-scheme access is controlled by the browser, separately from host permission.
      // Either the actual local PDF opens or the explicit file-access recovery is shown.
      const allowed = await worker.evaluate(() => chrome.extension.isAllowedFileSchemeAccess());
      expect(allowed).toBe(true);
      if (allowed) {
        await expect(downloaded.locator('.page-scroller .textLayer')).toContainText(
          'Document web ouvert dans Nexus',
        );
        const exported = downloaded.waitForEvent('download');
        await downloaded.getByRole('button', { name: 'Exporter le PDF', exact: true }).click();
        await (await exported).path();
        await expect
          .poll(() =>
            worker.evaluate(
              async () =>
                (await chrome.downloads.search({})).filter((d) => d.state === 'complete').length,
            ),
          )
          .toBe(2);
        const handled = await worker.evaluate(() => chrome.storage.session.get('openedDownloads'));
        expect((handled.openedDownloads as number[]).length).toBe(1);
      } else {
        await expect(downloaded.locator('.opening-error')).toContainText(
          'Autoriser l’accès aux URL de fichiers',
        );
      }
      await context.close();
      context = await launchExtension(channel, extension, join(fixture, 'profile'));
      worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      const restored = await context.newPage();
      await restored.goto(
        `http://127.0.0.1:${address.port}/demande-envoi-diplome-2025-2026_1768315513331-pdf`,
      );
      await expect(restored.locator('.page-scroller .textLayer')).toContainText('Demande');
      expect(restored.url()).toBe(`chrome-extension://${id}/editor.html`);
      await restored
        .locator('.page-scroller .textLayer span')
        .filter({ hasText: /Demande/ })
        .first()
        .click();
      await expect(restored.getByLabel('Modifier ce texte sur la page')).toBeFocused();
      await restored.getByLabel('Modifier ce texte sur la page').press('Enter');
      // A PDF already displayed by the browser can be taken over explicitly from the popup.
      await worker.evaluate(() => chrome.storage.local.set({ automaticOpening: false }));
      const builtin = await context.newPage();
      await builtin.goto(
        `http://127.0.0.1:${address.port}/demande-envoi-diplome-2025-2026_1768315513331-pdf`,
      );
      const popup = await context.newPage();
      await builtin.bringToFront();
      await popup.goto(`chrome-extension://${id}/popup.html`);
      await popup
        .getByRole('button', { name: 'Ouvrir le PDF de cet onglet dans Nexus', exact: true })
        .click();
      await expect(builtin.locator('.page-scroller .textLayer')).toContainText('Demande');
      expect(builtin.url()).toBe(`chrome-extension://${id}/editor.html`);
    } finally {
      await context.close();
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      // Delete only the verified task-owned temporary directory.
      const within = relative(resolve(tmpdir()), resolve(fixture));
      if (
        within.startsWith('nexus-permissions-test-') &&
        !isAbsolute(within) &&
        !within.includes('..')
      )
        await rm(fixture, { recursive: true, force: true });
    }
  });
}
