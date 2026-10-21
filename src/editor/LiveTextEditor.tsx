import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Move } from 'lucide-react';
import { t } from '../i18n';
import { correctionBox } from '../pdf/objects';
import type { Annotation, NativeEdit, PageRef } from '../types';
import type { NativeRun } from '../pdf/native-text';
import type { PageViewport } from 'pdfjs-dist';
import { closestFont, cssFont, replacementFonts, replacementFontForText } from '../pdf/text-style';

export interface LiveTarget {
  key: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
  angle: number;
  background: string;
  color: string;
  font: string;
  run?: NativeRun;
  annotation?: Annotation;
  selection?: { start: number; end: number };
}
export function LiveTextEditor({
  target,
  page,
  viewport,
  changeNative,
  changeVisual,
  close,
  panel = false,
}: {
  target: LiveTarget;
  page: PageRef;
  viewport: PageViewport;
  changeNative: (edits: NativeEdit[], group: string) => void;
  changeVisual: (annotation: Annotation, group: string) => void;
  close: () => void;
  panel?: boolean;
}) {
  const initial = page.nativeEdits?.find((e) => e.id === target.run?.id);
  const [value, setValue] = useState(initial?.text ?? target.annotation?.text ?? target.text);
  const [size, setSize] = useState(initial?.size ?? target.annotation?.size ?? target.size);
  const [sizeDraft, setSizeDraft] = useState(String(Math.round(size * 100) / 100));
  const [font, setFont] = useState(initial?.font ?? target.annotation?.replacement?.font ?? '');
  const [background, setBackground] = useState(target.background),
    [color, setColor] = useState(target.color);
  const [fit, setFit] = useState(true);
  const [offset, setOffset] = useState(initial?.offset ?? { x: 0, y: 0 });
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    offset: { x: number; y: number };
  } | null>(null);
  // The input frame stays glued to the PDF text (rotation included) while the
  // toolbar floats in screen space: readable at any zoom, never tilted by the
  // page or text angle.
  const frame = useRef<HTMLDivElement>(null),
    input = useRef<HTMLTextAreaElement>(null),
    tools = useRef<HTMLDivElement>(null);
  const group = useRef(crypto.randomUUID());
  const currentEdit = page.nativeEdits?.find((e) => e.id === target.run?.id);
  const currentAnnotation = page.annotations.find(
    (a) => a.id === (target.annotation?.id ?? target.key),
  );
  const saved = JSON.stringify(target.run ? currentEdit : currentAnnotation);
  const lastSaved = useRef(saved);
  const native = !!target.run;
  const missing =
    target.run?.characters && Array.from(value).some((c) => !target.run!.characters!.includes(c));
  const chosenFont =
    font || !native || missing
      ? replacementFontForText(font || closestFont(target.font), value)
      : target.font;
  const style = cssFont(chosenFont);
  const measuring = useRef(document.createElement('canvas'));
  function fittedSize(text: string, requested: number, chosen: string, enabled: boolean) {
    const context = measuring.current.getContext('2d')!;
    const css = cssFont(chosen);
    context.font = `${css.fontStyle} ${css.fontWeight} ${requested}px ${css.fontFamily}`;
    return enabled
      ? Math.max(
          4,
          Math.min(
            requested,
            (requested * target.width) /
              Math.max(
                1,
                Math.max(...text.split('\n').map((line) => context.measureText(line).width)),
              ),
          ),
        )
      : requested;
  }
  const displaySize = fittedSize(value, size, chosenFont, fit);
  const [anchor, setAnchor] = useState({ left: 8, top: 8, above: false });
  const anchorRef = useRef(anchor);
  function updateAnchor() {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(312, window.innerWidth - 16);
    const height = tools.current?.getBoundingClientRect().height ?? 220;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const gap = window.innerHeight - rect.bottom;
    const above = gap < height + 16 && rect.top > height + 16;
    const next = {
      left,
      top: above
        ? Math.min(window.innerHeight - 8, Math.max(height + 8, rect.top - 8))
        : Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - height - 8)),
      above,
    };
    const prev = anchorRef.current;
    if (
      Math.abs(prev.left - next.left) < 1 &&
      Math.abs(prev.top - next.top) < 1 &&
      prev.above === next.above
    )
      return;
    anchorRef.current = next;
    setAnchor(next);
  }
  useEffect(() => {
    if (panel) return;
    input.current?.focus({ preventScroll: true });
    if (target.selection)
      input.current?.setSelectionRange(target.selection.start, target.selection.end);
    else input.current?.select();
    updateAnchor();
    const scroller = frame.current?.closest('.page-scroller');
    scroller?.addEventListener('scroll', updateAnchor, { passive: true });
    window.addEventListener('resize', updateAnchor);
    window.addEventListener('scroll', updateAnchor, true);
    // The floating toolbar lives outside the frame: exclude it explicitly so
    // interacting with it never counts as clicking away.
    const outside = (e: PointerEvent) => {
      const node = e.target as Node;
      if (frame.current?.contains(node)) return;
      if (tools.current?.contains(node)) return;
      close();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      scroller?.removeEventListener('scroll', updateAnchor);
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor, true);
    };
  }, []);
  // Zoom and re-render move the frame without scrolling: re-anchor every render.
  useEffect(() => {
    if (!panel) updateAnchor();
  });
  useEffect(() => {
    if (lastSaved.current === saved) return;
    lastSaved.current = saved;
    const edit = page.nativeEdits?.find((e) => e.id === target.run?.id);
    const annotation = page.annotations.find((a) => a.id === (target.annotation?.id ?? target.key));
    setValue(edit?.text ?? annotation?.text ?? target.text);
    const restoredSize = Math.round((edit?.size ?? annotation?.size ?? target.size) * 100) / 100;
    setSize(restoredSize);
    setSizeDraft(String(restoredSize));
    setFont(edit?.font ?? annotation?.replacement?.font ?? '');
    setColor(annotation?.color ?? target.color);
    setBackground(annotation?.replacement?.background ?? target.background);
    const baseline = annotation?.replacement?.baseline ?? target.size * 0.22;
    const radians = (target.angle * Math.PI) / 180;
    setOffset(
      edit?.offset ??
        (annotation
          ? {
              x: annotation.x - target.x - Math.sin(radians) * baseline,
              y: annotation.y - target.y + Math.cos(radians) * baseline,
            }
          : { x: 0, y: 0 }),
    );
  }, [saved, target]);
  function write(
    text: string,
    requested = size,
    selectedFont = font,
    bg = background,
    ink = color,
    autoFit = fit,
    position = offset,
  ) {
    const missing =
      target.run?.characters && Array.from(text).some((c) => !target.run!.characters!.includes(c));
    const resolved =
      selectedFont || !native || missing
        ? replacementFontForText(selectedFont || closestFont(target.font), text)
        : target.font;
    const actualSize = fittedSize(text, requested, resolved, autoFit);
    if (target.run) {
      const edit: NativeEdit = {
        id: target.run.id,
        original: target.run.text,
        text,
        size: actualSize,
        font: selectedFont || missing ? resolved : undefined,
        autoAdapt: true,
        offset: position,
      };
      lastSaved.current = JSON.stringify(edit);
      changeNative(
        [...(page.nativeEdits ?? []).filter((e) => e.id !== edit.id), edit],
        group.current,
      );
    } else {
      const { x, y, height, baseline } = correctionBox(
        target,
        target.annotation,
        text,
        actualSize,
        position,
      );
      const a: Annotation = {
        id: target.annotation?.id ?? target.key,
        type: 'text',
        text,
        size: actualSize,
        color: ink,
        x,
        y,
        width: Math.max(
          target.width,
          (Math.max(
            ...text
              .split('\n')
              .map((line) => measuring.current.getContext('2d')!.measureText(line).width),
          ) *
            actualSize) /
            requested,
        ),
        height,
        replacement: {
          background: bg,
          font: resolved,
          original: target.annotation?.replacement?.original ?? target.text,
          angle: target.angle,
          baseline,
          mask: target.annotation?.replacement?.mask ?? {
            x: target.x + Math.sin((target.angle * Math.PI) / 180) * target.size * 0.22,
            y: target.y - Math.cos((target.angle * Math.PI) / 180) * target.size * 0.22,
            width: target.width,
            height: target.height,
          },
        },
      };
      lastSaved.current = JSON.stringify(a);
      changeVisual(a, group.current);
    }
  }
  function commitSize(n: number) {
    const clamped = Math.max(4, Math.min(150, Math.round(n * 100) / 100));
    setSize(clamped);
    setSizeDraft(String(clamped));
    write(value, clamped);
  }
  function pointerInPage(event: React.PointerEvent) {
    const rect = frame.current!.closest('.pdf-page')!.getBoundingClientRect();
    return viewport.convertToPdfPoint(
      ((event.clientX - rect.left) * viewport.width) / rect.width,
      ((event.clientY - rect.top) * viewport.height) / rect.height,
    );
  }
  function moveText(event: React.PointerEvent) {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const next = pointerInPage(event);
    const position = {
      x: start.offset.x + next[0] - start.x,
      y: start.offset.y + next[1] - start.y,
    };
    setOffset(position);
    write(value, size, font, background, color, fit, position);
  }
  function cancelMove() {
    const start = drag.current;
    if (!start) return;
    drag.current = null;
    setOffset(start.offset);
    write(value, size, font, background, color, fit, start.offset);
  }
  const [a, b, c, d, e, f] = viewport.transform;
  const angle = (target.angle * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  const x = target.x - sin * target.size + offset.x,
    y = target.y + cos * target.size + offset.y;
  const matrix = [
    a * cos + c * sin,
    b * cos + d * sin,
    a * sin - c * cos,
    b * sin - d * cos,
    a * x + c * y + e,
    b * x + d * y + f,
  ];
  const toolbar = (
    <div
      ref={panel ? undefined : tools}
      className={
        panel
          ? 'text-list-tools'
          : `live-text-tools live-floating ${anchor.above ? 'above' : 'below'}`
      }
      style={
        panel
          ? undefined
          : {
              left: anchor.left,
              top: anchor.top,
              transform: anchor.above ? 'translateY(-100%)' : undefined,
            }
      }
    >
      <div className="live-text-heading">
        <span className={`live-kind ${native ? 'native' : 'visual'}`}>
          {native ? t('Texte du PDF') : t('Correction visuelle')}
        </span>
        <span className="live-saved">
          <i aria-hidden="true" />
          {t('En direct')}
        </span>
        {!panel && (
          <button
            title={t('Terminer la saisie')}
            aria-label={t('Terminer la saisie')}
            onClick={close}
          >
            {t('×')}
          </button>
        )}
      </div>
      <div className="live-format">
        <select
          aria-label={t('Police du texte')}
          value={font}
          onChange={(e) => {
            setFont(e.target.value);
            write(value, size, e.target.value);
          }}
        >
          <option value="">
            {t('Automatique ·')}
            {chosenFont.replace(/^[A-Z]{6}\+/, '')}
          </option>
          {replacementFonts.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <span className="size-stepper">
          <button
            type="button"
            aria-label={t('Diminuer la taille')}
            onClick={() => commitSize(size - 0.5)}
          >
            −
          </button>
          <input
            aria-label={t('Taille du texte')}
            type="number"
            min={4}
            max={150}
            step={0.5}
            value={sizeDraft}
            onChange={(e) => {
              setSizeDraft(e.target.value);
              const n = Number(e.target.value);
              if (e.target.value && n >= 4 && n <= 150) {
                setSize(n);
                write(value, n);
              }
            }}
            onBlur={() => setSizeDraft(String(size))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                input.current?.focus({ preventScroll: true });
              }
            }}
          />
          <button
            type="button"
            aria-label={t('Augmenter la taille')}
            onClick={() => commitSize(size + 0.5)}
          >
            +
          </button>
        </span>
      </div>
      <label className="live-fit">
        <input
          type="checkbox"
          checked={fit}
          onChange={(e) => {
            setFit(e.target.checked);
            write(value, size, font, background, color, e.target.checked);
          }}
        />
        {t('Adapter à la largeur')}
        {displaySize < size - 0.1 && ` · ${displaySize.toFixed(1)} pt`}
      </label>
      {!native && (
        <>
          <div className="live-format live-colors">
            <label>
              {t('Texte')}{' '}
              <input
                type="color"
                aria-label={t('Couleur du remplacement')}
                value={color}
                onChange={(e) => {
                  setColor(e.target.value);
                  write(value, size, font, background, e.target.value);
                }}
              />
            </label>
            <label>
              {t('Fond')}{' '}
              <input
                type="color"
                aria-label={t('Fond du remplacement')}
                value={background}
                onChange={(e) => {
                  setBackground(e.target.value);
                  write(value, size, font, e.target.value);
                }}
              />
            </label>
          </div>
          <small>
            {t(
              'Adaptation visuelle : le texte d’origine reste dans le fichier. Le fond peut nécessiter un ajustement.',
            )}
          </small>
        </>
      )}
      {native && (
        <small>
          {t(
            'Bloc natif sur une ligne. Ajoutez une zone de texte pour un paragraphe sur plusieurs lignes.',
          )}
        </small>
      )}
      {native && (missing || font) && (
        <small>
          {t('Police adaptée :')}
          {chosenFont}
          {t('. Vérifiez l’apparence après la saisie.')}
        </small>
      )}
      {!panel && (
        <div className="live-tools-actions">
          <span>
            {native
              ? t('Entrée pour terminer · Ctrl+Z pour annuler')
              : t('Entrée : nouvelle ligne · Ctrl+Entrée : terminer')}
          </span>
          <button type="button" className="button primary" onClick={close}>
            {t('Terminer')}
          </button>
        </div>
      )}
    </div>
  );
  if (panel)
    return (
      <div className="text-list-item">
        <textarea
          rows={1}
          ref={input}
          className="live-text-input"
          aria-label={t('Modifier ce texte sur la page')}
          value={value}
          maxLength={3000}
          onChange={(e) => {
            const text = native
              ? e.target.value.replace(/[\r\n]/g, ' ')
              : e.target.value.replace(/\r/g, '');
            setValue(text);
            write(text);
          }}
        />
        {toolbar}
      </div>
    );
  return (
    <>
      <div
        ref={frame}
        className="live-text-editor"
        style={{ width: Math.max(target.width + 8, 80), transform: `matrix(${matrix.join(',')})` }}
        onKeyDown={(e) => {
          if (
            !e.nativeEvent.isComposing &&
            (e.key === 'Escape' ||
              (e.key === 'Enter' &&
                e.target === input.current &&
                (native || e.ctrlKey || e.metaKey)))
          ) {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
      >
        <button
          className="text-move-handle"
          aria-label={t('Déplacer ce texte')}
          title={t('Glisser pour déplacer · flèches pour ajuster')}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            const [x, y] = pointerInPage(event);
            drag.current = { pointerId: event.pointerId, x, y, offset };
          }}
          onPointerMove={moveText}
          onPointerUp={(event) => {
            moveText(event);
            drag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={cancelMove}
          onLostPointerCapture={cancelMove}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
            const step = event.shiftKey ? 10 : 1;
            const [x0, y0] = viewport.convertToPdfPoint(0, 0);
            const [x1, y1] = viewport.convertToPdfPoint(
              event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
              event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0,
            );
            const position = { x: offset.x + x1 - x0, y: offset.y + y1 - y0 };
            setOffset(position);
            write(value, size, font, background, color, fit, position);
          }}
        >
          <Move size={15} />
        </button>
        <textarea
          rows={1}
          ref={input}
          className="live-text-input"
          aria-label={t('Modifier ce texte sur la page')}
          value={value}
          maxLength={3000}
          style={{
            ...style,
            fontSize: displaySize,
            height: Math.max(
              target.height,
              target.size * 1.3,
              displaySize * 1.3 * value.split('\n').length,
            ),
            lineHeight: '1.3',
            resize: 'none',
            overflow: 'hidden',
            color,
            background,
          }}
          onChange={(e) => {
            const text = native
              ? e.target.value.replace(/[\r\n]/g, ' ')
              : e.target.value.replace(/\r/g, '');
            setValue(text);
            write(text);
          }}
        />
      </div>
      {createPortal(toolbar, document.body)}
    </>
  );
}
