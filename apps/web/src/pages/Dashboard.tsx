import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowsClockwise, BellRinging, CaretRight, Clock, CookingPot, CurrencyInr, DownloadSimple, PaperPlaneTilt, PiggyBank, Plus, Receipt, TrendDown, TrendUp, Wallet } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { hourLabel, inr } from '../lib/format';
import { useT } from '../lib/i18n';
import { ErrorNote, PageHead, Segmented, Skeleton } from '../components/ui';
import { errText, toast } from '../lib/toast';

type Range = 'today' | 'yesterday' | '7d' | '30d' | 'custom';
type Day = { date: string; day: number; orders: number; salesPaise: number };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TYPE_LABEL: Record<string, string> = { DINE_IN: 'Eat here', PARCEL: 'Parcel', TAKEAWAY: 'Takeaway' };
const TIP_BG = '#16231c';

const dateLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
/** Axis labels: 2500 paise-rupees -> ₹2.5k */
const compact = (paise: number) => {
  const r = paise / 100;
  return r >= 1000 ? `₹${(r / 1000).toFixed(r % 1000 ? 1 : 0).replace(/\.0$/, '')}k` : `₹${Math.round(r)}`;
};
/** A round number a little above the biggest bar, so the tallest bar never touches the top and the grid lines read cleanly. */
function niceMax(paise: number) {
  const rupees = (Math.max(paise, 100) / 100) * 1.1;
  const mag = Math.pow(10, Math.floor(Math.log10(rupees)));
  const n = rupees / mag;
  const step = [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10].find((s) => s >= n) ?? 10;
  return step * mag * 100;
}

/* ---------- tooltip ---------- */

/** Dark hover card. The parent must be `group/tip relative` (and focusable so keyboard users see it too). */
function Bubble({ children, place = 'top', align = 'center', style }: { children: React.ReactNode; place?: 'top' | 'right' | 'left'; align?: 'start' | 'center' | 'end'; style?: React.CSSProperties }) {
  let pos: string;
  let arrow: string;
  if (place === 'top') {
    pos = `${style ? '' : 'bottom-full mb-2'} ${align === 'start' ? 'left-0' : align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2'}`;
    arrow = `top-full border-x-[6px] border-t-[6px] border-x-transparent border-t-[#16231c] ${align === 'start' ? 'left-5' : align === 'end' ? 'right-5' : 'left-1/2 -translate-x-1/2'}`;
  } else if (place === 'right') {
    pos = 'left-full top-2 ml-2';
    arrow = 'right-full top-4 border-y-[6px] border-r-[6px] border-y-transparent border-r-[#16231c]';
  } else {
    pos = 'right-full top-2 mr-2';
    arrow = 'left-full top-4 border-y-[6px] border-l-[6px] border-y-transparent border-l-[#16231c]';
  }
  return (
    <div role="tooltip" style={style} className={`pointer-events-none absolute z-30 w-max min-w-[170px] max-w-[250px] rounded-lg px-3 py-2.5 text-left text-[12px] font-normal leading-snug text-white opacity-0 shadow-[0_12px_30px_-10px_rgba(0,0,0,0.45)] transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100 ${pos}`}>
      <div className="absolute inset-0 -z-10 rounded-lg" style={{ background: TIP_BG }} />
      {children}
      <i className={`absolute h-0 w-0 ${arrow}`} />
    </div>
  );
}

const TipRow = ({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) => (
  <div className="flex items-baseline justify-between gap-5 py-px"><span className="text-white/65">{k}</span><span className={`num ${strong ? 'text-[13px] font-semibold' : 'font-medium'}`}>{v}</span></div>
);
const TipTag = ({ children, gold }: { children: React.ReactNode; gold?: boolean }) => (
  <span className={`rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${gold ? 'bg-[#b8741a] text-white' : 'bg-white/15 text-white'}`}>{children}</span>
);
const Pct = ({ v }: { v: number }) => <span className={v >= 0 ? 'text-[#7fd1a0]' : 'text-[#f0a79d]'}>{v >= 0 ? '+' : '−'}{Math.abs(v)}%</span>;

/* ---------- small building blocks ---------- */

function Delta({ cur, prev, against = 'before' }: { cur: number; prev?: number | null; against?: string }) {
  const when = against === 'before' ? 'before' : `last ${against}`;
  if (prev == null || prev === 0) return <span className="text-[13px] text-ink-soft">No earlier data</span>;
  // nothing sold yet is not a 100% drop: show what the earlier period made instead
  if (cur === 0) return <span className="num text-[13px] text-ink-soft">{when.charAt(0).toUpperCase() + when.slice(1)}: {inr(prev, { short: true })}</span>;
  const pct = Math.round(((cur - prev) / prev) * 1000) / 10;
  const up = pct >= 0;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`num inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${up ? 'bg-[#e6f1ea] text-[#23653f]' : 'bg-[#faeae7] text-[#a23e33]'}`}>
        {up ? <TrendUp size={13} weight="bold" /> : <TrendDown size={13} weight="bold" />}{Math.abs(pct)}%
      </span>
      <span className="num text-[13px] text-ink-soft">vs {when} ({inr(prev, { short: true })})</span>
    </span>
  );
}

