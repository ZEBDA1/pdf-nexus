import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  X,
  ClipboardPaste,
} from 'lucide-react';
import type { Annotation, Workspace } from '../types';
import { Button, IconButton } from '../components/ui';
import { t } from '../i18n';

const labels: Record<Annotation['type'], string> = {
  text: 'Texte',
  note: 'Note',
  highlight: 'Surlignage',
  underline: 'Soulignement',
  strike: 'Texte barré',
  pen: 'Dessin',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Ligne',
  arrow: 'Flèche',
  image: 'Image',
  link: 'Lien',
  stamp: 'Tampon',
  checkbox: 'Case à cocher',
};
export function ObjectsPanel({
  workspace,
  selected,
  select,
  patch,
  order,
  remove,
  copy,
  paste,
  canPaste,
  close,
}: {
  workspace: Workspace;
  selected: string[];
  select: (id: string, multiple?: boolean) => void;
  patch: (ids: string[], changes: Partial<Annotation>, group?: string) => void;
  order: (id: string, direction: number) => void;
  remove: () => void;
  copy: () => void;
  paste: () => void;
  canPaste: boolean;
  close: () => void;
}) {
  return (
    <aside className="objects-panel" aria-label={t('Objets ajoutés')}>
      <header>
        <div>
          <strong>{t('Objets ajoutés')}</strong>
          <small>{t('Maj + clic pour sélectionner plusieurs objets')}</small>
        </div>
        <IconButton label={t('Fermer les objets')} onClick={close}>
          <X size={17} />
        </IconButton>
      </header>
      <div className="objects-actions">
        <IconButton label={t('Copier les objets')} disabled={!selected.length} onClick={copy}>
          <Copy size={16} />
        </IconButton>
        <IconButton
          label={t('Coller les objets')}
          disabled={!canPaste || workspace.encrypted}
          onClick={paste}
        >
          <ClipboardPaste size={16} />
        </IconButton>
        <IconButton
          label={t('Supprimer les objets sélectionnés')}
          disabled={
            !workspace.pages.some((p) =>
              p.annotations.some((a) => selected.includes(a.id) && !a.locked),
            ) || workspace.encrypted
          }
          onClick={remove}
        >
          <Trash2 size={16} />
        </IconButton>
        <span>{t('{count} sélectionné(s)', { count: selected.length })}</span>
      </div>
      <div className="objects-list">
        {!workspace.pages.some((p) => p.annotations.length) && (
          <p className="muted">
            {t(
              'Vos textes, cases, dessins et images apparaîtront ici. Le texte original et les champs du document restent sur la page.',
            )}
          </p>
        )}
        {workspace.pages.map(
          (p, index) =>
            p.annotations.length > 0 && (
              <section key={p.id}>
                <h3>{t('Page {page}', { page: index + 1 })}</h3>
                {[...p.annotations].reverse().map((a) => (
                  <div
                    key={a.id}
                    className={`object-row ${selected.includes(a.id) ? 'selected' : ''} ${a.hidden ? 'is-hidden' : ''}`}
                    data-object-id={a.id}
                  >
                    <Button
                      className="object-select"
                      aria-pressed={selected.includes(a.id)}
                      onClick={(e) => select(a.id, e.shiftKey || e.ctrlKey || e.metaKey)}
                    >
                      <span>{a.name || t(labels[a.type])}</span>
                      <small>
                        {a.replacement ? t('Correction visuelle') : t(labels[a.type])}
                        {a.locked ? ` · ${t('Verrouillé')}` : ''}
                        {a.hidden ? ` · ${t('Masqué')}` : ''}
                      </small>
                    </Button>
                    {selected.includes(a.id) && (
                      <>
                        <input
                          aria-label={t('Nom de l’objet')}
                          maxLength={160}
                          value={a.name ?? ''}
                          placeholder={t(labels[a.type])}
                          disabled={workspace.encrypted}
                          onChange={(e) => patch([a.id], { name: e.target.value }, `name-${a.id}`)}
                        />
                        <div className="row">
                          <IconButton
                            label={a.hidden ? t('Afficher l’objet') : t('Masquer l’objet')}
                            disabled={workspace.encrypted || a.locked}
                            onClick={() => patch([a.id], { hidden: !a.hidden })}
                          >
                            {a.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                          </IconButton>
                          <IconButton
                            label={a.locked ? t('Déverrouiller l’objet') : t('Verrouiller l’objet')}
                            disabled={workspace.encrypted}
                            onClick={() => patch([a.id], { locked: !a.locked })}
                          >
                            {a.locked ? <Lock size={15} /> : <Unlock size={15} />}
                          </IconButton>
                          <IconButton
                            label={t('Avancer l’objet')}
                            disabled={
                              workspace.encrypted || a.locked || p.annotations.at(-1)?.id === a.id
                            }
                            onClick={() => order(a.id, 1)}
                          >
                            <ArrowUp size={15} />
                          </IconButton>
                          <IconButton
                            label={t('Reculer l’objet')}
                            disabled={
                              workspace.encrypted || a.locked || p.annotations[0]?.id === a.id
                            }
                            onClick={() => order(a.id, -1)}
                          >
                            <ArrowDown size={15} />
                          </IconButton>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </section>
            ),
        )}
      </div>
      <p className="objects-help">
        {t(
          'Masquer conserve l’objet dans le fichier Nexus. Supprimer le retire. Les objets verrouillés doivent être déverrouillés avant modification.',
        )}
      </p>
    </aside>
  );
}
