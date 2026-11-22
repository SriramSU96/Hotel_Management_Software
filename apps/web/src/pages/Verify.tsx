import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle, MagnifyingGlass, WarningCircle, WhatsappLogo, XCircle, ChatText } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { fmtTime, inr } from '../lib/format';
import { Button, ErrorNote, PageHead, Skeleton, inputCls } from '../components/ui';
import { errText, toast } from '../lib/toast';

type Verdict = 'GENUINE' | 'ALREADY_VERIFIED' | 'NOT_SENT' | 'NOT_PAID' | 'CANCELLED' | 'REFUNDED' | 'NOT_FOUND';
interface Bill {
  id: string; billNo: string; type: string; totalPaise: number; confirmedAt?: string; channel: 'WHATSAPP' | 'SMS' | null; sentAt: string | null;
  sentByName: string | null; phoneLast4: string | null; verifiedAt: string | null; verifiedByName: string | null;
  items: { name: string; nameTa?: string; qty: number; note?: string }[];
}
interface Result { verdict: Verdict; bill: Bill | null }

const LOOK: Record<Verdict, { tone: 'ok' | 'warn' | 'bad'; title: string; sub: string }> = {
  GENUINE: { tone: 'ok', title: 'GENUINE BILL', sub: 'Real and paid.' },
  ALREADY_VERIFIED: { tone: 'warn', title: 'ALREADY VERIFIED', sub: 'Already used. Do not accept.' },
  NOT_SENT: { tone: 'bad', title: 'NOT SENT BY AMMAS', sub: 'We did not send this bill. Fake.' },
  NOT_PAID: { tone: 'bad', title: 'NOT PAID', sub: 'Payment is not complete.' },
  CANCELLED: { tone: 'bad', title: 'CANCELLED', sub: 'This order was cancelled.' },
  REFUNDED: { tone: 'bad', title: 'REFUNDED', sub: 'This bill was refunded.' },
  NOT_FOUND: { tone: 'bad', title: 'BILL NOT FOUND', sub: 'No such bill. Fake or wrong number.' },
};
const TONE = {
  ok: { box: 'border-[#5a956d] bg-[#e9f3ec] text-[#14532d]', Icon: CheckCircle },
  warn: { box: 'border-[#d8a14b] bg-[#fbf1dc] text-[#7a4a06]', Icon: WarningCircle },
  bad: { box: 'border-[#d97b6c] bg-[#fbe9e6] text-[#8a1f12]', Icon: XCircle },
} as const;
const short = (billNo: string) => billNo.slice(-4).replace(/^0+/, '') || '0';

