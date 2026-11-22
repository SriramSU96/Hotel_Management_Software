import { Link } from 'react-router-dom';
import { ArrowRight, SignOut } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavItems } from '../components/Shell';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useLang, useT } from '../lib/i18n';
import { PageHead } from '../components/ui';

const HINT: Record<string, string> = {
  '/dashboard': 'Sales, rush hours and best sellers', '/pos': 'Take a new order', '/orders': 'Open and past orders', '/kitchen': 'Live kitchen tickets',
  '/stock': 'Add stock, count, waste', '/menu': 'Food, photos and prices', '/tables': 'Tables and QR cards', '/money': 'Cash drawer and expenses',
  '/customers': 'Table QR feedback', '/prints': 'Pending and failed prints', '/settings': 'Business, reports, team',
};

/** Phone "More" screen, same idea as the reference: a grid of every tool. */
export default function More() {
  const t = useT();
  const items = useNavItems();
  const { me } = useAuth();
  const { lang, setLang } = useLang();
  const qc = useQueryClient();
  const logout = async () => { await api('/auth/logout', { method: 'POST', body: {} }).catch(() => {}); qc.clear(); window.location.href = '/'; };
  return (
    <div>
      <PageHead eyebrow="ADMINISTRATION" title="More tools" sub={`Signed in as ${me?.name}`} />
      <div className="grid gap-3 min-[640px]:grid-cols-2">
        {items.map((i) => (
          <Link key={i.to} to={i.to} className="press relative grid min-h-24 gap-1.5 rounded-[10px] border border-line bg-card p-5 hover:border-[#a9bcae]">
            <span className="text-forest">{i.icon}</span><b className="text-[15px]">{i.label}</b><small className="text-[12px] text-ink-soft">{HINT[i.to]}</small>
            <ArrowRight size={16} className="absolute right-5 top-5 text-[#8b9186]" />
          </Link>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-line bg-card p-0.5">
          {(['en', 'ta'] as const).map((l) => <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} className={`press min-h-11 rounded px-4 text-sm font-bold ${lang === l ? 'bg-forest text-white' : 'text-ink-soft'} ${l === 'ta' ? 'font-ta' : ''}`}>{l === 'en' ? 'English' : 'தமிழ்'}</button>)}
        </div>
        <button onClick={logout} className="press inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-card px-4 text-sm font-medium"><SignOut size={18} />{t('Sign out')}</button>
      </div>
    </div>
  );
}
