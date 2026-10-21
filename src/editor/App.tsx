import { t, setLanguage } from '../i18n';
import { version } from '../../package.json';
import { Setup } from './Setup';
import { fetchPdfUrl } from '../background/opening';
import { openDownloadedPdf } from '../background/downloads';
import { WatermarkControls } from './WatermarkControls';
import { nativePreview } from '../pdf/native-text';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  Home as HomeIcon,
  FileText,
  Layers3,
  ArrowLeftRight,
  Sparkles,
  Settings as SettingsIcon,
  Plus,
  ShieldCheck,
  Sun,
  Moon,
  X,
  Combine,
  Scissors,
  ScanText,
  FileDown,
  Info,
  Minimize2,
  Upload,
  ArrowUpRight,
  LockKeyhole,
} from 'lucide-react';
import {
  Brand,
  Button,
  IconButton,
  Empty,
  Modal,
  PrivacyBadge,
  Progress,
  SectionTitle,
} from '../components/ui';
import { Home, tools } from './Home';
import { Reader } from './Reader';
import { Settings } from './Settings';
import { Converter, type RunJob } from './Converter';
import { AiPanel } from './AiPanel';
import {
  defaultPreferences,
  type Preferences,
  type Workspace,
  type Annotation,
  type Snapshot,
  type Tool,
  type PageText,
  type Source,
  type OutputFile,
} from '../types';
import {
  getPreferences,
  takeStagedFile,
  savePreferences,
  listRecent,
  remember,
  removeRecent,
  clearData,
  documentId,
  type Recent,
} from '../storage';
import {
  readFile,
  uid,
  download,
  errorMessage,
  safeName,
  fileSize,
  parsePages,
  checkAbort,
} from '../utils/files';
import { loadPdf, extractPage, renderRaster, canvasBytes } from '../pdf/reader';
import { History } from '../pdf/history';
import { processJob, restoreSource, getFont, type RasterPage } from '../workers/client';
import type { RestoredSource } from '../pdf/editable';
import { recognize } from '../ocr';
import { packageOutputs } from '../converters';
import { listDrafts, loadDraft, deleteDraft, type DraftInfo } from '../storage/drafts';
import { useAutosave } from './useAutosave';
import { ExportDialog } from './ExportDialog';
import { DraftStatus } from './DraftStatus';
import { moveObject } from '../pdf/objects';

