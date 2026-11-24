import { useMemo, useState, type ReactNode } from 'react';
import { CaretDown, CaretLeft, CaretRight, CaretUp, CaretUpDown, MagnifyingGlass, X } from '@phosphor-icons/react';
import { useT } from '../lib/i18n';
import { Skeleton, inputCls } from './ui';

/* Shared list UI: a table with a header row and sortable columns, a paginator, and filter controls.
   Wide screens get a real table; narrow screens (phone / portrait tablet) get one card per row via `mobileRow`. */

export interface Sort { key: string; dir: 'asc' | 'desc' }

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** CSS width of the column, e.g. '120px'. Leave empty for the column that takes the remaining space. */
  width?: string;
  align?: 'left' | 'right';
  sortable?: boolean;
  /** Direction used the first time the column is clicked (default: desc). */
  firstDir?: 'asc' | 'desc';
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, sort, onSort, mobileRow, loading, dim, empty, footer, minWidth = 860 }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  sort?: Sort;
  onSort?: (s: Sort) => void;
  /** Card shown for one row on narrow screens. */
  mobileRow: (row: T) => ReactNode;
  /** First load: header stays, rows are skeletons. */
  loading?: boolean;
  /** Re-fetching (page or filter changed): old rows stay, slightly faded. */
  dim?: boolean;
  /** Shown instead of the table when there are no rows. */
  empty?: ReactNode;
  footer?: ReactNode;
  minWidth?: number;
}) {
  const clickSort = (c: Column<T>) => {
    if (!onSort || !c.sortable) return;
    onSort(sort?.key === c.key ? { key: c.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.firstDir ?? 'desc' });
  };
  if (!loading && rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      {/* wide screens: real table */}
      <div className="hidden overflow-x-auto min-[1280px]:block">
        <table className="w-full table-fixed border-collapse text-left" style={{ minWidth }}>
          <colgroup>{columns.map((c) => <col key={c.key} style={c.width ? { width: c.width } : undefined} />)}</colgroup>
          <thead>
            <tr className="border-b border-line bg-[#f7f6f1] text-[12px] uppercase tracking-wide text-ink-soft">
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const canSort = !!c.sortable && !!onSort;
                return (
                  <th key={c.key} scope="col" aria-sort={canSort ? (active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                    className={`px-4 py-2.5 font-semibold ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                    {canSort ? (
                      <button type="button" onClick={() => clickSort(c)} className={`press inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink ${active ? 'text-forest' : ''}`}>
                        {c.header}
                        {active ? (sort!.dir === 'asc' ? <CaretUp size={12} weight="bold" /> : <CaretDown size={12} weight="bold" />) : <CaretUpDown size={12} className="opacity-50" />}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={dim ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => <tr key={i} className="border-b border-line last:border-b-0"><td colSpan={columns.length} className="px-4 py-3"><Skeleton className="h-6" /></td></tr>)
              : rows.map((r) => (
                <tr key={rowKey(r)} tabIndex={onRowClick ? 0 : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(r); } } : undefined}
                  className={`border-b border-line last:border-b-0 ${onRowClick ? 'cursor-pointer hover:bg-[#faf9f5]' : ''}`}>
                  {columns.map((c) => <td key={c.key} className={`truncate px-4 py-3 align-middle text-[14px] ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.cell(r)}</td>)}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* narrow screens: one card per row */}
      <ul className={`min-[1280px]:hidden ${dim ? 'opacity-60 transition-opacity' : 'transition-opacity'}`}>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <li key={i} className="border-b border-line p-3 last:border-b-0"><Skeleton className="h-14" /></li>)
          : rows.map((r) => (
            <li key={rowKey(r)} className="border-b border-line last:border-b-0">
              {onRowClick
                ? <button type="button" onClick={() => onRowClick(r)} className="press block w-full text-left hover:bg-[#faf9f5]">{mobileRow(r)}</button>
                : mobileRow(r)}
            </li>
          ))}
      </ul>
      {footer}
    </div>
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

const pageBtn = 'press grid h-9 min-w-9 place-items-center rounded-lg px-2 text-[13px] font-medium ring-1 ring-line disabled:cursor-not-allowed disabled:opacity-40';

export function Pagination({ page, pageSize, total, onPage, onPageSize, sizes = [10, 25, 50, 100] }: {
  page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize: (n: number) => void; sizes?: number[];
}) {
  const t = useT();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line bg-[#fbfaf7] px-4 py-3 text-[13px] text-ink-soft">
      <p className="num">{t('Showing')} <b className="font-semibold text-ink">{from}–{to}</b> / <b className="font-semibold text-ink">{total}</b></p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex items-center gap-2">
          {t('Rows')}
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} aria-label={t('Rows')} className="min-h-9 rounded-lg border border-line bg-white px-2 text-[13px] text-ink">
            {sizes.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <nav aria-label="Pagination" className="flex items-center gap-1.5">
          <button type="button" className={pageBtn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('Previous')}><CaretLeft size={16} weight="bold" /></button>
          <span className="num px-2 text-ink min-[640px]:hidden">{page} / {pages}</span>
          <span className="hidden items-center gap-1.5 min-[640px]:flex">
            {pageList(page, pages).map((p) => typeof p === 'number'
              ? <button key={p} type="button" onClick={() => onPage(p)} aria-current={p === page ? 'page' : undefined} className={`${pageBtn} num ${p === page ? 'bg-forest text-white ring-forest' : 'bg-white text-ink hover:bg-forest-soft'}`}>{p}</button>
              : <span key={p} className="px-1 text-ink-soft" aria-hidden>…</span>)}
          </span>
          <button type="button" className={pageBtn} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('Next')}><CaretRight size={16} weight="bold" /></button>
        </nav>
      </div>
    </div>
  );
}

/** Client-side paging for lists that are already fully loaded. */
export function usePaged<T>(items: T[], initialSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setSize] = useState(initialSize);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const cur = Math.min(page, pages);
  const slice = useMemo(() => items.slice((cur - 1) * pageSize, cur * pageSize), [items, cur, pageSize]);
  return { slice, page: cur, pageSize, total: items.length, setPage, resetPage: () => setPage(1), setPageSize: (n: number) => { setSize(n); setPage(1); } };
}

/* ---------- filter controls ---------- */

export function FilterSelect({ label, value, onChange, options, className = '' }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <label className={`flex min-w-[140px] flex-col gap-1 ${className}`}>
      <span className="text-[12px] font-medium text-ink-soft">{label}</span>
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function SearchBox({ label, value, onChange, placeholder, className = '' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <label className={`flex min-w-[200px] flex-col gap-1 ${className}`}>
      <span className="text-[12px] font-medium text-ink-soft">{label}</span>
      <span className="relative block">
        <MagnifyingGlass size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
        <input className={`${inputCls} pl-10 ${value ? 'pr-10' : ''}`} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        {value && <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="press absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-ink-soft hover:bg-black/5"><X size={16} /></button>}
      </span>
    </label>
  );
}
