import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, Download, FilePenLine, Send } from 'lucide-react';
import type { ExportOptions, OutputFile, Workspace } from '../types';
import { Modal, Button, IconButton } from '../components/ui';
import { processJob, getFont } from '../workers/client';
import { loadPdf } from '../pdf/reader';
import { download, errorMessage, fileSize } from '../utils/files';
import { t } from '../i18n';

export function ExportDialog({
  workspace,
  close,
  done,
}: {
  workspace: Workspace;
  close: () => void;
  done: () => void;
}) {
  const [options, setOptions] = useState<ExportOptions>({ mode: 'editable', preserveForms: true });
  const [output, setOutput] = useState<OutputFile>(),
    [doc, setDoc] = useState<PDFDocumentProxy>(),
    [page, setPage] = useState(0);
  const [progress, setProgress] = useState(0),
    [error, setError] = useState(''),
    [ready, setReady] = useState(false),
    [retry, setRetry] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    let loaded: PDFDocumentProxy | undefined;
    setOutput(undefined);
    setDoc(undefined);
    setReady(false);
    setError('');
    setProgress(0);
    void (async () => {
      const [file] = await processJob(
        { kind: 'export', workspace, font: await getFont(), options },
        controller.signal,
        setProgress,
      );
      loaded = await loadPdf(file.bytes, undefined, controller.signal);
      if (!controller.signal.aborted) {
        setDoc(loaded);
        setOutput(file);
      }
    })().catch((e) => {
      if (!controller.signal.aborted) setError(errorMessage(e));
    });
    return () => {
      controller.abort();
      void loaded?.loadingTask.destroy();
    };
  }, [workspace, options, retry]);
  useEffect(() => {
    if (!doc || !canvas.current) return;
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    setReady(false);
    void (async () => {
      const p = await doc.getPage(page + 1);
      if (cancelled || !canvas.current) return;
      const base = p.getViewport({ scale: 1 }),
        viewport = p.getViewport({ scale: Math.min(1.4, 500 / base.width, 620 / base.height) });
      canvas.current.width = Math.ceil(viewport.width);
      canvas.current.height = Math.ceil(viewport.height);
      task = p.render({ canvas: canvas.current, viewport, background: '#fff' });
      await task.promise;
      if (!cancelled) setReady(true);
    })().catch((e) => {
      if (!cancelled) setError(errorMessage(e));
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page]);
  return (
    <Modal title={t('Exporter votre document')} close={close} wide>
      <div className="export-layout">
        <div className="export-options">
          <p>
            {t(
              'Choisissez la copie adaptée à votre usage. L’aperçu montre le fichier qui sera téléchargé.',
            )}
          </p>
          <label className={`export-choice ${options.mode === 'editable' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="export-mode"
              checked={options.mode === 'editable'}
              onChange={() => setOptions({ ...options, mode: 'editable' })}
            />
            <FilePenLine size={22} />
            <span>
              <strong>{t('Continuer dans Nexus')}</strong>
              <small>
                {t(
                  'Vos textes, dessins, images et cases ajoutés restent séparément modifiables à la réouverture. Des données de réédition sont incluses, y compris les objets masqués.',
                )}
              </small>
            </span>
          </label>
          <label className={`export-choice ${options.mode === 'flattened' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="export-mode"
              checked={options.mode === 'flattened'}
              onChange={() => setOptions({ ...options, mode: 'flattened' })}
            />
            <Send size={22} />
            <span>
              <strong>{t('Partager une copie aplatie')}</strong>
              <small>
                {t(
                  'Les ajouts visibles et les valeurs des formulaires sont intégrés aux pages. Les objets masqués et les données de réédition Nexus sont exclus. Les champs deviennent fixes.',
                )}
              </small>
            </span>
          </label>
          {options.mode === 'editable' && (
            <label className="check-line">
              <input
                type="checkbox"
                checked={options.preserveForms}
                onChange={(e) => setOptions({ ...options, preserveForms: e.target.checked })}
              />
              {t('Conserver les champs de formulaire interactifs')}
            </label>
          )}
          <p className="notice">
            {t(
              'Une copie aplatie n’est pas un caviardage. Une correction visuelle conserve le texte original qu’elle recouvre. Les signatures numériques ne sont pas conservées ; les champs non pris en charge restent visuels si leur apparence est disponible.',
            )}
          </p>
          {error && (
            <div role="alert" className="export-error">
              <p>{t(error)}</p>
              <Button onClick={() => setRetry((n) => n + 1)}>{t('Réessayer')}</Button>
            </div>
          )}
          {!output && !error && (
            <div role="status">
              <p>
                {t('Préparation de l’aperçu…')} {Math.round(progress * 100)} %
              </p>
              <progress value={progress} max={1} />
            </div>
          )}
          <div className="row">
            <Button onClick={close}>{t('Annuler')}</Button>
            <Button
              className="primary"
              disabled={!output || !ready || !!error}
              onClick={() => {
                if (output) {
                  download(output.bytes, output.name, output.mime);
                  done();
                  close();
                }
              }}
            >
              <Download size={17} />
              {t('Télécharger le PDF')}
            </Button>
          </div>
          {output && (
            <small>
              {fileSize(output.bytes.length)} · {output.name}
            </small>
          )}
        </div>
        <div className="export-preview" aria-label={t('Aperçu du PDF exporté')} aria-busy={!ready}>
          <canvas ref={canvas} style={{ visibility: output ? 'visible' : 'hidden' }} />
          {doc && (
            <div className="row">
              <IconButton
                label={t('Page précédente de l’aperçu')}
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft size={17} />
              </IconButton>
              <span>
                {page + 1} / {doc.numPages}
              </span>
              <IconButton
                label={t('Page suivante de l’aperçu')}
                disabled={page >= doc.numPages - 1}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight size={17} />
              </IconButton>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
