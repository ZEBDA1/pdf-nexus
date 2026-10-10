import { chromium, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { zipSync } from 'fflate';

const output = resolve('release/store-screenshots');
await mkdir(output, { recursive: true });
async function sample(language) {
  const en = language === 'en';
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const purple = rgb(0.396, 0.329, 0.91),
    ink = rgb(0.15, 0.16, 0.23),
    muted = rgb(0.45, 0.46, 0.53);
  const p = pdf.addPage([595, 842]);
  const text = (value, x, y, size = 12, font = regular, color = ink) =>
    p.drawText(value, { x, y, size, font, color });
  p.drawRectangle({ x: 0, y: 818, width: 595, height: 24, color: purple });
  text('ATELIER HORIZON', 44, 777, 11, bold, purple);
  text(en ? 'Project plan' : 'Plan de projet', 44, 727, 32, bold);
  text(
    en ? 'A clear plan. A shared direction.' : 'Un plan clair. Une direction commune.',
    44,
    696,
    14,
    regular,
    muted,
  );
  p.drawLine({
    start: { x: 44, y: 674 },
    end: { x: 551, y: 674 },
    thickness: 1,
    color: rgb(0.88, 0.88, 0.93),
  });
  const cards = en
    ? [
        ['BUDGET', '12 500 EUR'],
        ['DURATION', '6 weeks'],
        ['DELIVERABLES', '3 milestones'],
      ]
    : [
        ['BUDGET', '12 500 EUR'],
        ['DURÉE', '6 semaines'],
        ['LIVRABLES', '3 étapes'],
      ];
  cards.forEach(([label, value], i) => {
    const x = 44 + 173 * i;
    p.drawRectangle({ x, y: 574, width: 161, height: 76, color: rgb(0.96, 0.95, 0.99) });
    text(label, x + 14, 627, 9, bold, purple);
    text(value, x + 14, 597, 17, bold);
  });
  text(en ? '01 / Project overview' : '01 / Vue d’ensemble', 44, 535, 16, bold);
  const overview = en
    ? [
        'Create a consistent visual identity and simplify the document workflow.',
        'The project budget is 12 500 EUR.',
        'The final delivery is scheduled for 20 November 2026.',
      ]
    : [
        'Créer une identité cohérente et simplifier le suivi des documents.',
        'Le budget du projet est de 12 500 EUR.',
        'La livraison finale est prévue le 20 novembre 2026.',
      ];
  overview.forEach((line, i) => text(line, 44, 506 - i * 23, 12));
  text(en ? '02 / Key milestones' : '02 / Les étapes clés', 44, 402, 16, bold);
  const rows = en
    ? [
        ['01', 'Discovery', 'Align priorities and requirements'],
        ['02', 'Design', 'Prepare and review the documents'],
        ['03', 'Delivery', 'Validate and share the final files'],
      ]
    : [
        ['01', 'Cadrage', 'Aligner les priorités et les besoins'],
        ['02', 'Conception', 'Préparer et relire les documents'],
        ['03', 'Livraison', 'Valider et partager les fichiers finaux'],
      ];
  rows.forEach(([num, title, line], i) => {
    const y = 365 - i * 38;
    text(num, 44, y, 11, bold, purple);
    text(title, 78, y, 12, bold);
    text(line, 192, y, 11, regular, muted);
  });
  text(en ? '03 / Approval' : '03 / Validation', 44, 227, 16, bold);
  text(en ? 'Reviewed by Camille Martin' : 'Relu par Camille Martin', 44, 200, 12);
  text(en ? 'Signature' : 'Signature', 355, 211, 10, regular, muted);
  p.drawLine({
    start: { x: 355, y: 150 },
    end: { x: 548, y: 150 },
    thickness: 1,
    color: rgb(0.83, 0.83, 0.9),
  });
  text(
    en ? 'Demonstration document - fictional project' : 'Document de démonstration - projet fictif',
    44,
    40,
    9,
    regular,
    muted,
  );
  text('01 / 02', 511, 40, 9, regular, muted);
  const p2 = pdf.addPage([595, 842]);
  p2.drawRectangle({ x: 0, y: 818, width: 595, height: 24, color: purple });
  p2.drawText(en ? 'Delivery checklist' : 'Liste des livrables', {
    x: 44,
    y: 740,
    font: bold,
    size: 28,
    color: ink,
  });
  for (const [i, line] of (en
    ? ['Project brief', 'Review notes', 'Final document pack']
    : ['Note de cadrage', 'Compte rendu de relecture', 'Dossier final']
  ).entries()) {
    p2.drawRectangle({
      x: 44,
      y: 668 - i * 55,
      width: 14,
      height: 14,
      borderColor: purple,
      borderWidth: 1,
    });
    p2.drawText(line, { x: 72, y: 668 - i * 55, font: regular, size: 14, color: ink });
  }
  return Buffer.from(await pdf.save());
}

for (const language of process.argv.slice(2).length ? process.argv.slice(2) : ['fr', 'en']) {
  const en = language === 'en';
  const t = (fr, english) => (en ? english : fr);
  const dir = join(output, language);
  await mkdir(dir, { recursive: true });
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const id = worker.url().split('/')[2];
    await worker.evaluate(
      (language) =>
        chrome.storage.local.set({
          preferences: { setupCompleted: true, language, theme: 'light' },
        }),
      language,
    );
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const capture = async (name) => {
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('.toast')).toHaveCount(0, { timeout: 12000 });
      if (await page.locator('.page-scroller').count()) {
        await expect(
          page.locator('.page-scroller .pdf-page').first().locator('.page-loading'),
        ).toBeHidden({
          timeout: 15000,
        });
      }
      await page.mouse.move(1, 798);
      await page.screenshot({ path: join(dir, name), animations: 'disabled' });
    };
    await page.goto(`chrome-extension://${id}/editor.html`);
    await expect(page.locator('.dashboard')).toBeVisible();
    const bytes = await sample(language);
    const filename = t('Projet-Horizon.pdf', 'Horizon-Project.pdf');
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: filename, mimeType: 'application/pdf', buffer: bytes });
    await expect(page.locator('.page-scroller .textLayer').first()).toContainText(
      t('Plan de projet', 'Project plan'),
    );
    await page
      .getByRole('button', { name: t('Tableau de bord', 'Dashboard'), exact: true })
      .click();
    await expect(page.locator('.recent-row')).toContainText(filename);
    await capture('01-dashboard.png');
    await page.getByRole('button', { name: t('Mon document', 'My document'), exact: true }).click();
    await page.getByLabel('Zoom', { exact: true }).selectOption('75');
    await page
      .locator('.page-scroller .textLayer span')
      .filter({ hasText: t('Plan de projet', 'Project plan') })
      .first()
      .click();
    const edit = page.getByLabel(t('Modifier ce texte sur la page', 'Edit this text on the page'));
    await edit.fill(t('Plan de projet validé', 'Approved project plan'));
    await expect(page.locator('.page-scroller .textLayer').first()).toContainText(
      t('Plan de projet validé', 'Approved project plan'),
    );
    await capture('02-live-text-editing.png');
    await edit.press('Enter');
    await page
      .locator('summary')
      .filter({ hasText: t('Remplir et signer', 'Fill and sign') })
      .click();
    await page.getByRole('button', { name: t('Signer', 'Sign'), exact: true }).click();
    await page
      .getByRole('button', { name: t('Saisir mon nom', 'Type my name'), exact: true })
      .click();
    await page.getByLabel(t('Votre nom', 'Your name'), { exact: true }).fill('Camille Martin');
    await page
      .getByRole('button', { name: t('Placer la signature', 'Place signature'), exact: true })
      .click();
    const layer = page.locator('.page-scroller .annotation-layer').first();
    const box = await layer.boundingBox();
    await layer.click({ position: { x: (355 * box.width) / 595, y: (650 * box.height) / 842 } });
    await expect(layer.locator('image')).toHaveCount(1);
    await page
      .getByRole('button', {
        name: t('Lire et sélectionner le texte', 'Read and select text'),
        exact: true,
      })
      .click();
    await page.getByRole('button', { name: t('Assistant', 'Assistant'), exact: true }).click();
    await page
      .getByRole('textbox', { name: t('Votre question', 'Your question') })
      .fill(t('Quel est le budget du projet ?', 'What is the project budget?'));
    await page.getByRole('button', { name: t('Envoyer', 'Send'), exact: true }).click();
    await expect(page.locator('.chat-message.assistant')).toContainText('12 500 EUR');
    await page.getByRole('button', { name: 'Page', exact: true }).click();
    await page.locator('.page-scroller').evaluate((el) => {
      el.scrollTop = 0;
    });
    await capture('04-document-assistant.png');
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await page.getByLabel('Zoom', { exact: true }).selectOption('75');
    await page.locator('.page-scroller').evaluate((el) => {
      el.scrollTop = 0;
    });
    await capture('03-signature.png');
    await page.getByRole('button', { name: t('Convertisseur', 'Converter'), exact: true }).click();
    await page
      .locator('.converter input[type=file]')
      .setInputFiles({ name: filename, mimeType: 'application/pdf', buffer: bytes });
    await page
      .getByRole('button', { name: t('Convertir le fichier', 'Convert file'), exact: true })
      .click();
    await expect(page.locator('.conversion-results')).toBeVisible({ timeout: 30000 });
    await capture('05-conversion.png');
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(`${language}: 5 captures produites.`);
  } finally {
    await context.close();
  }
}
const readme = `PDF Nexus 1.6.5 — captures localisées\n\n5 captures réelles par langue (fr / en), PNG 1280 × 800.\n01 Accueil · 02 Saisie en direct · 03 Signature · 04 Assistant documentaire · 05 Conversion\n\nDocument de démonstration fictif. Interface de production, sans retouche ni fonctionnalités simulées. L'assistant est utilisé en mode extractif local ; la conversion Word est réellement exécutée.\n\nDans le Chrome Web Store, sélectionnez la langue de la fiche puis importez les cinq PNG du dossier correspondant dans « Captures d'écran localisées ». Ne mélangez pas les langues.\nFormat : https://developer.chrome.com/docs/webstore/images/\nReproduction : node scripts/store-screenshots.mjs (nécessite dist/ et Chromium Playwright).\n`;
await writeFile(join(output, 'LIRE-MOI.txt'), readme);
const entries = { 'LIRE-MOI.txt': Buffer.from(readme) };
for (const language of ['fr', 'en'])
  for (const name of await readdir(join(output, language))) {
    if (name.endsWith('.png'))
      entries[`${language}/${name}`] = new Uint8Array(await readFile(join(output, language, name)));
  }
await writeFile(resolve('release/pdf-nexus-captures-localisees.zip'), zipSync(entries));
console.log('Archive prête : release/pdf-nexus-captures-localisees.zip');
