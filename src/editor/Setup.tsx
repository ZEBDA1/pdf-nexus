import { t } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import type { Preferences } from '../types';
import { Brand } from '../components/ui';
import { automaticOpeningEnabled, setAutomaticOpening } from '../background/opening';
import { errorMessage } from '../utils/files';
export function Setup({
  prefs,
  update,
  finish,
}: {
  prefs: Preferences;
  update: (p: Preferences) => void;
  finish: (p: Preferences) => void;
}) {
  const [step, setStep] = useState(0),
    [error, setError] = useState(''),
    [automatic, setAutomatic] = useState(false),
    [busy, setBusy] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void automaticOpeningEnabled().then(setAutomatic);
    const siblings = Array.from(container.current?.parentElement?.children ?? []).filter(
      (el) => el !== container.current,
    ) as HTMLElement[];
    siblings.forEach((el) => (el.inert = true));
    return () => siblings.forEach((el) => (el.inert = false));
  }, []);
  return (
    <div
      className="setup-backdrop"
      ref={container}
      role="dialog"
      aria-modal="true"
      aria-label={t('Configuration initiale')}
    >
      <main className="setup-card">
        <Brand />
        <div className="setup-steps">
          {[0, 1, 2, 3].map((n) => (
            <span key={n} className={n <= step ? 'active' : ''} />
          ))}
        </div>
        <p className="eyebrow">{t('BIENVENUE DANS VOTRE ESPACE PDF')}</p>
        <h1>
          {step === 0
            ? t('Commençons par votre langue.')
            : step === 1
              ? t('Un espace à votre image.')
              : step === 2
                ? t('Vos PDF, votre navigateur.')
                : t('Vos données sur cet appareil.')}
        </h1>
        {step === 0 && (
          <>
            <label className="field">
              {t('Langue de l’interface')}
              <select
                autoFocus
                value={prefs.language}
                onChange={(e) =>
                  update({ ...prefs, language: e.target.value as Preferences['language'] })
                }
              >
                <option value="fr">{t('Français')}</option>
                <option value="en">English</option>
              </select>
            </label>
            <p>{t('Vous pouvez changer ces préférences à tout moment dans les paramètres.')}</p>
          </>
        )}
        {step === 1 && (
          <div className="theme-options">
            {(['light', 'dark', 'auto'] as const).map((theme, i) => (
              <button
                key={theme}
                className={prefs.theme === theme ? 'chosen' : ''}
                onClick={() => update({ ...prefs, theme })}
              >
                {t(['Clair', 'Sombre', 'Système'][i])}
              </button>
            ))}
          </div>
        )}
        {step === 2 && (
          <>
            <p>
              {t(
                'Ouvrez les liens PDF et les nouveaux téléchargements PDF dans l’éditeur local de l’extension.',
              )}
            </p>
            <button
              className="button"
              disabled={busy || automatic}
              onClick={async () => {
                setBusy(true);
                try {
                  await setAutomaticOpening(true);
                  setAutomatic(await automaticOpeningEnabled());
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy
                ? t('Autorisation en cours…')
                : automatic
                  ? t('Ouverture automatique activée')
                  : t('Activer l’ouverture des PDF web')}
            </button>
            <small>
              {t(
                'Facultatif. Acceptez la demande d’accès aux sites du navigateur. L’ouverture des téléchargements se règle séparément dans les paramètres. Aucun document n’est envoyé à un service tiers.',
              )}
            </small>
          </>
        )}
        {step === 3 && (
          <>
            <p>
              {t(
                'Pour permettre la reprise de vos documents, PDF Nexus peut enregistrer localement dans votre navigateur (IndexedDB) les fichiers récents, brouillons, annotations, valeurs de formulaires et échanges avec l’assistant.',
              )}
            </p>
            <small>
              {t(
                'Aucun document n’est envoyé en ligne. En cas de refus, vous pouvez ouvrir, éditer et exporter vos PDF normalement, sans conservation après fermeture de l’onglet. Modifiable à tout moment dans les paramètres (avec chiffrement local facultatif par phrase secrète).',
              )}
            </small>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <footer>
          {step > 0 && (
            <button className="button" onClick={() => setStep(step - 1)}>
              {t('Retour')}
            </button>
          )}
          {step < 3 ? (
            <button className="button primary" onClick={() => setStep(step + 1)}>
              {t('Continuer')}
            </button>
          ) : (
            <>
              <button
                className="button"
                onClick={() =>
                  finish({
                    ...prefs,
                    storageConsent: 'declined',
                    autoSave: false,
                    remember: false,
                    setupCompleted: true,
                  })
                }
              >
                {t('Éditer sans sauvegarde locale')}
              </button>
              <button
                className="button primary"
                onClick={() =>
                  finish({
                    ...prefs,
                    storageConsent: 'accepted',
                    autoSave: true,
                    remember: true,
                    setupCompleted: true,
                  })
                }
              >
                {t('Autoriser la sauvegarde locale')}
              </button>
            </>
          )}
        </footer>
        <p className="setup-privacy">{t('Gratuit. Local par défaut. Sans publicité.')}</p>
      </main>
    </div>
  );
}
