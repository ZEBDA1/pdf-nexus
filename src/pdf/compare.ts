export interface WordDiff {
  added: string[];
  removed: string[];
}

export interface PageComparison {
  page: number;
  /** Mots ajoutés/supprimés ; vide si le texte est identique. */
  text: WordDiff;
  /** Part de pixels différents (0–1), si les rendus sont fournis. */
  pixels?: number;
  missing?: 'a' | 'b';
}

const words = (text: string) => text.split(/\s+/).filter(Boolean);

/** Différence de mots par plus longue sous-suite commune (limitée pour les très longues pages). */
export function diffWords(a: string, b: string, limit = 4000): WordDiff {
  const x = words(a).slice(0, limit);
  const y = words(b).slice(0, limit);
  const rows = x.length + 1;
  const cols = y.length + 1;
  const table = new Uint16Array(rows * cols);
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--)
      table[i * cols + j] =
        x[i] === y[j]
          ? table[(i + 1) * cols + j + 1] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
  const diff: WordDiff = { added: [], removed: [] };
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      i++;
      j++;
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) diff.removed.push(x[i++]);
    else diff.added.push(y[j++]);
  }
  diff.removed.push(...x.slice(i));
  diff.added.push(...y.slice(j));
  return diff;
}

/** Part de pixels dont l'écart de couleur dépasse le seuil. Les images doivent avoir la même taille. */
export function pixelDifference(a: Uint8ClampedArray, b: Uint8ClampedArray, threshold = 32) {
  if (a.length !== b.length || !a.length) return 1;
  let different = 0;
  for (let i = 0; i < a.length; i += 4)
    if (
      Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) >
      threshold
    )
      different++;
  return different / (a.length / 4);
}

export function comparePages(a: string[], b: string[]): PageComparison[] {
  const result: PageComparison[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i >= a.length) result.push({ page: i + 1, text: diffWords('', b[i]), missing: 'a' });
    else if (i >= b.length) result.push({ page: i + 1, text: diffWords(a[i], ''), missing: 'b' });
    else result.push({ page: i + 1, text: diffWords(a[i], b[i]) });
  }
  return result;
}
