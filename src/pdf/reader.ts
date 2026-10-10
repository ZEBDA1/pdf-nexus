import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PageText, TextItem } from '../types';
import { checkAbort } from '../utils/files';
GlobalWorkerOptions.workerSrc = pdfWorker;
export const assetUrl = (path: string) =>
  new URL(`${import.meta.env.BASE_URL}${path}`, location.href).href;
export async function loadPdf(
  bytes: Uint8Array,
  password?: string,
  signal?: AbortSignal,
): Promise<PDFDocumentProxy> {
  checkAbort(signal);
  const task = getDocument({
    data: bytes.slice(),
    password,
    enableXfa: false,
    cMapUrl: assetUrl('vendor/pdfjs/cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: assetUrl('vendor/pdfjs/standard_fonts/'),
    wasmUrl: assetUrl('vendor/pdfjs/wasm/'),
  });
  const abort = () => {
    void task.destroy();
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    return await task.promise;
  } catch (error) {
    await task.destroy();
    checkAbort(signal);
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}
export async function extractPage(doc: PDFDocumentProxy, index: number): Promise<PageText> {
  const page = await doc.getPage(index + 1);
  const content = await page.getTextContent();
  const items: TextItem[] = [];
  let text = '';
  for (const item of content.items)
    if ('str' in item) {
      items.push({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height,
      });
      text += item.str + (item.hasEOL ? '\n' : ' ');
    }
  return { page: index + 1, text: text.trim(), items };
}
export async function extractAll(
  doc: PDFDocumentProxy,
  signal?: AbortSignal,
  progress?: (n: number) => void,
) {
  const result: PageText[] = [];
  for (let i = 0; i < doc.numPages; i++) {
    checkAbort(signal);
    result.push(await extractPage(doc, i));
    progress?.((i + 1) / doc.numPages);
  }
  return result;
}
export async function renderRaster(
  doc: PDFDocumentProxy,
  index: number,
  scale = 1.5,
  rotation?: number,
  signal?: AbortSignal,
) {
  checkAbort(signal);
  const page = await doc.getPage(index + 1);
  let viewport = page.getViewport({ scale, rotation });
  if (viewport.width * viewport.height > 16_000_000)
    viewport = page.getViewport({
      scale: scale * Math.sqrt(16_000_000 / (viewport.width * viewport.height)),
      rotation,
    });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const task = page.render({ canvas, viewport, background: '#ffffff' });
  const abort = () => task.cancel();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    await task.promise;
    checkAbort(signal);
  } catch (error) {
    canvas.width = 0;
    canvas.height = 0;
    checkAbort(signal);
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
  return { canvas, page, viewport };
}
export async function canvasBytes(
  canvas: HTMLCanvasElement,
  format: 'png' | 'jpg',
  quality = 0.85,
) {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Encodage image impossible'))),
      format === 'png' ? 'image/png' : 'image/jpeg',
      quality,
    ),
  );
  return new Uint8Array(await blob.arrayBuffer());
}
