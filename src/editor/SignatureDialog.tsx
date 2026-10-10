import { useRef, useState } from 'react';
import { Modal, Button } from '../components/ui';
import { t } from '../i18n';
import { canvasBytes } from '../pdf/reader';

export function SignatureDialog({
  close,
  insert,
}: {
  close: () => void;
  insert: (image: { bytes: Uint8Array; type: 'png' | 'jpg'; aspect?: number }) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function clear() {
    canvas.current?.getContext('2d')?.clearRect(0, 0, 900, 300);
    setHasInk(false);
  }
  return (
    <Modal title={t('Créer ma signature')} close={close}>
      <div className="signature-dialog">
        <p>
          {t(
            'Dessinez votre signature ou saisissez votre nom. Elle est préparée uniquement sur cet appareil.',
          )}
        </p>
        <div className="row">
          <Button
            aria-pressed={mode === 'draw'}
            className={mode === 'draw' ? 'soft-primary' : ''}
            onClick={() => setMode('draw')}
          >
            {t('Dessiner')}
          </Button>
          <Button
            aria-pressed={mode === 'type'}
            className={mode === 'type' ? 'soft-primary' : ''}
            onClick={() => setMode('type')}
          >
            {t('Saisir mon nom')}
          </Button>
        </div>
        <canvas
          ref={canvas}
          width={900}
          height={300}
          hidden={mode !== 'draw'}
          className="signature-canvas"
          aria-label={t('Zone de dessin de la signature')}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            drawing.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            const r = e.currentTarget.getBoundingClientRect(),
              ctx = e.currentTarget.getContext('2d')!;
            ctx.strokeStyle = '#17213a';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(
              ((e.clientX - r.left) * 900) / r.width,
              ((e.clientY - r.top) * 300) / r.height,
            );
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const r = e.currentTarget.getBoundingClientRect(),
              ctx = e.currentTarget.getContext('2d')!;
            ctx.lineTo(
              ((e.clientX - r.left) * 900) / r.width,
              ((e.clientY - r.top) * 300) / r.height,
            );
            ctx.stroke();
            setHasInk(true);
          }}
          onPointerUp={(e) => {
            drawing.current = false;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            drawing.current = false;
          }}
        />
        {mode === 'type' && (
          <label className="field">
            {t('Votre nom')}
            <input
              aria-label={t('Votre nom')}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
            <span className="signature-preview">{name || t('Votre signature')}</span>
          </label>
        )}
        <small>
          {t(
            'Signature visuelle, sans certificat numérique. Placez-la sur la page puis déplacez-la avec l’outil Lire.',
          )}
        </small>
        {error && <p role="alert">{error}</p>}
        <div className="row">
          {mode === 'draw' && <Button onClick={clear}>{t('Effacer le dessin')}</Button>}
          <Button
            className="primary"
            disabled={busy || (mode === 'draw' ? !hasInk : !name.trim())}
            onClick={async () => {
              setBusy(true);
              try {
                const source = mode === 'draw' ? canvas.current! : document.createElement('canvas');
                if (mode === 'type') {
                  source.width = 900;
                  source.height = 160;
                  const ctx = source.getContext('2d')!;
                  ctx.font = 'italic 64px Georgia, serif';
                  ctx.fillStyle = '#17213a';
                  const width = ctx.measureText(name.trim()).width;
                  ctx.font = `italic ${Math.min(64, (64 * 860) / Math.max(1, width))}px Georgia, serif`;
                  ctx.fillText(name.trim(), 20, 105);
                }
                // Trim transparent margins to keep short signatures legible.
                const pixels = source
                  .getContext('2d')!
                  .getImageData(0, 0, source.width, source.height).data;
                let left = source.width,
                  top = source.height,
                  right = -1,
                  bottom = -1;
                for (let y = 0; y < source.height; y++)
                  for (let x = 0; x < source.width; x++) {
                    if (pixels[(y * source.width + x) * 4 + 3] > 0) {
                      left = Math.min(left, x);
                      top = Math.min(top, y);
                      right = Math.max(right, x);
                      bottom = Math.max(bottom, y);
                    }
                  }
                if (right < left)
                  throw new Error(t('Impossible de préparer la signature. Réessayez.'));
                left = Math.max(0, left - 10);
                top = Math.max(0, top - 10);
                right = Math.min(source.width - 1, right + 10);
                bottom = Math.min(source.height - 1, bottom + 10);
                const cropped = document.createElement('canvas');
                cropped.width = right - left + 1;
                cropped.height = bottom - top + 1;
                cropped
                  .getContext('2d')!
                  .drawImage(
                    source,
                    left,
                    top,
                    cropped.width,
                    cropped.height,
                    0,
                    0,
                    cropped.width,
                    cropped.height,
                  );
                insert({
                  bytes: await canvasBytes(cropped, 'png'),
                  type: 'png',
                  aspect: cropped.width / cropped.height,
                });
                close();
              } catch {
                setError(t('Impossible de préparer la signature. Réessayez.'));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('Placer la signature')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
