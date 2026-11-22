import { useState } from 'react';
import { ForkKnife, Minus, Plus, Trash } from '@phosphor-icons/react';
import { priceFor, type OrderType, type Product } from '../lib/queries';
import { inr } from '../lib/format';
import { useLang, useLocalName, useT } from '../lib/i18n';

export function Photo({ p, className = '' }: { p: Pick<Product, 'name' | 'imageUrl'>; className?: string }) {
  const [bad, setBad] = useState(false);
  if (p.imageUrl && !bad) return <img src={p.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} className={`object-cover ${className}`} />;
  // quiet placeholder; the text label always stays visible
  return <div className={`grid place-items-center bg-[#efede6] text-[#b9b6a8] ${className}`} aria-hidden><ForkKnife size={28} weight="light" /></div>;
}

export default function ProductTile({ p, qty, onTap, onMinus, index, type = 'DINE_IN' }: { p: Product; qty: number; onTap: () => void; onMinus?: () => void; index: number; type?: OrderType }) {
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
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#eee9df]">
          <Photo p={p} className="h-full w-full transition-transform duration-500 ease-out-soft group-hover:scale-[1.045]" />
          {off && <span className="absolute inset-0 grid place-items-center bg-ink/55 text-sm font-semibold text-white">{p.status === 'SOLD_OUT' ? t('Sold out') : t('Unavailable')}</span>}
        </div>
        <p className={`px-3 pt-3 text-[14px] font-medium leading-snug ${lang === 'ta' ? 'font-ta' : ''}`}>{nm(p)}</p>
      </button>
      <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-2">
        <p className="num text-[15px] font-semibold">{inr(price, { short: true })}</p>
        {qty > 0 && !off ? (
          <div className="inline-flex items-center rounded-lg bg-forest text-white" role="group" aria-label={`${nm(p)} quantity`}>
            <button onClick={onMinus} aria-label="Less" className="press grid h-10 w-10 place-items-center rounded-l-lg hover:bg-forest-deep">{qty === 1 ? <Trash size={18} /> : <Minus size={18} weight="bold" />}</button>
            <span className="num mx-0.5 grid h-8 min-w-8 place-items-center rounded-md bg-forest-soft px-1.5 text-[15px] font-bold text-forest" aria-live="polite">{qty}</span>
            <button onClick={onTap} aria-label="More" className="press grid h-10 w-10 place-items-center rounded-r-lg hover:bg-forest-deep"><Plus size={18} weight="bold" /></button>
          </div>
        ) : (
          <button onClick={onTap} disabled={off} aria-label={`Add ${nm(p)}`} className="press grid h-10 w-10 place-items-center rounded-lg bg-forest-soft text-forest transition-colors hover:bg-forest hover:text-white disabled:opacity-50"><Plus size={20} weight="bold" /></button>
        )}
      </div>
    </div>
  );
}
