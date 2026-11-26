import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, uid } from '../lib/api';
import { useAuth } from '../lib/auth';
import { inr, toPaise, fmtDateTime } from '../lib/format';
import { errText, toast } from '../lib/toast';
import { C } from '../theme';
import { Badge, Btn, Chip, ErrorNote, Input, Sheet, Skeleton } from './ui';

export const typeLabel = (type: string, table?: string | null) =>
  type === 'DINE_IN' ? (table ? `Table ${table}` : 'Eat here') : type === 'PARCEL' ? 'Parcel' : 'Takeaway';
export const payLabel = (s: string) => (s === 'PAID' ? 'Paid' : s === 'PARTIALLY_PAID' ? 'Partly paid' : s === 'UNPAID' ? 'Unpaid' : s.replace('_', ' ').toLowerCase());
export const payTone = (s: string) => (s === 'PAID' ? 'ok' : s === 'UNPAID' ? 'bad' : 'warn') as 'ok' | 'bad' | 'warn';
export const statusTone = (s: string) => (s === 'CANCELLED' ? 'bad' : s === 'COMPLETED' ? 'info' : s === 'READY' ? 'ok' : 'warn') as 'ok' | 'warn' | 'bad' | 'info';

/**
 * One order: items, print state, payment, complete / cancel. Opened right after an order is confirmed
 * and from the Orders list. Printing and payment stay separate: a printer problem never blocks or repeats the sale.
 */
export default function OrderSheet({ orderId, onClose }: { orderId: string; onClose: () => void }) {
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
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const refresh = () => qc.invalidateQueries();

  const order = q.data?.order;
  const jobs: any[] = q.data?.printJobs ?? [];
  const bill = jobs.find((j) => j.kind === 'BILL' && !j.isCopy);

  const retry = useMutation({
    mutationFn: () => api(`/printing/jobs/${bill._id}/retry`, { method: 'POST', body: {} }),
    onSuccess: () => { toast.info('Printing...'); refresh(); }, onError: (e) => toast.error(errText(e)),
  });
  const complete = useMutation({
    mutationFn: () => api(`/orders/${orderId}/complete`, { method: 'POST', body: {} }),
    onSuccess: () => { toast.ok('Order completed'); refresh(); }, onError: (e) => toast.error(errText(e)),
  });
  const cancel = useMutation({
    mutationFn: () => api(`/orders/${orderId}/cancel`, { body: { reason: reason.trim() } }),
    onSuccess: () => { toast.ok('Order cancelled'); setCancelling(false); refresh(); }, onError: (e) => toast.error(errText(e)),
  });

  const due = order ? order.totalPaise - order.paidPaise : 0;
  const open = order && !['COMPLETED', 'CANCELLED'].includes(order.status);

  return (
    <Sheet open onClose={onClose} title={order ? `Bill ${order.billNo ?? '(draft)'}` : '...'} wide>
      {!order ? (q.error ? <ErrorNote error={q.error} /> : <Skeleton height={160} />) : (
        <>
          <View style={{ backgroundColor: C.forest, borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View>
              <Text style={{ color: '#d6e4da', fontWeight: '600' }}>{typeLabel(order.type, order.tableLabel)}</Text>
              <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800' }}>{inr(order.totalPaise)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Badge text={payLabel(order.paymentStatus)} tone={payTone(order.paymentStatus)} />
              <Badge text={order.status.toLowerCase()} tone={statusTone(order.status)} />
            </View>
          </View>

          {bill && (
            <View style={{ backgroundColor: bill.status === 'FAILED' ? C.goldSoft : C.forestSoft, borderRadius: 10, padding: 12, gap: 8 }}>
              <Text style={{ fontWeight: '700', color: bill.status === 'FAILED' ? '#8a5a0b' : C.forest }}>
                {bill.status === 'PRINTED' ? 'Bill printed' : bill.status === 'SENT' ? 'Sent to printer (check paper)' : bill.status === 'FAILED' ? 'Bill saved. Printer is not responding.' : bill.status === 'CANCELLED' ? 'Print cancelled' : 'Printing...'}
              </Text>
              {bill.status === 'FAILED' && bill.lastError ? <Text style={{ color: '#8a5a0b' }}>{bill.lastError}</Text> : null}
              {bill.status === 'FAILED' ? <Btn title="Retry print" variant="soft" onPress={() => retry.mutate()} busy={retry.isPending} /> : null}
            </View>
          )}

          <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10 }}>
            {order.items.map((i: any, idx: number) => (
              <View key={i._id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, padding: 12, borderTopWidth: idx === 0 ? 0 : 1, borderColor: C.line }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, color: C.ink }}><Text style={{ fontWeight: '800' }}>{i.qty}</Text> {'\u00d7'} {i.name}</Text>
                  {i.note ? <Text style={{ color: '#8a5a0b', marginTop: 2 }}>{i.note}</Text> : null}
                </View>
                <Text style={{ fontSize: 15, color: C.ink }}>{inr(i.unitPricePaise * i.qty)}</Text>
              </View>
            ))}
          </View>

          {q.data.payments?.length > 0 && (
            <View style={{ gap: 4 }}>
              <Text style={{ fontWeight: '700', color: C.ink }}>Payments</Text>
              {q.data.payments.map((p: any) => (
                <View key={p._id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ color: C.soft, flex: 1 }}>{p.method} {'\u00b7'} {p.byName} {'\u00b7'} {fmtDateTime(p.createdAt)}</Text>
                  <Text style={{ color: C.ink }}>{inr(p.amountPaise)}</Text>
                </View>
              ))}
            </View>
          )}
          {order.cancelReason ? <Text style={{ color: C.bad }}>Cancelled: {order.cancelReason}</Text> : null}

          {due > 0 && order.status !== 'CANCELLED' && <PayForm orderId={orderId} due={due} canPay={can('payments.record')} onPaid={() => { refresh(); onClose(); }} />}

          {can('orders.complete') && order.paymentStatus === 'PAID' && open ? <Btn title="Mark order complete" variant="soft" onPress={() => complete.mutate()} busy={complete.isPending} /> : null}

          {can('orders.cancel') && open ? (
            cancelling ? (
              <View style={{ gap: 8, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12 }}>
                <Text style={{ color: C.soft }}>This cannot be undone. Please say why.</Text>
                <Input value={reason} onChangeText={setReason} placeholder="Reason" autoCapitalize="sentences" />
                <ErrorNote error={cancel.error} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn title="Back" variant="ghost" onPress={() => setCancelling(false)} style={{ flex: 1 }} />
                  <Btn title="Cancel order" variant="danger" onPress={() => cancel.mutate()} busy={cancel.isPending} disabled={reason.trim().length < 2} style={{ flex: 1 }} />
                </View>
              </View>
            ) : <Btn title="Cancel order" variant="ghost" onPress={() => { setReason(''); setCancelling(true); }} />
          ) : null}

          <Btn title={due > 0 && order.status !== 'CANCELLED' ? 'Pay later' : 'Close'} variant={due > 0 ? 'ghost' : 'primary'} onPress={onClose} />
        </>
      )}
    </Sheet>
  );
}