/** Digital bills only: cashier or admin taps the bill the customer shows, the system says if AMMAS really sent it. */
export default function Verify() {
  const qc = useQueryClient();
  const [typed, setTyped] = useState('');
  const [res, setRes] = useState<Result | null>(null);
  const [looking, setLooking] = useState(false);
  const list = useQuery({ queryKey: ['digital-bills'], queryFn: () => api<{ bills: Bill[] }>('/bills/digital'), refetchInterval: 15000 });

  async function open(bill: string) {
    if (!bill.trim()) return;
    setLooking(true);
    try { setRes(await api<Result>(`/bills/verify?bill=${encodeURIComponent(bill.trim())}`)); }
    catch (err) { setRes(null); toast.error(errText(err)); } finally { setLooking(false); }
  }
  function submit(e: FormEvent) { e.preventDefault(); void open(typed); }
  const mark = useMutation({
    mutationFn: (id: string) => api<Result>(`/bills/${id}/verified`, { method: 'POST', body: {} }),
    onSuccess: (r) => { toast.ok('Bill verified'); setRes(r.bill ? { verdict: 'ALREADY_VERIFIED', bill: r.bill } : null); qc.invalidateQueries({ queryKey: ['digital-bills'] }); },
    onError: (err) => { toast.error(errText(err)); if (res?.bill) void open(res.bill.billNo); qc.invalidateQueries({ queryKey: ['digital-bills'] }); },
  });
  const back = () => { setRes(null); setTyped(''); };

  if (res) {
    const look = LOOK[res.verdict]; const T = TONE[look.tone]; const b = res.bill;
    const justDone = mark.isSuccess && mark.data?.bill?.id === b?.id;
    return (
      <div className="mx-auto max-w-2xl pb-24">
        <button onClick={back} className="press mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-forest"><ArrowLeft size={18} />All digital bills</button>
        <section aria-live="polite" className="rise">
          <div className={`flex items-start gap-3 rounded-[10px] border-2 p-4 ${T.box}`}>
            <T.Icon size={40} weight="fill" className="shrink-0" />
            <div className="min-w-0">
              <p className="text-2xl font-bold leading-tight">{justDone ? 'VERIFIED ✓' : look.title}</p>
              <p className="mt-1 text-[15px]">{justDone ? 'Saved. Cannot be used again.' : look.sub}</p>
              {res.verdict === 'ALREADY_VERIFIED' && b?.verifiedAt && !justDone && <p className="mt-1 text-sm font-medium">Verified at {fmtTime(b.verifiedAt)}{b.verifiedByName ? ` by ${b.verifiedByName}` : ''}.</p>}
            </div>
          </div>
          {b && (
            <div className="mt-3 rounded-[10px] border border-line bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="num text-lg font-bold">{b.billNo}</p>
                <p className="text-sm text-ink-soft">{b.type === 'PARCEL' ? 'Parcel' : 'Eat here'}{b.confirmedAt ? ` · ${fmtTime(b.confirmedAt)}` : ''}</p>
              </div>
              <ul className="mt-3 divide-y divide-line">
                {b.items.map((i, k) => (
                  <li key={k} className="flex items-start justify-between gap-3 py-2.5">
                    <span className="min-w-0 text-xl font-bold leading-snug">{i.name}{i.nameTa && <span className="block font-ta text-sm font-medium text-ink-soft">{i.nameTa}</span>}{i.note && <span className="block text-sm font-medium text-gold">{i.note}</span>}</span>
                    <span className="num shrink-0 text-2xl font-bold text-forest">× {i.qty}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between border-t border-line pt-3"><span className="text-sm font-bold text-ink-soft">TOTAL</span><span className="num text-xl font-bold">{inr(b.totalPaise)}</span></div>
              {b.sentAt && <p className="mt-2 text-xs text-ink-soft">Sent on {b.channel === 'SMS' ? 'SMS' : 'WhatsApp'} at {fmtTime(b.sentAt)}{b.sentByName ? ` by ${b.sentByName}` : ''}{b.phoneLast4 ? ` to ••••${b.phoneLast4}` : ''}</p>}
            </div>
          )}
          {b && res.verdict === 'GENUINE' && <Button size="lg" className="mt-4 w-full" onClick={() => mark.mutate(b.id)} disabled={mark.isPending}><CheckCircle size={22} weight="bold" />{mark.isPending ? '...' : 'Verified – accept this bill'}</Button>}
          <Button size="lg" variant="soft" className="mt-3 w-full" onClick={back}>Check another bill</Button>
        </section>
      </div>
    );
  }

  const bills = list.data?.bills ?? [];
  const pending = bills.filter((b) => !b.verifiedAt); const done = bills.filter((b) => b.verifiedAt);
  const Row = ({ b }: { b: Bill }) => (
    <li>
      <button onClick={() => open(b.billNo)} className={`press flex min-h-14 w-full items-center gap-3 rounded-[10px] border border-l-[5px] border-line bg-card p-3 text-left ${b.verifiedAt ? 'border-l-[#4f9b68]' : 'border-l-[#e0821e] bg-[#fffaf2]'}`}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-forest-soft text-forest">{b.channel === 'SMS' ? <ChatText size={20} /> : <WhatsappLogo size={20} />}</span>
        <span className="min-w-0 flex-1"><span className="num block text-lg font-bold">#{short(b.billNo)}</span><span className="block truncate text-xs text-ink-soft">{b.sentAt ? fmtTime(b.sentAt) : ''}{b.phoneLast4 ? ` · ••••${b.phoneLast4}` : ''}</span></span>
        <span className="text-right"><span className="num block font-bold">{inr(b.totalPaise)}</span>{b.verifiedAt ? <span className="text-xs font-bold text-forest">Verified</span> : <span className="text-xs font-bold text-[#8a5a0b]">Tap to check</span>}</span>
      </button>
    </li>
  );

  return (
    <div className="mx-auto max-w-2xl pb-24">
      <PageHead title="Verify digital bill" sub="Tap a bill to check it." />
      <form onSubmit={submit} className="rounded-[10px] border border-line bg-card p-4">
        <label htmlFor="bill" className="text-[12px] font-bold text-[#747b70]">Type the bill number</label>
        <div className="mt-2 flex gap-3">
          <input id="bill" autoComplete="off" inputMode="numeric" enterKeyHint="search" className={`${inputCls} num min-h-12 flex-1 text-xl`} placeholder="12" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <Button type="submit" size="lg" disabled={looking || !typed.trim()}><MagnifyingGlass size={20} weight="bold" />Check</Button>
        </div>
      </form>
      <h2 className="mt-6 mb-2 text-sm font-bold text-ink-soft">To check ({pending.length})</h2>
      {list.isLoading ? <Skeleton className="h-16 w-full" /> : list.isError ? <ErrorNote error={list.error} /> : pending.length ? <ul className="space-y-2">{pending.map((b) => <Row key={b.id} b={b} />)}</ul> : <p className="rounded-[10px] border border-dashed border-line p-4 text-sm text-ink-soft">Nothing to check.</p>}
      {done.length > 0 && (<><h2 className="mt-6 mb-2 text-sm font-bold text-ink-soft">Verified ({done.length})</h2><ul className="space-y-2">{done.map((b) => <Row key={b.id} b={b} />)}</ul></>)}
    </div>
  );
}
