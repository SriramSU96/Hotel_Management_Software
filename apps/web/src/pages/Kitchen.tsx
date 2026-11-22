import TypePill from '../components/TypePill';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRinging, BellSlash, CookingPot, Printer } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { timeAgo } from '../lib/format';
import { useLang, useT } from '../lib/i18n';
import { Badge, Button, Empty, ErrorNote, PageHead, Skeleton } from '../components/ui';
import { errText, toast } from '../lib/toast';

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.start(); o.stop(ctx.currentTime + 0.5);
  } catch { /* audio blocked until first tap */ }
}

export default function Kitchen() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { can } = useAuth();
  const qc = useQueryClient();
  const [, tick] = useState(0);
  const [sound, setSound] = useState(() => { try { return localStorage.getItem('ammas.kds.sound') !== '0'; } catch { return true; } });
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 20_000); return () => clearInterval(i); }, []);
  const q = useQuery({ queryKey: ['kitchen'], queryFn: () => api<{ tickets: any[] }>('/kitchen/tickets'), refetchInterval: 20_000 });

  // alert once per newly arrived ticket (never on first load, never twice for the same ticket)
  useEffect(() => {
    if (!q.data) return;
    const ids = new Set(q.data.tickets.map((x) => x.id as string));
    if (seen.current && sound && [...ids].some((i) => !seen.current!.has(i))) beep();
    seen.current = ids;
  }, [q.data, sound]);

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'PREPARING' | 'READY' }) => api(`/kitchen/tickets/${id}/status`, { method: 'PUT', body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kitchen'] }), onError: (e) => toast.error(errText(e)),
  });
  const reprint = useMutation({
    mutationFn: (id: string) => api(`/kitchen/tickets/${id}/print`, { method: 'POST', body: {} }),
    onSuccess: () => toast.ok(t('Printing...')), onError: (e) => toast.error(errText(e)),
  });

  const tickets = q.data?.tickets ?? [];
  const active = tickets.filter((x) => x.status !== 'READY');
  const ready = tickets.filter((x) => x.status === 'READY');

  return (
    <div>
      <PageHead title="Kitchen display" sub="New orders." action={
        <Button variant="ghost" size="sm" onClick={() => { const v = !sound; setSound(v); try { localStorage.setItem('ammas.kds.sound', v ? '1' : '0'); } catch { /* ignore */ } if (v) beep(); }}>
          {sound ? <BellRinging size={20} /> : <BellSlash size={20} />}{sound ? 'Sound on' : 'Sound off'}
        </Button>} />
      {q.isLoading ? <Skeleton className="h-56" /> : q.error ? <ErrorNote error={q.error} />
      : tickets.length === 0 ? <Empty title={t('No orders in the kitchen')} hint="New tickets appear here with a sound." icon={<CookingPot size={40} />} />
      : (
        <>
          <div className="grid gap-3.5 min-[640px]:grid-cols-2 min-[1280px]:grid-cols-3">
            {active.map((k) => <Ticket key={k.id} k={k} lang={lang} onMove={(s) => move.mutate({ id: k.id, status: s })} onPrint={can('kot.reprint') ? () => reprint.mutate(k.id) : undefined} canUpdate={can('kitchen.update')} busy={move.isPending} />)}
          </div>
          {ready.length > 0 && (
            <>
              <h2 className="mb-3 mt-8 text-[17px] font-semibold">{t('Ready')}</h2>
              <div className="grid gap-3.5 min-[640px]:grid-cols-2 min-[1280px]:grid-cols-3">{ready.map((k) => <Ticket key={k.id} k={k} lang={lang} onMove={(s) => move.mutate({ id: k.id, status: s })} canUpdate={can('kitchen.update')} busy={move.isPending} />)}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Ticket({ k, lang, onMove, onPrint, canUpdate, busy }: { k: any; lang: string; onMove: (s: 'PREPARING' | 'READY') => void; onPrint?: () => void; canUpdate: boolean; busy: boolean }) {
  const t = useT();
  const mins = Math.floor((Date.now() - new Date(k.confirmedAt).getTime()) / 60000);
  const late = k.status !== 'READY' && mins >= 15;
  return (
    <article className={`rise flex flex-col rounded-xl border bg-card p-4 min-[640px]:p-5 ${late ? 'border-bad ring-1 ring-bad' : 'border-line'} ${k.status === 'READY' ? 'opacity-80' : ''}`}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="num text-3xl font-bold text-forest">#{k.kotNo}</p>
          <div className="mt-1"><TypePill type={k.type} table={k.tableLabel} /></div>
        </div>
        <div className="text-right">
          <Badge tone={k.status === 'READY' ? 'ok' : k.status === 'PREPARING' ? 'info' : 'saffron'}>{k.status === 'CONFIRMED' ? t('New') : k.status === 'PREPARING' ? t('Preparing') : t('Ready')}</Badge>
          <p className={`num mt-2 text-sm font-bold ${late ? 'text-bad' : 'text-ink-soft'}`}>{t('Waiting')} {timeAgo(k.confirmedAt)}</p>
        </div>
      </header>
      <ul className="my-4 flex flex-1 flex-col gap-2">
        {k.items.map((i: any, idx: number) => (
          <li key={idx} className="text-xl leading-snug"><b className="num mr-2 text-2xl">{i.qty}×</b><span className={lang === 'ta' ? 'font-ta' : ''}>{lang === 'ta' && i.nameTa ? i.nameTa : i.name}</span>
            {i.note && <p className="ml-9 text-base font-medium text-warn">{i.note}</p>}</li>
        ))}
      </ul>
      {canUpdate && (
        <div className="flex gap-2">
          {k.status === 'CONFIRMED' && <Button size="lg" variant="soft" className="flex-1" disabled={busy} onClick={() => onMove('PREPARING')}>{t('Accept')}</Button>}
          {k.status !== 'READY' && <Button size="lg" className="flex-1" disabled={busy} onClick={() => onMove('READY')}>{t('Ready')}</Button>}
          {k.status === 'READY' && <Button variant="ghost" className="flex-1" disabled={busy} onClick={() => onMove('PREPARING')}>{t('Preparing')}</Button>}
          {onPrint && <Button variant="ghost" size="lg" onClick={onPrint} aria-label="Print kitchen ticket"><Printer size={22} /></Button>}
        </div>
      )}
    </article>
  );
}
