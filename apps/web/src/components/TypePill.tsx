import { ForkKnife, Bag, Package } from '@phosphor-icons/react';
import { useT } from '../lib/i18n';

/** Order type as plain icon + text. Same look everywhere, no colour coding. */
export default function TypePill({ type, table }: { type: string; table?: string | null }) {
  const t = useT();
  const Icon = type === 'PARCEL' ? Package : type === 'TAKEAWAY' ? Bag : ForkKnife;
  const label = type === 'DINE_IN' ? (table ? `${t('Table')} ${table}` : t('Eat here')) : t(type === 'PARCEL' ? 'Parcel' : 'Takeaway');
  return <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft"><Icon size={16} />{label}</span>;
}
