import { t } from '../i18n';
import { useEffect, useState } from 'react';
import {
  automaticOpeningEnabled,
  openingAccessGranted,
  setAutomaticOpening,
} from '../background/opening';
import { errorMessage } from '../utils/files';

export function OpeningControl({ compact = false }: { compact?: boolean }) {
  const [active, setActive] = useState(false);
  const [granted, setGranted] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<'permission' | 'rules' | 'repair'>('permission');
  const [error, setError] = useState('');
  const [storedError, setStoredError] = useState('');
  const installed = typeof chrome !== 'undefined' && !!chrome.permissions;
  useEffect(() => {
    const refresh = () => {
      void Promise.all([automaticOpeningEnabled(), openingAccessGranted()])
        .then(([active, granted]) => {
          setActive(active);
          setGranted(granted);
        })
        .catch((e) => setError(errorMessage(e)))
        .finally(() => setReady(true));
      if (typeof chrome !== 'undefined' && chrome.storage)
        void chrome.storage.local
          .get('openingError')
          .then((s) => {
            if (typeof s.openingError === 'string') setStoredError(t(s.openingError));
          })
          .catch((e) => setError(errorMessage(e)));
    };
    refresh();
    window.addEventListener('focus', refresh);
    if (typeof chrome !== 'undefined') {
      chrome.storage?.onChanged.addListener(refresh);
      chrome.permissions?.onAdded.addListener(refresh);
      chrome.permissions?.onRemoved.addListener(refresh);
    }
    return () => {
      window.removeEventListener('focus', refresh);
      if (typeof chrome !== 'undefined') {
        chrome.storage?.onChanged.removeListener(refresh);
        chrome.permissions?.onAdded.removeListener(refresh);
        chrome.permissions?.onRemoved.removeListener(refresh);
      }
    };
  }, []);
  return (
    <div className="opening-control" aria-busy={busy}>
      <button
        className={`button ${active ? '' : 'primary'}`}
        disabled={busy || !ready || !installed}
        onClick={async () => {
          if (compact && !active && !granted) {
            // A stable tab owns the native prompt; the action popup can close or
            // cover that prompt when Chrome transfers focus.
            try {
              await chrome.tabs.create({ url: chrome.runtime.getURL('permissions.html') });
              window.close();
            } catch (e) {
              setError(errorMessage(e));
            }
            return;
          }
          setBusy(true);
          setError('');
          try {
            await setAutomaticOpening(!active, granted, setStage);
            setActive(await automaticOpeningEnabled());
            setGranted(await openingAccessGranted());
            setError('');
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {!installed
          ? t('Cette option est disponible dans l’extension installée.')
          : busy
            ? stage === 'permission'
              ? t('Autorisation en cours…')
              : t('Configuration en cours…')
            : active
              ? t('Désactiver l’ouverture automatique')
              : compact
                ? t('Activer l’ouverture automatique')
                : t('Activer l’ouverture des PDF web')}
      </button>
      <small role="status">
        {busy
          ? stage === 'permission'
            ? t('Acceptez la demande du navigateur pour continuer.')
            : stage === 'repair'
              ? t('Réparation du service d’ouverture…')
              : t('Configuration de l’ouverture des PDF…')
          : active
            ? t('Activée · les nouveaux liens PDF s’ouvrent dans Nexus.')
            : t('Désactivée · ouverture manuelle disponible.')}
      </small>
      {!active && granted && !busy && (
        <small>
          {t('Accès déjà autorisé : l’ouverture peut être activée sans nouvelle demande.')}
        </small>
      )}
      {compact && !active && !granted && (
        <small>
          {t('L’autorisation se confirme dans un onglet dédié, pour garder la demande visible.')}
        </small>
      )}
      {(error || (!active && storedError)) && <p role="alert">{error || storedError}</p>}
    </div>
  );
}
