import type { Request } from './client';
import { exportWorkspace, textToPdf, imagesToPdf, rasterToPdf } from '../pdf/operations';
import { convertText } from '../converters/text';
import { safeName, errorMessage } from '../utils/files';
import type { OutputFile } from '../types';
import { setLanguage } from '../i18n';
self.onmessage = async ({ data: request }: { data: Request & { language: 'fr' | 'en' } }) => {
  setLanguage(request.language === 'en' ? 'en' : 'fr');
  try {
    let files: OutputFile[];
    if (request.kind === 'export')
      files = [
        {
          name: safeName(request.workspace.name) + '-nexus.pdf',
          bytes: await exportWorkspace(request.workspace, request.font, (n) =>
            self.postMessage({ progress: n }),
          ),
          mime: 'application/pdf',
        },
      ];
    else if (request.kind === 'textPdf')
      files = [
        {
          name: request.name,
          bytes: await textToPdf(request.text, request.font),
          mime: 'application/pdf',
        },
      ];
    else if (request.kind === 'imagesPdf')
      files = [
        { name: request.name, bytes: await imagesToPdf(request.images), mime: 'application/pdf' },
      ];
    else if (request.kind === 'rasterPdf')
      files = [
        {
          name: request.name,
          bytes: await rasterToPdf(request.pages, request.font),
          mime: 'application/pdf',
        },
      ];
    else files = await convertText(request.source, request.format, request.text, request.font);
    (
      self as unknown as { postMessage: (message: unknown, transfer: ArrayBuffer[]) => void }
    ).postMessage(
      { files },
      files.map((f) => f.bytes.buffer as ArrayBuffer),
    );
  } catch (error) {
    self.postMessage({ error: errorMessage(error) });
  }
};
