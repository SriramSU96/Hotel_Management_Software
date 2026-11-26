import type { ReactNode } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { C } from '../theme';
import { Skeleton } from './ui';

/* A table with a header row and sortable columns on wide screens (tablet / browser), one card per row on phones. */

export interface Sort { key: string; dir: 'asc' | 'desc' }

export interface Column<T> {
  key: string;
  header: string;
  /** Fixed width in px. Leave empty for the column that takes the remaining space. */
  width?: number;
  align?: 'left' | 'right';
  sortable?: boolean;
  /** Direction used the first time the column is pressed (default: desc). */
  firstDir?: 'asc' | 'desc';
  cell: (row: T) => ReactNode;
}

export const WIDE = 900;

export function DataTable<T>({ columns, rows, rowKey, onRowPress, sort, onSort, renderCard, loading, dim, empty, footer }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowPress?: (row: T) => void;
  sort?: Sort;
  onSort?: (s: Sort) => void;
  /** One row as a card (phones). */
  renderCard: (row: T) => ReactNode;
  loading?: boolean;
  /** Re-fetching after a page / filter change: old rows stay, slightly faded. */
  dim?: boolean;
  empty?: ReactNode;
  footer?: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;

  if (!loading && rows.length === 0 && empty) return <>{empty}</>;

  const press = (c: Column<T>) => {
    if (!onSort || !c.sortable) return;
    onSort(sort?.key === c.key ? { key: c.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.firstDir ?? 'desc' });
  };
  const cellBox = (c: Column<T>) => (c.width ? { width: c.width } : { flex: 1, minWidth: 120 });

  return (
    <View style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
      {wide && (
        <View style={{ flexDirection: 'row', backgroundColor: C.headBg, borderBottomWidth: 1, borderColor: C.line }}>
          {columns.map((c) => {
            const active = sort?.key === c.key;
            const can = !!c.sortable && !!onSort;
            return (
              <Pressable key={c.key} disabled={!can} onPress={() => press(c)} accessibilityRole={can ? 'button' : undefined}
                style={[{ paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start' }, cellBox(c)]}>
                <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.4, color: active ? C.forest : C.soft }}>{c.header.toUpperCase()}</Text>
                {can ? <Text style={{ fontSize: 10, color: active ? C.forest : '#b5b9ae' }}>{active ? (sort!.dir === 'asc' ? '\u25b2' : '\u25bc') : '\u21c5'}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={{ opacity: dim ? 0.55 : 1 }}>
        {loading
          ? Array.from({ length: wide ? 8 : 5 }).map((_, i) => <View key={i} style={{ padding: 12, borderBottomWidth: 1, borderColor: C.line }}><Skeleton height={wide ? 24 : 56} /></View>)
          : rows.map((r, i) => {
            const last = i === rows.length - 1;
            return (
              <Pressable key={rowKey(r)} disabled={!onRowPress} onPress={() => onRowPress?.(r)}
                style={({ pressed }) => ({ borderBottomWidth: last ? 0 : 1, borderColor: C.line, backgroundColor: pressed ? '#faf9f5' : C.card, flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch' })}>
                {wide
                  ? columns.map((c) => (
                    <View key={c.key} style={[{ paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center', alignItems: c.align === 'right' ? 'flex-end' : 'flex-start' }, cellBox(c)]}>{c.cell(r)}</View>
                  ))
                  : renderCard(r)}
              </Pressable>
            );
          })}
      </View>
      {footer}
    </View>
  );
}
