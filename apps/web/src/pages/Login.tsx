import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useT, useLang } from '../lib/i18n';
import { Button, ErrorNote, Field, inputCls } from '../components/ui';

export default function Login() {
  const t = useT();
  const { lang, setLang } = useLang();
  const qc = useQueryClient();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await api<{ user: { language: 'en' | 'ta' } }>('/auth/login', { body: { username, password } });
      // device remembers its own language choice; first login on a device adopts the account default
      if (!localStorage.getItem('ammas.lang')) setLang(r.user.language);
      await qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-[100dvh] min-[768px]:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-forest p-12 text-white min-[768px]:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-lg border border-gold/30" />
        <div className="absolute -right-10 -top-10 h-72 w-72 rounded-lg border border-gold/20" />
        <p className="text-xs tracking-[0.3em] text-gold">COIMBATORE</p>
        <div>
          <h1 className="font-brand text-7xl leading-[0.95]">AMMAS</h1>
          <p className="mt-6 max-w-sm text-lg text-white/75">Orders, kitchen, stock and the day's numbers, in one calm place.</p>
        </div>
        <p className="text-sm text-white/50">Fresh, home-style food since the first day.</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="rise w-full max-w-sm">
          <div className="mb-8 min-[768px]:hidden">
            <h1 className="font-brand text-5xl text-forest">AMMAS</h1>
            <p className="mt-1 text-xs tracking-[0.3em] text-gold">COIMBATORE</p>
          </div>
          <h2 className="mb-6 text-2xl font-medium">{t('Sign in')}</h2>
          <div className="flex flex-col gap-5">
            <Field label={t('Username')}><input className={inputCls} value={username} onChange={(e) => setU(e.target.value)} autoComplete="username" autoCapitalize="none" required /></Field>
            <Field label={t('Password')}><input className={inputCls} type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete="current-password" required /></Field>
            <ErrorNote error={err} />
            <Button size="lg" disabled={busy} type="submit" className="mt-2 justify-between">
              <span>{t('Sign in')}</span>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white/15"><ArrowRight size={18} /></span>
            </Button>
          </div>
          <div className="mt-8 flex justify-center gap-2">
            {(['en', 'ta'] as const).map((l) => (
              <button type="button" key={l} onClick={() => setLang(l)} aria-pressed={lang === l} className={`press min-h-11 rounded-lg px-5 text-sm font-medium ring-1 ring-line ${lang === l ? 'bg-forest text-white' : ''} ${l === 'ta' ? 'font-ta' : ''}`}>{l === 'en' ? 'English' : 'தமிழ்'}</button>
            ))}
          </div>
        </form>
      </section>
    </div>
  );
}
