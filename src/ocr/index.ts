import { createWorker } from 'tesseract.js';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageText } from '../types';
import { assetUrl, renderRaster } from '../pdf/reader';
import { checkAbort } from '../utils/files';
export async function recognize(
  doc: PDFDocumentProxy,
  index: number,
  language: 'fra' | 'eng' | 'fra+eng',
  signal: AbortSignal,
  progress: (n: number) => void,
): Promise<PageText> {
  checkAbort(signal);
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let rejectAbort: ((reason: unknown) => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    if (worker) void worker.terminate();
    rejectAbort?.(new DOMException('Opération annulée', 'AbortError'));
  };
  signal.addEventListener('abort', abort, { once: true });
  let canvas: HTMLCanvasElement | undefined;
  try {
    const creating = createWorker(language, 1, {
      workerPath: assetUrl('vendor/ocr/worker.min.js'),
      corePath: assetUrl('vendor/ocr/core/'),
      langPath: assetUrl('vendor/ocr/'),
      workerBlobURL: false,
      gzip: false,
      cacheMethod: 'none',
      logger: (m) => {
        if (m.status === 'recognizing text') progress(m.progress);
      },
    }).then((w) => {
      if (signal.aborted) {
        void w.terminate();
        throw new DOMException('Opération annulée', 'AbortError');
      }
      return w;
    });
    worker = await Promise.race([creating, aborted]);
    checkAbort(signal);
    const rendered = await renderRaster(doc, index, 2, undefined, signal);
    canvas = rendered.canvas;
    const result = await Promise.race([
      worker.recognize(canvas, {}, { text: true, blocks: true }),
      aborted,
    ]);
    checkAbort(signal);
    const items: PageText['items'] = [];
    for (const block of result.data.blocks ?? [])
      for (const paragraph of block.paragraphs)
        for (const line of paragraph.lines)
          for (const word of line.words) {
            const [x1, y1] = rendered.viewport.convertToPdfPoint(word.bbox.x0, word.bbox.y0);
            const [x2, y2] = rendered.viewport.convertToPdfPoint(word.bbox.x1, word.bbox.y1);
            items.push({
              text: word.text,
              x: Math.min(x1, x2),
              y: Math.min(y1, y2),
              width: Math.abs(x2 - x1),
              height: Math.abs(y2 - y1),
            });
          }
    return { page: index + 1, text: result.data.text.trim(), items, ocr: true };
  } finally {
    signal.removeEventListener('abort', abort);
    await worker?.terminate();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
