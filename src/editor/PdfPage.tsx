import { LiveTextEditor, type LiveTarget } from './LiveTextEditor';
import { cssFont, sampleTextColors } from '../pdf/text-style';
import { CheckboxLayer } from './CheckboxLayer';
import { detectPrintedBoxes, type Box } from '../pdf/checkboxes';
import { t } from '../i18n';
import { getFont } from '../workers/client';
import { nativePreview, listNativeRuns, type NativeRun } from '../pdf/native-text';
import { loadPdf } from '../pdf/reader';
import { watermarkFor, watermarkPositions } from '../pdf/watermark';
import { useEffect, useRef, useState } from 'react';
import {
  TextLayer,
  type PDFDocumentProxy,
  type PageViewport,
  type RenderTask,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { Annotation, PageRef, Point, Tool, Source, Watermark, NativeEdit } from '../types';
import { uid } from '../utils/files';
import { previewLines } from '../pdf/annotation-text';
import '../pdf/text-layer.css';

function ImageAnnotation({ a }: { a: Annotation }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!a.image) return;
    const u = URL.createObjectURL(
      new Blob([a.image.slice().buffer as ArrayBuffer], {
        type: a.imageType === 'png' ? 'image/png' : 'image/jpeg',
      }),
    );
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [a.image, a.imageType]);
  return (
    <image
      href={url || undefined}
      x={a.x}
      y={-a.y - a.height}
      width={a.width}
      height={a.height}
      transform="scale(1 -1)"
    />
  );
}
function AnnotationShape({ a }: { a: Annotation }) {
  const width = Math.max(0.5, a.size / 6);
  const x = a.x,
    y = a.y,
    w = a.width,
    h = a.height;
  if (a.type === 'checkbox')
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill="white"
          stroke={a.color}
          strokeWidth={Math.max(0.5, w / 18)}
        />
        {a.checked && (
          <polyline
            points={`${x + w * 0.18},${y + h * 0.5} ${x + w * 0.42},${y + h * 0.24} ${x + w * 0.83},${y + h * 0.8}`}
            fill="none"
            stroke={a.color}
            strokeWidth={Math.max(1, w / 9)}
          />
        )}
      </g>
    );
  if (a.replacement) {
    const r = a.replacement;
    return (
      <g>
        <rect
          transform={`translate(${r.mask?.x ?? x} ${r.mask?.y ?? y}) rotate(${r.angle})`}
          width={r.mask?.width ?? w}
          height={r.mask?.height ?? h}
          fill={r.background}
        />
        <g transform={`translate(${x} ${y}) rotate(${r.angle})`}>
          <text
            transform="scale(1 -1)"
            y={-r.baseline}
            fontSize={a.size}
            fill={a.color}
            style={cssFont(r.font)}
          >
            {a.text}
          </text>
        </g>
      </g>
    );
  }
  if (['text', 'stamp', 'note', 'link'].includes(a.type))
    return (
      <g>
        {a.type === 'note' && <rect x={x} y={y} width={w} height={h} fill="#fff5c7" />}
        {a.type === 'stamp' && (
          <rect x={x} y={y} width={w} height={h} fill="none" stroke={a.color} strokeWidth={1.5} />
        )}
        <text
          x={x + 4}
          y={-y - h + a.size + 3}
          transform="scale(1 -1)"
          fill={a.color}
          fontSize={a.size}
          fontFamily="Noto Sans, sans-serif"
        >
          {previewLines(a.text ?? '', a.size, Math.max(10, w - 8))
            .slice(0, Math.max(1, Math.floor((h - 4) / (a.size * 1.3))))
            .map((line, i) => (
              <tspan x={x + 4} dy={i ? a.size * 1.3 : 0} key={i}>
                {line}
              </tspan>
            ))}
        </text>
      </g>
    );
  if (a.type === 'image') return <ImageAnnotation a={a} />;
  if (a.type === 'highlight')
    return <rect x={x} y={y} width={w} height={h} fill={a.color} opacity={0.3} />;
  if (a.type === 'rect')
    return (
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={a.color} strokeWidth={width} />
    );
  if (a.type === 'ellipse')
    return (
      <ellipse
        cx={x + w / 2}
        cy={y + h / 2}
        rx={w / 2}
        ry={h / 2}
        fill="none"
        stroke={a.color}
        strokeWidth={width}
      />
    );
  if (a.type === 'underline' || a.type === 'strike')
    return (
      <line
        x1={x}
        x2={x + w}
        y1={y + (a.type === 'strike' ? h / 2 : 1)}
        y2={y + (a.type === 'strike' ? h / 2 : 1)}
        stroke={a.color}
        strokeWidth={width}
      />
    );
  const points = a.points ?? [
    { x, y },
    { x: x + w, y: y + h },
  ];
  return (
    <g>
      <polyline
        points={points.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke={a.color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {a.type === 'arrow' &&
        (() => {
          const start = points[0],
            end = points.at(-1)!,
            angle = Math.atan2(end.y - start.y, end.x - start.x),
            l = Math.max(9, a.size);
          return [-0.45, 0.45].map((d) => (
            <line
              key={d}
              x1={end.x}
              y1={end.y}
              x2={end.x - l * Math.cos(angle + d)}
              y2={end.y - l * Math.sin(angle + d)}
              stroke={a.color}
              strokeWidth={width}
            />
          ));
        })()}
    </g>
  );
}
export function PdfPage({
  doc,
  source,
  nativeMode = false,
  detectBoxes = false,
  readOnly = false,
  onNativeEdits,
  onVisualEdit,
  watermarkOptions,
  reference,
  index,
  zoom = 1,
  thumbnail = false,
  tool = 'select',
  color = '#6456ed',
  size = 14,
  text = '',
  link = '',
  image,
  selected,
  onAdd,
  onUpdate,
  onSelect,
  onError,
  watermark = '',
  numbering = false,
  total = 0,
}: {
  doc: PDFDocumentProxy;
  source?: Source;
  nativeMode?: boolean;
  detectBoxes?: boolean;
  readOnly?: boolean;
  onNativeEdits?: (edits: NativeEdit[], group: string) => void;
  onVisualEdit?: (a: Annotation, group: string) => void;
  watermarkOptions?: Watermark;
  reference: PageRef;
  index: number;
  zoom?: number;
  thumbnail?: boolean;
  tool?: Tool;
  color?: string;
  size?: number;
  text?: string;
  link?: string;
  image?: { bytes: Uint8Array; type: 'png' | 'jpg'; aspect?: number };
  selected?: string;
  onAdd?: (a: Annotation) => void;
  onUpdate?: (a: Annotation, group?: string) => void;
  onSelect?: (id: string) => void;
  onError?: (error: string) => void;
  watermark?: string;
  numbering?: boolean;
  total?: number;
}) {
  const wrapper = useRef<HTMLDivElement>(null),
    annotationLayer = useRef<SVGSVGElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    textContainer = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false),
    [baseViewport, setBaseViewport] = useState<PageViewport>(),
    [loading, setLoading] = useState(true),
    [draft, setDraft] = useState<Annotation>();
  const [printedBoxes, setPrintedBoxes] = useState<Box[]>([]);
  useEffect(() => {
    if (!detectBoxes || !near || loading || !canvas.current || !baseViewport) {
      setPrintedBoxes([]);
      return;
    }
    const c = canvas.current;
    const small = document.createElement('canvas');
    const ratio = Math.min(1, Math.sqrt(2_000_000 / (c.width * c.height)));
    small.width = Math.round(c.width * ratio);
    small.height = Math.round(c.height * ratio);
    const ctx = small.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(c, 0, 0, small.width, small.height);
    const scale = small.width / baseViewport.width;
    const boxes = detectPrintedBoxes(
      ctx.getImageData(0, 0, small.width, small.height).data,
      small.width,
      small.height,
      scale,
    );
    setPrintedBoxes(
      boxes.map((b) => ({
        x: b.x / scale,
        y: b.y / scale,
        width: b.width / scale,
        height: b.height / scale,
      })),
    );
    small.width = 0;
    small.height = 0;
  }, [detectBoxes, near, loading, baseViewport, zoom]);
  const viewport = baseViewport?.clone({
    scale: thumbnail ? Math.min(108 / baseViewport.width, 145 / baseViewport.height) : zoom,
  });
  const [inline, setInline] = useState<{ annotation: Annotation; existing: boolean }>();
  const inlineInput = useRef<HTMLTextAreaElement>(null);
  const inlineElement = useRef<HTMLDivElement>(null);
  const inlineGroup = useRef('');
  useEffect(() => {
    if (inline) {
      inlineGroup.current = crypto.randomUUID();
      inlineInput.current?.focus({ preventScroll: true });
      inlineInput.current?.select();
    }
    const outside = (event: PointerEvent) => {
      if (!inlineElement.current?.contains(event.target as Node)) setInline(undefined);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [inline?.annotation.id]);
  function writeInline(value: string) {
    if (!inline) return;
    const a = { ...inline.annotation, text: value };
    const height = Math.max(
      a.height,
      (previewLines(a.text ?? '', a.size, a.width - 8).length + 1) * a.size * 1.3 + 5,
    );
    const fitted = { ...a, height, y: a.y + a.height - height };
    if (fitted.y < 0) {
      onError?.(
        'Le texte dépasse le bas de la page. Réduisez la taille ou raccourcissez le texte.',
      );
      return;
    }
    setInline({ ...inline, annotation: fitted });
    onVisualEdit?.(fitted, inlineGroup.current);
  }
  const [liveTarget, setLiveTarget] = useState<LiveTarget>();
  const [renderEdits, setRenderEdits] = useState(reference.nativeEdits);
  const nativeRuns = useRef<Promise<NativeRun[]> | undefined>(undefined);
  const clickGeneration = useRef(0);
  useEffect(() => {
    nativeRuns.current = undefined;
    setLiveTarget(undefined);
    return () => {
      clickGeneration.current++;
    };
  }, [source, reference.index]);
  useEffect(() => {
    if (!nativeMode) {
      setLiveTarget(undefined);
      clickGeneration.current++;
    }
  }, [nativeMode]);
  useEffect(() => {
    const timer = setTimeout(() => setRenderEdits(reference.nativeEdits), 180);
    return () => clearTimeout(timer);
  }, [reference.nativeEdits]);
  async function editText(span: HTMLElement, selection?: { start: number; end: number }) {
    if (!source || !viewport || !canvas.current || !wrapper.current) return;
    const generation = ++clickGeneration.current;
    const text = span.textContent ?? '';
    if (!text.trim()) return;
    const matches = Array.from(textContainer.current?.querySelectorAll('span') ?? []).filter(
      (el) => el.textContent === text,
    );
    const occurrence = matches.indexOf(span);
    const bounds = span.getBoundingClientRect(),
      boundsPage = wrapper.current.getBoundingClientRect();
    const rect = {
      x: bounds.left - boundsPage.left,
      y: bounds.top - boundsPage.top,
      width: bounds.width,
      height: bounds.height,
    };
    const colors = sampleTextColors(canvas.current, rect);
    const page = await doc.getPage(reference.index + 1);
    const content = await page.getTextContent();
    const runList = await (nativeRuns.current ??= listNativeRuns(
      source.bytes,
      reference.index,
    ).catch(() => []));
    if (generation !== clickGeneration.current) return;
    const candidates = runList.filter(
      (r) => (reference.nativeEdits?.find((e) => e.id === r.id)?.text ?? r.text) === text,
    );
    const run = candidates.length === matches.length ? candidates[occurrence] : undefined;
    const items = content.items.filter((i) => 'str' in i && i.str === (run?.text ?? text));
    // The rendered text may have been renamed, while PDF.js content here is
    // still the original source. Match its original occurrence, not the count
    // of renamed spans (otherwise a saved movement is applied twice).
    const originalRuns = run ? runList.filter((r) => r.text === run.text) : [];
    const item =
      run && originalRuns.length === items.length
        ? items[originalRuns.indexOf(run)]
        : !run && items.length === matches.length
          ? items[occurrence]
          : undefined;
    const existingOffset = run
      ? reference.nativeEdits?.find((e) => e.id === run.id)?.offset
      : undefined;
    const size =
      run?.size ??
      (item && 'transform' in item
        ? Math.hypot(item.transform[2], item.transform[3])
        : bounds.height / viewport.scale);
    const corners = [
      [rect.x, rect.y],
      [rect.x + rect.width, rect.y],
      [rect.x, rect.y + rect.height],
      [rect.x + rect.width, rect.y + rect.height],
    ].map(([x, y]) => viewport.convertToPdfPoint(x, y));
    const x =
      item && 'transform' in item
        ? item.transform[4]
        : Math.min(...corners.map((p) => p[0])) - (existingOffset?.x ?? 0);
    const y =
      item && 'transform' in item
        ? item.transform[5]
        : Math.min(...corners.map((p) => p[1])) + size * 0.22 - (existingOffset?.y ?? 0);
    const font =
      run?.font ??
      (item && 'fontName' in item ? content.styles[item.fontName]?.fontFamily : undefined) ??
      'Helvetica';
    const angle =
      item && 'transform' in item
        ? (Math.atan2(item.transform[1], item.transform[0]) * 180) / Math.PI
        : 0;
    setLiveTarget({
      key: uid(),
      text,
      x,
      y,
      width: item && 'width' in item ? item.width : Math.max(...corners.map((p) => p[0])) - x,
      height: size * 1.22,
      size,
      angle,
      font,
      ...colors,
      run,
      selection,
    });
  }
  function editVisual(a: Annotation) {
    if (!a.replacement) return;
    const r = a.replacement,
      angle = (r.angle * Math.PI) / 180;
    setLiveTarget({
      key: uid(),
      text: a.text ?? '',
      x: a.x - Math.sin(angle) * r.baseline,
      y: a.y + Math.cos(angle) * r.baseline,
      width: a.width,
      height: a.height,
      size: a.size,
      angle: r.angle,
      font: r.font,
      color: a.color,
      background: r.background,
      annotation: a,
    });
  }
  const gesture = useRef<
    | {
        pointerId: number;
        start: Point;
        annotation: Annotation;
        draft: Annotation;
        move?: boolean;
      }
    | undefined
  >(undefined);
  useEffect(() => {
    const el = wrapper.current!;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          setNear(e.isIntersecting);
        }
      },
      { rootMargin: thumbnail ? '150px' : '650px' },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [reference.id, thumbnail]);
  useEffect(() => {
    let cancelled = false;
    void doc
      .getPage(reference.index + 1)
      .then((page) => {
        if (!cancelled)
          setBaseViewport(
            page.getViewport({ scale: 1, rotation: (page.rotate + reference.rotation) % 360 }),
          );
      })
      .catch(() => onError?.('Impossible de lire les dimensions de cette page.'));
    return () => {
      cancelled = true;
    };
  }, [doc, reference.index, reference.rotation]);
  useEffect(() => {
    let disposed = false,
      render: RenderTask | undefined,
      layer: TextLayer | undefined,
      previewDoc: PDFDocumentProxy | undefined;
    setLoading(true);
    if (!near) {
      if (canvas.current) {
        canvas.current.width = 0;
        canvas.current.height = 0;
      }
      if (textContainer.current) textContainer.current.replaceChildren();
      return;
    }
    void (async () => {
      if (renderEdits?.length && source) {
        previewDoc = await loadPdf(
          await nativePreview(source.bytes, reference.index, renderEdits, await getFont()),
        );
        if (disposed) {
          await previewDoc.loadingTask.destroy();
          return;
        }
      }
      const page = await (previewDoc ?? doc).getPage(previewDoc ? 1 : reference.index + 1);
      if (disposed) return;
      const rotation = (page.rotate + reference.rotation) % 360,
        base = page.getViewport({ scale: 1, rotation });
      const effectiveZoom = thumbnail ? Math.min(108 / base.width, 145 / base.height) : zoom;
      const v = page.getViewport({ scale: effectiveZoom, rotation });
      const c = canvas.current!;
      const pixels = v.width * v.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(10_000_000 / pixels));
      c.width = Math.ceil(v.width * dpr);
      c.height = Math.ceil(v.height * dpr);
      c.style.width = `${v.width}px`;
      c.style.height = `${v.height}px`;
      render = page.render({
        canvas: c,
        viewport: v,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        background: '#ffffff',
      });
      await render.promise;
      if (disposed) return;
      if (!thumbnail && textContainer.current) {
        textContainer.current.replaceChildren();
        layer = new TextLayer({
          textContentSource: page.streamTextContent(),
          container: textContainer.current,
          viewport: v,
        });
        await layer.render();
      }
      if (!disposed) setLoading(false);
    })().catch((e) => {
      if (!disposed && e?.name !== 'RenderingCancelledException')
        onError?.('Impossible d’afficher cette page.');
    });
    return () => {
      disposed = true;
      render?.cancel();
      layer?.cancel();
      if (previewDoc) void previewDoc.loadingTask.destroy();
    };
  }, [doc, reference.index, reference.rotation, renderEdits, source, near, zoom, thumbnail]);
  function point(e: React.PointerEvent): Point {
    const rect = wrapper.current!.getBoundingClientRect();
    const [x, y] = viewport!.convertToPdfPoint(
      ((e.clientX - rect.left) * viewport!.width) / rect.width,
      ((e.clientY - rect.top) * viewport!.height) / rect.height,
    );
    return { x, y };
  }
  function start(e: React.PointerEvent, a?: Annotation) {
    if (!viewport || thumbnail || readOnly || inline || (nativeMode && !a) || e.button !== 0)
      return;
    if (tool === 'select' && !a) return;
    e.preventDefault();
    e.stopPropagation();
    // Capture on the persistent SVG, never on a shape replaced by its drag preview.
    annotationLayer.current!.setPointerCapture(e.pointerId);
    const p = point(e);
    if (tool === 'checkbox') {
      onAdd?.({
        id: uid(),
        type: 'checkbox',
        checked: true,
        x: p.x,
        y: p.y - 14,
        width: 14,
        height: 14,
        color,
        size,
      });
      return;
    }
    if (a && (tool === 'select' || tool === 'image')) {
      onSelect?.(a.id);
      gesture.current = { pointerId: e.pointerId, start: p, annotation: a, draft: a, move: true };
      setDraft(a);
      return;
    }
    if (tool === 'select') return;
    const annotation: Annotation = {
      id: uid(),
      type: tool,
      x: p.x,
      y: p.y,
      width: 0,
      height: 0,
      color,
      size,
      text:
        text ||
        (
          { note: 'Note', stamp: 'VALIDÉ', link: 'Ouvrir le lien', text: 'Votre texte' } as Record<
            string,
            string
          >
        )[tool],
      url: link,
      points: [p],
      image: image?.bytes,
      imageType: image?.type,
    };
    if (['text', 'note', 'stamp', 'link', 'image'].includes(tool)) {
      if (tool === 'image' && !image) {
        onError?.('Choisissez d’abord une image dans la barre d’outils.');
        return;
      }
      const w = Math.min(tool === 'image' ? 150 : 220, viewport.viewBox[2] - p.x - 8),
        h =
          tool === 'image'
            ? w / (image?.aspect ?? 1.5)
            : Math.max(
                46,
                (previewLines(annotation.text ?? '', size, w - 8).length + 1) * size * 1.3 + 5,
              );
      if (w < 40 || h > p.y - 8) {
        onError?.(
          'Ce texte est trop long pour cet emplacement. Répartissez-le en plusieurs zones ou placez-le plus haut.',
        );
        return;
      }
      annotation.width = w;
      annotation.height = h;
      annotation.y = p.y - h;
      if (['text', 'note', 'stamp'].includes(tool)) {
        annotation.text = text || (tool === 'stamp' ? 'VALIDÉ' : '');
        setInline({ annotation, existing: false });
        if (annotation.text) onVisualEdit?.(annotation, annotation.id);
      } else onAdd?.(annotation);
      return;
    }
    gesture.current = { pointerId: e.pointerId, start: p, annotation, draft: annotation };
    setDraft(annotation);
  }
  function move(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const p = point(e);
    if (g.move) {
      const dx = p.x - g.start.x,
        dy = p.y - g.start.y;
      g.draft = {
        ...g.annotation,
        x: g.annotation.x + dx,
        y: g.annotation.y + dy,
        points: g.annotation.points?.map((q) => ({ x: q.x + dx, y: q.y + dy })),
      };
    } else {
      const a = {
        ...g.annotation,
        x: Math.min(g.start.x, p.x),
        y: Math.min(g.start.y, p.y),
        width: Math.abs(p.x - g.start.x),
        height: Math.abs(p.y - g.start.y),
      };
      a.points = tool === 'pen' ? [...(g.draft.points ?? [g.start]), p] : [g.start, p];
      g.draft = a;
    }
    setDraft(g.draft);
  }
  function end(e: React.PointerEvent) {
    const g = gesture.current;
    if (g?.pointerId === e.pointerId) {
      // Mouse-up can carry a newer position than React's last rendered state.
      move(e);
      const final = g.draft;
      if (g.move) {
        if (final.x !== g.annotation.x || final.y !== g.annotation.y) onUpdate?.(final);
      } else if (final.width > 2 || final.height > 2) onAdd?.(final);
    }
    gesture.current = undefined;
    setDraft(undefined);
    if (annotationLayer.current?.hasPointerCapture(e.pointerId))
      annotationLayer.current.releasePointerCapture(e.pointerId);
  }
  const width = viewport?.width ?? 595 * zoom,
    height = viewport?.height ?? 842 * zoom;
  return (
    <div
      className={`pdf-page ${thumbnail ? 'thumbnail-page' : ''} ${tool !== 'select' ? 'drawing-mode' : ''} ${nativeMode ? 'native-mode' : ''}`}
      ref={wrapper}
      onClick={(e) => {
        const span = (e.target as HTMLElement).closest?.('.textLayer span');
        if (span && nativeMode) {
          const selection = window.getSelection();
          let offsets: { start: number; end: number } | undefined;
          if (selection && !selection.isCollapsed && selection.rangeCount) {
            const range = selection.getRangeAt(0);
            if (span.contains(range.startContainer) && span.contains(range.endContainer)) {
              const before = range.cloneRange();
              before.selectNodeContents(span);
              before.setEnd(range.startContainer, range.startOffset);
              offsets = {
                start: before.toString().length,
                end: before.toString().length + range.toString().length,
              };
            } else {
              onError?.(
                'Cette sélection couvre plusieurs blocs. Cliquez sur le passage à modifier pour garder sa mise en forme.',
              );
              return;
            }
          }
          void editText(span as HTMLElement, offsets).catch(() =>
            onError?.('Impossible de sélectionner ce passage.'),
          );
        }
      }}
      data-page={index + 1}
      id={thumbnail ? undefined : `page-${reference.id}`}
      style={
        {
          width,
          height,
          '--scale-factor': zoom,
          '--total-scale-factor': zoom,
          '--user-unit': 1,
        } as React.CSSProperties
      }
    >
      <canvas ref={canvas} aria-label={`Page ${index + 1}`} style={{ width, height }} />
      {loading && (
        <span className="page-loading">{thumbnail ? index + 1 : t('Chargement de la page…')}</span>
      )}
      {!thumbnail && <div className="textLayer" ref={textContainer} />}
      {liveTarget && viewport && nativeMode && onNativeEdits && onVisualEdit && (
        <LiveTextEditor
          key={liveTarget.key}
          target={liveTarget}
          page={reference}
          viewport={viewport}
          changeNative={onNativeEdits}
          changeVisual={onVisualEdit}
          close={() => setLiveTarget(undefined)}
        />
      )}
      {!thumbnail && near && viewport && onVisualEdit && (
        <CheckboxLayer
          doc={doc}
          page={reference}
          viewport={viewport}
          enabled={!readOnly && !doc.isPureXfa}
          change={onVisualEdit}
          error={onError}
        />
      )}
      {!thumbnail && detectBoxes && viewport && (
        <div className="printed-checkbox-layer">
          {printedBoxes.map((b, i) => {
            const corners = [
              [b.x, b.y],
              [b.x + b.width, b.y + b.height],
            ].map(([x, y]) => baseViewport!.convertToPdfPoint(x, y));
            const x = Math.min(corners[0][0], corners[1][0]);
            const y = Math.min(corners[0][1], corners[1][1]);
            // PDF coordinates remain stable across zoom and raster rounding.
            const existing = reference.annotations.find(
              (a) => a.type === 'checkbox' && Math.abs(a.x - x) < 3 && Math.abs(a.y - y) < 3,
            );
            return (
              <button
                key={i}
                className="printed-checkbox"
                role="checkbox"
                aria-checked={existing?.checked ?? false}
                disabled={readOnly}
                aria-label={`${t('Cocher la case imprimée')} ${i + 1}`}
                title={t('Case probable · cliquer pour cocher')}
                style={{
                  left: b.x * zoom,
                  top: b.y * zoom,
                  width: b.width * zoom,
                  height: b.height * zoom,
                }}
                onClick={() => {
                  onVisualEdit?.(
                    {
                      id: existing?.id ?? uid(),
                      type: 'checkbox',
                      checked: !existing?.checked,
                      x,
                      y,
                      width: Math.abs(corners[1][0] - corners[0][0]),
                      height: Math.abs(corners[1][1] - corners[0][1]),
                      color: '#17213a',
                      size: 12,
                    },
                    crypto.randomUUID(),
                  );
                }}
              />
            );
          })}
        </div>
      )}
      {inline &&
        viewport &&
        (() => {
          const a = inline.annotation;
          const [aa, b, c, d, e, f] = viewport.transform;
          const px = aa * a.x + c * (a.y + a.height) + e;
          const py = b * a.x + d * (a.y + a.height) + f;
          return (
            <div
              ref={inlineElement}
              className="inline-text-editor"
              style={{ width: a.width, transform: `matrix(${aa},${b},${-c},${-d},${px},${py})` }}
            >
              <textarea
                ref={inlineInput}
                aria-label={t('Écrire directement sur le PDF')}
                value={a.text ?? ''}
                placeholder={t('Écrivez ici…')}
                style={{ minHeight: a.height, fontSize: a.size, color: a.color }}
                onChange={(e) => writeInline(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) {
                    e.preventDefault();
                    e.stopPropagation();
                    setInline(undefined);
                  }
                }}
              />
              <div className="inline-actions">
                <span>{t('Enregistré dans le brouillon')}</span>
                <button onClick={() => setInline(undefined)}>{t('Terminer')}</button>
              </div>
            </div>
          );
        })()}
      {viewport && (
        <svg
          ref={annotationLayer}
          className={`annotation-layer ${!thumbnail && tool !== 'select' ? 'interactive' : ''}`}
          viewBox={`0 0 ${width} ${height}`}
          onPointerDown={(e) => start(e)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={() => {
            gesture.current = undefined;
            setDraft(undefined);
          }}
          onLostPointerCapture={() => {
            gesture.current = undefined;
            setDraft(undefined);
          }}
          aria-label={t('Calque d’annotations')}
        >
          <g transform={`matrix(${viewport.transform.join(' ')})`}>
            {reference.annotations
              .filter((a) => a.id !== inline?.annotation.id)
              .map((stored) => {
                const a = draft?.id === stored.id ? draft : stored;
                return (
                  <g
                    key={a.id}
                    data-annotation-id={a.id}
                    style={{ pointerEvents: thumbnail ? 'none' : 'visiblePainted' }}
                    onPointerDown={(e) => {
                      if (nativeMode && a.replacement) {
                        e.stopPropagation();
                        editVisual(a);
                      } else start(e, a);
                    }}
                    onDoubleClick={(e) => {
                      if (
                        !thumbnail &&
                        !nativeMode &&
                        ['text', 'note', 'stamp', 'link'].includes(a.type)
                      ) {
                        e.stopPropagation();
                        gesture.current = undefined;
                        setDraft(undefined);
                        setInline({ annotation: structuredClone(a), existing: true });
                      }
                    }}
                  >
                    <rect
                      x={a.x}
                      y={a.y}
                      width={Math.max(4, a.width)}
                      height={Math.max(4, a.height)}
                      fill="transparent"
                      pointerEvents={thumbnail || readOnly ? 'none' : 'all'}
                    />
                    <AnnotationShape a={a} />
                    {selected === a.id && !thumbnail && (
                      <rect
                        x={a.x - 3}
                        y={a.y - 3}
                        width={a.width + 6}
                        height={a.height + 6}
                        fill="none"
                        stroke="#6456ed"
                        strokeWidth={1}
                        strokeDasharray="3 2"
                      />
                    )}
                  </g>
                );
              })}
            {draft && !gesture.current?.move && <AnnotationShape a={draft} />}
          </g>
          {(() => {
            const wm = watermarkFor(watermark, watermarkOptions);
            const unrotated = viewport.viewBox;
            return (
              <g transform={`matrix(${viewport.transform.join(' ')})`}>
                {watermarkPositions(
                  wm,
                  unrotated[2] - unrotated[0],
                  unrotated[3] - unrotated[1],
                  index + 1,
                ).map((p, i) => (
                  <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${wm.angle})`}>
                    <text
                      transform="scale(1 -1)"
                      textAnchor="middle"
                      fontFamily="Noto Sans"
                      fontSize={wm.size}
                      fill={wm.color}
                      opacity={wm.opacity}
                    >
                      {wm.text}
                    </text>
                  </g>
                ))}
              </g>
            );
          })()}
          {numbering && (
            <text
              x={width / 2}
              y={height - 18 * zoom}
              textAnchor="middle"
              fontSize={10 * zoom}
              fill="#777"
            >
              {index + 1} / {total}
            </text>
          )}
        </svg>
      )}
    </div>
  );
}
