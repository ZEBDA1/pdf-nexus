import type { OutputFile, Workspace, PageText, Source, ConversionFormat } from '../types';
import { getLanguage } from '../i18n';
export interface RasterPage {
  bytes: Uint8Array;
  width: number;
  height: number;
  words?: PageText['items'];
  format: 'png' | 'jpg';
}
export type Request =
  | { kind: 'export'; workspace: Workspace; font: Uint8Array }
  | { kind: 'textPdf'; text: string; font: Uint8Array; name: string }
  | {
      kind: 'convert';
      source: Source;
      format: ConversionFormat;
      text?: PageText[];
      font: Uint8Array;
    }
  | { kind: 'imagesPdf'; images: Source[]; font: Uint8Array; name: string }
  | { kind: 'rasterPdf'; pages: RasterPage[]; font: Uint8Array; name: string };
export async function processJob(
  request: Request,
  signal?: AbortSignal,
  progress?: (n: number) => void,
): Promise<OutputFile[]> {
  if (signal?.aborted) throw new DOMException('Opération annulée', 'AbortError');
  const worker = new Worker(new URL('./processing.worker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    const finish = () => {
      worker.terminate();
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      finish();
      reject(new DOMException('Opération annulée', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.progress !== undefined) {
        progress?.(data.progress);
        return;
      }
      finish();
      if (data.error) reject(new Error(data.error));
      else resolve(data.files);
    };
    worker.onerror = () => {
      finish();
      reject(
        new Error('Le traitement a échoué. Le fichier est peut-être endommagé ou trop volumineux.'),
      );
    };
    worker.postMessage({ ...request, language: getLanguage() });
  });
}
let fontPromise: Promise<Uint8Array> | undefined;
export function getFont() {
  return (fontPromise ??= fetch(
    new URL(`${import.meta.env.BASE_URL}fonts/NotoSans-Regular.ttf`, location.href),
  )
    .then((r) => {
      if (!r.ok) throw new Error('Police locale manquante. Exécutez npm run assets.');
      return r.arrayBuffer();
    })
    .then((b) => new Uint8Array(b)));
}
