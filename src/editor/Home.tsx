import { t, getLocale } from '../i18n';
import {
  FilePlus2,
  ArrowUpRight,
  Combine,
  Scissors,
  ScanText,
  FileOutput,
  Sparkles,
  Clock3,
  ShieldCheck,
  Star,
  Trash2,
  FileText,
} from 'lucide-react';
import { Button, PrivacyBadge, SectionTitle, CardArrow, IconButton } from '../components/ui';
import type { Recent } from '../storage';
import type { DraftInfo } from '../storage/drafts';
import { fileSize } from '../utils/files';
export const tools = [
  {
    id: 'merge',
    title: 'Fusionner les PDF',
    description: 'Plusieurs documents, un seul fichier.',
    icon: Combine,
    color: 'purple',
  },
  {
    id: 'split',
    title: 'Organiser les pages',
    description: 'Divisez, extrayez et réorganisez.',
    icon: Scissors,
    color: 'blue',
  },
  {
    id: 'convert',
    title: 'Convertir un fichier',
    description: 'PDF, Word, images et bien plus.',
    icon: FileOutput,
    color: 'orange',
  },
  {
    id: 'ocr',
    title: 'Reconnaître le texte',
    description: 'Donnez une voix à vos scans.',
    icon: ScanText,
    color: 'green',
  },
];
export function Home({
  drafts,
  resumeDraft,
  removeDraft,
  open,
  drop,
  recent,
  reopen,
  remove,
  tool,
  favorites,
  toggleFavorite,
}: {
  drafts: DraftInfo[];
  resumeDraft: (id: string) => void;
  removeDraft: (id: string) => void;
  open: () => void;
  drop: (f: File[]) => void;
  recent: Recent[];
  reopen: (r: Recent) => void;
  remove: (id: string) => void;
  tool: (id: string) => void;
  favorites: string[];
  toggleFavorite: (id: string) => void;
}) {
  return (
    <main className="dashboard">
      <SectionTitle
        eyebrow={t('VOTRE ESPACE DE TRAVAIL')}
        title={t('Les PDF, simplement.')}
        description={t('Tout ce dont vous avez besoin. Rien de superflu.')}
        action={<PrivacyBadge />}
      />
      {drafts.length > 0 && (
        <section className="draft-recovery" aria-label={t('Brouillons à reprendre')}>
          <div>
            <span className="eyebrow">{t('REPRENDRE MON TRAVAIL')}</span>
            <h2>{t('Vos brouillons sont ici')}</h2>
            <p>
              {t(
                'Sauvegardés sur cet appareil · 5 brouillons et 250 Mio maximum · 20 actions d’historique maximum.',
              )}
            </p>
          </div>
          <div className="draft-list">
            {drafts.map((draft) => (
              <article key={draft.id} className="draft-card">
                <FileText size={24} />
                <div>
                  <strong>{draft.name}</strong>
                  <small>
                    {t('{pages} page(s) · {size}', {
                      pages: draft.pages,
                      size: fileSize(draft.size),
                    })}{' '}
                    · {new Date(draft.updated).toLocaleString(getLocale())}
                  </small>
                </div>
                <Button
                  className="primary"
                  onClick={() => resumeDraft(draft.id)}
                  aria-label={t('Reprendre {name}', { name: draft.name })}
                >
                  {t('Reprendre')}
                </Button>
                <IconButton
                  label={t('Supprimer le brouillon {name}', { name: draft.name })}
                  onClick={() => removeDraft(draft.id)}
                >
                  <Trash2 size={17} />
                </IconButton>
              </article>
            ))}
          </div>
        </section>
      )}
      <section
        className="hero"
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add('drag-over');
        }}
        onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove('drag-over');
          drop(Array.from(e.dataTransfer.files));
        }}
      >
        <div className="hero-copy">
          <span className="pill">{t('LOCAL PAR NATURE')}</span>
          <h2>
            {t('Vos documents.')}
            <br />
            <span>{t('Vos possibilités.')}</span>
          </h2>
          <p>
            {t('Un espace pour lire, annoter et transformer vos PDF.')}
            <br />
            {t('Vos fichiers restent sur votre appareil.')}
          </p>
          <Button className="primary" onClick={open}>
            <FilePlus2 size={18} />
            {t('Ouvrir un PDF')}
            <ArrowUpRight size={17} />
          </Button>
          <small>{t('ou glissez vos fichiers ici · PDF, jusqu’à 50 Mio')}</small>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="paper paper-back"></div>
          <div className="paper paper-main">
            <span className="paper-label">{t('PDF NEXUS')}</span>
            <div className="paper-title">
              {t('Toutes vos idées,')}
              <br />
              {t('bien organisées.')}
            </div>
            <div className="paper-lines">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="paper-chart">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="paper-footer">
              {t('UN NOUVEL ESPACE POUR VOS PDF')}
              <span>01</span>
            </div>
          </div>
          <span className="art-badge">
            <ShieldCheck size={17} />
            {t('100 % local')}
          </span>
          <span className="art-spark">
            <Sparkles size={23} />
          </span>
        </div>
      </section>
      <div className="subheading">
        <h2>
          {t('Votre boîte à outils')}
          <span>{t('4 outils essentiels')}</span>
        </h2>
        <button className="text-button" onClick={() => tool('all')}>
          {t('Tous les outils')}
          <ArrowUpRight size={15} />
        </button>
      </div>
      <div className="tool-grid">
        {tools.map((entry) => (
          <article className="tool-card" key={entry.id}>
            <button className="tool-card-main" onClick={() => tool(entry.id)}>
              <span className={`tool-icon ${entry.color}`}>
                <entry.icon size={22} />
              </span>
              <CardArrow />
              <h3>{t(entry.title)}</h3>
              <p>{t(entry.description)}</p>
            </button>
            <button
              className="favorite"
              title={
                favorites.includes(entry.id) ? t('Retirer des favoris') : t('Ajouter aux favoris')
              }
              aria-label={`${t(entry.title)} : ${t('Favori')}`}
              aria-pressed={favorites.includes(entry.id)}
              onClick={() => toggleFavorite(entry.id)}
            >
              <Star size={14} fill={favorites.includes(entry.id) ? 'currentColor' : 'none'} />
            </button>
          </article>
        ))}
      </div>
      <div className="lower-grid">
        <section className="recents">
          <div className="subheading">
            <h2>
              <Clock3 size={17} />
              {t('Documents récents')}
            </h2>
            <span className="muted">{t('Sur cet appareil')}</span>
          </div>
          {recent.length ? (
            <div className="recent-list">
              {recent.map((r) => (
                <div className="recent-row" key={r.id}>
                  <button onClick={() => reopen(r)}>
                    <span className="pdf-file-icon">
                      <FileText size={21} />
                      <small>{t('PDF')}</small>
                    </span>
                    <span>
                      <strong>{r.name}</strong>
                      <small>
                        {r.pages} {t('pages ·')}
                        {fileSize(r.size)} · {new Date(r.opened).toLocaleDateString(getLocale())}
                      </small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                  <IconButton
                    label={t('Supprimer {name} des fichiers récents', { name: r.name })}
                    onClick={() => remove(r.id)}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              ))}
            </div>
          ) : (
            <div className="recent-empty">
              <FileText size={26} />
              <p>{t('Votre prochain document commence ici.')}</p>
              <small>{t('Les PDF ouverts apparaîtront dans cet espace.')}</small>
            </div>
          )}
        </section>
        <section className="assistant-card">
          <span className="assistant-symbol">
            <Sparkles size={23} />
          </span>
          <span className="eyebrow">{t('UNE NOUVELLE PERSPECTIVE')}</span>
          <h2>
            {t('Faites parler')}
            <br />
            {t('vos documents.')}
          </h2>
          <p>{t('Retrouvez des passages, explorez les idées et posez vos questions.')}</p>
          <button className="text-button" onClick={() => tool('ai')}>
            {t('Découvrir l’assistant')}
            <ArrowUpRight size={16} />
          </button>
          <span className="assistant-note">{t('Extraits locaux · IA générative facultative')}</span>
        </section>
      </div>
      <div className="favorites-row">
        <Star size={16} />
        <strong>{t('Vos favoris')}</strong>
        {tools
          .filter((t) => favorites.includes(t.id))
          .map((t) => (
            <button key={t.id} onClick={() => tool(t.id)}>
              {t.title}
            </button>
          ))}
        {!favorites.length && (
          <span className="muted">{t('Ajoutez un outil avec son étoile.')}</span>
        )}
      </div>
      <footer className="dashboard-footer">
        <span>
          <ShieldCheck size={14} />
          {t('Vos fichiers vous appartiennent. Toujours.')}
        </span>
        <span>
          {t('Gratuit. Sans publicité. Sans abonnement.')}
          {' · ZEBDA'}
        </span>
      </footer>
    </main>
  );
}
