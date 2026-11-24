import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MagnifyingGlass, Package, Plus } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime, inr, toPaise } from '../lib/format';
import { useLang, useT } from '../lib/i18n';
import { Badge, Button, Empty, ErrorNote, Field, Modal, PageHead, Segmented, Skeleton, inputCls } from '../components/ui';
import { DataTable, FilterSelect, Pagination, SearchBox, usePaged, type Column, type Sort } from '../components/DataTable';
import { errText, toast } from '../lib/toast';

const UNIT_GROUPS: Record<string, string[]> = { pcs: ['pcs'], kg: ['kg', 'g'], g: ['kg', 'g'], L: ['L', 'ml'], ml: ['L', 'ml'], packet: ['packet'], box: ['box'] };
const REASONS = ['SPOILAGE', 'OVER_PREPARATION', 'UNSOLD_FOOD', 'PREPARATION_ERROR', 'CUSTOMER_RETURN', 'OTHER'];
type Action = 'IN' | 'ADJUST' | 'COUNT' | 'WASTE';
type Filter = 'all' | 'low' | 'ok';

const levelOf = (i: any): 'out' | 'low' | 'ok' => (i.qty <= 0 ? 'out' : i.low ? 'low' : 'ok');
const LEVEL_COLOR = { out: 'var(--color-bad)', low: 'var(--color-gold)', ok: 'var(--color-forest)' } as const;

