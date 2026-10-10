import { describe, it, expect } from 'vitest';
import { detectPrintedBoxes } from '../src/pdf/checkboxes';

function fixture() {
  const data = new Uint8ClampedArray(100 * 100 * 4).fill(255);
  const ink = (x: number, y: number) => data.set([0, 0, 0, 255], (y * 100 + x) * 4);
  const box = (x: number, y: number, w: number, h: number) => {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++)
        if (i === x || i === x + w - 1 || j === y || j === y + h - 1) ink(i, j);
  };
  return { data, ink, box };
}
describe('Détection prudente des cases imprimées', () => {
  it('repère les carrés vides et écarte les rectangles, points et cases remplies', () => {
    const { data, ink, box } = fixture();
    box(10, 10, 12, 12);
    box(40, 10, 24, 8);
    box(10, 40, 12, 12);
    for (let i = 1; i < 11; i++) ink(10 + i, 40 + i);
    ink(80, 80);
    expect(detectPrintedBoxes(data, 100, 100)).toEqual([{ x: 10, y: 10, width: 12, height: 12 }]);
  });
  it('conserve les dimensions physiques au changement de résolution', () => {
    const { data, box } = fixture();
    box(10, 10, 24, 24);
    // A one-pixel line at 2x is still legitimate printed content.
    expect(detectPrintedBoxes(data, 100, 100, 2)).toHaveLength(1);
  });
  it('refuse les images hors budget mémoire', () => {
    expect(() => detectPrintedBoxes(new Uint8ClampedArray(), 5000, 5000)).toThrow('trop grande');
  });
});
