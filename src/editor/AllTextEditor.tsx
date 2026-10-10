import { t } from '../i18n';
import { useEffect, useMemo, useState } from 'react';
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist';
import type { Workspace, NativeEdit, Annotation } from '../types';
import { listNativeRuns } from '../pdf/native-text';
import { renderRaster } from '../pdf/reader';
import { sampleTextColors } from '../pdf/text-style';
import { LiveTextEditor, type LiveTarget } from './LiveTextEditor';
import { errorMessage } from '../utils/files';

export function AllTextEditor({
  workspace,
  docs,
  initial,
  go,
  close,
  updateNative,
  updateVisual,
}: {
  workspace: Workspace;
  docs: PDFDocumentProxy[];
  initial: number;
  go: (n: number) => void;
  close: () => void;
  updateNative: (pageId: string, edits: NativeEdit[], group: string) => void;
  updateVisual: (pageId: string, annotation: Annotation, group: string) => void;
}) {
  const [id, setId] = useState(workspace.pages[initial].id);
  const ref = workspace.pages.find((p) => p.id === id) ?? workspace.pages[0];
  const [data, setData] = useState<{ targets: LiveTarget[]; viewport: PageViewport }>();
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined);
    setError('');
    setQuery('');
    void (async () => {
      const page = await docs[ref.source].getPage(ref.index + 1);
      const content = await page.getTextContent();
      const runs = await listNativeRuns(workspace.sources[ref.source].bytes, ref.index).catch(
        () => [],
      );
      const raster = await renderRaster(docs[ref.source], ref.index, 1, 0, controller.signal);
      try {
        const items = content.items.filter((i) => 'str' in i && i.str.trim());
        const occurrences = new Map<string, number>();
        const counts = new Map<string, number>();
        for (const item of items)
          if ('str' in item) counts.set(item.str, (counts.get(item.str) ?? 0) + 1);
        const targets: LiveTarget[] = [];
        for (const [index, item] of items.entries()) {
          if (!('str' in item)) continue;
          const occurrence = occurrences.get(item.str) ?? 0;
          occurrences.set(item.str, occurrence + 1);
          const candidates = runs.filter((r) => r.text === item.str);
          const count = counts.get(item.str);
          const run = candidates.length === count ? candidates[occurrence] : undefined;
          const size = run?.size ?? Math.hypot(item.transform[2], item.transform[3]);
          const x = item.transform[4],
            y = item.transform[5];
          const [px, py] = raster.viewport.convertToViewportPoint(x, y);
          targets.push({
            key: `text-${ref.id}-${index}`,
            text: item.str,
            run,
            x,
            y,
            width: item.width,
            height: size * 1.22,
            size,
            angle: (Math.atan2(item.transform[1], item.transform[0]) * 180) / Math.PI,
            font: run?.font ?? content.styles[item.fontName]?.fontFamily ?? 'Helvetica',
            ...sampleTextColors(raster.canvas, {
              x: px,
              y: py - size,
              width: item.width,
              height: size * 1.22,
            }),
          });
        }
        if (!controller.signal.aborted) setData({ targets, viewport: raster.viewport });
      } finally {
        raster.canvas.width = 0;
        raster.canvas.height = 0;
      }
    })().catch((e) => {
      if (!controller.signal.aborted) setError(errorMessage(e));
    });
    return () => controller.abort();
  }, [ref.id, ref.source, ref.index, docs, workspace.sources]);
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('fr');
    if (!q) return data?.targets ?? [];
    return (data?.targets ?? []).filter((t) => t.text.toLocaleLowerCase('fr').includes(q));
  }, [data, query]);
  const pageIndex = workspace.pages.findIndex((p) => p.id === ref.id);
  const visualCount =
    ref.annotations.filter((a) => a.replacement).length + (ref.nativeEdits?.length ?? 0);
  return (
    <aside className="all-text-panel" aria-label={t('Modifier tout le texte')}>
      <header>
        <div>
          <strong>{t('Tout le texte')}</strong>
          <span className="all-text-count" role="status">
            {data
              ? t('{count} bloc(s) · page {page}', { count: visible.length, page: pageIndex + 1 })
              : '…'}
          </span>
        </div>
        <button
          className="icon-button"
          aria-label={t('Fermer la liste des textes')}
          onClick={close}
        >
          {t('×')}
        </button>
      </header>
      <p className="all-text-intro">
        {t(
          'Écrivez dans les champs : le PDF se met à jour en direct. Parcourez les pages pour modifier tout le document.',
        )}
      </p>
      <div className="all-text-controls">
        <label className="all-text-search">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label={t('Rechercher un texte de la page')}
            placeholder={t('Filtrer les blocs…')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="icon-button"
              aria-label={t('Effacer la recherche')}
              onClick={() => setQuery('')}
            >
              {t('×')}
            </button>
          )}
        </label>
        <label className="all-text-page">
          {t('Page')}{' '}
          <select
            aria-label={t('Page du texte à modifier')}
            value={ref.id}
            onChange={(e) => {
              setId(e.target.value);
              go(workspace.pages.findIndex((p) => p.id === e.target.value));
            }}
          >
            {workspace.pages.map((p, i) => (
              <option key={p.id} value={p.id}>
                {i + 1} / {workspace.pages.length}
              </option>
            ))}
          </select>
        </label>
      </div>
      {visualCount > 0 && (
        <p className="all-text-progress" role="status">
          {t('{count} modification(s) sur cette page — Ctrl+Z pour annuler.', {
            count: visualCount,
          })}
        </p>
      )}
      <small className="all-text-note">
        {t(
          'Les corrections visuelles conservent le texte d’origine. Ce mode ne sert pas à caviarder.',
        )}
      </small>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">{t('Lecture des textes…')}</p>}
      {data && !data.targets.length && (
        <p>
          {t(
            'Aucun texte détecté. Utilisez l’OCR pour extraire un scan, ou ajoutez du texte sur la page.',
          )}
        </p>
      )}
      {data && !!data.targets.length && !visible.length && (
        <p>{t('Aucun bloc ne correspond à « {query} ».', { query })}</p>
      )}
      <ol className="all-text-list">
        {data &&
          visible.map((target, i) => (
            <li key={target.key}>
              <span className="all-text-rank" aria-hidden="true">
                {i + 1}
              </span>
              <LiveTextEditor
                panel
                target={target}
                page={ref}
                viewport={data.viewport}
                changeNative={(edits, group) => updateNative(ref.id, edits, group)}
                changeVisual={(a, group) => updateVisual(ref.id, a, group)}
                close={() => {}}
              />
            </li>
          ))}
      </ol>
    </aside>
  );
}
