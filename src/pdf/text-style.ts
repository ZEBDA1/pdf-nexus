export function closestFont(name: string) {
  const bold = /bold|black|heavy|demi/i.test(name),
    italic = /italic|oblique/i.test(name);
  if (/courier|mono|consolas/i.test(name))
    return `Courier${bold && italic ? '-BoldOblique' : bold ? '-Bold' : italic ? '-Oblique' : ''}`;
  if (/times|serif|georgia|garamond|cambria/i.test(name) && !/sans/i.test(name))
    return `Times-${bold && italic ? 'BoldItalic' : bold ? 'Bold' : italic ? 'Italic' : 'Roman'}`;
  return `Helvetica${bold && italic ? '-BoldOblique' : bold ? '-Bold' : italic ? '-Oblique' : ''}`;
}
export function cssFont(name: string) {
  const family = /Times/.test(name)
    ? 'Georgia, serif'
    : /Courier/.test(name)
      ? 'Courier New, monospace'
      : /Noto ?Sans/i.test(name)
        ? 'Noto Sans, sans-serif'
        : 'Arial, sans-serif';
  return {
    fontFamily: family,
    fontWeight: /Bold/.test(name) ? 700 : 400,
    fontStyle: /Italic|Oblique/.test(name) ? 'italic' : 'normal',
  };
}
export const replacementFonts = [
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
  'Times-Roman',
  'Times-Bold',
  'Times-Italic',
  'Times-BoldItalic',
  'Courier',
  'Courier-Bold',
  'Noto Sans',
];

const winAnsiCharacters = new Set(
  Array.from({ length: 224 }, (_, i) =>
    new TextDecoder('windows-1252').decode(new Uint8Array([i + 32])),
  ),
);
export function replacementFontForText(preferred: string, text: string) {
  return preferred === 'Noto Sans' || Array.from(text).some((c) => !winAnsiCharacters.has(c))
    ? 'Noto Sans'
    : preferred;
}

// Sample the rendered page, never document colors supplied as executable CSS.
export function sampleTextColors(
  canvas: HTMLCanvasElement,
  rect: { x: number; y: number; width: number; height: number },
) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !canvas.width) return { background: '#ffffff', color: '#222222' };
  const sx = canvas.width / (canvas.clientWidth || canvas.width),
    sy = canvas.height / (canvas.clientHeight || canvas.height);
  const x = Math.max(0, Math.floor(rect.x * sx)),
    y = Math.max(0, Math.floor(rect.y * sy));
  const width = Math.max(1, Math.min(canvas.width - x, Math.ceil(rect.width * sx))),
    height = Math.max(1, Math.min(canvas.height - y, Math.ceil(rect.height * sy)));
  const data = ctx.getImageData(x, y, width, height).data;
  const bins = new Map<string, { n: number; rgb: number[] }>();
  for (let i = 0; i < data.length; i += 4) {
    const rgb = [data[i], data[i + 1], data[i + 2]],
      key = rgb.map((c) => c >> 4).join(',');
    const bin = bins.get(key);
    if (bin) bin.n++;
    else bins.set(key, { n: 1, rgb });
  }
  const sorted = [...bins.values()].sort((a, b) => b.n - a.n),
    bg = sorted[0]?.rgb ?? [255, 255, 255];
  const ink = sorted
    .filter((b) => b.n > Math.max(1, width * height * 0.002))
    .sort(
      (a, b) =>
        b.rgb.reduce((s, c, i) => s + (c - bg[i]) ** 2, 0) -
        a.rgb.reduce((s, c, i) => s + (c - bg[i]) ** 2, 0),
    )[0]?.rgb ?? [34, 34, 34];
  const hex = (rgb: number[]) => '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
  return { background: hex(bg), color: hex(ink) };
}
