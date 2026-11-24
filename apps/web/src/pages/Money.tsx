import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime, inr, toPaise } from '../lib/format';
import { useT } from '../lib/i18n';
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorNote, Field, IconButton, Modal, PageHead, Segmented, Skeleton, inputCls } from '../components/ui';
import { DataTable, FilterSelect, Pagination, SearchBox, usePaged, type Column, type Sort } from '../components/DataTable';
import { errText, toast } from '../lib/toast';

const CATS = ['Ingredients', 'Gas', 'Salary', 'Rent', 'Electricity', 'Water', 'Transport', 'Repairs', 'Other'];

export default function Money() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'cash' | 'expenses'>(can('cash.manage') ? 'cash' : 'expenses');
  return (
    <div>
      <PageHead title="Money" action={<Segmented value={tab} onChange={setTab} options={[...(can('cash.manage') ? [{ value: 'cash' as const, label: 'Cash drawer' }] : []), ...(can('expenses.manage') ? [{ value: 'expenses' as const, label: 'Expenses' }] : [])]} />} />
      {tab === 'cash' ? <CashDrawer /> : <Expenses />}
    </div>
  );
}

function CashDrawer() {
  const qc = useQueryClient();
  const cur = useQuery({ queryKey: ['cash-current'], queryFn: () => api<any>('/finance/cash-sessions/current') });
  const hist = useQuery({ queryKey: ['cash-history'], queryFn: () => api<{ sessions: any[] }>('/finance/cash-sessions') });
  const [opening, setOpening] = useState('');
  const [closing, setClosing] = useState(false);
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const refresh = () => { qc.invalidateQueries({ queryKey: ['cash-current'] }); qc.invalidateQueries({ queryKey: ['cash-history'] }); };
  const open = useMutation({ mutationFn: () => api('/finance/cash-sessions', { body: { openingPaise: toPaise(opening || 0) } }), onSuccess: () => { setOpening(''); refresh(); toast.ok('Shift opened'); }, onError: (e) => toast.error(errText(e)) });
  const close = useMutation({ mutationFn: () => api(`/finance/cash-sessions/${cur.data.session._id}/close`, { body: { countedPaise: toPaise(counted || 0), note: note || undefined } }), onSuccess: () => { setClosing(false); setCounted(''); setNote(''); refresh(); toast.ok('Shift closed'); }, onError: (e) => toast.error(errText(e)) });
  const s = cur.data?.session;
  const diff = s && counted ? toPaise(counted) - cur.data.expectedPaise : 0;
  return (
    <div className="grid gap-6 min-[900px]:grid-cols-[1fr_1fr]">
      <Card className="p-6">
        {cur.isLoading ? <Skeleton className="h-40" /> : !s ? (
          <div className="flex flex-col gap-4"><h2 className="text-xl font-medium">Start of shift</h2><p className="text-ink-soft">Count the cash in the drawer.</p>
            <Field label="Opening cash (₹)"><input className={`${inputCls} num text-2xl`} inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} /></Field>
            <Button size="lg" onClick={() => open.mutate()} disabled={open.isPending}>Open shift</Button></div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between"><h2 className="text-xl font-medium">Shift open</h2><Badge tone="ok">OPEN</Badge></div>
            <p className="text-sm text-ink-soft">Since {fmtDateTime(s.openedAt)} by {s.openedByName}</p>
            <Row l="Opening cash" v={inr(s.openingPaise)} /><Row l="Cash sales" v={inr(cur.data.cashSalesPaise)} /><Row l="Cash refunds" v={`−${inr(cur.data.cashRefundsPaise)}`} />
            <div className="flex items-baseline justify-between border-t border-line pt-3"><span className="font-medium">Cash that should be in the drawer</span><span className="num text-3xl font-bold text-forest">{inr(cur.data.expectedPaise)}</span></div>
            <Button size="lg" variant="soft" onClick={() => setClosing(true)}>Close shift</Button>
          </div>
        )}
      </Card>
      <div>
        <h2 className="mb-3 text-lg font-medium">Past shifts</h2>
        {!hist.data?.sessions.filter((x) => x.status === 'CLOSED').length ? <Empty title="No closed shifts yet" /> : (
          <ul className="grid gap-2">{hist.data.sessions.filter((x) => x.status === 'CLOSED').map((x) => (
            <li key={x._id} className="rounded-[10px] border border-line bg-card p-4"><div className="flex justify-between"><p className="font-medium">{fmtDateTime(x.openedAt)}</p><Badge tone={x.differencePaise === 0 ? 'ok' : 'bad'}>{x.differencePaise === 0 ? 'Matched' : `${x.differencePaise > 0 ? 'Over' : 'Short'} ${inr(Math.abs(x.differencePaise))}`}</Badge></div><p className="num text-sm text-ink-soft">Expected {inr(x.expectedPaise)} · Counted {inr(x.countedPaise)}</p>{x.note && <p className="text-sm">{x.note}</p>}</li>))}</ul>
        )}
      </div>
      <Modal open={closing} onClose={() => setClosing(false)} title="Close shift">
        <div className="flex flex-col gap-4">
          <p className="text-ink-soft">Should be in the drawer: <b className="num text-ink">{s ? inr(cur.data.expectedPaise) : ''}</b></p>
          <Field label="Cash you counted (₹)"><input className={`${inputCls} num text-2xl`} inputMode="decimal" autoFocus value={counted} onChange={(e) => setCounted(e.target.value)} /></Field>
          {counted && diff !== 0 && <p className="rounded-lg bg-[#f7e3df] px-4 py-3 font-medium text-bad">{diff > 0 ? 'Over' : 'Short'} by <span className="num">{inr(Math.abs(diff))}</span>. Please write why.</p>}
          {counted && diff !== 0 && <input className={inputCls} placeholder="Reason" value={note} onChange={(e) => setNote(e.target.value)} />}
          <ErrorNote error={close.error} />
          <Button size="lg" disabled={!counted || close.isPending || (diff !== 0 && note.trim().length < 2)} onClick={() => close.mutate()}>Close shift</Button>
        </div>
      </Modal>
    </div>
  );
}
const Row = ({ l, v }: { l: string; v: string }) => <div className="flex justify-between"><span className="text-ink-soft">{l}</span><span className="num">{v}</span></div>;

