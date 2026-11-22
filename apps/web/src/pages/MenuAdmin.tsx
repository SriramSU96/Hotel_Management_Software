import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageSquare, Plus, Star } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime, inr, toPaise } from '../lib/format';
import { priceFor, useCategories, useProducts, type Product } from '../lib/queries';
import { useT } from '../lib/i18n';
import { Badge, Button, Empty, ErrorNote, Field, Modal, PageHead, Segmented, Skeleton, inputCls } from '../components/ui';
import { Photo } from '../components/ProductTile';
import { errText, toast } from '../lib/toast';

export default function MenuAdmin() {
  const t = useT();
  const { can } = useAuth();
  const products = useProducts(true);
  const cats = useCategories();
  const [edit, setEdit] = useState<Partial<Product> | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [tab, setTab] = useState<'products' | 'prices'>('products');
  const catName = (id: string) => cats.data?.find((c) => c._id === id)?.name ?? '';
  return (
    <div>
      <PageHead eyebrow="MENU" title="Menu & products" action={<div className="flex gap-2"><Button variant="soft" onClick={() => setCatOpen(true)}>Categories</Button>{can('price.edit') && <Button onClick={() => setEdit({ status: 'AVAILABLE', categoryId: cats.data?.[0]?._id })}><Plus size={20} />New product</Button>}</div>} />
      <div className="mb-4"><Segmented value={tab} onChange={setTab} options={[{ value: 'products', label: 'Products' }, { value: 'prices', label: 'Price list & quick order', icon: <Star size={16} weight="fill" /> }]} /></div>
      {tab === 'prices' ? <PriceList /> : products.isLoading ? <Skeleton className="h-64" /> : products.error ? <ErrorNote error={products.error} />
      : !products.data?.length ? <Empty title="No products yet" hint="Add your first dish with a photo and price." icon={<ImageSquare size={40} />} />
      : (
        <div className="grid gap-3 min-[768px]:grid-cols-2 min-[1280px]:grid-cols-3">
          {products.data.map((p) => (
            <button key={p._id} onClick={() => setEdit(p)} className={`press flex items-center gap-4 rounded-[10px] border border-line bg-card p-3 text-left shadow-soft hover:border-forest/40 ${p.active ? '' : 'opacity-50'}`}>
              <Photo p={p} className="h-20 w-20 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{p.name}</p><p className="text-xs text-ink-soft">{catName(p.categoryId)}</p><p className="num mt-1 flex flex-wrap items-baseline gap-x-3 text-sm"><span><b className="font-bold text-forest">{inr(p.pricePaise, { short: true })}</b> <span className="text-xs text-ink-soft">Eat here</span></span><span><b className="font-bold text-forest">{inr(priceFor(p, 'PARCEL'), { short: true })}</b> <span className="text-xs text-ink-soft">Parcel</span></span></p></div>
              {p.starred && <Star size={18} weight="fill" className="shrink-0 text-gold" aria-label="Quick order" />}<Badge tone={p.status === 'AVAILABLE' ? 'ok' : 'warn'}>{p.status === 'AVAILABLE' ? t('Available') : p.status === 'SOLD_OUT' ? t('Sold out') : t('Unavailable')}</Badge>
            </button>
          ))}
        </div>
      )}
      {edit && <ProductForm initial={edit} onClose={() => setEdit(null)} />}
      {catOpen && <Categories onClose={() => setCatOpen(false)} />}
    </div>
  );
}

