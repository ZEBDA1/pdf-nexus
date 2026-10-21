import { useEffect, useRef, useState } from 'react';
import type { Workspace } from '../types';
import type { History } from '../pdf/history';
import { saveDraft } from '../storage/drafts';
import { errorMessage, uid } from '../utils/files';

export interface AutosaveStatus {
  kind: 'idle' | 'saving' | 'saved' | 'error' | 'off';
  saved?: number;
  error?: string;
}
export function useAutosave({
  id,
  workspace,
  history,
  current,
  zoom,
  documentId,
  enabled,
  recovered,
  saved,
}: {
  id: string;
  workspace?: Workspace;
  history: History;
  current: number;
  zoom: number;
  documentId: string;
  enabled: boolean;
  recovered: boolean;
  saved: () => void;
}) {
  const [status, setStatus] = useState<AutosaveStatus>({ kind: 'idle' });
  const revisions = useRef(new WeakMap<Workspace['sources'], string>());
  const generation = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true),
    callback = useRef(saved);
  callback.current = saved;
  const pending = useRef<(() => Promise<void>) | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    const flush = () => {
      clearTimeout(timer.current);
      void pending.current?.();
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      flush();
      mounted.current = false;
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    const revision = ++generation.current;
    clearTimeout(timer.current);
    pending.current = undefined;
    if (!workspace || !enabled || workspace.encrypted) {
      setStatus({ kind: 'off' });
      return;
    }
    if (!recovered && !history.past.length && !history.future.length) {
      setStatus({ kind: 'idle' });
      return;
    }
    let sourceRevision = revisions.current.get(workspace.sources);
    if (!sourceRevision) {
      sourceRevision = uid();
      revisions.current.set(workspace.sources, sourceRevision);
    }
    setStatus((s) => ({ kind: 'saving', saved: s.saved }));
    let running: Promise<void> | undefined;
    const flush = () => {
      if (running) return running;
      pending.current = undefined;
      if (mounted.current && generation.current === revision)
        setStatus((s) => ({ kind: 'saving', saved: s.saved }));
      running = saveDraft(id, workspace, history, { current, zoom, documentId }, sourceRevision!)
        .then((info) => {
          if (mounted.current && generation.current === revision) {
            setStatus({ kind: 'saved', saved: info.updated });
            callback.current();
          }
        })
        .catch((error) => {
          if (mounted.current && generation.current === revision) {
            pending.current = flush;
            running = undefined;
            setStatus({ kind: 'error', error: errorMessage(error) });
          }
        });
      return running;
    };
    pending.current = flush;
    timer.current = setTimeout(() => void flush(), 300);
    return () => {
      clearTimeout(timer.current);
    };
  }, [id, workspace, history, current, zoom, documentId, enabled, recovered]);
  return {
    status,
    cancel: () => {
      clearTimeout(timer.current);
      generation.current++;
      pending.current = undefined;
      setStatus({ kind: 'off' });
    },
    retry: () => {
      // Retry the same unsaved version even if no further text is typed.
      const next = pending.current;
      if (next) void next();
      else setStatus((s) => ({ ...s, kind: 'error', error: s.error }));
    },
  };
}
