import { db } from './index';
import { cloneSnapshot, type History } from '../pdf/history';
import type { Snapshot, Source, Workspace } from '../types';

export const draftLimits = {
  count: 5,
  bytes: 250 * 1024 * 1024,
  historyBytes: 20 * 1024 * 1024,
  historyActions: 20,
};
export interface DraftInfo {
  id: string;
  name: string;
  updated: number;
  pages: number;
  size: number;
}
export interface DraftState {
  snapshot: Snapshot;
  history: { past: Snapshot[]; future: Snapshot[] };
  current: number;
  zoom: number;
  documentId: string;
}
export interface SavedDraft {
  info: DraftInfo;
  state: DraftState;
  sources: Source[];
}

function cost(value: unknown): number {
  if (value instanceof Uint8Array) return value.byteLength;
  if (typeof value === 'string') return value.length * 2;
  if (typeof value === 'number' || typeof value === 'boolean') return 8;
  if (!value || typeof value !== 'object') return 0;
  return Object.entries(value).reduce((sum, [key, v]) => sum + key.length * 2 + cost(v), 0);
}
function retainedHistory(history: History) {
  let size = 0;
  const result: { past: Snapshot[]; future: Snapshot[] } = { past: [], future: [] };
  const blocked = { past: false, future: false };
  for (let distance = 1; distance <= draftLimits.historyActions; distance++) {
    for (const side of ['past', 'future'] as const) {
      if (blocked[side] || result.past.length + result.future.length >= draftLimits.historyActions)
        continue;
      const entry = history[side].at(-distance);
      if (!entry) continue;
      const snapshot = cloneSnapshot(entry),
        bytes = cost(snapshot);
      if (size + bytes > draftLimits.historyBytes) {
        blocked[side] = true;
        continue;
      }
      size += bytes;
      result[side].unshift(snapshot);
    }
  }
  return result;
}

// Serialize writes and deletions, including a clear requested while a save is
// in flight. A stale page cannot repopulate the stores after Clear data.
let queue: Promise<unknown> = Promise.resolve();
let epoch = 0;
function queued<T>(action: () => Promise<T>) {
  const task = queue.then(action);
  queue = task.catch(() => {});
  return task;
}
export function saveDraft(
  id: string,
  workspace: Workspace,
  history: History,
  navigation: { current: number; zoom: number; documentId: string },
  sourceRevision: string,
) {
  const requestedEpoch = epoch;
  if (workspace.encrypted)
    return Promise.reject(
      new Error('Les documents protégés ne sont pas sauvegardés en brouillon.'),
    );
  // Whitelist state: never persist preferences, API keys or passwords.
  const state: DraftState = {
    snapshot: cloneSnapshot(workspace),
    history: retainedHistory(history),
    ...navigation,
  };
  const sourceBytes = workspace.sources.reduce((sum, source) => sum + source.bytes.byteLength, 0);
  const info: DraftInfo = {
    id,
    name: workspace.name,
    updated: Date.now(),
    pages: workspace.pages.length,
    size: sourceBytes + cost(state),
  };
  return queued(async () => {
    if (requestedEpoch !== epoch) throw new DOMException('Opération annulée', 'AbortError');
    const d = await db();
    try {
      const tx = d.transaction(['drafts', 'draftStates', 'draftSources'], 'readwrite');
      const metadata = tx.objectStore('drafts');
      const existing = (await metadata.getAll()) as DraftInfo[];
      const others = existing.filter((draft) => draft.id !== id);
      if (
        others.length >= draftLimits.count ||
        others.reduce((sum, draft) => sum + draft.size, info.size) > draftLimits.bytes
      ) {
        tx.abort();
        await tx.done.catch(() => {});
        throw new Error(
          'Stockage des brouillons plein. Supprimez un ancien brouillon ou exportez votre travail.',
        );
      }
      const sources = tx.objectStore('draftSources');
      const stored = await sources.get(id);
      if (stored?.revision !== sourceRevision)
        await sources.put(
          {
            revision: sourceRevision,
            sources: workspace.sources.map(({ name, bytes }) => ({ name, bytes })),
          },
          id,
        );
      await tx.objectStore('draftStates').put(state, id);
      await metadata.put(info);
      await tx.done;
      return info;
    } finally {
      d.close();
    }
  });
}
export async function listDrafts(): Promise<DraftInfo[]> {
  const d = await db();
  try {
    return ((await d.getAll('drafts')) as DraftInfo[]).sort((a, b) => b.updated - a.updated);
  } finally {
    d.close();
  }
}
export async function loadDraft(id: string): Promise<SavedDraft> {
  await queue;
  const d = await db();
  try {
    const tx = d.transaction(['drafts', 'draftStates', 'draftSources']);
    const [info, state, source] = await Promise.all([
      tx.objectStore('drafts').get(id),
      tx.objectStore('draftStates').get(id),
      tx.objectStore('draftSources').get(id),
    ]);
    await tx.done;
    if (!info || !state || !source?.sources?.length)
      throw new Error('Ce brouillon n’est plus disponible.');
    return { info, state, sources: source.sources };
  } finally {
    d.close();
  }
}
export function deleteDraft(id: string) {
  return queued(async () => {
    const d = await db();
    try {
      const tx = d.transaction(['drafts', 'draftStates', 'draftSources'], 'readwrite');
      await Promise.all(
        ['drafts', 'draftStates', 'draftSources'].map((store) => tx.objectStore(store).delete(id)),
      );
      await tx.done;
    } finally {
      d.close();
    }
  });
}
export function clearDrafts() {
  epoch++;
  return queued(async () => {
    const d = await db();
    try {
      const tx = d.transaction(['drafts', 'draftStates', 'draftSources'], 'readwrite');
      await Promise.all(
        ['drafts', 'draftStates', 'draftSources'].map((store) => tx.objectStore(store).clear()),
      );
      await tx.done;
    } finally {
      d.close();
    }
  });
}
