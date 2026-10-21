import type { Snapshot } from '../types';
export function cloneSnapshot(value: Snapshot): Snapshot {
  // A Workspace is structurally a Snapshot, but its source buffers must never
  // be copied into every history entry (or into persisted undo history).
  return structuredClone({
    pages: value.pages,
    watermark: value.watermark,
    watermarkOptions: value.watermarkOptions,
    numbering: value.numbering,
    cleanMetadata: value.cleanMetadata,
  });
}
export class History {
  past: Snapshot[] = [];
  future: Snapshot[] = [];
  push(value: Snapshot) {
    this.past.push(cloneSnapshot(value));
    if (this.past.length > 40) this.past.shift();
    this.future = [];
  }
  undo(current: Snapshot) {
    const value = this.past.pop();
    if (value) this.future.push(cloneSnapshot(current));
    return value;
  }
  redo(current: Snapshot) {
    const value = this.future.pop();
    if (value) this.past.push(cloneSnapshot(current));
    return value;
  }
}
