import { t } from '../i18n';
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { FileText, X, LoaderCircle, ShieldCheck, ArrowUpRight } from 'lucide-react';
export function Button({
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`button ${className}`} {...props}>
      {children}
    </button>
  );
}
export function IconButton({
  children,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className="icon-button" aria-label={t(label)} title={t(label)} {...props}>
      {children}
    </button>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-icon">
        <FileText size={22} />
      </span>
      <div>
        {t('PDF')}
        <strong>{t('Nexus')}</strong>
        {!compact && <small>{t('VOTRE ESPACE DOCUMENTAIRE')}</small>}
      </div>
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLElement>('button,input,select,textarea,a[href]')?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            close();
          }
          if (e.key === 'Tab') {
            const list = Array.from(
              ref.current!.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]',
              ),
            );
            const first = list[0],
              last = list.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <IconButton label={t('Fermer')} onClick={close}>
            <X size={18} />
          </IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}
export function PrivacyBadge() {
  return (
    <span className="privacy-badge">
      <ShieldCheck size={14} />
      {t('Local & privé')}
    </span>
  );
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <FileText size={30} />
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function Progress({
  label,
  value,
  cancel,
}: {
  label: string;
  value: number;
  cancel: () => void;
}) {
  return (
    <div className="job" role="status" aria-live="polite">
      <LoaderCircle className="spin" size={20} />
      <div>
        <strong>{t(label)}</strong>
        <progress max={100} value={value} />
        <small>{Math.round(value)} %</small>
      </div>
      <Button onClick={cancel}>{t('Annuler')}</Button>
    </div>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function CardArrow() {
  return <ArrowUpRight size={18} className="card-arrow" />;
}
