import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

test('Anglais : convertisseur, erreurs dynamiques, worker et retour au français', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'nexus-preferences',
      JSON.stringify({ setupCompleted: true, language: 'en' }),
    ),
  );
  await page.goto('/editor.html#convert');
  await expect(page).toHaveTitle('PDF Nexus — Your PDF workspace');
  await expect(page.locator('.app-topbar strong')).toHaveText('Converter');
  await expect(page.locator('.converter .notice')).toContainText('Text is reconstructed');
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('Original content remains unchanged.', { x: 40, y: 700 });
  const bytes = Array.from(await pdf.save());
  const input = page.locator('.converter input[type=file]');
  await input.setInputFiles({
    name: 'document.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(bytes),
  });
  await page.getByPlaceholder('All pages (e.g. 1, 3-5)').fill('9');
  await page.getByRole('button', { name: 'Convert file', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Pages must be between 1 and 1.');
  await input.setInputFiles({
    name: 'refused.exe',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from([1]),
  });
  await expect(page.locator('.toast')).toContainText(
    'Unsupported format. Supported formats: pdf, docx, txt, png, jpg, jpeg.',
  );
  const workerMessage = await page.evaluate(async (data) => {
    const { processJob, getFont } = await import('/' + 'src/workers/client.ts');
    const { loadPdf, extractAll } = await import('/' + 'src/pdf/reader.ts');
    const source = { name: 'document.pdf', bytes: new Uint8Array(data) };
    const doc = await loadPdf(source.bytes);
    try {
      await processJob({
        kind: 'convert',
        source,
        format: 'xlsx',
        text: await extractAll(doc),
        font: await getFont(),
      });
      return 'unexpected success';
    } catch (e) {
      return (e as Error).message;
    } finally {
      await doc.loadingTask.destroy();
    }
  }, bytes);
  expect(workerMessage).toBe('No regular table detected (at least 3 aligned rows and 2 columns).');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('.app-topbar strong')).toHaveText('Settings');
  await page.getByLabel('Language', { exact: true }).selectOption('fr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('.app-topbar strong')).toHaveText('Paramètres');
  await expect(page).toHaveTitle('PDF Nexus — Votre espace PDF');
});

test('Ouverture locale : état réel, autorisation retirée et accès fichier manquant', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const listeners = new Set<() => void>();
    const events = {
      addListener: (f: () => void) => listeners.add(f),
      removeListener: (f: () => void) => listeners.delete(f),
    };
    const state = { allowed: true, granted: false, wanted: true };
    (window as any).openingTest = state;
    const browser = {
      runtime: { id: 'test-nexus' },
      storage: {
        local: {
          get: async (key: string) => ({
            [key]:
              key === 'preferences'
                ? { setupCompleted: true, language: 'en' }
                : key === 'automaticFiles'
                  ? state.wanted
                  : false,
          }),
          set: async (s: any) => {
            if ('automaticFiles' in s) state.wanted = s.automaticFiles;
            listeners.forEach((f) => f());
          },
        },
        session: { get: async () => ({}) },
        onChanged: events,
      },
      permissions: {
        contains: async (p: any) => (p.permissions?.includes('webRequest') ? false : state.granted),
        request: async () => {
          state.granted = true;
          return true;
        },
        remove: async () => true,
        onAdded: events,
        onRemoved: events,
      },
      extension: { isAllowedFileSchemeAccess: async () => state.allowed },
    };
    Object.defineProperty(window, 'chrome', { value: browser, configurable: true });
  });
  await page.goto('/editor.html#settings');
  const local = page
    .locator('.local-opening-card')
    .filter({ has: page.getByRole('heading', { name: 'Local PDFs in the browser', exact: true }) });
  await expect(local.getByRole('status')).toContainText('Permission has been removed');
  await local.getByRole('button', { name: 'Restore permission', exact: true }).click();
  await expect(local.getByRole('status')).toHaveText('Enabled for local files.');
  await page.evaluate(() => {
    (window as any).openingTest.allowed = false;
    window.dispatchEvent(new Event('focus'));
  });
  await expect(local.getByRole('status')).toHaveText(
    'Configured · waiting for access to file URLs.',
  );
  await expect(
    local.getByRole('button', { name: 'Open extension details', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/opening-permission-guide.png' });
});
