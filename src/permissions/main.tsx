import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Brand } from '../components/ui';
import { OpeningControl } from '../components/OpeningControl';
import { getPreferences } from '../storage';
import { setLanguage, t } from '../i18n';
import { version } from '../../package.json';
import '../styles.css';

function Permissions() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void getPreferences()
      .then((p) => {
        setLanguage(p.language);
        document.documentElement.dataset.theme =
          p.theme === 'auto'
            ? matchMedia('(prefers-color-scheme: dark)').matches
              ? 'dark'
              : 'light'
            : p.theme;
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  if (!ready) return null;
  return (
    <main className="permission-page">
      <Brand />
      <h1>{t('Ouvrir les liens PDF dans Nexus')}</h1>
      <p>
        {t(
          'Cliquez ci-dessous, puis confirmez la demande de Chrome ou Edge. Gardez cet onglet ouvert pendant l’activation.',
        )}
      </p>
      <p>
        {t(
          'L’accès aux sites et la détection des PDF permettent d’ouvrir les documents web dans Nexus. Aucun document n’est envoyé à un serveur.',
        )}
      </p>
      <OpeningControl />
      <p className="muted">
        {t(
          'Si l’accès a déjà été accordé, aucune nouvelle demande n’est nécessaire. Une fois l’activation confirmée, rouvrez votre lien PDF.',
        )}
      </p>
      <a className="button" href="./editor.html#settings">
        {t('Configurer les PDF locaux et téléchargés')}
      </a>
      <small className="muted">PDF Nexus {version}</small>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Permissions />);
