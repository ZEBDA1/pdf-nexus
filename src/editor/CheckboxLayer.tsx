import { useEffect, useState } from 'react';
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist';
import type { Annotation, PageRef } from '../types';
import { t } from '../i18n';
import { mapBox } from '../pdf/geometry';

interface Widget {
  id: string;
  name: string;
  rect: number[];
  checked: boolean;
  readOnly: boolean;
}
export function CheckboxLayer({
  doc,
  page,
  viewport,
  enabled,
  change,
  error,
}: {
  doc: PDFDocumentProxy;
  page: PageRef;
  viewport: PageViewport;
  enabled: boolean;
  change: (a: Annotation, group: string) => void;
  error?: (text: string) => void;
}) {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  useEffect(() => {
    let cancelled = false;
    void doc
      .getPage(page.index + 1)
      .then((p) => p.getAnnotations())
      .then((annotations) => {
        if (!cancelled)
          setWidgets(
            annotations
              .filter((a) => a.subtype === 'Widget' && a.checkBox && Array.isArray(a.rect))
              .map((a) => ({
                id: String(a.id),
                name: a.alternativeText || a.fieldName || t('Case sans nom'),
                rect: a.rect,
                checked: !!a.fieldValue && a.fieldValue !== 'Off',
                readOnly: !!a.readOnly,
              })),
          );
      })
      .catch(() => {
        if (!cancelled) error?.(t('Impossible de lire les champs de formulaire.'));
      });
    return () => {
      cancelled = true;
    };
  }, [doc, page.index]);
  return (
    <div className="checkbox-layer" aria-label={t('Cases à cocher détectées')}>
      {widgets.map((w) => {
        const id = `widget-${w.id}`;
        const a = page.annotations.find((a) => a.id === id);
        const screen = mapBox(
          {
            x: w.rect[0],
            y: w.rect[1],
            width: w.rect[2] - w.rect[0],
            height: w.rect[3] - w.rect[1],
          },
          (x, y) => viewport.convertToViewportPoint(x, y),
        );
        const checked = a?.checked ?? w.checked;
        return (
          <input
            key={id}
            type="checkbox"
            className="pdf-checkbox"
            aria-label={`${t('Case à cocher')} : ${w.name}`}
            title={w.name}
            checked={checked}
            disabled={!enabled || w.readOnly}
            style={{
              left: screen.x,
              top: screen.y,
              width: screen.width,
              height: screen.height,
            }}
            onChange={(e) =>
              change(
                {
                  id,
                  type: 'checkbox',
                  checked: e.target.checked,
                  x: w.rect[0],
                  y: w.rect[1],
                  width: w.rect[2] - w.rect[0],
                  height: w.rect[3] - w.rect[1],
                  color: '#17213a',
                  size: 12,
                },
                crypto.randomUUID(),
              )
            }
          />
        );
      })}
    </div>
  );
}
