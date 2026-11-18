import { t } from '../i18n';
import { useRef, useState } from 'react';
import { Minimize2, Download, Upload } from 'lucide-react';
import { zipSync } from 'fflate';
import { Button } from '../components/ui';
import type { Source } from '../types';
import { download, fileSize, readFile, safeName, errorMessage } from '../utils/files';
import {
  PRESETS,
  browserImageEncoder,
  compressPdfImages,
  compressToTarget,
  type CompressResult,
} from '../pdf/compress';
import { compressInWorker } from '../workers/client';
import type { RunJob } from './Converter';

type PresetKey = keyof typeof PRESETS | 'custom';

export function CompressPanel({
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
  const batchInput = useRef<HTMLInputElement>(null);
  const [preset, setPreset] = useState<PresetKey>('balanced'),
    [scale, setScale] = useState(PRESETS.balanced.scale),
    [quality, setQuality] = useState(PRESETS.balanced.quality),
    [target, setTarget] = useState(''),
    [grayscale, setGrayscale] = useState(false),
    [stripMetadata, setStripMetadata] = useState(true),
    [preview, setPreview] = useState<{ name: string; before: number; result: CompressResult }>();
  function choose(key: PresetKey) {
    setPreset(key);
    if (key !== 'custom') {
      setScale(PRESETS[key].scale);
      setQuality(PRESETS[key].quality);
    }
  }
  async function compressOne(
    bytes: Uint8Array,
    signal: AbortSignal,
    progress?: (n: number) => void,
    override?: { target?: string; preset?: PresetKey; stripMetadata?: boolean },
  ) {
    const activeTarget = override?.target ?? target;
    const activePreset = override?.preset ?? preset;
    const activeStrip = override?.stripMetadata ?? stripMetadata;
    const activeMaxDim = activePreset === 'custom' ? undefined : PRESETS[activePreset].maxDimension;
    const activeScale = activePreset === 'custom' ? scale : PRESETS[activePreset].scale;
    const activeQuality = activePreset === 'custom' ? quality : PRESETS[activePreset].quality;
    const targetMb = parseFloat(activeTarget.replace(',', '.'));
    const targetBytes = targetMb > 0 ? targetMb * 1024 * 1024 : undefined;
    if (typeof Worker !== 'undefined') {
      return compressInWorker(
        bytes,
        {
          scale: activeScale,
          quality: activeQuality,
          maxDimension: activeMaxDim,
          targetBytes,
          grayscale,
          stripMetadata: activeStrip,
        },
        signal,
        progress,
      );
    }
    if (targetBytes)
      return compressToTarget(
        bytes,
        targetBytes,
        {
          encode: browserImageEncoder,
          maxDimension: activeMaxDim,
          grayscale,
          stripMetadata: activeStrip,
          onProgress: progress,
        },
        signal,
      );
    return compressPdfImages(
      bytes,
      {
        scale: activeScale,
        quality: activeQuality,
        maxDimension: activeMaxDim,
        grayscale,
        stripMetadata: activeStrip,
        onProgress: progress,
        encode: browserImageEncoder,
      },
      signal,
    );
  }
  function analyse(override?: { target?: string; preset?: PresetKey; stripMetadata?: boolean }) {
    setPreview(undefined);
    void run('Compression du PDF', async (signal, progress) => {
      const source = await current(signal);
      const result = await compressOne(source.bytes, signal, progress, override);
      progress(1);
      setPreview({ name: source.name, before: source.bytes.length, result });
    });
  }
  function batch(files: File[]) {
    void run('Compression par lot', async (signal, progress) => {
      const entries: Record<string, Uint8Array> = {};
      const used = new Set<string>();
      for (const [i, file] of files.entries()) {
        try {
          const source = await readFile(file, ['pdf']);
          const result = await compressOne(source.bytes, signal);
          let name = safeName(source.name) + '-compresse.pdf';
          for (let n = 2; used.has(name); n++) name = `${safeName(source.name)}-compresse-${n}.pdf`;
          used.add(name);
          entries[name] = result.bytes;
        } catch (e) {
          if (signal.aborted) throw e;
          notify(`${file.name} : ${errorMessage(e)}`, true);
        }
        progress((i + 1) / files.length);
      }
      if (!Object.keys(entries).length) throw new Error('Aucun fichier compressé.');
      download(zipSync(entries, { level: 0 }), 'nexus-compresses.zip', 'application/zip');
      notify(t('{count} fichier(s) compressé(s).', { count: String(Object.keys(entries).length) }));
    });
  }
  const gain = preview ? Math.max(0, 1 - preview.result.bytes.length / preview.before) : 0;
  return (
    <>
      <h3>{t('Compression')}</h3>
      <div className="row compress-profiles" role="group" aria-label={t('Profils prêts à l’envoi')}>
        <Button
          disabled={locked}
          onClick={() => {
            setTarget('2');
            analyse({ target: '2' });
          }}
        >
          {t('Dépôt administratif (< 2 Mio)')}
        </Button>
        <Button
          disabled={locked}
          onClick={() => {
            setTarget('5');
            analyse({ target: '5' });
          }}
        >
          {t('E-mail (< 5 Mio)')}
        </Button>
        <Button
          disabled={locked}
          onClick={() => {
            setTarget('');
            choose('light');
            setStripMetadata(false);
            analyse({ target: '', preset: 'light', stripMetadata: false });
          }}
        >
          {t('Archivage fidèle')}
        </Button>
      </div>
      <div className="row">
        <select
          aria-label={t('Préréglage de compression')}
          value={preset}
          onChange={(e) => choose(e.target.value as PresetKey)}
        >
          <option value="light">{t('Léger')}</option>
          <option value="balanced">{t('Équilibré')}</option>
          <option value="strong">{t('Fort')}</option>
          <option value="custom">{t('Personnalisé')}</option>
        </select>
        <input
          aria-label={t('Taille cible en Mio')}
          placeholder={t('Taille cible (Mio)')}
          inputMode="decimal"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
      </div>
      {preset === 'custom' && !target && (
        <>
          <label>
            {t('Résolution des images : {value} %', { value: String(Math.round(scale * 100)) })}
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
            />
          </label>
          <label>
            {t('Qualité JPEG : {value} %', { value: String(Math.round(quality * 100)) })}
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
            />
          </label>
        </>
      )}
      <label className="check-field">
        <input
          type="checkbox"
          checked={stripMetadata}
          onChange={(e) => setStripMetadata(e.target.checked)}
        />{' '}
        {t('Supprimer les métadonnées (Info / XMP)')}
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={grayscale}
          onChange={(e) => setGrayscale(e.target.checked)}
        />{' '}
        {t('Convertir les images en niveaux de gris')}
      </label>
      <div className="row">
        <Button disabled={locked} onClick={() => analyse()}>
          <Minimize2 size={17} />
          {t('Calculer la compression')}
        </Button>
        <Button disabled={locked} onClick={() => batchInput.current?.click()}>
          <Upload size={17} />
          {t('Compresser plusieurs PDF (ZIP)')}
        </Button>
        <input
          ref={batchInput}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length) batch(files);
          }}
        />
      </div>
      {preview && (
        <div className="notice" role="status">
          {t('Avant : {before} — Après : {after} (−{percent} %).', {
            before: fileSize(preview.before),
            after: fileSize(preview.result.bytes.length),
            percent: String(Math.round(gain * 100)),
          })}{' '}
          {t('Images recompressées : {count}.', { count: String(preview.result.recompressed) })}
          {'reached' in preview.result && !(preview.result as { reached: boolean }).reached
            ? ' ' + t('La taille cible n’a pas pu être atteinte.')
            : ''}
          <div className="row">
            <Button
              onClick={() =>
                download(preview.result.bytes, safeName(preview.name) + '-compresse.pdf')
              }
            >
              <Download size={17} />
              {t('Télécharger')}
            </Button>
          </div>
        </div>
      )}
      <p className="notice">
        {t(
          'Compression locale : seules les images sont recompressées dans un worker dédié ; texte, liens et formulaires sont conservés. Aucun fichier n’est envoyé. Le résultat n’est jamais plus gros que l’original.',
        )}
      </p>
    </>
  );
}
