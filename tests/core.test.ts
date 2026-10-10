import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFArray, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { Document, Paragraph, Packer } from 'docx';
import { unzipSync, zipSync } from 'fflate';
import ExcelJS from 'exceljs';
import { exportWorkspace, textToPdf, imagesToPdf, rasterToPdf } from '../src/pdf/operations';
import { convertText } from '../src/converters/text';
import { detectTable } from '../src/converters/tables';
import { History } from '../src/pdf/history';
import { parsePages, validateBytes, safeUrl, escapeHtml } from '../src/utils/files';
import { extractiveAnswer, validateEndpoint, relevantPages } from '../src/ai';
import type { Annotation, PageText, Workspace } from '../src/types';
const font = new Uint8Array(await readFile('public/fonts/NotoSans-Regular.ttf'));
async function fixture() {
  const doc = await PDFDocument.create(),
    f = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i++) {
    const page = doc.addPage([400 + i * 10, 600]);
    page.drawText(`Page ${i + 1} - Nexus`, { x: 30, y: 500, font: f, size: 14 });
  }
  doc.setAuthor('Identite sensible');
  doc.setTitle('Document de test');
  doc.addJavaScript('test', 'app.alert("interdit")');
  const bytes = await doc.save();
  return { name: 'test.pdf', bytes };
}
const tablePage: PageText = {
  page: 1,
  text: 'Produit Prix\nAlpha 10\nBeta 20',
  items: [
    ['Produit', 'Prix'],
    ['Alpha', '10'],
    ['Beta', '20'],
  ].flatMap((row, i) =>
    row.map((text, j) => ({ text, x: 30 + j * 180, y: 500 - i * 25, width: 50, height: 12 })),
  ),
};
const ws = async (): Promise<Workspace> => ({
  name: 'test.pdf',
  sources: [await fixture()],
  pages: [0, 1, 2].map((index) => ({
    id: 'p' + index,
    index,
    source: 0,
    rotation: 0,
    annotations: [],
  })),
  watermark: '',
  numbering: false,
  cleanMetadata: false,
  encrypted: false,
});
describe('Validation des entrées et confidentialité', () => {
  it('valide la signature, taille, format et plages', () => {
    expect(parsePages('1, 3-5, 3', 6)).toEqual([0, 2, 3, 4]);
    expect(parsePages('', 2)).toEqual([0, 1]);
    for (const value of ['0', '4-2', '1;2', '7', '1-9'])
      expect(() => parsePages(value, 6)).toThrow();
    expect(() => validateBytes('f.pdf', new TextEncoder().encode('html'))).toThrow();
    expect(() => validateBytes('a.exe', new Uint8Array([1]))).toThrow();
    expect(() => validateBytes('a.pdf', new Uint8Array())).toThrow();
    expect(() => validateBytes('a.png', new Uint8Array([1, 2]))).toThrow();
  });
  it('refuse les liens exécutables et endpoints non sûrs', () => {
    expect(safeUrl('https://example.com/a')).toContain('https');
    expect(() => safeUrl('javascript:alert(1)')).toThrow();
    expect(() => validateEndpoint('http://example.com/v1')).toThrow();
    expect(() => validateEndpoint('https://secret:pwd@example.com/v1')).toThrow();
    expect(() => validateEndpoint('https://example.com/?key=secret')).toThrow();
    expect(validateEndpoint('http://127.0.0.1:11434/v1/chat/completions').hostname).toBe(
      '127.0.0.1',
    );
    expect(escapeHtml('<script>"&')).toBe('&lt;script&gt;&quot;&amp;');
  });
  it('vérifie le manifest MV3 et le moindre privilège', async () => {
    const m = JSON.parse(await readFile('public/manifest.json', 'utf8'));
    expect(m.manifest_version).toBe(3);
    expect(m.permissions).toEqual(['storage', 'activeTab']);
    expect(m.host_permissions).toBeUndefined();
    expect(m.content_scripts).toBeUndefined();
    expect(m.content_security_policy.extension_pages).not.toContain("'unsafe-eval'");
  });
});
describe('Traitements PDF réels', () => {
  it('fusionne, extrait, duplique, réordonne et pivote', async () => {
    const w = await ws();
    w.sources.push(await fixture());
    w.pages = [
      { ...w.pages[2], rotation: 90 },
      { ...w.pages[0], id: 'copie' },
      { ...w.pages[0], id: 'copie2' },
      { ...w.pages[1], source: 1 },
    ];
    const out = await PDFDocument.load(await exportWorkspace(w, font));
    expect(out.getPageCount()).toBe(4);
    expect(out.getPage(0).getWidth()).toBe(420);
    expect(out.getPage(0).getRotation().angle).toBe(90);
    expect(out.getPage(1).getWidth()).toBe(400);
    expect(out.catalog.has(PDFName.of('Names'))).toBe(false);
  });
  it('exporte toutes les familles d’annotation et un lien sûr', async () => {
    const w = await ws();
    const types: Annotation['type'][] = [
      'text',
      'note',
      'stamp',
      'highlight',
      'underline',
      'strike',
      'pen',
      'rect',
      'ellipse',
      'line',
      'arrow',
      'link',
      'image',
    ];
    w.pages[0].annotations = await Promise.all(
      types.map(async (type, i) => ({
        id: type,
        type,
        x: 20,
        y: 30 + i * 25,
        width: 180,
        height: 23,
        color: '#6554e8',
        size: 12,
        text: 'Été français',
        url: 'https://example.com/',
        points: [
          { x: 10, y: 20 },
          { x: 80, y: 40 },
        ],
        ...(type === 'image'
          ? {
              image: new Uint8Array(await readFile('public/icons/128.png')),
              imageType: 'png' as const,
            }
          : {}),
      })),
    );
    w.watermark = 'CONFIDENTIEL';
    w.numbering = true;
    const bytes = await exportWorkspace(w, font);
    const out = await PDFDocument.load(bytes);
    expect(bytes.length).toBeGreaterThan(2000);
    const annots = out.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    expect(annots.size()).toBe(1);
    expect(out.getPageCount()).toBe(3);
  });
  it('retire réellement les champs Info/XMP du nouvel export', async () => {
    const w = await ws();
    w.cleanMetadata = true;
    const out = await PDFDocument.load(await exportWorkspace(w, font), { updateMetadata: false });
    expect(out.context.trailerInfo.Info).toBeUndefined();
    expect(out.catalog.has(PDFName.of('Metadata'))).toBe(false);
    expect(out.getAuthor()).toBeUndefined();
  });
  it('refuse un PDF chiffré et un document sans pages', async () => {
    const w = await ws();
    w.encrypted = true;
    await expect(exportWorkspace(w, font)).rejects.toThrow('chiffrés');
    w.encrypted = false;
    w.pages = [];
    await expect(exportWorkspace(w, font)).rejects.toThrow('page');
  });
  it('crée des PDF Unicode, paginés et des images en PDF', async () => {
    const bytes = await textToPdf('Été à Paris — résumé français.\n'.repeat(150), font);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
    await expect(textToPdf('', font)).rejects.toThrow();
    const image = {
      name: 'logo.png',
      bytes: new Uint8Array(await readFile('public/icons/128.png')),
    };
    const images = await PDFDocument.load(await imagesToPdf([image, image]));
    expect(images.getPageCount()).toBe(2);
    const raster = await PDFDocument.load(
      await rasterToPdf(
        [
          {
            bytes: image.bytes,
            width: 400,
            height: 600,
            format: 'png',
            words: [{ text: 'Reconnu', x: 20, y: 20, width: 60, height: 12 }],
          },
        ],
        font,
      ),
    );
    expect(raster.getPage(0).getWidth()).toBe(400);
  });
  it('annule et rétablit avec des snapshots indépendants', async () => {
    const w = await ws();
    const history = new History();
    history.push(w);
    w.pages.pop();
    const old = history.undo(w)!;
    expect(old.pages).toHaveLength(3);
    expect(history.redo(old)?.pages).toHaveLength(2);
    old.pages[0].annotations.push({
      id: 'a',
      type: 'rect',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      size: 1,
      color: '#000000',
    });
    expect(w.pages[0].annotations).toHaveLength(0);
  });
});
describe('Convertisseurs et analyse locale', () => {
  it('génère des TXT, HTML et véritables archives DOCX/XLSX', async () => {
    const source = await fixture();
    const [txt] = await convertText(source, 'txt', [tablePage], font);
    expect(new TextDecoder().decode(txt.bytes)).toContain('Alpha');
    const [html] = await convertText(
      source,
      'html',
      [{ ...tablePage, text: '<script>alert(1)</script>' }],
      font,
    );
    expect(new TextDecoder().decode(html.bytes)).toContain('&lt;script&gt;');
    const [docx] = await convertText(source, 'docx', [tablePage], font);
    const entries = unzipSync(docx.bytes);
    expect(new TextDecoder().decode(entries['word/document.xml'])).toContain('Alpha');
    const [xlsx] = await convertText(source, 'xlsx', [tablePage], font);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(xlsx.bytes.buffer as ArrayBuffer);
    expect(book.worksheets[0].getCell('A2').value).toBe('Alpha');
  });
  it('recompose le texte DOCX et TXT en PDF, refuse les faux DOCX et DTD', async () => {
    const doc = new Document({
      sections: [{ children: [new Paragraph('Bonjour le monde, été français.')] }],
    });
    const source = { name: 'test.docx', bytes: new Uint8Array(await Packer.toArrayBuffer(doc)) };
    const [out] = await convertText(source, 'pdf', undefined, font);
    expect((await PDFDocument.load(out.bytes)).getPageCount()).toBe(1);
    const [txt] = await convertText(
      { name: 'note.txt', bytes: new TextEncoder().encode('Bonjour') },
      'pdf',
      undefined,
      font,
    );
    expect((await PDFDocument.load(txt.bytes)).getPageCount()).toBe(1);
    await expect(
      convertText({ name: 'fake.docx', bytes: new Uint8Array([1, 2]) }, 'pdf', undefined, font),
    ).rejects.toThrow();
    const malicious = zipSync({
      'word/document.xml': new TextEncoder().encode(
        '<!DOCTYPE w:document [<!ENTITY x "secret">]><w:document/>',
      ),
    });
    await expect(
      convertText({ name: 'malicious.docx', bytes: malicious }, 'pdf', undefined, font),
    ).rejects.toThrow('interdites');
  });
  it('ne fabrique pas un tableau ou du texte inexistant', async () => {
    expect(detectTable(tablePage.items)).toHaveLength(3);
    expect(
      detectTable([{ text: 'Un seul paragraphe', x: 20, y: 20, width: 100, height: 12 }]),
    ).toEqual([]);
    await expect(
      convertText(await fixture(), 'xlsx', [{ page: 1, text: 'Bonjour', items: [] }], font),
    ).rejects.toThrow('tableau');
    await expect(
      convertText(await fixture(), 'docx', [{ page: 1, text: '', items: [] }], font),
    ).rejects.toThrow('OCR');
  });
  it('cite les pages et distingue extraction de génération', () => {
    const pages = [
      tablePage,
      { page: 2, text: 'Le projet commence le 12/10/2026. Le budget est de 200 EUR.', items: [] },
    ];
    expect(extractiveAnswer(pages, 'budget')).toContain('[p. 2]');
    expect(extractiveAnswer(pages, 'extraire les dates')).toContain('12/10/2026');
    expect(extractiveAnswer(pages, 'traduire')).toContain('génératif');
    expect(extractiveAnswer(pages, 'zoologie')).toContain('Aucun passage');
    expect(relevantPages(pages, 'budget')[0].page).toBe(2);
  });
});
