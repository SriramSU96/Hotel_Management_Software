import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChatText, DownloadSimple, WhatsappLogo } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { fmtDateTime, inr } from '../lib/format';
import { ErrorNote, PageHead, Segmented, Skeleton } from '../components/ui';

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
          {d.rows.length === 0 ? <p className="mt-5 rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">No verified digital bills in this period.</p> : (
            <ul className="mt-6 divide-y divide-line border-y border-line">
              {d.rows.map((r) => (
                <li key={r.id} className="py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="num font-semibold">{r.billNo}</p>
                    <p className="num text-[17px] font-semibold">{inr(r.totalPaise)}</p>
                  </div>
                  <p className="mt-1 text-sm">{r.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}</p>
                  <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-ink-soft min-[640px]:grid-cols-2">
                    <div>Verified by <b className="text-ink">{r.verifiedByName ?? '-'}</b></div>
                    <div>Verified at <b className="text-ink">{fmtDateTime(r.verifiedAt)}</b></div>
                    <div className="flex items-center gap-1">Sent via {r.channel === 'SMS' ? <ChatText size={14} /> : <WhatsappLogo size={14} />}<b className="text-ink">{r.channel === 'SMS' ? 'SMS' : 'WhatsApp'}</b>{r.phoneLast4 && <> to ••••{r.phoneLast4}</>}</div>
                    <div>Sent {r.sentAt ? fmtDateTime(r.sentAt) : '-'}{r.sentByName ? ` by ${r.sentByName}` : ''} · took {dur(r.secondsToVerify)}</div>
                    <div>{r.type === 'PARCEL' ? 'Parcel' : r.type === 'TAKEAWAY' ? 'Takeaway' : 'Eat here'}{r.payment ? ` · paid by ${r.payment}` : ''}</div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
