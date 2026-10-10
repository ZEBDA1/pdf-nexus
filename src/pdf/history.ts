import type { Snapshot } from '../types';
export function cloneSnapshot(value: Snapshot): Snapshot {
  return structuredClone(value);
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
