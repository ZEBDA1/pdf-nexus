import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
});
test('Brouillon durable : ajouts, organisation, annulation, récupération et suppression', async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]).drawText('Original');
  pdf.addPage([595, 842]);
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'brouillon.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await pdf.save()),
    });
  await page.getByRole('button', { name: 'Ajouter du texte', exact: true }).click();
  await page
    .locator('.page-scroller .annotation-layer')
    .first()
    .click({ position: { x: 80, y: 210 } });
  await page.getByLabel('Écrire directement sur le PDF').fill('Texte récupéré\nDeuxième ligne');
  await page.getByLabel('Écrire directement sur le PDF').press('Control+Enter');
  await page.getByRole('button', { name: 'Dupliquer la page courante', exact: true }).click();
  await page.getByRole('button', { name: 'Faire pivoter la page courante', exact: true }).click();
  await expect(page.locator('.autosave-status.saved')).toBeVisible();
  const stored = await page.evaluate(async () => {
    const { listDrafts, loadDraft } = await import('/' + 'src/storage/drafts.ts');
    const list = await listDrafts(),
      draft = await loadDraft(list[0].id);
    return {
      count: list.length,
      pages: draft.state.snapshot.pages.length,
      undo: draft.state.history.past.length,
      noSourcesInHistory: draft.state.history.past.every((entry: object) => !('sources' in entry)),
    };
  });
  expect(stored).toMatchObject({ count: 1, pages: 3, noSourcesInHistory: true });
  expect(stored.undo).toBeGreaterThanOrEqual(3);
  await page.reload();
  await page.getByRole('button', { name: 'Reprendre brouillon.pdf', exact: true }).click();
  await expect(page.locator('.page-scroller [data-annotation-type="text"]')).toHaveCount(2);
  await expect(page.locator('.page-scroller .annotation-layer').first()).toContainText(
    'Texte récupéré',
  );
  await expect(page.locator('.page-scroller .annotation-layer').first()).toContainText(
    'Deuxième ligne',
  );
  const sheet = page.locator('.page-scroller .pdf-page').first();
  await expect.poll(async () => (await sheet.boundingBox())!.width).toBeCloseTo(842, 0);
  await page.getByRole('button', { name: 'Annuler (Ctrl+Z)', exact: true }).click();
  await expect.poll(async () => (await sheet.boundingBox())!.width).toBeCloseTo(595, 0);
  await page.getByRole('button', { name: 'Rétablir (Ctrl+Maj+Z)', exact: true }).click();
  await expect.poll(async () => (await sheet.boundingBox())!.width).toBeCloseTo(842, 0);
  await expect(page.locator('.autosave-status.saved')).toBeVisible();
  await page.getByRole('button', { name: 'Tableau de bord', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'Supprimer le brouillon brouillon.pdf', exact: true })
    .click();
  await expect(page.locator('.draft-card')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.draft-card')).toHaveCount(0);
});

test('Stockage : quotas explicites, absence de secrets et effacement prioritaire sur les sauvegardes', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { saveDraft, listDrafts, clearDrafts, loadDraft } = await import(
      '/' + 'src/storage/drafts.ts'
    );
    const { History } = await import('/' + 'src/pdf/history.ts');
    const workspace = {
      name: 'test.pdf',
      sources: [{ name: 'source.pdf', bytes: new Uint8Array([37, 80, 68, 70, 45]) }],
      pages: [{ id: 'page', source: 0, index: 0, rotation: 0, annotations: [] }],
      watermark: '',
      numbering: false,
      cleanMetadata: false,
      encrypted: false,
      apiKey: 'ne-pas-conserver',
      password: 'secret-protege',
    };
    const history = new History();
    history.push(workspace);
    const nav = { current: 0, zoom: 1, documentId: 'document' };
    for (let i = 0; i < 5; i++) await saveDraft('d' + i, workspace, history, nav, 'source');
    let quota = '',
      protectedError = '';
    try {
      await saveDraft('six', workspace, history, nav, 'source');
    } catch (error) {
      quota = (error as Error).message;
    }
    try {
      await saveDraft('locked', { ...workspace, encrypted: true }, history, nav, 'source');
    } catch (error) {
      protectedError = (error as Error).message;
    }
    const saved = await loadDraft('d0'),
      count = (await listDrafts()).length;
    const noSecrets =
      !JSON.stringify(saved).includes('ne-pas-conserver') &&
      !JSON.stringify(saved).includes('secret-protege');
    for (let i = 0; i < 30; i++) history.push(workspace);
    for (let i = 0; i < 15; i++) history.undo(workspace);
    await saveDraft('d0', workspace, history, nav, 'source');
    const deep = await loadDraft('d0');
    const pending = saveDraft('d0', workspace, history, nav, 'source');
    await Promise.allSettled([pending, clearDrafts()]);
    return {
      count,
      quota,
      noSecrets,
      protectedError,
      historyCount: deep.state.history.past.length + deep.state.history.future.length,
      after: (await listDrafts()).length,
    };
  });
  expect(result.count).toBe(5);
  expect(result.quota).toContain('plein');
  expect(result.noSecrets).toBe(true);
  expect(result.protectedError).toContain('protégés');
  expect(result.after).toBe(0);
  expect(result.historyCount).toBe(20);
});

test('Désactivation et effacement : aucun brouillon caché après suppression des données', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
  await page
    .getByRole('checkbox', {
      name: 'Sauvegarder automatiquement les brouillons sur cet appareil',
      exact: true,
    })
    .uncheck();
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'effacement.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await pdf.save()),
    });
  await page.getByRole('button', { name: 'Ajouter du texte', exact: true }).click();
  await page
    .locator('.page-scroller .annotation-layer')
    .first()
    .click({ position: { x: 80, y: 210 } });
  await page.getByLabel('Écrire directement sur le PDF').fill('Ne pas sauvegarder');
  await page.getByLabel('Écrire directement sur le PDF').press('Control+Enter');
  await expect(page.locator('.autosave-status')).toContainText('désactivée');
  expect(
    await page.evaluate(
      async () => (await (await import('/' + 'src/storage/drafts.ts')).listDrafts()).length,
    ),
  ).toBe(0);
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
  await page
    .getByRole('checkbox', {
      name: 'Sauvegarder automatiquement les brouillons sur cet appareil',
      exact: true,
    })
    .check();
  await page.getByRole('button', { name: 'Mon document', exact: true }).click();
  await expect(page.locator('.autosave-status.saved')).toBeVisible();
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Effacer les données locales', exact: true }).click();
  await expect(page.locator('.draft-card')).toHaveCount(0);
  const counts = await page.evaluate(async () => {
    const { db } = await import('/' + 'src/storage/index.ts');
    const d = await db();
    try {
      return await Promise.all(
        ['drafts', 'draftStates', 'draftSources', 'recent', 'chat'].map((store) => d.count(store)),
      );
    } finally {
      d.close();
    }
  });
  expect(counts).toEqual([0, 0, 0, 0, 0]);
});
