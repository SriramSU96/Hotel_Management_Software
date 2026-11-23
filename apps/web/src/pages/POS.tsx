import { printReceipt } from '../lib/printing';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bag, ForkKnife, Star, MagnifyingGlass, Minus, NotePencil, Plus, ShoppingCartSimple, Trash, Package as PackageIcon } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useCart } from '../lib/cart';
import { priceFor, useCategories, useProducts, useSettings, useTables } from '../lib/queries';
import { inr } from '../lib/format';
import { useLocalName, useT } from '../lib/i18n';
import { Button, Empty, ErrorNote, Modal, Segmented, Skeleton, inputCls } from '../components/ui';
import ProductTile from '../components/ProductTile';
import BillModal from '../components/BillModal';
import { toast, errText } from '../lib/toast';
import { useAuth } from '../lib/auth';

function useTotals() {
  const { lines, discountPaise } = useCart();
  const s = useSettings().data?.settings;
  return useMemo(() => {
    const subtotal = lines.reduce((a, l) => a + l.pricePaise * l.qty, 0);
    const discount = s?.discountsEnabled ? Math.min(discountPaise, subtotal) : 0;
    const taxable = subtotal - discount;
    let tax = 0, total = taxable;
    const bp = s?.taxBp ?? 0;
    if (s?.taxMode === 'EXCLUSIVE' && bp > 0) { tax = Math.floor((2 * taxable * bp + 10000) / 20000); total = taxable + tax; }
    else if (s?.taxMode === 'INCLUSIVE' && bp > 0) { tax = taxable - Math.floor((2 * taxable * 10000 + 10000 + bp) / (2 * (10000 + bp))); }
    return { subtotal, discount, tax, total, taxMode: s?.taxMode ?? 'NONE', taxBp: bp };
  }, [lines, discountPaise, s]);
}

