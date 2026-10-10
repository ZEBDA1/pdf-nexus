import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { zipSync } from 'fflate';

// Promotional layouts use the existing brand and unaltered, real UI screenshots.
const output = resolve('release/store-promo');
const font = (await readFile('public/fonts/NotoSans-Regular.ttf')).toString('base64');
const logo = (await readFile('release/branding/logo-pdf-nexus.png')).toString('base64');
const archive = {};
const browser = await chromium.launch({ headless: true });
try {
  for (const language of ['fr', 'en']) {
    const fr = language === 'fr';
    const screenshot = (
      await readFile(`release/store-screenshots/${language}/02-live-text-editing.png`)
    ).toString('base64');
    await mkdir(join(output, language), { recursive: true });
    for (const [name, width, height] of [
      ['petite-promotion-440x280', 440, 280],
      ['banniere-promotion-1400x560', 1400, 560],
    ]) {
      const small = width === 440;
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      await page.setContent(`<!doctype html><html lang="${language}"><meta charset="utf-8"><style>
        @font-face{font-family:Nexus;src:url(data:font/ttf;base64,${font})}
        *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}
        body{font-family:Nexus,Arial,sans-serif;color:#24213e;background:#f7f6ff}
        .orb{position:absolute;width:720px;height:720px;border-radius:50%;right:-120px;top:-140px;background:radial-gradient(circle at 40% 35%,#b8aaff,#7661ed 65%,#6554e8)}
        .ring{position:absolute;width:830px;height:830px;border:1px solid #ffffff5c;border-radius:50%;right:-190px;top:-195px}
        .copy{position:absolute;left:48px;top:42px;width:490px}
        .brand{display:flex;align-items:center;gap:0;font-size:31px;letter-spacing:-1px;white-space:nowrap}
        .brand img{width:78px;height:78px;margin-left:-17px;margin-right:-5px}
        .brand strong{font-weight:900}.brand span{font-weight:400}
        h1{font-size:55px;line-height:1.12;letter-spacing:-2.4px;margin:41px 0 20px;font-weight:900}
        h1 em{font-style:normal;color:#6554e8}
        .description{font-size:18px;line-height:1.65;margin:0;color:#656178;max-width:410px}
        .features{display:flex;gap:9px;margin-top:27px}
        .features span{font-size:13px;color:#5747bc;background:#eeebff;border:1px solid #ddd7ff;padding:8px 13px;border-radius:9px}
        .privacy{font-size:12px;color:#706b82;margin-top:28px;display:flex;align-items:center;gap:8px}
        .privacy:before{content:'';width:6px;height:6px;border-radius:50%;background:#43a587}
        .screen{position:absolute;right:27px;top:29px;width:800px;height:502px;border:1px solid #dfd9fa;border-radius:15px;overflow:hidden;box-shadow:0 24px 55px #33237630;background:white}
        .screen img{display:block;width:100%;height:100%;object-fit:contain}
        ${
          small
            ? `
        .orb{width:340px;height:340px;right:-230px;top:-80px;opacity:.45}
        .ring{width:370px;height:370px;right:-245px;top:-95px;border-color:#ffffffa0}
        .copy{left:28px;top:11px;width:388px}
        .brand{font-size:23px;letter-spacing:-.6px}
        .brand img{width:61px;height:61px;margin-left:-15px;margin-right:-4px}
        h1{font-size:37px;line-height:1.12;letter-spacing:-1.4px;margin:12px 0 18px}
        .features{gap:8px;margin-top:0}.features span{font-size:12px;padding:6px 11px;border-radius:7px}
        .privacy{font-size:10px;margin-top:17px}
        `
            : ''
        }
      </style><body><div class="orb"></div><div class="ring"></div>
      <div class="copy"><div class="brand"><img src="data:image/png;base64,${logo}" alt=""><span>PDF <strong>Nexus</strong></span></div>
      <h1>${fr ? 'Vos PDF.' : 'Your PDFs.'}<br><em>${fr ? 'À votre façon.' : 'Your way.'}</em></h1>
      ${small ? '' : `<p class="description">${fr ? 'L’espace pour modifier, annoter et convertir vos PDF dans votre navigateur.' : 'Your space to edit, annotate and convert PDFs in your browser.'}</p>`}
      <div class="features">${(fr ? ['Modifier', 'Annoter', 'Convertir'] : ['Edit', 'Annotate', 'Convert']).map((v) => `<span>${v}</span>`).join('')}</div>
      <div class="privacy">${fr ? 'Gratuit · Sans publicité · Local par défaut' : 'Free · No ads · Local by default'}</div></div>
      ${small ? '' : `<div class="screen"><img src="data:image/png;base64,${screenshot}" alt="PDF Nexus"></div>`}
      </body></html>`);
      await page.evaluate(() => document.fonts.ready);
      const bytes = await page.screenshot({ type: 'png', omitBackground: false });
      // PNG IHDR: 8-bit RGB (color type 2) is 24-bit, with no alpha channel.
      if (
        bytes.readUInt32BE(16) !== width ||
        bytes.readUInt32BE(20) !== height ||
        bytes[24] !== 8 ||
        bytes[25] !== 2
      ) {
        throw new Error(`Unexpected PNG format: ${language}/${name}`);
      }
      await writeFile(join(output, language, `${name}.png`), bytes);
      archive[`${language}/${name}.png`] = bytes;
      await page.close();
      console.log(`${language}/${name}.png — RGB 24 bits, sans alpha`);
    }
  }
} finally {
  await browser.close();
}
const readme = `PDF Nexus — visuels promotionnels\n\nfr : français / en : anglais\n\npetite-promotion-440x280.png : Petite image promotionnelle\nbanniere-promotion-1400x560.png : Image promotionnelle en haut de la page\n\nTous les fichiers sont des PNG RGB 24 bits, sans canal alpha.\nImportez les PNG de la langue correspondante dans la fiche du store.\nLe ZIP sert au téléchargement uniquement : décompressez-le avant l'import.\n\nLogo Nexus existant et capture réelle de l'éditeur sur un document fictif.\nReproduction : node scripts/store-promo.mjs\n`;
await writeFile(join(output, 'LIRE-MOI.txt'), readme);
archive['LIRE-MOI.txt'] = Buffer.from(readme);
await writeFile(resolve('release/pdf-nexus-visuels-promotionnels.zip'), zipSync(archive));