function Expenses() {
  const t = useT();
  const qc = useQueryClient();
  const [range, setRange] = useState<'today' | '7d' | '30d'>('30d');
  const q = useQuery({ queryKey: ['expenses', range], queryFn: () => api<{ expenses: any[]; totalPaise: number }>(`/finance/expenses?range=${range}`) });
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<any>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const openEdit = (e: any) => {
    setF({ category: e.category, amount: String(e.amountPaise / 100), date: String(e.date).slice(0, 10), method: e.method, vendor: e.vendor ?? '', note: e.note ?? '' });
    setEditId(e._id);
    setOpen(true);
  };
  const rowActions = (e: any) => (
    <span className="inline-flex items-center justify-end gap-1.5">
      <IconButton label={t('Edit')} onClick={() => openEdit(e)}><PencilSimple size={16} /></IconButton>
      <IconButton label={t('Delete')} tone="danger" onClick={() => setDel(e)}><Trash size={16} /></IconButton>
    </span>
  );
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('ALL');
  const [method, setMethod] = useState('ALL');
  const [sort, setSort] = useState<Sort>({ key: 'date', dir: 'desc' });
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const dir = sort.dir === 'asc' ? 1 : -1;
    return (q.data?.expenses ?? [])
      .filter((e) => (cat === 'ALL' || e.category === cat) && (method === 'ALL' || e.method === method) && (!term || [e.category, e.vendor, e.note, e.createdByName].some((x) => (x ?? '').toLowerCase().includes(term))))
      .sort((a, b) => (sort.key === 'amount' ? a.amountPaise - b.amountPaise : String(a.date).localeCompare(String(b.date))) * dir);
  }, [q.data, search, cat, method, sort]);
  const paged = usePaged(rows, 10);
  const dirty = !!search || cat !== 'ALL' || method !== 'ALL';
  const reset = () => { setSearch(''); setCat('ALL'); setMethod('ALL'); paged.resetPage(); };
  const columns: Column<any>[] = [
    { key: 'date', header: 'Date', width: '115px', sortable: true, cell: (e) => <span className="num text-[13px] text-ink-soft">{String(e.date).slice(0, 10)}</span> },
    { key: 'category', header: 'Category', width: '140px', cell: (e) => <span className="font-medium">{e.category}</span> },
    { key: 'vendor', header: 'Vendor', width: '150px', cell: (e) => <span title={e.vendor}>{e.vendor || '–'}</span> },
    { key: 'method', header: 'Paid by', width: '95px', cell: (e) => e.method },
    { key: 'note', header: t('Notes'), cell: (e) => <span className="text-[13px] text-ink-soft" title={e.note}>{e.note || '–'}</span> },
    { key: 'by', header: 'Added by', width: '120px', cell: (e) => <span className="text-[13px] text-ink-soft">{e.createdByName}</span> },
    { key: 'amount', header: 'Amount', width: '115px', align: 'right', sortable: true, cell: (e) => <span className="num text-[15px] font-semibold">{inr(e.amountPaise, { short: true })}</span> },
    { key: 'actions', header: '', width: '112px', align: 'right', cell: (e) => rowActions(e) },
  ];
  const mobileRow = (e: any) => (
    <span className="flex items-center gap-3 p-4">
      <span className="min-w-0 flex-1"><span className="block font-medium">{e.category}{e.vendor ? ` · ${e.vendor}` : ''}</span><span className="block text-sm text-ink-soft">{String(e.date).slice(0, 10)} · {e.method} · {e.createdByName}{e.note ? ` · ${e.note}` : ''}</span></span>
      <span className="num text-xl font-bold">{inr(e.amountPaise, { short: true })}</span>
      {rowActions(e)}
    </span>
  );
  const [f, setF] = useState({ category: 'Ingredients', amount: '', date: new Date().toISOString().slice(0, 10), method: 'CASH', vendor: '', note: '' });
  const add = useMutation({
    mutationFn: () => {
      const body = { category: f.category, amountPaise: toPaise(f.amount), date: f.date, method: f.method, vendor: f.vendor || (editId ? '' : undefined), note: f.note || (editId ? '' : undefined) };
      return editId ? api(`/finance/expenses/${editId}`, { method: 'PUT', body }) : api('/finance/expenses', { body });
    },
    onSuccess: () => { setOpen(false); setEditId(null); setF({ ...f, amount: '', vendor: '', note: '' }); qc.invalidateQueries({ queryKey: ['expenses'] }); toast.ok('Saved'); }, onError: (e) => toast.error(errText(e)),
  });
  const rm = useMutation({ mutationFn: (id: string) => api(`/finance/expenses/${id}`, { method: 'DELETE' }), onSuccess: () => { setDel(null); qc.invalidateQueries({ queryKey: ['expenses'] }); }, onError: (e) => toast.error(errText(e)) });
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented value={range} onChange={setRange} options={[{ value: 'today', label: t('Today') }, { value: '7d', label: t('Last 7 days') }, { value: '30d', label: t('Last 30 days') }]} />
        <div className="flex items-center gap-4"><p className="text-ink-soft">Total <b className="num text-xl text-ink">{inr(q.data?.totalPaise ?? 0, { short: true })}</b></p><Button onClick={() => { setEditId(null); setF({ category: 'Ingredients', amount: '', date: new Date().toISOString().slice(0, 10), method: 'CASH', vendor: '', note: '' }); setOpen(true); }}><Plus size={20} />Add expense</Button></div>
      </div>
      {q.isLoading ? <Skeleton className="h-48" /> : q.error ? <ErrorNote error={q.error} /> : !q.data?.expenses.length ? <Empty title="No expenses in this period" hint="Record gas, salary, rent and other spending so the owner sees the real picture." />
      : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-card p-4">
            <SearchBox label={t('Search')} placeholder="Category, vendor, note" value={search} onChange={(v) => { setSearch(v); paged.resetPage(); }} className="grow basis-64" />
            <FilterSelect label="Category" value={cat} onChange={(v) => { setCat(v); paged.resetPage(); }} options={[{ value: 'ALL', label: t('All') }, ...CATS.map((c) => ({ value: c, label: c }))]} />
            <FilterSelect label="Paid by" value={method} onChange={(v) => { setMethod(v); paged.resetPage(); }} options={[{ value: 'ALL', label: t('All') }, ...['CASH', 'UPI', 'BANK', 'OTHER'].map((m) => ({ value: m, label: m }))]} />
            {dirty && <Button variant="ghost" onClick={reset}>{t('Reset filters')}</Button>}
            {dirty && <p className="ml-auto pb-2 text-sm text-ink-soft">{rows.length} · <b className="num text-ink">{inr(rows.reduce((a, e) => a + e.amountPaise, 0), { short: true })}</b></p>}
          </div>
          <DataTable
            columns={columns} rows={paged.slice} rowKey={(e) => e._id} sort={sort} onSort={(s) => { setSort(s); paged.resetPage(); }} mobileRow={mobileRow} minWidth={980}
            empty={<div><Empty title="No expenses match these filters" /><div className="mt-3 text-center"><Button variant="soft" onClick={reset}>{t('Reset filters')}</Button></div></div>}
            footer={<Pagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onPage={paged.setPage} onPageSize={paged.setPageSize} />}
          />
        </>
      )}
      <Modal open={open} onClose={() => { setOpen(false); setEditId(null); }} title={editId ? 'Edit expense' : 'Add expense'}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">{(CATS.includes(f.category) ? CATS : [...CATS, f.category]).map((c) => <button key={c} onClick={() => setF({ ...f, category: c })} aria-pressed={f.category === c} className={`press min-h-11 rounded-lg px-4 text-sm font-medium ring-1 ${f.category === c ? 'bg-forest text-white ring-forest' : 'ring-line'}`}>{c}</button>)}</div>
          <Field label="Amount (₹)"><input className={`${inputCls} num text-2xl`} inputMode="decimal" autoFocus value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Date"><input type="date" className={inputCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field><Field label="Paid by"><select className={inputCls} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{['CASH', 'UPI', 'BANK', 'OTHER'].map((m) => <option key={m}>{m}</option>)}</select></Field></div>
          <input className={inputCls} placeholder="Vendor (optional)" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} />
          <input className={inputCls} placeholder="Note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          <Button size="lg" disabled={!toPaise(f.amount || 0) || add.isPending} onClick={() => add.mutate()}>{t('Save')}</Button>
        </div>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title="Delete expense?" danger confirmLabel={t('Delete')} busy={rm.isPending} onConfirm={() => rm.mutate(del._id)} body={<p>{del?.category} · {del ? inr(del.amountPaise) : ''}. It stays in the audit history.</p>} />
    </div>
  );
}