/** Tiny trend line for the headline cards. */
function Spark({ values, color }: { values: number[]; color: string }) {
  const id = useId().replace(/:/g, '');
  const max = Math.max(...values, 0);
  if (values.length < 2 || max === 0) return null;
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 25 - ((v - min) / span) * 21]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-9 w-24 shrink-0" aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".22" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L100 30 L0 30 Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Kpi({ icon, label, value, unit, sub, spark, valueCls = '', rows, extra, children, i = 0 }: { icon: React.ReactNode; label: string; value: string; unit?: string; sub: React.ReactNode; spark?: React.ReactNode; valueCls?: string; rows?: { k: string; v: React.ReactNode; bad?: boolean }[]; extra?: React.ReactNode; children?: React.ReactNode; i?: number }) {
  return (
    <div style={{ ['--i' as string]: i }} className="rise flex flex-col rounded-xl border border-line bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2.5 text-[13px] text-ink-soft"><span className="grid h-8 w-8 place-items-center rounded-lg bg-forest-soft text-forest">{icon}</span>{label}</div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className={`num text-[28px] font-semibold leading-none ${valueCls}`}>{value}{unit && <span className="ml-1.5 text-[14px] font-medium text-ink-soft">{unit}</span>}</p>
        {spark}
      </div>
      <div className="mt-2 min-h-5 text-[13px] text-ink-soft">{sub}</div>
      {extra}
      <div className="mt-auto pt-3">
        {rows && (
          <dl className="border-t border-line">
            {rows.map((r) => (
              <div key={r.k} className="flex items-baseline justify-between gap-3 border-b border-line py-2 text-[13px] last:border-b-0">
                <dt className="text-ink-soft">{r.k}</dt>
                <dd className={`num font-medium ${r.bad ? 'text-bad' : ''}`}>{r.v}</dd>
              </div>
            ))}
          </dl>
        )}
        {children}
      </div>
    </div>
  );
}

/** Every dashboard block is one equal-height card, so rows line up and no area is left blank. */
const Section = ({ title, right, children, className = '', i = 0 }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string; i?: number }) => (
  <section style={{ ['--i' as string]: i }} className={`rise flex min-w-0 flex-col rounded-xl border border-line bg-card p-5 shadow-soft ${className}`}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5"><h2 className="text-[15px] font-semibold">{title}</h2>{right}</div>
    {children}
  </section>
);

const Empty = ({ text }: { text: string }) => <p className="grid flex-1 place-items-center rounded-lg border border-dashed border-line py-8 text-center text-[14px] text-ink-soft">{text}</p>;
const Chip = ({ children }: { children: React.ReactNode }) => <span className="num rounded-md bg-[#f1f0e9] px-2 py-1 text-[12px] text-ink-soft">{children}</span>;

