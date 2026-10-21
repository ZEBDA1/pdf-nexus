export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  checked?: boolean;
}

/** Printed boxes, including fine/grey strokes, small gaps, and marked boxes.
 * Enclosed white regions and horizontal edge pairs are checked against all
 * four original edges. This is a visual suggestion, not semantic recognition. */
export function detectPrintedBoxes(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  scale = 1,
): Box[] {
  if (width * height > 2_500_000) throw new Error('Image trop grande pour la détection des cases.');
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    data.length !== width * height * 4 ||
    !Number.isFinite(scale) ||
    scale <= 0
  )
    throw new Error('Image invalide pour la détection des cases.');
  const count = width * height;
  const ink = new Uint8Array(count);
  const histogram = new Uint32Array(256);
  for (let i = 0; i < count; i++) {
    const alpha = data[i * 4 + 3] / 255;
    const light = Math.round(
      (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) * alpha +
        255 * (1 - alpha),
    );
    ink[i] = light;
    histogram[light]++;
  }
  let background = 255,
    sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += histogram[i];
    if (sum >= count * 0.85) {
      background = i;
      break;
    }
  }
  const threshold = Math.min(225, background - 28);
  for (let i = 0; i < count; i++) ink[i] = ink[i] <= threshold ? 1 : 0;
  const min = Math.max(5, Math.floor(5 * scale));
  const max = Math.max(min + 2, Math.ceil(36 * scale));
  const gap = Math.max(1, Math.min(3, Math.round(scale)));
  const boxes: Box[] = [];
  const labels = new Int32Array(count);
  const queue = new Int32Array(count);
  const components: Box[] = [{ x: 0, y: 0, width: 0, height: 0 }];
  // A white counter inside B/P/0 is not a standalone contour. Retain the
  // bounds of its full ink component instead of treating the hole as a box.
  for (let start = 0; start < count; start++) {
    if (!ink[start] || labels[start]) continue;
    const label = components.length;
    let head = 0,
      tail = 1;
    let left = start % width,
      right = left,
      top = Math.floor(start / width),
      bottom = top;
    queue[0] = start;
    labels[start] = label;
    while (head < tail) {
      const i = queue[head++],
        x = i % width,
        y = Math.floor(i / width);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy,
            next = ny * width + nx;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && ink[next] && !labels[next]) {
            labels[next] = label;
            queue[tail++] = next;
          }
        }
    }
    components.push({ x: left, y: top, width: right - left + 1, height: bottom - top + 1 });
  }
  const filled = (x: number, y: number) =>
    x >= 0 && x < width && y >= 0 && y < height && ink[y * width + x] === 1;

  function validate(x: number, y: number, w: number, h: number) {
    if (
      x < 0 ||
      y < 0 ||
      x + w > width ||
      y + h > height ||
      w < min ||
      h < min ||
      w > max ||
      h > max ||
      w / h < 0.65 ||
      w / h > 1.5
    )
      return;
    const band = Math.max(1, Math.min(Math.round(1.4 * scale), Math.round(Math.min(w, h) * 0.12)));
    const edge = (
      horizontal: boolean,
      fixed: number,
      start: number,
      length: number,
      direction: number,
    ) => {
      let support = 0;
      for (let i = 0; i < length; i++) {
        for (let j = 0; j < band; j++)
          if (
            filled(
              horizontal ? start + i : fixed + j * direction,
              horizontal ? fixed + j * direction : start + i,
            )
          ) {
            support++;
            break;
          }
      }
      return support / length;
    };
    const edges = [
      edge(true, y, x, w, 1),
      edge(true, y + h - 1, x, w, -1),
      edge(false, x, y, h, 1),
      edge(false, x + w - 1, y, h, -1),
    ];
    if (Math.min(...edges) < 0.76 || edges.reduce((a, b) => a + b, 0) / 4 < 0.88) return;
    // A letter O or rounded bullet has no ink near the outer corners.
    const corner = Math.max(1, Math.ceil(Math.min(w, h) * 0.1));
    let corners = 0;
    for (const [cx, cy] of [
      [x, y],
      [x + w - corner, y],
      [x, y + h - corner],
      [x + w - corner, y + h - corner],
    ]) {
      let n = 0;
      for (let j = 0; j < corner; j++)
        for (let i = 0; i < corner; i++) if (filled(cx + i, cy + j)) n++;
      if (n >= corner) corners++;
    }
    if (corners < 4) return;
    const componentIds = new Set<number>();
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++)
        if (
          (i < x + band || i >= x + w - band || j < y + band || j >= y + h - band) &&
          ink[j * width + i]
        )
          componentIds.add(labels[j * width + i]);
    const margin = Math.max(1, Math.round(scale * 0.6));
    for (const id of componentIds) {
      const component = components[id];
      if (component.y < y - margin || component.y + component.height > y + h + margin) return;
      if (component.x < x - margin || component.x + component.width > x + w + margin) {
        // A table rule may touch the top or bottom edge. Extra ink at other
        // heights is a letter/word extending outside the proposed rectangle.
        let first = Infinity,
          last = -Infinity;
        for (const column of [x - margin - 1, x + w + margin]) {
          if (column < 0 || column >= width) continue;
          for (let row = y; row < y + h; row++)
            if (labels[row * width + column] === id) {
              first = Math.min(first, row);
              last = Math.max(last, row);
            }
        }
        if (
          first === Infinity ||
          last - first > band + margin ||
          !(last < y + band + margin || first >= y + h - band - margin)
        )
          return;
      }
    }
    const inset = Math.max(band + 1, Math.ceil(Math.min(w, h) * 0.24));
    let inner = 0,
      total = 0;
    for (let j = y + inset; j < y + h - inset; j++)
      for (let i = x + inset; i < x + w - inset; i++) {
        total++;
        if (filled(i, j)) inner++;
      }
    if (!total || inner / total > 0.58) return;
    const candidate: Box = {
      x,
      y,
      width: w,
      height: h,
      ...(inner / total > 0.07 ? { checked: true } : {}),
    };
    const duplicate = boxes.find((b) => {
      const intersection =
        Math.max(0, Math.min(x + w, b.x + b.width) - Math.max(x, b.x)) *
        Math.max(0, Math.min(y + h, b.y + b.height) - Math.max(y, b.y));
      return intersection / Math.min(w * h, b.width * b.height) > 0.65;
    });
    if (!duplicate && boxes.length < 300) boxes.push(candidate);
  }

  // White interiors stay enclosed when boxes touch labels or table rules.
  // Bridge only short axial gaps, then reuse the mask as visited bits.
  const closed = ink.slice();
  for (let y = 0; y < height; y++) {
    let last = -100;
    for (let x = 0; x < width; x++)
      if (ink[y * width + x]) {
        if (x - last <= gap + 1) for (let j = last + 1; j < x; j++) closed[y * width + j] = 1;
        last = x;
      }
  }
  for (let x = 0; x < width; x++) {
    let last = -100;
    for (let y = 0; y < height; y++)
      if (ink[y * width + x]) {
        if (y - last <= gap + 1) for (let j = last + 1; j < y; j++) closed[j * width + x] = 1;
        last = y;
      }
  }
  const seen = closed;
  for (let start = 0; start < count; start++) {
    if (seen[start]) continue;
    let head = 0,
      tail = 1;
    let left = start % width,
      right = left,
      top = Math.floor(start / width),
      bottom = top;
    queue[0] = start;
    seen[start] = 1;
    while (head < tail) {
      const i = queue[head++],
        x = i % width,
        y = Math.floor(i / width);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      const visit = (j: number) => {
        if (!seen[j]) {
          seen[j] = 1;
          queue[tail++] = j;
        }
      };
      if (x > 0) visit(i - 1);
      if (x + 1 < width) visit(i + 1);
      if (y > 0) visit(i - width);
      if (y + 1 < height) visit(i + width);
    }
    const w = right - left + 1,
      h = bottom - top + 1;
    if (
      left < 1 ||
      top < 1 ||
      right >= width - 1 ||
      bottom >= height - 1 ||
      w < min - 4 ||
      h < min - 4 ||
      w > max ||
      h > max ||
      w / h < 0.55 ||
      w / h > 1.7
    )
      continue;
    const cx = Math.round((left + right) / 2),
      cy = Math.round((top + bottom) / 2);
    const stroke = Math.max(2, Math.ceil(Math.min(w, h) * 0.3));
    let x0 = left - 1,
      x1 = right + 1,
      y0 = top - 1,
      y1 = bottom + 1;
    for (let i = 1; i < stroke && filled(x0 - 1, cy); i++) x0--;
    for (let i = 1; i < stroke && filled(x1 + 1, cy); i++) x1++;
    for (let i = 1; i < stroke && filled(cx, y0 - 1); i++) y0--;
    for (let i = 1; i < stroke && filled(cx, y1 + 1); i++) y1++;
    validate(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }

  // Horizontal pairs also find ticked boxes with split white interiors.
  const rows: { x: number; end: number }[][] = Array.from({ length: height }, () => []);
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      if (!ink[y * width + x]) {
        x++;
        continue;
      }
      const start = x;
      let end = x++,
        missing = 0;
      while (x < width && missing <= gap) {
        if (ink[y * width + x]) {
          end = x;
          missing = 0;
        } else missing++;
        x++;
      }
      if (end - start + 1 >= min && end - start + 1 <= max) rows[y].push({ x: start, end });
    }
  }
  const tolerance = Math.max(2, Math.round(1.5 * scale));
  for (let y = 0; y < height; y++)
    for (const top of rows[y]) {
      const w = top.end - top.x + 1;
      for (
        let bottom = y + Math.max(min - 1, Math.floor(w / 1.5) - 1);
        bottom < Math.min(height, y + max, y + Math.ceil(w / 0.65));
        bottom++
      )
        for (const edge of rows[bottom]) {
          if (Math.abs(edge.x - top.x) <= tolerance && Math.abs(edge.end - top.end) <= tolerance)
            validate(
              Math.min(top.x, edge.x),
              y,
              Math.max(top.end, edge.end) - Math.min(top.x, edge.x) + 1,
              bottom - y + 1,
            );
        }
    }
  return boxes.sort((a, b) => a.y - b.y || a.x - b.x);
}
