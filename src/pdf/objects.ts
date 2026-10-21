import type { Annotation, Point } from '../types';

export function correctionBox(
  anchor: { x: number; y: number; size: number; height: number; angle: number },
  previous: Annotation | undefined,
  text: string,
  size: number,
  offset: Point,
) {
  const oldExtra = previous
    ? Math.max(0, (previous.text ?? '').split('\n').length - 1) * previous.size * 1.3
    : 0;
  const extra = Math.max(0, text.split('\n').length - 1) * size * 1.3;
  const baseline = (previous?.replacement?.baseline ?? anchor.size * 0.22) - oldExtra + extra;
  const angle = (anchor.angle * Math.PI) / 180;
  return {
    x: anchor.x + Math.sin(angle) * baseline + offset.x,
    y: anchor.y - Math.cos(angle) * baseline + offset.y,
    height: Math.max(anchor.height - oldExtra, size * 1.22) + extra,
    baseline,
  };
}

export function moveObject(a: Annotation, dx: number, dy: number): Annotation {
  return {
    ...a,
    x: a.x + dx,
    y: a.y + dy,
    points: a.points?.map((p) => ({ x: p.x + dx, y: p.y + dy })),
    replacement: a.replacement
      ? {
          ...a.replacement,
          mask: a.replacement.mask
            ? {
                ...a.replacement.mask,
                x: a.replacement.mask.x + dx,
                y: a.replacement.mask.y + dy,
              }
            : undefined,
        }
      : undefined,
  };
}
export function resizeObject(
  a: Annotation,
  box: { x: number; y: number; width: number; height: number },
): Annotation {
  return {
    ...a,
    ...box,
    points: a.points?.map((p) => ({
      x: box.x + ((p.x - a.x) * box.width) / Math.max(1, a.width),
      y: box.y + ((p.y - a.y) * box.height) / Math.max(1, a.height),
    })),
  };
}
export function snapObject(
  a: Annotation,
  others: Annotation[],
  bounds: number[],
  tolerance: number,
) {
  const [x0, y0, x1, y1] = bounds;
  const targets = { x: [x0, (x0 + x1) / 2, x1], y: [y0, (y0 + y1) / 2, y1] };
  for (const o of others.filter((o) => !o.hidden && o.id !== a.id)) {
    targets.x.push(o.x, o.x + o.width / 2, o.x + o.width);
    targets.y.push(o.y, o.y + o.height / 2, o.y + o.height);
  }
  const guides: Partial<Point> = {};
  const delta = { x: 0, y: 0 };
  for (const axis of ['x', 'y'] as const) {
    const extent = axis === 'x' ? a.width : a.height;
    let best = tolerance;
    for (const v of [a[axis], a[axis] + extent / 2, a[axis] + extent])
      for (const target of targets[axis])
        if (Math.abs(target - v) < best) {
          best = Math.abs(target - v);
          delta[axis] = target - v;
          guides[axis] = target;
        }
  }
  return { annotation: moveObject(a, delta.x, delta.y), guides };
}