export default function Stock() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { can } = useAuth();
  const [tab, setTab] = useState<'items' | 'ledger' | 'purchases'>('items');
  const [pick, setPick] = useState<{ item: any; start: Action } | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const items = useQuery({ queryKey: ['stock-items'], queryFn: () => api<{ ingredients: any[] }>('/stock/ingredients') });
  const all = items.data?.ingredients ?? [];
  const low = all.filter((i) => levelOf(i) === 'low').length;
  const out = all.filter((i) => levelOf(i) === 'out').length;
  const healthy = all.length - low - out;

  // items that need refilling come first
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all
      .filter((i) => (filter === 'all' || (filter === 'low' ? levelOf(i) !== 'ok' : levelOf(i) === 'ok')) && (!term || i.name.toLowerCase().includes(term) || (i.nameTa ?? '').includes(term)))
      .sort((a, b) => Number(levelOf(b) !== 'ok') - Number(levelOf(a) !== 'ok'));
  }, [all, q, filter]);
  const paged = usePaged(shown, 10);

  const chips: [Filter, string, number][] = [['all', 'All', all.length], ['low', t('Low stock'), low + out], ['ok', 'In stock', healthy]];

  return (
    <div className="w-full">
      <PageHead title="Stock & inventory" sub={all.length ? `${all.length} items${low + out ? ` · ${low + out} need refilling` : ' · all well stocked'}` : 'Check what is left.'} action={
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={tab} onChange={setTab} options={[{ value: 'items', label: t('Stock') }, { value: 'ledger', label: 'Ledger' }, ...(can('purchases.manage') ? [{ value: 'purchases' as const, label: 'Purchases' }] : [])]} />
          {can('stock.edit') && <Button size="sm" variant="soft" onClick={() => setAdding(true)}><Plus size={18} />New item</Button>}
        </div>} />
      {tab === 'items' && (items.isLoading ? <div className="grid gap-4"><Skeleton className="h-24" /><Skeleton className="h-80" /></div>
        : items.error ? <ErrorNote error={items.error} />
        : !all.length ? <Empty title="No stock items yet" hint="Add Egg, Chicken, Rice and others to start." icon={<Package size={40} />} />
        : (
          <div className="grid gap-5">
            {/* the owner's first question: is anything running out? */}
            <div className="grid grid-cols-2 divide-line rounded-xl border border-line bg-card min-[900px]:grid-cols-4 min-[900px]:divide-x">
              {([['Items', all.length, 'In your stock list', ''], ['Well stocked', healthy, 'Above the reorder level', 'text-forest'], ['Low stock', low, low ? 'Refill soon' : 'Nothing low', low ? 'text-warn' : ''], ['Out of stock', out, out ? 'Refill now' : 'Nothing finished', out ? 'text-bad' : '']] as [string, number, string, string][]).map(([l, v, s, tone], i) => (
                <div key={l} className={`p-5 ${i % 2 === 0 ? 'border-r border-line min-[900px]:border-r-0' : ''} ${i < 2 ? 'border-b border-line min-[900px]:border-b-0' : ''}`}>
                  <p className="text-[13px] text-ink-soft">{l}</p>
                  <p className={`num mt-1.5 text-[28px] font-semibold leading-none ${tone}`}>{v}</p>
                  <p className="mt-2 text-[13px] text-ink-soft">{s}</p>
                </div>
              ))}
            </div>

            <section className="overflow-hidden rounded-xl border border-line bg-card">
              <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
                <div className="relative min-w-[200px] flex-1 min-[900px]:max-w-sm">
                  <MagnifyingGlass size={20} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
                  <input className={`${inputCls} pl-11`} placeholder="Search stock" value={q} onChange={(e) => { setQ(e.target.value); paged.resetPage(); }} aria-label="Search stock" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {chips.map(([v, label, n]) => (
                    <button key={v} onClick={() => { setFilter(v); paged.resetPage(); }} aria-pressed={filter === v} className={`press inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-[14px] font-medium ${filter === v ? 'bg-ink text-white' : 'bg-black/[0.045] text-ink hover:bg-black/[0.075]'}`}>{label}<span className={`num text-[12px] ${filter === v ? 'text-white/70' : 'text-ink-soft'}`}>{n}</span></button>
                  ))}
                </div>
              </div>

              <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,2fr)_110px_120px_220px] gap-x-4 border-b border-line bg-[#faf9f5] px-5 py-2.5 text-[12px] font-medium text-ink-soft min-[900px]:grid">
                <span>Item</span><span>Stock level</span><span>Reorder at</span><span>Status</span><span className="text-right">Quick update</span>
              </div>

              {shown.length === 0 ? <p className="px-5 py-12 text-center text-ink-soft">No stock items match.</p> : (
                <ul className="divide-y divide-line">
                  {paged.slice.map((i) => {
                    const lv = levelOf(i);
                    const target = i.reorderLevel > 0 ? i.reorderLevel * 2 : 0;
                    const pct = target ? Math.min(100, Math.max(0, (i.qty / target) * 100)) : 0;
                    const badge = <Badge tone={lv === 'out' ? 'bad' : lv === 'low' ? 'warn' : 'ok'}>{lv === 'out' ? 'Out of stock' : lv === 'low' ? t('Low stock') : 'In stock'}</Badge>;
                    return (
                      <li key={i._id} className="grid items-center gap-x-4 gap-y-3 px-5 py-4 min-[900px]:grid-cols-[minmax(0,1.6fr)_minmax(0,2fr)_110px_120px_220px]">
                        <div className="flex min-w-0 items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className={`truncate text-[15px] font-medium ${lang === 'ta' ? 'font-ta' : ''}`}>{lang === 'ta' && i.nameTa ? i.nameTa : i.name}</p>
                            {lang !== 'ta' && i.nameTa && <p className="font-ta truncate text-[13px] text-ink-soft">{i.nameTa}</p>}
                          </div>
                          <span className="min-[900px]:hidden">{badge}</span>
                        </div>
                        <div className="min-w-0">
                          <p className={`num text-[22px] font-semibold leading-none ${lv === 'out' ? 'text-bad' : 'text-forest'}`}>{i.qty}<span className="ml-1 text-[14px] font-medium text-ink-soft">{i.baseUnit}</span></p>
                          {target > 0 ? (
                            <div className="relative mt-2.5 h-2 rounded-full bg-[#eceae2]" role="img" aria-label={`${i.qty} ${i.baseUnit}, reorder at ${i.reorderLevel}`}>
                              <div className="h-2 rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: LEVEL_COLOR[lv] }} />
                              <i className="absolute -top-[3px] bottom-[-3px] left-1/2 w-px bg-ink/35" title="Reorder level" />
                            </div>
                          ) : <p className="mt-2 text-[12px] text-ink-soft">No reorder level set</p>}
                        </div>
                        <p className="num hidden text-[14px] text-ink-soft min-[900px]:block">{i.reorderLevel > 0 ? `${i.reorderLevel} ${i.baseUnit}` : '—'}</p>
                        <div className="hidden min-[900px]:block">{badge}</div>
                        <div className="flex gap-2 min-[900px]:justify-end">
                          <Button size="sm" variant="soft" onClick={() => setPick({ item: i, start: 'IN' })}><Plus size={16} weight="bold" />Stock in</Button>
                          <Button size="sm" variant="ghost" onClick={() => setPick({ item: i, start: 'COUNT' })}>Count</Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
{shown.length > 0 && <Pagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onPage={paged.setPage} onPageSize={paged.setPageSize} />}
            </section>
          </div>
        ))}
      {tab === 'ledger' && <Ledger />}
      {tab === 'purchases' && <Purchases items={all} />}
      {pick && <MoveModal item={pick.item} start={pick.start} onClose={() => setPick(null)} />}
      {adding && <NewItem onClose={() => setAdding(false)} />}
    </div>
  );
}

function MoveModal({ item, start, onClose }: { item: any; start?: Action; onClose: () => void }) {
  const t = useT();
  const { can } = useAuth();
  const qc = useQueryClient();
  const units = UNIT_GROUPS[item.baseUnit] ?? [item.baseUnit];
  const [action, setAction] = useState<Action>(start ?? 'IN');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState(units.includes(item.lastUnit) ? item.lastUnit : item.baseUnit);
  const [reason, setReason] = useState('');
  const [wasteReason, setWasteReason] = useState('SPOILAGE');
  const [dir, setDir] = useState<'IN' | 'OUT'>('OUT');
  const [cost, setCost] = useState('');

  const save = useMutation({
    mutationFn: () => {
      const n = Number(qty);
      const base = { ingredientId: item._id, qty: n, unit };
      if (action === 'IN') return api('/stock/receive', { body: { ...base, costPaise: cost ? toPaise(cost) : undefined, reason: reason || undefined } });
      if (action === 'ADJUST') return api('/stock/adjust', { body: { ...base, direction: dir, reason } });
      if (action === 'COUNT') return api('/stock/count', { body: { ...base, reason: reason || undefined } });
      return api('/stock/waste', { body: { ...base, wasteReason, reason: reason || undefined } });
    },
    onSuccess: () => { toast.ok('Saved'); qc.invalidateQueries({ queryKey: ['stock-items'] }); qc.invalidateQueries({ queryKey: ['stock-ledger'] }); onClose(); },
    onError: (e) => toast.error(errText(e)),
  });
  const tabs = [
    { value: 'IN' as const, label: t('Stock In') }, { value: 'ADJUST' as const, label: t('Adjust') }, { value: 'COUNT' as const, label: t('Count') },
    ...(can('waste.record') || can('stock.edit') ? [{ value: 'WASTE' as const, label: t('Waste') }] : []),
  ];
  const n = Number(qty);
  const bad = !qty || !(n >= 0) || (action !== 'COUNT' && n <= 0) || (action === 'ADJUST' && reason.trim().length < 2);
  return (
    <Modal open onClose={onClose} title={`${item.name} · ${item.qty} ${item.baseUnit}`}>
      <div className="mb-5 overflow-x-auto"><Segmented value={action} onChange={setAction} options={tabs} /></div>
      <div className="flex flex-col gap-4">
        <div className="flex gap-3">
          <input className={`${inputCls} num text-3xl`} inputMode="decimal" autoFocus value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" aria-label={t('Quantity')} />
          <div className="flex gap-1.5">{units.map((u) => <button key={u} onClick={() => setUnit(u)} aria-pressed={unit === u} className={`press min-h-12 min-w-14 rounded-lg px-3 text-base font-bold ring-1 ${unit === u ? 'bg-forest text-white ring-forest' : 'bg-white ring-line'}`}>{u}</button>)}</div>
        </div>
        {action === 'IN' && <Field label="Cost paid (₹, optional)" hint="Used later for waste value and profit."><input className={`${inputCls} num`} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>}
        {action === 'ADJUST' && <div className="flex gap-2">{(['OUT', 'IN'] as const).map((d) => <button key={d} onClick={() => setDir(d)} aria-pressed={dir === d} className={`press min-h-12 flex-1 rounded-lg font-bold ring-1 ${dir === d ? 'bg-forest text-white ring-forest' : 'ring-line'}`}>{d === 'IN' ? 'Add' : 'Remove'}</button>)}</div>}
        {action === 'COUNT' && <p className="rounded-lg bg-gold-soft p-3 text-sm text-warn">Enter the real quantity on the shelf.</p>}
        {action === 'WASTE' && <Field label={t('Reason')}><select className={inputCls} value={wasteReason} onChange={(e) => setWasteReason(e.target.value)}>{REASONS.map((r) => <option key={r} value={r}>{r.replace('_', ' ').toLowerCase()}</option>)}</select></Field>}
        {(action === 'ADJUST' || action === 'COUNT' || action === 'WASTE') && <Field label={action === 'ADJUST' ? `${t('Reason')} *` : t('Reason')}><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></Field>}
        <ErrorNote error={save.error} />
        <Button size="lg" disabled={bad || save.isPending} onClick={() => save.mutate()}>{t('Save')}</Button>
      </div>
    </Modal>
  );
}

function NewItem({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(''); const [nameTa, setNameTa] = useState(''); const [unit, setUnit] = useState('kg'); const [lvl, setLvl] = useState('');
  const save = useMutation({
    mutationFn: () => api('/stock/ingredients', { body: { name, nameTa: nameTa || undefined, baseUnit: unit, reorderLevel: Number(lvl || 0) } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stock-items'] }); onClose(); }, onError: (e) => toast.error(errText(e)),
  });
  return (
    <Modal open onClose={onClose} title="New stock item">
      <div className="flex flex-col gap-4">
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Tamil name (optional)"><input className={`${inputCls} font-ta`} value={nameTa} onChange={(e) => setNameTa(e.target.value)} /></Field>
        <Field label="Counted in" hint="The main unit. You can still add stock in grams or ml."><div className="flex flex-wrap gap-2">{['pcs', 'kg', 'L', 'packet', 'box'].map((u) => <button key={u} onClick={() => setUnit(u)} aria-pressed={unit === u} className={`press min-h-12 rounded-lg px-5 font-bold ring-1 ${unit === u ? 'bg-forest text-white ring-forest' : 'ring-line'}`}>{u}</button>)}</div></Field>
        <Field label="Warn me when stock is at or below" hint="0 means no warning."><input className={`${inputCls} num`} inputMode="decimal" value={lvl} onChange={(e) => setLvl(e.target.value)} /></Field>
        <Button size="lg" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>Save</Button>
      </div>
    </Modal>
  );
}

const reasonText = (m: any) => (m.wasteReason ? `${m.wasteReason.toLowerCase().replace('_', ' ')}${m.reason ? ` - ${m.reason}` : ''}` : m.reason ?? '');

function Ledger() {
  const t = useT();
  const q = useQuery({ queryKey: ['stock-ledger'], queryFn: () => api<{ movements: any[] }>('/stock/movements?limit=300') });
  const [search, setSearch] = useState('');
  const [type, setType] = useState('ALL');
  const [dir, setDir] = useState('ALL');
  const [sort, setSort] = useState<Sort>({ key: 'createdAt', dir: 'desc' });
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const d = sort.dir === 'asc' ? 1 : -1;
    return (q.data?.movements ?? [])
      .filter((m) => (type === 'ALL' || m.type === type) && (dir === 'ALL' || (dir === 'IN' ? m.deltaBase > 0 : m.deltaBase < 0))
        && (!term || [m.ingredientId?.name, m.reason, m.wasteReason, m.byName].some((x) => (x ?? '').toLowerCase().includes(term))))
      .sort((a, b) => (sort.key === 'item' ? String(a.ingredientId?.name ?? '').localeCompare(String(b.ingredientId?.name ?? '')) : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * d);
  }, [q.data, search, type, dir, sort]);
  const paged = usePaged(rows, 25);
  const dirty = !!search || type !== 'ALL' || dir !== 'ALL';
  const reset = () => { setSearch(''); setType('ALL'); setDir('ALL'); paged.resetPage(); };

  const columns: Column<any>[] = [
    { key: 'createdAt', header: 'When', width: '140px', sortable: true, cell: (m) => <span className="num text-[13px] text-ink-soft">{fmtDateTime(m.createdAt)}</span> },
    { key: 'item', header: 'Item', width: '180px', sortable: true, firstDir: 'asc', cell: (m) => <span className="font-medium">{m.ingredientId?.name}</span> },
    { key: 'type', header: t('Type'), width: '110px', cell: (m) => m.type },
    { key: 'change', header: 'Change', width: '130px', cell: (m) => <span className={`num font-bold ${m.deltaBase < 0 ? 'text-bad' : 'text-forest'}`}>{m.deltaBase > 0 ? '+' : ''}{m.deltaBase} {m.ingredientId?.baseUnit}</span> },
    { key: 'balance', header: 'Balance', width: '100px', cell: (m) => <span className="num">{m.balanceAfter}</span> },
    { key: 'reason', header: t('Reason'), cell: (m) => <span className="text-ink-soft" title={reasonText(m)}>{reasonText(m) || '–'}</span> },
    { key: 'by', header: 'By', width: '130px', cell: (m) => <span className="text-ink-soft">{m.byName}</span> },
  ];
  const mobileRow = (m: any) => (
    <span className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5">
      <span className="font-medium">{m.ingredientId?.name}</span>
      <span className={`num text-right font-bold ${m.deltaBase < 0 ? 'text-bad' : 'text-forest'}`}>{m.deltaBase > 0 ? '+' : ''}{m.deltaBase} {m.ingredientId?.baseUnit}</span>
      <span className="col-span-2 text-[13px] text-ink-soft">{m.type} · balance {m.balanceAfter}{reasonText(m) ? ` · ${reasonText(m)}` : ''}</span>
      <span className="col-span-2 text-[12px] text-ink-soft">{fmtDateTime(m.createdAt)} · {m.byName}</span>
    </span>
  );

  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.isLoading && !q.data?.movements.length) return <Empty title="No stock movements yet" hint="Every change shows here with who, when and why." />;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-card p-4">
        <SearchBox label={t('Search')} placeholder="Item, reason, person" value={search} onChange={(v) => { setSearch(v); paged.resetPage(); }} className="grow basis-64" />
        <FilterSelect label={t('Type')} value={type} onChange={(v) => { setType(v); paged.resetPage(); }} options={[{ value: 'ALL', label: t('All') }, ...['PURCHASE', 'ADJUST', 'COUNT', 'WASTE', 'OPENING'].map((x) => ({ value: x, label: x }))]} />
        <FilterSelect label="Change" value={dir} onChange={(v) => { setDir(v); paged.resetPage(); }} options={[{ value: 'ALL', label: t('All') }, { value: 'IN', label: 'Added (+)' }, { value: 'OUT', label: 'Removed (−)' }]} />
        {dirty && <Button variant="ghost" onClick={reset}>{t('Reset filters')}</Button>}
      </div>
      <DataTable
        columns={columns} rows={paged.slice} rowKey={(m) => m._id} sort={sort} onSort={(s) => { setSort(s); paged.resetPage(); }} mobileRow={mobileRow} minWidth={900} loading={q.isLoading}
        empty={<div><Empty title="No movements match these filters" /><div className="mt-3 text-center"><Button variant="soft" onClick={reset}>{t('Reset filters')}</Button></div></div>}
        footer={<Pagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onPage={paged.setPage} onPageSize={paged.setPageSize} sizes={[10, 25, 50, 100]} />}
      />
    </>
  );
}

const purchaseItems = (p: any) => (p.items ?? []).map((i: any) => `${i.name} ${i.qty}${i.unit}`).join(', ');

function PurchaseTable({ purchases }: { purchases: any[] }) {
  const t = useT();
  const [search, setSearch] = useState('');
  const [supplier, setSupplier] = useState('ALL');
  const [sort, setSort] = useState<Sort>({ key: 'createdAt', dir: 'desc' });
  const names = useMemo(() => Array.from(new Set(purchases.map((p) => (p.supplierId?.name ?? 'No supplier') as string))).sort(), [purchases]);
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const d = sort.dir === 'asc' ? 1 : -1;
    return purchases
      .filter((p) => (supplier === 'ALL' || (p.supplierId?.name ?? 'No supplier') === supplier) && (!term || `${p.supplierId?.name ?? ''} ${p.invoiceRef ?? ''} ${purchaseItems(p)}`.toLowerCase().includes(term)))
      .sort((a, b) => (sort.key === 'totalPaise' ? a.totalPaise - b.totalPaise : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * d);
  }, [purchases, search, supplier, sort]);
  const paged = usePaged(rows, 10);
  const dirty = !!search || supplier !== 'ALL';
  const reset = () => { setSearch(''); setSupplier('ALL'); paged.resetPage(); };
  const columns: Column<any>[] = [
    { key: 'createdAt', header: 'Date', width: '140px', sortable: true, cell: (p) => <span className="num text-[13px] text-ink-soft">{fmtDateTime(p.createdAt)}</span> },
    { key: 'supplier', header: 'Supplier', width: '180px', cell: (p) => <span className="font-medium">{p.supplierId?.name ?? 'No supplier'}</span> },
    { key: 'invoice', header: 'Invoice', width: '130px', cell: (p) => <span className="num">{p.invoiceRef || '–'}</span> },
    { key: 'items', header: t('Items'), cell: (p) => <span className="text-[13px] text-ink-soft" title={purchaseItems(p)}>{purchaseItems(p)}</span> },
    { key: 'totalPaise', header: t('Total'), width: '120px', align: 'right', sortable: true, cell: (p) => <span className="num text-[15px] font-semibold">{inr(p.totalPaise)}</span> },
  ];
  const mobileRow = (p: any) => (
    <span className="block p-4">
      <span className="flex justify-between gap-3"><span className="font-medium">{p.supplierId?.name ?? 'No supplier'}{p.invoiceRef ? ` · ${p.invoiceRef}` : ''}</span><span className="num font-bold">{inr(p.totalPaise)}</span></span>
      <span className="mt-1 block text-sm text-ink-soft">{fmtDateTime(p.createdAt)} · {purchaseItems(p)}</span>
    </span>
  );
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-card p-4">
        <SearchBox label={t('Search')} placeholder="Supplier, invoice, item" value={search} onChange={(v) => { setSearch(v); paged.resetPage(); }} className="grow basis-64" />
        <FilterSelect label="Supplier" value={supplier} onChange={(v) => { setSupplier(v); paged.resetPage(); }} options={[{ value: 'ALL', label: t('All') }, ...names.map((n) => ({ value: n, label: n }))]} />
        {dirty && <Button variant="ghost" onClick={reset}>{t('Reset filters')}</Button>}
      </div>
      <DataTable
        columns={columns} rows={paged.slice} rowKey={(p) => p._id} sort={sort} onSort={(s) => { setSort(s); paged.resetPage(); }} mobileRow={mobileRow} minWidth={900}
        empty={<div><Empty title="No purchases match these filters" /><div className="mt-3 text-center"><Button variant="soft" onClick={reset}>{t('Reset filters')}</Button></div></div>}
        footer={<Pagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onPage={paged.setPage} onPageSize={paged.setPageSize} />}
      />
    </>
  );
}

function Purchases({ items }: { items: any[] }) {
  const qc = useQueryClient();
  const sup = useQuery({ queryKey: ['suppliers'], queryFn: () => api<{ suppliers: any[] }>('/stock/suppliers') });
  const list = useQuery({ queryKey: ['purchases'], queryFn: () => api<{ purchases: any[] }>('/stock/purchases') });
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState(''); const [invoice, setInvoice] = useState('');
  const [rows, setRows] = useState<{ ingredientId: string; qty: string; unit: string; cost: string }[]>([{ ingredientId: '', qty: '', unit: '', cost: '' }]);
  const [newSup, setNewSup] = useState('');
  const addSup = useMutation({ mutationFn: () => api('/stock/suppliers', { body: { name: newSup } }), onSuccess: () => { setNewSup(''); qc.invalidateQueries({ queryKey: ['suppliers'] }); }, onError: (e) => toast.error(errText(e)) });
  const save = useMutation({
    mutationFn: () => api('/stock/purchases', { body: { supplierId: supplier || undefined, invoiceRef: invoice || undefined, items: rows.filter((r) => r.ingredientId).map((r) => ({ ingredientId: r.ingredientId, qty: Number(r.qty), unit: r.unit, costPaise: toPaise(r.cost || 0) })) } }),
    onSuccess: () => { toast.ok('Purchase saved'); setOpen(false); setRows([{ ingredientId: '', qty: '', unit: '', cost: '' }]); qc.invalidateQueries(); }, onError: (e) => toast.error(errText(e)),
  });
  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div>
      <div className="mb-4 flex justify-end"><Button onClick={() => setOpen(true)}><Plus size={20} />Receive purchase</Button></div>
      {list.isLoading ? <Skeleton className="h-40" /> : !list.data?.purchases.length ? <Empty title="No purchases yet" hint="Record what you buy from suppliers, with the cost." />
      : <PurchaseTable purchases={list.data.purchases} />}
      <Modal open={open} onClose={() => setOpen(false)} title="Receive purchase" wide>
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 min-[768px]:grid-cols-2">
            <Field label="Supplier"><select className={inputCls} value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">—</option>{sup.data?.suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field>
            <Field label="Invoice number (optional)"><input className={inputCls} value={invoice} onChange={(e) => setInvoice(e.target.value)} /></Field>
          </div>
          <div className="flex gap-2"><input className={inputCls} placeholder="New supplier name" value={newSup} onChange={(e) => setNewSup(e.target.value)} /><Button variant="soft" disabled={!newSup.trim()} onClick={() => addSup.mutate()}>Add</Button></div>
          {rows.map((r, i) => {
            const ing = items.find((x) => x._id === r.ingredientId);
            const units = ing ? UNIT_GROUPS[ing.baseUnit] ?? [ing.baseUnit] : [];
            return (
              <div key={i} className="grid grid-cols-2 gap-2 min-[768px]:grid-cols-[2fr_1fr_1fr_1fr]">
                <select className={`${inputCls} col-span-2 min-[768px]:col-span-1`} value={r.ingredientId} onChange={(e) => { const g = items.find((x) => x._id === e.target.value); setRow(i, { ingredientId: e.target.value, unit: g?.lastUnit ?? g?.baseUnit ?? '' }); }}><option value="">Item…</option>{items.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select>
                <input className={`${inputCls} num`} inputMode="decimal" placeholder="Qty" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} />
                <select className={inputCls} value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })}>{units.map((u) => <option key={u}>{u}</option>)}</select>
                <input className={`${inputCls} num`} inputMode="decimal" placeholder="Total ₹" value={r.cost} onChange={(e) => setRow(i, { cost: e.target.value })} />
              </div>
            );
          })}
          <Button variant="ghost" size="sm" onClick={() => setRows([...rows, { ingredientId: '', qty: '', unit: '', cost: '' }])}>+ Another item</Button>
          <ErrorNote error={save.error} />
          <Button size="lg" disabled={save.isPending || !rows.some((r) => r.ingredientId && Number(r.qty) > 0)} onClick={() => save.mutate()}>Save purchase</Button>
        </div>
      </Modal>
    </div>
  );
}
