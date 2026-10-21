import { useEffect, useRef, useState } from 'react';
import { Modal, Button } from '../components/ui';
import type { Workspace, NativeEdit, PageText } from '../types';
import type { ReplacementCandidate } from '../pdf/replace';
import { replacementPreview, getFont } from '../workers/client';
import { errorMessage } from '../utils/files';
import { t } from '../i18n';

interface Candidate extends ReplacementCandidate {
  pageId: string;
  page: number;
  key: string;
}
export function ReplaceDialog({
  workspace,
  getText,
  apply,
  close,
}: {
  workspace: Workspace;
  getText: (signal: AbortSignal) => Promise<PageText[]>;
  apply: (changes: { pageId: string; edit: NativeEdit }[]) => void;
  close: () => void;
}) {
  const [query, setQuery] = useState(''),
    [replacement, setReplacement] = useState('');
  const [results, setResults] = useState<Candidate[]>([]),
    [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false),
    [examined, setExamined] = useState(false),
    [excluded, setExcluded] = useState(0),
    [progress, setProgress] = useState(0),
    [error, setError] = useState('');
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);
  function invalidate() {
    controller.current?.abort();
    setBusy(false);
    setResults([]);
    setSelected([]);
    setExamined(false);
    setError('');
  }
  async function preview() {
    const control = new AbortController();
    controller.current?.abort();
    controller.current = control;
    setBusy(true);
    setExamined(false);
    setResults([]);
    setError('');
    setProgress(0);
    try {
      const pages = await getText(control.signal),
        font = await getFont(),
        candidates: Candidate[] = [];
      let rejected = 0;
      for (const [i, p] of workspace.pages.entries()) {
        const found = await replacementPreview(
          {
            kind: 'replace',
            source: workspace.sources[p.source],
            index: p.index,
            existing: p.nativeEdits ?? [],
            query,
            replacement,
            font,
          },
          control.signal,
        );
        const matched =
          pages[i].items
            .map((item) => item.text)
            .join(' ')
            .split(query).length - 1;
        const accepted = found.candidates.reduce((n, c) => n + c.count, 0);
        rejected += Math.max(found.excluded, matched - accepted);
        candidates.push(
          ...found.candidates.map((c) => ({
            ...c,
            pageId: p.id,
            page: i + 1,
            key: `${p.id}:${c.edit.id}`,
          })),
        );
        setProgress((i + 1) / workspace.pages.length);
      }
      if (!control.signal.aborted) {
        setResults(candidates);
        setSelected(candidates.map((c) => c.key));
        setExcluded(rejected);
        setExamined(true);
      }
    } catch (e) {
      if (!control.signal.aborted) setError(errorMessage(e));
    } finally {
      if (controller.current === control) setBusy(false);
    }
  }
  return (
    <Modal title={t('Remplacer dans le document')} close={close} wide>
      <p>
        {t(
          'Remplacement exact, sensible à la casse, dans les blocs de texte natif compatibles. Les scans, corrections visuelles, ajouts et champs de formulaire sont exclus. Aucun masque visuel ne sera créé.',
        )}
      </p>
      <div className="replace-inputs">
        <label>
          {t('Texte à rechercher')}
          <input
            aria-label={t('Texte à rechercher')}
            value={query}
            onChange={(e) => {
              invalidate();
              setQuery(e.target.value);
            }}
          />
        </label>
        <label>
          {t('Remplacer par')}
          <input
            aria-label={t('Remplacer par')}
            value={replacement}
            onChange={(e) => {
              invalidate();
              setReplacement(e.target.value);
            }}
          />
        </label>
        <Button disabled={busy || !query || workspace.encrypted} onClick={() => void preview()}>
          {t('Prévisualiser les remplacements')}
        </Button>
      </div>
      {busy && (
        <div role="status">
          <p>
            {t('Vérification des blocs…')} {Math.round(progress * 100)} %
          </p>
          <progress value={progress} max={1} />
          <Button
            onClick={() => {
              controller.current?.abort();
              setBusy(false);
            }}
          >
            {t('Annuler')}
          </Button>
        </div>
      )}
      {error && <p role="alert">{t(error)}</p>}
      {examined && (
        <>
          <p role="status">
            {t('{count} bloc(s) proposé(s) · {excluded} occurrence(s) exclue(s)', {
              count: results.length,
              excluded,
            })}
          </p>
          <small>
            {t(
              'Les occurrences traversant plusieurs blocs et les textes sans couche exploitable ne peuvent pas être remplacés. Les polices sous-ensembles peuvent être substituées ; contrôlez ensuite l’aperçu d’export.',
            )}
          </small>
          <div className="replace-list">
            {results.map((c) => (
              <label key={c.key} className="replace-row">
                <input
                  type="checkbox"
                  checked={selected.includes(c.key)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, c.key]
                        : selected.filter((key) => key !== c.key),
                    )
                  }
                />
                <span>
                  <strong>
                    {t('Page {page}', { page: c.page })} · {c.count}
                  </strong>
                  <del>{c.before}</del>
                  <ins>{c.after || t('(texte supprimé)')}</ins>
                </span>
              </label>
            ))}
          </div>
        </>
      )}
      <div className="row">
        <Button onClick={close}>{t('Annuler')}</Button>
        <Button
          className="primary"
          disabled={!examined || busy || !selected.length}
          onClick={() => {
            apply(
              results
                .filter((c) => selected.includes(c.key))
                .map((c) => ({ pageId: c.pageId, edit: c.edit })),
            );
            close();
          }}
        >
          {t('Appliquer les remplacements sélectionnés')}
        </Button>
      </div>
    </Modal>
  );
}
