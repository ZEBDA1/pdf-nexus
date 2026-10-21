import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist';
import type { FormValue, PageRef } from '../types';
import { sameBox } from '../pdf/geometry';
import { t } from '../i18n';

interface Widget {
  id: string;
  name: string;
  label: string;
  rect: number[];
  type: 'text' | 'checkbox' | 'radio' | 'choice';
  value: FormValue;
  readOnly: boolean;
  password: boolean;
  multiline: boolean;
  options: { value: string; label: string }[];
  editable: boolean;
  multi: boolean;
  radioValue: string;
  max: number;
  size: number;
  alignment: number;
  required: boolean;
}
export function FormLayer({
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
  change: (name: string, value: FormValue, group: string) => void;
  error?: (message: string) => void;
}) {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const group = useRef('');
  useEffect(() => {
    let cancelled = false;
    void doc
      .getPage(page.index + 1)
      .then((p) => p.getAnnotations())
      .then((data) => {
        if (cancelled) return;
        setWidgets(
          data
            .filter(
              (a) =>
                a.subtype === 'Widget' &&
                Array.isArray(a.rect) &&
                !(a.annotationFlags & 35) &&
                (a.fieldType === 'Tx' || a.checkBox || a.radioButton || a.fieldType === 'Ch'),
            )
            .map((a): Widget => ({
              id: String(a.id),
              name: a.fieldName ?? '',
              label: a.alternativeText || a.fieldName || t('Champ sans nom'),
              rect: a.rect,
              type: a.checkBox
                ? 'checkbox'
                : a.radioButton
                  ? 'radio'
                  : a.fieldType === 'Ch'
                    ? 'choice'
                    : 'text',
              value: a.checkBox ? !!a.fieldValue && a.fieldValue !== 'Off' : (a.fieldValue ?? ''),
              readOnly: !!a.readOnly,
              password: !!a.password,
              multiline: !!a.multiLine,
              editable: !!(a.fieldFlags & 262144),
              multi: !!a.multiSelect,
              options: (a.options ?? []).map(
                (o: { exportValue: string; displayValue: string }) => ({
                  value: o.exportValue,
                  label: o.displayValue,
                }),
              ),
              radioValue: a.buttonValue ?? '',
              max: Math.min(a.maxLen || 10000, 10000),
              size:
                a.defaultAppearanceData?.fontSize ||
                Math.min(14, Math.abs(a.rect[3] - a.rect[1]) * 0.65),
              alignment: a.textAlignment ?? 0,
              required: !!a.required,
            }))
            .sort((a, b) =>
              Math.abs(a.rect[3] - b.rect[3]) < 5 ? a.rect[0] - b.rect[0] : b.rect[3] - a.rect[3],
            ),
        );
      })
      .catch(() => {
        if (!cancelled) error?.('Impossible de lire les champs de formulaire.');
      });
    return () => {
      cancelled = true;
    };
  }, [doc, page.index]);
  return (
    <div className="form-layer" aria-label={t('Champs du formulaire')}>
      {widgets.map((w) => {
        const rectangle = {
          x: w.rect[0],
          y: w.rect[1],
          width: w.rect[2] - w.rect[0],
          height: w.rect[3] - w.rect[1],
        };
        const stored =
          page.formValues && Object.hasOwn(page.formValues, w.name)
            ? page.formValues[w.name]
            : undefined;
        const legacy =
          w.type === 'checkbox'
            ? page.annotations.find(
                (a) => a.type === 'checkbox' && a.id.startsWith('widget-') && sameBox(a, rectangle),
              )
            : undefined;
        const value = stored ?? legacy?.checked ?? w.value;
        const [a, b, c, d] = viewport.transform,
          [x, y] = viewport.convertToViewportPoint(rectangle.x, rectangle.y + rectangle.height);
        const label =
          w.type === 'checkbox'
            ? `${t('Case à cocher')} : ${w.label}`
            : w.type === 'radio'
              ? `${w.label} : ${w.radioValue}`
              : w.label;
        const common = {
          'aria-label': label,
          disabled: !enabled || w.readOnly || w.password,
          required: w.required,
          onFocus: () => {
            group.current = crypto.randomUUID();
          },
          title: w.password
            ? t('Champ protégé non modifiable dans Nexus')
            : w.readOnly
              ? t('Champ en lecture seule')
              : w.label,
          'data-form-field': w.name,
          'data-form-widget': w.id,
          className: 'form-control',
        };
        const send = (next: FormValue, discrete = false) =>
          change(
            w.name,
            next,
            discrete ? crypto.randomUUID() : group.current || crypto.randomUUID(),
          );
        return (
          <div
            key={w.id}
            className={`form-widget ${w.type}`}
            style={{
              width: rectangle.width,
              height: rectangle.height,
              transform: `matrix(${a},${b},${-c},${-d},${x},${y})`,
              fontSize: w.size,
              textAlign: (['left', 'center', 'right'] as const)[w.alignment] ?? 'left',
            }}
          >
            {w.type === 'checkbox' || w.type === 'radio' ? (
              <input
                {...common}
                className="form-control pdf-checkbox"
                type={w.type}
                name={`${page.formGroup ?? page.source}:${w.name}`}
                checked={w.type === 'checkbox' ? !!value : value === w.radioValue}
                onChange={(e) =>
                  send(w.type === 'checkbox' ? e.target.checked : w.radioValue, true)
                }
              />
            ) : w.type === 'choice' && !w.editable ? (
              <select
                {...common}
                multiple={w.multi}
                value={
                  w.multi
                    ? Array.isArray(value)
                      ? value
                      : [String(value)]
                    : Array.isArray(value)
                      ? (value[0] ?? '')
                      : String(value)
                }
                onChange={(e) =>
                  send(
                    w.multi ? Array.from(e.target.selectedOptions, (o) => o.value) : e.target.value,
                    true,
                  )
                }
              >
                {!w.multi && <option value="">{t('Choisir…')}</option>}
                {w.options.map((o, index) => (
                  <option key={index} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : w.type === 'choice' ? (
              <>
                <input
                  {...common}
                  list={`options-${page.id}-${w.id}`}
                  value={
                    w.options.find((o) => o.value === (Array.isArray(value) ? value[0] : value))
                      ?.label ?? String(value)
                  }
                  onChange={(e) =>
                    send(w.options.find((o) => o.label === e.target.value)?.value ?? e.target.value)
                  }
                />
                <datalist id={`options-${page.id}-${w.id}`}>
                  {w.options.map((o, i) => (
                    <option key={i} value={o.label} />
                  ))}
                </datalist>
              </>
            ) : w.multiline ? (
              <textarea
                {...common}
                value={String(value)}
                maxLength={w.max}
                spellCheck={false}
                onChange={(e) => send(e.target.value)}
              />
            ) : (
              <input
                {...common}
                type={w.password ? 'password' : 'text'}
                autoComplete="off"
                value={String(value)}
                maxLength={w.max}
                spellCheck={false}
                placeholder={/date|naissance/i.test(w.label) ? t('JJ/MM/AAAA') : undefined}
                onChange={(e) => send(e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
