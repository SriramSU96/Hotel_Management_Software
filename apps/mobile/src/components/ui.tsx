import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { C } from '../theme';
import { useToasts } from '../lib/toast';

/* ---------- buttons & chips ---------- */

type Variant = 'primary' | 'soft' | 'ghost' | 'danger';
const V: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: C.forest, fg: '#fff' },
  soft: { bg: C.forestSoft, fg: C.forest },
  ghost: { bg: 'transparent', fg: C.ink, border: C.line },
  danger: { bg: C.bad, fg: '#fff' },
};

export function Btn({ title, onPress, variant = 'primary', size = 'md', disabled, busy, style }: {
  title: string; onPress?: () => void; variant?: Variant; size?: 'sm' | 'md' | 'lg'; disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const v = V[variant];
  const off = !!disabled || !!busy;
  return (
    <Pressable onPress={off ? undefined : onPress} accessibilityRole="button" accessibilityState={{ disabled: off }}
      style={({ pressed }) => [{
        minHeight: size === 'sm' ? 36 : size === 'lg' ? 54 : 44, paddingHorizontal: size === 'sm' ? 12 : 18, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center', backgroundColor: v.bg, borderWidth: v.border ? 1 : 0, borderColor: v.border,
        opacity: off ? 0.5 : pressed ? 0.85 : 1,
      }, style]}>
      {busy ? <ActivityIndicator color={v.fg} /> : <Text style={{ color: v.fg, fontSize: size === 'lg' ? 17 : 15, fontWeight: '600' }}>{title}</Text>}
    </Pressable>
  );
}

export function Chip({ label, active, onPress, small }: { label: string; active?: boolean; onPress: () => void; small?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }}
      style={{ minHeight: small ? 32 : 38, paddingHorizontal: small ? 10 : 14, borderRadius: 10, justifyContent: 'center', backgroundColor: active ? C.ink : 'rgba(0,0,0,0.05)' }}>
      <Text style={{ fontSize: small ? 13 : 14, fontWeight: '500', color: active ? '#fff' : C.ink }}>{label}</Text>
    </Pressable>
  );
}

export function Chips<T extends string>({ value, onChange, options, scroll }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; scroll?: boolean }) {
  const row = options.map((o) => <Chip key={o.value} label={o.label} active={o.value === value} onPress={() => onChange(o.value)} />);
  if (scroll) return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{row}</ScrollView>;
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{row}</View>;
}

const TONES = { ok: { bg: '#e0efe6', fg: '#1f6b43' }, warn: { bg: C.goldSoft, fg: '#8a5a0b' }, bad: { bg: C.badSoft, fg: C.bad }, info: { bg: '#e8ecf3', fg: '#3a4a66' } };
export function Badge({ text, tone = 'info' }: { text: string; tone?: keyof typeof TONES }) {
  const t = TONES[tone];
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: t.bg, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color: t.fg, fontSize: 12, fontWeight: '600' }}>{text.charAt(0).toUpperCase() + text.slice(1)}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line }, style]}>{children}</View>;
}

/* ---------- inputs ---------- */

const inputStyle: TextStyle = { minHeight: 44, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, color: C.ink, backgroundColor: '#fff' };
const labelStyle: TextStyle = { fontSize: 12, fontWeight: '500', color: C.soft };

export function Input({ label, style, ...rest }: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 4 }}>
      {label ? <Text style={labelStyle}>{label}</Text> : null}
      <TextInput placeholderTextColor="#9aa196" autoCapitalize="none" autoCorrect={false} {...rest} style={[inputStyle, style]} />
    </View>
  );
}

export function SearchBox({ label, value, onChange, placeholder }: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <View style={{ gap: 4, flexGrow: 1, flexBasis: 220 }}>
      {label ? <Text style={labelStyle}>{label}</Text> : null}
      <View>
        <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#9aa196" autoCorrect={false} style={[inputStyle, { paddingRight: 40 }]} />
        {value ? <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityLabel="Clear search" style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' }}><Text style={{ color: C.soft, fontSize: 18 }}>{'\u2715'}</Text></Pressable> : null}
      </View>
    </View>
  );
}

/** The number the cashier can tap and type over (1-99). Typing updates the order straight away; 0 + done removes the item. */
export function QtyInput({ value, onChange, style }: { value: number; onChange: (n: number) => void; style?: StyleProp<TextStyle> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = parseInt(draft, 10);
    setDraft(null);
    if (Number.isFinite(n) && n !== value) onChange(n);
  };
  return (
    <TextInput
      value={draft ?? String(value)} keyboardType="number-pad" returnKeyType="done" maxLength={2} selectTextOnFocus
      accessibilityLabel="Quantity"
      onChangeText={(t) => { const d = t.replace(/\D/g, '').slice(0, 2); setDraft(d); const n = parseInt(d, 10); if (n > 0) onChange(n); }}
      onBlur={commit} onSubmitEditing={commit}
      style={[{ textAlign: 'center', fontSize: 16, fontWeight: '700', color: C.ink, padding: 0, paddingVertical: 0, borderWidth: 1, borderColor: C.line, borderRadius: 9, backgroundColor: '#fff' }, style]}
    />
  );
}

