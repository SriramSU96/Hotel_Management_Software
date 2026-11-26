import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, qs } from '../lib/api';
import { dayStr, fmtDateTime, inr } from '../lib/format';
import { useDebounced } from '../lib/useDebounced';
import { C } from '../theme';
import { Badge, Btn, Card, Chip, Chips, Empty, ErrorNote, Input, Pager, Screen, SearchBox } from '../components/ui';
import { DataTable, type Column, type Sort } from '../components/DataTable';
import OrderSheet, { payLabel, payTone, statusTone, typeLabel } from '../components/OrderSheet';

type View_ = 'active' | 'today' | 'history';
interface OrderRow { _id: string; billNo?: string; type: string; tableLabel?: string; items: { qty: number; name: string }[]; status: string; paymentStatus: string; totalPaise: number; createdAt: string; confirmedAt?: string }
interface OrdersResponse { orders: OrderRow[]; total: number; page: number; pageSize: number; pages: number }
interface Filters { view: View_; search: string; type: string; status: string; payment: string; from: string; to: string; sort: Sort; page: number; pageSize: number }

const initial = (): Filters => ({ view: 'active', search: '', type: 'ALL', status: 'ALL', payment: 'ALL', from: dayStr(6), to: dayStr(0), sort: { key: 'createdAt', dir: 'desc' }, page: 1, pageSize: 25 });
const itemsText = (o: OrderRow) => o.items.map((x) => `${x.qty} ${x.name}`).join(', ');
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const lower = (s: string) => s.replace('_', ' ').toLowerCase();

