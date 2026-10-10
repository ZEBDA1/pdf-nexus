import { t } from '../i18n';
import { useEffect, useState } from 'react';
import { Sparkles, X, Send, Copy, FileDown, Plus, Trash2, Settings2 } from 'lucide-react';
import { Button, IconButton } from '../components/ui';
import type { ChatMessage, PageText, Preferences } from '../types';
import { getChat, saveChat } from '../storage';
import { answer, validateEndpoint } from '../ai';
import { download, errorMessage, parsePages } from '../utils/files';
export function AiPanel({
  id,
  prefs,
  count,
  getText,
  close,
  settings,
  insert,
  exportPdf,
  goPage,
}: {
  id: string;
  prefs: Preferences;
  count: number;
  getText: (signal: AbortSignal) => Promise<PageText[]>;
  close: () => void;
  settings: () => void;
  insert: (text: string) => void;
  exportPdf: (text: string) => void;
  goPage: (n: number) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [question, setQuestion] = useState(''),
    [range, setRange] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [controller, setController] = useState<AbortController>();
  useEffect(() => {
    let live = true;
    setMessages([]);
    if (prefs.remember)
      void getChat(id).then((m) => {
        if (live) setMessages(m);
      });
    return () => {
      live = false;
    };
  }, [id]);
  useEffect(() => () => controller?.abort(), [controller]);
  async function ask(prompt = question) {
    if (!prompt.trim() || busy) return;
    let selection: number[];
    try {
      selection = parsePages(range, count);
      if (prefs.aiMode === 'api') {
        const endpoint = validateEndpoint(prefs.endpoint);
        if (
          !window.confirm(
            t(
              'Envoyer au fournisseur {origin} les extraits pertinents des pages sélectionnées (10 pages / 26 000 caractères maximum) et les 6 derniers échanges ? Des frais peuvent s’appliquer.',
              { origin: endpoint.origin },
            ),
          )
        )
          return;
      }
    } catch (e) {
      setError(errorMessage(e));
      return;
    }
    const c = new AbortController();
    setController(c);
    setBusy(true);
    setError('');
    const user: ChatMessage = {
      role: 'user',
      content: prompt,
      date: Date.now(),
      mode: prefs.aiMode,
    };
    const next = [...messages, user];
    setMessages(next);
    setQuestion('');
    try {
      const pages = (await getText(c.signal)).filter((_, i) => selection.includes(i));
      const content = await answer(pages, prompt, prefs, messages, c.signal);
      const result = [
        ...next,
        { role: 'assistant' as const, content, date: Date.now(), mode: prefs.aiMode },
      ];
      setMessages(result);
      if (prefs.remember) await saveChat(id, result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setController(undefined);
    }
  }
  function contentWithRefs(content: string) {
    return content.split(/(\[p\.\s*\d+\])/g).map((s, i) => {
      const m = s.match(/^\[p\.\s*(\d+)\]$/);
      return m ? (
        <button key={i} className="page-citation" onClick={() => goPage(Number(m[1]) - 1)}>
          {s}
        </button>
      ) : (
        s
      );
    });
  }
  return (
    <aside className="ai-panel">
      <header>
        <span className="assistant-symbol small">
          <Sparkles size={17} />
        </span>
        <div>
          <strong>{t('Assistant Nexus')}</strong>
          <small>
            {prefs.aiMode === 'extract'
              ? t('Extraits locaux')
              : prefs.aiMode === 'browser'
                ? t('Modèle local')
                : t('API personnelle')}
          </small>
        </div>
        <IconButton label={t('Paramètres IA')} onClick={settings}>
          <Settings2 size={17} />
        </IconButton>
        <IconButton label={t('Fermer l’assistant')} onClick={close}>
          <X size={17} />
        </IconButton>
      </header>
      <div className="ai-conversation">
        <div className="ai-intro">
          <Sparkles size={28} />
          <h3>{t('Un autre regard sur votre PDF.')}</h3>
          <p>
            {prefs.aiMode === 'extract'
              ? t(
                  'Explorez les passages de votre document. Le mode local par défaut ne reformule pas le texte.',
                )
              : t(
                  'Posez vos questions. Vérifiez les réponses et leurs références dans le document.',
                )}
          </p>
        </div>
        {!messages.length && (
          <div className="prompt-suggestions">
            {[
              'Résumer le document',
              'Extraire les dates et montants',
              'Retrouver les informations essentielles',
              'Expliquer un passage sélectionné',
            ].map((p) => (
              <button
                key={p}
                onClick={() => {
                  const selected = window.getSelection()?.toString();
                  void ask(t(p) + (p.includes('sélectionné') && selected ? ': ' + selected : ''));
                }}
              >
                {t(p)}
                <Plus size={14} />
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <article key={m.date + '-' + i} className={`chat-message ${m.role}`}>
            <small>
              {m.role === 'user'
                ? t('Vous')
                : m.mode === 'extract'
                  ? t('Extraits locaux — sans modèle')
                  : t('Nexus — à vérifier')}
            </small>
            <div className="message-content">{contentWithRefs(m.content)}</div>
            {m.role === 'assistant' && (
              <div className="message-actions">
                <IconButton
                  label={t('Copier la réponse')}
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(m.content)
                      .catch(() => setError('Copie impossible. Sélectionnez le texte.'))
                  }
                >
                  <Copy size={14} />
                </IconButton>
                <IconButton
                  label={t('Exporter la réponse en TXT')}
                  onClick={() =>
                    download(new TextEncoder().encode(m.content), 'nexus-reponse.txt', 'text/plain')
                  }
                >
                  <FileDown size={14} />
                </IconButton>
                <button onClick={() => exportPdf(m.content)}>{t('PDF')}</button>
                <IconButton
                  label={t('Insérer la réponse comme annotation')}
                  onClick={() => insert(m.content)}
                >
                  <Plus size={14} />
                </IconButton>
              </div>
            )}
          </article>
        ))}
        {busy && (
          <p className="ai-working" role="status">
            {t('Analyse en cours…')}
            <button onClick={() => controller?.abort()}>{t('Annuler')}</button>
          </p>
        )}
        {error && (
          <p className="error-inline" role="alert">
            {error}
          </p>
        )}
      </div>
      <form
        className="ai-input"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <label>
          {t('Pages à analyser')}{' '}
          <input
            aria-label={t('Pages à analyser')}
            placeholder={t('Toutes (ex. 1, 3-5)')}
            value={range}
            onChange={(e) => setRange(e.target.value)}
          />
        </label>
        <textarea
          aria-label={t('Votre question')}
          placeholder={t('Que souhaitez-vous explorer ?')}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
        />
        <div>
          <span>{t('Les références sont à vérifier.')}</span>
          <IconButton
            label={t('Effacer la conversation')}
            disabled={busy}
            onClick={() => {
              setMessages([]);
              void saveChat(id, []);
            }}
          >
            <Trash2 size={15} />
          </IconButton>
          <Button
            className="primary"
            disabled={busy || !question.trim()}
            type="submit"
            aria-label={t('Envoyer')}
          >
            <Send size={16} />
          </Button>
        </div>
      </form>
    </aside>
  );
}