/** A number tile that links to the screen where the owner acts on it. */
function Live({ to, value, label, hint, tone, icon }: { to: string; value: number; label: string; hint: string; tone?: 'bad'; icon: React.ReactNode }) {
  const bad = tone === 'bad' && value > 0;
  return (
    <Link to={to} className="press group flex items-center gap-4 rounded-lg border border-line px-4 py-3 transition-colors hover:border-forest/30 hover:bg-forest-soft/40">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${bad ? 'bg-[#faeae7] text-bad' : 'bg-forest-soft text-forest'}`}>{icon}</span>
      <div className="min-w-0 flex-1"><p className="text-[14px] font-medium">{label}</p><p className="truncate text-[13px] text-ink-soft">{hint}</p></div>
      <span className={`num text-[26px] font-semibold leading-none ${bad ? 'text-bad' : ''}`}>{value}</span>
      <CaretRight size={16} className="shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** One horizontal bar row; hovering the row shows the details card. */
function BarRow({ label, lead, value, valueWidth = 'w-20', pct, tip, sub }: { label: string; lead?: React.ReactNode; value: React.ReactNode; valueWidth?: string; pct: number; tip: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <li tabIndex={0} className="group/tip relative cursor-default rounded-lg px-2 py-2 outline-none transition-colors hover:bg-forest-soft/50 focus-visible:bg-forest-soft/50">
      <div className="flex items-baseline gap-3 text-[14px]">
        {lead}<span className="min-w-0 flex-1 truncate font-medium">{label}</span>{sub}<span className={`num ${valueWidth} text-right`}>{value}</span>
      </div>
      <div className={`mt-2 h-1.5 rounded-full bg-[#eceae2] ${lead ? 'ml-7' : ''}`}><div className="h-1.5 rounded-full bg-forest transition-[width] duration-500 group-hover/tip:bg-forest-deep" style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} /></div>
      <Bubble align="start">{tip}</Bubble>
    </li>
  );
}

export default function Dashboard() {
  const t = useT();
  const { can, me } = useAuth();
  const [range, setRange] = useState<Range>('today');
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [hov, setHov] = useState<string | null>(null); // payments donut hover
  const qs = `range=${range}${range === 'custom' ? `&from=${from}&to=${to}` : ''}`;
  const q = useQuery({ queryKey: ['summary', qs], queryFn: () => api<any>(`/reports/summary?${qs}`), refetchInterval: 60_000 });
  const send = useMutation({ mutationFn: () => api('/reports/send-now', { body: { type: 'DAILY' } }), onSuccess: () => toast.ok('Report sent. See Settings for delivery status.'), onError: (e) => toast.error(errText(e)) });
  const d = q.data;
  const c = d?.current; const p = d?.previous;

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const daily: Day[] = d?.daily ?? [];
  const maxDaily = Math.max(0, ...daily.map((x) => x.salesPaise));
  const top = niceMax(maxDaily);
  const ticks = [0, 1, 2, 3, 4].map((n) => (top * n) / 4);
  const total7 = daily.reduce((a, x) => a + x.salesPaise, 0);
  const avgDay = daily.length ? Math.round(total7 / daily.length / 100) * 100 : 0;
  const bestDay = daily.reduce((b, x) => (x.salesPaise > (b?.salesPaise ?? 0) ? x : b), undefined as Day | undefined);
  const maxQty = Math.max(1, ...(d?.topByQty ?? []).map((x: any) => x.qty));
  const catTotal = (d?.categoryMix ?? []).reduce((a: number, x: any) => a + x.salesPaise, 0);
  const maxStaff = Math.max(1, ...(d?.byStaff ?? []).map((x: any) => x.salesPaise));
  const unpaid = c?.pendingPaise ?? 0;
  const billed = (c?.cashPaise ?? 0) + (c?.upiPaise ?? 0) + unpaid;
  const left = c ? c.netPaise - c.expensesPaise : 0;
  // extra numbers for the four headline cards
  const yest = daily.length > 1 ? daily[daily.length - 2].salesPaise : 0;
  const lw = d?.lastWeek;
  const cmpPrev = lw ? lw.netPaise : p?.netPaise;
  const cmpLabel = lw ? DAYS[lw.weekday] : 'before';
  const dine = d?.typeSplit?.DINE_IN?.orders ?? 0;
  const takeOut = (d?.typeSplit?.TAKEAWAY?.orders ?? 0) + (d?.typeSplit?.PARCEL?.orders ?? 0);
  const openNow = (d?.live?.cooking ?? 0) + (d?.live?.ready ?? 0);
  const weekLeft = d?.week ? d.week.netPaise - d.week.expensesPaise : 0;
  const stockPct = c && c.netPaise > 0 ? Math.round((c.purchasesPaise / c.netPaise) * 100) : null;

  // payments donut
  const parts = [
    { key: 'Cash', v: c?.cashPaise ?? 0, col: 'var(--color-forest)' },
    { key: 'UPI', v: c?.upiPaise ?? 0, col: '#6f9a80' },
    { key: 'Unpaid', v: unpaid, col: '#d9a29a' },
  ];
  const R = 50; const CIRC = 2 * Math.PI * R;
  const nonZero = parts.filter((x) => x.v > 0).length;
  let acc = 0;
  const segs = parts.map((x) => { const len = billed ? (x.v / billed) * CIRC : 0; const s = { ...x, len, off: acc }; acc += len; return s; });
  const pctOf = (v: number) => (billed ? Math.round((v / billed) * 100) : 0);
  const active = parts.find((x) => x.key === hov);
  const typeEntries = Object.entries(d?.typeSplit ?? {}) as [string, any][];
  const typeTotal = typeEntries.reduce((a, [, v]) => a + v.salesPaise, 0);

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
      {can('orders.create') && <Link to="/pos" className="press inline-flex min-h-11 items-center gap-2 rounded-lg bg-forest px-4 text-[14px] font-semibold text-white hover:bg-forest-deep"><Plus size={18} weight="bold" />New order</Link>}
    </div>
  );

  return (
    <div className="w-full">
      <PageHead
        title={`${greet}${me?.name ? `, ${me.name}` : ''}`}
        sub={[range === 'today' ? todayStr : d?.range.label, d?.avgPrepMinutes != null ? `Kitchen average ${d.avgPrepMinutes} min` : null].filter(Boolean).join(' · ') || undefined}
        action={rangeTabs} />

      {q.error ? <ErrorNote error={q.error} /> : q.isLoading || !d ? (
        <div className="grid gap-5"><div className="grid grid-cols-2 gap-4 min-[1100px]:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-56" />)}</div><Skeleton className="h-80" /></div>
      ) : (
        <div className="grid gap-5">
          {/* the four numbers an owner checks first */}
          <div className="grid grid-cols-2 gap-4 min-[1100px]:grid-cols-4">
            <Kpi i={0} icon={<CurrencyInr size={18} />} label="Net sales" value={inr(c.netPaise, { short: true })}
              sub={<Delta cur={c.netPaise} prev={cmpPrev} against={cmpLabel} />} spark={<Spark values={daily.map((x) => x.salesPaise)} color="#17513a" />}
              rows={[{ k: 'Yesterday', v: inr(yest, { short: true }) }, { k: '7-day average', v: inr(avgDay, { short: true }) }, { k: 'Average bill', v: c.orders ? inr(c.avgOrderPaise, { short: true }) : '–' }]} />
            <Kpi i={1} icon={<Receipt size={18} />} label="Orders" value={String(c.orders)} unit={c.orders === 1 ? 'order' : 'orders'}
              sub={<span className="num">{openNow} open now · {c.completed ?? 0} completed</span>} spark={<Spark values={daily.map((x) => x.orders)} color="#b8741a" />}
              rows={[{ k: 'Eat here / take-out', v: `${dine} / ${takeOut}` }, { k: 'Cancelled', v: c.cancelled }, { k: 'Discounts given', v: inr(c.discountPaise, { short: true }) }]} />
            <Kpi i={2} icon={<Wallet size={18} />} label="Money collected" value={inr(c.cashPaise + c.upiPaise, { short: true })}
              sub={<span className="num inline-flex flex-wrap gap-x-3 gap-y-0.5"><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-forest" />Cash {inr(c.cashPaise, { short: true })}</span><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#6f9a80]" />UPI {inr(c.upiPaise, { short: true })}</span></span>}
              extra={<div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-[#eceae2]" role="img" aria-label="Share of cash, UPI and unpaid">{billed > 0 && parts.map((x) => x.v > 0 && <i key={x.key} className="h-2" style={{ width: `${(x.v / billed) * 100}%`, background: x.col }} />)}</div>}
              rows={[{ k: 'Still to collect', v: inr(unpaid, { short: true }), bad: unpaid > 0 }, { k: 'Unpaid bills', v: d.live.unpaidCount, bad: d.live.unpaidCount > 0 }, { k: 'Refunds', v: inr(c.refundsPaise, { short: true }) }]} />
            <Kpi i={3} icon={<PiggyBank size={18} />} label="Left after expenses" value={inr(left, { short: true })} valueCls={left < 0 ? 'text-bad' : ''}
              sub={<span className="num">Sales {inr(c.netPaise, { short: true })} − expenses {inr(c.expensesPaise, { short: true })}</span>}
              rows={[{ k: 'Last 7 days left', v: inr(weekLeft, { short: true }), bad: weekLeft < 0 }, { k: 'Stock bought', v: `${inr(c.purchasesPaise, { short: true })}${stockPct != null ? ` (${stockPct}% of sales)` : ''}` }]}>
              {can('expenses.manage') && <Link to="/money" className="press mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-forest ring-1 ring-line hover:bg-forest-soft"><Plus size={14} weight="bold" />Add expense</Link>}
            </Kpi>
          </div>

          {/* row 2: seven-day trend + what is happening right now */}
          <div className="grid gap-5 min-[1000px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Section i={4} title="Sales, last 7 days" right={
              <div className="flex flex-wrap gap-1.5">
                <Chip>Total <b className="font-semibold text-ink">{inr(total7, { short: true })}</b></Chip>
                <Chip>Average <b className="font-semibold text-ink">{inr(avgDay, { short: true })}</b>/day</Chip>
                {bestDay && bestDay.salesPaise > 0 && <Chip>Best <b className="font-semibold text-gold">{DAYS[bestDay.day]} {inr(bestDay.salesPaise, { short: true })}</b></Chip>}
              </div>}>
              {total7 === 0 ? <Empty text="No sales in the last 7 days yet." /> : (
                <div className="flex flex-1 flex-col" role="group" aria-label="Sales for each of the last 7 days. Hover or focus a bar for details.">
                  <div className="flex">
                    <div className="relative h-60 w-11 shrink-0" aria-hidden>
                      {ticks.map((tk) => <span key={tk} className="num absolute right-2 translate-y-1/2 text-[11px] text-ink-soft" style={{ bottom: `${(tk / top) * 100}%` }}>{compact(tk)}</span>)}
                    </div>
                    <div className="relative h-60 min-w-0 flex-1">
                      {ticks.map((tk) => <i key={tk} className={`absolute inset-x-0 border-t ${tk === 0 ? 'border-line' : 'border-dashed border-line/80'}`} style={{ bottom: `${(tk / top) * 100}%` }} />)}
                      {avgDay > 0 && (
                        <div className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-gold/70" style={{ bottom: `${(avgDay / top) * 100}%` }}>
                          <span className="num absolute -top-5 left-1 rounded bg-gold-soft px-1.5 text-[11px] font-medium text-gold">Avg {compact(avgDay)}</span>
                        </div>
                      )}
                      <div className="absolute inset-0 flex gap-2.5 px-1.5">
                        {daily.map((x, i) => {
                          const pct = (x.salesPaise / top) * 100;
                          const isToday = i === daily.length - 1;
                          const isBest = x.date === bestDay?.date && x.salesPaise > 0;
                          const col = isToday ? 'var(--color-forest)' : isBest ? 'var(--color-gold)' : '#a9c4b3';
                          const high = pct > 55; // tall bars show the card beside them so it never covers the title
                          const vsAvg = avgDay > 0 ? Math.round(((x.salesPaise - avgDay) / avgDay) * 100) : null;
                          const prevSales = i > 0 ? daily[i - 1].salesPaise : 0;
                          const vsPrev = prevSales > 0 ? Math.round(((x.salesPaise - prevSales) / prevSales) * 100) : null;
                          return (
                            <div key={x.date} tabIndex={0} aria-label={`${dateLabel(x.date)}: ${x.orders} orders, ${inr(x.salesPaise, { short: true })}`}
                              className="group/tip relative flex-1 cursor-default rounded-md outline-none transition-colors hover:bg-forest/[0.06] focus-visible:bg-forest/[0.06]">
                              {x.salesPaise > 0 && <span className={`num pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium ${isToday ? 'text-forest' : 'text-ink-soft'}`} style={{ bottom: `calc(${pct}% + 5px)` }}>{compact(x.salesPaise)}</span>}
                              <div className="absolute bottom-0 left-1/2 w-full max-w-[56px] -translate-x-1/2 rounded-t-md transition-[height,filter] duration-500 group-hover/tip:brightness-90" style={{ height: `max(${pct}%, 3px)`, background: col }} />
                              <Bubble place={high ? (i < daily.length / 2 ? 'right' : 'left') : 'top'} align={i === 0 ? 'start' : i === daily.length - 1 ? 'end' : 'center'} style={high ? undefined : { bottom: `calc(${pct}% + 26px)` }}>
                                <p className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[12px] font-semibold">{dateLabel(x.date)}{isToday && <TipTag>Today</TipTag>}{isBest && <TipTag gold>Best day</TipTag>}</p>
                                {x.salesPaise === 0 ? <p className="text-white/65">No sales this day</p> : <>
                                  <TipRow k="Sales" v={inr(x.salesPaise, { short: true })} strong />
                                  <TipRow k="Orders" v={x.orders} />
                                  <TipRow k="Average order" v={x.orders ? inr(Math.round(x.salesPaise / x.orders), { short: true }) : '–'} />
                                  {vsAvg != null && <TipRow k="vs daily average" v={<Pct v={vsAvg} />} />}
                                  {vsPrev != null && <TipRow k="vs previous day" v={<Pct v={vsPrev} />} />}
                                  <TipRow k="Share of the week" v={`${Math.round((x.salesPaise / total7) * 100)}%`} />
                                </>}
                              </Bubble>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="ml-11 mt-2 flex gap-2.5 px-1.5">
                    {daily.map((x, i) => <div key={x.date} className={`flex-1 text-center text-[12px] leading-tight ${i === daily.length - 1 ? 'font-semibold text-forest' : 'text-ink-soft'}`}>{i === daily.length - 1 ? 'Today' : DAYS[x.day]}<span className="block text-[11px] font-normal text-ink-soft">{Number(x.date.slice(8))}</span></div>)}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-soft" aria-hidden>
                    <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-forest" />Today</span>
                    <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-gold" />Best day</span>
                    <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#a9c4b3]" />Other days</span>
                    <span className="inline-flex items-center gap-1.5"><i className="w-4 border-t border-dashed border-gold" />Daily average</span>
                  </div>
                </div>
              )}
            </Section>

            <Section i={5} title="Right now" right={<span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ok"><i className="pulse-dot h-2 w-2 rounded-full bg-ok" />Live</span>}>
              <div className="grid flex-1 auto-rows-fr gap-3">
                <Live to="/kitchen" icon={<CookingPot size={22} />} value={d.live.cooking} label="Being cooked" hint="Orders in the kitchen" />
                <Live to="/kitchen" icon={<BellRinging size={22} />} value={d.live.ready} label="Ready to serve" hint="Waiting to be served or collected" />
                <Live to="/orders" icon={<Receipt size={22} />} value={d.live.unpaidCount} label="Unpaid bills" hint={d.live.unpaidCount ? `${inr(d.live.unpaidPaise, { short: true })} to collect` : 'Everything is paid'} tone="bad" />
              </div>
              <div className="mt-4 flex items-center gap-3 rounded-lg bg-gold-soft px-4 py-3 text-[13px]">
                <Clock size={20} className="shrink-0 text-gold" />
                {d.peak ? <p>Busiest hour in this period: <b className="font-semibold text-gold">{hourLabel(d.peak.hour)}</b> <span className="text-ink-soft">({d.peak.orders} {d.peak.orders === 1 ? 'order' : 'orders'})</span></p> : <p className="text-ink-soft">No busy hour yet.</p>}
              </div>
            </Section>
          </div>

          {/* row 3: what sells and how it is paid */}
          <div className="grid gap-5 min-[900px]:grid-cols-2 min-[1280px]:grid-cols-3">
            <Section i={6} title="Top sellers">
              {!d.topByQty.length ? <Empty text="Nothing sold yet." /> : (
                <ol className="-mx-2 grid gap-1">
                  {d.topByQty.slice(0, 5).map((x: any, i: number) => (
                    <BarRow key={x.name} label={x.name} valueWidth="w-16" pct={(x.qty / maxQty) * 100}
                      lead={<span className="num grid h-5 w-5 place-items-center rounded-md bg-[#f1f0e9] text-[12px] text-ink-soft">{i + 1}</span>}
                      sub={<span className="num text-[14px]">{x.qty}</span>} value={<span className="text-[13px] text-ink-soft">{inr(x.salesPaise, { short: true })}</span>}
                      tip={<><p className="mb-1.5 text-[12px] font-semibold">{x.name}</p><TipRow k="Rank" v={`#${i + 1}`} /><TipRow k="Sold" v={`${x.qty} plates`} strong /><TipRow k="Sales" v={inr(x.salesPaise, { short: true })} /><TipRow k="Average price" v={x.qty ? inr(Math.round(x.salesPaise / x.qty), { short: true }) : '–'} /><TipRow k="vs top seller" v={`${Math.round((x.qty / maxQty) * 100)}%`} /></>} />
                  ))}
                </ol>
              )}
              {d.slowMoving.length > 1 && <p className="mt-auto border-t border-line pt-3 text-[13px] text-ink-soft">Slow: {d.slowMoving.slice(0, 3).map((x: any) => `${x.name} (${x.qty})`).join(', ')}</p>}
            </Section>

            <Section i={7} title="Sales by category">
              {!d.categoryMix.length ? <Empty text="Nothing sold yet." /> : (
                <ul className="-mx-2 grid gap-1">
                  {d.categoryMix.slice(0, 6).map((x: any) => {
                    const pct = catTotal ? Math.round((x.salesPaise / catTotal) * 100) : 0;
                    return (
                      <BarRow key={x.name} label={x.name} pct={pct} sub={<span className="num text-[13px] text-ink-soft">{pct}%</span>} value={inr(x.salesPaise, { short: true })}
                        tip={<><p className="mb-1.5 text-[12px] font-semibold">{x.name}</p><TipRow k="Sales" v={inr(x.salesPaise, { short: true })} strong /><TipRow k="Share of sales" v={`${pct}%`} />{x.qty != null && <TipRow k="Items sold" v={x.qty} />}</>} />
                    );
                  })}
                </ul>
              )}
            </Section>

            <Section i={8} title="Payments" className="min-[900px]:max-[1279px]:col-span-2">
              <div className="flex flex-wrap items-center gap-5">
                <div className="relative mx-auto h-36 w-36 shrink-0">
                  <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label="Cash, UPI and unpaid share of billed amount">
                    <circle cx="60" cy="60" r={R} fill="none" stroke="#eceae2" strokeWidth="16" />
                    {segs.map((s) => s.len > 0 && (
                      <circle key={s.key} cx="60" cy="60" r={R} fill="none" stroke={s.col} strokeWidth={hov === s.key ? 20 : 16}
                        strokeDasharray={`${Math.max(s.len - (nonZero > 1 ? 2.5 : 0), 0.5)} ${CIRC}`} strokeDashoffset={-s.off}
                        className="cursor-default transition-[stroke-width,opacity] duration-150" style={{ opacity: hov && hov !== s.key ? 0.4 : 1 }}
                        onMouseEnter={() => setHov(s.key)} onMouseLeave={() => setHov(null)} />
                    ))}
                  </svg>
                  <div className="pointer-events-none absolute inset-0 grid place-content-center text-center leading-tight">
                    {active ? (<><span className="text-[12px] text-ink-soft">{active.key}</span><b className="num text-[18px] font-semibold">{inr(active.v, { short: true })}</b><span className="num text-[12px] text-ink-soft">{pctOf(active.v)}%</span></>)
                      : (<><span className="text-[12px] text-ink-soft">Billed</span><b className="num text-[18px] font-semibold">{inr(billed, { short: true })}</b></>)}
                  </div>
                </div>
                <ul className="grid min-w-[160px] flex-1 gap-1 text-[14px]">
                  {parts.map((x) => (
                    <li key={x.key} onMouseEnter={() => setHov(x.key)} onMouseLeave={() => setHov(null)} className={`flex cursor-default items-center gap-2.5 rounded-lg px-2 py-2 transition-colors ${hov === x.key ? 'bg-forest-soft/60' : ''}`}>
                      <i className="h-2.5 w-2.5 rounded-sm" style={{ background: x.col }} />{x.key}
                      <span className="num ml-auto text-[13px] text-ink-soft">{pctOf(x.v)}%</span>
                      <b className="num w-16 text-right font-medium">{inr(x.v, { short: true })}</b>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-auto border-t border-line pt-4">
                <h3 className="mb-2 text-[13px] font-medium text-ink-soft">Order type</h3>
                {typeEntries.length === 0 ? <p className="text-[14px] text-ink-soft">No orders yet.</p> : typeEntries.map(([k, v]) => (
                  <div key={k} className="py-1.5">
                    <p className="flex justify-between text-[14px]"><span>{TYPE_LABEL[k] ?? k}</span><span className="num text-ink-soft">{v.orders} {v.orders === 1 ? 'order' : 'orders'} · {inr(v.salesPaise, { short: true })}</span></p>
                    <div className="mt-1.5 h-1 rounded-full bg-[#eceae2]"><div className="h-1 rounded-full bg-[#6f9a80]" style={{ width: `${typeTotal ? Math.max(2, (v.salesPaise / typeTotal) * 100) : 0}%` }} /></div>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          {/* row 4: act on it, who sold it, what is left */}
          <div className="grid gap-5 min-[900px]:grid-cols-2 min-[1280px]:grid-cols-3">
            <Section i={9} title="Needs attention" right={attention.length > 0 ? <span className="num rounded-md bg-[#fbf0dc] px-2 py-0.5 text-[12px] font-semibold text-[#8f5a0d]">{attention.length}</span> : undefined}>
              {attention.length === 0 ? <Empty text="Nothing needs attention." /> : (
                <ul className="grid gap-2">
                  {attention.map((a) => {
                    const chip = a.tone === 'bad' ? 'bg-[#faeae7]' : a.tone === 'warn' ? 'bg-[#fbf0dc]' : 'bg-[#eceae2]';
                    const dot = a.tone === 'bad' ? 'bg-bad' : a.tone === 'warn' ? 'bg-warn' : 'bg-[#9aa093]';
                    const inner = (<><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${chip}`}><i className={`h-2.5 w-2.5 rounded-full ${dot}`} /></span><div className="min-w-0 flex-1"><p className="text-[14px] font-medium">{a.label}</p><p className="truncate text-[13px] text-ink-soft">{a.detail}</p></div>{a.to && <CaretRight size={16} className="shrink-0 text-ink-soft" />}</>);
                    return <li key={a.label}>{a.to ? <Link to={a.to} className="press flex min-h-14 items-center gap-3 rounded-lg border border-line px-3 py-2.5 transition-colors hover:bg-black/[0.02]">{inner}</Link> : <div className="flex min-h-14 items-center gap-3 rounded-lg border border-line px-3 py-2.5">{inner}</div>}</li>;
                  })}
                </ul>
              )}
            </Section>

            <Section i={10} title="Sales by staff">
              {!d.byStaff?.length ? <Empty text="No orders yet." /> : (
                <ul className="-mx-2 grid gap-1">
                  {d.byStaff.slice(0, 5).map((x: any) => (
                    <BarRow key={x.name} label={x.name} pct={(x.salesPaise / maxStaff) * 100} sub={<span className="num text-[13px] text-ink-soft">{x.orders} {x.orders === 1 ? 'order' : 'orders'}</span>} value={inr(x.salesPaise, { short: true })}
                      tip={<><p className="mb-1.5 text-[12px] font-semibold">{x.name}</p><TipRow k="Sales" v={inr(x.salesPaise, { short: true })} strong /><TipRow k="Orders" v={x.orders} /><TipRow k="Average order" v={x.orders ? inr(Math.round(x.salesPaise / x.orders), { short: true }) : '–'} /></>} />
                  ))}
                </ul>
              )}
            </Section>

            {/* profit stays honest: partial figures, never invented */}
            <Section i={11} title="Money left" right={<span className="rounded-md bg-[#f1f0e9] px-2 py-0.5 text-[12px] text-ink-soft">Partial, not final</span>} className="min-[900px]:max-[1279px]:col-span-2">
              <div className="grid gap-3">
                <div className="rounded-lg bg-forest-soft/60 p-4"><p className="text-[13px] text-ink-soft">{d.profit.partial.label}</p><p className={`num mt-1 text-[26px] font-semibold leading-tight ${d.profit.partial.paise < 0 ? 'text-bad' : ''}`}>{inr(d.profit.partial.paise)}</p></div>
                <div className="rounded-lg bg-[#f6f5ef] p-4"><p className="text-[13px] text-ink-soft">{d.profit.cashView.label}</p><p className={`num mt-1 text-[26px] font-semibold leading-tight ${d.profit.cashView.paise < 0 ? 'text-bad' : ''}`}>{inr(d.profit.cashView.paise)}</p></div>
              </div>
              <p className="mt-auto pt-4 text-[13px] text-ink-soft">{d.profit.reason}</p>
            </Section>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-4 py-3 text-[14px] shadow-soft">
            <span className="mr-1 text-ink-soft">Download</span>
            {['sales', 'products', 'payments', 'expenses', 'stock'].map((k) => <a key={k} href={`/api/v1/reports/export/${k}.csv?${qs}`} className="press inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 font-medium capitalize text-forest ring-1 ring-line hover:bg-forest-soft"><DownloadSimple size={16} />{k}</a>)}
            {can('reports.send') && <button onClick={() => send.mutate()} disabled={send.isPending} className="press ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-forest-soft px-3 font-medium text-forest hover:bg-[#dbe7de] disabled:opacity-50"><PaperPlaneTilt size={16} />Send today's report to owner</button>}
          </div>
        </div>
      )}
    </div>
  );
}
