import { t } from '../i18n';
import { useState } from 'react';
import { watermarkFor } from '../pdf/watermark';
import type { Workspace, Watermark } from '../types';
export function WatermarkControls({
  workspace,
  update,
}: {
  workspace: Workspace;
  update: (w: Watermark) => void;
}) {
  const [w, set] = useState(() => watermarkFor(workspace.watermark, workspace.watermarkOptions));
  const change = (p: Partial<Watermark>) => set({ ...w, ...p });
  return (
    <fieldset className="watermark-controls">
      <legend>{t('Filigrane personnalisé')}</legend>
      <label className="field">
        {t('Texte')}
        <input
          maxLength={100}
          value={w.text}
          onChange={(e) => change({ text: e.target.value })}
          placeholder={t('CONFIDENTIEL')}
        />
      </label>
      <div className="row">
        <label>
          {t('Taille (pt)')}
          <input
            aria-label={t('Taille du filigrane')}
            type="number"
            min={8}
            max={100}
            value={w.size}
            onChange={(e) => change({ size: Math.max(8, Math.min(100, +e.target.value)) })}
          />
        </label>
        <label>
          {t('Couleur')}
          <input
            aria-label={t('Couleur du filigrane')}
            type="color"
            value={w.color}
            onChange={(e) => change({ color: e.target.value })}
          />
        </label>
      </div>
      <label className="field">
        {t('Opacité :')}
        {Math.round(w.opacity * 100)} %
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={w.opacity}
          onChange={(e) => change({ opacity: +e.target.value })}
        />
      </label>
      <label className="field">
        {t('Angle :')}
        {w.angle}°
        <input
          type="range"
          min={-90}
          max={90}
          value={w.angle}
          onChange={(e) => change({ angle: +e.target.value })}
        />
      </label>
      <div className="row">
        <select
          aria-label={t('Position du filigrane')}
          value={w.position}
          onChange={(e) => change({ position: e.target.value as Watermark['position'] })}
        >
          <option value="center">{t('Au centre')}</option>
          <option value="top">{t('En haut')}</option>
          <option value="bottom">{t('En bas')}</option>
        </select>
        <select
          aria-label={t('Pages du filigrane')}
          value={w.pages}
          onChange={(e) => change({ pages: e.target.value as Watermark['pages'] })}
        >
          <option value="all">{t('Toutes les pages')}</option>
          <option value="odd">{t('Pages impaires')}</option>
          <option value="even">{t('Pages paires')}</option>
        </select>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={w.repeat}
          onChange={(e) => change({ repeat: e.target.checked })}
        />
        {t('Répéter en mosaïque')}
      </label>
      <div className="row">
        <button className="button primary" onClick={() => update(w)}>
          {t('Appliquer le filigrane')}
        </button>
        <button
          className="button"
          onClick={() => {
            change({ text: '' });
            update({ ...w, text: '' });
          }}
        >
          {t('Retirer le filigrane Nexus')}
        </button>
      </div>
      <small>
        {t(
          'Retrait des filigranes ajoutés dans cette session. Les filigranes du document d’origine ne sont pas supprimés.',
        )}
      </small>
    </fieldset>
  );
}
