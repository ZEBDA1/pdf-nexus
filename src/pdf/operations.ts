import { replacementFontForText } from './text-style';
import { applyNativeEdits } from './native-text';
import { watermarkFor, watermarkPositions } from './watermark';
import { preserveEditablePage, sealEditablePage } from './editable';
import { FormBuilder, flattenUnsupportedFields } from './forms';
import {
  PDFDocument,
  PDFName,
  PDFString,
  rgb,
  degrees,
  StandardFonts,
  type PDFFont,
  PDFPage,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Annotation, Workspace, Source, ExportOptions } from '../types';
import { safeUrl } from '../utils/files';
import type { RasterPage } from '../workers/client';

const color = (hex: string) =>
  rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  );
export async function embedFont(doc: PDFDocument, bytes: Uint8Array) {
  doc.registerFontkit(fontkit);
  return doc.embedFont(bytes, { subset: true });
}
export function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else {
        if (line) lines.push(line);
        line = '';
        for (const character of word) {
          if (line && font.widthOfTextAtSize(line + character, size) > width) {
            lines.push(line);
            line = '';
          }
          line += character;
        }
      }
    }
    lines.push(line);
  }
  return lines;
}
export async function drawAnnotation(
  doc: PDFDocument,
  page: PDFPage,
  a: Annotation,
  font: PDFFont,
) {
  if (a.hidden) return;
  const c = color(a.color);
  const { x, y, width, height, size } = a;
  const stroke = (start: { x: number; y: number }, end: { x: number; y: number }) =>
    page.drawLine({ start, end, color: c, thickness: Math.max(0.5, size / 6) });
  if (a.type === 'checkbox') {
    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: rgb(1, 1, 1),
      borderColor: c,
      borderWidth: Math.max(0.5, width / 18),
    });
    if (a.checked) {
      page.drawLine({
        start: { x: x + width * 0.18, y: y + height * 0.5 },
        end: { x: x + width * 0.42, y: y + height * 0.24 },
        color: c,
        thickness: Math.max(1, width / 9),
      });
      page.drawLine({
        start: { x: x + width * 0.42, y: y + height * 0.24 },
        end: { x: x + width * 0.83, y: y + height * 0.8 },
        color: c,
        thickness: Math.max(1, width / 9),
      });
    }
  } else if (a.replacement) {
    const r = a.replacement;
    const chosen = r.font === 'Noto Sans' ? font : await doc.embedFont(r.font as StandardFonts);
    // Visual corrections deliberately preserve the source text; never label this redaction.
    page.drawRectangle({
      x: r.mask?.x ?? x,
      y: r.mask?.y ?? y,
      width: r.mask?.width ?? width,
      height: r.mask?.height ?? height,
      color: color(r.background),
      rotate: degrees(r.angle),
    });
    if (a.text)
      page.drawText(a.text, {
        x: x - Math.sin((r.angle * Math.PI) / 180) * r.baseline,
        y: y + Math.cos((r.angle * Math.PI) / 180) * r.baseline,
        size,
        font: chosen,
        color: c,
        rotate: degrees(r.angle),
        lineHeight: size * 1.3,
      });
  } else if (['text', 'note', 'stamp', 'link'].includes(a.type)) {
    const face = replacementFontForText(a.font ?? 'Noto Sans', a.text ?? '');
    const chosen = face === 'Noto Sans' ? font : await doc.embedFont(face as StandardFonts);
    if (a.type === 'note')
      page.drawRectangle({ x, y, width, height, color: rgb(1, 0.96, 0.78), opacity: 0.94 });
    if (a.type === 'stamp')
      page.drawRectangle({ x, y, width, height, borderColor: c, borderWidth: 1.5 });
    const lines = wrapText(a.text ?? '', chosen, size, Math.max(10, width - 8));
    const max = Math.max(1, Math.floor((height - 4) / (size * 1.3)));
    if (lines.length > max)
      throw new Error(
        'Le texte d’une annotation dépasse sa zone. Sélectionnez-la et augmentez sa hauteur ou réduisez sa taille.',
      );
    page.drawText(lines.join('\n'), {
      x: x + 4,
      y: y + height - size - 3,
      size,
      font: chosen,
      color: c,
      lineHeight: size * 1.3,
    });
    if (a.type === 'link' && a.url) {
      const annotation = doc.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [x, y, x + width, y + height],
        Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(safeUrl(a.url)) },
      });
      page.node.addAnnot(doc.context.register(annotation));
    }
  } else if (a.type === 'highlight')
    page.drawRectangle({ x, y, width, height, color: c, opacity: 0.3 });
  else if (a.type === 'rect')
    page.drawRectangle({
      x,
      y,
      width,
      height,
      borderColor: c,
      borderWidth: Math.max(0.5, size / 6),
    });
  else if (a.type === 'ellipse')
    page.drawEllipse({
      x: x + width / 2,
      y: y + height / 2,
      xScale: width / 2,
      yScale: height / 2,
      borderColor: c,
      borderWidth: Math.max(0.5, size / 6),
    });
  else if (a.type === 'underline' || a.type === 'strike')
    stroke(
      { x, y: y + (a.type === 'strike' ? height / 2 : 1) },
      { x: x + width, y: y + (a.type === 'strike' ? height / 2 : 1) },
    );
  else if (a.type === 'pen' && a.points)
    for (let i = 1; i < a.points.length; i++) stroke(a.points[i - 1], a.points[i]);
  else if (a.type === 'line' || a.type === 'arrow') {
    const start = a.points?.[0] ?? { x, y },
      end = a.points?.[1] ?? { x: x + width, y: y + height };
    stroke(start, end);
    if (a.type === 'arrow') {
      const angle = Math.atan2(end.y - start.y, end.x - start.x),
        length = Math.max(9, size);
      for (const delta of [-0.45, 0.45])
        stroke(end, {
          x: end.x - length * Math.cos(angle + delta),
          y: end.y - length * Math.sin(angle + delta),
        });
    }
  } else if (a.type === 'image' && a.image) {
    const image = a.imageType === 'png' ? await doc.embedPng(a.image) : await doc.embedJpg(a.image);
    page.drawImage(image, { x, y, width, height });
  }
}
export async function exportWorkspace(
  workspace: Workspace,
  fontBytes: Uint8Array,
  progress?: (n: number) => void,
  options: ExportOptions = { mode: 'editable', preserveForms: false },
) {
  if (workspace.encrypted) throw new Error('L’export des PDF chiffrés n’est pas pris en charge.');
  if (!workspace.pages.length) throw new Error('Le document doit contenir au moins une page.');
  const output = await PDFDocument.create();
  const font = await embedFont(output, fontBytes);
  const sources = new Map<number, PDFDocument>();
  const forms = new FormBuilder(output, font);
  const occurrences = new Map<string, number>();
  for (let i = 0; i < workspace.pages.length; i++) {
    const ref = workspace.pages[i];
    let source = sources.get(ref.source);
    if (!source) {
      source = await PDFDocument.load(workspace.sources[ref.source].bytes, {
        updateMetadata: false,
      });
      sources.set(ref.source, source);
    }
    let pageSource = source;
    const hasForm = source.getForm().getFields().length > 0;
    if (hasForm) {
      // Flattening can insert streams and change native-run IDs. Edit the original
      // streams first, in an isolated copy so duplicate pages remain independent.
      pageSource = await PDFDocument.load(workspace.sources[ref.source].bytes, {
        updateMetadata: false,
      });
      await applyNativeEdits(pageSource.getPage(ref.index), ref.nativeEdits ?? [], fontBytes);
      flattenUnsupportedFields(pageSource);
    }
    // Strip before copying so disconnected original objects are not serialized in the output.
    const sourcePage = pageSource.getPage(ref.index);
    sourcePage.node.delete(PDFName.of('Annots'));
    sourcePage.node.delete(PDFName.of('AA'));
    sourcePage.node.delete(PDFName.of('Metadata'));
    sourcePage.node.delete(PDFName.of('NexusEdits'));
    const [page] = await output.copyPages(pageSource, [ref.index]);
    page.setRotation(degrees((page.getRotation().angle + ref.rotation) % 360));
    output.addPage(page);
    page.node.set(PDFName.of('Tabs'), PDFName.of('R'));
    if (!hasForm) await applyNativeEdits(page, ref.nativeEdits ?? [], fontBytes);
    const original = `${ref.source}:${ref.index}`;
    const occurrence = (occurrences.get(original) ?? 0) + 1;
    occurrences.set(original, occurrence);
    forms.addPage(source, page, ref, ref.formGroup ?? `${ref.source}:${occurrence}`);
    const wm = watermarkFor(workspace.watermark, workspace.watermarkOptions);
    const angle = (wm.angle * Math.PI) / 180;
    const wmWidth = font.widthOfTextAtSize(wm.text, wm.size);
    for (const p of watermarkPositions(wm, page.getWidth(), page.getHeight(), i + 1))
      page.drawText(wm.text, {
        x: p.x - (Math.cos(angle) * wmWidth) / 2,
        y: p.y - (Math.sin(angle) * wmWidth) / 2,
        size: wm.size,
        font,
        color: color(wm.color),
        opacity: wm.opacity,
        rotate: degrees(wm.angle),
      });
    if (workspace.numbering)
      page.drawText(`${i + 1} / ${workspace.pages.length}`, {
        x: page.getWidth() / 2 - 20,
        y: 18,
        size: 10,
        font,
        color: rgb(0.4, 0.4, 0.45),
      });
    progress?.(((i + 1) / workspace.pages.length) * 0.65);
  }
  forms.finish();
  if (!options.preserveForms || options.mode === 'flattened')
    output.getForm().flatten({ updateFieldAppearances: false });
  for (const [i, page] of output.getPages().entries()) {
    const ref = workspace.pages[i];
    // Native widget choices now live in real form fields, not a second painted
    // checkbox. Keep ordinary additions in a separate editable content stream.
    const annotations = ref.annotations.filter((a) => !a.id.startsWith('widget-'));
    if (options.mode === 'editable') preserveEditablePage(page, annotations);
    const additions = PDFPage.of(page.node, page.ref, output);
    for (const a of annotations) await drawAnnotation(output, additions, a, font);
    await sealEditablePage(page);
    progress?.(0.65 + ((i + 1) / workspace.pages.length) * 0.35);
  }
  if (!workspace.cleanMetadata) {
    const source = sources.get(workspace.pages[0].source)!;
    output.setTitle(source.getTitle() ?? workspace.name);
    output.setAuthor(source.getAuthor() ?? '');
    output.setSubject(source.getSubject() ?? '');
    output.setKeywords(source.getKeywords()?.split(/,\s*/) ?? []);
    output.setCreator('PDF Nexus');
  } else {
    output.context.trailerInfo.Info = undefined;
    output.catalog.delete(PDFName.of('Metadata'));
  }
  return output.save({ useObjectStreams: true });
}
export async function textToPdf(text: string, fontBytes: Uint8Array) {
  if (!text.trim()) throw new Error('Aucun texte exploitable. Lancez l’OCR pour un scan.');
  const doc = await PDFDocument.create(),
    font = await embedFont(doc, fontBytes);
  const lines = wrapText(text, font, 11, 499);
  let page = doc.addPage([595, 842]),
    y = 790;
  for (const line of lines) {
    if (y < 50) {
      page = doc.addPage([595, 842]);
      y = 790;
    }
    page.drawText(line, { x: 48, y, size: 11, font });
    y -= 16;
  }
  doc.setCreator('PDF Nexus');
  return doc.save();
}
export async function imagesToPdf(images: Source[]) {
  const doc = await PDFDocument.create();
  for (const source of images) {
    const image = /\.png$/i.test(source.name)
      ? await doc.embedPng(source.bytes)
      : await doc.embedJpg(source.bytes);
    if (image.width * image.height > 40_000_000)
      throw new Error('Image trop grande (40 mégapixels maximum).');
    const landscape = image.width > image.height;
    const [w, h] = landscape ? [842, 595] : [595, 842];
    const page = doc.addPage([w, h]);
    const scale = Math.min((w - 48) / image.width, (h - 48) / image.height);
    page.drawImage(image, {
      x: (w - image.width * scale) / 2,
      y: (h - image.height * scale) / 2,
      width: image.width * scale,
      height: image.height * scale,
    });
  }
  if (!images.length) throw new Error('Sélectionnez au moins une image.');
  return doc.save();
}
export async function rasterToPdf(pages: RasterPage[], fontBytes: Uint8Array) {
  const doc = await PDFDocument.create(),
    font = await embedFont(doc, fontBytes);
  for (const p of pages) {
    const page = doc.addPage([p.width, p.height]);
    const image = p.format === 'png' ? await doc.embedPng(p.bytes) : await doc.embedJpg(p.bytes);
    page.drawImage(image, { x: 0, y: 0, width: p.width, height: p.height });
    for (const word of p.words ?? [])
      if (word.text.trim()) {
        const size = Math.max(4, word.height * 0.85);
        page.drawText(word.text, {
          x: word.x,
          y: word.y,
          size,
          font,
          color: rgb(0, 0, 0),
          opacity: 0,
        });
      }
  }
  return doc.save();
}
