import { t } from '../i18n';
import { version } from '../../package.json';
import { FileOpeningControl } from '../components/FileOpeningControl';
import { OpeningControl } from '../components/OpeningControl';
import { useEffect, useState } from 'react';
import {
  Sun,
  Moon,
  Monitor,
  ShieldCheck,
  KeyRound,
  Trash2,
  Check,
  Download,
  Lock,
  Unlock,
  UserRound,
} from 'lucide-react';
import { Button, SectionTitle } from '../components/ui';
import type { Preferences, UserProfile } from '../types';
import { setKey, getKey, canPersist } from '../storage';
import { disableVault, lockVault, setupVault, unlockVault } from '../storage/vault';
import { allowEndpoint, localAvailability, prepareLocalModel } from '../ai';
import { errorMessage } from '../utils/files';

const emptyProfile: UserProfile = { name: '', email: '', phone: '', company: '' };

export function Settings({
  prefs,
  update,
  clear,
  notify,
  vaultEnabled,
  vaultUnlocked,
  onVaultChanged,
}: {
  prefs: Preferences;
  update: (p: Preferences) => void;
  clear: () => void;
  notify: (text: string, error?: boolean) => void;
  vaultEnabled: boolean;
  vaultUnlocked: boolean;
  onVaultChanged: () => Promise<void> | void;
}) {
  const [key, setInputKey] = useState(''),
    [available, setAvailable] = useState('unavailable'),
    [busy, setBusy] = useState(false),
    [passphrase, setPassphrase] = useState(''),
    [confirmPassphrase, setConfirmPassphrase] = useState(''),
    [vaultBusy, setVaultBusy] = useState(false);
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
  function updateProfile(field: keyof UserProfile, value: string) {
    update({
      ...prefs,
      profile: { ...(prefs.profile ?? emptyProfile), [field]: value },
    });
  }
  async function enableVault() {
    if (passphrase !== confirmPassphrase) {
      notify('Les deux phrases secrètes ne correspondent pas.', true);
      return;
    }
    setVaultBusy(true);
    try {
      await setupVault(passphrase);
      update({ ...prefs, vaultEnabled: true });
      await onVaultChanged();
      setPassphrase('');
      setConfirmPassphrase('');
      notify('Coffre local chiffré activé. Les données existantes ont été chiffrées.');
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setVaultBusy(false);
    }
  }
  async function handleUnlock() {
    setVaultBusy(true);
    try {
      await unlockVault(passphrase);
      await onVaultChanged();
      setPassphrase('');
      notify('Coffre local déverrouillé pour cette session.');
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setVaultBusy(false);
    }
  }
  async function handleDisableVault() {
    setVaultBusy(true);
    try {
      await disableVault(vaultUnlocked ? undefined : passphrase);
      update({ ...prefs, vaultEnabled: false });
      await onVaultChanged();
      setPassphrase('');
      setConfirmPassphrase('');
      notify('Coffre local désactivé. Les données enregistrées ont été déchiffrées.');
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setVaultBusy(false);
    }
  }
  const profile = prefs.profile ?? emptyProfile;
  const persisted = canPersist(prefs);
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
          <UserRound size={19} />
          {t('Profil d’identité local')}
        </h2>
        <p className="muted">
          {t(
            'Coordonnées facultatives conservées uniquement sur cet appareil pour remplir en un clic vos formulaires et documents via « Remplir et signer ».',
          )}
        </p>
        <div className="profile-grid">
          <label className="field">
            {t('Nom complet')}
            <input
              value={profile.name}
              onChange={(e) => updateProfile('name', e.target.value)}
              placeholder={t('Prénom Nom')}
            />
          </label>
          <label className="field">
            {t('Adresse e-mail')}
            <input
              type="email"
              value={profile.email}
              onChange={(e) => updateProfile('email', e.target.value)}
              placeholder={t('nom@exemple.fr')}
            />
          </label>
          <label className="field">
            {t('Téléphone')}
            <input
              type="tel"
              value={profile.phone}
              onChange={(e) => updateProfile('phone', e.target.value)}
              placeholder={t('+33 6 00 00 00 00')}
            />
          </label>
          <label className="field">
            {t('Organisation / entreprise')}
            <input
              value={profile.company}
              onChange={(e) => updateProfile('company', e.target.value)}
              placeholder={t('Facultatif')}
            />
          </label>
        </div>
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
        <div className="notice consent-status">
          <p>
            <strong>{t('Consentement au stockage local (IndexedDB) :')}</strong>{' '}
            {prefs.storageConsent === 'accepted'
              ? t('Autorisé')
              : prefs.storageConsent === 'declined'
                ? t('Refusé — édition et export sans enregistrement persistant')
                : t('Non défini')}
          </p>
          <div className="row">
            {persisted ? (
              <Button
                onClick={() =>
                  update({
                    ...prefs,
                    storageConsent: 'declined',
                    autoSave: false,
                    remember: false,
                  })
                }
              >
                {t('Suspendre et refuser la sauvegarde locale')}
              </Button>
            ) : (
              <Button
                className="primary"
                onClick={() =>
                  update({
                    ...prefs,
                    storageConsent: 'accepted',
                    autoSave: true,
                    remember: true,
                  })
                }
              >
                {t('Autoriser la sauvegarde locale')}
              </Button>
            )}
          </div>
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={persisted && prefs.autoSave}
            onChange={(e) =>
              update({
                ...prefs,
                storageConsent: e.target.checked
                  ? 'accepted'
                  : (prefs.storageConsent ?? 'declined'),
                autoSave: e.target.checked,
                remember: persisted ? prefs.remember : false,
              })
            }
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
            checked={persisted && prefs.remember}
            onChange={(e) =>
              update({
                ...prefs,
                storageConsent: e.target.checked
                  ? 'accepted'
                  : (prefs.storageConsent ?? 'declined'),
                autoSave: persisted ? prefs.autoSave : false,
                remember: e.target.checked,
              })
            }
          />{' '}
          {t('Conserver les fichiers récents et les échanges localement')}
        </label>
        <p className="muted">
          {t(
            '10 documents récents maximum, jusqu’à 100 Mio au total. Les brouillons automatiques ont leur propre espace local. Aucun tracker ni envoi automatique.',
          )}
        </p>
        <div className="vault-card">
          <h3>
            {vaultEnabled ? <Lock size={16} /> : <Unlock size={16} />}
            {t('Coffre local chiffré (AES-GCM 256 bits)')}
          </h3>
          <p className="muted">
            {t(
              'Chiffre les brouillons, fichiers récents et conversations enregistrés dans IndexedDB à l’aide d’une clé dérivée (PBKDF2) de votre phrase secrète. La phrase secrète n’est jamais enregistrée ; son oubli rend ces données illisibles.',
            )}
          </p>
          {!vaultEnabled ? (
            <>
              <div className="vault-fields">
                <label className="field">
                  {t('Phrase secrète du coffre')}
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder={t('Au moins 4 caractères')}
                  />
                </label>
                <label className="field">
                  {t('Confirmer la phrase secrète')}
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassphrase}
                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                    placeholder={t('Répétez la phrase secrète')}
                  />
                </label>
              </div>
              <Button
                disabled={vaultBusy || passphrase.length < 4}
                onClick={() => void enableVault()}
              >
                <Lock size={16} />
                {t('Activer le coffre chiffré')}
              </Button>
            </>
          ) : !vaultUnlocked ? (
            <>
              <label className="field">
                {t('Phrase secrète pour déverrouiller')}
                <input
                  type="password"
                  autoComplete="current-password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder={t('Saisissez votre phrase secrète')}
                />
              </label>
              <div className="row">
                <Button
                  className="primary"
                  disabled={vaultBusy || !passphrase}
                  onClick={() => void handleUnlock()}
                >
                  <Unlock size={16} />
                  {t('Déverrouiller le coffre')}
                </Button>
                <Button
                  disabled={vaultBusy || !passphrase}
                  onClick={() => void handleDisableVault()}
                >
                  {t('Déchiffrer et désactiver')}
                </Button>
              </div>
            </>
          ) : (
            <div className="row">
              <Button
                disabled={vaultBusy}
                onClick={() => {
                  lockVault();
                  void onVaultChanged();
                  notify('Coffre local verrouillé.');
                }}
              >
                <Lock size={16} />
                {t('Verrouiller le coffre')}
              </Button>
              <Button disabled={vaultBusy} onClick={() => void handleDisableVault()}>
                {t('Désactiver et déchiffrer')}
              </Button>
            </div>
          )}
        </div>
        <Button className="danger" onClick={clear}>
          <Trash2 size={16} />
          {t('Effacer les données locales')}
        </Button>
        <p className="muted">
          {t(
            'Cet effacement supprime récents, brouillons, échanges, profil local, configuration du coffre et clé API. Il ne supprime pas les fichiers téléchargés, les copies du système ou les données déjà reçues par un fournisseur.',
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