function ProductForm({ initial, onClose }: { initial: Partial<Product>; onClose: () => void }) {
  const t = useT();
  const { can } = useAuth();
  const qc = useQueryClient();
  const cats = useCategories();
  const isNew = !initial._id;
  const [f, setF] = useState({ name: initial.name ?? '', nameTa: initial.nameTa ?? '', categoryId: initial.categoryId ?? '', price: initial.pricePaise != null ? String(initial.pricePaise / 100) : '', parcel: initial.parcelPricePaise != null ? String(initial.parcelPricePaise / 100) : '', status: initial.status ?? 'AVAILABLE', description: initial.description ?? '', reason: '' });
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hist = useQuery({ queryKey: ['price-history', initial._id], enabled: !isNew && can('price.edit'), queryFn: () => api<{ history: any[] }>(`/products/${initial._id}/price-history`) });

  const save = useMutation({
    mutationFn: async () => {
      let id = initial._id;
      const pricePaise = toPaise(f.price || 0);
      // an empty Parcel price means "same as Eat here"
      const parcelPaise = f.parcel.trim() ? toPaise(f.parcel) : null;
      const base = { categoryId: f.categoryId, name: f.name.trim(), nameTa: f.nameTa.trim() || undefined, description: f.description || undefined, status: f.status };
      if (isNew) id = (await api<{ product: Product }>('/products', { body: { ...base, pricePaise, parcelPricePaise: parcelPaise } })).product._id;
      else {
        await api(`/products/${id}`, { method: 'PUT', body: base });
        if (can('price.edit') && (pricePaise !== initial.pricePaise || parcelPaise !== (initial.parcelPricePaise ?? null))) await api(`/products/${id}/price`, { method: 'PUT', body: { pricePaise, parcelPricePaise: parcelPaise, reason: f.reason || undefined } });
      }
      if (file) { const fd = new FormData(); fd.append('image', file); await api(`/products/${id}/image`, { form: fd }); }
    },
    onSuccess: () => { toast.ok('Saved'); qc.invalidateQueries({ queryKey: ['products'] }); onClose(); },
    onError: (e) => toast.error(errText(e)),
  });
  const hide = useMutation({
    mutationFn: () => api(`/products/${initial._id}`, { method: 'PUT', body: { active: initial.active === false } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); onClose(); }, onError: (e) => toast.error(errText(e)),
  });
  const priceChanged = !isNew && (toPaise(f.price || 0) !== initial.pricePaise || (f.parcel.trim() ? toPaise(f.parcel) : null) !== (initial.parcelPricePaise ?? null));
  const preview = file ? URL.createObjectURL(file) : initial.imageUrl;
  return (
    <Modal open onClose={onClose} title={isNew ? 'New product' : initial.name ?? ''} wide>
      <div className="grid gap-6 min-[768px]:grid-cols-[220px_1fr]">
        <div>
          <Photo p={{ name: f.name || '?', imageUrl: preview }} className="aspect-square w-full rounded-[10px]" />
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button variant="soft" size="sm" className="mt-3 w-full" onClick={() => fileRef.current?.click()}><ImageSquare size={18} />{preview ? 'Change photo' : 'Add photo'}</Button>
          <p className="mt-2 text-xs text-ink-soft">JPG, PNG or WebP, up to 6 MB.</p>
        </div>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 min-[768px]:grid-cols-2">
            <Field label="Name (English)"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="பெயர் (Tamil)"><input className={`${inputCls} font-ta`} value={f.nameTa} onChange={(e) => setF({ ...f, nameTa: e.target.value })} /></Field>
            <div className="min-[768px]:col-span-2"><Field label="Category"><select className={inputCls} value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>{cats.data?.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></Field></div>
          </div>
          <div className="grid gap-4 min-[768px]:grid-cols-2">
            <Field label="Eat here price" hint={can('price.edit') ? 'Used for Eat here orders.' : 'Only the owner or manager can change prices.'}>
              <div className="relative"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft">₹</span><input className={`${inputCls} num pl-9`} inputMode="decimal" placeholder="0" disabled={!can('price.edit')} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^0-9.]/g, '') })} /></div>
            </Field>
            <Field label="Parcel price" hint="Used for Parcel orders. Leave empty to use the Eat here price.">
              <div className="relative"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft">₹</span><input className={`${inputCls} num pl-9`} inputMode="decimal" placeholder={f.price || 'same'} disabled={!can('price.edit')} value={f.parcel} onChange={(e) => setF({ ...f, parcel: e.target.value.replace(/[^0-9.]/g, '') })} /></div>
            </Field>
          </div>
          {priceChanged && <Field label="Why is the price changing? (optional)"><input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>}
          <Field label="Availability"><div className="flex flex-wrap gap-2">{(['AVAILABLE', 'SOLD_OUT', 'UNAVAILABLE'] as const).map((s) => <button key={s} onClick={() => setF({ ...f, status: s })} aria-pressed={f.status === s} className={`press min-h-12 rounded-lg px-5 text-sm font-bold ring-1 ${f.status === s ? 'bg-forest text-white ring-forest' : 'ring-line'}`}>{s === 'AVAILABLE' ? t('Available') : s === 'SOLD_OUT' ? t('Sold out') : t('Unavailable')}</button>)}</div></Field>
          <Field label="Description (optional)"><input className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={300} /></Field>
          {hist.data?.history.length ? <details className="rounded-lg bg-black/5 p-3 text-sm"><summary className="cursor-pointer font-medium">Price history</summary>{hist.data.history.map((h) => <p key={h._id} className="mt-1 text-ink-soft"><span className="num">{h.oldPaise != null ? inr(h.oldPaise, { short: true }) : '—'} → {inr(h.newPaise, { short: true })}</span> · {h.byName} · {fmtDateTime(h.createdAt)}{h.reason ? ` · ${h.reason}` : ''}</p>)}</details> : null}
          <ErrorNote error={save.error} />
          <div className="flex gap-3">
            {!isNew && <Button variant="ghost" onClick={() => hide.mutate()} disabled={hide.isPending}>{initial.active === false ? 'Show in menu' : 'Hide from menu'}</Button>}
            <Button size="lg" className="flex-1" disabled={save.isPending || !f.name.trim() || !f.categoryId || (isNew && !f.price)} onClick={() => save.mutate()}>{t('Save')}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Categories({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const cats = useCategories();
  const [name, setName] = useState(''); const [ta, setTa] = useState('');
  const add = useMutation({ mutationFn: () => api('/categories', { body: { name, nameTa: ta || undefined, sortOrder: (cats.data?.length ?? 0) } }), onSuccess: () => { setName(''); setTa(''); qc.invalidateQueries({ queryKey: ['categories'] }); }, onError: (e) => toast.error(errText(e)) });
  const patch = useMutation({ mutationFn: (v: { id: string; body: object }) => api(`/categories/${v.id}`, { method: 'PUT', body: v.body }), onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }) });
  return (
    <Modal open onClose={onClose} title="Categories">
      <ul className="mb-4 divide-y divide-line">{cats.data?.map((c, i) => (
        <li key={c._id} className="flex items-center gap-2 py-2"><span className={`flex-1 ${c.active ? '' : 'opacity-50'}`}>{c.name}{c.nameTa ? ` · ${c.nameTa}` : ''}</span>
          <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => { const prev = cats.data![i - 1]; patch.mutate({ id: c._id, body: { sortOrder: prev.sortOrder } }); patch.mutate({ id: prev._id, body: { sortOrder: c.sortOrder } }); }}>↑</Button>
          <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: c._id, body: { active: !c.active } })}>{c.active ? 'Hide' : 'Show'}</Button></li>
      ))}</ul>
      <div className="flex flex-col gap-2"><input className={inputCls} placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} /><input className={`${inputCls} font-ta`} placeholder="தமிழ் பெயர் (optional)" value={ta} onChange={(e) => setTa(e.target.value)} /><Button disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>Add category</Button></div>
    </Modal>
  );
}

