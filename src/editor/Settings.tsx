import { t } from '../i18n';
import { version } from '../../package.json';
import { FileOpeningControl } from '../components/FileOpeningControl';
import { OpeningControl } from '../components/OpeningControl';
import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor, ShieldCheck, KeyRound, Trash2, Check, Download } from 'lucide-react';
import { Button, SectionTitle } from '../components/ui';
import type { Preferences } from '../types';
import { setKey, getKey } from '../storage';
import { allowEndpoint, localAvailability, prepareLocalModel } from '../ai';
import { errorMessage } from '../utils/files';
export function Settings({
  prefs,
  update,
  clear,
  notify,
}: {
  prefs: Preferences;
  update: (p: Preferences) => void;
  clear: () => void;
  notify: (text: string, error?: boolean) => void;
}) {
  const [key, setInputKey] = useState(''),
    [available, setAvailable] = useState('unavailable'),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void getKey().then(setInputKey);
    void localAvailability().then(setAvailable);
  }, []);
  async function authorize() {
    try {
      await allowEndpoint(prefs.endpoint);
      await setKey(key.trim());
      notify('Fournisseur autorisé. Clé conservée pour la session du navigateur.');
    } catch (e) {
      notify(errorMessage(e), true);
    }
  }
  async function prepare() {
    setBusy(true);
    try {
      await prepareLocalModel(new AbortController().signal, (n) =>
        notify(t('Téléchargement du modèle : {percent} %', { percent: Math.round(n * 100) })),
      );
      setAvailable(await localAvailability());
      notify('Modèle local prêt.');
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="settings content-page">
      <SectionTitle
        eyebrow={t('À VOTRE FAÇON')}
        title={t('Un espace qui vous ressemble.')}
        description={t('Personnalisation, intelligence artificielle et confidentialité.')}
      />
      <section className="settings-section">
        <h2>{t('Ouverture des PDF')}</h2>
        <p>
          {t(
            'Ouvrir les liens PDF directement dans Nexus. Autorisez l’accès aux sites dans la fenêtre du navigateur ; vos documents restent traités localement.',
          )}
        </p>
        <OpeningControl />
        <FileOpeningControl kind="local" />
        <FileOpeningControl kind="downloads" />
        <button
          className="button"
          onClick={() => {
            location.hash = '#setup';
            location.reload();
          }}
        >
          {t('Revoir la configuration initiale')}
        </button>
      </section>
      <section className="settings-section">
        <h2>{t('Apparence')}</h2>
        <div className="theme-options">
          {(
            [
              { value: 'light', label: 'Clair', Icon: Sun },
              { value: 'dark', label: 'Sombre', Icon: Moon },
              { value: 'auto', label: 'Système', Icon: Monitor },
            ] as const
          ).map((entry) => (
            <button
              className={prefs.theme === entry.value ? 'chosen' : ''}
              key={entry.value}
              onClick={() => update({ ...prefs, theme: entry.value })}
            >
              <entry.Icon size={20} />
              {t(entry.label)}
              {prefs.theme === entry.value && <Check size={15} />}
            </button>
          ))}
        </div>
        <label className="field">
          {t('Langue')}
          <select
            aria-label={t('Langue')}
            value={prefs.language}
            onChange={(e) =>
              update({ ...prefs, language: e.target.value as Preferences['language'] })
            }
          >
            <option value="fr">{t('Français')}</option>
            <option value="en">English</option>
          </select>
          <small>{t('La langue de l’interface ne modifie pas le contenu de vos documents.')}</small>
        </label>
        <label className="field">
          {t('Résolution des exports d’images')}
          <select
            value={prefs.exportScale}
            onChange={(e) => update({ ...prefs, exportScale: Number(e.target.value) })}
          >
            <option value={1}>{t('72 dpi — léger')}</option>
            <option value={1.5}>{t('108 dpi — équilibré')}</option>
            <option value={2}>{t('144 dpi — détaillé')}</option>
            <option value={3}>{t('216 dpi — haute qualité')}</option>
          </select>
        </label>
      </section>
      <section className="settings-section">
        <h2>
          <KeyRound size={19} />
          {t('Assistant documentaire')}
        </h2>
        <label className="field">
          {t('Mode de traitement')}
          <select
            value={prefs.aiMode}
            onChange={(e) => update({ ...prefs, aiMode: e.target.value as Preferences['aiMode'] })}
          >
            <option value="extract">
              {t('Extraits locaux — recherche déterministe, sans modèle')}
            </option>
            <option value="browser">{t('Modèle local du navigateur — selon disponibilité')}</option>
            <option value="api">{t('API personnelle / serveur compatible')}</option>
          </select>
        </label>
        {prefs.aiMode === 'extract' && (
          <p className="notice">
            {t(
              'Ce mode sélectionne des passages et détecte certains motifs. Reformulation, traduction et rédaction nécessitent un modèle génératif.',
            )}
          </p>
        )}
        {prefs.aiMode === 'browser' && (
          <div className="notice">
            <p>
              {t('Disponibilité du modèle natif :')}{' '}
              <strong>
                {available === 'available'
                  ? t('Prêt')
                  : available === 'unavailable'
                    ? t('Indisponible')
                    : available === 'downloading'
                      ? t('Téléchargement en cours')
                      : t('Téléchargement nécessaire')}
              </strong>
              {t(
                '. Le navigateur et le matériel déterminent la disponibilité. Aucun document n’est transmis pour l’inférence locale.',
              )}
            </p>
            <Button
              disabled={busy || available === 'unavailable' || available === 'available'}
              onClick={() => void prepare()}
            >
              <Download size={16} />
              {t('Télécharger / préparer le modèle')}
            </Button>
          </div>
        )}
        {prefs.aiMode === 'api' && (
          <>
            <p className="notice">
              {t(
                'Chaque envoi demande votre accord. Le fournisseur reçoit les extraits sélectionnés et les échanges récents. Ses tarifs et sa politique s’appliquent. Un serveur local (Ollama, par exemple) peut exposer une API compatible ; configurez son CORS.',
              )}
            </p>
            <label className="field">
              {t('URL complète Chat Completions')}
              <input
                type="url"
                placeholder={t('https://votre-fournisseur.example/v1/chat/completions')}
                value={prefs.endpoint}
                onChange={(e) => update({ ...prefs, endpoint: e.target.value })}
              />
            </label>
            <label className="field">
              {t('Identifiant du modèle')}
              <input
                placeholder={t('Identifiant fourni par votre fournisseur')}
                value={prefs.model}
                onChange={(e) => update({ ...prefs, model: e.target.value })}
              />
            </label>
            <label className="field">
              {t('Clé API personnelle')}
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder={t('Conservée uniquement pendant cette session')}
              />
            </label>
            <div className="row">
              <Button className="primary" onClick={() => void authorize()}>
                {t('Autoriser cette origine et enregistrer la clé')}
              </Button>
              <Button
                onClick={() => {
                  void setKey('');
                  setInputKey('');
                  notify('Clé supprimée.');
                }}
              >
                {t('Supprimer la clé')}
              </Button>
            </div>
            <small className="muted">
              {t(
                'Chrome Storage Session limite l’accès aux contextes de confiance. La clé n’est pas chiffrée avec un coffre-fort matériel.',
              )}
            </small>
            <Button
              className="subtle"
              onClick={async () => {
                if (typeof chrome !== 'undefined' && chrome.permissions) {
                  const p = await chrome.permissions.getAll();
                  await chrome.permissions.remove({ origins: p.origins ?? [] });
                  notify(
                    'Autorisations des sites et fichiers retirées. L’ouverture automatique nécessite une nouvelle autorisation.',
                  );
                }
              }}
            >
              {t('Révoquer tous les accès aux sites et fichiers')}
            </Button>
            <small className="muted">
              {t(
                'Cette action retire les accès de l’IA et de l’ouverture automatique. Les documents déjà importés restent disponibles.',
              )}
            </small>
          </>
        )}
      </section>
      <section className="settings-section">
        <h2>
          <ShieldCheck size={19} />
          {t('Vos données, vos règles')}
        </h2>
        <label className="check-field">
          <input
            type="checkbox"
            checked={prefs.autoSave}
            onChange={(e) => update({ ...prefs, autoSave: e.target.checked })}
          />
          {t('Sauvegarder automatiquement les brouillons sur cet appareil')}
        </label>
        <p className="muted">
          {t(
            '5 brouillons et 250 Mio maximum. Les 20 dernières actions sont conservées dans la limite de 20 Mio. Les PDF protégés et les clés API sont exclus.',
          )}
        </p>
        <label className="check-field">
          <input
            type="checkbox"
            checked={prefs.remember}
            onChange={(e) => update({ ...prefs, remember: e.target.checked })}
          />{' '}
          {t('Conserver les fichiers récents et les échanges localement')}
        </label>
        <p className="muted">
          {t(
            '10 documents récents maximum, jusqu’à 100 Mio au total. Les brouillons automatiques ont leur propre espace local. Aucun tracker ni envoi automatique.',
          )}
        </p>
        <Button className="danger" onClick={clear}>
          <Trash2 size={16} />
          {t('Effacer les données locales')}
        </Button>
        <p className="muted">
          {t(
            'Cet effacement ne supprime pas les fichiers téléchargés, les copies du système ou les données déjà reçues par un fournisseur.',
          )}
        </p>
      </section>
      <section className="settings-section">
        <h2>{t('À propos de PDF Nexus')}</h2>
        <p>
          {t('Version {version} · Gratuit · Sans publicité · Manifest V3', { version })}
          {' · ZEBDA'}
        </p>
        <p>
          {t(
            'Les ajouts exportés depuis cette version restent modifiables dans Nexus. Les anciens exports aplatis ne peuvent pas être séparés automatiquement. Pas de caviardage sécurisé ni de conservation des signatures numériques.',
          )}
        </p>
        <a href="./licenses.json" target="_blank" rel="noreferrer">
          {t('Bibliothèques, versions et licences')}
        </a>
      </section>
    </main>
  );
}
