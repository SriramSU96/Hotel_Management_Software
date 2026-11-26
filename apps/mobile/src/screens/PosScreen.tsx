import { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, assetUrl } from '../lib/api';
import { useAuth, useLocalName } from '../lib/auth';
import { totalsFor, useCart } from '../lib/cart';
import { inr } from '../lib/format';
import { priceFor, useCategories, useProducts, useSettings, useTables, type OrderType, type Product } from '../lib/queries';
import { errText, toast } from '../lib/toast';
import { C } from '../theme';
import { Btn, Chip, Empty, ErrorNote, Input, SearchBox, Sheet, Skeleton, Stepper } from '../components/ui';
import OrderSheet from '../components/OrderSheet';

const CART_W = 360;

export default function PosScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const nm = useLocalName();
  const qc = useQueryClient();
  const { can } = useAuth();
  const cart = useCart();
  const products = useProducts();
  const cats = useCategories();
  const tables = useTables();
  const settings = useSettings().data?.settings;
  const [cat, setCat] = useState('ALL');
  const [q, setQ] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);

  const totals = useMemo(() => totalsFor(cart.lines, cart.discountPaise, settings), [cart.lines, cart.discountPaise, settings]);
  const count = cart.lines.reduce((a, l) => a + l.qty, 0);
  const needsTable = cart.type === 'DINE_IN' && !!settings?.useTables && !cart.tableId;
  const qtyOf = (id: string) => cart.lines.find((l) => l.productId === id)?.qty ?? 0;

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (products.data ?? []).filter((p) => (cat === 'ALL' || p.categoryId === cat) && (!term || p.name.toLowerCase().includes(term) || (p.nameTa ?? '').includes(term)));
  }, [products.data, cat, q]);
  const quick = useMemo(() => (products.data ?? []).filter((p) => p.starred && p.status === 'AVAILABLE'), [products.data]);

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
      setCartOpen(false);
      qc.invalidateQueries({ queryKey: ['tables'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
    // the cart is kept on any failure; the same key makes a retry safe
    onError: (e) => { toast.error(errText(e)); qc.invalidateQueries({ queryKey: ['products'] }); qc.invalidateQueries({ queryKey: ['tables'] }); },
  });

  const gap = 10;
  const pad = 12;
  const areaW = (wide ? width - CART_W : width) - pad * 2;
  const cols = Math.max(2, Math.floor((areaW + gap) / (170 + gap)));
  const tileW = Math.floor((areaW - gap * (cols - 1)) / cols);

  const header = (
    <View style={{ gap: 10, paddingBottom: 4 }}>
      {quick.length > 0 && !q.trim() && (
        <View style={{ gap: 6 }}>
          <Text style={{ color: C.gold, fontWeight: '700', fontSize: 13 }}>{'\u2605'} Quick order</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {quick.map((p) => {
              const n = qtyOf(p._id);
              return (
                <Pressable key={p._id} onPress={() => cart.add(p)} style={{ width: 128, minHeight: 56, borderRadius: 10, borderWidth: n > 0 ? 2 : 1, borderColor: n > 0 ? C.forest : C.line, backgroundColor: C.card, padding: 8, justifyContent: 'center' }}>
                  <Text numberOfLines={2} style={{ fontSize: 13, fontWeight: '600', color: C.ink }}>{nm(p)}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.forest }}>{inr(priceFor(p, cart.type), { short: true })}</Text>
                  {n > 0 ? <View style={{ position: 'absolute', right: 6, bottom: 6, minWidth: 22, height: 22, borderRadius: 6, backgroundColor: C.forest, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{n}</Text></View> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
      <View style={{ flexDirection: 'row' }}><SearchBox value={q} onChange={setQ} placeholder="Search food" /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="All" active={cat === 'ALL'} onPress={() => setCat('ALL')} />
        {(cats.data ?? []).filter((c) => c.active).map((c) => <Chip key={c._id} label={nm(c)} active={cat === c._id} onPress={() => setCat(c._id)} />)}
      </ScrollView>
    </View>
  );

  const cartPanel = (
    <CartPanel totals={totals} count={count} needsTable={needsTable} busy={place.isPending} error={place.error} onConfirm={() => place.mutate()} onNote={setNoteFor}
      tables={tables.data ?? []} parcel={!!settings?.parcelEnabled} useTables={!!settings?.useTables} discounts={!!settings?.discountsEnabled && can('orders.discount')} />
  );

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: C.bg }}>
      <View style={{ flex: 1 }}>
        {products.isLoading ? (
          <View style={{ padding: pad, gap }}><Skeleton height={44} />{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={150} />)}</View>
        ) : products.error ? (
          <View style={{ padding: pad }}><ErrorNote error={products.error} /></View>
        ) : (
          <FlatList
            key={cols} data={visible} numColumns={cols} keyExtractor={(p) => p._id} extraData={cart.lines}
            columnWrapperStyle={cols > 1 ? { gap } : undefined}
            contentContainerStyle={{ padding: pad, gap, paddingBottom: wide ? pad : 110 }}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={header}
            ListEmptyComponent={<Empty title="Nothing found" hint="Try another word or category." />}
            renderItem={({ item }) => <ProductTile p={item} width={tileW} type={cart.type} qty={qtyOf(item._id)} onAdd={() => cart.add(item)} onSet={(n) => cart.setQty(item._id, n)} />}
          />
        )}

        {!wide && count > 0 && (
          <Pressable onPress={() => setCartOpen(true)} style={{ position: 'absolute', left: 12, right: 12, bottom: 12, minHeight: 60, borderRadius: 14, backgroundColor: C.gold, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 6 }}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>{'\ud83d\uded2'} {count} {count === 1 ? 'item' : 'items'}</Text>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{inr(totals.total, { short: true })}</Text>
          </Pressable>
        )}
      </View>

      {wide && <ScrollView style={{ width: CART_W, borderLeftWidth: 1, borderColor: C.line, backgroundColor: C.card }} keyboardShouldPersistTaps="handled">{cartPanel}</ScrollView>}
      {!wide && <Sheet open={cartOpen} onClose={() => setCartOpen(false)} title="Your order">{cartPanel}</Sheet>}

      <NoteSheet id={noteFor} onClose={() => setNoteFor(null)} />
      {cart.placedOrderId ? <OrderSheet orderId={cart.placedOrderId} onClose={() => cart.reset()} /> : null}
    </View>
  );
}

function ProductTile({ p, width, type, qty, onAdd, onSet }: { p: Product; width: number; type: OrderType; qty: number; onAdd: () => void; onSet: (n: number) => void }) {
  const nm = useLocalName();
  const off = p.status !== 'AVAILABLE';
  const uri = assetUrl(p.imageUrl);
  return (
    <View style={{ width, backgroundColor: C.card, borderRadius: 12, borderWidth: qty > 0 ? 2 : 1, borderColor: qty > 0 ? C.forest : C.line, overflow: 'hidden', opacity: off ? 0.5 : 1 }}>
      <Pressable onPress={off ? undefined : onAdd}>
        {uri
          ? <Image source={{ uri }} style={{ width: '100%', height: Math.round(width * 0.6), backgroundColor: '#ece9e0' }} resizeMode="cover" />
          : <View style={{ width: '100%', height: Math.round(width * 0.6), backgroundColor: '#ece9e0', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 28 }}>{'\ud83c\udf7d'}</Text></View>}
        <Text numberOfLines={2} style={{ paddingHorizontal: 10, paddingTop: 8, fontSize: 14, fontWeight: '600', color: C.ink, minHeight: 44 }}>{nm(p)}</Text>
      </Pressable>
      <View style={{ paddingHorizontal: 10, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>{inr(priceFor(p, type), { short: true })}</Text>
        {off ? <Text style={{ color: C.soft, fontSize: 12 }}>{p.status === 'SOLD_OUT' ? 'Sold out' : 'Not available'}</Text>
          : qty === 0 ? <Pressable onPress={onAdd} accessibilityLabel={`Add ${p.name}`} style={{ width: 38, height: 34, borderRadius: 9, backgroundColor: C.forestSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 22, color: C.forest, fontWeight: '700' }}>+</Text></Pressable>
          : <Stepper qty={qty} onChange={onSet} size={32} />}
      </View>
    </View>
  );
}

function CartPanel({ totals, count, needsTable, busy, error, onConfirm, onNote, tables, parcel, discounts, useTables }: {
  totals: ReturnType<typeof totalsFor>; count: number; needsTable: boolean; busy: boolean; error: unknown; onConfirm: () => void; onNote: (id: string) => void;
  tables: { _id: string; label: string; activeOrderId?: string | null }[]; parcel: boolean; discounts: boolean; useTables: boolean;
}) {
  const nm = useLocalName();
  const cart = useCart();
  const [more, setMore] = useState(false);
  const types: { value: OrderType; label: string }[] = [{ value: 'DINE_IN', label: 'Eat here' }, { value: 'TAKEAWAY', label: 'Takeaway' }, ...(parcel ? [{ value: 'PARCEL' as OrderType, label: 'Parcel' }] : [])];

  return (
    <View style={{ padding: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {types.map((t) => (
          <Pressable key={t.value} onPress={() => cart.setType(t.value)} style={{ flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: cart.type === t.value ? C.forest : C.line, backgroundColor: cart.type === t.value ? C.forestSoft : C.card, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontWeight: cart.type === t.value ? '700' : '500', color: cart.type === t.value ? C.forest : C.soft }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {cart.type === 'DINE_IN' && useTables && (
        <View style={{ gap: 6 }}>
          <Text style={{ color: C.soft, fontWeight: '600' }}>Choose a table</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {tables.map((tb) => {
              const taken = !!tb.activeOrderId;
              const sel = cart.tableId === tb._id;
              return (
                <Pressable key={tb._id} disabled={taken} onPress={() => cart.setTable(sel ? null : tb._id)} accessibilityLabel={`Table ${tb.label} ${taken ? 'busy' : 'free'}`}
                  style={{ width: 52, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: sel ? C.forest : taken ? '#e5cf9f' : C.line, backgroundColor: sel ? C.forest : taken ? C.goldSoft : '#fff', opacity: taken ? 0.7 : 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: sel ? '#fff' : taken ? '#8a5a0b' : C.ink, textDecorationLine: taken ? 'line-through' : 'none' }}>{tb.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {needsTable && count > 0 ? <Text style={{ color: '#8a5a0b', fontWeight: '600' }}>Choose a table</Text> : null}
        </View>
      )}

      <View style={{ borderTopWidth: 1, borderColor: C.line, paddingTop: 8 }}>
        {cart.lines.length === 0 ? (
          <Empty title="Your order is empty" hint="Tap a food to add it" />
        ) : cart.lines.map((l, i) => (
          <View key={l.productId} style={{ paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderColor: C.line, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: C.ink, fontSize: 15 }}>{nm(l)}</Text>
                <Text style={{ color: C.soft }}>{inr(l.pricePaise, { short: true })}</Text>
                {l.note ? <Text style={{ color: '#8a5a0b', marginTop: 2 }}>{l.note}</Text> : null}
              </View>
              <Text style={{ fontWeight: '600', color: C.ink }}>{inr(l.pricePaise * l.qty, { short: true })}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Stepper qty={l.qty} onChange={(n) => cart.setQty(l.productId, n)} size={38} />
              <Pressable onPress={() => cart.setQty(l.productId, 0)} accessibilityLabel="Delete item" style={{ width: 38, height: 38, borderRadius: 9, backgroundColor: C.badSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 16 }}>{'\ud83d\uddd1'}</Text></Pressable>
              <Pressable onPress={() => onNote(l.productId)} style={{ marginLeft: 'auto', minHeight: 38, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: C.line, justifyContent: 'center' }}><Text style={{ color: C.soft }}>Add note</Text></Pressable>
            </View>
          </View>
        ))}
      </View>

      {cart.lines.length > 0 && (
        <>
          <Pressable onPress={() => setMore(!more)}><Text style={{ color: C.forest, fontWeight: '600', textDecorationLine: 'underline' }}>{more ? '\u2212' : '+'} Customer name (optional)</Text></Pressable>
          {more && (
            <View style={{ gap: 8 }}>
              <Input placeholder="Customer name (optional)" value={cart.customerName} onChangeText={(v) => cart.setCustomer(v, cart.customerPhone)} autoCapitalize="words" />
              <Input placeholder="Phone (optional)" keyboardType="phone-pad" value={cart.customerPhone} onChangeText={(v) => cart.setCustomer(cart.customerName, v)} />
            </View>
          )}
          {discounts && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Text style={{ fontWeight: '600', color: C.ink }}>Discount ({'\u20b9'})</Text>
              <TextInput keyboardType="decimal-pad" value={cart.discountPaise ? String(cart.discountPaise / 100) : ''} onChangeText={(v) => cart.setDiscount(Math.max(0, Math.round(Number(v || 0) * 100)))}
                style={{ width: 120, minHeight: 44, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, textAlign: 'right', fontSize: 16, backgroundColor: '#fff', color: C.ink }} />
            </View>
          )}
          <View style={{ borderTopWidth: 1, borderColor: C.line, paddingTop: 10, gap: 6 }}>
            <Row k="Subtotal" v={inr(totals.subtotal)} />
            {totals.discount > 0 && <Row k="Discount" v={`\u2212${inr(totals.discount)}`} />}
            {totals.tax > 0 && <Row k={`Tax ${totals.taxBp / 100}%${totals.taxMode === 'INCLUSIVE' ? ' (incl.)' : ''}`} v={inr(totals.tax)} />}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: C.ink }}>Total</Text>
              <Text style={{ fontSize: 26, fontWeight: '800', color: C.forest }}>{inr(totals.total)}</Text>
            </View>
          </View>
          <ErrorNote error={error} />
          <Btn title="Confirm Order" size="lg" onPress={onConfirm} busy={busy} disabled={needsTable} />
          <Btn title="Clear" variant="ghost" size="sm" onPress={() => cart.reset()} disabled={busy} />
        </>
      )}
    </View>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: C.soft }}>{k}</Text><Text style={{ color: C.ink }}>{v}</Text></View>
);

function NoteSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const cart = useCart();
  const line = cart.lines.find((l) => l.productId === id);
  const [v, setV] = useState('');
  const [seen, setSeen] = useState<string | null>(null);
  if (id !== seen) { setSeen(id); setV(line?.note ?? ''); } // load the existing note each time the sheet opens
  const ideas = ['Less spicy', 'No onion', 'Extra spicy', 'Less oil', 'Pack separately'];
  return (
    <Sheet open={!!id} onClose={onClose} title="Add note">
      <Text style={{ fontWeight: '600', color: C.ink }}>{line?.name}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{ideas.map((n) => <Chip key={n} label={n} onPress={() => setV(n)} />)}</View>
      <Input value={v} onChangeText={setV} maxLength={80} placeholder="Add note" autoCapitalize="sentences" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Btn title="Clear" variant="ghost" style={{ flex: 1 }} onPress={() => { if (id) cart.setNote(id, ''); onClose(); }} />
        <Btn title="Save" style={{ flex: 1 }} onPress={() => { if (id) cart.setNote(id, v.trim()); onClose(); }} />
      </View>
    </Sheet>
  );
}
