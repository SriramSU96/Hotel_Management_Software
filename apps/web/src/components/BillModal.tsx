import TypePill from './TypePill';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowsClockwise, CheckCircle, Copy, DeviceMobile, Printer, QrCode, WarningCircle, WhatsappLogo } from '@phosphor-icons/react';
import QRCode from 'qrcode';
import { api, uid } from '../lib/api';
import { fmtTime, inr, toPaise } from '../lib/format';
import { useT } from '../lib/i18n';
import { Badge, Button, ErrorNote, Modal, inputCls } from './ui';
import { errText, toast } from '../lib/toast';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/queries';
import { printReceipt } from '../lib/printing';

/**
 * Shown right after an order is confirmed. Printing and payment are separate steps:
 * a printer problem never blocks or repeats the sale.
 */
export default function BillModal({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const t = useT();
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api<any>(`/orders/${orderId}`),
    refetchInterval: (query) => {
      const jobs: any[] = (query.state.data as any)?.printJobs ?? [];
      const bill = jobs.find((j) => j.kind === 'BILL' && !j.isCopy);
      return bill && ['QUEUED', 'PRINTING'].includes(bill.status) ? 1500 : false;
    },
  });
  const order = q.data?.order;
  const jobs: any[] = q.data?.printJobs ?? [];
  const bill = jobs.find((j) => j.kind === 'BILL' && !j.isCopy);
  const [waited, setWaited] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const browserMode = useSettings().data?.settings.printerConnection === 'BROWSER'; // printing from this computer's own print window
  const [printedLocal, setPrintedLocal] = useState(0);
  const printNow = (kind: 'BILL' | 'KOT' = 'BILL') => printReceipt(orderId, kind, kind === 'BILL' && printedLocal > 0).then(() => kind === 'BILL' && setPrintedLocal((n) => n + 1)).catch((e) => toast.error(errText(e)));

  useEffect(() => { const id = setTimeout(() => setWaited(true), 10_000); return () => clearTimeout(id); }, []);

  const state: 'printing' | 'printed' | 'sent' | 'failed' | 'skipped' | 'browser' =
    browserMode ? 'browser'
    : order?.paperCopy === 'NOT_PRINTED' ? 'skipped'
    : bill?.status === 'PRINTED' ? 'printed'
    : bill?.status === 'SENT' ? 'sent'
    : bill?.status === 'FAILED' || bill?.status === 'CANCELLED' || (waited && bill && ['QUEUED', 'PRINTING'].includes(bill.status)) ? 'failed'
    : 'printing';

  const retry = useMutation({
    mutationFn: () => api(`/printing/jobs/${bill._id}/retry`, { method: 'POST', body: {} }),
    onSuccess: () => { setWaited(false); setTimeout(() => setWaited(true), 10_000); qc.invalidateQueries({ queryKey: ['order', orderId] }); toast.info(t('Printing...')); },
    onError: (e) => toast.error(errText(e)),
  });
  const skip = useMutation({
    mutationFn: () => api(`/orders/${orderId}/paper-copy`, { body: { value: 'NOT_PRINTED' } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['order', orderId] }),
    onError: (e) => toast.error(errText(e)),
  });
  const complete = useMutation({
    mutationFn: () => api(`/orders/${orderId}/complete`, { method: 'POST', body: {} }),
    onSuccess: () => { qc.invalidateQueries(); toast.ok(t('Done')); onDone(); },
    onError: (e) => toast.error(errText(e)),
  });

  if (!order) return <Modal open onClose={() => {}} title="..."><p className="text-ink-soft">Loading...</p></Modal>;
  const due = order.totalPaise - order.paidPaise;

  return (
    <Modal open onClose={onDone} title={`Bill ${order.billNo ?? ''}`} wide>
      <div className="grid gap-6 min-[768px]:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between rounded-[10px] bg-forest px-6 py-5 text-white">
            <div>
              <div className="mb-1"><TypePill type={order.type} table={order.tableLabel} /></div>
              <p className="num text-4xl font-bold">{inr(order.totalPaise)}</p>
            </div>
            <Badge tone={order.paymentStatus === 'PAID' ? 'ok' : order.paymentStatus === 'PARTIALLY_PAID' ? 'warn' : 'bad'}>
              {order.paymentStatus === 'PAID' ? t('Paid') : order.paymentStatus === 'PARTIALLY_PAID' ? t('Partly paid') : t('Unpaid')}
            </Badge>
          </div>

          {/* Print status */}
          {state === 'browser' && (
            <div className="grid gap-2">
              <Button size="lg" onClick={() => printNow('BILL')}><Printer size={22} />{printedLocal ? 'Print bill again (copy)' : 'Print bill'}</Button>
              <Button variant="ghost" onClick={() => printNow('KOT')}>Print kitchen ticket</Button>
            </div>
          )}
          {state === 'printing' && <Status icon={<Printer size={26} className="pulse-dot" />} tone="info" title={t('Printing...')} />}
          {state === 'printed' && <Status icon={<CheckCircle size={26} weight="fill" />} tone="ok" title={t('Bill printed')} />}
          {state === 'sent' && <Status icon={<CheckCircle size={26} />} tone="ok" title={t('Sent to printer')} sub="Printer did not confirm. Check paper." />}
          {state === 'skipped' && <Status icon={<WarningCircle size={26} />} tone="warn" title="No paper copy for this bill" sub="Marked as not printed." />}
          {state === 'failed' && (
            <div className="rounded-[10px] bg-gold-soft p-4">
              <div className="flex items-start gap-3 text-warn">
                <WarningCircle size={28} weight="fill" className="mt-0.5 shrink-0" />
                <div>
                  <p className="text-lg font-bold">{t('Bill saved. Printer is not responding.')}</p>
                  {bill?.lastError && <p className="text-sm">{bill.lastError}</p>}
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                <Button onClick={() => retry.mutate()} disabled={retry.isPending || !bill}><ArrowsClockwise size={20} />{t('Retry Print')}</Button>
                <Button variant="soft" onClick={() => printNow('BILL')}><Printer size={20} />Print from this computer</Button>
                <Button variant="soft" onClick={() => setShowReceipt(true)}><QrCode size={20} />{t('Digital Receipt')}</Button>
                <Button variant="ghost" onClick={() => skip.mutate()} disabled={skip.isPending}>{t('Continue Without Printing')}</Button>
              </div>
              <p className="mt-3 text-xs text-ink-soft">Order is saved. It prints when the printer is back.</p>
            </div>
          )}
          {state !== 'failed' && (
            <button onClick={() => setShowReceipt(true)} className="press inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-forest underline underline-offset-4"><DeviceMobile size={18} />{t('Digital Receipt')}</button>
          )}

          <ul className="divide-y divide-line rounded-[10px] border border-line">
            {order.items.map((i: any) => (
              <li key={i._id} className="flex justify-between gap-3 px-4 py-3 text-[15px]"><span><span className="num font-bold">{i.qty}</span> × {i.name}{i.note && <em className="block text-sm text-warn not-italic">{i.note}</em>}</span><span className="num">{inr(i.unitPricePaise * i.qty)}</span></li>
            ))}
          </ul>
        </div>

        <div>
          {due > 0 ? <PaymentForm order={order} due={due} canPay={can('payments.record')} /> : (
            <div className="rounded-[10px] bg-forest-soft p-6 text-forest">
              <CheckCircle size={40} weight="fill" />
              <p className="mt-2 text-xl font-bold">{t('Paid')}</p>
              <p className="num text-sm">{inr(order.paidPaise)}</p>
            </div>
          )}
          <div className="mt-6 flex flex-col gap-2">
            {order.paymentStatus === 'PAID' && can('orders.complete') && order.status !== 'COMPLETED' && (
              <Button variant="soft" onClick={() => complete.mutate()} disabled={complete.isPending}>{t('Mark order complete')}</Button>
            )}
            <Button variant={due > 0 ? 'ghost' : 'primary'} size="lg" onClick={onDone}>{due > 0 ? 'Pay later' : t('Start next order')}</Button>
          </div>
        </div>
      </div>
      <ReceiptModal open={showReceipt} onClose={() => setShowReceipt(false)} token={order.receiptToken} billNo={order.billNo} orderId={order._id} />
    </Modal>
  );
}

