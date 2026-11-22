import TypePill from '../components/TypePill';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt } from '@phosphor-icons/react';
import { api, uid } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime, inr, toPaise } from '../lib/format';
import { useT } from '../lib/i18n';
import { Badge, Button, ConfirmDialog, Empty, ErrorNote, Modal, PageHead, Segmented, Skeleton, inputCls } from '../components/ui';
import BillModal from '../components/BillModal';
import { errText, toast } from '../lib/toast';

const statusTone = (s: string) => (s === 'CANCELLED' ? 'bad' : s === 'COMPLETED' ? 'info' : s === 'READY' ? 'ok' : 'warn') as 'ok' | 'warn' | 'bad' | 'info';

export default function Orders() {
  const t = useT();
  const [view, setView] = useState<'active' | 'today' | 'history'>('active');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['orders', view, date, search],
    queryFn: () => api<{ orders: any[] }>(`/orders?view=${view}${view === 'history' ? `&date=${date}` : ''}${search ? `&q=${encodeURIComponent(search)}` : ''}`),
  });
  return (
    <div>
      <PageHead title={t('Orders')} />
      <div className="mb-5 max-w-full overflow-x-auto"><Segmented value={view} onChange={setView} options={[{ value: 'active', label: t('Open orders') }, { value: 'today', label: t('Today') }, { value: 'history', label: t('History') }]} /></div>
      <div className="mb-4 flex flex-wrap gap-3">
        {view === 'history' && <input type="date" className={`${inputCls} max-w-52`} value={date} onChange={(e) => setDate(e.target.value)} />}
        <input className={`${inputCls} max-w-64`} placeholder="Bill number" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {q.isLoading ? <div className="grid gap-3 min-[768px]:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      : q.error ? <ErrorNote error={q.error} />
      : !q.data?.orders.length ? <Empty title="No orders here" hint="New orders appear as soon as they are confirmed." icon={<Receipt size={36} />} />
      : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {q.data.orders.map((o, i) => (
            <li key={o._id}>
              <button onClick={() => setOpen(o._id)} style={{ ['--i' as string]: Math.min(i, 12) }} className="press rise grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 text-left hover:bg-[#faf9f5] min-[900px]:grid-cols-[110px_130px_minmax(0,1fr)_170px_100px_150px] min-[900px]:gap-y-0">
                <span className="num text-[14px] font-semibold">{o.billNo ?? 'Draft'}</span>
                <span className="num text-right text-[16px] font-semibold min-[900px]:order-last">{inr(o.totalPaise, { short: true })}</span>
                <span className="min-[900px]:order-2"><TypePill type={o.type} table={o.tableLabel} /></span>
                <span className="col-span-2 truncate text-[13px] text-ink-soft min-[900px]:order-3 min-[900px]:col-span-1">{o.items.map((x: any) => `${x.qty} ${x.name}`).join(', ')}</span>
                <span className="col-span-2 flex flex-wrap items-center gap-2 min-[900px]:order-4 min-[900px]:col-span-1"><Badge tone={statusTone(o.status)}>{o.status.toLowerCase()}</Badge><Badge tone={o.paymentStatus === 'PAID' ? 'ok' : o.paymentStatus === 'UNPAID' ? 'bad' : 'warn'}>{o.paymentStatus.replace('_', ' ').toLowerCase()}</Badge><span className="num ml-auto text-[12px] text-ink-soft min-[900px]:hidden">{fmtDateTime(o.confirmedAt ?? o.createdAt)}</span></span>
                <span className="num hidden whitespace-nowrap text-right text-[13px] text-ink-soft min-[900px]:order-5 min-[900px]:block">{fmtDateTime(o.confirmedAt ?? o.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
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