type Draft = { dine: string; take: string; parcel: string };
const toDraft = (p: Product): Draft => ({ dine: String(p.pricePaise / 100), take: p.takeawayPricePaise != null ? String(p.takeawayPricePaise / 100) : '', parcel: p.parcelPricePaise != null ? String(p.parcelPricePaise / 100) : '' });

/** One screen for the owner: price per order type and the star that puts an item in POS Quick Order. */
function PriceList() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const products = useProducts(true);
  const cats = useCategories();
  const canPrice = can('price.edit');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [q, setQ] = useState('');
  const get = (p: Product) => drafts[p._id] ?? toDraft(p);
  const set = (p: Product, k: keyof Draft, v: string) => setDrafts((d) => ({ ...d, [p._id]: { ...get(p), [k]: v.replace(/[^0-9.]/g, '') } }));
  const changed = (products.data ?? []).filter((p) => { const d = drafts[p._id]; if (!d) return false; const o = toDraft(p); return d.dine !== o.dine || d.take !== o.take || d.parcel !== o.parcel; });
  const bad = changed.some((p) => !get(p).dine.trim());

  const star = useMutation({
    mutationFn: (p: Product) => api(`/products/${p._id}/star`, { method: 'PUT', body: { starred: !p.starred } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }), onError: (e) => toast.error(errText(e)),
  });
  const saveAll = useMutation({
    mutationFn: async () => { for (const p of changed) { const d = get(p); await api(`/products/${p._id}/price`, { method: 'PUT', body: { pricePaise: toPaise(d.dine || 0), takeawayPricePaise: d.take.trim() ? toPaise(d.take) : null, parcelPricePaise: d.parcel.trim() ? toPaise(d.parcel) : null, reason: 'Price list' } }); } },
    onSuccess: () => { toast.ok(`${changed.length} price${changed.length === 1 ? '' : 's'} saved`); setDrafts({}); qc.invalidateQueries({ queryKey: ['products'] }); },
    onError: (e) => { toast.error(errText(e)); qc.invalidateQueries({ queryKey: ['products'] }); },
  });

  if (products.isLoading) return <Skeleton className="h-64" />;
  if (products.error) return <ErrorNote error={products.error} />;
  const term = q.trim().toLowerCase();
  const rows = (products.data ?? []).filter((p) => !term || p.name.toLowerCase().includes(term));
  const groups = (cats.data ?? []).map((c) => ({ c, items: rows.filter((p) => p.categoryId === c._id) })).filter((g) => g.items.length);
  const priceInput = (p: Product, k: keyof Draft, label: string, ph: string) => (
    <input aria-label={`${p.name} ${label} price`} className={`${inputCls} num w-full min-w-0 text-right`} inputMode="decimal" placeholder={ph} disabled={!canPrice} value={get(p)[k]} onChange={(e) => set(p, k, e.target.value)} />
  );
  return (
    <div className="pb-24">
      <div className="mb-4 rounded-[10px] border border-line bg-card p-4 text-sm text-ink-soft">
        <p><b className="text-ink">Prices in ₹.</b> Leave <b>Takeaway</b> or <b>Parcel</b> empty to use the Eat here price. Tap the <Star size={14} weight="fill" className="inline text-gold" /> to show an item in <b>Quick order</b> at the top of the billing screen.{!canPrice && ' Only the owner or manager can change prices.'}</p>
      </div>
      <input className={`${inputCls} mb-4`} placeholder="Search food" aria-label="Search food" value={q} onChange={(e) => setQ(e.target.value)} />
      {groups.map(({ c, items }) => (
        <section key={c._id} className="mb-6">
          <h3 className="eyebrow mb-2">{c.name}</h3>
          <div className="hidden grid-cols-[48px_minmax(0,1fr)_repeat(3,112px)] items-center gap-3 px-3 pb-1 text-xs font-bold text-ink-soft min-[768px]:grid"><span /><span>Food</span><span className="text-right">Eat here</span><span className="text-right">Takeaway</span><span className="text-right">Parcel</span></div>
          <ul className="flex flex-col gap-2">
            {items.map((p) => (
              <li key={p._id} className={`rounded-[10px] border bg-card p-3 ${drafts[p._id] && changed.includes(p) ? 'border-gold-line' : 'border-line'} ${p.active ? '' : 'opacity-50'}`}>
                <div className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-3 min-[768px]:grid-cols-[48px_minmax(0,1fr)_repeat(3,112px)]">
                  <button onClick={() => star.mutate(p)} aria-pressed={!!p.starred} aria-label={`${p.starred ? 'Remove from' : 'Add to'} quick order: ${p.name}`}
                    className={`press grid h-12 w-12 place-items-center rounded-full ring-1 ${p.starred ? 'bg-gold-soft text-gold ring-gold-line' : 'text-ink-soft ring-line'}`}><Star size={24} weight={p.starred ? 'fill' : 'regular'} /></button>
                  <div className="min-w-0"><p className="truncate font-medium">{p.name}</p>{p.nameTa && <p className="truncate font-ta text-xs text-ink-soft">{p.nameTa}</p>}</div>
                  <div className="col-span-2 grid grid-cols-3 gap-2 min-[768px]:contents">
                    <label className="min-w-0"><span className="mb-1 block text-xs font-bold text-ink-soft min-[768px]:hidden">Eat here</span>{priceInput(p, 'dine', 'dine-in', '0')}</label>
                    <label className="min-w-0"><span className="mb-1 block text-xs font-bold text-ink-soft min-[768px]:hidden">Takeaway</span>{priceInput(p, 'take', 'takeaway', 'same')}</label>
                    <label className="min-w-0"><span className="mb-1 block text-xs font-bold text-ink-soft min-[768px]:hidden">Parcel</span>{priceInput(p, 'parcel', 'parcel', 'same')}</label>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {changed.length > 0 && (
        <div className="fixed inset-x-0 bottom-[72px] z-20 border-t border-line bg-card/95 p-3 shadow-2xl min-[640px]:bottom-0 min-[640px]:left-[72px] min-[1100px]:left-[220px] min-[1280px]:left-[248px]">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <p className="flex-1 text-sm font-medium">{changed.length} change{changed.length === 1 ? '' : 's'} not saved</p>
            <Button variant="ghost" onClick={() => setDrafts({})} disabled={saveAll.isPending}>Cancel</Button>
            <Button size="lg" disabled={saveAll.isPending || bad} onClick={() => saveAll.mutate()}>{saveAll.isPending ? '...' : 'Save prices'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
