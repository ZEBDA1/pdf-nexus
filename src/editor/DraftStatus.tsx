import { Check, CloudOff, LoaderCircle, AlertTriangle } from 'lucide-react';
import type { AutosaveStatus } from './useAutosave';
import { t, getLocale } from '../i18n';

export function DraftStatus({ status, retry }: { status: AutosaveStatus; retry: () => void }) {
  const time = status.saved
    ? new Date(status.saved).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <span className={`autosave-status ${status.kind}`} role="status" title={status.error}>
      {status.kind === 'saved' ? (
        <Check size={12} />
      ) : status.kind === 'saving' ? (
        <LoaderCircle size={12} className="spin" />
      ) : status.kind === 'error' ? (
        <AlertTriangle size={12} />
      ) : (
        <CloudOff size={12} />
      )}
      {status.kind === 'saved'
        ? t('Brouillon enregistré à {time}', { time })
        : status.kind === 'saving'
          ? t('Enregistrement du brouillon…')
          : status.kind === 'error'
            ? t('Brouillon non enregistré')
            : status.kind === 'idle'
              ? t('Aucune modification à sauvegarder')
              : t('Sauvegarde automatique désactivée')}
      {status.kind === 'error' && (
        <>
          <span className="autosave-error">{status.error}</span>
          <button onClick={retry}>{t('Réessayer')}</button>
        </>
      )}
    </span>
  );
}
