import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useAuth } from './lib/auth';
import { C } from './theme';
import { ToastHost } from './components/ui';
import PosScreen from './screens/PosScreen';
import OrdersScreen from './screens/OrdersScreen';
import KitchenScreen from './screens/KitchenScreen';
import MoreScreen from './screens/MoreScreen';

type Tab = 'pos' | 'orders' | 'kitchen' | 'more';
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'pos', label: 'New order', icon: '\uff0b' },
  { key: 'orders', label: 'Orders', icon: '\ud83e\uddfe' },
  { key: 'kitchen', label: 'Kitchen', icon: '\ud83c\udf73' },
  { key: 'more', label: 'More', icon: '\u2699' },
];

/** Side menu on tablets / browsers, bottom bar on phones. */
export default function Shell() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('pos');

  const screen = tab === 'pos' ? <PosScreen /> : tab === 'orders' ? <OrdersScreen /> : tab === 'kitchen' ? <KitchenScreen /> : <MoreScreen />;

  return (
    <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', backgroundColor: C.bg }}>
      {wide && (
        <View style={{ width: 200, backgroundColor: C.forest, paddingVertical: 20, paddingHorizontal: 12, gap: 6 }}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 1.5, paddingHorizontal: 8 }}>AMMAS</Text>
          <Text style={{ color: '#a9c2b2', paddingHorizontal: 8, marginBottom: 14 }}>{user?.name}</Text>
          {TABS.map((t) => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 10, borderRadius: 10, backgroundColor: tab === t.key ? 'rgba(255,255,255,0.14)' : 'transparent' }}>
              <Text style={{ fontSize: 18, width: 24, textAlign: 'center', color: '#fff' }}>{t.icon}</Text>
              <Text style={{ color: '#fff', fontWeight: tab === t.key ? '700' : '500', fontSize: 15 }}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={{ flex: 1 }}>{screen}</View>

      {!wide && (
        <View style={{ flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderColor: C.line }}>
          {TABS.map((t) => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }} style={{ flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <Text style={{ fontSize: 20 }}>{t.icon}</Text>
              <Text style={{ fontSize: 11, fontWeight: tab === t.key ? '700' : '500', color: tab === t.key ? C.forest : C.soft }}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <ToastHost />
    </View>
  );
}
