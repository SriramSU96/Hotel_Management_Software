import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChatText, DownloadSimple, WhatsappLogo } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { fmtDateTime, inr } from '../lib/format';
import { useT } from '../lib/i18n';
import { Button, ErrorNote, PageHead, Segmented, Skeleton } from '../components/ui';
import { DataTable, FilterSelect, Pagination, SearchBox, usePaged, type Column, type Sort } from '../components/DataTable';

interface Row {
  id: string; billNo: string; type: string; items: { name: string; qty: number; note?: string }[]; totalPaise: number; payment: string | null;
  channel: 'WHATSAPP' | 'SMS' | null; phoneLast4: string | null; sentAt: string | null; sentByName: string | null;
  verifiedAt: string; verifiedByName: string | null; secondsToVerify: number | null;
}
interface Report {
  rows: Row[]; range: { label: string };
  summary: { count: number; totalPaise: number; sentNotVerified: number; avgSecondsToVerify: number | null; byVerifier: Record<string, { count: number; totalPaise: number }>; byChannel: Record<string, number> };
}
const dur = (s: number | null) => (s == null ? '-' : s < 90 ? `${s} sec` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);
const typeLabel = (t: string) => (t === 'PARCEL' ? 'Parcel' : t === 'TAKEAWAY' ? 'Takeaway' : 'Eat here');
const itemsLine = (r: Row) => r.items.map((i) => `${i.qty} × ${i.name}`).join(', ');
const via = (r: Row) => <span className="inline-flex items-center gap-1">{r.channel === 'SMS' ? <ChatText size={14} /> : <WhatsappLogo size={14} />}{r.channel === 'SMS' ? 'SMS' : 'WhatsApp'}{r.phoneLast4 ? ` ••••${r.phoneLast4}` : ''}</span>;

function VerifiedTable({ rows: all }: { rows: Row[] }) {
  const t = useT();
  const [search, setSearch] = useState('');
  const [who, setWho] = useState('ALL');
  const [channel, setChannel] = useState('ALL');
  const [sort, setSort] = useState<Sort>({ key: 'verifiedAt', dir: 'desc' });
  const people = useMemo(() => Array.from(new Set(all.map((r) => r.verifiedByName ?? '-'))).sort(), [all]);
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const d = sort.dir === 'asc' ? 1 : -1;
    return all
      .filter((r) => (who === 'ALL' || (r.verifiedByName ?? '-') === who) && (channel === 'ALL' || r.channel === channel) && (!term || `${r.billNo} ${itemsLine(r)} ${r.verifiedByName ?? ''} ${r.sentByName ?? ''}`.toLowerCase().includes(term)))
      .sort((a, b) => (sort.key === 'totalPaise' ? a.totalPaise - b.totalPaise : sort.key === 'billNo' ? a.billNo.localeCompare(b.billNo) : sort.key === 'took' ? (a.secondsToVerify ?? 0) - (b.secondsToVerify ?? 0) : new Date(a.verifiedAt).getTime() - new Date(b.verifiedAt).getTime()) * d);
  }, [all, search, who, channel, sort]);
  const paged = usePaged(rows, 10);
  const dirty = !!search || who !== 'ALL' || channel !== 'ALL';
  const reset = () => { setSearch(''); setWho('ALL'); setChannel('ALL'); paged.resetPage(); };

  const columns: Column<Row>[] = [
    { key: 'billNo', header: t('Bill no'), width: '150px', sortable: true, firstDir: 'asc', cell: (r) => <span className="num font-semibold">{r.billNo}</span> },
    { key: 'items', header: t('Items'), cell: (r) => <span className="text-[13px] text-ink-soft" title={itemsLine(r)}>{itemsLine(r)}</span> },
    { key: 'type', header: t('Type'), width: '95px', cell: (r) => <span className="text-[13px]">{typeLabel(r.type)}</span> },
    { key: 'via', header: 'Sent via', width: '150px', cell: (r) => <span className="text-[13px] text-ink-soft">{via(r)}</span> },
    { key: 'by', header: 'Verified by', width: '125px', cell: (r) => <span className="font-medium">{r.verifiedByName ?? '-'}</span> },
    { key: 'verifiedAt', header: 'Verified at', width: '135px', sortable: true, cell: (r) => <span className="num text-[13px] text-ink-soft">{fmtDateTime(r.verifiedAt)}</span> },
    { key: 'took', header: 'Took', width: '85px', sortable: true, cell: (r) => <span className="num text-[13px] text-ink-soft">{dur(r.secondsToVerify)}</span> },
    { key: 'totalPaise', header: t('Total'), width: '105px', align: 'right', sortable: true, cell: (r) => <span className="num text-[15px] font-semibold">{inr(r.totalPaise)}</span> },
  ];
  const mobileRow = (r: Row) => (
    <span className="block py-4 pl-4 pr-4">
      <span className="flex flex-wrap items-baseline justify-between gap-2"><span className="num font-semibold">{r.billNo}</span><span className="num text-[17px] font-semibold">{inr(r.totalPaise)}</span></span>
      <span className="mt-1 block text-sm">{itemsLine(r)}</span>
      <span className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-ink-soft min-[640px]:grid-cols-2">
        <span>Verified by <b className="text-ink">{r.verifiedByName ?? '-'}</b></span>
        <span>Verified at <b className="text-ink">{fmtDateTime(r.verifiedAt)}</b></span>
        <span className="flex items-center gap-1">Sent via {via(r)}</span>
        <span>Sent {r.sentAt ? fmtDateTime(r.sentAt) : '-'}{r.sentByName ? ` by ${r.sentByName}` : ''} · took {dur(r.secondsToVerify)}</span>
        <span>{typeLabel(r.type)}{r.payment ? ` · paid by ${r.payment}` : ''}</span>
      </span>
    </span>
  );
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-card p-4">
        <SearchBox label={t('Search')} placeholder="Bill no, item, person" value={search} onChange={(v) => { setSearch(v); paged.resetPage(); }} className="grow basis-64" />
        <FilterSelect label="Verified by" value={who} onChange={(v) => { setWho(v); paged.resetPage(); }} options={[{ value: 'ALL', label: t('All') }, ...people.map((p) => ({ value: p, label: p }))]} />
        <FilterSelect label="Sent via" value={channel} onChange={(v) => { setChannel(v); paged.resetPage(); }} options={[{ value: 'ALL', label: t('All') }, { value: 'WHATSAPP', label: 'WhatsApp' }, { value: 'SMS', label: 'SMS' }]} />
        {dirty && <Button variant="ghost" onClick={reset}>{t('Reset filters')}</Button>}
      </div>
      <DataTable
        columns={columns} rows={paged.slice} rowKey={(r) => r.id} sort={sort} onSort={(s) => { setSort(s); paged.resetPage(); }} mobileRow={mobileRow} minWidth={980}
        empty={<div><p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">No verified bills match these filters.</p><div className="mt-3 text-center"><Button variant="soft" onClick={reset}>{t('Reset filters')}</Button></div></div>}
        footer={<Pagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onPage={paged.setPage} onPageSize={paged.setPageSize} />}
      />
    </>
  );
}

