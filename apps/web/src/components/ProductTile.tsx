import { useState } from 'react';
import { ForkKnife, Minus, Plus, Trash } from '@phosphor-icons/react';
import { priceFor, type OrderType, type Product } from '../lib/queries';
import { inr } from '../lib/format';
import { useLang, useLocalName, useT } from '../lib/i18n';
import QtyInput from './QtyInput';

export function Photo({ p, className = '' }: { p: Pick<Product, 'name' | 'imageUrl'>; className?: string }) {
  const [bad, setBad] = useState(false);
  if (p.imageUrl && !bad) return <img src={p.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} className={`object-cover ${className}`} />;
  // quiet placeholder; the text label always stays visible
  return <div className={`grid place-items-center bg-[#efede6] text-[#b9b6a8] ${className}`} aria-hidden><ForkKnife size={28} weight="light" /></div>;
}

export default function ProductTile({ p, qty, onTap, onMinus, onQty, index, type = 'DINE_IN' }: { p: Product; qty: number; onTap: () => void; onMinus?: () => void; onQty?: (n: number) => void; index: number; type?: OrderType }) {
  const t = useT();
  const nm = useLocalName();
  const lang = useLang((s) => s.lang);
  const off = p.status !== 'AVAILABLE';
  const price = priceFor(p, type);
  return (
    <div
      style={{ ['--i' as string]: Math.min(index, 14) }}
      className={`rise group relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white text-left ${qty > 0 ? 'border-forest ring-1 ring-forest' : 'border-line'} ${off ? 'opacity-60' : 'hover:border-[#c9c6ba]'}`}
    >
      {/* photo + name: tapping still adds one */}
      <button onClick={onTap} disabled={off} aria-label={`${nm(p)} ${inr(price, { short: true })}`} className="press flex flex-1 flex-col text-left">
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#eee9df]">
          <Photo p={p} className="h-full w-full transition-transform duration-500 ease-out-soft group-hover:scale-[1.045]" />
          {off && <span className="absolute inset-0 grid place-items-center bg-ink/55 text-sm font-semibold text-white">{p.status === 'SOLD_OUT' ? t('Sold out') : t('Unavailable')}</span>}
        </div>
        <p className={`px-2.5 pt-2 text-[13px] font-medium leading-snug ${lang === 'ta' ? 'font-ta' : ''}`}>{nm(p)}</p>
      </button>
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1.5">
        <p className="num text-[14px] font-semibold">{inr(price, { short: true })}</p>
        {qty > 0 && !off ? (
          <div className="inline-flex items-center rounded-lg bg-forest text-white" role="group" aria-label={`${nm(p)} quantity`}>
            <button onClick={onMinus} aria-label="Less" className="press grid h-8 w-8 place-items-center rounded-l-lg hover:bg-forest-deep">{qty === 1 ? <Trash size={16} /> : <Minus size={16} weight="bold" />}</button>
            {onQty
              ? <QtyInput value={qty} onChange={onQty} label={`${nm(p)} quantity`} className="mx-0.5 h-6 w-9 rounded-md bg-forest-soft text-[14px] font-bold text-forest outline-none focus:ring-2 focus:ring-gold" />
              : <span className="num mx-0.5 grid h-6 min-w-7 place-items-center rounded-md bg-forest-soft px-1.5 text-[14px] font-bold text-forest" aria-live="polite">{qty}</span>}
            <button onClick={onTap} aria-label="More" className="press grid h-8 w-8 place-items-center rounded-r-lg hover:bg-forest-deep"><Plus size={16} weight="bold" /></button>
          </div>
        ) : (
          <button onClick={onTap} disabled={off} aria-label={`Add ${nm(p)}`} className="press grid h-8 w-8 place-items-center rounded-lg bg-forest-soft text-forest transition-colors hover:bg-forest hover:text-white disabled:opacity-50"><Plus size={18} weight="bold" /></button>
        )}
      </div>
    </div>
  );
}