export default function OrdersScreen() {
  const [f, setF] = useState<Filters>(initial);
  const [open, setOpen] = useState<string | null>(null);
  // any filter change goes back to page 1
  const patch = (p: Partial<Filters>) => setF((s) => ({ ...s, page: 1, ...p }));
  const dSearch = useDebounced(f.search.trim(), 300);

  const query = qs({
    view: f.view, page: f.page, pageSize: f.pageSize, sort: f.sort.key, dir: f.sort.dir, q: dSearch,
    type: f.type === 'ALL' ? undefined : f.type, status: f.status === 'ALL' ? undefined : f.status, payment: f.payment === 'ALL' ? undefined : f.payment,
    from: f.view === 'history' ? f.from : undefined, to: f.view === 'history' ? f.to : undefined,
  });
  const q = useQuery({ queryKey: ['orders', query], queryFn: () => api<OrdersResponse>(`/orders?${query}`), placeholderData: keepPreviousData, refetchInterval: 15_000 });

  const dirty = !!f.search || f.type !== 'ALL' || f.status !== 'ALL' || f.payment !== 'ALL';
  const reset = () => setF((s) => ({ ...initial(), view: s.view, pageSize: s.pageSize, from: s.from, to: s.to }));

  const statuses = ['CONFIRMED', 'PREPARING', 'READY', ...(f.view === 'active' ? [] : ['COMPLETED', 'CANCELLED']), 'DRAFT'];
  const presets = [{ label: 'Today', from: dayStr(0), to: dayStr(0) }, { label: 'Yesterday', from: dayStr(1), to: dayStr(1) }, { label: 'Last 7 days', from: dayStr(6), to: dayStr(0) }, { label: 'Last 30 days', from: dayStr(29), to: dayStr(0) }];

  const when = (o: OrderRow) => fmtDateTime(o.confirmedAt ?? o.createdAt);
  const columns: Column<OrderRow>[] = [
    { key: 'billNo', header: 'Bill no', width: 160, sortable: true, firstDir: 'asc', cell: (o) => <Text style={{ fontWeight: '700', color: C.ink }}>{o.billNo ?? 'Draft'}</Text> },
    { key: 'type', header: 'Type', width: 120, cell: (o) => <Text style={{ color: C.soft }}>{typeLabel(o.type, o.tableLabel)}</Text> },
    { key: 'items', header: 'Items', cell: (o) => <Text numberOfLines={1} style={{ color: C.soft }}>{itemsText(o)}</Text> },
    { key: 'status', header: 'Status', width: 120, cell: (o) => <Badge text={lower(o.status)} tone={statusTone(o.status)} /> },
    { key: 'payment', header: 'Payment', width: 120, cell: (o) => <Badge text={payLabel(o.paymentStatus)} tone={payTone(o.paymentStatus)} /> },
    { key: 'createdAt', header: 'Date & time', width: 150, sortable: true, cell: (o) => <Text style={{ color: C.soft }}>{when(o)}</Text> },
    { key: 'totalPaise', header: 'Total', width: 110, align: 'right', sortable: true, cell: (o) => <Text style={{ fontWeight: '700', fontSize: 15, color: C.ink }}>{inr(o.totalPaise, { short: true })}</Text> },
  ];

  const card = (o: OrderRow) => (
    <View style={{ padding: 14, gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontWeight: '700', color: C.ink }}>{o.billNo ?? 'Draft'}</Text>
        <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink }}>{inr(o.totalPaise, { short: true })}</Text>
      </View>
      <Text style={{ color: C.soft }}>{typeLabel(o.type, o.tableLabel)}</Text>
      <Text numberOfLines={1} style={{ color: C.soft }}>{itemsText(o)}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <Badge text={lower(o.status)} tone={statusTone(o.status)} />
        <Badge text={payLabel(o.paymentStatus)} tone={payTone(o.paymentStatus)} />
        <Text style={{ marginLeft: 'auto', color: C.soft, fontSize: 12 }}>{when(o)}</Text>
      </View>
    </View>
  );

  return (
    <Screen title="Orders">
      <ScrollView contentContainerStyle={{ padding: 12, paddingTop: 0, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Chips<View_> value={f.view} onChange={(v) => patch({ view: v, status: 'ALL' })} options={[{ value: 'active', label: 'Open orders' }, { value: 'today', label: 'Today' }, { value: 'history', label: 'History' }]} />

        <Card style={{ padding: 12, gap: 12 }}>
          <View style={{ flexDirection: 'row' }}><SearchBox label="Search" value={f.search} onChange={(v) => patch({ search: v })} placeholder="Bill no, customer, phone, item" /></View>
          <FilterRow label="Type" value={f.type} onChange={(v) => patch({ type: v })} options={[['ALL', 'All'], ['DINE_IN', 'Eat here'], ['TAKEAWAY', 'Takeaway'], ['PARCEL', 'Parcel']]} />
          <FilterRow label="Status" value={f.status} onChange={(v) => patch({ status: v })} options={[['ALL', 'All'], ...statuses.map((s) => [s, s.charAt(0) + s.slice(1).toLowerCase()] as [string, string])]} />
          <FilterRow label="Payment" value={f.payment} onChange={(v) => patch({ payment: v })} options={[['ALL', 'All'], ['PAID', 'Paid'], ['UNPAID', 'Unpaid'], ['PARTIALLY_PAID', 'Partly paid'], ['REFUNDED', 'Refunded']]} />
          {f.view === 'history' && (
            <View style={{ gap: 10, borderTopWidth: 1, borderColor: C.line, paddingTop: 12 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <DateField label="From (YYYY-MM-DD)" value={f.from} onValid={(v) => patch({ from: v })} />
                <DateField label="To (YYYY-MM-DD)" value={f.to} onValid={(v) => patch({ to: v })} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {presets.map((p) => <Chip key={p.label} small label={p.label} active={f.from === p.from && f.to === p.to} onPress={() => patch({ from: p.from, to: p.to })} />)}
              </View>
            </View>
          )}
          {dirty ? <Btn title="Reset filters" variant="ghost" size="sm" onPress={reset} style={{ alignSelf: 'flex-start' }} /> : null}
        </Card>

        {q.error ? <ErrorNote error={q.error} /> : (
          <DataTable
            columns={columns} rows={q.data?.orders ?? []} rowKey={(o) => o._id} onRowPress={(o) => setOpen(o._id)}
            sort={f.sort} onSort={(s) => patch({ sort: s })} renderCard={card}
            loading={q.isPending} dim={q.isPlaceholderData}
            empty={<Card><Empty title={dirty ? 'No orders match these filters' : 'No orders here'} hint={dirty ? undefined : 'New orders appear as soon as they are confirmed.'} />{dirty ? <View style={{ alignItems: 'center', paddingBottom: 20 }}><Btn title="Reset filters" variant="soft" onPress={reset} /></View> : null}</Card>}
            footer={q.data ? <Pager page={q.data.page} pageSize={f.pageSize} total={q.data.total} onPage={(p) => patch({ page: p })} onPageSize={(n) => patch({ pageSize: n })} /> : undefined}
          />
        )}
      </ScrollView>
      {open ? <OrderSheet orderId={open} onClose={() => setOpen(null)} /> : null}
    </Screen>
  );
}

function FilterRow({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 12, fontWeight: '500', color: C.soft }}>{label}</Text>
      <Chips scroll value={value} onChange={onChange} options={options.map(([v, l]) => ({ value: v, label: l }))} />
    </View>
  );
}

/** A date typed as YYYY-MM-DD; only a complete, valid date is applied. */
function DateField({ label, value, onValid }: { label: string; value: string; onValid: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <View style={{ flex: 1 }}>
      <Input label={label} value={draft ?? value} keyboardType="numbers-and-punctuation" maxLength={10}
        onChangeText={(t) => { setDraft(t); if (isDate(t)) onValid(t); }} onBlur={() => setDraft(null)} />
    </View>
  );
}