/** Every digital bill the staff verified: what was ordered, the amount, who verified it, and when. */
export default function VerifiedReport() {
  const [range, setRange] = useState('today');
  const q = useQuery({ queryKey: ['verified-report', range], queryFn: () => api<Report>(`/reports/verified?range=${range}`) });
  const d = q.data;
  const Tile = ({ label, value, sub, first }: { label: string; value: string; sub?: string; first?: boolean }) => (
    <div className={`p-4 min-[900px]:p-5 ${first ? '' : 'min-[900px]:border-l min-[900px]:border-line'}`}><p className="text-[13px] text-ink-soft">{label}</p><p className="num mt-1.5 text-[24px] font-semibold leading-none">{value}</p>{sub && <p className="mt-1.5 text-[12px] text-ink-soft">{sub}</p>}</div>
  );
  return (
    <div className="pb-24">
      <PageHead title="Verified bills" sub="Bills checked by staff." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-full overflow-x-auto"><Segmented value={range} onChange={setRange} options={[{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }]} /></div>
        <a href={`/api/v1/reports/export/verified.csv?range=${range}`} className="press inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-[14px] font-medium text-forest hover:bg-black/5"><DownloadSimple size={17} />Download CSV</a>
      </div>
      {q.isLoading ? <Skeleton className="h-40" /> : q.isError ? <ErrorNote error={q.error} /> : d && (
        <>
          <div className="grid grid-cols-2 divide-y divide-line rounded-xl border border-line bg-card min-[900px]:grid-cols-4 min-[900px]:divide-y-0">
            <Tile first label="Verified bills" value={String(d.summary.count)} />
            <Tile label="Verified amount" value={inr(d.summary.totalPaise)} />
            <Tile label="Sent, not verified" value={String(d.summary.sentNotVerified)} sub="digital bills nobody checked" />
            <Tile label="Avg send → verify" value={dur(d.summary.avgSecondsToVerify)} />
          </div>
          {Object.keys(d.summary.byVerifier).length > 0 && (
            <p className="mt-3 text-sm text-ink-soft">By person: {Object.entries(d.summary.byVerifier).map(([n, v]) => `${n} ${v.count} (${inr(v.totalPaise)})`).join(' · ')}</p>
          )}
          {d.rows.length === 0 ? <p className="mt-5 rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">No verified digital bills in this period.</p> : <div className="mt-6"><VerifiedTable key={range} rows={d.rows} /></div>}
        </>
      )}
    </div>
  );
}