type View = 'home' | 'editor' | 'tools' | 'convert' | 'settings';
export function App() {
  const [setup, setSetup] = useState(false),
    [prefsReady, setPrefsReady] = useState(false);
  const importedUrl = useRef(false);
  const [drafts, setDrafts] = useState<DraftInfo[]>([]),
    [draftId, setDraftId] = useState<string>(uid),
    [recovered, setRecovered] = useState(false);
  const [view, setView] = useState<View>(
    ['settings', 'convert', 'tools'].includes(location.hash.slice(1))
      ? (location.hash.slice(1) as View)
      : 'home',
  );
  const [prefs, setPrefs] = useState<Preferences>(defaultPreferences),
    [recent, setRecent] = useState<Recent[]>([]),
    [workspace, setWorkspace] = useState<Workspace>(),
    [docs, setDocs] = useState<PDFDocumentProxy[]>([]),
    [docId, setDocId] = useState('');
  setLanguage(prefs.language);
  const [current, setCurrent] = useState(0),
    [zoom, setZoom] = useState(1),
    [tool, setTool] = useState<Tool>('select'),
    [color, setColor] = useState('#000000'),
    [size, setSize] = useState(14),
    [text, setText] = useState(''),
    [link, setLink] = useState(''),
    [image, setImage] = useState<{ bytes: Uint8Array; type: 'png' | 'jpg'; aspect?: number }>(),
    [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selected = selectedIds.at(-1);
  function setSelected(id?: string) {
    setSelectedIds(id ? [id] : []);
  }
  const clipboard = useRef<Annotation[]>([]);
  const [canPaste, setCanPaste] = useState(false);
  const creationColors = useRef<Partial<Record<Tool, string>>>({ text: '#000000' });
  const [ai, setAi] = useState(false),
    [modal, setModal] = useState<'tools' | 'metadata' | null>(null),
    [range, setRange] = useState(''),
    [ocrLanguage, setOcrLanguage] = useState<'fra' | 'eng' | 'fra+eng'>('fra+eng'),
    [compression, setCompression] = useState('structure'),
    [metadata, setMetadata] = useState(''),
    [toast, setToast] = useState<{ text: string; error?: boolean }>(),
    [job, setJob] = useState<{ label: string; percent: number; controller: AbortController }>();
  const history = useRef(new History()),
    cache = useRef(new Map<string, PageText>()),
    input = useRef<HTMLInputElement>(null),
    insertInput = useRef<HTMLInputElement>(null),
    jobLock = useRef(false),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const docsRef = useRef<PDFDocumentProxy[]>([]);
  docsRef.current = docs;
  const autosave = useAutosave({
    id: draftId,
    workspace,
    history: history.current,
    current,
    zoom,
    documentId: docId,
    enabled: prefs.autoSave && prefsReady,
    recovered,
    saved: () => {
      void listDrafts()
        .then(setDrafts)
        .catch(() => {});
    },
  });
  function notify(message: string, error = false) {
    setToast({ text: t(message), error });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(undefined), error ? 10000 : 6000);
  }
  useEffect(() => {
    void getPreferences()
      .then((p) => {
        setPrefs(p);
        setSetup(location.hash === '#setup' || !p.setupCompleted);
        setPrefsReady(true);
      })
      .catch(() => notify('Impossible de lire les préférences.', true));
    void listRecent()
      .then(setRecent)
      .catch(() => notify('Le stockage local est indisponible.', true));
    void listDrafts()
      .then(setDrafts)
      .catch(() => notify('Impossible de lire les brouillons locaux.', true));
    return () => {
      docsRef.current.forEach((d) => void d.loadingTask.destroy());
    };
  }, []);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        prefs.theme === 'auto' ? (mq.matches ? 'dark' : 'light') : prefs.theme;
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [prefs.theme]);
  useEffect(() => {
    if (location.hash === '#ai') setAi(true);
  }, []);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (
        (history.current.past.length || history.current.future.length) &&
        autosave.status.kind !== 'saved'
      ) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [workspace, autosave.status.kind]);
  async function updatePrefs(p: Preferences) {
    setPrefs(p);
    try {
      await savePreferences(p);
    } catch (e) {
      notify(errorMessage(e), true);
    }
  }
  const run: RunJob = async (label, task) => {
    if (jobLock.current) return;
    jobLock.current = true;
    const controller = new AbortController();
    setJob({ label, percent: 0, controller });
    try {
      await task(controller.signal, (n) =>
        setJob({ label, percent: Math.max(0, Math.min(100, n * 100)), controller }),
      );
    } catch (e) {
      notify(
        controller.signal.aborted ? 'Opération annulée.' : errorMessage(e),
        !controller.signal.aborted,
      );
    } finally {
      setJob(undefined);
      jobLock.current = false;
    }
  };
  const [openingError, setOpeningError] = useState('');
  useEffect(() => {
    if (
      !prefsReady ||
      setup ||
      importedUrl.current ||
      !/^#(url|pending|download)=/.test(location.hash)
    )
      return;
    importedUrl.current = true;
    const staged = location.hash.startsWith('#pending=');
    const downloaded = location.hash.startsWith('#download=');
    const url = location.hash.slice(downloaded ? 10 : staged ? 9 : 5);
    void run('Ouverture du PDF', async (signal) => {
      try {
        const source = downloaded
          ? await openDownloadedPdf(url, signal)
          : staged
            ? await takeStagedFile(url)
            : await fetchPdfUrl(url, signal);
        await openSources([source], signal);
        window.history.replaceState(null, '', location.pathname);
      } catch (e) {
        setOpeningError(errorMessage(e));
      }
    });
  }, [prefsReady, setup]);
  async function refreshRecent() {
    setRecent(await listRecent());
  }
  async function openSources(sources: Source[], signal: AbortSignal) {
    if (!sources.length) return;
    if (sources.reduce((n, s) => n + s.bytes.length, 0) > 150 * 1024 * 1024)
      throw new Error('Les PDF ouverts ne peuvent pas dépasser 150 Mio au total.');
    const loaded: PDFDocumentProxy[] = [];
    const prepared: RestoredSource[] = [];
    let encrypted = false;
    try {
      for (const source of sources) {
        checkAbort(signal);
        const restored = await restoreSource(source, signal);
        prepared.push(restored);
        let doc: PDFDocumentProxy;
        try {
          doc = await loadPdf(restored.source.bytes, undefined, signal);
        } catch (e) {
          if ((e as Error).name !== 'PasswordException') throw e;
          const password = window.prompt(
            t('Ce PDF est protégé. Saisissez le mot de passe autorisé pour le lire.'),
          );
          if (password === null) throw new Error('Ouverture annulée.');
          doc = await loadPdf(source.bytes, password, signal);
          encrypted = true;
        }
        loaded.push(doc);
        encrypted = encrypted || (await doc.getPermissions()) !== null;
      }
      if (loaded.reduce((n, d) => n + d.numPages, 0) > 1000)
        throw new Error('Limite de 1 000 pages dans cet espace.');
      checkAbort(signal);
      docsRef.current.forEach((d) => void d.loadingTask.destroy());
      setDocs(loaded);
      cache.current.clear();
      history.current = new History();
      setSelected(undefined);
      setCurrent(0);
      setTool('select');
      setDraftId(uid());
      setRecovered(false);
      const formGroups = loaded.map(() => uid());
      const pages = loaded.flatMap((d, source) =>
        Array.from({ length: d.numPages }, (_, index) => ({
          id: uid(),
          source,
          index,
          rotation: 0,
          formGroup: formGroups[source],
          annotations: (prepared[source].annotations[index] ?? []).map((a) => ({
            ...a,
            id: uid(),
          })),
        })),
      );
      setWorkspace({
        name: sources.length === 1 ? sources[0].name : 'fusion.pdf',
        sources: prepared.map((p) => p.source),
        pages,
        watermark: '',
        numbering: false,
        cleanMetadata: false,
        encrypted,
      });
      setView('editor');
      if (prepared.some((p) => p.invalidPages))
        notify(
          'Certaines données d’édition Nexus sont illisibles. Leur rendu reste visible, mais ces éléments ne peuvent pas être sélectionnés.',
          true,
        );
      const id = await documentId(sources[0].bytes);
      setDocId(id);
      if (prefs.remember && sources.length === 1) {
        try {
          await remember(sources[0], pages.length, id);
          await refreshRecent();
        } catch {
          notify('Document ouvert. L’enregistrement dans les fichiers récents a échoué.', true);
        }
      }
    } catch (e) {
      await Promise.all(loaded.map((d) => d.loadingTask.destroy()));
      throw e;
    }
  }
  function unsaved() {
    return history.current.past.length > 0 && autosave.status.kind !== 'saved';
  }
  async function resumeDraft(id: string) {
    if (unsaved() && !window.confirm(t('Remplacer le brouillon actuel ?'))) return;
    await run('Restauration du brouillon', async (signal) => {
      const stored = await loadDraft(id),
        loaded: PDFDocumentProxy[] = [];
      try {
        for (const source of stored.sources) {
          const doc = await loadPdf(source.bytes, undefined, signal);
          loaded.push(doc);
          if ((await doc.getPermissions()) !== null)
            throw new Error('Les documents protégés ne sont pas sauvegardés en brouillon.');
        }
        checkAbort(signal);
        docsRef.current.forEach((d) => void d.loadingTask.destroy());
        const recoveredHistory = new History();
        recoveredHistory.past = stored.state.history.past;
        recoveredHistory.future = stored.state.history.future;
        history.current = recoveredHistory;
        liveHistory.current = '';
        cache.current.clear();
        setSelected(undefined);
        setWorkspace({
          ...stored.state.snapshot,
          name: stored.info.name,
          sources: stored.sources,
          encrypted: false,
        });
        setDocs(loaded);
        setDraftId(id);
        setRecovered(true);
        setDocId(stored.state.documentId);
        setCurrent(
          Math.max(0, Math.min(stored.state.current, stored.state.snapshot.pages.length - 1)),
        );
        setZoom(Math.max(0.25, Math.min(3, stored.state.zoom)));
        setView('editor');
        notify('Brouillon restauré avec son historique local.');
      } catch (error) {
        await Promise.all(loaded.map((d) => d.loadingTask.destroy()));
        throw error;
      }
    });
  }
  async function removeDraft(id: string) {
    if (!window.confirm(t('Supprimer définitivement ce brouillon local ?'))) return;
    if (id === draftId) {
      autosave.cancel();
      setWorkspace(undefined);
      setDocs([]);
      docsRef.current.forEach((d) => void d.loadingTask.destroy());
      history.current = new History();
      setView('home');
    }
    try {
      await deleteDraft(id);
      setDrafts(await listDrafts());
      notify('Brouillon supprimé.');
    } catch (error) {
      notify(errorMessage(error), true);
    }
  }
  function open() {
    if (
      unsaved() &&
      !window.confirm(
        t(
          'Ouvrir un autre document et abandonner ce brouillon ? Exportez-le pour conserver vos modifications.',
        ),
      )
    )
      return;
    input.current?.click();
  }
  async function drop(files: File[]) {
    if (unsaved() && !window.confirm(t('Remplacer le brouillon actuel ?'))) return;
    await run('Ouverture des PDF', async (signal) => {
      const sources: Source[] = [];
      for (const f of files) sources.push(await readFile(f));
      await openSources(sources, signal);
    });
  }
  async function insertFiles(files: File[]) {
    if (!workspace || workspace.encrypted) return;
    await run('Insertion des pages', async (signal) => {
      const sources: Source[] = [],
        newDocs: PDFDocumentProxy[] = [],
        prepared: RestoredSource[] = [];
      try {
        for (const file of files) {
          checkAbort(signal);
          const source = await readFile(file);
          const restored = await restoreSource(source, signal);
          prepared.push(restored);
          sources.push(restored.source);
          newDocs.push(await loadPdf(restored.source.bytes));
        }
        const formGroups = newDocs.map(() => uid());
        const refs = newDocs.flatMap((d, s) =>
          Array.from({ length: d.numPages }, (_, index) => ({
            id: uid(),
            source: workspace.sources.length + s,
            index,
            rotation: 0,
            formGroup: formGroups[s],
            annotations: (prepared[s].annotations[index] ?? []).map((a) => ({ ...a, id: uid() })),
          })),
        );
        if (workspace.pages.length + refs.length > 1000) throw new Error('Limite de 1 000 pages.');
        checkAbort(signal);
        commit(
          {
            ...workspace,
            pages: [
              ...workspace.pages.slice(0, current + 1),
              ...refs,
              ...workspace.pages.slice(current + 1),
            ],
          },
          [...workspace.sources, ...sources],
        );
        setDocs([...docs, ...newDocs]);
        notify('Pages insérées.');
      } catch (e) {
        await Promise.all(newDocs.map((d) => d.loadingTask.destroy()));
        throw e;
      }
    });
  }
  const liveHistory = useRef('');
  function commit(snapshot: Snapshot, sources = workspace?.sources, group = '') {
    if (!workspace || workspace.encrypted) return;
    if (!group || liveHistory.current !== group) history.current.push(workspace);
    liveHistory.current = group;
    setWorkspace({ ...workspace, ...snapshot, sources: sources ?? workspace.sources });
  }
  function alterPages(transform: (pages: Workspace['pages']) => Workspace['pages'], group = '') {
    if (workspace) commit({ ...workspace, pages: transform(workspace.pages) }, undefined, group);
  }
  function addAnnotation(pageId: string, a: Annotation) {
    alterPages((pages) =>
      pages.map((p) => (p.id === pageId ? { ...p, annotations: [...p.annotations, a] } : p)),
    );
    setSelected(a.id);
  }
  function updateAnnotation(pageId: string, a: Annotation, group = '') {
    alterPages(
      (pages) =>
        pages.map((p) =>
          p.id === pageId
            ? {
                ...p,
                annotations: p.annotations.map((old) =>
                  old.id === a.id && !old.locked
                    ? a
                    : selectedIds.includes(a.id) &&
                        selectedIds.includes(old.id) &&
                        !old.locked &&
                        !old.hidden
                      ? moveObject(
                          old,
                          a.x - (p.annotations.find((v) => v.id === a.id)?.x ?? a.x),
                          a.y - (p.annotations.find((v) => v.id === a.id)?.y ?? a.y),
                        )
                      : old,
                ),
              }
            : p,
        ),
      group,
    );
  }
  function changeColor(value: string) {
    setColor(value);
    if (tool !== 'select' && !selected) creationColors.current[tool] = value;
    if (selected)
      alterPages((pages) =>
        pages.map((p) => ({
          ...p,
          annotations: p.annotations.map((a) =>
            selectedIds.includes(a.id) && !a.locked ? { ...a, color: value } : a,
          ),
        })),
      );
  }
  function changeSize(value: number) {
    setSize(value);
    if (selected)
      alterPages((pages) =>
        pages.map((p) => ({
          ...p,
          annotations: p.annotations.map((a) =>
            selectedIds.includes(a.id) && !a.locked ? { ...a, size: value } : a,
          ),
        })),
      );
  }
  function chooseTool(value: Tool) {
    setSelected(undefined);
    if (value !== 'select')
      setColor(creationColors.current[value] ?? (value === 'text' ? '#000000' : '#6456ed'));
    setTool(value);
  }
  function selectAnnotation(id: string, multiple = false) {
    if (!id) {
      setSelected(undefined);
      return;
    }
    setSelectedIds((ids) =>
      multiple ? (ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id]) : [id],
    );
    setTool('select');
    const pageIndex =
      workspace?.pages.findIndex((p) => p.annotations.some((a) => a.id === id)) ?? -1;
    if (pageIndex < 0) return;
    const a = workspace!.pages[pageIndex].annotations.find((a) => a.id === id)!;
    setColor(a.color);
    setSize(a.size);
    setCurrent(pageIndex);
  }
  function removeAnnotation() {
    const removable =
      workspace?.pages.flatMap((p) =>
        p.annotations.filter((a) => selectedIds.includes(a.id) && !a.locked).map((a) => a.id),
      ) ?? [];
    if (!removable.length) return;
    alterPages((pages) =>
      pages.map((p) => ({
        ...p,
        annotations: p.annotations.filter((a) => !removable.includes(a.id)),
      })),
    );
    setSelectedIds(selectedIds.filter((id) => !removable.includes(id)));
  }
  function patchObjects(ids: string[], changes: Partial<Annotation>, group = '') {
    alterPages(
      (pages) =>
        pages.map((p) => ({
          ...p,
          annotations: p.annotations.map((a) =>
            ids.includes(a.id) &&
            (!a.locked || Object.keys(changes).every((k) => k === 'locked' || k === 'name'))
              ? { ...a, ...changes, id: a.id }
              : a,
          ),
        })),
      group,
    );
  }
  function orderObject(id: string, direction: number) {
    alterPages((pages) =>
      pages.map((p) => {
        const annotations = [...p.annotations],
          from = annotations.findIndex((a) => a.id === id);
        const to = from + direction;
        if (from < 0 || to < 0 || to >= annotations.length || annotations[from].locked) return p;
        [annotations[from], annotations[to]] = [annotations[to], annotations[from]];
        return { ...p, annotations };
      }),
    );
  }
  function copyObjects() {
    const items =
      workspace?.pages.flatMap((p) => p.annotations.filter((a) => selectedIds.includes(a.id))) ??
      [];
    if (!items.length) return;
    clipboard.current = structuredClone(items);
    setCanPaste(true);
    notify('Objets copiés. Choisissez une page puis collez.');
  }
  function pasteObjects() {
    if (!workspace || workspace.encrypted || !clipboard.current.length) return;
    const items = clipboard.current.map((a) => ({
      ...moveObject(structuredClone(a), 12, -12),
      id: uid(),
      locked: false,
      hidden: false,
    }));
    const target = workspace.pages[current];
    alterPages((pages) =>
      pages.map((p) =>
        p.id === target.id ? { ...p, annotations: [...p.annotations, ...items] } : p,
      ),
    );
    setSelectedIds(items.map((a) => a.id));
    setTool('select');
  }
  function undo() {
    liveHistory.current = '';
    if (!workspace) return;
    const previous = history.current.undo(workspace);
    if (previous) {
      setWorkspace({ ...workspace, ...previous });
      setCurrent((n) => Math.min(n, previous.pages.length - 1));
    }
  }
  function redo() {
    liveHistory.current = '';
    if (!workspace) return;
    const next = history.current.redo(workspace);
    if (next) {
      setWorkspace({ ...workspace, ...next });
      setCurrent((n) => Math.min(n, next.pages.length - 1));
    }
  }
  function rotate() {
    alterPages((p) =>
      p.map((ref, i) => (i === current ? { ...ref, rotation: (ref.rotation + 90) % 360 } : ref)),
    );
  }
  function duplicate() {
    alterPages((p) => {
      const copy = { ...structuredClone(p[current]), id: uid() };
      copy.formGroup = uid();
      copy.annotations = copy.annotations.map((a) => ({ ...a, id: uid() }));
      const list = [...p];
      list.splice(current + 1, 0, copy);
      return list;
    });
  }
  function deletePage() {
    if (!workspace || workspace.pages.length === 1) return;
    alterPages((p) => p.filter((_, i) => i !== current));
    setCurrent(Math.max(0, current - 1));
  }
  function reorder(from: number, to: number) {
    if (from === to) return;
    alterPages((p) => {
      const copy = [...p];
      const [ref] = copy.splice(from, 1);
      copy.splice(to, 0, ref);
      return copy;
    });
    setCurrent(to);
  }
  async function getText(signal: AbortSignal): Promise<PageText[]> {
    if (!workspace) throw new Error('Ouvrez un PDF.');
    const result: PageText[] = [];
    for (let i = 0; i < workspace.pages.length; i++) {
      checkAbort(signal);
      const ref = workspace.pages[i],
        key = `${ref.source}:${ref.index}${ref.nativeEdits?.length ? ':' + JSON.stringify(ref.nativeEdits) : ''}`;
      let extracted = cache.current.get(key);
      if (!extracted) {
        if (ref.nativeEdits?.length) {
          const preview = await loadPdf(
            await nativePreview(
              workspace.sources[ref.source].bytes,
              ref.index,
              ref.nativeEdits,
              await getFont(),
            ),
            undefined,
            signal,
          );
          try {
            extracted = await extractPage(preview, 0);
          } finally {
            await preview.loadingTask.destroy();
          }
        } else extracted = await extractPage(docs[ref.source], ref.index);
        cache.current.set(key, extracted);
      }
      const corrections = ref.annotations
        .filter((a) => a.replacement)
        .map((a) =>
          t('Correction visuelle : {text} (texte d’origine conservé : {original})', {
            text: a.text ?? '',
            original: a.replacement!.original,
          }),
        );
      result.push({
        ...extracted,
        text: extracted.text + (corrections.length ? '\n' + corrections.join('\n') : ''),
        page: i + 1,
      });
    }
    return result;
  }
  async function currentSource(signal?: AbortSignal): Promise<Source> {
    if (!workspace) throw new Error('Ouvrez un PDF.');
    const [file] = await processJob(
      {
        kind: 'export',
        workspace,
        font: await getFont(),
        options: { mode: 'flattened', preserveForms: false },
      },
      signal,
    );
    return { name: workspace.name, bytes: file.bytes };
  }
  const [exportSnapshot, setExportSnapshot] = useState<Workspace>();
  function exportPdf() {
    if (workspace && !workspace.encrypted) setExportSnapshot(workspace);
  }
  function exportAnswer(value: string) {
    void run('Export du texte en PDF', async (signal) => {
      const [f] = await processJob(
        { kind: 'textPdf', text: value, name: 'nexus-reponse.pdf', font: await getFont() },
        signal,
      );
      download(f.bytes, f.name, f.mime);
    });
  }
  function insertAnswer(value: string) {
    if (!workspace) return;
    setText(value);
    chooseTool('text');
    notify(
      'Texte prêt. Cliquez sur une page pour le placer ; les longues réponses sont à répartir en plusieurs zones.',
    );
  }
  function navigate(id: string) {
    setSelected(undefined);
    if (id === 'convert') {
      setView('convert');
      return;
    }
    if (id === 'ai') {
      setAi(true);
      if (workspace) setView('editor');
      else {
        notify('Ouvrez un PDF pour analyser son contenu.');
        open();
      }
      return;
    }
    if (id === 'merge') {
      insertInput.current?.click();
      return;
    }
    if (id === 'ocr') {
      if (workspace) {
        setView('editor');
        setModal('tools');
      } else open();
      return;
    }
    if (id === 'split') {
      if (workspace) {
        setView('editor');
        setModal('tools');
      } else open();
      return;
    }
    setView('tools');
  }
  function extract(split = false) {
    void run(split ? 'Division du PDF' : 'Extraction des pages', async (signal, progress) => {
      if (!workspace) return;
      const indices = parsePages(range, workspace.pages.length),
        font = await getFont();
      const files: OutputFile[] = [];
      if (split) {
        for (let i = 0; i < indices.length; i++) {
          checkAbort(signal);
          const [file] = await processJob(
            {
              kind: 'export',
              font,
              workspace: {
                ...workspace,
                name: `page-${indices[i] + 1}.pdf`,
                pages: [workspace.pages[indices[i]]],
              },
            },
            signal,
          );
          files.push(file);
          progress((i + 1) / indices.length);
        }
      } else
        files.push(
          ...(await processJob(
            {
              kind: 'export',
              font,
              workspace: {
                ...workspace,
                name: 'extraction.pdf',
                pages: indices.map((i) => workspace.pages[i]),
              },
            },
            signal,
            progress,
          )),
        );
      const file = packageOutputs(files);
      download(file.bytes, file.name, file.mime);
      notify('Pages exportées.');
    });
  }
  function ocr() {
    void run('Reconnaissance OCR locale', async (signal, progress) => {
      if (!workspace) return;
      const indices = parsePages(range, workspace.pages.length);
      let processed = 0;
      for (let j = 0; j < indices.length; j++) {
        checkAbort(signal);
        const ref = workspace.pages[indices[j]],
          key = `${ref.source}:${ref.index}`,
          native = cache.current.get(key) ?? (await extractPage(docs[ref.source], ref.index));
        if (native.text.trim().length < 20) {
          const result = await recognize(docs[ref.source], ref.index, ocrLanguage, signal, (n) =>
            progress((j + n) / indices.length),
          );
          cache.current.set(key, result);
          processed++;
        } else cache.current.set(key, native);
        progress((j + 1) / indices.length);
      }
      notify(
        processed
          ? t('{count} page(s) reconnue(s). Le texte est prêt pour la recherche et l’assistant.', {
              count: processed,
            })
          : 'Les pages sélectionnées disposent déjà de texte exploitable.',
      );
    });
  }
  function exportOcrText() {
    void run('Extraction du texte', async (signal) => {
      const pages = await getText(signal);
      const chosen = parsePages(range, pages.length);
      download(
        new TextEncoder().encode(
          pages
            .filter((_, i) => chosen.includes(i))
            .map((p) => `PAGE ${p.page}\n${p.text}`)
            .join('\n\n'),
        ),
        'nexus-texte.txt',
        'text/plain',
      );
    });
  }
  async function rasterPages(
    source: Source,
    signal: AbortSignal,
    progress: (n: number) => void,
    scale: number,
    quality: number,
    searchable = false,
  ): Promise<RasterPage[]> {
    const doc = await loadPdf(source.bytes, undefined, signal);
    const textPages = searchable ? await getText(signal) : [];
    const pages: RasterPage[] = [];
    try {
      for (let i = 0; i < doc.numPages; i++) {
        checkAbort(signal);
        const { canvas, page } = await renderRaster(doc, i, scale, undefined, signal);
        try {
          const v = page.getViewport({ scale: 1 });
          const ref = workspace!.pages[i];
          const native = docs[ref.source];
          const nativePage = await native.getPage(ref.index + 1);
          const nativeViewport = nativePage.getViewport({
            scale: 1,
            rotation: (nativePage.rotate + ref.rotation) % 360,
          });
          const words = searchable
            ? textPages[i].items.map((w) => {
                const a = nativeViewport.convertToViewportPoint(w.x, w.y),
                  b = nativeViewport.convertToViewportPoint(w.x + w.width, w.y + w.height);
                return {
                  ...w,
                  x: Math.min(a[0], b[0]),
                  y: v.height - Math.max(a[1], b[1]),
                  width: Math.abs(a[0] - b[0]),
                  height: Math.abs(a[1] - b[1]),
                };
              })
            : undefined;
          pages.push({
            bytes: await canvasBytes(canvas, searchable ? 'png' : 'jpg', quality),
            width: v.width,
            height: v.height,
            format: searchable ? 'png' : 'jpg',
            words,
          });
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
        progress(((i + 1) / doc.numPages) * 0.8);
      }
    } finally {
      await doc.loadingTask.destroy();
    }
    return pages;
  }
  function compress(searchable = false) {
    void run(
      searchable ? 'Création du PDF recherchable' : 'Compression du PDF',
      async (signal, progress) => {
        const source = await currentSource(signal);
        if (!searchable && compression === 'structure') {
          download(source.bytes, safeName(source.name) + '-optimise.pdf');
          notify(
            t('Réencodage structurel : {size}. Aucun gain de taille garanti.', {
              size: fileSize(source.bytes.length),
            }),
          );
          return;
        }
        const scale = searchable
          ? 2
          : compression === 'strong'
            ? 1
            : compression === 'balanced'
              ? 1.5
              : 2;
        const quality = compression === 'strong' ? 0.55 : compression === 'balanced' ? 0.75 : 0.9;
        const pages = await rasterPages(source, signal, progress, scale, quality, searchable);
        const [f] = await processJob(
          {
            kind: 'rasterPdf',
            pages,
            font: await getFont(),
            name: searchable ? 'nexus-recherchable.pdf' : 'nexus-compresse.pdf',
          },
          signal,
        );
        progress(1);
        download(f.bytes, f.name);
        notify(
          t('{kind} : {size} (avant : {before}).', {
            kind: t(searchable ? 'PDF recherchable' : 'PDF rasterisé'),
            size: fileSize(f.bytes.length),
            before: fileSize(source.bytes.length),
          }),
        );
      },
    );
  }
  function print() {
    void run('Préparation de l’impression', async (signal, progress) => {
      if (!workspace) return;
      if (workspace.pages.length > 50)
        throw new Error(
          'Pour imprimer plus de 50 pages, exportez puis imprimez depuis votre lecteur PDF.',
        );
      const source = await currentSource(signal);
      const doc = await loadPdf(source.bytes, undefined, signal);
      const area = document.createElement('div');
      area.className = 'print-only';
      try {
        for (let i = 0; i < doc.numPages; i++) {
          checkAbort(signal);
          const { canvas } = await renderRaster(doc, i, 1.5, undefined, signal);
          const image = document.createElement('img');
          image.src = canvas.toDataURL('image/png');
          area.append(image);
          canvas.width = 0;
          canvas.height = 0;
          progress((i + 1) / doc.numPages);
        }
        document.body.append(area);
        await Promise.all(Array.from(area.querySelectorAll('img')).map((img) => img.decode()));
        checkAbort(signal);
        window.print();
      } finally {
        area.remove();
        await doc.loadingTask.destroy();
      }
    });
  }
  async function showMetadata() {
    if (!workspace) return;
    try {
      const data = await docs[workspace.pages[current].source].getMetadata();
      setMetadata(
        JSON.stringify(
          {
            [t('Fichier')]: workspace.name,
            [t('Taille en octets')]: workspace.sources.reduce((n, s) => n + s.bytes.length, 0),
            [t('Pages')]: workspace.pages.length,
            [t('Informations PDF')]: data.info,
          },
          null,
          2,
        ),
      );
      setModal('metadata');
    } catch (e) {
      notify(errorMessage(e), true);
    }
  }
  function clear() {
    if (
      !window.confirm(
        t(
          'Effacer les récents, tous les brouillons enregistrés, les conversations et la clé API, puis fermer le document actuel ? Les fichiers téléchargés sont conservés.',
        ),
      )
    )
      return;
    void run('Effacement des données locales', async () => {
      autosave.cancel();
      setWorkspace(undefined);
      setDrafts([]);
      clipboard.current = [];
      setCanPaste(false);
      await clearData();
      setRecent([]);
      setWorkspace(undefined);
      setDocs([]);
      docsRef.current.forEach((d) => void d.loadingTask.destroy());
      cache.current.clear();
      history.current = new History();
      setAi(false);
      setView('home');
      notify('Données locales effacées.');
    });
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as Element)?.closest('[aria-modal="true"]')) return;
      const editable = (e.target as HTMLElement)?.closest(
        'input,textarea,select,[contenteditable]',
      );
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 's' && workspace) {
          e.preventDefault();
          exportPdf();
        } else if (e.key.toLowerCase() === 'o') {
          e.preventDefault();
          open();
        } else if (
          e.key.toLowerCase() === 'c' &&
          !editable &&
          !window.getSelection()?.toString() &&
          selectedIds.length
        ) {
          e.preventDefault();
          copyObjects();
        } else if (e.key.toLowerCase() === 'v' && !editable && clipboard.current.length) {
          e.preventDefault();
          pasteObjects();
        } else if (e.key.toLowerCase() === 'z' && !editable) {
          e.preventDefault();
          e.shiftKey ? redo() : undo();
        }
      } else if (e.key === 'Delete' && !editable && selected) removeAnnotation();
      else if (e.key === 'Escape') {
        setModal(null);
        setTool('select');
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [workspace, selectedIds, prefs, current]);
  const locked = workspace?.encrypted ?? false;
  const toolsContent = (
    <div className="document-tools">
      <p className="notice">
        {t(
          'Les traitements créent de nouveaux fichiers. L’export propose une copie Nexus ou une copie de partage. Les scripts et signatures numériques d’origine ne sont pas conservés.',
        )}
      </p>
      <label className="field">
        {t('Sélection des pages')}
        <input
          placeholder={t('Toutes (ex. 1, 3-5)')}
          value={range}
          onChange={(e) => setRange(e.target.value)}
        />
      </label>
      <div className="tools-action-grid">
        <Button disabled={locked} onClick={() => extract()}>
          <FileDown size={17} />
          {t('Extraire les pages')}
        </Button>
        <Button disabled={locked} onClick={() => extract(true)}>
          <Scissors size={17} />
          {t('Diviser en fichiers')}
        </Button>
        <Button disabled={locked} onClick={() => insertInput.current?.click()}>
          <Combine size={17} />
          {t('Insérer / fusionner un PDF')}
        </Button>
        <Button onClick={() => void showMetadata()}>
          <Info size={17} />
          {t('Métadonnées')}
        </Button>
      </div>
      <h3>{t('Personnaliser le document')}</h3>
      {workspace && !locked && (
        <WatermarkControls
          workspace={workspace}
          update={(w) => commit({ ...workspace, watermark: w.text, watermarkOptions: w })}
        />
      )}
      <label className="check-field">
        <input
          disabled={locked}
          type="checkbox"
          checked={workspace?.numbering ?? false}
          onChange={(e) => {
            if (workspace) commit({ ...workspace, numbering: e.target.checked });
          }}
        />{' '}
        {t('Ajouter une pagination')}
      </label>
      <label className="check-field">
        <input
          disabled={locked}
          type="checkbox"
          checked={workspace?.cleanMetadata ?? false}
          onChange={(e) => {
            if (workspace) commit({ ...workspace, cleanMetadata: e.target.checked });
          }}
        />{' '}
        {t('Ne pas exporter les métadonnées Info / XMP')}
      </label>
      <h3>{t('OCR — scans et images')}</h3>
      <div className="row">
        <select
          aria-label={t('Langue OCR')}
          value={ocrLanguage}
          onChange={(e) => setOcrLanguage(e.target.value as typeof ocrLanguage)}
        >
          <option value="fra+eng">{t('Français + anglais')}</option>
          <option value="fra">{t('Français')}</option>
          <option value="eng">{t('Anglais')}</option>
        </select>
        <Button onClick={ocr}>
          <ScanText size={17} />
          {t('Reconnaître les pages sans texte')}
        </Button>
      </div>
      <div className="row">
        <Button onClick={exportOcrText}>{t('Exporter le texte TXT')}</Button>
        <Button disabled={locked} onClick={() => compress(true)}>
          {t('PDF recherchable')}
        </Button>
      </div>
      <small className="muted">
        {t(
          'L’OCR doit être exécuté avant l’export. Le PDF recherchable est reconstruit en images avec une couche invisible de texte ; mise en page des mots approximative, liens et vecteurs perdus.',
        )}
      </small>
      <h3>{t('Compression')}</h3>
      <div className="row">
        <select
          aria-label={t('Niveau de compression')}
          value={compression}
          onChange={(e) => setCompression(e.target.value)}
        >
          <option value="structure">{t('Structure — sans rasterisation')}</option>
          <option value="light">{t('JPEG détaillé — 144 dpi')}</option>
          <option value="balanced">{t('JPEG équilibré — 108 dpi')}</option>
          <option value="strong">{t('JPEG léger — 72 dpi')}</option>
        </select>
        <Button disabled={locked} onClick={() => compress()}>
          <Minimize2 size={17} />
          {t('Compresser et télécharger')}
        </Button>
      </div>
      <p className="notice">
        {t(
          'La compression JPEG transforme les pages en images : texte sélectionnable, liens, formulaires et vecteurs sont perdus. Le résultat peut être plus volumineux selon le document.',
        )}
      </p>
    </div>
  );
  return (
    <div className={`app-shell ${view === 'editor' ? 'editor-shell' : ''}`}>
      {exportSnapshot && (
        <ExportDialog
          workspace={exportSnapshot}
          close={() => setExportSnapshot(undefined)}
          done={() => notify('PDF exporté.')}
        />
      )}
      {openingError && !workspace && (
        <div className="opening-error" role="alert">
          <strong>{t('Le PDF attend votre intervention')}</strong>
          <p>{openingError}</p>
          <button className="button" onClick={() => location.reload()}>
            {t('Réessayer')}
          </button>
          <button className="button" onClick={() => setOpeningError('')}>
            {t('Fermer')}
          </button>
        </div>
      )}
      {setup && (
        <Setup
          prefs={prefs}
          update={(p) => void updatePrefs(p)}
          finish={() => {
            void updatePrefs({ ...prefs, setupCompleted: true });
            setSetup(false);
            if (location.hash === '#setup')
              window.history.replaceState(null, '', location.pathname);
          }}
        />
      )}

      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept=".pdf"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void run('Ouverture des PDF', async (signal) => {
            const sources: Source[] = [];
            for (const f of files) sources.push(await readFile(f));
            await openSources(sources, signal);
          });
        }}
      />
      <input
        ref={insertInput}
        type="file"
        hidden
        multiple
        accept=".pdf"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (workspace) void insertFiles(files);
          else void drop(files);
        }}
      />
      <aside className="app-sidebar">
        <Brand />
        <Button className="sidebar-new" onClick={open}>
          <Plus size={17} />
          {t('Ouvrir un PDF')}
          <span>{t('Ctrl O')}</span>
        </Button>
        <span className="nav-caption">{t('ESPACE DE TRAVAIL')}</span>
        <nav aria-label={t('Navigation principale')}>
          {(
            [
              { id: 'home', label: 'Tableau de bord', Icon: HomeIcon },
              { id: 'editor', label: 'Mon document', Icon: FileText },
              { id: 'tools', label: 'Tous les outils', Icon: Layers3 },
              { id: 'convert', label: 'Convertisseur', Icon: ArrowLeftRight },
            ] as const
          ).map((n) => (
            <button
              key={n.id}
              className={view === n.id ? 'active' : ''}
              title={t(n.label)}
              aria-label={t(n.label)}
              onClick={() => setView(n.id)}
            >
              <n.Icon size={18} />
              {t(n.label)}
              {n.id === 'tools' && <span>4</span>}
            </button>
          ))}
          <button onClick={() => navigate('ai')}>
            <Sparkles size={18} />
            {t('Assistant IA')}
            <span className="new-tag">{t('LOCAL')}</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <span className="privacy-card-icon">
              <ShieldCheck size={19} />
            </span>
            <strong>
              {t('Votre confidentialité')}
              <br />
              {t('est notre priorité.')}
            </strong>
            <p>{t('Vos fichiers restent sur votre appareil par défaut.')}</p>
            <span>
              <span className="status-dot" />
              {t('Traitement local actif')}
            </span>
          </div>
          <button
            className={view === 'settings' ? 'active' : ''}
            onClick={() => setView('settings')}
          >
            <SettingsIcon size={18} />
            {t('Paramètres')}
            <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-footer">
            <span>
              {t('PDF Nexus')}
              <small>{`v${version} · ZEBDA`}</small>
            </span>
            <IconButton
              label={t('Changer le thème')}
              onClick={() =>
                void updatePrefs({
                  ...prefs,
                  theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark',
                })
              }
            >
              {document.documentElement.dataset.theme === 'dark' ? (
                <Sun size={16} />
              ) : (
                <Moon size={16} />
              )}
            </IconButton>
          </div>
        </div>
      </aside>
      <div className="main-area">
        {view !== 'editor' && (
          <header className="app-topbar">
            <div>
              <span className="breadcrumb">{t('Espace personnel')}</span>
              <span>/</span>
              <strong>
                {t(
                  (
                    {
                      home: 'Tableau de bord',
                      tools: 'Boîte à outils',
                      convert: 'Convertisseur',
                      settings: 'Paramètres',
                    } as Record<string, string>
                  )[view],
                )}
              </strong>
            </div>
            <span className="topbar-note">
              <LockKeyhole size={13} />
              {t('Un espace privé, sans abonnement')}
            </span>
          </header>
        )}
        {view === 'home' && (
          <Home
            drafts={drafts}
            resumeDraft={(id) => void resumeDraft(id)}
            removeDraft={(id) => void removeDraft(id)}
            open={open}
            drop={(files) => void drop(files)}
            recent={recent}
            reopen={(r) => {
              if (unsaved() && !window.confirm(t('Abandonner le brouillon actuel ?'))) return;
              void run('Ouverture du document récent', (signal) =>
                openSources([{ name: r.name, bytes: r.bytes }], signal),
              );
            }}
            remove={(id) =>
              void removeRecent(id)
                .then(refreshRecent)
                .catch((e) => notify(errorMessage(e), true))
            }
            tool={navigate}
            favorites={prefs.favorites}
            toggleFavorite={(id) =>
              void updatePrefs({
                ...prefs,
                favorites: prefs.favorites.includes(id)
                  ? prefs.favorites.filter((x) => x !== id)
                  : [...prefs.favorites, id],
              })
            }
          />
        )}
        {view === 'settings' && (
          <Settings
            prefs={prefs}
            update={(p) => void updatePrefs(p)}
            clear={clear}
            notify={notify}
          />
        )}
        {view === 'convert' && (
          <Converter
            prefs={prefs}
            run={run}
            current={workspace && !locked ? () => currentSource() : undefined}
            notify={notify}
          />
        )}
        {view === 'tools' && (
          <main className="content-page">
            <SectionTitle
              eyebrow={t('VOTRE BOÎTE À OUTILS')}
              title={t('De l’idée au document final.')}
              description={t('Des outils utiles, accessibles et exécutés localement.')}
              action={<PrivacyBadge />}
            />
            <div className="tool-grid">
              {tools.map((entry) => (
                <button
                  className="tool-card tool-card-main"
                  key={entry.id}
                  onClick={() => navigate(entry.id)}
                >
                  <span className={`tool-icon ${entry.color}`}>
                    <entry.icon size={24} />
                  </span>
                  <h3>{t(entry.title)}</h3>
                  <p>{t(entry.description)}</p>
                </button>
              ))}
            </div>
            {workspace ? (
              <section className="settings-section">
                <h2>
                  {t('Document ouvert :')}
                  {workspace.name}
                </h2>
                {toolsContent}
              </section>
            ) : (
              <Empty title={t('Commencez par ouvrir un PDF')}>
                {t(
                  'Les outils d’organisation, d’OCR et de compression seront disponibles pour votre document.',
                )}
                <br />
                <Button className="primary" onClick={open}>
                  {t('Ouvrir un PDF')}
                </Button>
              </Empty>
            )}
          </main>
        )}
        {view === 'editor' &&
          (workspace ? (
            <div className="editor-layout">
              <Reader
                replaceNative={(changes) =>
                  commit({
                    ...workspace,
                    pages: workspace.pages.map((p) => {
                      const edits = changes.filter((c) => c.pageId === p.id).map((c) => c.edit);
                      return edits.length
                        ? {
                            ...p,
                            nativeEdits: [
                              ...(p.nativeEdits ?? []).filter(
                                (e) => !edits.some((next) => next.id === e.id),
                              ),
                              ...edits,
                            ],
                          }
                        : p;
                    }),
                  })
                }
                selectedIds={selectedIds}
                patchObjects={patchObjects}
                orderObject={orderObject}
                copyObjects={copyObjects}
                pasteObjects={pasteObjects}
                canPaste={canPaste}
                updateForm={(pageId, name, value, group) => {
                  const original = workspace.pages.find((p) => p.id === pageId)!;
                  commit(
                    {
                      ...workspace,
                      pages: workspace.pages.map((p) =>
                        (p.formGroup && p.formGroup === original.formGroup) ||
                        (!p.formGroup && p.source === original.source)
                          ? { ...p, formValues: { ...p.formValues, [name]: value } }
                          : p,
                      ),
                    },
                    undefined,
                    group,
                  );
                }}
                saveStatus={<DraftStatus status={autosave.status} retry={autosave.retry} />}
                workspace={workspace}
                updateNative={(pageId, edits, group) =>
                  commit(
                    {
                      ...workspace,
                      pages: workspace.pages.map((p) =>
                        p.id === pageId ? { ...p, nativeEdits: edits } : p,
                      ),
                    },
                    undefined,
                    group,
                  )
                }
                updateVisual={(pageId, a, group) =>
                  commit(
                    {
                      ...workspace,
                      pages: workspace.pages.map((p) =>
                        p.id === pageId
                          ? {
                              ...p,
                              annotations: p.annotations.some((old) => old.id === a.id)
                                ? p.annotations.map((old) =>
                                    old.id === a.id && !old.locked
                                      ? {
                                          ...a,
                                          name: old.name,
                                          hidden: old.hidden,
                                          locked: old.locked,
                                        }
                                      : old,
                                  )
                                : [...p.annotations, a],
                            }
                          : p,
                      ),
                    },
                    undefined,
                    group,
                  )
                }
                docs={docs}
                current={current}
                setCurrent={setCurrent}
                zoom={zoom}
                setZoom={setZoom}
                tool={tool}
                setTool={chooseTool}
                color={color}
                setColor={changeColor}
                size={size}
                setSize={changeSize}
                text={text}
                setText={setText}
                link={link}
                setLink={setLink}
                image={image}
                setImage={setImage}
                selected={selected}
                setSelected={selectAnnotation}
                add={addAnnotation}
                update={updateAnnotation}
                remove={removeAnnotation}
                rotate={rotate}
                duplicate={duplicate}
                deletePage={deletePage}
                reorder={reorder}
                insert={() => insertInput.current?.click()}
                undo={undo}
                redo={redo}
                canUndo={!!history.current.past.length}
                canRedo={!!history.current.future.length}
                exportPdf={exportPdf}
                print={print}
                showAi={ai}
                toggleAi={() => setAi(!ai)}
                openTools={() => setModal('tools')}
                getText={getText}
                notify={notify}
              />
              {ai && (
                <AiPanel
                  key={docId}
                  id={docId}
                  prefs={prefs}
                  count={workspace.pages.length}
                  getText={getText}
                  close={() => setAi(false)}
                  settings={() => setView('settings')}
                  insert={insertAnswer}
                  exportPdf={exportAnswer}
                  goPage={(n) => {
                    if (n >= 0 && n < workspace.pages.length) {
                      setCurrent(n);
                      document
                        .getElementById(`page-${workspace.pages[n].id}`)
                        ?.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                />
              )}
            </div>
          ) : (
            <Empty title={t('Votre prochain PDF vous attend.')}>
              {t('Ouvrez un document pour le lire, l’annoter et l’organiser.')}
              <br />
              <Button className="primary" onClick={open}>
                <Upload size={18} />
                {t('Ouvrir un PDF')}
              </Button>
            </Empty>
          ))}
      </div>
      {modal === 'tools' && workspace && (
        <Modal title={t('Outils du document')} close={() => setModal(null)}>
          {toolsContent}
        </Modal>
      )}
      {modal === 'metadata' && (
        <Modal title={t('Métadonnées du document')} close={() => setModal(null)}>
          <pre className="metadata">{metadata}</pre>
          <p className="notice">
            {t(
              'La suppression Info/XMP ne supprime pas les informations présentes dans les pages ou les images. Ce n’est pas un caviardage.',
            )}
          </p>
        </Modal>
      )}
      {toast && (
        <div
          role={toast.error ? 'alert' : 'status'}
          className={`toast ${toast.error ? 'error' : ''}`}
        >
          <span>{toast.text}</span>
          <IconButton label={t('Fermer la notification')} onClick={() => setToast(undefined)}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      {job && (
        <div className="job-backdrop">
          <Progress label={job.label} value={job.percent} cancel={() => job.controller.abort()} />
        </div>
      )}
    </div>
  );
}
