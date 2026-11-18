/**
 * Détecte l'angle d'inclinaison d'une page scannée (en degrés, entre -8° et +8°)
 * par maximisation de la variance des projections horizontales. Renvoie 0 si
 * la page est déjà droite (|angle| < 0.4°) ou sans contraste exploitable.
 */
export function detectSkewAngle(gray: Uint8Array, width: number, height: number): number {
  if (width < 20 || height < 20 || gray.length < width * height) return 0;
  let darkCount = 0;
  const bin = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    if (gray[i] < 190) {
      bin[i] = 1;
      darkCount++;
    }
  }
  if (darkCount < 50 || darkCount > width * height * 0.85) return 0;

  const cx = width / 2;
  const cy = height / 2;

  const scoreAngle = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const rows = new Float64Array(height);
    for (let y = 0; y < height; y += 2) {
      const dy = y - cy;
      for (let x = 0; x < width; x += 2) {
        if (!bin[y * width + x]) continue;
        const ry = Math.round((x - cx) * sin + dy * cos + cy);
        if (ry >= 0 && ry < height) rows[ry]++;
      }
    }
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < height; i++) {
      sum += rows[i];
      sumSq += rows[i] * rows[i];
    }
    const mean = sum / height;
    return sumSq / height - mean * mean;
  };

  let bestAngle = 0;
  let bestScore = scoreAngle(0);
  for (let deg = -8; deg <= 8; deg += 0.5) {
    const score = scoreAngle(deg);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = deg;
    }
  }
  const coarse = bestAngle;
  for (let deg = coarse - 0.5; deg <= coarse + 0.5; deg += 0.1) {
    const score = scoreAngle(deg);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = deg;
    }
  }
  const rounded = Math.round(bestAngle * 10) / 10;
  return Math.abs(rounded) >= 0.4 ? rounded : 0;
}

/**
 * Analyse un canvas de page scannée, détecte son inclinaison et produit un
 * nouveau canvas redressé sur fond blanc (ou retourne le canvas source si droit).
 */
export function deskewCanvas(source: HTMLCanvasElement): {
  canvas: HTMLCanvasElement;
  angle: number;
} {
  const maxW = 420;
  const scale = Math.min(1, maxW / Math.max(1, source.width));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));

  const probe = document.createElement('canvas');
  probe.width = w;
  probe.height = h;
  const pCtx = probe.getContext('2d');
  if (!pCtx) return { canvas: source, angle: 0 };
  pCtx.drawImage(source, 0, 0, w, h);
  const data = pCtx.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
  }
  probe.width = 0;
  probe.height = 0;

  const angle = detectSkewAngle(gray, w, h);
  if (!angle) return { canvas: source, angle: 0 };

  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext('2d');
  if (!ctx) return { canvas: source, angle: 0 };
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return { canvas: out, angle };
}
