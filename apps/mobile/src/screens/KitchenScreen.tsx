import { useEffect, useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth, useLocalName } from '../lib/auth';
import { timeAgo } from '../lib/format';
import { errText, toast } from '../lib/toast';
import { C } from '../theme';
import { Badge, Btn, Card, Empty, ErrorNote, Screen, Skeleton } from '../components/ui';
import { typeLabel } from '../components/OrderSheet';

export default function KitchenScreen() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 20_000); return () => clearInterval(i); }, []);

  const q = useQuery({ queryKey: ['kitchen'], queryFn: () => api<{ tickets: any[] }>('/kitchen/tickets'), refetchInterval: 10_000 });
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'PREPARING' | 'READY' }) => api(`/kitchen/tickets/${id}/status`, { method: 'PUT', body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kitchen'] }), onError: (e) => toast.error(errText(e)),
  });

  const tickets = q.data?.tickets ?? [];
  const active = tickets.filter((x) => x.status !== 'READY');
  const ready = tickets.filter((x) => x.status === 'READY');
  const cols = width >= 1200 ? 3 : width >= 700 ? 2 : 1;
  const canUpdate = can('kitchen.update');
  const grid = (list: any[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {list.map((k) => <View key={k.id} style={{ width: cols === 1 ? '100%' : (`${100 / cols - 2}%` as `${number}%`) }}><Ticket k={k} canUpdate={canUpdate} busy={move.isPending} onMove={(s) => move.mutate({ id: k.id, status: s })} /></View>)}
    </View>
  );

  return (
    <Screen title="Kitchen" sub="New orders. Refreshes every few seconds.">
      <ScrollView contentContainerStyle={{ padding: 12, paddingTop: 0, gap: 14 }}>
        {q.isLoading ? <Skeleton height={200} /> : q.error ? <ErrorNote error={q.error} />
        : tickets.length === 0 ? <Card><Empty title="No orders in the kitchen" hint="New tickets appear here." /></Card>
        : (
          <>
            {grid(active)}
            {ready.length > 0 && (<><Text style={{ fontSize: 17, fontWeight: '700', color: C.ink, marginTop: 8 }}>Ready</Text>{grid(ready)}</>)}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Ticket({ k, canUpdate, busy, onMove }: { k: any; canUpdate: boolean; busy: boolean; onMove: (s: 'PREPARING' | 'READY') => void }) {
  const nm = useLocalName();
  const mins = Math.floor((Date.now() - new Date(k.confirmedAt).getTime()) / 60000);
  const late = k.status !== 'READY' && mins >= 15;
  return (
    <View style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: late ? 2 : 1, borderColor: late ? C.bad : C.line, padding: 16, gap: 12, opacity: k.status === 'READY' ? 0.8 : 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <View>
          <Text style={{ fontSize: 30, fontWeight: '800', color: C.forest }}>#{k.kotNo}</Text>
          <Text style={{ color: C.soft, fontWeight: '600' }}>{typeLabel(k.type, k.tableLabel)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Badge text={k.status === 'CONFIRMED' ? 'New' : k.status === 'PREPARING' ? 'Preparing' : 'Ready'} tone={k.status === 'READY' ? 'ok' : k.status === 'PREPARING' ? 'info' : 'warn'} />
          <Text style={{ fontWeight: '700', color: late ? C.bad : C.soft }}>Waiting {timeAgo(k.confirmedAt)}</Text>
        </View>
      </View>
      <View style={{ gap: 6 }}>
        {k.items.map((i: any, idx: number) => (
          <View key={idx}>
            <Text style={{ fontSize: 19, color: C.ink }}><Text style={{ fontWeight: '800', fontSize: 22 }}>{i.qty}{'\u00d7'} </Text>{nm({ name: i.name, nameTa: i.nameTa })}</Text>
            {i.note ? <Text style={{ fontSize: 15, fontWeight: '600', color: '#8a5a0b', marginLeft: 30 }}>{i.note}</Text> : null}
          </View>
        ))}
      </View>
      {canUpdate && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {k.status === 'CONFIRMED' && <Btn title="Accept" variant="soft" size="lg" busy={busy} onPress={() => onMove('PREPARING')} style={{ flex: 1 }} />}
          {k.status !== 'READY' && <Btn title="Ready" size="lg" busy={busy} onPress={() => onMove('READY')} style={{ flex: 1 }} />}
          {k.status === 'READY' && <Btn title="Preparing" variant="ghost" busy={busy} onPress={() => onMove('PREPARING')} style={{ flex: 1 }} />}
        </View>
      )}
    </View>
  );
}
