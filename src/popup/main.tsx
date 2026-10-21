import { useEffect, useRef, useState } from 'react';
import { listDrafts } from '../storage/drafts';
import { getPreferences, stageFile } from '../storage';
import { readFile, errorMessage } from '../utils/files';
import { t, setLanguage } from '../i18n';
import { createRoot } from 'react-dom/client';
import {
  FilePlus2,
  ArrowUpRight,
  Combine,
  ScanText,
  Sparkles,
  Settings,
  LockKeyhole,
} from 'lucide-react';
import { Brand, Button } from '../components/ui';
import '../styles.css';
import { openTabInNexus } from '../background/opening';
import { OpeningControl } from '../components/OpeningControl';
import { version } from '../../package.json';
function Popup() {
  const input = useRef<HTMLInputElement>(null);
  const [draftCount, setDraftCount] = useState(0);
  const [activeTab, setActiveTab] = useState<chrome.tabs.Tab>();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [, refresh] = useState(0);
  useEffect(() => {
    void listDrafts()
      .then((list) => setDraftCount(list.length))
      .catch(() => {});
    void chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => setActiveTab(tab));
    void getPreferences().then((p) => {
      setLanguage(p.language);
      const dark =
        p.theme === 'dark' ||
        (p.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      refresh(1);
    });
  }, []);
  function open(hash = '') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('editor.html' + hash) });
    window.close();
  }
  return (
    <div className="popup">
      <Brand compact />
      <input
        hidden
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try {
            const source = await readFile(file, ['pdf']);
            const id = await stageFile(source);
            await chrome.tabs.create({ url: chrome.runtime.getURL('editor.html#pending=' + id) });
            window.close();
          } catch (e) {
            setError(errorMessage(e));
            setBusy(false);
          }
        }}
      />
      {error && <p role="alert">{error}</p>}
      <span className="eyebrow">{t('TOUS VOS PDF. UN SEUL ESPACE.')}</span>
      <h1>
        {t('Moins de friction.')}
        <br />
        {t('Plus de possibilités.')}
      </h1>
      <p>{t('Lisez, annotez et transformez vos documents, en toute simplicité.')}</p>
      <Button className="primary popup-open" disabled={busy} onClick={() => input.current?.click()}>
        <FilePlus2 size={19} /> {t('Ouvrir un PDF')} <ArrowUpRight size={18} />
      </Button>
      {draftCount > 0 && (
        <Button className="popup-resume" onClick={() => open()}>
          {t('Reprendre mon travail ({count})', { count: draftCount })}
          <ArrowUpRight size={16} />
        </Button>
      )}
      <div className="popup-grid">
        <button onClick={() => open('#tools')}>
          <Combine />
          {t('Organiser')}
        </button>
        <button onClick={() => open('#convert')}>
          <ArrowUpRight />
          {t('Convertir')}
        </button>
        <button onClick={() => open('#ocr')}>
          <ScanText />
          {t('Reconnaître')}
        </button>
        <button onClick={() => open('#ai')}>
          <Sparkles />
          {t('Assistant IA')}
        </button>
      </div>
      <section className="popup-web">
        <strong>{t('Utiliser Nexus comme lecteur PDF')}</strong>
        <OpeningControl compact />
        <button className="button subtle" onClick={() => open('#settings')}>
          {t('Configurer les PDF locaux et téléchargés')}
        </button>
        {activeTab?.url && /^https?:/.test(activeTab.url) && (
          <button
            className="button primary"
            onClick={async () => {
              try {
                await openTabInNexus(activeTab);
                window.close();
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            {t('Ouvrir le PDF de cet onglet dans Nexus')}
          </button>
        )}
        <small>
          {t('Les liens PDF s’ouvrent dans cet onglet avec l’interface Nexus après autorisation.')}
        </small>
      </section>
      <footer>
        <span>
          <LockKeyhole size={13} />
          {t('Gratuit · Sans publicité')}
          {' · '}
          {version}
          {' · ZEBDA'}
        </span>
        <button aria-label={t('Paramètres')} onClick={() => open('#settings')}>
          <Settings size={16} />
        </button>
      </footer>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Popup />);
