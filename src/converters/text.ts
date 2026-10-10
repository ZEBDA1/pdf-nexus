import { Document, Paragraph, TextRun, Packer, PageBreak } from 'docx';
import ExcelJS from 'exceljs';
import { DOMParser } from '@xmldom/xmldom';
import { unzipSync } from 'fflate';
import type { PageText, Source, ConversionFormat, OutputFile } from '../types';
import { escapeHtml, safeName } from '../utils/files';
import { detectTable } from './tables';
import { textToPdf } from '../pdf/operations';

export async function convertText(
  source: Source,
  format: ConversionFormat,
  pages: PageText[] | undefined,
  font: Uint8Array,
): Promise<OutputFile[]> {
  const name = safeName(source.name);
  let text = pages?.map((p) => p.text).join('\n\n') ?? '';
  if (format === 'pdf') {
    if (/\.docx$/i.test(source.name)) {
      // Inspect ZIP declarations before expanding an untrusted DOCX.
      let expanded = 0,
        entries = 0;
      const files = unzipSync(source.bytes, {
        filter: (entry) => {
          expanded += entry.originalSize;
          entries++;
          if (expanded > 80 * 1024 * 1024 || entries > 4000)
            throw new Error('DOCX trop volumineux après décompression.');
          return entry.name === 'word/document.xml';
        },
      });
      if (!files['word/document.xml'])
        throw new Error('Ce fichier n’est pas un document Word OOXML valide.');
      const xml = new TextDecoder().decode(files['word/document.xml']);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml))
        throw new Error('Les entités XML et DTD sont interdites.');
      const parsed = new DOMParser({
        onError: () => {
          throw new Error('XML Word invalide.');
        },
      }).parseFromString(xml, 'application/xml');
      const paragraphs = Array.from(
        parsed.getElementsByTagNameNS(
          'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
          'p',
        ),
      );
      text = paragraphs
        .map((p) =>
          Array.from(
            p.getElementsByTagNameNS(
              'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
              't',
            ),
          )
            .map((t) => t.textContent ?? '')
            .join(''),
        )
        .join('\n\n');
    } else text = new TextDecoder('utf-8', { fatal: true }).decode(source.bytes);
    return [{ name: name + '.pdf', bytes: await textToPdf(text, font), mime: 'application/pdf' }];
  }
  if (!pages?.some((p) => p.text.trim()))
    throw new Error('Aucune couche de texte. Utilisez l’OCR avant cette conversion.');
  if (format === 'txt')
    return [
      {
        name: name + '.txt',
        bytes: new TextEncoder().encode(text),
        mime: 'text/plain;charset=utf-8',
      },
    ];
  if (format === 'html') {
    const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(name)}</title><style>body{font:16px/1.7 system-ui;max-width:850px;margin:48px auto;padding:24px}section{margin-bottom:48px}pre{white-space:pre-wrap;font:inherit}h2{color:#5858db}</style>${pages.map((p) => `<section><h2>Page ${p.page}</h2><pre>${escapeHtml(p.text)}</pre></section>`).join('')}</html>`;
    return [{ name: name + '.html', bytes: new TextEncoder().encode(html), mime: 'text/html' }];
  }
  if (format === 'docx') {
    const children: Paragraph[] = [];
    pages.forEach((p, i) => {
      if (i) children.push(new Paragraph({ children: [new PageBreak()] }));
      p.text
        .split('\n')
        .forEach((line) => children.push(new Paragraph({ children: [new TextRun(line)] })));
    });
    const doc = new Document({ sections: [{ children }], creator: 'PDF Nexus', title: name });
    return [
      {
        name: name + '.docx',
        bytes: new Uint8Array(await Packer.toArrayBuffer(doc)),
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    ];
  }
  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    let found = false;
    for (const p of pages) {
      const rows = detectTable(p.items);
      if (!rows.length) continue;
      found = true;
      const sheet = workbook.addWorksheet(`Page ${p.page}`);
      rows.forEach((row) => sheet.addRow(row));
      sheet.getRow(1).font = { bold: true };
      sheet.columns.forEach((c) => {
        c.width = 24;
      });
    }
    if (!found)
      throw new Error('Aucun tableau régulier détecté (au moins 3 lignes et 2 colonnes alignées).');
    return [
      {
        name: name + '.xlsx',
        bytes: new Uint8Array(await workbook.xlsx.writeBuffer()),
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ];
  }
  throw new Error('Conversion non prise en charge.');
}
