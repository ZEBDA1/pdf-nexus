import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Command } from 'lucide-react';
import { t } from '../i18n';

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  disabled?: boolean;
  action: () => void;
}

export function CommandPalette({ items, close }: { items: CommandItem[]; close: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        !item.disabled &&
        (!q ||
          t(item.label).toLowerCase().includes(q) ||
          (item.hint && t(item.hint).toLowerCase().includes(q))),
    );
  }, [items, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function execute(item?: CommandItem) {
    if (!item || item.disabled) return;
    close();
    item.action();
  }

  return (
    <div className="modal-backdrop command-backdrop" onClick={close}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('Palette de commandes')}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((n) => (filtered.length ? (n + 1) % filtered.length : 0));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((n) => (filtered.length ? (n - 1 + filtered.length) % filtered.length : 0));
          } else if (e.key === 'Enter' && filtered[active]) {
            e.preventDefault();
            execute(filtered[active]);
          }
        }}
      >
        <div className="command-search">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Rechercher une action ou un outil…')}
            aria-label={t('Rechercher une commande')}
          />
          <kbd>
            <Command size={11} /> K
          </kbd>
        </div>
        <div className="command-list" role="listbox" aria-label={t('Commandes disponibles')}>
          {filtered.length ? (
            filtered.map((item, i) => (
              <button
                key={item.id}
                role="option"
                aria-selected={i === active}
                className={`command-row ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => execute(item)}
              >
                <span>
                  <strong>{t(item.label)}</strong>
                  {item.hint && <small>{t(item.hint)}</small>}
                </span>
                {item.shortcut && <kbd>{item.shortcut}</kbd>}
              </button>
            ))
          ) : (
            <p className="command-empty">{t('Aucune commande correspondante.')}</p>
          )}
        </div>
      </section>
    </div>
  );
}