function PayForm({ orderId, due, canPay, onPaid }: { orderId: string; due: number; canPay: boolean; onPaid: () => void }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<'CASH' | 'UPI'>('CASH');
  const [given, setGiven] = useState('');
  // a new key per payment attempt; reused on retry so a double tap cannot take the money twice
  const key = useRef(uid());

  const pay = useMutation({
    mutationFn: () => api(`/orders/${orderId}/payments`, {
      body: {
        idempotencyKey: key.current, method, amountPaise: due,
        tenderedPaise: method === 'CASH' && given ? toPaise(given) : undefined,
        upiVerified: method === 'UPI' ? true : undefined, // tapping "Payment Paid" is the cashier's confirmation
      },
    }),
    onSuccess: () => { key.current = uid(); setGiven(''); qc.invalidateQueries({ queryKey: ['orders'] }); toast.ok('Paid'); onPaid(); },
    onError: (e) => toast.error(errText(e)),
  });

  if (!canPay) return <View style={{ backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 10, padding: 14 }}><Text style={{ color: C.soft }}>Payment is taken by the cashier.</Text></View>;
  const change = method === 'CASH' && given ? toPaise(given) - due : null;
  const quick = [due, Math.ceil(due / 5000) * 5000, Math.ceil(due / 10000) * 10000, 50000].filter((v, i, a) => v >= due && a.indexOf(v) === i).slice(0, 4);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Cash" active={method === 'CASH'} onPress={() => setMethod('CASH')} />
        <Chip label="UPI" active={method === 'UPI'} onPress={() => setMethod('UPI')} />
      </View>
      <Text style={{ color: C.soft }}>To pay: <Text style={{ color: C.ink, fontWeight: '800', fontSize: 18 }}>{inr(due)}</Text></Text>
      {method === 'CASH' && (
        <>
          <Input label="Amount received" keyboardType="decimal-pad" value={given} onChangeText={setGiven} placeholder={String(due / 100)} style={{ fontSize: 22, minHeight: 52 }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {quick.map((v) => <Chip key={v} label={inr(v, { short: true, symbol: false })} onPress={() => setGiven(String(v / 100))} />)}
          </View>
          {change !== null && (change >= 0
            ? <View style={{ backgroundColor: C.forestSoft, borderRadius: 10, padding: 12 }}><Text style={{ color: C.forest, fontWeight: '600' }}>Change to give: <Text style={{ fontSize: 20, fontWeight: '800' }}>{inr(change)}</Text></Text></View>
            : <View style={{ backgroundColor: C.badSoft, borderRadius: 10, padding: 12 }}><Text style={{ color: C.bad, fontWeight: '600' }}>Short by {inr(-change)}</Text></View>)}
        </>
      )}
      <ErrorNote error={pay.error} />
      <Btn title="Payment Paid" size="lg" onPress={() => pay.mutate()} busy={pay.isPending} disabled={method === 'CASH' && change !== null && change < 0} />
    </View>
  );
}
