import type { Box } from './checkboxes';

export function mapBox(box: Box, transform: (x: number, y: number) => number[]): Box {
  const points = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ].map(([x, y]) => transform(x, y));
  const x = Math.min(...points.map((p) => p[0])),
    y = Math.min(...points.map((p) => p[1]));
  return {
    ...box,
    x,
    y,
    width: Math.max(...points.map((p) => p[0])) - x,
    height: Math.max(...points.map((p) => p[1])) - y,
  };
}

export function sameBox(a: Box, b: Box) {
  const intersection =
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const small = Math.min(a.width * a.height, b.width * b.height),
    large = Math.max(a.width * a.height, b.width * b.height);
  return small > 0 && small / large > 0.5 && intersection / small > 0.75;
}

export const boxKey = (box: Box) =>
  [box.x, box.y, box.width, box.height].map((n) => Math.round(n * 2)).join(':');
