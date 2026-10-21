import { useEffect, useState, type RefObject } from 'react';
import type { PageViewport } from 'pdfjs-dist';
import type { TextItem } from '../types';
import { occurrences } from '../pdf/search';

export function SearchHighlights({
  container,
  query,
  active,
  items,
  viewport,
  revision,
}: {
  container: RefObject<HTMLDivElement | null>;
  query: string;
  active: number;
  items?: TextItem[];
  viewport: PageViewport;
  revision: boolean;
}) {
  const [rects, setRects] = useState<
    { x: number; y: number; w: number; h: number; match: number }[]
  >([]);
  useEffect(() => {
    const el = container.current;
    if (!el || !query || revision) {
      setRects([]);
      return;
    }
    const spans = Array.from(el.querySelectorAll<HTMLElement>('.textLayer span')).filter(
      (s) => s.firstChild?.nodeType === Node.TEXT_NODE,
    );
    const parts = spans.length
      ? spans.map((s) => s.textContent ?? '')
      : (items ?? []).map((i) => i.text);
    const matches = occurrences(parts.join(' '), query),
      output: typeof rects = [];
    const base = el.getBoundingClientRect();
    let offset = 0;
    parts.forEach((part, index) => {
      matches.forEach((match, n) => {
        const start = Math.max(0, match.start - offset),
          end = Math.min(part.length, match.end - offset);
        if (end <= start) return;
        if (spans.length) {
          const range = document.createRange();
          range.setStart(spans[index].firstChild!, start);
          range.setEnd(spans[index].firstChild!, end);
          for (const r of range.getClientRects())
            output.push({
              x: ((r.left - base.left) * viewport.width) / base.width,
              y: ((r.top - base.top) * viewport.height) / base.height,
              w: (r.width * viewport.width) / base.width,
              h: (r.height * viewport.height) / base.height,
              match: n,
            });
        } else {
          const item = items![index],
            x = item.x + (item.width * start) / Math.max(1, part.length),
            w = (item.width * (end - start)) / Math.max(1, part.length);
          const [x1, y1] = viewport.convertToViewportPoint(x, item.y),
            [x2, y2] = viewport.convertToViewportPoint(x + w, item.y + item.height);
          output.push({
            x: Math.min(x1, x2),
            y: Math.min(y1, y2),
            w: Math.abs(x2 - x1),
            h: Math.abs(y2 - y1),
            match: n,
          });
        }
      });
      offset += part.length + 1;
    });
    setRects(output);
  }, [query, items, viewport, revision]);
  useEffect(() => {
    if (active >= 0)
      container.current
        ?.querySelector<HTMLElement>('.search-occurrence.active')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  }, [active, rects]);
  return (
    <div className="search-highlights" aria-hidden="true">
      {rects.map((r, i) => (
        <span
          key={i}
          className={`search-occurrence ${r.match === active ? 'active' : ''}`}
          style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
        />
      ))}
    </div>
  );
}
