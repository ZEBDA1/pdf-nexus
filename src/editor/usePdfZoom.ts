import { useEffect, useLayoutEffect, useRef } from 'react';

/** PDF zoom is authoritative. Browser events are input only, never echoed back. */
export function usePdfZoom(zoom: number, setZoom: (value: number) => void) {
  const state = useRef({ zoom, setZoom });
  state.current.setZoom = setZoom;
  const anchor = useRef<
    { el: HTMLElement; width: number; x: number; y: number; cx: number; cy: number } | undefined
  >(undefined);
  function change(value: number, point?: { x: number; y: number }) {
    const next = Math.max(0.25, Math.min(3, Math.round(value * 100) / 100));
    if (next === state.current.zoom) return;
    const scroller = document.querySelector<HTMLElement>('.page-scroller');
    if (scroller) {
      const bounds = scroller.getBoundingClientRect();
      const cx = Math.max(
        bounds.left,
        Math.min(bounds.right, point?.x ?? bounds.left + bounds.width / 2),
      );
      const cy = Math.max(
        bounds.top,
        Math.min(bounds.bottom, point?.y ?? bounds.top + bounds.height / 2),
      );
      const pages = Array.from(scroller.querySelectorAll<HTMLElement>('.pdf-page'));
      const el =
        pages.find((p) => {
          const r = p.getBoundingClientRect();
          return cy >= r.top && cy <= r.bottom;
        }) ?? pages.find((p) => p.getBoundingClientRect().bottom >= bounds.top);
      if (el) {
        const r = el.getBoundingClientRect();
        anchor.current = {
          el,
          width: r.width,
          x: (cx - r.left) / r.width,
          y: (cy - r.top) / r.height,
          cx,
          cy,
        };
      }
    }
    // Accumulate rapid wheel events before React has committed a render.
    state.current.zoom = next;
    state.current.setZoom(next);
  }
  useLayoutEffect(() => {
    state.current.zoom = zoom;
    const a = anchor.current;
    anchor.current = undefined;
    if (!a) return;
    const scroller = a.el.closest<HTMLElement>('.page-scroller');
    if (!scroller) return;
    const r = a.el.getBoundingClientRect();
    // Apply the anchor exactly once; scrolling later remains free.
    if (Math.abs(r.width - a.width) > 0.1)
      scroller.scrollBy({
        left: r.left + a.x * r.width - a.cx,
        top: r.top + a.y * r.height - a.cy,
        behavior: 'instant',
      });
  }, [zoom]);
  useEffect(() => {
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      change(state.current.zoom * Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * 0.003), {
        x: e.clientX,
        y: e.clientY,
      });
    };
    const key = (e: KeyboardEvent) => {
      if ((!e.ctrlKey && !e.metaKey) || e.altKey) return;
      if (
        ['+', '=', '-', '_', '0'].includes(e.key) ||
        ['NumpadAdd', 'NumpadSubtract', 'Numpad0'].includes(e.code)
      ) {
        e.preventDefault();
        e.stopPropagation();
        change(
          e.key === '0' || e.code === 'Numpad0'
            ? 1
            : state.current.zoom +
                (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract' ? -0.15 : 0.15),
        );
      }
    };
    document.addEventListener('wheel', wheel, { passive: false });
    document.addEventListener('keydown', key, true);
    let tabId: number | undefined,
      disposed = false;
    const changed = (info: chrome.tabs.OnZoomChangeInfo) => {
      if (info.tabId === tabId && !disposed)
        change((state.current.zoom * info.newZoomFactor) / info.oldZoomFactor);
    };
    const restore = async () => {
      if (tabId === undefined) return;
      await chrome.tabs.setZoomSettings(tabId, { mode: 'automatic', scope: 'per-tab' });
      await chrome.tabs.setZoom(tabId, 1);
    };
    if (typeof chrome !== 'undefined' && chrome.tabs?.setZoomSettings) {
      void chrome.tabs
        .getCurrent()
        .then(async (tab) => {
          if (disposed || tab?.id === undefined) return;
          tabId = tab.id;
          await chrome.tabs.setZoomSettings(tabId, { mode: 'manual', scope: 'per-tab' });
          await chrome.tabs.setZoom(tabId, 1);
          if (disposed) {
            await restore();
            return;
          }
          chrome.tabs.onZoomChange.addListener(changed);
        })
        .catch(() => {
          /* Keyboard and wheel controls also work in development. */
        });
    }
    return () => {
      disposed = true;
      document.removeEventListener('wheel', wheel);
      document.removeEventListener('keydown', key, true);
      if (typeof chrome !== 'undefined' && chrome.tabs?.onZoomChange)
        chrome.tabs.onZoomChange.removeListener(changed);
      void restore().catch(() => {});
    };
  }, []);
  return change;
}
