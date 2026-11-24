import TypePill from '../components/TypePill';
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt } from '@phosphor-icons/react';
import { api, uid } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime, inr, toPaise } from '../lib/format';
import { useT } from '../lib/i18n';
import { useDebounced } from '../lib/useDebounced';
import { Badge, Button, ConfirmDialog, Empty, ErrorNote, Modal, PageHead, Segmented, Skeleton, inputCls } from '../components/ui';
import { DataTable, FilterSelect, Pagination, SearchBox, type Column, type Sort } from '../components/DataTable';
import BillModal from '../components/BillModal';
import { errText, toast } from '../lib/toast';

const statusTone = (s: string) => (s === 'CANCELLED' ? 'bad' : s === 'COMPLETED' ? 'info' : s === 'READY' ? 'ok' : 'warn') as 'ok' | 'warn' | 'bad' | 'info';
const payTone = (s: string) => (s === 'PAID' ? 'ok' : s === 'UNPAID' ? 'bad' : 'warn') as 'ok' | 'warn' | 'bad';

type View = 'active' | 'today' | 'history';
interface OrderRow { _id: string; billNo?: string; type: string; tableLabel?: string; items: { qty: number; name: string }[]; status: string; paymentStatus: string; totalPaise: number; createdAt: string; confirmedAt?: string }
interface OrdersResponse { orders: OrderRow[]; total: number; page: number; pageSize: number; pages: number }
interface Filters { view: View; search: string; type: string; status: string; payment: string; from: string; to: string; sort: Sort; page: number; pageSize: number }

const dayStr = (back: number) => { const d = new Date(); d.setDate(d.getDate() - back); return d.toLocaleDateString('en-CA'); }; // YYYY-MM-DD, local
const initial = (): Filters => ({ view: 'active', search: '', type: 'ALL', status: 'ALL', payment: 'ALL', from: dayStr(6), to: dayStr(0), sort: { key: 'createdAt', dir: 'desc' }, page: 1, pageSize: 25 });
const itemsText = (o: OrderRow) => o.items.map((x) => `${x.qty} ${x.name}`).join(', ');

