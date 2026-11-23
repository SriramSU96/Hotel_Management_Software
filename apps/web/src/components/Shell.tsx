import { useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ChartLineUp, CaretLeft, CaretRight, CookingPot, DotsThree, Gear, MapPin, Package, Plus, Printer, Receipt, SignOut, Table, Users, Wallet, WifiSlash, ForkKnife, SquaresFour } from '@phosphor-icons/react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useLang, useT } from '../lib/i18n';
import { useLive, useOnline } from '../lib/live';
import { useSettings } from '../lib/queries';

export interface NavItem { to: string; label: string; short: string; icon: ReactNode; perm: string[]; group: 'main' | 'tools' }

export function useNavItems(): NavItem[] {
  const { can } = useAuth();
  const t = useT();
  const all: NavItem[] = [
    { to: '/dashboard', label: t('Dashboard'), short: 'Home', icon: <SquaresFour size={21} />, perm: ['reports.view'], group: 'main' },
    { to: '/pos', label: t('New Order'), short: 'Order', icon: <Plus size={21} weight="bold" />, perm: ['orders.create'], group: 'main' },
    { to: '/orders', label: t('Orders'), short: t('Orders'), icon: <Receipt size={21} />, perm: ['orders.create', 'reports.view'], group: 'main' },
    { to: '/verified-report', label: t('Verified report'), short: t('Verified'), icon: <ShieldCheck size={21} />, perm: ['reports.view'], group: 'tools' },
    { to: '/verify', label: t('Verify bill'), short: t('Verify'), icon: <ShieldCheck size={21} />, perm: ['bills.verify'], group: 'main' },
    { to: '/kitchen', label: t('Kitchen'), short: t('Kitchen'), icon: <CookingPot size={21} />, perm: ['kitchen.view'], group: 'main' },
    { to: '/stock', label: t('Stock'), short: t('Stock'), icon: <Package size={21} />, perm: ['stock.view'], group: 'tools' },
    { to: '/menu', label: t('Menu'), short: t('Menu'), icon: <ForkKnife size={21} />, perm: ['menu.edit'], group: 'tools' },
    { to: '/tables', label: t('Tables'), short: t('Tables'), icon: <Table size={21} />, perm: ['tables.manage'], group: 'tools' },
    { to: '/money', label: t('Money'), short: t('Money'), icon: <Wallet size={21} />, perm: ['expenses.manage', 'cash.manage'], group: 'tools' },
    { to: '/customers', label: t('Customers'), short: t('Customers'), icon: <Users size={21} />, perm: ['customers.view'], group: 'tools' },
    { to: '/prints', label: t('Prints'), short: t('Prints'), icon: <Printer size={21} />, perm: ['printers.view', 'orders.create'], group: 'tools' },
    { to: '/settings', label: t('Settings'), short: t('Settings'), icon: <Gear size={21} />, perm: [], group: 'tools' },
  ];
  return all.filter((i) => i.perm.length === 0 || i.perm.some(can));
}

const SECTION: Record<string, string> = {
  '/dashboard': 'Dashboard', '/pos': 'New Order', '/orders': 'Orders', '/kitchen': 'Kitchen', '/verify': 'Verify bill', '/verified-report': 'Verified bills',
  '/stock': 'Stock', '/menu': 'Menu', '/tables': 'Tables', '/money': 'Money', '/customers': 'Customers', '/prints': 'Prints', '/settings': 'Settings', '/more': 'More tools',
};

