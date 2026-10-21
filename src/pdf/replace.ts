import type { NativeEdit } from '../types';
import { listNativeRuns, nativePreview } from './native-text';

export interface ReplacementCandidate {
  edit: NativeEdit;
  before: string;
  after: string;
  count: number;
}
export async function previewReplacement(
  bytes: Uint8Array,
  index: number,
  existing: NativeEdit[],
  query: string,
  replacement: string,
  font: Uint8Array,
) {
  if (!query || /[\r\n]/.test(query + replacement))
    throw new Error('Le remplacement global prend en charge du texte sur une ligne.');
  const result: ReplacementCandidate[] = [];
  let excluded = 0;
  const runs = await listNativeRuns(bytes, index);
  const proposed = runs.flatMap((run) => {
    const old = existing.find((e) => e.id === run.id);
    const before = old?.text ?? run.text,
      count = before.split(query).length - 1;
    if (!count) return [];
    const after = before.split(query).join(replacement);
    return [
      {
        edit: { ...old, id: run.id, original: run.text, text: after, autoAdapt: true },
        before,
        after,
        count,
      },
    ];
  });
  // Validate together in the worker. Only split the batch if a candidate fails.
  try {
    if (proposed.length)
      await nativePreview(
        bytes,
        index,
        [
          ...existing.filter((e) => !proposed.some((p) => p.edit.id === e.id)),
          ...proposed.map((p) => p.edit),
        ],
        font,
      );
    return { candidates: proposed, excluded };
  } catch {
    for (const candidate of proposed) {
      try {
        await nativePreview(
          bytes,
          index,
          [...existing.filter((e) => e.id !== candidate.edit.id), candidate.edit],
          font,
        );
        result.push(candidate);
      } catch {
        excluded += candidate.count;
      }
    }
    return { candidates: result, excluded };
  }
}
