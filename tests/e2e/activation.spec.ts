import { test, expect } from '@playwright/test';
import { launchExtension } from './browser';
import { resolve } from 'node:path';

for (const channel of ['chromium', 'msedge', 'chrome'] as const) {
  test(`Activation sans préautorisation : onglet dédié et véritable appel Chrome dans ${channel}`, async () => {
    const extension = resolve('dist');
    const context = await launchExtension(channel, extension);
    try {
      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      const id = worker.url().split('/')[2];
      await worker.evaluate(() =>
        chrome.storage.local.set({ preferences: { setupCompleted: true } }),
      );
      expect(
        await worker.evaluate(() =>
          chrome.permissions.contains({ origins: ['https://*/*', 'http://*/*'] }),
        ),
      ).toBe(false);
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${id}/popup.html`);
      const created = context.waitForEvent('page');
      await popup
        .getByRole('button', { name: 'Activer l’ouverture automatique', exact: true })
        .click();
      const activation = await created;
      await expect(activation).toHaveURL(`chrome-extension://${id}/permissions.html`);
      await expect(
        activation.getByRole('heading', { name: 'Ouvrir les liens PDF dans Nexus' }),
      ).toBeVisible();
      // Observe, but do not replace, the real permissions request. The production
      // manifest is unchanged; this exercises the missing grant path.
      await activation.evaluate(() => {
        const request = chrome.permissions.request.bind(chrome.permissions);
        chrome.permissions.request = ((permissions: chrome.permissions.Permissions) => {
          (window as any).requested = { permissions, gesture: navigator.userActivation.isActive };
          return request(permissions);
        }) as typeof chrome.permissions.request;
      });
      await activation.clock.install();
      await activation
        .getByRole('button', { name: 'Activer l’ouverture des PDF web', exact: true })
        .click();
      expect(await activation.evaluate(() => (window as any).requested)).toEqual({
        permissions: {
          permissions: ['webRequest'],
          origins: ['https://*/*', 'http://*/*'],
        },
        gesture: true,
      });
      // Headless cannot accept native consent. With no response, the UI must
      // leave the pending state rather than report a fictitious success.
      await activation.clock.fastForward(61000);
      await expect(activation.getByRole('alert')).toContainText(/n’a pas abouti|refusée/);
      await expect(
        activation.getByRole('button', { name: 'Activer l’ouverture des PDF web', exact: true }),
      ).toBeEnabled();
      expect(
        await worker.evaluate(() =>
          chrome.permissions.contains({ origins: ['https://*/*', 'http://*/*'] }),
        ),
      ).toBe(false);
      if (channel === 'chromium')
        await activation.screenshot({ path: 'test-results/activation-recovery.png' });
    } finally {
      await context.close();
    }
  });
}
