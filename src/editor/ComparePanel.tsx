import { t } from '../i18n';
import { useRef, useState } from 'react';
import { Button } from '../components/ui';
import type { Source } from '../types';
import { readFile } from '../utils/files';
import { loadPdf, extractAll, renderRaster } from '../pdf/reader';
import { comparePages, pixelDifference, type PageComparison } from '../pdf/compare';
import type { RunJob } from './Converter';

async function texts(bytes: Uint8Array, signal: AbortSignal) {
  const doc = await loadPdf(bytes, undefined, signal);
  try {
    return (await extractAll(doc, signal)).map((p) => p.text);
  } finally {
    await doc.loadingTask.destroy();
  }
}

async function pixels(bytes: Uint8Array, index: number, signal: AbortSignal) {
  const doc = await loadPdf(bytes, undefined, signal);
  try {
    const { canvas } = await renderRaster(doc, index, 0.5, undefined, signal);
    const ctx = canvas.getContext('2d');
    return ctx?.getImageData(0, 0, canvas.width, canvas.height).data;
  } finally {
    await doc.loadingTask.destroy();
  }
}

export function ComparePanel({
  run,
  current,
  locked,
}: {
  run: RunJob;
  current: (signal?: AbortSignal) => Promise<Source>;
  locked: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<PageComparison[]>();
  function compare(file: File) {
    void run('Comparaison des PDF', async (signal, progress) => {
      const a = await current(signal);
      const b = await readFile(file, ['pdf']);
      const result = comparePages(await texts(a.bytes, signal), await texts(b.bytes, signal));
      for (const page of result) {
        if (page.missing) continue;
        const pa = await pixels(a.bytes, page.page - 1, signal);
        const pb = await pixels(b.bytes, page.page - 1, signal);
        if (pa && pb) page.pixels = pixelDifference(pa, pb);
        progress(page.page / result.length);
      }
      setReport(result);
    });
  }
  const changed = report?.filter(
    (p) => p.missing || p.text.added.length || p.text.removed.length || (p.pixels ?? 0) > 0.001,
  );
  return (
    <>
      <h3>{t('Comparer deux PDF')}</h3>
      <Button disabled={locked} onClick={() => input.current?.click()}>
        {t('Comparer avec un autre PDF')}
      </Button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) compare(file);
        }}
      />
      {report && (
        <div className="notice" role="status">
          {changed?.length
            ? changed.map((p) => (
                <p key={p.page}>
                  <strong>{t('Page {page}', { page: String(p.page) })}</strong>
                  {p.missing ? ' — ' + t('absente de l’un des documents') : ''}
                  {p.text.removed.length
                    ? ' — ' +
                      t('supprimé : {words}', { words: p.text.removed.slice(0, 20).join(' ') })
                    : ''}
                  {p.text.added.length
                    ? ' — ' + t('ajouté : {words}', { words: p.text.added.slice(0, 20).join(' ') })
                    : ''}
                  {p.pixels !== undefined
                    ? ' — ' +
                      t('différence visuelle : {percent} %', {
                        percent: (p.pixels * 100).toFixed(1),
                      })
                    : ''}
                </p>
              ))
            : t('Aucune différence détectée.')}
        </div>
      )}
    </>
  );
}
