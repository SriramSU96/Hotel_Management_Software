import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowsClockwise, CaretRight, DownloadSimple, PaperPlaneTilt } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { hourLabel, inr } from '../lib/format';
import { useT } from '../lib/i18n';
import { ErrorNote, PageHead, Segmented, Skeleton } from '../components/ui';
import { errText, toast } from '../lib/toast';

type Range = 'today' | 'yesterday' | '7d' | '30d' | 'custom';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TYPE_LABEL: Record<string, string> = { DINE_IN: 'Eat here', PARCEL: 'Parcel', TAKEAWAY: 'Takeaway' };

function Delta({ cur, prev }: { cur: number; prev?: number | null }) {
  if (prev == null || prev === 0) return <span className="text-[13px] text-ink-soft">No earlier data</span>;
  const pct = Math.round(((cur - prev) / prev) * 1000) / 10;
  return <span className={`num text-[13px] font-medium ${pct >= 0 ? 'text-ok' : 'text-bad'}`}>{pct >= 0 ? '+' : '−'}{Math.abs(pct)}% <span className="font-normal text-ink-soft">vs before</span></span>;
}

/** Every dashboard block is one equal-height card, so rows line up and no area is left blank. */
const Section = ({ title, right, children, className = '' }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <section className={`flex min-w-0 flex-col rounded-xl border border-line bg-card p-5 ${className}`}>
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><h2 className="text-[15px] font-semibold">{title}</h2>{right}</div>
    {children}
  </section>
);

const Empty = ({ text }: { text: string }) => <p className="grid flex-1 place-items-center rounded-lg border border-dashed border-line py-8 text-center text-[14px] text-ink-soft">{text}</p>;

/** A number tile that links to the screen where the owner acts on it. */
function Live({ to, value, label, hint, tone }: { to: string; value: number; label: string; hint: string; tone?: 'bad' }) {
  return (
    <Link to={to} className="press flex items-center gap-4 rounded-lg border border-line px-4 py-3 hover:bg-black/[0.02]">
      <span className={`num grid h-12 w-12 shrink-0 place-items-center rounded-lg text-[20px] font-semibold ${tone === 'bad' && value > 0 ? 'bg-[#faeae7] text-bad' : 'bg-forest-soft text-forest'}`}>{value}</span>
      <div className="min-w-0 flex-1"><p className="text-[14px] font-medium">{label}</p><p className="truncate text-[13px] text-ink-soft">{hint}</p></div>
      <CaretRight size={16} className="shrink-0 text-ink-soft" />
    </Link>
  );
}