export default function Shell({ children }: { children: ReactNode }) {
  const { me, can } = useAuth();
  const t = useT();
  const { lang, setLang } = useLang();
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const online = useOnline();
  const live = useLive(true);
  const settings = useSettings().data?.settings;
  const items = useNavItems();

  // The arrow button on the sidebar edge folds the menu into an icon rail (left arrow) and opens it again (right arrow); the choice is remembered.
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('ammas-sidebar') === '1'; } catch { return false; } });
  const toggle = () => setCollapsed((c) => { const n = !c; try { localStorage.setItem('ammas-sidebar', n ? '1' : '0'); } catch { /* private mode */ } return n; });
  const wide = !collapsed;

  const showPrint = can('printers.view') || can('orders.create');
  const ps = useQuery({ queryKey: ['print-status'], queryFn: () => api<any>('/printing/status'), enabled: showPrint, refetchInterval: 15_000 });
  const problems = (ps.data?.failed ?? 0) + (ps.data?.pending ?? 0);
  const bridgeDown = showPrint && ps.data && !ps.data.printerOk;

  const logout = async () => {
    await api('/auth/logout', { method: 'POST', body: {} }).catch(() => {});
    qc.clear(); nav('/'); window.location.reload();
  };

  const titleKey = SECTION[loc.pathname] ?? 'AMMAS';
  const title = t(titleKey);
  const initials = (me?.name ?? 'A').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });

  const main = items.filter((i) => i.group === 'main');
  const tools = items.filter((i) => i.group === 'tools');
  const link = ({ isActive }: { isActive: boolean }) =>
    `press relative flex min-h-8 max-h-10 flex-1 basis-0 items-center justify-center gap-3 rounded-lg px-3 text-[13px] ${wide ? 'min-[1100px]:justify-start min-[1100px]:px-3.5' : ''} ${isActive ? `bg-white/10 font-semibold text-white before:absolute before:inset-y-2 before:-left-2.5 before:w-[3px] before:rounded-r before:bg-[#e2b765] ${wide ? 'min-[1100px]:before:-left-4' : ''}` : 'text-[#b9c8bd] hover:bg-white/5 hover:text-white'}`;

  // phone bottom bar: first four allowed screens + More (like the reference)
  const bottomOrder = ['/dashboard', '/pos', '/orders', '/verify', '/kitchen', '/stock'];
  const bottom = bottomOrder.map((p) => items.find((i) => i.to === p)).filter(Boolean).slice(0, 4) as NavItem[];

  const NavList = ({ list }: { list: NavItem[] }) => (
    <>
      {list.map((i) => (
        <NavLink key={i.to} to={i.to} className={link} title={i.label} aria-label={i.label}>
          {() => (<>
            <span className="shrink-0">{i.icon}</span><span className={wide ? 'hidden min-[1100px]:inline' : 'hidden'}>{i.label}</span>
            {i.to === '/prints' && problems > 0 && <span className={`absolute right-1 top-1 grid min-w-5 place-items-center rounded-md bg-[#e2b765] px-1.5 text-[11px] font-semibold text-[#3b2a07] ${wide ? 'min-[1100px]:static min-[1100px]:ml-auto' : ''}`}>{problems}</span>}
          </>)}
        </NavLink>
      ))}
    </>
  );

  return (
    <div className="min-h-[100dvh]">
      {/* Sidebar: full on desktop, icon rail on tablet, hidden on phone */}
      <aside className={`no-print fixed inset-y-0 left-0 z-20 hidden w-[72px] flex-col bg-side px-2.5 pb-3 pt-4 text-[#f8f7ef] transition-[width] duration-200 min-[640px]:flex ${wide ? 'min-[1100px]:w-[200px] min-[1100px]:px-4 min-[1280px]:w-[216px]' : ''}`}>
        <button onClick={toggle} className="press absolute -right-3 top-[26px] z-30 hidden h-6 w-6 place-items-center rounded-full border border-line bg-card text-ink shadow-sm before:absolute before:-inset-2.5 before:content-[''] hover:bg-white min-[1100px]:grid" aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} title={collapsed ? 'Expand menu' : 'Collapse menu'}>
          {collapsed ? <CaretRight size={13} weight="bold" /> : <CaretLeft size={13} weight="bold" />}
        </button>
        <div className={`flex items-center justify-center gap-3 ${wide ? 'min-[1100px]:justify-start min-[1100px]:px-2' : ''}`}>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/10 text-[#e2b765]"><CookingPot size={22} /></div>
          <div className={wide ? 'hidden min-[1100px]:block' : 'hidden'}><p className="font-brand text-[24px] leading-none tracking-[1.5px]">AMMAS</p><p className="mt-1 text-[12px] text-[#9fb2a5]">Coimbatore</p></div>
        </div>
        <nav className="mt-6 flex min-h-0 flex-1 flex-col gap-1" aria-label="Main navigation">
          <NavList list={main} />
          {main.length > 0 && tools.length > 0 && <div className="mx-2 my-1 h-px shrink-0 bg-white/10" />}
          <NavList list={tools} />
        </nav>
        <div className={`mt-2 flex shrink-0 flex-col items-center gap-2 border-t border-white/15 pt-3 ${wide ? 'min-[1100px]:flex-row min-[1100px]:px-1.5' : ''}`}>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-[12px] font-semibold text-white">{initials}</div>
          <div className={`min-w-0 ${wide ? 'hidden min-[1100px]:block' : 'hidden'}`}><b className="block truncate text-[13px] font-medium">{me?.name}</b><small className="text-[12px] capitalize text-[#9fb2a5]">{me?.roleKey}</small></div>
          <button onClick={logout} className={`press grid h-10 w-10 place-items-center rounded-lg text-white hover:bg-white/10 ${wide ? 'min-[1100px]:ml-auto' : ''}`} aria-label={t('Sign out')} title={t('Sign out')}><SignOut size={20} /></button>
        </div>
      </aside>

      <div className={`flex min-h-[100dvh] flex-col transition-[margin] duration-200 min-[640px]:ml-[72px] ${wide ? 'min-[1100px]:ml-[200px] min-[1280px]:ml-[216px]' : ''}`}>
        <header className="no-print sticky top-0 z-10 flex min-h-[48px] items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur min-[640px]:min-h-[52px] min-[640px]:px-5 min-[1100px]:px-6">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold min-[640px]:text-[15px]">{title}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {showPrint && (
              <NavLink to="/prints" className={`press inline-flex min-h-9 min-w-9 items-center justify-center gap-2 rounded-lg px-2.5 text-[13px] hover:bg-black/5 ${bridgeDown || problems ? 'text-warn' : 'text-ink-soft'}`} aria-label="Printer status">
                <span className={`h-2 w-2 rounded-full ${bridgeDown || problems ? 'pulse-dot bg-warn' : 'bg-ok'}`} />
                <span className="hidden min-[768px]:inline">{bridgeDown ? 'Printer not connected' : problems ? `${problems} to print` : 'Printer ready'}</span>
              </NavLink>
            )}
            <span className="hidden px-2.5 text-[13px] text-ink-soft min-[1100px]:inline">{settings?.restaurantName === 'AMMAS' || !settings ? 'Coimbatore' : settings.restaurantName} · {today}</span>
            <div className="inline-flex rounded-lg bg-black/[0.045] p-0.5" role="group" aria-label="Language">
              {(['en', 'ta'] as const).map((l) => (
                <button key={l} onClick={() => { setLang(l); api('/auth/language', { method: 'POST', body: { language: l } }).catch(() => {}); }} aria-pressed={lang === l} className={`press min-h-9 min-w-9 rounded-md px-2.5 text-[13px] font-semibold ${lang === l ? 'bg-white text-ink shadow-sm' : 'text-ink-soft'} ${l === 'ta' ? 'font-ta' : ''}`}>{l === 'en' ? 'EN' : 'த'}</button>
              ))}
            </div>
          </div>
        </header>

        {!online && (
          <div role="alert" className="flex items-center gap-3 bg-bad px-4 py-3 text-white min-[640px]:px-5 min-[1100px]:px-6"><WifiSlash size={22} /><p className="font-medium">{t('Connection lost. Nothing is saved until it comes back.')}</p></div>
        )}
        {online && !live && (
          <div role="status" className="flex items-center gap-3 bg-gold-soft px-4 py-2 text-sm font-medium text-warn min-[640px]:px-5 min-[1100px]:px-6"><WifiSlash size={18} /><p>No live connection. Reconnecting...</p></div>
        )}
        <main className="mx-auto w-full max-w-[1800px] flex-1 px-4 pb-28 pt-4 min-[640px]:px-5 min-[640px]:pb-8 min-[1100px]:px-6">{children}</main>
      </div>

      {/* Phone bottom bar */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-card px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 min-[640px]:hidden" style={{ gridTemplateColumns: `repeat(${bottom.length + 1}, minmax(0, 1fr))` }}>
        {bottom.map((i) => (
          <NavLink key={i.to} to={i.to} className={({ isActive }) => `press grid min-h-14 justify-items-center gap-0.5 rounded-lg px-1 py-1 text-[11px] ${isActive ? 'font-semibold text-forest' : 'text-[#7d847a]'}`}>
            {() => (<><span className="grid h-8 w-14 place-items-center">{i.icon}</span><span className="max-w-full truncate">{i.short}</span></>)}
          </NavLink>
        ))}
        <NavLink to="/more" className={({ isActive }) => `press grid min-h-14 justify-items-center gap-0.5 rounded-lg px-1 py-1 text-[11px] ${isActive ? 'font-semibold text-forest' : 'text-[#7d847a]'}`}>
          {() => (<><span className="relative grid h-8 w-14 place-items-center"><DotsThree size={26} weight="bold" />{problems > 0 && <i className="absolute right-3 top-0.5 h-2 w-2 rounded-full bg-bad" />}</span><span>More</span></>)}
        </NavLink>
      </nav>
    </div>
  );
}
void ChartLineUp;
