import { useEffect, useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X } from '@phosphor-icons/react';
import { useToasts } from '../lib/toast';
import { useT } from '../lib/i18n';

type Variant = 'primary' | 'gold' | 'soft' | 'ghost' | 'danger' | 'whatsapp';
const V: Record<Variant, string> = {
  primary: 'bg-forest text-white shadow-[inset_0_1px_0_rgba(255,255,255,.14)] hover:bg-forest-deep',
  gold: 'bg-gold text-white hover:brightness-95',
  soft: 'bg-forest-soft text-forest hover:bg-[#dbe7de]',
  ghost: 'bg-card text-ink hover:bg-[#faf9f5] ring-1 ring-line',
  danger: 'bg-bad text-white hover:brightness-95',
  whatsapp: 'bg-[#1f8f4e] text-white hover:brightness-95',
};

export function Button({ variant = 'primary', size = 'md', className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'lg' ? 'min-h-12 px-5 text-base' : size === 'sm' ? 'min-h-9 px-3 text-sm' : 'min-h-10 px-4 text-[15px]';
  return (
    <button {...rest} className={`press inline-flex items-center justify-center gap-2 rounded-lg font-semibold disabled:opacity-45 disabled:cursor-not-allowed ${sz} ${V[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-card ${className}`}>{children}</div>;
}

export function Skeleton({ className = 'h-24' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function Empty({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-6 py-10 text-center text-ink-soft">
      {icon && <div className="text-forest/60">{icon}</div>}
      <p className="text-lg font-medium text-ink">{title}</p>
      {hint && <p className="max-w-sm text-sm">{hint}</p>}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="rounded-lg bg-[#f7e3df] px-4 py-3 text-sm text-bad">{error instanceof Error ? error.message : 'Something went wrong.'}</p>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-medium text-ink-soft">{label}</label>
      <div id={id}>{children}</div>
      {hint && <p className="text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

export const inputCls = 'min-h-10 w-full rounded-lg border border-line bg-white px-3.5 text-[15px] text-ink placeholder:text-ink-soft/60 focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/20';

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#0d2a20]/45 p-0 backdrop-blur-[2px] min-[640px]:items-center min-[640px]:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`rise max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-card p-5 shadow-[0_24px_60px_-20px_rgba(15,40,30,.35)] min-[640px]:rounded-2xl ${wide ? 'min-[640px]:max-w-3xl' : 'min-[640px]:max-w-lg'}`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label={t('Close')} className="press grid h-9 w-9 place-items-center rounded-full ring-1 ring-line"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel, danger, busy, onConfirm, onClose }: { open: boolean; title: string; body: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-ink-soft">{body}</div>
      <div className="mt-6 flex gap-3">
        <Button variant="ghost" className="flex-1" onClick={onClose}>{t('Cancel')}</Button>
        <Button variant={danger ? 'danger' : 'primary'} className="flex-1" disabled={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

export function Toasts() {
  const { items, dismiss } = useToasts();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 mx-auto flex w-full max-w-md flex-col gap-2 px-4">
      {items.map((i) => (
        <button key={i.id} onClick={() => dismiss(i.id)} className={`rise pointer-events-auto rounded-lg px-4 py-3 text-left text-base font-medium text-white shadow-xl ${i.kind === 'error' ? 'bg-bad' : i.kind === 'ok' ? 'bg-forest' : 'bg-ink'}`}>
          {i.text}
        </button>
      ))}
    </div>
  );
}

const BADGE: Record<string, string> = {
  ok: 'bg-[#e6f1ea] text-[#23653f]', warn: 'bg-[#fbf0dc] text-[#8f5a0d]', bad: 'bg-[#faeae7] text-[#a23e33]', info: 'bg-[#eceae2] text-[#555c52]', saffron: 'bg-[#fbf0dc] text-[#8f5a0d]', plum: 'bg-[#eceae2] text-[#555c52]', teal: 'bg-[#eceae2] text-[#555c52]',
};
/** Status is always colour + text (never colour alone). */
export function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'info' | 'saffron' | 'plum' | 'teal'; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-medium capitalize ${BADGE[tone]}`}>{children}</span>;
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: ReactNode }[] }) {
  return (
    <div role="tablist" className="inline-flex gap-1 border-b border-line">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={`press relative inline-flex min-h-10 items-center gap-2 whitespace-nowrap px-3 text-[14px] after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full ${value === o.value ? 'font-semibold text-forest after:bg-forest' : 'font-medium text-ink-soft after:bg-transparent hover:text-ink'}`}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHead({ title, sub, action }: { title: string; sub?: string; action?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h1 className="text-[20px] font-semibold leading-tight min-[640px]:text-[22px]">{title}</h1>
        {sub && <p className="mt-1 text-[14px] text-ink-soft">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
