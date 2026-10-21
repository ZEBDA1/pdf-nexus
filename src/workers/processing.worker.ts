import type { Request, AuxiliaryRequest } from './client';
import { exportWorkspace, textToPdf, imagesToPdf, rasterToPdf } from '../pdf/operations';
import { convertText } from '../converters/text';
import { safeName, errorMessage } from '../utils/files';
import type { OutputFile } from '../types';
import { setLanguage } from '../i18n';
import { restoreEditableSource } from '../pdf/editable';
import { previewReplacement } from '../pdf/replace';
self.onmessage = async ({
  data: request,
}: {
  data: (Request | Exclude<AuxiliaryRequest, { kind: 'boxes' }>) & { language: 'fr' | 'en' };
}) => {
  setLanguage(request.language === 'en' ? 'en' : 'fr');
  try {
    if (request.kind === 'replace') {
      const result = await previewReplacement(
        request.source.bytes,
        request.index,
        request.existing,
        request.query,
        request.replacement,
        request.font,
      );
      self.postMessage({ result });
      return;
    }
    if (request.kind === 'restore') {
      const result = await restoreEditableSource(request.source);
      self.postMessage({ result });
      return;
    }
    let files: OutputFile[];
    if (request.kind === 'export')
      files = [
        {
          name:
            safeName(request.workspace.name) +
            (request.options?.mode === 'flattened' ? '-partage.pdf' : '-nexus.pdf'),
          bytes: await exportWorkspace(
            request.workspace,
            request.font,
            (n) => self.postMessage({ progress: n }),
            request.options,
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
