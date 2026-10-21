import { ReplaceDialog } from './ReplaceDialog';
import { occurrences } from '../pdf/search';
import { ObjectsPanel } from './ObjectsPanel';
import { replacementFonts, replacementFontForText } from '../pdf/text-style';
import { usePdfZoom } from './usePdfZoom';
import { AllTextEditor } from './AllTextEditor';
import { SignatureDialog } from './SignatureDialog';
import { t } from '../i18n';
import type { NativeEdit } from '../types';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Minus,
  Plus,
  Maximize,
  RotateCw,
  Download,
  Printer,
  Undo2,
  Redo2,
  MousePointer2,
  Type,
  Highlighter,
  Pencil,
  Square,
  ArrowUpRight,
  MessageSquare,
  Ellipsis,
  Sparkles,
  Copy,
  Trash2,
  PanelLeftClose,
  GripVertical,
  FilePlus2,
  X,
  Hand,
  Signature,
  SquareCheck,
} from 'lucide-react';
import { Button, IconButton } from '../components/ui';
import { PdfPage } from './PdfPage';
import type { Workspace, Tool, Annotation, PageText, FormValue } from '../types';
import { readFile, safeUrl, errorMessage } from '../utils/files';
export function Reader({
  replaceNative,
  selectedIds,
  patchObjects,
  orderObject,
  copyObjects,
  pasteObjects,
  canPaste,
  updateForm,
  saveStatus,
  workspace,
  updateNative,
  updateVisual,
  docs,
  current,
  setCurrent,
  zoom,
  setZoom: setDocumentZoom,
  tool,
  setTool,
  color,
  setColor,
  size,
  setSize,
  text,
  setText,
  link,
  setLink,
  image,
  setImage,
  selected,
  setSelected,
  add,
  update,
  remove,
  rotate,
  duplicate,
  deletePage,
  reorder,
  insert,
  undo,
  redo,
  canUndo,
  canRedo,
  exportPdf,
  print,
  showAi,
  toggleAi,
  openTools,
  getText,
  notify,
}: {
  replaceNative: (changes: { pageId: string; edit: NativeEdit }[]) => void;
  selectedIds: string[];
  patchObjects: (ids: string[], changes: Partial<Annotation>, group?: string) => void;
  orderObject: (id: string, direction: number) => void;
  copyObjects: () => void;
  pasteObjects: () => void;
  canPaste: boolean;
  updateForm: (pageId: string, name: string, value: FormValue, group: string) => void;
  saveStatus?: ReactNode;
  workspace: Workspace;
  updateNative: (pageId: string, edits: NativeEdit[], group: string) => void;
  updateVisual: (pageId: string, annotation: Annotation, group: string) => void;
  docs: PDFDocumentProxy[];
  current: number;
  setCurrent: (n: number) => void;
  zoom: number;
  setZoom: (z: number) => void;
  tool: Tool;
  setTool: (t: Tool) => void;
  color: string;
  setColor: (s: string) => void;
  size: number;
  setSize: (n: number) => void;
  text: string;
  setText: (s: string) => void;
  link: string;
  setLink: (s: string) => void;
  image?: { bytes: Uint8Array; type: 'png' | 'jpg'; aspect?: number };
  setImage: (i: { bytes: Uint8Array; type: 'png' | 'jpg'; aspect?: number }) => void;
  selected?: string;
  setSelected: (id: string, multiple?: boolean) => void;
  add: (pageId: string, a: Annotation) => void;
  update: (pageId: string, a: Annotation, group?: string) => void;
  remove: () => void;
  rotate: () => void;
  duplicate: () => void;
  deletePage: () => void;
  reorder: (from: number, to: number) => void;
  insert: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  exportPdf: () => void;
  print: () => void;
  showAi: boolean;
  toggleAi: () => void;
  openTools: () => void;
  getText: (signal: AbortSignal) => Promise<PageText[]>;
  notify: (s: string, error?: boolean) => void;
}) {
  const setZoom = usePdfZoom(zoom, setDocumentZoom);
  const [sidebar, setSidebar] = useState(true),
    [search, setSearch] = useState(''),
    [results, setResults] = useState<PageText[]>([]),
    [searchQuery, setSearchQuery] = useState(''),
    [hit, setHit] = useState(0),
    [didSearch, setDidSearch] = useState(false),
    [replaceOpen, setReplaceOpen] = useState(false),
    [searching, setSearching] = useState(false),
    [drag, setDrag] = useState<number>();
  const [objects, setObjects] = useState(false);
  const searchControl = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => searchControl.current?.abort(), []);
  const hits = results.flatMap((p) =>
    occurrences(p.items.map((i) => i.text).join(' '), searchQuery).map((_, index) => ({
      page: p.page,
      index,
    })),
  );
  function stepHit(next: number) {
    const index = (next + hits.length) % hits.length;
    setHit(index);
    if (hits[index]) go(hits[index].page - 1);
  }
  useEffect(() => {
    searchControl.current?.abort();
    setResults([]);
    setSearchQuery('');
    setDidSearch(false);
    setSearching(false);
  }, [workspace.pages]);
  const [native, setNative] = useState(true);
  const [hand, setHand] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const pan = useRef<{ id: number; x: number; y: number; left: number; top: number } | undefined>(
    undefined,
  );
  const latest = useRef({ current, setCurrent });
  latest.current = { current, setCurrent };
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = el.getBoundingClientRect(),
          target = bounds.top + Math.min(180, bounds.height / 3);
        let best = 0,
          distance = Infinity;
        el.querySelectorAll<HTMLElement>('.pdf-page').forEach((page, i) => {
          const r = page.getBoundingClientRect();
          const d = target < r.top ? r.top - target : target > r.bottom ? target - r.bottom : 0;
          if (d < distance) {
            best = i;
            distance = d;
          }
        });
        if (best !== latest.current.current) latest.current.setCurrent(best);
      });
    };
    el.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      el.removeEventListener('scroll', update);
      cancelAnimationFrame(frame);
    };
  }, [workspace.pages.length]);
  const [allText, setAllText] = useState(false);
  const [signature, setSignature] = useState(false);
  const [detectBoxes, setDetectBoxes] = useState(false);
  const page = workspace.pages[current] ?? workspace.pages[0];
  const selectedPage = workspace.pages.find((p) => p.annotations.some((a) => a.id === selected));
  const selectedAnnotation = selectedPage?.annotations.find((a) => a.id === selected);
  const inspectorGroup = useRef('');
  const inspector = selectedAnnotation &&
    !selectedAnnotation.locked &&
    tool === 'select' &&
    selectedIds.length === 1 && (
      <div className="annotation-inspector">
        <span>{t('Annotation sélectionnée')}</span>
        {selectedAnnotation.type === 'checkbox' && (
          <label>
            <input
              type="checkbox"
              checked={selectedAnnotation.checked ?? false}
              onChange={(e) =>
                update(selectedPage!.id, { ...selectedAnnotation, checked: e.target.checked })
              }
            />
            {t('Case cochée')}
          </label>
        )}
        {selectedAnnotation.text !== undefined && (
          <textarea
            rows={2}
            aria-label={t('Modifier le texte sélectionné')}
            value={selectedAnnotation.text}
            onFocus={() => {
              inspectorGroup.current = crypto.randomUUID();
            }}
            onChange={(e) =>
              update(
                selectedPage!.id,
                { ...selectedAnnotation, text: e.target.value },
                inspectorGroup.current,
              )
            }
          />
        )}
        <label>
          {t('Largeur')}{' '}
          <input
            aria-label={t('Largeur de l’annotation')}
            type="number"
            min={5}
            max={1500}
            value={Math.round(selectedAnnotation.width)}
            onFocus={() => {
              inspectorGroup.current = crypto.randomUUID();
            }}
            onChange={(e) =>
              update(
                selectedPage!.id,
                {
                  ...selectedAnnotation,
                  width: Math.max(5, Number(e.target.value)),
                },
                inspectorGroup.current,
              )
            }
          />
        </label>
        <label>
          {t('Hauteur')}{' '}
          <input
            aria-label={t('Hauteur de l’annotation')}
            type="number"
            min={5}
            max={1500}
            value={Math.round(selectedAnnotation.height)}
            onFocus={() => {
              inspectorGroup.current = crypto.randomUUID();
            }}
            onChange={(e) =>
              update(
                selectedPage!.id,
                {
                  ...selectedAnnotation,
                  height: Math.max(5, Number(e.target.value)),
                },
                inspectorGroup.current,
              )
            }
          />
        </label>
        {selectedAnnotation.text !== undefined && (
          <label>
            {t('Police')}
            <select
              aria-label={t('Police de l’objet')}
              value={selectedAnnotation.replacement?.font ?? selectedAnnotation.font ?? 'Noto Sans'}
              onChange={(e) => {
                const font = replacementFontForText(e.target.value, selectedAnnotation.text ?? '');
                patchObjects(
                  [selectedAnnotation.id],
                  selectedAnnotation.replacement
                    ? { replacement: { ...selectedAnnotation.replacement, font } }
                    : { font },
                );
              }}
            >
              {replacementFonts.map((font) => (
                <option key={font}>{font}</option>
              ))}
            </select>
          </label>
        )}
        {selectedAnnotation.type !== 'image' && (
          <>
            <label>
              {t('Couleur')}
              <input
                type="color"
                aria-label={t('Couleur de l’annotation')}
                value={selectedAnnotation.color}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
            <label>
              {t('Taille')}
              <input
                type="number"
                min={4}
                max={150}
                aria-label={t('Taille de l’annotation')}
                value={selectedAnnotation.size}
                onChange={(e) => setSize(Math.max(4, Math.min(150, Number(e.target.value))))}
              />
            </label>
          </>
        )}
        <IconButton label={t('Supprimer l’annotation sélectionnée')} onClick={remove}>
          <Trash2 size={17} />
        </IconButton>
      </div>
    );
  function go(n: number) {
    const clamped = Math.max(0, Math.min(workspace.pages.length - 1, n));
    setCurrent(clamped);
    document
      .getElementById(`page-${workspace.pages[clamped].id}`)
      ?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  async function find() {
    searchControl.current?.abort();
    const control = new AbortController();
    searchControl.current = control;
    setSearching(true);
    setDidSearch(false);
    try {
      const pages = await getText(control.signal);
      if (control.signal.aborted) return;
      const matched = pages.filter(
        (p) => occurrences(p.items.map((i) => i.text).join(' '), search).length,
      );
      setSearchQuery(search);
      setResults(matched);
      setHit(0);
      setDidSearch(true);
      if (matched.length) go(matched[0].page - 1);
    } catch (e) {
      if (!control.signal.aborted) notify(errorMessage(e), true);
    } finally {
      if (searchControl.current === control) setSearching(false);
    }
  }
  async function chooseImage(file: File) {
    try {
      const source = await readFile(file, ['png', 'jpg', 'jpeg']);
      setImage({ bytes: source.bytes, type: /\.png$/i.test(source.name) ? 'png' : 'jpg' });
      setTool('image');
    } catch (e) {
      notify(errorMessage(e), true);
    }
  }
  const annotationTools = [
    { id: 'select', name: 'Sélectionner et déplacer', icon: MousePointer2 },
    { id: 'highlight', name: 'Surligner une zone', icon: Highlighter },
    { id: 'pen', name: 'Dessiner', icon: Pencil },
    { id: 'rect', name: 'Rectangle', icon: Square },
    { id: 'arrow', name: 'Flèche', icon: ArrowUpRight },
    { id: 'note', name: 'Ajouter une note', icon: MessageSquare },
  ] as const;
  return (
    <section className="reader">
      <div className="document-bar">
        <div className="document-title">
          <span className="file-dot" aria-label={t('PDF Nexus')}>
            {t('Nexus')}
          </span>
          <span>
            <strong>{workspace.name}</strong>
            <small>
              {workspace.pages.length} {t('pages ·')}{' '}
              {workspace.encrypted
                ? t('Lecture seule — PDF chiffré')
                : (saveStatus ?? t('Brouillon local · exportez pour enregistrer'))}
            </small>
          </span>
        </div>
        <div className="row">
          <IconButton label={t('Imprimer le document')} onClick={print}>
            <Printer size={18} />
          </IconButton>
          <Button className={showAi ? 'soft-primary' : ''} onClick={toggleAi}>
            <Sparkles size={16} />
            {t('Assistant')}
          </Button>
          <Button className="primary" disabled={workspace.encrypted} onClick={exportPdf}>
            <Download size={16} />
            {t('Exporter le PDF')}
          </Button>
        </div>
      </div>
      <div className="viewer-controls">
        <div className="row">
          <IconButton
            label={t('Afficher ou masquer les miniatures')}
            onClick={() => setSidebar(!sidebar)}
          >
            <PanelLeftClose size={17} />
          </IconButton>
          <span className="divider" />
          <IconButton
            label={t('Page précédente')}
            disabled={current === 0}
            onClick={() => go(current - 1)}
          >
            <ChevronLeft size={17} />
          </IconButton>
          <input
            className="page-number"
            aria-label={t('Numéro de page')}
            type="number"
            min={1}
            max={workspace.pages.length}
            value={current + 1}
            onChange={(e) => go(Number(e.target.value) - 1)}
          />
          <span className="muted">/ {workspace.pages.length}</span>
          <IconButton
            label={t('Page suivante')}
            disabled={current === workspace.pages.length - 1}
            onClick={() => go(current + 1)}
          >
            <ChevronRight size={17} />
          </IconButton>
        </div>
        <div className="row">
          <IconButton
            label={t('Réduire le zoom')}
            onClick={() => setZoom(Math.max(0.25, zoom - 0.15))}
          >
            <Minus size={16} />
          </IconButton>
          <select
            aria-label={t('Zoom')}
            value={Math.round(zoom * 100)}
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
          >
            {[...new Set([50, 75, 100, 125, 150, 200, Math.round(zoom * 100)])]
              .sort((a, b) => a - b)
              .map((z) => (
                <option key={z} value={z}>
                  {z} %
                </option>
              ))}
          </select>
          <IconButton
            label={t('Agrandir le zoom')}
            onClick={() => setZoom(Math.min(3, zoom + 0.15))}
          >
            <Plus size={16} />
          </IconButton>
          <Button
            className="subtle"
            onClick={() => {
              const available = document.querySelector('.page-scroller')?.clientWidth ?? 800;
              const el = document.getElementById(`page-${page.id}`);
              setZoom(
                Math.max(0.25, Math.min(3, (available - 70) / (el ? el.clientWidth / zoom : 595))),
              );
            }}
          >
            {t('Largeur')}
          </Button>
          <Button
            className="subtle"
            onClick={() => {
              const el = document.getElementById(`page-${page.id}`);
              const scroller = document.querySelector('.page-scroller');
              setZoom(
                Math.max(
                  0.25,
                  Math.min(
                    3,
                    ((scroller?.clientHeight ?? 800) - 100) / (el ? el.clientHeight / zoom : 842),
                  ),
                ),
              );
            }}
          >
            {t('Page')}
          </Button>
          <IconButton
            label={t('Plein écran')}
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                void document.documentElement
                  .requestFullscreen()
                  .catch(() => notify('Plein écran indisponible.', true));
            }}
          >
            <Maximize size={16} />
          </IconButton>
        </div>
        <form
          className="search-box"
          onSubmit={(e) => {
            e.preventDefault();
            void find();
          }}
        >
          <Search size={15} />
          <input
            aria-label={t('Rechercher dans le PDF')}
            placeholder={t('Rechercher dans le PDF')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button aria-label={t('Lancer la recherche')} disabled={searching || !search.trim()}>
            {searching ? '…' : '↵'}
          </button>
        </form>
      </div>
      <div className="annotation-toolbar">
        <button
          className={`button ${!native && !hand && tool === 'select' ? 'soft-primary' : ''}`}
          aria-label={t('Lire et sélectionner le texte')}
          aria-pressed={!native && !hand && tool === 'select'}
          onClick={() => {
            setNative(false);
            setHand(false);
            setTool('select');
          }}
        >
          <MousePointer2 size={17} />
          {t('Lire')}
        </button>
        <button
          className={`button ${native ? 'primary' : ''}`}
          aria-label={t('Modifier le texte existant')}
          aria-pressed={native}
          disabled={workspace.encrypted}
          onClick={() => {
            setNative(true);
            setHand(false);
            setTool('select');
          }}
        >
          <Type size={17} />
          {t('Modifier le texte')}
        </button>
        <button
          className={`button ${tool === 'text' ? 'soft-primary' : ''}`}
          disabled={workspace.encrypted}
          aria-pressed={tool === 'text'}
          onClick={() => {
            setNative(false);
            setHand(false);
            setTool('text');
          }}
        >
          <Plus size={17} />
          {t('Ajouter du texte')}
        </button>
        <button
          className={`icon-button ${hand ? 'active' : ''}`}
          title={t('Déplacer le document')}
          aria-label={t('Déplacer le document')}
          aria-pressed={hand}
          onClick={() => {
            setHand(!hand);
            setNative(false);
            setTool('select');
          }}
        >
          <Hand size={18} />
        </button>
        <details className="annotation-menu">
          <summary className={`button ${!['text', 'select'].includes(tool) ? 'soft-primary' : ''}`}>
            <Highlighter size={17} />
            {t('Annoter')}
            <span aria-hidden="true">⌄</span>
          </summary>
          <div className="annotation-menu-content">
            {annotationTools.map((entry) => (
              <button
                key={entry.id}
                className={`button ${!native && !hand && tool === entry.id ? 'active' : ''}`}
                disabled={workspace.encrypted && entry.id !== 'select'}
                title={t(entry.name)}
                aria-label={t(entry.name)}
                aria-pressed={!native && !hand && tool === entry.id}
                onClick={(e) => {
                  setNative(false);
                  setHand(false);
                  setTool(entry.id);
                  e.currentTarget.closest('details')?.removeAttribute('open');
                }}
              >
                <entry.icon size={18} />
                {t(entry.name)}
              </button>
            ))}
            <select
              aria-label={t('Autres annotations')}
              value={
                [
                  'underline',
                  'strike',
                  'ellipse',
                  'line',
                  'link',
                  'stamp',
                  'image',
                  'checkbox',
                ].includes(tool)
                  ? tool
                  : ''
              }
              onChange={(e) => {
                setNative(false);
                setHand(false);
                setTool(e.target.value as Tool);
                e.currentTarget.closest('details')?.removeAttribute('open');
              }}
              disabled={workspace.encrypted}
            >
              <option value="" disabled>
                {t('Autres outils')}
              </option>
              <option value="underline">{t('Souligner')}</option>
              <option value="strike">{t('Barrer')}</option>
              <option value="ellipse">{t('Ellipse')}</option>
              <option value="line">{t('Ligne')}</option>
              <option value="link">{t('Lien')}</option>
              <option value="stamp">{t('Tampon')}</option>
              <option value="image">{t('Image / logo')}</option>
              <option value="checkbox">{t('Case à cocher')}</option>
            </select>
          </div>
        </details>
        <details className="annotation-menu">
          <summary className={`button ${detectBoxes ? 'soft-primary' : ''}`}>
            <Signature size={17} />
            {t('Remplir et signer')}
            <span aria-hidden="true">⌄</span>
          </summary>
          <div className="annotation-menu-content">
            <Button
              disabled={workspace.encrypted}
              onClick={(e) => {
                setSignature(true);
                e.currentTarget.closest('details')?.removeAttribute('open');
              }}
            >
              <Signature size={17} />
              {t('Signer')}
            </Button>
            <Button
              aria-pressed={detectBoxes}
              disabled={workspace.encrypted}
              className={detectBoxes ? 'soft-primary' : ''}
              onClick={(e) => {
                setDetectBoxes(!detectBoxes);
                e.currentTarget.closest('details')?.removeAttribute('open');
              }}
            >
              <SquareCheck size={17} />
              {t('Repérer les cases')}
            </Button>
          </div>
        </details>
        <Button
          aria-pressed={objects}
          onClick={() => {
            setObjects(!objects);
            setAllText(false);
            setNative(false);
            setHand(false);
            setTool('select');
          }}
        >
          {t('Objets ajoutés')}
        </Button>
        <div className="row toolbar-history">
          <IconButton label={t('Annuler (Ctrl+Z)')} disabled={!canUndo} onClick={undo}>
            <Undo2 size={17} />
          </IconButton>
          <IconButton label={t('Rétablir (Ctrl+Maj+Z)')} disabled={!canRedo} onClick={redo}>
            <Redo2 size={17} />
          </IconButton>
          <Button onClick={openTools}>
            {t('Outils du document')}
            <Ellipsis size={17} />
          </Button>
        </div>
      </div>
      {!native && !hand && tool !== 'select' && (
        <div className="annotation-context">
          <strong>
            {tool === 'text'
              ? t('Texte à ajouter')
              : t(annotationTools.find((e) => e.id === tool)?.name ?? 'Annotation')}
          </strong>
          <label>
            {t('Couleur')}
            <input
              type="color"
              aria-label={t('Couleur de l’annotation')}
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <label>
            {t('Taille')}
            <select
              aria-label={t('Taille de l’annotation')}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            >
              {[10, 12, 14, 18, 24, 32].map((n) => (
                <option key={n} value={n}>
                  {n}
                  {t(' pt')}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <IconButton label={t('Supprimer l’annotation sélectionnée')} onClick={remove}>
              <Trash2 size={17} />
            </IconButton>
          )}
          {tool === 'text' && (
            <small>
              {t(
                'Cliquez dans la page, puis écrivez. Le brouillon est mis à jour à chaque frappe.',
              )}
            </small>
          )}
        </div>
      )}
      {['stamp', 'link', 'image'].includes(tool) && (
        <div className="annotation-options">
          {tool === 'image' ? (
            <label className="button">
              {image ? t('Changer l’image') : t('Choisir une image')}
              <input
                type="file"
                hidden
                accept=".png,.jpg,.jpeg"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void chooseImage(f);
                  e.target.value = '';
                }}
              />
            </label>
          ) : (
            <>
              <textarea
                aria-label={t('Texte de l’annotation')}
                placeholder={
                  tool === 'stamp'
                    ? t('Texte du tampon personnalisé')
                    : t('Texte à insérer (superposition)')
                }
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
              />
              {tool === 'link' && (
                <input
                  aria-label={t('Adresse du lien')}
                  placeholder={t('https://exemple.fr')}
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                />
              )}
            </>
          )}
          <small>
            {t('Cliquez dans la page pour placer l’élément. Sélectionnez-le pour le déplacer.')}
          </small>
        </div>
      )}
      {native && (
        <div className="editing-hint">
          <span className="live-dot" />
          <span>{t('Cliquez sur un texte ou sélectionnez un passage pour le modifier.')}</span>
          <button
            className={`button subtle ${allText ? 'soft-primary' : ''}`}
            aria-pressed={allText}
            onClick={() => setAllText(!allText)}
          >
            {t('Modifier tout le texte')}
          </button>
          <Button onClick={() => setReplaceOpen(true)} disabled={workspace.encrypted}>
            {t('Rechercher et remplacer')}
          </Button>
        </div>
      )}
      {replaceOpen && (
        <ReplaceDialog
          workspace={workspace}
          getText={getText}
          apply={replaceNative}
          close={() => setReplaceOpen(false)}
        />
      )}
      {inspector}
      {detectBoxes && (
        <div className="editing-hint">
          {t(
            'Cases imprimées : cliquez pour cocher. Clic droit ou Suppr masque un faux repère ; relancez le repérage pour le retrouver.',
          )}
        </div>
      )}
      {signature && (
        <SignatureDialog
          close={() => setSignature(false)}
          insert={(image) => {
            setImage(image);
            setNative(false);
            setHand(false);
            setTool('image');
          }}
        />
      )}
      <div className="viewer-body">
        {sidebar && (
          <aside className="pages-sidebar">
            <header>
              <strong>{t('Pages')}</strong>
              <span>{workspace.pages.length}</span>
            </header>
            <div className="page-actions">
              <IconButton label={t('Insérer des PDF après la page courante')} onClick={insert}>
                <FilePlus2 size={16} />
              </IconButton>
              <IconButton
                label={t('Faire pivoter la page courante')}
                disabled={workspace.encrypted}
                onClick={rotate}
              >
                <RotateCw size={16} />
              </IconButton>
              <IconButton
                label={t('Dupliquer la page courante')}
                disabled={workspace.encrypted}
                onClick={duplicate}
              >
                <Copy size={16} />
              </IconButton>
              <IconButton
                label={t('Supprimer la page courante')}
                disabled={workspace.encrypted || workspace.pages.length === 1}
                onClick={deletePage}
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
            <div className="thumbnail-list">
              {workspace.pages.map((ref, i) => (
                <button
                  className={`thumbnail-item ${current === i ? 'current' : ''}`}
                  key={ref.id}
                  draggable={!workspace.encrypted}
                  onDragStart={() => setDrag(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (drag !== undefined) reorder(drag, i);
                    setDrag(undefined);
                  }}
                  onClick={() => go(i)}
                  aria-label={t('Page {page}. Déplacer avec Alt+flèche.', { page: i + 1 })}
                  onKeyDown={(e) => {
                    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                      e.preventDefault();
                      const to = Math.max(
                        0,
                        Math.min(workspace.pages.length - 1, i + (e.key === 'ArrowUp' ? -1 : 1)),
                      );
                      reorder(i, to);
                      setCurrent(to);
                    }
                  }}
                >
                  <PdfPage
                    doc={docs[ref.source]}
                    reference={ref}
                    source={workspace.sources[ref.source]}
                    index={i}
                    zoom={0.185}
                    thumbnail
                  />
                  <span>
                    <GripVertical size={12} />
                    {i + 1}
                  </span>
                </button>
              ))}
            </div>
          </aside>
        )}
        <div
          className={`page-scroller ${hand ? 'hand-mode' : ''}`}
          ref={scroller}
          onPointerDownCapture={(e) => {
            if (e.button !== 1 && !(hand && e.button === 0)) return;
            if ((e.target as HTMLElement).closest('input,button,select,textarea')) return;
            e.preventDefault();
            e.stopPropagation();
            pan.current = {
              id: e.pointerId,
              x: e.clientX,
              y: e.clientY,
              left: e.currentTarget.scrollLeft,
              top: e.currentTarget.scrollTop,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const start = pan.current;
            if (!start || start.id !== e.pointerId) return;
            e.currentTarget.scrollTo({
              left: start.left + start.x - e.clientX,
              top: start.top + start.y - e.clientY,
              behavior: 'instant',
            });
          }}
          onPointerUp={(e) => {
            if (pan.current?.id === e.pointerId) {
              pan.current = undefined;
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          onPointerCancel={() => {
            pan.current = undefined;
          }}
        >
          {didSearch && (
            <div className="search-results" role="status">
              <strong>
                {hits.length
                  ? t('Occurrence {current} sur {count}', { current: hit + 1, count: hits.length })
                  : t('Aucune occurrence trouvée')}
              </strong>
              <IconButton
                label={t('Occurrence précédente')}
                disabled={!hits.length}
                onClick={() => stepHit(hit - 1)}
              >
                <ChevronLeft size={15} />
              </IconButton>
              <IconButton
                label={t('Occurrence suivante')}
                disabled={!hits.length}
                onClick={() => stepHit(hit + 1)}
              >
                <ChevronRight size={15} />
              </IconButton>
              <IconButton
                label={t('Fermer les résultats')}
                onClick={() => {
                  searchControl.current?.abort();
                  setResults([]);
                  setSearchQuery('');
                  setDidSearch(false);
                }}
              >
                <X size={15} />
              </IconButton>
            </div>
          )}
          {workspace.pages.map((ref, i) => (
            <div className="page-frame" key={ref.id}>
              <PdfPage
                searchQuery={searchQuery}
                searchItems={results.find((p) => p.page === i + 1)?.items}
                activeOccurrence={hits[hit]?.page === i + 1 ? hits[hit].index : -1}
                onFormChange={(name, value, group) => updateForm(ref.id, name, value, group)}
                doc={docs[ref.source]}
                reference={ref}
                source={workspace.sources[ref.source]}
                index={i}
                zoom={zoom}
                tool={tool}
                nativeMode={native && !workspace.encrypted}
                detectBoxes={detectBoxes && !workspace.encrypted}
                readOnly={workspace.encrypted}
                onNativeEdits={(edits, group) => updateNative(ref.id, edits, group)}
                onVisualEdit={(a, group) => updateVisual(ref.id, a, group)}
                color={color}
                size={size}
                text={text}
                link={link}
                image={image}
                selected={selected}
                selectedIds={selectedIds}
                onSelect={setSelected}
                onAdd={(a) => {
                  try {
                    if (a.type === 'link') a.url = safeUrl(a.url ?? '');
                    add(ref.id, a);
                    if (a.type === 'image') {
                      setTool('select');
                      setNative(false);
                    }
                  } catch (e) {
                    notify(errorMessage(e), true);
                  }
                }}
                onUpdate={(a, group) => update(ref.id, a, group)}
                onError={(s) => notify(s, true)}
                watermark={workspace.watermark}
                watermarkOptions={workspace.watermarkOptions}
                numbering={workspace.numbering}
                total={workspace.pages.length}
              />
              <small>
                {t('PAGE')} {i + 1} {t('SUR')} {workspace.pages.length}
              </small>
            </div>
          ))}
        </div>
        {objects && (
          <ObjectsPanel
            workspace={workspace}
            selected={selectedIds}
            select={(id, multiple) => {
              setNative(false);
              setHand(false);
              setSelected(id, multiple);
              const page = workspace.pages.findIndex((p) => p.annotations.some((a) => a.id === id));
              if (page >= 0) go(page);
            }}
            patch={patchObjects}
            order={orderObject}
            remove={remove}
            copy={copyObjects}
            paste={pasteObjects}
            canPaste={canPaste}
            close={() => setObjects(false)}
          />
        )}
        {allText && (
          <AllTextEditor
            workspace={workspace}
            docs={docs}
            initial={current}
            go={go}
            close={() => setAllText(false)}
            updateNative={updateNative}
            updateVisual={updateVisual}
          />
        )}
      </div>
      <footer className="reader-status">
        <span>
          <span className="status-dot" />
          {t('Traitement local')}
        </span>
        <span>
          {workspace.pages.reduce((n, p) => n + p.annotations.length, 0)} {t('annotation(s) ·')}{' '}
          {workspace.pages.reduce((n, p) => n + (p.nativeEdits?.length ?? 0), 0)}{' '}
          {t('bloc(s) de texte modifié(s)')} ·{' '}
          {workspace.pages.reduce(
            (n, p) => n + p.annotations.filter((a) => a.replacement).length,
            0,
          )}{' '}
          {t('correction(s) visuelle(s)')}
        </span>
        <span>{t('Ctrl+S exporter · Ctrl+O ouvrir')}</span>
      </footer>
    </section>
  );
}
