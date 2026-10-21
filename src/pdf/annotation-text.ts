import { cssFont, replacementFontForText } from './text-style';
let context: CanvasRenderingContext2D | null | undefined;
export function previewLines(
  text: string,
  size: number,
  width: number,
  font = 'Noto Sans',
): string[] {
  context ??= document.createElement('canvas').getContext('2d');
  if (!context) return text.split('\n');
  const css = cssFont(replacementFontForText(font, text));
  context.font = `${css.fontStyle} ${css.fontWeight} ${size}px ${css.fontFamily}`;
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (context.measureText(next).width <= width) line = next;
      else {
        if (line) lines.push(line);
        line = '';
        for (const c of word) {
          if (line && context.measureText(line + c).width > width) {
            lines.push(line);
            line = '';
          }
          line += c;
        }
      }
    }
    lines.push(line);
  }
  return lines;
}
