import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { setAutomaticDownloads, setLocalOpening } from '../background/opening';
import { errorMessage } from '../utils/files';
import { Button } from './ui';

export function FileOpeningControl({ kind }: { kind: 'local' | 'downloads' }) {
  const [state, setState] = useState({ wanted: false, granted: false, allowed: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const installed = typeof chrome !== 'undefined' && !!chrome.permissions;
  const key = kind === 'local' ? 'automaticFiles' : 'automaticDownloads';
  async function read() {
    if (!installed) return { wanted: false, granted: false, allowed: false };
    const [saved, granted, allowed] = await Promise.all([
      chrome.storage.local.get(key),
      chrome.permissions.contains({
        origins: ['file:///*'],
        ...(kind === 'downloads' ? { permissions: ['downloads'] } : {}),
      }),
      chrome.extension.isAllowedFileSchemeAccess(),
    ]);
    return { wanted: !!saved[key], granted, allowed };
  }
  useEffect(() => {
    let live = true;
    const refresh = () =>
      void read()
        .then((s) => {
          if (live) setState(s);
        })
        .catch((e) => {
          if (live) setError(errorMessage(e));
        });
    refresh();
    window.addEventListener('focus', refresh);
    if (installed) {
      chrome.storage.onChanged.addListener(refresh);
      chrome.permissions.onAdded.addListener(refresh);
      chrome.permissions.onRemoved.addListener(refresh);
    }
    return () => {
      live = false;
      window.removeEventListener('focus', refresh);
      if (installed) {
        chrome.storage.onChanged.removeListener(refresh);
        chrome.permissions.onAdded.removeListener(refresh);
        chrome.permissions.onRemoved.removeListener(refresh);
      }
    };
  }, [kind]);
  const repair = state.wanted && !state.granted && state.allowed;
  const ready = state.wanted && state.granted && state.allowed;
  const configure = kind === 'local' ? setLocalOpening : setAutomaticDownloads;
  async function change(enabled: boolean) {
    setBusy(true);
    setError('');
    try {
      // Invoke immediately from the click: permission requests need the user gesture.
      await configure(enabled);
      setState(await read());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="local-opening-card" aria-busy={busy}>
      <h3>{kind === 'local' ? t('PDF locaux dans le navigateur') : t('PDF téléchargés')}</h3>
      <p>
        {kind === 'local'
          ? t(
              'Ouvrez un PDF par Ctrl+O, glisser-déposer dans le navigateur ou adresse file:// : Nexus reprend le même onglet.',
            )
          : t(
              'Après un téléchargement PDF, Nexus ouvre sa copie locale. Les PDF exportés par Nexus ne sont pas rouverts.',
            )}
      </p>
      <div className="row">
        <Button disabled={busy || !installed} onClick={() => void change(repair || !state.wanted)}>
          {busy
            ? t('Autorisation en cours…')
            : repair
              ? t('Rétablir l’autorisation')
              : state.wanted
                ? kind === 'local'
                  ? t('Désactiver les PDF locaux')
                  : t('Désactiver l’ouverture des téléchargements')
                : kind === 'local'
                  ? t('Ouvrir les PDF locaux dans Nexus')
                  : t('Ouvrir aussi les PDF téléchargés')}
        </Button>
        {repair && (
          <Button disabled={busy} onClick={() => void change(false)}>
            {t('Désactiver')}
          </Button>
        )}
      </div>
      <p role="status" className={ready ? 'opening-ready' : 'muted'}>
        {!installed
          ? t('Cette option est disponible dans l’extension installée.')
          : ready
            ? kind === 'local'
              ? t('Activé pour les fichiers locaux.')
              : t('Activé pour les nouveaux téléchargements PDF.')
            : repair
              ? t(
                  'L’autorisation a été retirée. Rétablissez-la pour reprendre l’ouverture automatique.',
                )
              : state.wanted
                ? t('Configuré · en attente de l’accès aux URL de fichiers.')
                : t('Désactivé · vous pouvez toujours importer un PDF manuellement.')}
      </p>
      {installed && !state.allowed && (
        <div className="file-access-guide">
          <p>
            {t(
              'Dans les détails de PDF Nexus, activez « Autoriser l’accès aux URL de fichiers », puis revenez ici. Ce réglage du navigateur est nécessaire pour lire vos PDF locaux.',
            )}
          </p>
          <Button
            onClick={() =>
              void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` })
            }
          >
            {t('Ouvrir les détails de l’extension')}
          </Button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