export default function Orders() {
  const t = useT();
  const [f, setF] = useState<Filters>(initial);
  const [open, setOpen] = useState<string | null>(null);
  // any filter change goes back to page 1
  const patch = (p: Partial<Filters>) => setF((s) => ({ ...s, page: 1, ...p }));
  const dSearch = useDebounced(f.search.trim(), 300);

  const params = new URLSearchParams({ view: f.view, page: String(f.page), pageSize: String(f.pageSize), sort: f.sort.key, dir: f.sort.dir });
  if (f.view === 'history') { params.set('from', f.from); params.set('to', f.to); }
  if (dSearch) params.set('q', dSearch);
  if (f.type !== 'ALL') params.set('type', f.type);
  if (f.status !== 'ALL') params.set('status', f.status);
  if (f.payment !== 'ALL') params.set('payment', f.payment);
  const q = useQuery({ queryKey: ['orders', params.toString()], queryFn: () => api<OrdersResponse>(`/orders?${params.toString()}`), placeholderData: keepPreviousData });

  const dirty = !!f.search || f.type !== 'ALL' || f.status !== 'ALL' || f.payment !== 'ALL';
  const reset = () => setF((s) => ({ ...initial(), view: s.view, pageSize: s.pageSize, from: s.from, to: s.to }));

  const all = { value: 'ALL', label: t('All') };
  const statusKeys: string[] = ['CONFIRMED', 'PREPARING', 'READY', ...(f.view === 'active' ? [] : ['COMPLETED', 'CANCELLED']), 'DRAFT'];
  const statusOpts = [all, ...statusKeys.map((s) => ({ value: s, label: t(s.charAt(0) + s.slice(1).toLowerCase()) }))];
  const typeOpts = [all, { value: 'DINE_IN', label: t('Eat here') }, { value: 'TAKEAWAY', label: t('Takeaway') }, { value: 'PARCEL', label: t('Parcel') }];
  const payOpts = [all, { value: 'PAID', label: t('Paid') }, { value: 'UNPAID', label: t('Unpaid') }, { value: 'PARTIALLY_PAID', label: t('Partly paid') }, { value: 'REFUNDED', label: t('Refunded') }];
  const presets = [
    { label: t('Today'), from: dayStr(0), to: dayStr(0) }, { label: t('Yesterday'), from: dayStr(1), to: dayStr(1) },
    { label: t('Last 7 days'), from: dayStr(6), to: dayStr(0) }, { label: t('Last 30 days'), from: dayStr(29), to: dayStr(0) },
  ];

  const columns: Column<OrderRow>[] = [
    { key: 'billNo', header: t('Bill no'), width: '155px', sortable: true, firstDir: 'asc', cell: (o) => <span className="num text-[14px] font-semibold">{o.billNo ?? 'Draft'}</span> },
    { key: 'type', header: t('Type'), width: '125px', cell: (o) => <TypePill type={o.type} table={o.tableLabel} /> },
    { key: 'items', header: t('Items'), cell: (o) => <span className="text-[13px] text-ink-soft" title={itemsText(o)}>{itemsText(o)}</span> },
    { key: 'status', header: t('Status'), width: '110px', cell: (o) => <Badge tone={statusTone(o.status)}>{o.status.toLowerCase()}</Badge> },
    { key: 'payment', header: t('Payment'), width: '115px', cell: (o) => <Badge tone={payTone(o.paymentStatus)}>{o.paymentStatus.replace('_', ' ').toLowerCase()}</Badge> },
    { key: 'createdAt', header: t('Date & time'), width: '140px', sortable: true, cell: (o) => <span className="num text-[13px] text-ink-soft">{fmtDateTime(o.confirmedAt ?? o.createdAt)}</span> },
    { key: 'totalPaise', header: t('Total'), width: '105px', align: 'right', sortable: true, cell: (o) => <span className="num text-[15px] font-semibold">{inr(o.totalPaise, { short: true })}</span> },
  ];

  const mobileRow = (o: OrderRow) => (
    <span className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5">
      <span className="num text-[14px] font-semibold">{o.billNo ?? 'Draft'}</span>
      <span className="num text-right text-[16px] font-semibold">{inr(o.totalPaise, { short: true })}</span>
      <span className="col-span-2"><TypePill type={o.type} table={o.tableLabel} /></span>
      <span className="col-span-2 truncate text-[13px] text-ink-soft">{itemsText(o)}</span>
      <span className="col-span-2 flex flex-wrap items-center gap-2">
        <Badge tone={statusTone(o.status)}>{o.status.toLowerCase()}</Badge><Badge tone={payTone(o.paymentStatus)}>{o.paymentStatus.replace('_', ' ').toLowerCase()}</Badge>
        <span className="num ml-auto text-[12px] text-ink-soft">{fmtDateTime(o.confirmedAt ?? o.createdAt)}</span>
      </span>
    </span>
  );

  return (
    <div>
      <PageHead title={t('Orders')} />
      <div className="mb-4 max-w-full overflow-x-auto"><Segmented value={f.view} onChange={(v) => patch({ view: v, status: 'ALL' })} options={[{ value: 'active', label: t('Open orders') }, { value: 'today', label: t('Today') }, { value: 'history', label: t('History') }]} /></div>

      <div className="mb-4 rounded-xl border border-line bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <SearchBox label={t('Search')} placeholder="Bill no, customer, phone, item" value={f.search} onChange={(v) => patch({ search: v })} className="grow basis-64" />
          <FilterSelect label={t('Type')} value={f.type} onChange={(v) => patch({ type: v })} options={typeOpts} />
          <FilterSelect label={t('Status')} value={f.status} onChange={(v) => patch({ status: v })} options={statusOpts} />
          <FilterSelect label={t('Payment')} value={f.payment} onChange={(v) => patch({ payment: v })} options={payOpts} />
          {dirty && <Button variant="ghost" onClick={reset}>{t('Reset filters')}</Button>}
        </div>
        {f.view === 'history' && (
          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3">
            <label className="flex flex-col gap-1"><span className="text-[12px] font-medium text-ink-soft">{t('From')}</span><input type="date" className={`${inputCls} w-44`} value={f.from} max={f.to} onChange={(e) => e.target.value && patch({ from: e.target.value })} /></label>
            <label className="flex flex-col gap-1"><span className="text-[12px] font-medium text-ink-soft">{t('To')}</span><input type="date" className={`${inputCls} w-44`} value={f.to} min={f.from} max={dayStr(0)} onChange={(e) => e.target.value && patch({ to: e.target.value })} /></label>
            <div className="flex flex-wrap gap-1.5 pb-0.5">
              {presets.map((p) => {
                const on = f.from === p.from && f.to === p.to;
                return <button key={p.label} type="button" aria-pressed={on} onClick={() => patch({ from: p.from, to: p.to })} className={`press min-h-9 rounded-lg px-3 text-[13px] font-medium ${on ? 'bg-ink text-white' : 'bg-black/[0.045] text-ink hover:bg-black/[0.075]'}`}>{p.label}</button>;
              })}
            </div>
          </div>
        )}
      </div>

      {q.error ? <ErrorNote error={q.error} /> : (
        <DataTable
          columns={columns} rows={q.data?.orders ?? []} rowKey={(o) => o._id} onRowClick={(o) => setOpen(o._id)}
          sort={f.sort} onSort={(s) => patch({ sort: s })} mobileRow={mobileRow} minWidth={900}
          loading={q.isPending} dim={q.isPlaceholderData}
          empty={dirty
            ? <div><Empty title={t('No orders match these filters')} icon={<Receipt size={36} />} /><div className="mt-3 text-center"><Button variant="soft" onClick={reset}>{t('Reset filters')}</Button></div></div>
            : <Empty title="No orders here" hint="New orders appear as soon as they are confirmed." icon={<Receipt size={36} />} />}
          footer={q.data ? <Pagination page={q.data.page} pageSize={f.pageSize} total={q.data.total} onPage={(p) => patch({ page: p })} onPageSize={(n) => patch({ pageSize: n })} /> : undefined}
        />
      )}
      {open && <OrderDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function OrderDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT();
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['order', id], queryFn: () => api<any>(`/orders/${id}`) });
  const [bill, setBill] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [refund, setRefund] = useState(false);
  const [reason, setReason] = useState('');
  const [amt, setAmt] = useState('');
  const [method, setMethod] = useState<'CASH' | 'UPI'>('CASH');
  const refundKey = useState(uid)[0];
  const done = () => { qc.invalidateQueries(); };

  const reprint = useMutation({
    mutationFn: (kind: 'BILL' | 'KOT') => api(`/orders/${id}/reprint`, { body: { kind } }),
    onSuccess: () => { toast.ok(t('Printing...')); done(); }, onError: (e) => toast.error(errText(e)),
  });
  const doCancel = useMutation({
    mutationFn: () => api(`/orders/${id}/cancel`, { body: { reason } }),
    onSuccess: () => { toast.ok('Order cancelled'); setCancel(false); done(); }, onError: (e) => toast.error(errText(e)),
  });
  const complete = useMutation({
    mutationFn: () => api(`/orders/${id}/complete`, { method: 'POST', body: {} }),
    onSuccess: () => { toast.ok(t('Done')); done(); }, onError: (e) => toast.error(errText(e)),
  });
  const doRefund = useMutation({
    mutationFn: () => api(`/orders/${id}/refunds`, { body: { idempotencyKey: refundKey, method, amountPaise: toPaise(amt), reason } }),
    onSuccess: () => { toast.ok('Refund recorded'); setRefund(false); done(); }, onError: (e) => toast.error(errText(e)),
  });

  const o = q.data?.order;
  if (bill) return <BillModal orderId={id} onDone={() => { setBill(false); }} />;
  return (
    <Modal open onClose={onClose} title={o ? `Bill ${o.billNo ?? '(draft)'}` : '...'} wide>
      {!o ? <Skeleton className="h-40" /> : (
        <div className="grid gap-6 min-[768px]:grid-cols-2">
          <div>
            <div className="mb-3 flex flex-wrap gap-2"><Badge tone={statusTone(o.status)}>{o.status}</Badge><Badge tone={o.paymentStatus === 'PAID' ? 'ok' : 'warn'}>{o.paymentStatus.replace('_', ' ')}</Badge></div>
            <ul className="divide-y divide-line rounded-[10px] border border-line">
              {o.items.map((i: any) => <li key={i._id} className="flex justify-between px-4 py-3"><span><b className="num">{i.qty}</b> × {i.name}{i.note && <em className="block text-sm text-warn not-italic">{i.note}</em>}</span><span className="num">{inr(i.unitPricePaise * i.qty)}</span></li>)}
              <li className="flex justify-between px-4 py-3 font-bold"><span>{t('Total')}</span><span className="num">{inr(o.totalPaise)}</span></li>
            </ul>
            {q.data.payments.length > 0 && <div className="mt-4 text-sm"><p className="mb-1 font-medium">Payments</p>{q.data.payments.map((p: any) => <p key={p._id} className="flex justify-between text-ink-soft"><span>{p.method} · {p.byName} · {fmtDateTime(p.createdAt)}</span><span className="num">{inr(p.amountPaise)}</span></p>)}</div>}
            {q.data.refunds.length > 0 && <div className="mt-3 text-sm"><p className="mb-1 font-medium">Refunds</p>{q.data.refunds.map((p: any) => <p key={p._id} className="flex justify-between text-bad"><span>{p.method} · {p.reason}</span><span className="num">−{inr(p.amountPaise)}</span></p>)}</div>}
            {o.cancelReason && <p className="mt-3 text-sm text-bad">Cancelled: {o.cancelReason}</p>}
          </div>
          <div className="flex flex-col gap-2">
            {o.status !== 'CANCELLED' && o.status !== 'DRAFT' && <Button onClick={() => setBill(true)}>{o.duePaise > 0 ? t('Record Payment') : t('Print Bill')}</Button>}
            {o.billNo && can('bills.reprint') && <Button variant="soft" onClick={() => reprint.mutate('BILL')} disabled={reprint.isPending}>{t('Reprint (copy)')}</Button>}
            {o.billNo && can('kot.reprint') && <Button variant="ghost" onClick={() => reprint.mutate('KOT')} disabled={reprint.isPending}>Reprint kitchen ticket</Button>}
            {o.paymentStatus === 'PAID' && can('orders.complete') && !['COMPLETED', 'CANCELLED'].includes(o.status) && <Button variant="soft" onClick={() => complete.mutate()} disabled={complete.isPending}>{t('Mark order complete')}</Button>}
            {can('orders.refund') && o.paidPaise - o.refundedPaise > 0 && <Button variant="ghost" onClick={() => { setAmt(String((o.paidPaise - o.refundedPaise) / 100)); setReason(''); setRefund(true); }}>{t('Refund')}</Button>}
            {can('orders.cancel') && !['COMPLETED', 'CANCELLED'].includes(o.status) && <Button variant="danger" onClick={() => { setReason(''); setCancel(true); }}>{t('Cancel order')}</Button>}
            <div className="mt-2 text-xs text-ink-soft">
              {q.data.printJobs.map((j: any) => <p key={j._id}>{j.kind}{j.isCopy ? ' (copy)' : ''}: {j.status}{j.lastError ? ` - ${j.lastError}` : ''}</p>)}
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog open={cancel} onClose={() => setCancel(false)} title={t('Cancel order')} danger confirmLabel={t('Cancel order')} busy={doCancel.isPending || reason.trim().length < 2} onConfirm={() => doCancel.mutate()}
        body={<><p className="mb-3">This cannot be undone. Please say why.</p><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('Reason')} /></>} />
      <ConfirmDialog open={refund} onClose={() => setRefund(false)} title={t('Refund')} danger confirmLabel={t('Refund')} busy={doRefund.isPending || reason.trim().length < 2 || !amt} onConfirm={() => doRefund.mutate()}
        body={<div className="flex flex-col gap-3"><input className={`${inputCls} num`} inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
          <div className="flex gap-2">{(['CASH', 'UPI'] as const).map((m) => <button key={m} onClick={() => setMethod(m)} aria-pressed={method === m} className={`press min-h-11 flex-1 rounded-lg text-sm font-bold ring-1 ${method === m ? 'bg-forest text-white ring-forest' : 'ring-line'}`}>{m}</button>)}</div>
          <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('Reason')} /></div>} />
    </Modal>
  );
}
