import { zipSync } from 'fflate';
import type { ConversionFormat, OutputFile, Source, Workspace } from '../types';
import { loadPdf, extractAll, renderRaster, canvasBytes } from '../pdf/reader';
import { getFont, processJob } from '../workers/client';
import { checkAbort, parsePages, safeName, uid } from '../utils/files';
export async function convertSources(
  sources: Source[],
  format: ConversionFormat,
  range: string,
  scale: number,
  signal: AbortSignal,
  progress: (n: number) => void,
): Promise<OutputFile[]> {
  if (!sources.length) throw new Error('Sélectionnez des fichiers.');
  if (sources.reduce((n, s) => n + s.bytes.length, 0) > 150 * 1024 * 1024)
    throw new Error('Un lot ne peut pas dépasser 150 Mio.');
  const font = await getFont();
  const result: OutputFile[] = [];
  const pdfSources: Source[] = [];
  if (format === 'pdf' && sources.every((s) => /\.(png|jpe?g)$/i.test(s.name)))
    return processJob(
      { kind: 'imagesPdf', images: sources, font, name: 'images-nexus.pdf' },
      signal,
    );
  for (let i = 0; i < sources.length; i++) {
    checkAbort(signal);
    const source = sources[i];
    const pdf = /\.pdf$/i.test(source.name);
    let files: OutputFile[] = [];
    if (pdf) {
      const doc = await loadPdf(source.bytes, undefined, signal);
      try {
        const indices = parsePages(range, doc.numPages);
        if (indices.length > 1000) throw new Error('Limite de 1 000 pages par PDF de conversion.');
        if (format === 'pdf') {
          const workspace: Workspace = {
            name: source.name,
            sources: [source],
            pages: indices.map((index) => ({
              id: uid(),
              source: 0,
              index,
              rotation: 0,
              annotations: [],
            })),
            watermark: '',
            numbering: false,
            cleanMetadata: false,
            encrypted: false,
          };
          files = await processJob({ kind: 'export', workspace, font }, signal);
        } else if (format === 'png' || format === 'jpg') {
          let totalBytes = 0;
          for (let j = 0; j < indices.length; j++) {
            checkAbort(signal);
            const index = indices[j],
              { canvas } = await renderRaster(doc, index, scale, undefined, signal);
            try {
              const bytes = await canvasBytes(canvas, format);
              totalBytes += bytes.length;
              if (totalBytes > 150 * 1024 * 1024)
                throw new Error(
                  'Les images dépassent 150 Mio. Réduisez la résolution ou sélectionnez moins de pages.',
                );
              files.push({
                name: `${safeName(source.name)}-p${index + 1}.${format}`,
                bytes,
                mime: format === 'png' ? 'image/png' : 'image/jpeg',
              });
            } finally {
              canvas.width = 0;
              canvas.height = 0;
            }
            progress((i + (j + 1) / indices.length) / sources.length);
          }
        } else {
          const text = (
            await extractAll(doc, signal, (n) => progress((i + n * 0.5) / sources.length))
          ).filter((_, index) => indices.includes(index));
          files = await processJob({ kind: 'convert', source, format, text, font }, signal);
        }
      } finally {
        await doc.loadingTask.destroy();
      }
    } else if (format === 'pdf') {
      if (/\.(png|jpe?g)$/i.test(source.name))
        files = await processJob(
          { kind: 'imagesPdf', images: [source], font, name: safeName(source.name) + '.pdf' },
          signal,
        );
      else files = await processJob({ kind: 'convert', source, format, font }, signal);
    } else
      throw new Error(
        'Les fichiers Word, texte et images peuvent être convertis en PDF uniquement.',
      );
    if (format === 'pdf') pdfSources.push(...files.map((f) => ({ name: f.name, bytes: f.bytes })));
    else result.push(...files);
    progress((i + 1) / sources.length);
  }
  if (format === 'pdf') {
    if (pdfSources.length === 1) return [{ ...pdfSources[0], mime: 'application/pdf' }];
    const pages: Workspace['pages'] = [];
    for (let i = 0; i < pdfSources.length; i++) {
      checkAbort(signal);
      const doc = await loadPdf(pdfSources[i].bytes);
      try {
        if (pages.length + doc.numPages > 1000) throw new Error('Limite de 1 000 pages par lot.');
        for (let index = 0; index < doc.numPages; index++)
          pages.push({ id: uid(), source: i, index, rotation: 0, annotations: [] });
      } finally {
        await doc.loadingTask.destroy();
      }
    }
    return processJob(
      {
        kind: 'export',
        font,
        workspace: {
          name: 'fusion-nexus.pdf',
          sources: pdfSources,
          pages,
          watermark: '',
          numbering: false,
          cleanMetadata: false,
          encrypted: false,
        },
      },
      signal,
    );
  }
  return result;
}
export function packageOutputs(files: OutputFile[]): OutputFile {
  if (files.length === 1) return files[0];
  const entries: Record<string, Uint8Array> = {};
  files.forEach((f, i) => {
    entries[`${String(i + 1).padStart(3, '0')}-${f.name}`] = f.bytes;
  });
  return {
    name: 'conversions-nexus.zip',
    bytes: zipSync(entries, { level: 3 }),
    mime: 'application/zip',
  };
}