export function Stepper({ qty, onChange, size = 34 }: { qty: number; onChange: (n: number) => void; size?: number }) {
  const b = { width: size, height: size, borderRadius: 9, alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Pressable onPress={() => onChange(qty - 1)} accessibilityLabel="Less" style={[b, { backgroundColor: C.forestSoft }]}><Text style={{ fontSize: 20, color: C.forest, fontWeight: '700' }}>{'\u2212'}</Text></Pressable>
      <QtyInput value={qty} onChange={onChange} style={{ width: 42, height: size }} />
      <Pressable onPress={() => onChange(qty + 1)} accessibilityLabel="More" style={[b, { backgroundColor: C.forest }]}><Text style={{ fontSize: 20, color: '#fff', fontWeight: '700' }}>+</Text></Pressable>
    </View>
  );
}

/* ---------- feedback ---------- */

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <View style={{ backgroundColor: C.badSoft, borderRadius: 10, padding: 12 }}>
      <Text style={{ color: C.bad }}>{error instanceof Error ? error.message : 'Something went wrong.'}</Text>
    </View>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 16, gap: 4 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: C.ink, textAlign: 'center' }}>{title}</Text>
      {hint ? <Text style={{ color: C.soft, textAlign: 'center' }}>{hint}</Text> : null}
    </View>
  );
}

export function Skeleton({ height = 24, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height, borderRadius: 8, backgroundColor: '#ebe8df' }, style]} />;
}

export function Screen({ title, sub, action, children }: { title: string; sub?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>{title}</Text>
          {sub ? <Text style={{ color: C.soft, marginTop: 2 }}>{sub}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

/* ---------- dialog ---------- */

export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const { width, height } = useWindowDimensions();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,25,20,0.45)', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ width: Math.min(width - 24, wide ? 760 : 520), maxHeight: height * 0.92, backgroundColor: C.card, borderRadius: 16, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: C.line }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.ink, flex: 1 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close"><Text style={{ fontSize: 22, color: C.soft }}>{'\u2715'}</Text></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12 }}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function ToastHost() {
  const items = useToasts((s) => s.items);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 12, right: 12, bottom: 84, alignItems: 'center', gap: 8 }}>
      {items.map((t) => (
        <View key={t.id} style={{ maxWidth: 520, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: t.kind === 'error' ? C.bad : t.kind === 'ok' ? C.forest : C.ink }}>
          <Text style={{ color: '#fff', fontWeight: '500' }}>{t.text}</Text>
        </View>
      ))}
    </View>
  );
}

/* ---------- paginator ---------- */

function pageList(page: number, pages: number): (number | string)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | string)[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  if (start > 2) out.push('gap-a');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pages - 1) out.push('gap-b');
  out.push(pages);
  return out;
}

function PageBtn({ label, onPress, disabled, active }: { label: string; onPress: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityState={{ disabled: !!disabled, selected: !!active }}
      style={{ minWidth: 38, height: 38, paddingHorizontal: 8, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: active ? C.forest : C.line, backgroundColor: active ? C.forest : '#fff', opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ fontWeight: '600', color: active ? '#fff' : C.ink }}>{label}</Text>
    </Pressable>
  );
}

export function Pager({ page, pageSize, total, onPage, onPageSize, sizes = [10, 25, 50, 100] }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize: (n: number) => void; sizes?: number[] }) {
  const { width } = useWindowDimensions();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const bold: TextStyle = { fontWeight: '700', color: C.ink };
  return (
    <View style={{ padding: 12, gap: 10, borderTopWidth: 1, borderColor: C.line, backgroundColor: '#fbfaf7' }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ color: C.soft }}>Showing <Text style={bold}>{from}{'\u2013'}{to}</Text> / <Text style={bold}>{total}</Text></Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: C.soft }}>Rows</Text>
          {sizes.map((n) => <Chip key={n} small label={String(n)} active={n === pageSize} onPress={() => onPageSize(n)} />)}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
        <PageBtn label={'\u2039'} disabled={page <= 1} onPress={() => onPage(page - 1)} />
        {width >= 600
          ? pageList(page, pages).map((p) => typeof p === 'number'
            ? <PageBtn key={p} label={String(p)} active={p === page} onPress={() => onPage(p)} />
            : <Text key={p} style={{ color: C.soft, paddingHorizontal: 4 }}>{'\u2026'}</Text>)
          : <Text style={{ color: C.ink, fontWeight: '600', paddingHorizontal: 8 }}>{page} / {pages}</Text>}
        <PageBtn label={'\u203a'} disabled={page >= pages} onPress={() => onPage(page + 1)} />
      </View>
    </View>
  );
}
