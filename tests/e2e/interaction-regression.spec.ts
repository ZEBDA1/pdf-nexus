import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('Formulaire réel : sélection partielle, saisie sur page, zoom rapide et déplacement sans retour', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem('nexus-preferences', JSON.stringify({ setupCompleted: true })),
  );
  await page.goto('/editor.html');
  await page.locator('input[type=file]').first().setInputFiles('tests/fixtures/rouen-diplome.pdf');
  const layer = page.locator('.page-scroller .textLayer');
  await expect(layer).toContainText('Demande');
  const span = layer
    .locator('span')
    .filter({ hasText: /Demande/ })
    .first();
  const original = (await span.textContent())!;
  // Real mouse selection of a word, without activating an editing button.
  const rect = await span.evaluate((el) => {
    const range = document.createRange();
    range.setStart(el.firstChild!, 0);
    range.setEnd(el.firstChild!, 7);
    const r = range.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  await page.mouse.move(rect.x + 1, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width - 1, rect.y + rect.height / 2, { steps: 10 });
  await page.mouse.up();
  const input = page.getByLabel('Modifier ce texte sur la page');
  await expect(input).toBeFocused();
  const selection = await input.evaluate((el: HTMLInputElement) => ({
    start: el.selectionStart!,
    end: el.selectionEnd!,
  }));
  expect(selection.end - selection.start).toBeGreaterThan(0);
  expect(selection.end - selection.start).toBeLessThan(original.length);
  await page.keyboard.insertText('Demande test');
  const changed =
    original.slice(0, selection.start) + 'Demande test' + original.slice(selection.end);
  await expect(input).toHaveValue(changed);
  await expect(input).toBeFocused();
  await input.press('Enter');
  // Reopening preserves the changed value and the source geometry.
  const edited = page
    .locator('.page-scroller .annotation-layer text')
    .filter({ hasText: 'Demande test' });
  const native = layer.locator('span').filter({ hasText: 'Demande test' });
  await expect(edited.or(native)).toBeVisible();
  await edited.or(native).click();
  await expect(input).toHaveValue(changed);
  await input.press('Enter');
  const before = await page.locator('.app-sidebar').boundingBox();
  await page.keyboard.press('Control+0');
  await page.locator('.page-scroller').evaluate((el) => {
    for (let i = 0; i < 12; i++)
      el.dispatchEvent(
        new WheelEvent('wheel', {
          ctrlKey: true,
          deltaY: -8,
          bubbles: true,
          cancelable: true,
          clientX: 700,
          clientY: 450,
        }),
      );
  });
  await expect
    .poll(async () => Number(await page.getByLabel('Zoom', { exact: true }).inputValue()))
    .toBeGreaterThan(130);
  expect((await page.locator('.app-sidebar').boundingBox())!.width).toBe(before!.width);
  await page.getByLabel('Zoom', { exact: true }).selectOption('200');
  await page.getByRole('button', { name: 'Déplacer le document', exact: true }).click();
  const scroller = page.locator('.page-scroller');
  await scroller.evaluate((el) => el.scrollTo({ left: 0, top: 200, behavior: 'instant' }));
  const box = (await scroller.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2 - 140, { steps: 10 });
  await page.mouse.up();
  const scroll = await scroller.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
  expect(scroll.y).toBeGreaterThan(320);
  expect(scroll.x).toBeGreaterThan(20);
  // Sample across asynchronous canvas completion. A persistent anchor used to pull it back.
  const samples = await scroller.evaluate(async (el) => {
    const values: number[] = [];
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      values.push(el.scrollTop);
    }
    return values;
  });
  expect(Math.max(...samples) - Math.min(...samples)).toBeLessThan(2);
  await page.keyboard.press('Control+0');
  await page.getByRole('button', { name: 'Modifier le texte existant', exact: true }).click();
  await page.getByRole('button', { name: 'Largeur', exact: true }).click();
  await expect(page.locator('.page-scroller .page-loading')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/rouen-nexus.png' });
  const exported = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter le PDF', exact: true }).click();
  const bytes = await readFile((await (await exported).path())!);
  const text = await page.evaluate(async (data) => {
    const { loadPdf, extractAll } = await import('/' + 'src/pdf/reader.ts');
    const pdf = await loadPdf(new Uint8Array(data));
    try {
      return (await extractAll(pdf))[0].text;
    } finally {
      await pdf.loadingTask.destroy();
    }
  }, Array.from(bytes));
  expect(text).toContain('Demande test');
  expect(errors).toEqual([]);
});