function Status({ icon, tone, title, sub }: { icon: React.ReactNode; tone: 'ok' | 'info' | 'warn'; title: string; sub?: string }) {
  const c = tone === 'ok' ? 'bg-forest-soft text-forest' : tone === 'warn' ? 'bg-gold-soft text-warn' : 'bg-black/5 text-ink';
  return (
    <div role="status" className={`flex items-center gap-3 rounded-[10px] px-4 py-3 ${c}`}>{icon}<div><p className="font-bold">{title}</p>{sub && <p className="text-sm opacity-80">{sub}</p>}</div></div>
  );
}

function PaymentForm({ order, due, canPay }: { order: any; due: number; canPay: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const [method, setMethod] = useState<'CASH' | 'UPI'>('CASH');
  const [given, setGiven] = useState('');
  const [verified, setVerified] = useState(false);
  const [ref, setRef] = useState('');
  // a new key per payment attempt; reused on retry so a double tap cannot take the money twice
  const key = useRef(uid());

  const pay = useMutation({
    mutationFn: () => api(`/orders/${order._id}/payments`, {
      body: {
        idempotencyKey: key.current, method, amountPaise: due,
        tenderedPaise: method === 'CASH' && given ? toPaise(given) : undefined,
        upiVerified: method === 'UPI' ? verified : undefined, upiRef: ref || undefined,
      },
    }),
    onSuccess: () => { key.current = uid(); setGiven(''); setVerified(false); setRef(''); qc.invalidateQueries({ queryKey: ['order', order._id] }); qc.invalidateQueries({ queryKey: ['orders'] }); toast.ok(t('Paid')); },
    onError: (e) => toast.error(errText(e)),
  });

  if (!canPay) return <p className="rounded-[10px] bg-black/5 p-5 text-ink-soft">Payment is taken by the cashier.</p>;
  const change = method === 'CASH' && given ? toPaise(given) - due : null;
  const quick = [due, Math.ceil(due / 5000) * 5000, Math.ceil(due / 10000) * 10000, 50000].filter((v, i, a) => v >= due && a.indexOf(v) === i).slice(0, 4);

  return (
    <div className="flex flex-col gap-4">
      <div className="inline-flex self-start rounded-lg bg-black/5 p-1">
        {(['CASH', 'UPI'] as const).map((m) => (
          <button key={m} onClick={() => setMethod(m)} aria-pressed={method === m} className={`press min-h-12 rounded-lg px-6 text-base font-bold ${method === m ? 'bg-forest text-white shadow-soft' : 'text-ink-soft'}`}>{t(m === 'CASH' ? 'Cash' : 'UPI')}</button>
        ))}
      </div>
      <p className="text-sm text-ink-soft">{t('Total')}: <span className="num text-lg font-bold text-ink">{inr(due)}</span></p>

      {method === 'CASH' ? (
        <>
          <label className="flex flex-col gap-2 text-sm font-medium">{t('Amount received')}
            <input className={`${inputCls} num text-2xl`} inputMode="decimal" value={given} onChange={(e) => setGiven(e.target.value)} placeholder={String(due / 100)} />
          </label>
          <div className="flex flex-wrap gap-2">{quick.map((v) => <button key={v} onClick={() => setGiven(String(v / 100))} className="press num min-h-12 rounded-lg px-5 text-base font-medium ring-1 ring-line hover:bg-forest-soft">{inr(v, { short: true, symbol: false })}</button>)}</div>
          {change !== null && (change >= 0
            ? <p className="rounded-lg bg-forest-soft px-4 py-3 font-medium text-forest">{t('Change to give')}: <span className="num text-xl font-bold">{inr(change)}</span></p>
            : <p className="rounded-lg bg-[#f7e3df] px-4 py-3 font-medium text-bad">Short by <span className="num font-bold">{inr(-change)}</span></p>)}
        </>
      ) : (
        <>
          <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border border-line bg-white p-4">
            <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="mt-1 h-6 w-6 accent-[#1f3d2e]" />
            <span className="font-medium">{t('I have seen the money in the UPI app')}</span>
          </label>
          <input className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="UPI reference (last 4-6 digits, optional)" maxLength={40} />
        </>
      )}
      <ErrorNote error={pay.error} />
      <Button size="lg" onClick={() => pay.mutate()} disabled={pay.isPending || (method === 'UPI' && !verified) || (method === 'CASH' && change !== null && change < 0)}>{t('Record Payment')}</Button>
    </div>
  );
}

export function ReceiptModal({ open, onClose, token, billNo, orderId }: { open: boolean; onClose: () => void; token?: string; billNo?: string; orderId?: string }) {
  const [img, setImg] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const cfg = useSettings();
  const digits = phone.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  const phoneOk = /^[6-9]\d{9}$/.test(digits);
  const url = token ? `${location.origin}/r/${token}` : '';
  useEffect(() => { if (open && url) QRCode.toDataURL(url, { margin: 1, width: 280 }).then(setImg).catch(() => setImg('')); }, [open, url]);
  return (
    <Modal open={open} onClose={onClose} title="Digital receipt">
      <p className="mb-4 text-sm text-ink-soft">Customer scans this, or send on WhatsApp.</p>
      {img && <img src={img} alt="Receipt QR code" className="mx-auto h-56 w-56 rounded-lg border border-line bg-white p-2" />}
      <p className="mt-3 break-all rounded-lg bg-black/5 p-3 text-xs">{url}</p>
      <label htmlFor="wa" className="mt-4 block text-[12px] font-bold text-[#747b70]">Customer WhatsApp number</label>
      <input id="wa" inputMode="tel" autoComplete="off" className={`${inputCls} num mt-2 min-h-12`} placeholder="10-digit mobile" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <Button variant="whatsapp" className="mt-3 w-full" disabled={!phoneOk || !url || !orderId || sending} onClick={async () => {
        const w = window.open('', '_blank'); // opened first so the browser does not block it
        setSending(true);
        try {
          await api(`/bills/${orderId}/digital-sent`, { method: 'POST', body: { channel: 'WHATSAPP', phone: digits } }); // the system remembers it sent this bill
          const st = cfg.data?.settings;
          const msg = (st?.billMessage || 'Bill {bill}\n{link}').replaceAll('{shop}', st?.restaurantName ?? '').replaceAll('{bill}', billNo ?? '').replaceAll('{link}', url);
          const wa = `https://wa.me/91${digits}?text=${encodeURIComponent(msg)}`;
          if (w) w.location.href = wa; else window.location.href = wa;
          toast.ok('Bill recorded as sent');
        } catch (e) { w?.close(); toast.error(errText(e)); } finally { setSending(false); }
      }}><WhatsappLogo size={20} weight="fill" />{sending ? '...' : 'Send bill on WhatsApp'}</Button>
      <div className="mt-4 flex gap-3">
        <Button variant="ghost" className="flex-1" onClick={() => { navigator.clipboard?.writeText(url).then(() => toast.ok('Link copied')).catch(() => toast.error('Could not copy')); }}><Copy size={18} />Copy link</Button>
        {typeof navigator.share === 'function' && <Button className="flex-1" onClick={() => navigator.share({ title: 'AMMAS receipt', url }).catch(() => {})}>Share</Button>}
      </div>
      <p className="mt-3 text-xs text-ink-soft">Opened at {fmtTime(new Date())}</p>
    </Modal>
  );
}