export default function POS() {
  const t = useT();
  const nm = useLocalName();
  const qc = useQueryClient();
  const { can } = useAuth();
  const cart = useCart();
  const products = useProducts();
  const cats = useCategories();
  const tables = useTables();
  const settings = useSettings().data?.settings;
  const totals = useTotals();
  const [cat, setCat] = useState<string>('ALL');
  const [q, setQ] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (products.data ?? []).filter((p) => (cat === 'ALL' || p.categoryId === cat) && (!term || p.name.toLowerCase().includes(term) || (p.nameTa ?? '').includes(term)));
  }, [products.data, cat, q]);

  const quick = useMemo(() => (products.data ?? []).filter((p) => p.starred && p.status === 'AVAILABLE'), [products.data]);
  const qtyOf = (id: string) => cart.lines.find((l) => l.productId === id)?.qty ?? 0;
  const count = cart.lines.reduce((a, l) => a + l.qty, 0);
  const needsTable = cart.type === 'DINE_IN' && !!settings?.useTables && !cart.tableId;

  const place = useMutation({
    mutationFn: () => api<{ order: { _id: string } }>('/orders', {
      body: {
        idempotencyKey: cart.key, type: cart.type, tableId: cart.tableId, confirm: true,
        items: cart.lines.map((l) => ({ productId: l.productId, qty: l.qty, note: l.note })),
        discountPaise: cart.discountPaise || undefined, customerName: cart.customerName || undefined, customerPhone: cart.customerPhone || undefined,
      },
    }),
    onSuccess: (r) => {
      cart.setPlaced(r.order._id);
      if (settings?.browserPrint?.autoPrintBill) printReceipt(r.order._id, 'BILL').catch((e) => toast.error(errText(e)));
      setCartOpen(false);
      qc.invalidateQueries({ queryKey: ['tables'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
    // the cart is kept on any failure; the same key makes a retry safe
    onError: (e) => { toast.error(errText(e)); qc.invalidateQueries({ queryKey: ['products'] }); qc.invalidateQueries({ queryKey: ['tables'] }); },
  });

  const cartPanel = (
    <CartPanel totals={totals} count={count} needsTable={needsTable} busy={place.isPending} error={place.error}
      onConfirm={() => place.mutate()} onNote={setNoteFor} tablesData={tables.data ?? []} parcel={!!settings?.parcelEnabled} useTables={!!settings?.useTables} discounts={!!settings?.discountsEnabled && can('orders.discount')} />
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[760px]:grid-cols-[minmax(0,1fr)_330px] min-[1100px]:grid-cols-[minmax(0,1.45fr)_minmax(340px,.8fr)] min-[1100px]:gap-5">
      <section>
        {quick.length > 0 && !q.trim() && (
          <div className="mb-3">
            <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-gold"><Star size={14} weight="fill" />{t('Quick order')}</p>
            <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 min-[640px]:mx-0 min-[640px]:grid min-[640px]:grid-cols-3 min-[640px]:overflow-visible min-[640px]:px-0 min-[640px]:pb-0 min-[1000px]:grid-cols-4 min-[1500px]:grid-cols-5">
              {quick.map((p) => {
                const n = qtyOf(p._id);
                return (
                  <button key={p._id} onClick={() => cart.add(p)} aria-label={`${nm(p)} ${inr(priceFor(p, cart.type), { short: true })}`}
                    className={`press relative flex min-h-12 w-[128px] shrink-0 min-[640px]:w-auto min-[640px]:shrink flex-col items-start justify-center rounded-lg border bg-card px-3 py-2 text-left ${n > 0 ? 'border-forest ring-1 ring-forest' : 'border-line'}`}>
                    <span className="line-clamp-2 w-full pr-1 text-[13px] font-medium leading-tight">{nm(p)}</span>
                    <span className="num text-sm font-semibold text-forest">{inr(priceFor(p, cart.type), { short: true })}</span>
                    {n > 0 && <span className="num absolute bottom-1.5 right-1.5 grid h-6 min-w-6 place-items-center rounded-md bg-forest px-1.5 text-[13px] font-semibold text-white">{n}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="mb-3 flex flex-col gap-2.5">
          <div className="relative">
            <MagnifyingGlass size={22} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input className={`${inputCls} pl-12`} placeholder={t('Search food')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Search food')} />
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 min-[640px]:mx-0 min-[640px]:px-0">
            {[{ _id: 'ALL', name: t('All'), nameTa: t('All') }, ...(cats.data ?? []).filter((c) => c.active)].map((c) => (
              <button key={c._id} onClick={() => setCat(c._id)} aria-pressed={cat === c._id}
                className={`press inline-flex min-h-9 shrink-0 items-center rounded-lg px-3.5 text-[13px] font-medium ${cat === c._id ? 'bg-ink text-white' : 'bg-black/[0.045] text-ink hover:bg-black/[0.075]'}`}>
                {c._id === 'ALL' ? c.name : nm(c)}
              </button>))}
          </div>
        </div>

        {products.isLoading ? (
          <div className="grid grid-cols-2 gap-3 min-[560px]:grid-cols-3 min-[760px]:grid-cols-2 min-[1000px]:grid-cols-3 min-[1500px]:grid-cols-4 min-[1750px]:grid-cols-5">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
        ) : products.error ? <ErrorNote error={products.error} />
        : visible.length === 0 ? <Empty title="Nothing found" hint="Try another word or category." icon={<ForkKnife size={36} />} />
        : (
          <div className="grid grid-cols-2 gap-3 min-[560px]:grid-cols-3 min-[760px]:grid-cols-2 min-[1000px]:grid-cols-3 min-[1500px]:grid-cols-4 min-[1750px]:grid-cols-5">
            {visible.map((p, i) => <ProductTile key={p._id} p={p} index={i} type={cart.type} qty={qtyOf(p._id)} onTap={() => cart.add(p)} onMinus={() => cart.setQty(p._id, qtyOf(p._id) - 1)} />)}
          </div>
        )}
      </section>

      {/* Always-visible order on large screens */}
      <aside className="hidden min-[760px]:block">
        <div className="sticky top-[64px] max-h-[calc(100dvh-4.75rem)] overflow-y-auto rounded-[10px] border border-line bg-card shadow-soft">{cartPanel}</div>
      </aside>

      {/* Phone / portrait tablet: floating bar opens the order */}
      {count > 0 && (
        <button onClick={() => setCartOpen(true)} className="press no-print fixed inset-x-4 bottom-[88px] z-20 flex min-h-16 items-center justify-between rounded-lg bg-gold px-6 text-white shadow-2xl min-[760px]:hidden">
          <span className="flex items-center gap-3 text-lg font-medium"><ShoppingCartSimple size={26} weight="fill" />{count} {count === 1 ? 'item' : 'items'}</span>
          <span className="num text-xl font-bold">{inr(totals.total, { short: true })}</span>
        </button>
      )}
      <Modal open={cartOpen} onClose={() => setCartOpen(false)} title="Your order">{cartPanel}</Modal>

      <NoteModal id={noteFor} onClose={() => setNoteFor(null)} />
      {cart.placedOrderId && <BillModal orderId={cart.placedOrderId} onDone={() => { cart.reset(); }} />}
    </div>
  );
}

function CartPanel({ totals, count, needsTable, busy, error, onConfirm, onNote, tablesData, parcel, discounts, useTables }: {
  totals: ReturnType<typeof useTotals>; count: number; needsTable: boolean; busy: boolean; error: unknown; onConfirm: () => void; onNote: (id: string) => void;
  tablesData: { _id: string; label: string; activeOrderId?: string | null }[]; parcel: boolean; discounts: boolean; useTables: boolean;
}) {
  const t = useT();
  const nm = useLocalName();
  const cart = useCart();
  const [more, setMore] = useState(false);
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className={`grid gap-1.5 ${parcel ? 'grid-cols-3' : 'grid-cols-2'}`} role="tablist">
        {([['DINE_IN', t('Eat here'), <ForkKnife size={20} key="d" />], ['TAKEAWAY', t('Takeaway'), <Bag size={20} key="t" />], ...(parcel ? [['PARCEL', t('Parcel'), <PackageIcon size={20} key="p" />]] : [])] as [any, string, React.ReactNode][]).map(([v, label, icon]) => (
          <button key={v} role="tab" aria-selected={cart.type === v} onClick={() => cart.setType(v)} className={`press grid min-h-11 place-items-center content-center gap-0.5 rounded-lg border px-1 text-[12px] ${cart.type === v ? 'border-forest bg-forest-soft font-semibold text-forest ring-1 ring-forest' : 'border-line bg-card text-ink-soft'}`}>{icon}<span className="max-w-full truncate">{label}</span></button>
        ))}
      </div>

      {cart.type === 'DINE_IN' && useTables && (
        <div>
          <p className="mb-2 text-sm font-medium text-ink-soft">{t('Choose a table')}</p>
          <div className="grid grid-cols-5 gap-2">
            {tablesData.map((tb) => {
              const busyT = !!tb.activeOrderId;
              const sel = cart.tableId === tb._id;
              return (
                <button key={tb._id} disabled={busyT} onClick={() => cart.setTable(sel ? null : tb._id)} aria-pressed={sel} aria-label={`${t('Table')} ${tb.label} ${busyT ? t('Busy') : t('Free')}`}
                  className={`press num min-h-12 rounded-lg text-lg font-bold ring-1 ${sel ? 'bg-forest text-white ring-forest' : busyT ? 'bg-gold-soft text-warn ring-gold/40 line-through opacity-70' : 'bg-white text-ink ring-line hover:ring-forest/50'}`}>
                  {tb.label}
                </button>
              );
            })}
          </div>
          {needsTable && count > 0 && <p className="mt-2 text-sm font-medium text-warn">{t('Choose a table')}</p>}
        </div>
      )}

      <div className="border-t border-line pt-3">
        {cart.lines.length === 0 ? (
          <div className="py-8 text-center text-ink-soft"><ShoppingCartSimple size={40} className="mx-auto mb-2 text-forest/40" /><p className="font-medium text-ink">{t('Your order is empty')}</p><p className="text-sm">{t('Tap a food to add it')}</p></div>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {cart.lines.map((l) => (
              <li key={l.productId} className="py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">{nm(l)}</p>
                    <p className="num text-sm text-ink-soft">{inr(l.pricePaise, { short: true })}</p>
                    {l.note && <p className="mt-1 text-sm text-warn">{l.note}</p>}
                  </div>
                  <p className="num shrink-0 text-base font-medium">{inr(l.pricePaise * l.qty, { short: true })}</p>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <button onClick={() => cart.setQty(l.productId, l.qty - 1)} aria-label="Less" className="press grid h-9 w-9 place-items-center rounded-lg bg-forest-soft text-forest">{l.qty === 1 ? <Trash size={18} /> : <Minus size={18} weight="bold" />}</button>
                  <span className="num w-8 text-center text-lg font-bold">{l.qty}</span>
                  <button onClick={() => cart.setQty(l.productId, l.qty + 1)} aria-label="More" className="press grid h-9 w-9 place-items-center rounded-lg bg-forest text-white"><Plus size={18} weight="bold" /></button>
                  <button onClick={() => cart.setQty(l.productId, 0)} aria-label={t('Delete item')} title={t('Delete item')} className="press grid h-9 w-9 place-items-center rounded-lg bg-bad/10 text-bad hover:bg-bad/20"><Trash size={18} /></button>
                  <button onClick={() => onNote(l.productId)} className="press ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] text-ink-soft ring-1 ring-line"><NotePencil size={16} />{t('Add note')}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {cart.lines.length > 0 && (
        <>
          <button onClick={() => setMore(!more)} className="press self-start text-sm font-medium text-forest underline underline-offset-4">{more ? '−' : '+'} {t('Customer name (optional)')}</button>
          {more && (
            <div className="flex flex-col gap-2">
              <input className={inputCls} placeholder={t('Customer name (optional)')} value={cart.customerName} onChange={(e) => cart.setCustomer(e.target.value, cart.customerPhone)} />
              <input className={inputCls} inputMode="tel" placeholder={t('Phone (optional)')} value={cart.customerPhone} onChange={(e) => cart.setCustomer(cart.customerName, e.target.value)} />
            </div>
          )}
          {discounts && (
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{t('Discount')} (₹)</span>
              <input className={`${inputCls} num max-w-32 text-right`} inputMode="decimal" value={cart.discountPaise ? cart.discountPaise / 100 : ''} onChange={(e) => cart.setDiscount(Math.max(0, Math.round(Number(e.target.value || 0) * 100)))} />
            </label>
          )}
          <dl className="flex flex-col gap-1.5 border-t border-line pt-3 text-[14px]">
            <div className="flex justify-between"><dt className="text-ink-soft">{t('Subtotal')}</dt><dd className="num">{inr(totals.subtotal)}</dd></div>
            {totals.discount > 0 && <div className="flex justify-between"><dt className="text-ink-soft">{t('Discount')}</dt><dd className="num">−{inr(totals.discount)}</dd></div>}
            {totals.tax > 0 && <div className="flex justify-between"><dt className="text-ink-soft">{t('Tax')} {totals.taxBp / 100}%{totals.taxMode === 'INCLUSIVE' ? ' (incl.)' : ''}</dt><dd className="num">{inr(totals.tax)}</dd></div>}
            <div className="mt-1 flex items-baseline justify-between"><dt className="text-base font-medium">{t('Total')}</dt><dd className="num text-2xl font-bold text-forest">{inr(totals.total)}</dd></div>
          </dl>
          <ErrorNote error={error} />
          <Button size="lg" variant="primary" disabled={busy || needsTable} onClick={onConfirm}>{busy ? '...' : t('Confirm Order')}</Button>
          <Button variant="ghost" size="sm" onClick={() => cart.reset()} disabled={busy}>{t('Clear')}</Button>
        </>
      )}
    </div>
  );
}

function NoteModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useT();
  const cart = useCart();
  const line = cart.lines.find((l) => l.productId === id);
  const [v, setV] = useState('');
  useEffect(() => { setV(line?.note ?? ''); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const quick = ['Less spicy', 'No onion', 'Extra spicy', 'Less oil', 'Pack separately'];
  return (
    <Modal open={!!id} onClose={onClose} title={t('Add note')}>
      <p className="mb-3 font-medium">{line?.name}</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {quick.map((n) => <button key={n} onClick={() => setV(n)} className="press min-h-9 rounded-lg px-3.5 text-sm ring-1 ring-line hover:bg-forest-soft">{n}</button>)}
      </div>
      <input className={inputCls} maxLength={80} value={v} onChange={(e) => setV(e.target.value)} placeholder={t('Add note')} autoFocus />
      <div className="mt-5 flex gap-3">
        <Button variant="ghost" className="flex-1" onClick={() => { if (id) cart.setNote(id, ''); setV(''); onClose(); }}>{t('Clear')}</Button>
        <Button className="flex-1" onClick={() => { if (id) cart.setNote(id, v.trim()); setV(''); onClose(); }}>{t('Save')}</Button>
      </div>
    </Modal>
  );
}
