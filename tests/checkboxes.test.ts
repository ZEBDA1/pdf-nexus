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
describe('Détection des cases imprimées', () => {
  it('repère les carrés vides ou cochés et écarte les rectangles et points', () => {
    const { data, ink, box } = fixture();
    box(10, 10, 12, 12);
    box(40, 10, 24, 8);
    box(10, 40, 12, 12);
    for (let i = 1; i < 11; i++) ink(10 + i, 40 + i);
    ink(80, 80);
    expect(detectPrintedBoxes(data, 100, 100)).toEqual([
      { x: 10, y: 10, width: 12, height: 12 },
      { x: 10, y: 40, width: 12, height: 12, checked: true },
    ]);
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
  it('repère les traits gris et fins, les petites cases et les contours interrompus', () => {
    const { data, box } = fixture();
    box(10, 10, 6, 6);
    box(35, 10, 16, 14);
    box(10, 45, 20, 20);
    // One small break on each edge of the larger box.
    for (const [x, y] of [
      [20, 45],
      [10, 55],
      [29, 55],
      [20, 64],
    ])
      data.set([255, 255, 255, 255], (y * 100 + x) * 4);
    for (let y = 10; y < 24; y++)
      for (let x = 35; x < 51; x++) {
        const offset = (y * 100 + x) * 4;
        if (data[offset] === 0) data.set([205, 205, 205, 255], offset);
      }
    expect(detectPrintedBoxes(data, 100, 100)).toEqual([
      { x: 10, y: 10, width: 6, height: 6 },
      { x: 35, y: 10, width: 16, height: 14 },
      { x: 10, y: 45, width: 20, height: 20 },
    ]);
  });
  it('repère une case reliée à une ligne sans prendre le tableau entier pour une case', () => {
    const { data, box, ink } = fixture();
    box(20, 20, 16, 16);
    for (let x = 0; x < 80; x++) ink(x, 20);
    box(5, 60, 70, 25);
    expect(detectPrintedBoxes(data, 100, 100)).toEqual([{ x: 20, y: 20, width: 16, height: 16 }]);
  });
  it('écarte un disque et un carré plein et valide les dimensions des données', () => {
    const { data, ink } = fixture();
    for (let y = 0; y < 100; y++)
      for (let x = 0; x < 100; x++) {
        const distance = Math.hypot(x - 20, y - 20);
        if (distance >= 9 && distance <= 11) ink(x, y);
        if (x >= 50 && x < 65 && y >= 50 && y < 65) ink(x, y);
      }
    expect(detectPrintedBoxes(data, 100, 100)).toEqual([]);
    expect(() => detectPrintedBoxes(data, 99, 100)).toThrow('invalide');
  });
});
