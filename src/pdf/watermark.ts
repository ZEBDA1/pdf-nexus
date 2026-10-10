import type { Watermark } from '../types';
export const defaultWatermark: Watermark = {
  text: '',
  size: 42,
  opacity: 0.18,
  color: '#6456ed',
  angle: 35,
  position: 'center',
  repeat: false,
  pages: 'all',
};
export function watermarkFor(text: string, options?: Watermark): Watermark {
  return { ...defaultWatermark, ...options, text };
}
export function watermarkPositions(w: Watermark, width: number, height: number, page: number) {
  if (!w.text || (w.pages === 'odd' && page % 2 === 0) || (w.pages === 'even' && page % 2 !== 0))
    return [];
  if (w.repeat)
    return [0.2, 0.5, 0.8].flatMap((y) =>
      [0.25, 0.75].map((x) => ({ x: width * x, y: height * y })),
    );
  return [
    {
      x: width / 2,
      y: w.position === 'top' ? height - 70 : w.position === 'bottom' ? 70 : height / 2,
    },
  ];
}
