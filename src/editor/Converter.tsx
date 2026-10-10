import { t } from '../i18n';
import { useRef, useState } from 'react';
import { Upload, ArrowRight, FileText, X, Download, Plus, CheckCircle2 } from 'lucide-react';
import { Button, IconButton, SectionTitle, PrivacyBadge } from '../components/ui';
import type { Source, ConversionFormat, OutputFile, Preferences } from '../types';
import { readFile, fileSize, download, errorMessage } from '../utils/files';
import { convertSources, packageOutputs } from '../converters';
export type RunJob = (
  label: string,
  task: (signal: AbortSignal, progress: (n: number) => void) => Promise<void>,
) => Promise<void>;
export function Converter({
  prefs,
  run,
  current,
  notify,
}: {
  prefs: Preferences;
  run: RunJob;
  current?: () => Promise<Source>;
  notify: (text: string, error?: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [sources, setSources] = useState<Source[]>([]),
    [format, setFormat] = useState<ConversionFormat>('docx'),
    [range, setRange] = useState(''),
    [scale, setScale] = useState(prefs.exportScale),
    [outputs, setOutputs] = useState<OutputFile[]>([]);
  async function add(files: File[]) {
    try {
      const added: Source[] = [];
      for (const file of files)
        added.push(await readFile(file, ['pdf', 'docx', 'txt', 'png', 'jpg', 'jpeg']));
      setSources((s) => [...s, ...added]);
      setOutputs([]);
      if (added.some((s) => !s.name.toLowerCase().endsWith('.pdf'))) setFormat('pdf');
    } catch (e) {
      notify(errorMessage(e), true);
    }
  }
  const limitations: Record<ConversionFormat, string> = {
    docx: 'Le texte est reconstruit dans un fichier Word éditable. Images, colonnes et mise en page complexe ne sont pas conservées.',
    txt: 'Extraction de la couche de texte. Pour un scan, lancez l’OCR dans l’éditeur et utilisez son export TXT.',
    html: 'HTML textuel sécurisé, structuré par page. La mise en page visuelle du PDF n’est pas reproduite.',
    xlsx: 'Extraction géométrique de tableaux réguliers : au moins 3 lignes et 2 colonnes alignées. Les scans et tableaux complexes peuvent être refusés.',
    png: 'Une image PNG par page, regroupée dans un ZIP lorsque nécessaire. Les images ne sont plus éditables comme texte.',
    jpg: 'Une image JPEG par page. Compression avec pertes et fond blanc.',
    pdf: 'Les images sont réunies sur des pages A4 ; Word et TXT sont recomposés en texte simple, sans leur mise en page ni leurs images. Plusieurs fichiers sont fusionnés.',
  };
  return (
    <main className="converter content-page">
      <SectionTitle
        eyebrow={t('CHANGEZ DE PERSPECTIVE')}
        title={t('Le bon format, au bon moment.')}
        description={t('Des conversions réelles, directement sur votre appareil.')}
        action={<PrivacyBadge />}
      />
      <input
        type="file"
        ref={input}
        hidden
        multiple
        accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
        onChange={(e) => {
          void add(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <div className="conversion-layout">
        <section className="conversion-card">
          <div className="step-title">
            <span>01</span>
            <h2>{t('Vos fichiers')}</h2>
          </div>
          <button
            className="conversion-drop"
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void add(Array.from(e.dataTransfer.files));
            }}
          >
            <span>
              <Upload size={25} />
            </span>
            <strong>{t('Déposez vos fichiers ici')}</strong>
            <small>{t('ou cliquez pour les parcourir')}</small>
            <p>{t('PDF · DOCX · TXT · PNG · JPEG')}</p>
          </button>
          <div className="conversion-files">
            {sources.map((s, i) => (
              <div key={i}>
                <FileText size={18} />
                <span>
                  <strong>{s.name}</strong>
                  <small>{fileSize(s.bytes.length)}</small>
                </span>
                <IconButton
                  label={t('Retirer {name}', { name: s.name })}
                  onClick={() => setSources((v) => v.filter((_, j) => j !== i))}
                >
                  <X size={16} />
                </IconButton>
              </div>
            ))}
          </div>
          <div className="row">
            <Button onClick={() => input.current?.click()}>
              <Plus size={16} />
              {t('Ajouter des fichiers')}
            </Button>
            {current && (
              <Button
                onClick={() =>
                  void run('Préparation du document', async (signal) => {
                    const source = await current();
                    if (signal.aborted) return;
                    setSources([source]);
                    setOutputs([]);
                  })
                }
              >
                {t('Utiliser le PDF ouvert')}
              </Button>
            )}
          </div>
        </section>
        <section className="conversion-card">
          <div className="step-title">
            <span>02</span>
            <h2>{t('Votre format de sortie')}</h2>
          </div>
          <label className="field">
            {t('Convertir vers')}
            <select
              value={format}
              onChange={(e) => {
                setFormat(e.target.value as ConversionFormat);
                setOutputs([]);
              }}
            >
              {(
                [
                  { value: 'docx', label: 'Word — .docx' },
                  { value: 'txt', label: 'Texte — .txt' },
                  { value: 'xlsx', label: 'Excel — .xlsx' },
                  { value: 'html', label: 'Page HTML — .html' },
                  { value: 'png', label: 'Images PNG' },
                  { value: 'jpg', label: 'Images JPEG' },
                  { value: 'pdf', label: 'PDF — .pdf / fusion' },
                ] as const
              ).map((f) => (
                <option
                  key={f.value}
                  value={f.value}
                  disabled={f.value !== 'pdf' && sources.some((s) => !/\.pdf$/i.test(s.name))}
                >
                  {t(f.label)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('Pages des PDF')}
            <input
              placeholder={t('Toutes les pages (ex. 1, 3-5)')}
              value={range}
              onChange={(e) => setRange(e.target.value)}
            />
            <small>{t('La sélection s’applique à chaque PDF du lot.')}</small>
          </label>
          {['png', 'jpg'].includes(format) && (
            <label className="field">
              {t('Résolution')}
              <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
                <option value={1}>{t('72 dpi')}</option>
                <option value={1.5}>{t('108 dpi')}</option>
                <option value={2}>{t('144 dpi')}</option>
                <option value={3}>{t('216 dpi')}</option>
              </select>
            </label>
          )}
          <p className="notice">{t(limitations[format])}</p>
          <Button
            className="primary full-width"
            disabled={!sources.length}
            onClick={() =>
              void run('Conversion locale', async (signal, progress) => {
                const files = await convertSources(sources, format, range, scale, signal, progress);
                setOutputs(files);
                notify(t('{count} fichier(s) prêt(s).', { count: files.length }));
              })
            }
          >
            {t('Convertir')}{' '}
            {sources.length > 1
              ? t('les {count} fichiers', { count: sources.length })
              : t('le fichier')}{' '}
            <ArrowRight size={17} />
          </Button>
        </section>
      </div>
      {outputs.length > 0 && (
        <section className="conversion-results">
          <div>
            <CheckCircle2 size={22} />
            <div>
              <h2>{t('Vos fichiers sont prêts.')}</h2>
              <p>
                {outputs.length}
                {t('résultat(s) ·')} {fileSize(outputs.reduce((n, f) => n + f.bytes.length, 0))}
              </p>
            </div>
          </div>
          <Button
            className="primary"
            onClick={() => {
              const f = packageOutputs(outputs);
              download(f.bytes, f.name, f.mime);
            }}
          >
            <Download size={17} />
            {t('Télécharger')} {outputs.length > 1 ? t('le ZIP') : t('le résultat')}
          </Button>
          {outputs.map((f, i) => (
            <button
              className="result-file"
              key={i}
              onClick={() => download(f.bytes, f.name, f.mime)}
            >
              {f.name}
              <Download size={14} />
            </button>
          ))}
        </section>
      )}
    </main>
  );
}
