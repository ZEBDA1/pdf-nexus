import { describe, expect, it } from 'vitest';
import { detectSkewAngle } from '../src/pdf/deskew';

function stripedImage(w: number, h: number, tiltDeg: number): Uint8Array {
  const gray = new Uint8Array(w * h).fill(255);
  const rad = (tiltDeg * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Inverse rotation into the straight horizontal-lines template
      const ux = (x - cx) * cos + (y - cy) * sin + cx;
      const uy = -(x - cx) * sin + (y - cy) * cos + cy;
      if (ux >= 20 && ux <= w - 20 && uy >= 20 && uy <= h - 20 && uy % 18 < 3) {
        gray[y * w + x] = 20;
      }
    }
  }
  return gray;
}

describe('detectSkewAngle', () => {
  it('renvoie 0 pour une image blanche ou trop petite', () => {
    expect(detectSkewAngle(new Uint8Array(100), 10, 10)).toBe(0);
    expect(detectSkewAngle(new Uint8Array(200 * 200).fill(255), 200, 200)).toBe(0);
  });

  it('renvoie 0 lorsque les lignes sont déjà horizontales', () => {
    const straight = stripedImage(200, 200, 0);
    expect(detectSkewAngle(straight, 200, 200)).toBe(0);
  });

  it('détecte une inclinaison connue et renvoie l’angle correcteur opposé', () => {
    const tilted = stripedImage(200, 200, 4);
    const correction = detectSkewAngle(tilted, 200, 200);
    expect(correction).toBeLessThan(-3);
    expect(correction).toBeGreaterThan(-5);
  });
});
