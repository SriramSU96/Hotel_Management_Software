import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle, Star } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useLang, useT } from '../lib/i18n';
import { Button, ErrorNote, Field, inputCls } from '../components/ui';

export default function PublicFeedback() {
  const { token } = useParams();
  const t = useT();
  const { lang, setLang } = useLang();
  const info = useQuery({ queryKey: ['pub-table', token], queryFn: () => api<{ restaurantName: string; tableLabel: string }>(`/public/table/${token}`), retry: false });
  const [f, setF] = useState({ rating: 0, notes: '', name: '', phone: '', email: '', profession: '', consentStoreContact: false, consentMarketing: false, website: '' });
  const [done, setDone] = useState(false);
  const send = useMutation({
    mutationFn: () => api(`/public/feedback/${token}`, { body: { ...f, rating: f.rating || undefined, notes: f.notes || undefined, name: f.name || undefined, phone: f.phone || undefined, email: f.email || '', profession: f.profession || undefined } }),
    onSuccess: () => setDone(true),
  });
  const hasContact = !!(f.name || f.phone || f.email || f.profession);

  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg px-5 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div><p className="font-brand text-3xl text-forest">{info.data?.restaurantName ?? 'AMMAS'}</p>{info.data && <p className="text-sm text-ink-soft">{t('Table')} {info.data.tableLabel}</p>}</div>
        <div className="inline-flex rounded-lg bg-black/5 p-1">{(['en', 'ta'] as const).map((l) => <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} className={`press min-h-10 rounded-lg px-3 text-sm font-bold ${lang === l ? 'bg-forest text-white' : ''}`}>{l === 'en' ? 'EN' : 'தமிழ்'}</button>)}</div>
      </div>
      {info.error ? <p className="rounded-[10px] bg-[#f7e3df] p-6 text-bad">This QR code is not active. Please ask the staff.</p>
      : done ? (
        <div className="rise rounded-[10px] bg-forest-soft p-8 text-center text-forest"><CheckCircle size={56} weight="fill" className="mx-auto" /><p className="mt-3 font-brand text-3xl">{t('Thank you!')}</p><p className="mt-2">We read every note.</p></div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); send.mutate(); }} className="flex flex-col gap-6">
          <p className="text-ink-soft">How was your meal?</p>
          <div><p className="mb-2 font-medium">{t('Rating')}</p><div className="flex gap-1" role="radiogroup" aria-label={t('Rating')}>
            {[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} role="radio" aria-checked={f.rating === n} aria-label={`${n}`} onClick={() => setF({ ...f, rating: n })} className="press grid h-14 w-14 place-items-center"><Star size={40} weight={n <= f.rating ? 'fill' : 'regular'} className={n <= f.rating ? 'text-gold' : 'text-line'} /></button>)}</div></div>
          <Field label={t('Notes')}><textarea className={`${inputCls} min-h-28 py-3`} maxLength={1000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <details className="rounded-[10px] border border-line bg-card p-5">
            <summary className="cursor-pointer font-medium">Share your details (optional)</summary>
            <div className="mt-4 flex flex-col gap-4">
              <p className="text-sm text-ink-soft">Optional. Only to thank you.</p>
              <Field label={t('Name')}><input className={inputCls} autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label={t('Phone')}><input className={inputCls} inputMode="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
              <Field label={t('Email')}><input className={inputCls} type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
              <Field label={t('Profession')}><input className={inputCls} value={f.profession} onChange={(e) => setF({ ...f, profession: e.target.value })} /></Field>
              <label className="flex items-start gap-3"><input type="checkbox" className="shrink-0 mt-1 h-6 w-6 accent-[#1f3d2e]" checked={f.consentStoreContact} onChange={(e) => setF({ ...f, consentStoreContact: e.target.checked })} /><span className="text-sm">You may keep my details to contact me about my feedback.</span></label>
              <label className="flex items-start gap-3"><input type="checkbox" className="shrink-0 mt-1 h-6 w-6 accent-[#1f3d2e]" checked={f.consentMarketing} disabled={!f.consentStoreContact} onChange={(e) => setF({ ...f, consentMarketing: e.target.checked })} /><span className="text-sm">You may send me offers and news on WhatsApp or email. (Separate choice, optional.)</span></label>
              {hasContact && !f.consentStoreContact && <p className="text-sm text-warn">Without the tick, your contact is not saved.</p>}
            </div>
          </details>
          {/* honeypot: real people never see or fill this */}
          <input tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px]" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
          <ErrorNote error={send.error} />
          <Button size="lg" type="submit" disabled={send.isPending || (!f.rating && !f.notes.trim())}>{t('Submit')}</Button>
        </form>
      )}
    </div>
  );
}
