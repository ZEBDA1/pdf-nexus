import type { TextItem } from '../types';
// Conservative geometry-based extraction: at least three aligned rows and two columns.
export function detectTable(items: TextItem[]): string[][] {
  const rows: TextItem[][] = [];
  for (const item of items.filter((i) => i.text.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
    let row = rows.find((r) => Math.abs(r[0].y - item.y) < 3);
    if (!row) {
      row = [];
      rows.push(row);
    }
    row.push(item);
  }
  const candidates = rows
    .map((row) => {
      const cells: TextItem[] = [];
      for (const item of row.sort((a, b) => a.x - b.x)) {
        const last = cells.at(-1);
        if (last && item.x - (last.x + last.width) < 12) {
          last.text += ' ' + item.text;
          last.width = item.x + item.width - last.x;
        } else cells.push({ ...item });
      }
      return cells;
    })
    .filter((row) => row.length >= 2);
  for (const template of candidates) {
    const aligned = candidates.filter(
      (row) =>
        row.length === template.length && row.every((c, i) => Math.abs(c.x - template[i].x) < 12),
    );
    if (aligned.length >= 3) return aligned.map((row) => row.map((c) => c.text));
  }
  return [];
}
