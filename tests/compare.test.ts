import { describe, expect, it } from 'vitest';
import { comparePages, diffWords, pixelDifference } from '../src/pdf/compare';

describe('comparaison', () => {
  it('détecte les mots ajoutés et supprimés', () => {
    expect(diffWords('le chat dort', 'le chien dort ici')).toEqual({
      removed: ['chat'],
      added: ['chien', 'ici'],
    });
    expect(diffWords('a b', 'a b')).toEqual({ added: [], removed: [] });
  });
  it('signale les pages absentes', () => {
    const r = comparePages(['x'], ['x', 'y']);
    expect(r[0].text.added).toEqual([]);
    expect(r[1]).toMatchObject({ missing: 'a' });
  });
  it('mesure la différence de pixels', () => {
    const a = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    const b = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]);
    expect(pixelDifference(a, a)).toBe(0);
    expect(pixelDifference(a, b)).toBe(0.5);
    expect(pixelDifference(a, new Uint8ClampedArray(4))).toBe(1);
  });
});
