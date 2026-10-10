import { test, expect } from '@playwright/test';
import { launchExtension } from './browser';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';

for (const channel of ['chromium', 'msedge', 'chrome'] as const) {
  test(`Ouverture avec les deux API DNR bloquées dans ${channel}`, async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'nexus-recovery-test-'));
    const extension = join(fixture, 'extension');
    await cp(resolve('dist'), extension, { recursive: true });
    const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
    // Isolate rule installation from the native consent dialog in this disposable profile.
    manifest.permissions.push('webRequest', 'declarativeNetRequestWithHostAccess');
    manifest.host_permissions = ['http://*/*', 'https://*/*'];
    await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
    const bytes = await readFile('tests/fixtures/rouen-diplome.pdf');
    const server = createServer((req, res) => {
      if (req.url === '/site.pdf' || req.url === '/embedded') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          req.url === '/embedded'
            ? '<p>Page normale</p><iframe src="/formulaire.pdf"></iframe>'
            : '<p>Page normale</p>',
        );
        return;
      }
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: '/formulaire.pdf' });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.end(bytes);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as { port: number };
    let context = await launchExtension(channel, extension, join(fixture, 'profile'));
    try {
      let worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      const id = worker.url().split('/')[2];
      await worker.evaluate(async () => {
        await chrome.storage.local.set({
          automaticOpening: false,
          openingError:
            'Chrome ne répond pas à l’installation des règles PDF (updateDynamicRules).',
          preferences: { setupCompleted: true },
        });
        // Both failing operations are simulated; the response observer and navigation remain real.
        (globalThis as any).dnrCalls = 0;
        const blocked = () => {
          (globalThis as any).dnrCalls++;
          return new Promise(() => {});
        };
        chrome.declarativeNetRequest.updateDynamicRules =
          blocked as typeof chrome.declarativeNetRequest.updateDynamicRules;
        chrome.declarativeNetRequest.updateSessionRules =
          blocked as typeof chrome.declarativeNetRequest.updateSessionRules;
      });
      let page = await context.newPage();
      await page.goto(`chrome-extension://${id}/editor.html#settings`);
      await page.evaluate(() => {
        (globalThis as any).dnrCalls = 0;
        const blocked = () => {
          (globalThis as any).dnrCalls++;
          return new Promise(() => {});
        };
        chrome.declarativeNetRequest.updateDynamicRules =
          blocked as typeof chrome.declarativeNetRequest.updateDynamicRules;
        chrome.declarativeNetRequest.updateSessionRules =
          blocked as typeof chrome.declarativeNetRequest.updateSessionRules;
      });
      await page
        .getByRole('button', { name: 'Activer l’ouverture des PDF web', exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: 'Désactiver l’ouverture automatique', exact: true }),
      ).toBeVisible({ timeout: 20000 });
      await expect(page.locator('.opening-control [role="alert"]')).toHaveCount(0);
      expect(await worker.evaluate(() => (globalThis as any).dnrCalls)).toBe(0);
      expect(
        await worker.evaluate(
          async () => (await chrome.storage.local.get('openingRuleMode')).openingRuleMode,
        ),
      ).toBe('web-request');
      await page.goto(`http://127.0.0.1:${port}/demande-diplome-pdf`);
      await expect(page.locator('.page-scroller .textLayer')).toContainText('Demande');
      expect(page.url()).toBe(`chrome-extension://${id}/editor.html`);
      await page.goto(`http://127.0.0.1:${port}/formulaire.pdf`);
      await expect(page.locator('.page-scroller .textLayer')).toContainText('Demande');
      for (const path of ['/site.pdf', '/embedded']) {
        await page.goto(`http://127.0.0.1:${port}${path}`);
        await expect(page.getByText('Page normale')).toBeVisible();
        expect(page.url()).toBe(`http://127.0.0.1:${port}${path}`);
      }
      // A suspended MV3 worker must wake for the PDF response. CDP is scoped
      // to this disposable browser, never the user's ordinary profile.
      const cdp = await context.newCDPSession(page);
      await cdp.send('ServiceWorker.enable');
      await cdp.send('ServiceWorker.stopAllWorkers');
      await cdp.detach();
      await page.goto(`http://127.0.0.1:${port}/redirect`);
      await expect(page.locator('.page-scroller .textLayer')).toContainText('Demande');
      expect(page.url()).toBe(`chrome-extension://${id}/editor.html`);
      // The worker must resume detection after a full browser restart, without DNR rules.
      await context.close();
      context = await launchExtension(channel, extension, join(fixture, 'profile'));
      worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}/demande-diplome-pdf`);
      await expect(page.locator('.page-scroller .textLayer')).toContainText('Demande');
      expect(page.url()).toBe(`chrome-extension://${id}/editor.html`);
      // Disabling the stored opt-in must stop the observer even while permissions remain.
      await worker.evaluate(async () => {
        await chrome.storage.local.set({ automaticOpening: false });
      });
      await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Activer l’ouverture des PDF web', exact: true }),
      ).toBeVisible();
      await page.goto(`http://127.0.0.1:${port}/demande-diplome-pdf`);
      expect(page.url()).toBe(`http://127.0.0.1:${port}/demande-diplome-pdf`);
    } finally {
      await context.close();
      await new Promise<void>((r, reject) => server.close((e) => (e ? reject(e) : r())));
      const within = relative(resolve(tmpdir()), resolve(fixture));
      if (
        within.startsWith('nexus-recovery-test-') &&
        !isAbsolute(within) &&
        !within.includes('..')
      )
        await rm(fixture, { recursive: true, force: true });
    }
  });
}