export default function Dashboard() {
  const t = useT();
  const { can, me } = useAuth();
  const [range, setRange] = useState<Range>('today');
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const qs = `range=${range}${range === 'custom' ? `&from=${from}&to=${to}` : ''}`;
  const q = useQuery({ queryKey: ['summary', qs], queryFn: () => api<any>(`/reports/summary?${qs}`), refetchInterval: 60_000 });
  const send = useMutation({ mutationFn: () => api('/reports/send-now', { body: { type: 'DAILY' } }), onSuccess: () => toast.ok('Report sent. See Settings for delivery status.'), onError: (e) => toast.error(errText(e)) });
  const d = q.data;
  const c = d?.current; const p = d?.previous;

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const daily: { date: string; day: number; orders: number; salesPaise: number }[] = d?.daily ?? [];
  const maxDaily = Math.max(1, ...daily.map((x) => x.salesPaise));
  const total7 = daily.reduce((a, x) => a + x.salesPaise, 0);
  const bestDay = daily.reduce((b, x) => (x.salesPaise > (b?.salesPaise ?? 0) ? x : b), undefined as (typeof daily)[number] | undefined);
  const maxQty = Math.max(1, ...(d?.topByQty ?? []).map((x: any) => x.qty));
  const catTotal = (d?.categoryMix ?? []).reduce((a: number, x: any) => a + x.salesPaise, 0);
  const maxStaff = Math.max(1, ...(d?.byStaff ?? []).map((x: any) => x.salesPaise));
  const unpaid = c?.pendingPaise ?? 0;
  const billed = (c?.cashPaise ?? 0) + (c?.upiPaise ?? 0) + unpaid;
  const seg = (v: number) => (billed ? (v / billed) * 100 : 0);
  const left = c ? c.netPaise - c.expensesPaise : 0;
  const attention: { to?: string; label: string; detail: string; tone: 'warn' | 'bad' | 'info' }[] = d ? [
    ...(d.lowStock.length ? [{ to: '/stock', label: `${d.lowStock.length} item${d.lowStock.length > 1 ? 's' : ''} running low`, detail: d.lowStock.slice(0, 3).map((i: any) => i.name).join(', '), tone: 'warn' as const }] : []),
    ...(unpaid > 0 ? [{ to: '/orders', label: `${inr(unpaid, { short: true })} not paid yet`, detail: 'Open orders waiting for payment', tone: 'bad' as const }] : []),
    ...(d.waste.entries ? [{ label: `${inr(d.waste.valuePaise, { short: true })} waste recorded`, detail: `${d.waste.entries} entries${d.waste.entriesWithoutCost ? `, ${d.waste.entriesWithoutCost} without a cost` : ''}`, tone: 'info' as const }] : []),
    ...(c.cancelled ? [{ label: `${c.cancelled} cancelled`, detail: 'Cancelled orders in this period', tone: 'info' as const }] : []),
  ] : [];

  const dateCls = 'min-h-11 w-[150px] rounded-lg border border-line bg-white px-3 text-[14px] text-ink focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/20';
  const rangeTabs = (
    <div className="flex max-w-full flex-wrap items-center justify-end gap-x-2 gap-y-2">
      <div className="max-w-full overflow-x-auto"><Segmented value={range} onChange={setRange} options={[{ value: 'today', label: t('Today') }, { value: 'yesterday', label: t('Yesterday') }, { value: '7d', label: t('Last 7 days') }, { value: '30d', label: t('Last 30 days') }, { value: 'custom', label: t('Custom') }]} /></div>
      {range === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input type="date" className={dateCls} value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <span className="text-ink-soft" aria-hidden>–</span>
          <input type="date" className={dateCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        </div>
      )}
      <button onClick={() => q.refetch()} className="press grid h-11 w-11 place-items-center rounded-lg text-ink-soft hover:bg-black/5" aria-label="Refresh" title="Refresh"><ArrowsClockwise size={20} className={q.isFetching ? 'animate-spin' : ''} /></button>
    </div>
  );

  return (
    <div className="w-full">
      <PageHead
        title={`${greet}${me?.name ? `, ${me.name}` : ''}`}
        sub={[range === 'today' ? todayStr : d?.range.label, d?.avgPrepMinutes != null ? `Kitchen average ${d.avgPrepMinutes} min` : null].filter(Boolean).join(' · ') || undefined}
        action={rangeTabs} />

      {q.error ? <ErrorNote error={q.error} /> : q.isLoading || !d ? <div className="grid gap-4"><Skeleton className="h-28" /><Skeleton className="h-64" /></div> : (
        <div className="grid gap-5">
          {/* the four numbers an owner checks first */}
          <div className="grid grid-cols-2 divide-line rounded-xl border border-line bg-card min-[900px]:grid-cols-4 min-[900px]:divide-x">
            <div className="border-b border-r border-line p-5 min-[900px]:border-b-0">
              <p className="text-[13px] text-ink-soft">Net sales</p>
              <p className="num mt-1.5 text-[28px] font-semibold leading-none">{inr(c.netPaise, { short: true })}</p>
              <div className="mt-2"><Delta cur={c.netPaise} prev={p?.netPaise} /></div>
            </div>
            <div className="border-b border-line p-5 min-[900px]:border-b-0">
              <p className="text-[13px] text-ink-soft">Orders</p>
              <p className="num mt-1.5 text-[28px] font-semibold leading-none">{c.orders}</p>
              <p className="mt-2 text-[13px] text-ink-soft">{c.orders ? `Average ${inr(c.avgOrderPaise, { short: true })} per order` : 'None yet'}</p>
            </div>
            <div className="border-r border-line p-5 min-[900px]:border-r-0">
              <p className="text-[13px] text-ink-soft">Money collected</p>
              <p className="num mt-1.5 text-[28px] font-semibold leading-none">{inr(c.cashPaise + c.upiPaise, { short: true })}</p>
              <p className="num mt-2 text-[13px] text-ink-soft">Cash {inr(c.cashPaise, { short: true })} · UPI {inr(c.upiPaise, { short: true })}</p>
            </div>
            <div className="p-5">
              <p className="text-[13px] text-ink-soft">Left after expenses</p>
              <p className={`num mt-1.5 text-[28px] font-semibold leading-none ${left < 0 ? 'text-bad' : ''}`}>{inr(left, { short: true })}</p>
              <p className="num mt-2 text-[13px] text-ink-soft">Expenses {inr(c.expensesPaise, { short: true })}</p>
            </div>
          </div>

          {/* row 2: seven-day trend + what is happening right now */}
          <div className="grid gap-5 min-[1000px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Section title="Sales, last 7 days" right={<span className="num text-[13px] text-ink-soft">Total <b className="font-semibold text-ink">{inr(total7, { short: true })}</b> · Average {inr(Math.round(total7 / 7), { short: true })}/day{bestDay && bestDay.salesPaise > 0 ? <> · Best <b className="font-semibold text-gold">{DAYS[bestDay.day]} {inr(bestDay.salesPaise, { short: true })}</b></> : null}</span>}>
              {total7 === 0 ? <Empty text="No sales in the last 7 days yet." /> : (
                <div className="flex flex-1 flex-col">
                  <div className="flex min-h-[250px] flex-1 items-end gap-3 border-b border-line" role="img" aria-label="Sales for each of the last 7 days">
                    {daily.map((x, i) => {
                      const today = i === daily.length - 1;
                      return (
                        <div key={x.date} title={`${x.date}: ${x.orders} orders, ${inr(x.salesPaise, { short: true })}`} className="flex flex-1 flex-col items-center justify-end gap-1.5">
                          <span className={`num text-[12px] font-medium ${today ? 'text-forest' : 'text-ink-soft'}`}>{x.salesPaise ? inr(x.salesPaise, { short: true }) : '–'}</span>
                          <div className="w-full max-w-[64px] rounded-t-md transition-[height] duration-500" style={{ height: Math.max(4, Math.round((x.salesPaise / maxDaily) * 170)), background: today ? 'var(--color-forest)' : '#a9c4b3' }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex gap-3">
                    {daily.map((x, i) => <div key={x.date} className={`flex-1 text-center text-[12px] leading-tight ${i === daily.length - 1 ? 'font-semibold text-forest' : 'text-ink-soft'}`}>{i === daily.length - 1 ? 'Today' : DAYS[x.day]}<span className="block text-[11px] font-normal text-ink-soft">{Number(x.date.slice(8))}</span></div>)}
                  </div>
                </div>
              )}
            </Section>

            <Section title="Right now">
              <div className="grid gap-3">
                <Live to="/kitchen" value={d.live.cooking} label="Being cooked" hint="Orders in the kitchen" />
                <Live to="/kitchen" value={d.live.ready} label="Ready to serve" hint="Waiting to be served or collected" />
                <Live to="/orders" value={d.live.unpaidCount} label="Unpaid bills" hint={d.live.unpaidCount ? `${inr(d.live.unpaidPaise, { short: true })} to collect` : 'Everything is paid'} tone="bad" />
              </div>
              <p className="mt-auto pt-4 text-[13px] text-ink-soft">{d.peak ? <>Busiest hour in this period: <b className="font-semibold text-gold">{hourLabel(d.peak.hour)}</b> ({d.peak.orders} {d.peak.orders === 1 ? 'order' : 'orders'})</> : 'No busy hour yet.'}</p>
            </Section>
          </div>

          {/* row 3: what sells and how it is paid */}
          <div className="grid gap-5 min-[900px]:grid-cols-2 min-[1280px]:grid-cols-3">
            <Section title="Top sellers">
              {!d.topByQty.length ? <Empty text="Nothing sold yet." /> : (
                <ol className="divide-y divide-line">
                  {d.topByQty.slice(0, 5).map((x: any, i: number) => (
                    <li key={x.name} className="py-3 first:pt-0">
                      <div className="flex items-baseline gap-3"><span className="num w-4 text-[13px] text-ink-soft">{i + 1}</span><b className="min-w-0 flex-1 truncate text-[14px] font-medium">{x.name}</b><span className="num text-[14px]">{x.qty}</span><span className="num w-16 text-right text-[13px] text-ink-soft">{inr(x.salesPaise, { short: true })}</span></div>
                      <div className="ml-7 mt-2 h-1.5 rounded-full bg-[#eceae2]"><div className="h-1.5 rounded-full bg-forest" style={{ width: `${(x.qty / maxQty) * 100}%` }} /></div>
                    </li>
                  ))}
                </ol>
              )}
              {d.slowMoving.length > 1 && <p className="mt-auto border-t border-line pt-3 text-[13px] text-ink-soft">Slow: {d.slowMoving.slice(0, 3).map((x: any) => `${x.name} (${x.qty})`).join(', ')}</p>}
            </Section>

            <Section title="Sales by category">
              {!d.categoryMix.length ? <Empty text="Nothing sold yet." /> : (
                <ul className="grid gap-4">
                  {d.categoryMix.slice(0, 6).map((x: any) => {
                    const pct = catTotal ? Math.round((x.salesPaise / catTotal) * 100) : 0;
                    return (
                      <li key={x.name}>
                        <div className="flex items-baseline gap-3 text-[14px]"><span className="min-w-0 flex-1 truncate font-medium">{x.name}</span><span className="num text-[13px] text-ink-soft">{pct}%</span><span className="num w-20 text-right">{inr(x.salesPaise, { short: true })}</span></div>
                        <div className="mt-2 h-1.5 rounded-full bg-[#eceae2]"><div className="h-1.5 rounded-full bg-forest" style={{ width: `${pct}%` }} /></div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            <Section title="Payments" className="min-[900px]:max-[1279px]:col-span-2">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-[#eceae2]" role="img" aria-label="Cash, UPI and unpaid share">
                <i style={{ width: `${seg(c.cashPaise)}%`, background: 'var(--color-forest)' }} /><i style={{ width: `${seg(c.upiPaise)}%`, background: '#6f9a80' }} /><i style={{ width: `${seg(unpaid)}%`, background: '#d9a29a' }} />
              </div>
              <ul className="mt-4 grid gap-2.5 text-[14px]">
                {[['var(--color-forest)', 'Cash', c.cashPaise], ['#6f9a80', 'UPI', c.upiPaise], ['#d9a29a', 'Unpaid', unpaid]].map(([col, l, v]: any) => <li key={l} className="flex items-center gap-2.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: col }} />{l}<b className="num ml-auto font-medium">{inr(v, { short: true })}</b></li>)}
              </ul>
              <div className="mt-auto border-t border-line pt-4">
                <h3 className="mb-2 text-[13px] font-medium text-ink-soft">Order type</h3>
                {Object.keys(d.typeSplit).length === 0 ? <p className="text-[14px] text-ink-soft">No orders yet.</p> : Object.entries(d.typeSplit).map(([k, v]: any) => <p key={k} className="flex justify-between py-1 text-[14px]"><span>{TYPE_LABEL[k] ?? k}</span><span className="num text-ink-soft">{v.orders} {v.orders === 1 ? 'order' : 'orders'} · {inr(v.salesPaise, { short: true })}</span></p>)}
              </div>
            </Section>
          </div>

          {/* row 4: act on it, who sold it, what is left */}
          <div className="grid gap-5 min-[900px]:grid-cols-2 min-[1280px]:grid-cols-3">
            <Section title="Needs attention">
              {attention.length === 0 ? <Empty text="Nothing needs attention." /> : (
                <ul className="divide-y divide-line">
                  {attention.map((a) => {
                    const dot = a.tone === 'bad' ? 'bg-bad' : a.tone === 'warn' ? 'bg-warn' : 'bg-[#9aa093]';
                    const inner = (<><span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${dot}`} /><div className="min-w-0 flex-1"><p className="text-[14px] font-medium">{a.label}</p><p className="truncate text-[13px] text-ink-soft">{a.detail}</p></div>{a.to && <CaretRight size={16} className="mt-1 text-ink-soft" />}</>);
                    return <li key={a.label}>{a.to ? <Link to={a.to} className="press flex min-h-14 items-start gap-3 py-3 first:pt-0 hover:bg-black/[0.02]">{inner}</Link> : <div className="flex min-h-14 items-start gap-3 py-3 first:pt-0">{inner}</div>}</li>;
                  })}
                </ul>
              )}
            </Section>

            <Section title="Sales by staff">
              {!d.byStaff?.length ? <Empty text="No orders yet." /> : (
                <ul className="grid gap-4">
                  {d.byStaff.slice(0, 5).map((x: any) => (
                    <li key={x.name}>
                      <div className="flex items-baseline gap-3 text-[14px]"><span className="min-w-0 flex-1 truncate font-medium">{x.name}</span><span className="num text-[13px] text-ink-soft">{x.orders} {x.orders === 1 ? 'order' : 'orders'}</span><span className="num w-20 text-right">{inr(x.salesPaise, { short: true })}</span></div>
                      <div className="mt-2 h-1.5 rounded-full bg-[#eceae2]"><div className="h-1.5 rounded-full bg-forest" style={{ width: `${(x.salesPaise / maxStaff) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* profit stays honest: partial figures, never invented */}
            <Section title="Money left" right={<span className="text-[13px] text-ink-soft">Partial, not final</span>} className="min-[900px]:max-[1279px]:col-span-2">
              <div className="grid gap-4">
                <div><p className="text-[13px] text-ink-soft">{d.profit.partial.label}</p><p className={`num mt-1 text-[24px] font-semibold ${d.profit.partial.paise < 0 ? 'text-bad' : ''}`}>{inr(d.profit.partial.paise)}</p></div>
                <div className="border-t border-line pt-4"><p className="text-[13px] text-ink-soft">{d.profit.cashView.label}</p><p className={`num mt-1 text-[24px] font-semibold ${d.profit.cashView.paise < 0 ? 'text-bad' : ''}`}>{inr(d.profit.cashView.paise)}</p></div>
              </div>
              <p className="mt-auto pt-4 text-[13px] text-ink-soft">{d.profit.reason}</p>
            </Section>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-line bg-card px-5 py-1 text-[14px]">
            <span className="text-ink-soft">Download</span>
            {['sales', 'products', 'payments', 'expenses', 'stock'].map((k) => <a key={k} href={`/api/v1/reports/export/${k}.csv?${qs}`} className="press inline-flex min-h-11 items-center gap-1.5 font-medium capitalize text-forest hover:underline"><DownloadSimple size={16} />{k}</a>)}
            {can('reports.send') && <button onClick={() => send.mutate()} disabled={send.isPending} className="press ml-auto inline-flex min-h-11 items-center gap-1.5 font-medium text-forest hover:underline disabled:opacity-50"><PaperPlaneTilt size={16} />Send today's report to owner</button>}
          </div>
        </div>
      )}
    </div>
  );
}
