import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CookingPot, Eye, EyeSlash, Lock, ShieldCheck, User } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useT, useLang } from '../lib/i18n';
import { Button, ErrorNote, Field, inputCls } from '../components/ui';

/** Only images.unsplash.com is allowed by the site's security policy, so the full-screen photos come from there. */
const photo = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1920&q=75`;
const BACKGROUNDS = [
  photo('photo-1604908176997-125f25cc6f3d'), // chicken rice
  photo('photo-1589302168068-964664d93dc0'), // biryani
  photo('photo-1546833999-b9f581a1996d'), // mini meals plate
];

/** Login-only words (kept here so the shared dictionary stays small). English is the fallback. */
const WORDS = {
  en: {
    famous: 'Famous for', rice: 'Chicken Rice', and: '&', minis: 'Mini Meals',
    sub: "Orders, kitchen, stock and the day's numbers, in one calm place.",
    welcome: 'Welcome back', hint: 'Sign in to run your shop today.', secure: 'Secure sign in',
    show: 'Show password', hide: 'Hide password', credit: 'Photos: Unsplash',
  },
  ta: {
    famous: 'பிரபலமானது', rice: 'சிக்கன் ரைஸ்', and: '&', minis: 'மினி மீல்ஸ்',
    sub: 'ஆர்டர்கள், சமையலறை, சரக்கு மற்றும் இன்றைய கணக்கு, எல்லாம் ஒரே இடத்தில்.',
    welcome: 'மீண்டும் வருக', hint: 'இன்றைய கடையை நடத்த உள்நுழையவும்.', secure: 'பாதுகாப்பான உள்நுழைவு',
    show: 'கடவுச்சொல்லை காட்டு', hide: 'கடவுச்சொல்லை மறை', credit: 'படங்கள்: Unsplash',
  },
} as const;

const CSS = `
@keyframes loginFade { 0%,30% { opacity: 1 } 36%,94% { opacity: 0 } 100% { opacity: 1 } }
@keyframes loginZoom { 0% { transform: scale(1.02) } 50% { transform: scale(1.1) } 100% { transform: scale(1.02) } }
.login-bg { animation: loginFade 18s ease-in-out infinite, loginZoom 18s ease-in-out infinite; will-change: opacity, transform; }
@media (prefers-reduced-motion: reduce) { .login-bg { animation: none !important; opacity: 0 } .login-bg:first-child { opacity: 1 } }
`;

export default function Login() {
  const t = useT();
  const { lang, setLang } = useLang();
  const w = WORDS[lang];
  const qc = useQueryClient();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [show, setShow] = useState(false);
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

  const iconCls = 'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft';

  return (
    <div className="relative isolate min-h-[100dvh] overflow-hidden bg-forest-deep text-white">
      <style>{CSS}</style>

      {/* full-screen photos that slowly cross-fade; the green colour shows through if a photo cannot load */}
      <div className="absolute inset-0 -z-20" aria-hidden>
        {BACKGROUNDS.map((src, i) => (
          <img key={src} src={src} alt="" decoding="async" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }}
            className="login-bg absolute inset-0 h-full w-full object-cover" style={{ animationDelay: ['0s', '-12s', '-6s'][i] }} />
        ))}
      </div>
      {/* dark green wash so text stays easy to read on every photo */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-forest-deep/95 via-forest-deep/70 to-forest-deep/45" aria-hidden />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/50 via-transparent to-black/25" aria-hidden />

      {/* language switch */}
      <div className="absolute right-4 top-4 z-10 flex rounded-full bg-black/30 p-1 backdrop-blur-md min-[900px]:right-8 min-[900px]:top-6" role="group" aria-label="Language">
        {(['en', 'ta'] as const).map((l) => (
          <button type="button" key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
            className={`press min-h-9 rounded-full px-4 text-[13px] font-medium transition-colors ${l === 'ta' ? 'font-ta' : ''} ${lang === l ? 'bg-white text-forest-deep' : 'text-white/85 hover:bg-white/10'}`}>
            {l === 'en' ? 'English' : 'தமிழ்'}
          </button>
        ))}
      </div>

      <div className="mx-auto grid min-h-[100dvh] w-full max-w-[1400px] items-center gap-8 px-5 py-16 min-[900px]:grid-cols-[1.15fr_.85fr] min-[900px]:gap-12 min-[900px]:px-12">
        {/* brand + slogan */}
        <section className="rise flex flex-col gap-6 min-[900px]:gap-8">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/12 ring-1 ring-white/25 backdrop-blur"><CookingPot size={24} weight="duotone" /></span>
            <div className="leading-tight">
              <p className="font-brand text-[26px]">AMMAS</p>
              <p className="text-[11px] tracking-[0.32em] text-[#f0b85a]">COIMBATORE</p>
            </div>
          </div>

          <div>
            <p className="mb-3 text-[13px] font-medium uppercase tracking-[0.22em] text-white/70">{w.famous}</p>
            <h1 className="font-brand text-[40px] leading-[1.05] drop-shadow-[0_2px_18px_rgba(0,0,0,0.35)] min-[640px]:text-[56px] min-[1100px]:text-[72px]">
              <span className="text-[#f6c668]">{w.rice}</span>
              <span className="mx-3 text-white/70">{w.and}</span>
              <span className="block">{w.minis}</span>
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/80 min-[900px]:text-base">{w.sub}</p>
          </div>

          <ul className="hidden flex-wrap gap-2 min-[900px]:flex" aria-hidden>
            {[w.rice, w.minis, lang === 'ta' ? 'பிரியாணி' : 'Biryani'].map((x) => (
              <li key={x} className="rounded-full bg-white/10 px-4 py-1.5 text-[13px] text-white/90 ring-1 ring-white/20 backdrop-blur-md">{x}</li>
            ))}
          </ul>
        </section>

        {/* sign-in card */}
        <section className="rise flex justify-center min-[900px]:justify-end" style={{ ['--i' as string]: 2 }}>
          <form onSubmit={submit} className="w-full max-w-[400px] rounded-2xl bg-white/92 p-7 text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)] ring-1 ring-white/60 backdrop-blur-xl min-[900px]:p-8">
            <h2 className="text-[22px] font-semibold leading-tight">{w.welcome}</h2>
            <p className="mb-6 mt-1 text-[14px] text-ink-soft">{w.hint}</p>

            <div className="flex flex-col gap-4">
              <Field label={t('Username')}>
                <div className="relative">
                  <User size={18} className={iconCls} aria-hidden />
                  <input className={inputCls} style={{ paddingLeft: 40 }} value={username} onChange={(e) => setU(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required />
                </div>
              </Field>
              <Field label={t('Password')}>
                <div className="relative">
                  <Lock size={18} className={iconCls} aria-hidden />
                  <input className={inputCls} style={{ paddingLeft: 40, paddingRight: 44 }} type={show ? 'text' : 'password'} value={password} onChange={(e) => setP(e.target.value)} autoComplete="current-password" required />
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? w.hide : w.show} title={show ? w.hide : w.show}
                    className="press absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-ink-soft hover:bg-black/5">
                    {show ? <EyeSlash size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
              <ErrorNote error={err} />
              <Button size="lg" disabled={busy} type="submit" className="mt-1 justify-between">
                <span>{busy ? '…' : t('Sign in')}</span>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15"><ArrowRight size={18} /></span>
              </Button>
            </div>

            <p className="mt-6 flex items-center justify-center gap-1.5 text-[12px] text-ink-soft"><ShieldCheck size={15} className="text-forest" />{w.secure} · AMMAS Coimbatore</p>
          </form>
        </section>
      </div>

      <p className="absolute bottom-3 left-5 text-[11px] text-white/45 min-[900px]:left-12">{w.credit}</p>
    </div>
  );
}
