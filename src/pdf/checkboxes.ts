export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Conservative detection of empty, closed, square printed boxes. Coordinates
 * are pixels. Candidates require user confirmation; this is not OCR or semantics. */
export function detectPrintedBoxes(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  scale = 1,
): Box[] {
  if (width * height > 2_500_000) throw new Error('Image trop grande pour la détection des cases.');
  const seen = new Uint8Array(width * height),
    queue = new Int32Array(width * height),
    boxes: Box[] = [];
  const ink = (i: number) =>
    data[i * 4 + 3] > 100 && data[i * 4] < 130 && data[i * 4 + 1] < 130 && data[i * 4 + 2] < 130;
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || !ink(start)) continue;
    let head = 0,
      tail = 1,
      minX = start % width,
      maxX = minX,
      minY = Math.floor(start / width),
      maxY = minY;
    queue[0] = start;
    seen[start] = 1;
    while (head < tail) {
      const i = queue[head++],
        x = i % width,
        y = Math.floor(i / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (const j of [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y < height - 1 ? i + width : -1,
      ])
        if (j >= 0 && !seen[j] && ink(j)) {
          seen[j] = 1;
          queue[tail++] = j;
        }
    }
    const w = maxX - minX + 1,
      h = maxY - minY + 1;
    if (
      w < 7 * scale ||
      h < 7 * scale ||
      w > 28 * scale ||
      h > 28 * scale ||
      w / h < 0.8 ||
      w / h > 1.25
    )
      continue;
    const band = Math.max(1, Math.round(Math.min(w, h) * 0.18));
    const coverage = (x0: number, y0: number, x1: number, y1: number) => {
      let n = 0,
        total = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          total++;
          if (ink(y * width + x)) n++;
        }
      return n / Math.max(1, total);
    };
    if (coverage(minX + band, minY + band, maxX - band + 1, maxY - band + 1) > 0.08) continue;
    const edgeCoverage = (
      horizontal: boolean,
      start: number,
      end: number,
      lo: number,
      hi: number,
    ) => {
      let covered = 0;
      for (let i = start; i <= end; i++) {
        for (let j = lo; j <= hi; j++) {
          if (ink(horizontal ? j * width + i : i * width + j)) {
            covered++;
            break;
          }
        }
      }
      return covered / (end - start + 1);
    };
    if (
      [
        edgeCoverage(true, minX, maxX, minY, minY + band - 1),
        edgeCoverage(true, minX, maxX, maxY - band + 1, maxY),
        edgeCoverage(false, minY, maxY, minX, minX + band - 1),
        edgeCoverage(false, minY, maxY, maxX - band + 1, maxX),
      ].some((n) => n < 0.85)
    )
      continue;
    if (
      [
        coverage(minX, minY, minX + band, minY + band),
        coverage(maxX - band + 1, minY, maxX + 1, minY + band),
        coverage(minX, maxY - band + 1, minX + band, maxY + 1),
        coverage(maxX - band + 1, maxY - band + 1, maxX + 1, maxY + 1),
      ].some((n) => n < 0.35)
    )
      continue;
    boxes.push({ x: minX, y: minY, width: w, height: h });
    if (boxes.length >= 200) break;
  }
  return boxes;
}
