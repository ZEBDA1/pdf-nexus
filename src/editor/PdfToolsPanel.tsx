import { t } from '../i18n';
import { useState } from 'react';
import { Button } from '../components/ui';
import type { Source } from '../types';
import { download, safeName } from '../utils/files';
import {
  extractImages,
  formatOutline,
  parseOutline,
  readMetadata,
  readOutline,
  stampPages,
  writeMetadata,
  writeOutline,
  zipImages,
  type Metadata,
} from '../pdf/tools';
import { PDFDocument } from 'pdf-lib';
import type { RunJob } from './Converter';

export function PdfToolsPanel({
  run,
  current,
  notify,
  locked,
}: {
  run: RunJob;
  current: (signal?: AbortSignal) => Promise<Source>;
  notify: (text: string, error?: boolean) => void;
  locked: boolean;
}) {
  const [meta, setMeta] = useState<Metadata>({ title: '', author: '', subject: '', keywords: '' }),
    [header, setHeader] = useState(''),
    [footer, setFooter] = useState('{n} / {total}'),
    [bates, setBates] = useState(''),
    [outline, setOutline] = useState('');
  const field = (key: keyof Metadata, label: string) => (
    <input
      aria-label={t(label)}
      placeholder={t(label)}
      value={meta[key]}
      onChange={(e) => setMeta({ ...meta, [key]: e.target.value })}
    />
  );
  function task(label: string, job: (source: Source) => Promise<void>) {
    void run(label, async (signal, progress) => {
      const source = await current(signal);
      await job(source);
      progress(1);
    });
  }
  return (
    <>
      <h3>{t('Métadonnées')}</h3>
      <div className="row">
        {field('title', 'Titre')}
        {field('author', 'Auteur')}
        {field('subject', 'Sujet')}
        {field('keywords', 'Mots-clés (séparés par des virgules)')}
      </div>
      <div className="row">
        <Button
          disabled={locked}
          onClick={() =>
            task('Lecture des métadonnées', async (s) => setMeta(await readMetadata(s.bytes)))
          }
        >
          {t('Lire les métadonnées')}
        </Button>
        <Button
          disabled={locked}
          onClick={() =>
            task('Écriture des métadonnées', async (s) =>
              download(await writeMetadata(s.bytes, meta), safeName(s.name) + '-metadonnees.pdf'),
            )
          }
        >
          {t('Appliquer et télécharger')}
        </Button>
      </div>
      <h3>{t('Numérotation, en-têtes et pieds de page')}</h3>
      <p className="muted">
        {t('Variables : {n} page, {total} nombre de pages, {bates} numéro Bates.')}
      </p>
      <div className="row">
        <input
          aria-label={t('En-tête')}
          placeholder={t('En-tête')}
          value={header}
          onChange={(e) => setHeader(e.target.value)}
        />
        <input
          aria-label={t('Pied de page')}
          placeholder={t('Pied de page')}
          value={footer}
          onChange={(e) => setFooter(e.target.value)}
        />
        <input
          aria-label={t('Préfixe Bates')}
          placeholder={t('Préfixe Bates (vide = désactivé)')}
          value={bates}
          onChange={(e) => setBates(e.target.value)}
        />
      </div>
      <Button
        disabled={locked}
        onClick={() =>
          task('Ajout de la numérotation', async (s) =>
            download(
              await stampPages(s.bytes, {
                header,
                footer,
                bates: bates ? { prefix: bates, start: 1, digits: 6 } : undefined,
              }),
              safeName(s.name) + '-numerote.pdf',
            ),
          )
        }
      >
        {t('Appliquer et télécharger')}
      </Button>
      <h3>{t('Signets')}</h3>
      <textarea
        aria-label={t('Signets')}
        placeholder={t('Un signet par ligne : Titre | page')}
        rows={4}
        value={outline}
        onChange={(e) => setOutline(e.target.value)}
      />
      <div className="row">
        <Button
          disabled={locked}
          onClick={() =>
            task('Lecture des signets', async (s) =>
              setOutline(formatOutline(await readOutline(s.bytes))),
            )
          }
        >
          {t('Lire les signets')}
        </Button>
        <Button
          disabled={locked}
          onClick={() =>
            task('Écriture des signets', async (s) => {
              const doc = await PDFDocument.load(s.bytes, { updateMetadata: false });
              const items = parseOutline(outline, doc.getPageCount());
              download(await writeOutline(s.bytes, items), safeName(s.name) + '-signets.pdf');
            })
          }
        >
          {t('Appliquer et télécharger')}
        </Button>
      </div>
      <h3>{t('Images du document')}</h3>
      <Button
        disabled={locked}
        onClick={() =>
          task('Extraction des images', async (s) => {
            const images = await extractImages(s.bytes);
            if (!images.length) {
              notify('Aucune image extractible dans ce document.', true);
              return;
            }
            download(zipImages(images), safeName(s.name) + '-images.zip', 'application/zip');
            notify(t('{count} image(s) extraite(s).', { count: String(images.length) }));
          })
        }
      >
        {t('Extraire toutes les images (ZIP)')}
      </Button>
    </>
  );
}
