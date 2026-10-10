export type Tool =
  | 'select'
  | 'text'
  | 'note'
  | 'highlight'
  | 'underline'
  | 'strike'
  | 'pen'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'image'
  | 'link'
  | 'stamp'
  | 'checkbox';
export interface Point {
  x: number;
  y: number;
}
export interface Annotation {
  id: string;
  type: Exclude<Tool, 'select'>;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  size: number;
  text?: string;
  checked?: boolean;
  url?: string;
  image?: Uint8Array;
  imageType?: 'png' | 'jpg';
  points?: Point[];
  replacement?: {
    background: string;
    font: string;
    original: string;
    angle: number;
    baseline: number;
    mask?: { x: number; y: number; width: number; height: number };
  };
}
export interface PageRef {
  id: string;
  source: number;
  index: number;
  rotation: number;
  annotations: Annotation[];
  nativeEdits?: NativeEdit[];
}
export interface NativeEdit {
  id: string;
  original: string;
  text: string;
  size?: number;
  font?: string;
  autoAdapt?: boolean;
  offset?: Point;
}
export interface Watermark {
  text: string;
  size: number;
  opacity: number;
  color: string;
  angle: number;
  position: 'center' | 'top' | 'bottom';
  repeat: boolean;
  pages: 'all' | 'odd' | 'even';
}
export interface Source {
  name: string;
  bytes: Uint8Array;
}
export interface Snapshot {
  pages: PageRef[];
  watermark: string;
  watermarkOptions?: Watermark;
  numbering: boolean;
  cleanMetadata: boolean;
}
export interface Workspace extends Snapshot {
  name: string;
  sources: Source[];
  encrypted: boolean;
}
export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PageText {
  page: number;
  text: string;
  items: TextItem[];
  ocr?: boolean;
}
export interface Preferences {
  theme: 'light' | 'dark' | 'auto';
  language: 'fr' | 'en';
  setupCompleted?: boolean;
  remember: boolean;
  favorites: string[];
  exportScale: number;
  aiMode: 'extract' | 'browser' | 'api';
  endpoint: string;
  model: string;
}
export const defaultPreferences: Preferences = {
  theme: 'light',
  language: 'fr',
  remember: true,
  favorites: ['merge', 'convert', 'ocr'],
  exportScale: 1.5,
  aiMode: 'extract',
  endpoint: '',
  model: '',
};
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  date: number;
  mode: Preferences['aiMode'];
}
export interface OutputFile {
  name: string;
  bytes: Uint8Array;
  mime: string;
}
export interface JobProgress {
  percent: number;
  label: string;
}
export type ConversionFormat = 'txt' | 'docx' | 'html' | 'xlsx' | 'png' | 'jpg' | 'pdf';
