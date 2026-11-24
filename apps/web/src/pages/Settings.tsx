import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime } from '../lib/format';
import { useSettings, type Settings } from '../lib/queries';
import { useT } from '../lib/i18n';
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorNote, Field, Modal, PageHead, Segmented, Skeleton, inputCls } from '../components/ui';
import { DataTable, FilterSelect, Pagination, SearchBox, usePaged, type Column, type Sort } from '../components/DataTable';
import { errText, toast } from '../lib/toast';
import { EmailTab, PrinterTab, ReportContent, WhatsAppTab } from './SettingsConfig';

type Tab = 'business' | 'printer' | 'whatsapp' | 'email' | 'reports' | 'team' | 'audit' | 'account' | 'demo';

export default function SettingsPage() {
  const t = useT();
  const { can } = useAuth();
  const tabs: { value: Tab; label: string }[] = [
    ...(can('settings.manage') ? [{ value: 'business' as Tab, label: 'Business' }, { value: 'printer' as Tab, label: 'Printer' }, { value: 'whatsapp' as Tab, label: 'WhatsApp' }, { value: 'email' as Tab, label: 'Email' }, { value: 'reports' as Tab, label: 'Reports' }] : []),
    ...(can('users.manage') ? [{ value: 'team' as Tab, label: 'Team' }] : []),
    ...(can('audit.view') ? [{ value: 'audit' as Tab, label: 'History' }] : []),
    { value: 'account', label: 'My account' },
    ...(can('settings.manage') ? [{ value: 'demo' as Tab, label: 'Demo data' }] : []),
  ];
  const [tab, setTab] = useState<Tab>(tabs[0].value);
  return (
    <div>
      <PageHead title={t('Settings')} action={<div className="max-w-full overflow-x-auto"><Segmented value={tab} onChange={setTab} options={tabs} /></div>} />
      {tab === 'business' && <Business />}
      {tab === 'printer' && <PrinterTab />}
      {tab === 'whatsapp' && <WhatsAppTab />}
      {tab === 'email' && <EmailTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'team' && <Team />}
      {tab === 'audit' && <Audit />}
      {tab === 'account' && <Account />}
      {tab === 'demo' && <DemoData />}
    </div>
  );
}

function DemoData() {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const st = useQuery({ queryKey: ['demo'], queryFn: () => api<{ loaded: boolean; counts: Record<string, number> }>('/demo') });
  // every page reads its own data, so refresh all of it after a load or delete
  const refresh = () => qc.invalidateQueries();
  const load = useMutation({ mutationFn: () => api('/demo/load', { body: {} }), onSuccess: () => { refresh(); toast.ok('Dummy data added to every page'); }, onError: (e) => toast.error(errText(e)) });
  const del = useMutation({ mutationFn: () => api('/demo/delete', { body: {} }), onSuccess: () => { setConfirm(false); refresh(); toast.ok('Dummy data deleted from every page'); }, onError: (e) => toast.error(errText(e)) });
  if (st.isLoading) return <Skeleton className="h-48" />;
  const loaded = !!st.data?.loaded;
  const c = st.data?.counts ?? {};
  const rows: [string, string, number][] = [
    ['Orders & payments', 'Dashboard, Orders, Kitchen, Verified report', c.orders ?? 0],
    ['Menu items', 'New Order, Menu', c.products ?? 0],
    ['Expenses & cash sessions', 'Money', c.expenses ?? 0],
    ['Stock items & suppliers', 'Stock', c.stock ?? 0],
    ['Customer feedback', 'Customers', c.customers ?? 0],
    ['Tables', 'Tables', c.tables ?? 0],
  ];
  return (
    <div className="grid gap-6 min-[900px]:grid-cols-2">
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-medium">Dummy data</h2><Badge tone={loaded ? 'warn' : 'info'}>{loaded ? 'Loaded' : 'Not loaded'}</Badge></div>
        <p className="text-sm text-ink-soft">Fills every page with sample data so you can try the app. Your real menu, orders, stock and settings are never changed or removed.</p>
        <Button size="lg" onClick={() => load.mutate()} disabled={loaded || load.isPending}>{load.isPending ? 'Adding...' : 'Load dummy data'}</Button>
        <Button size="lg" variant="danger" onClick={() => setConfirm(true)} disabled={!loaded || del.isPending}>Delete dummy data</Button>
        {loaded && <p className="text-sm text-ink-soft">To load fresh dummy data, delete it first and load again.</p>}
        <ErrorNote error={load.error} />
      </Card>
      <Card className="p-6">
        <h2 className="mb-3 text-lg font-medium">What it adds</h2>
        <ul className="divide-y divide-line">
          {rows.map(([name, pages, n]) => (
            <li key={name} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-medium">{name}</p><p className="text-sm text-ink-soft">{pages}</p></div><span className="num text-lg font-semibold">{n}</span></li>
          ))}
        </ul>
      </Card>
      <ConfirmDialog open={confirm} danger busy={del.isPending} title="Delete all dummy data?" confirmLabel="Delete dummy data" onClose={() => setConfirm(false)} onConfirm={() => del.mutate()}
        body={<p>This removes the dummy orders, menu items, expenses, stock, customers and tables from every page. Anything you added yourself stays.</p>} />
    </div>
  );
}

function Business() {
  const qc = useQueryClient();
  const q = useSettings();
  const [f, setF] = useState<Settings | null>(null);
  const [tax, setTax] = useState('');
  useEffect(() => { if (q.data && !f) { setF(q.data.settings); setTax(String(q.data.settings.taxBp / 100)); } }, [q.data, f]);
  const save = useMutation({
    mutationFn: () => api('/settings', { method: 'PUT', body: { restaurantName: f!.restaurantName, address: f!.address, phone: f!.phone, gstin: f!.gstin, billFooter: f!.billFooter, timezone: f!.timezone, taxMode: f!.taxMode, taxBp: Math.round(Number(tax || 0) * 100), discountsEnabled: f!.discountsEnabled, parcelEnabled: f!.parcelEnabled, useTables: !!f!.useTables } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); toast.ok('Saved'); }, onError: (e) => toast.error(errText(e)),
  });
  if (!f) return <Skeleton className="h-64" />;
  const set = (p: Partial<Settings>) => setF({ ...f, ...p });
  const Toggle = ({ k, label, hint }: { k: 'discountsEnabled' | 'parcelEnabled' | 'useTables'; label: string; hint?: string }) => (
    <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border border-line bg-white p-4"><input type="checkbox" className="shrink-0 mt-1 h-6 w-6 accent-[#1f3d2e]" checked={!!f[k]} onChange={(e) => set({ [k]: e.target.checked } as any)} /><span><b className="block font-medium">{label}</b>{hint && <span className="text-sm text-ink-soft">{hint}</span>}</span></label>
  );
  return (
    <div className="grid gap-6 min-[900px]:grid-cols-2">
      <Card className="flex flex-col gap-4 p-6">
        <h2 className="text-lg font-medium">Bill details</h2>
        <Field label="Restaurant name"><input className={inputCls} value={f.restaurantName} onChange={(e) => set({ restaurantName: e.target.value })} /></Field>
        <Field label="Address"><input className={inputCls} value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Phone"><input className={inputCls} value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field><Field label="GSTIN (if any)"><input className={inputCls} value={f.gstin} onChange={(e) => set({ gstin: e.target.value })} /></Field></div>
        <Field label="Bill footer message"><input className={inputCls} value={f.billFooter} onChange={(e) => set({ billFooter: e.target.value })} /></Field>
      </Card>
      <Card className="flex flex-col gap-4 p-6">
        <h2 className="text-lg font-medium">Tax</h2>
        <p className="rounded-lg bg-gold-soft p-3 text-sm text-warn">Tax is off by default.</p>
        <div className="flex flex-wrap gap-2">{([['NONE', 'No tax'], ['EXCLUSIVE', 'Added on top'], ['INCLUSIVE', 'Already in price']] as const).map(([v, l]) => <button key={v} onClick={() => set({ taxMode: v })} aria-pressed={f.taxMode === v} className={`press min-h-12 rounded-lg px-5 text-sm font-bold ring-1 ${f.taxMode === v ? 'bg-forest text-white ring-forest' : 'ring-line'}`}>{l}</button>)}</div>
        {f.taxMode !== 'NONE' && <Field label="Tax rate (%)"><input className={`${inputCls} num max-w-40`} inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} /></Field>}
        <h2 className="mt-2 text-lg font-medium">Features</h2>
        <Toggle k="parcelEnabled" label="Parcel orders" hint="Show Parcel next to Eat here and Takeaway." />
        <Toggle k="discountsEnabled" label="Discounts" hint="Lets permitted staff give a discount at billing." />
        <Toggle k="useTables" label="Use table numbers" hint="Off: customers sit anywhere and Eat here needs no table." />
      </Card>
      <Card className="flex flex-col gap-4 p-6 min-[900px]:col-span-2">
        <Field label="Time zone"><input className={`${inputCls} max-w-72`} value={f.timezone} onChange={(e) => set({ timezone: e.target.value })} /></Field>
        <div className="flex justify-end"><Button size="lg" onClick={() => save.mutate()} disabled={save.isPending}>Save settings</Button></div>
        <ErrorNote error={save.error} />
      </Card>
    </div>
  );
}

function ReportsTab() {
  const qc = useQueryClient();
  const q = useSettings();
  const deliveries = useQuery({ queryKey: ['deliveries'], queryFn: () => api<{ deliveries: any[] }>('/reports/deliveries') });
  const s = q.data?.settings; const prov = q.data?.providers;
  const [email, setEmail] = useState(''); const [wa, setWa] = useState(''); const [code, setCode] = useState<{ channel: 'EMAIL' | 'WHATSAPP' } | null>(null); const [codeVal, setCodeVal] = useState('');
  const [sc, setSc] = useState<any>(null);
  useEffect(() => { if (s?.schedule && !sc) setSc(s.schedule); if (s?.owner) { setEmail((v) => v || s.owner!.email); setWa((v) => v || s.owner!.whatsapp); } }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = useMutation({ mutationFn: (v: { channel: 'EMAIL' | 'WHATSAPP'; target: string }) => api('/reports/recipient', { body: v }), onSuccess: (_d, v) => { setCode({ channel: v.channel }); toast.info('Code sent'); }, onError: (e) => toast.error(errText(e)) });
  const verify = useMutation({ mutationFn: () => api('/reports/verify', { body: { channel: code!.channel, code: codeVal } }), onSuccess: () => { setCode(null); setCodeVal(''); qc.invalidateQueries({ queryKey: ['settings'] }); toast.ok('Verified'); }, onError: (e) => toast.error(errText(e)) });
  const saveSc = useMutation({ mutationFn: () => api('/settings', { method: 'PUT', body: { schedule: sc } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); toast.ok('Schedule saved'); }, onError: (e) => toast.error(errText(e)) });
  const retry = useMutation({ mutationFn: (id: string) => api(`/reports/deliveries/${id}/retry`, { method: 'POST', body: {} }), onSuccess: () => qc.invalidateQueries({ queryKey: ['deliveries'] }), onError: (e) => toast.error(errText(e)) });
  if (!s || !sc) return <Skeleton className="h-64" />;
  const Recipient = ({ channel, value, set, verified, label, off }: any) => (
    <Card className="flex flex-col gap-3 p-6">
      <div className="flex items-center justify-between"><h2 className="text-lg font-medium">{label}</h2>{value && <Badge tone={verified ? 'ok' : 'warn'}>{verified ? 'Verified' : 'Not verified'}</Badge>}</div>
      {off && <p className="rounded-lg bg-gold-soft p-3 text-sm text-warn">{channel === 'EMAIL' ? 'Email sending is not set up on the server yet (SMTP).' : 'WhatsApp Business is not set up on the server yet.'} See the README.</p>}
      <input className={inputCls} value={value} onChange={(e) => set(e.target.value)} placeholder={channel === 'EMAIL' ? 'owner@example.com' : '+91 98xxxxxxxx'} />
      <Button variant="soft" disabled={!value || start.isPending || off} onClick={() => start.mutate({ channel, target: value })}>Send verification code</Button>
    </Card>
  );
  const upd = (p: object) => setSc({ ...sc, ...p });
  const row = (key: 'daily' | 'weekly' | 'monthly', label: string, extra?: React.ReactNode) => (
    <div className="flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-0">
      <label className="flex min-w-40 items-center gap-3"><input type="checkbox" className="shrink-0 h-6 w-6 accent-[#1f3d2e]" checked={sc[`${key}Enabled`]} onChange={(e) => upd({ [`${key}Enabled`]: e.target.checked })} /><span className="font-medium">{label}</span></label>
      {extra}<input type="time" className={`${inputCls} max-w-36`} value={sc[`${key}Time`]} onChange={(e) => upd({ [`${key}Time`]: e.target.value })} />
    </div>
  );
  return (
    <div className="grid gap-6 min-[900px]:grid-cols-2">
      <Recipient channel="EMAIL" label="Owner email" value={email} set={setEmail} verified={s.owner?.emailVerified} off={prov && !prov.email} />
      <Recipient channel="WHATSAPP" label="Owner WhatsApp" value={wa} set={setWa} verified={s.owner?.whatsappVerified} off={prov && !prov.whatsapp} />
      <ReportContent />
      <Card className="p-6 min-[900px]:col-span-2">
        <h2 className="mb-2 text-lg font-medium">When to send</h2>
        {row('daily', 'Every day at')}
        {row('weekly', 'Every week on', <select className={`${inputCls} max-w-36`} value={sc.weeklyWeekday} onChange={(e) => upd({ weeklyWeekday: Number(e.target.value) })}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <option key={d} value={i}>{d}</option>)}</select>)}
        {row('monthly', 'Every month on day', <input type="number" min={1} max={28} className={`${inputCls} num max-w-24`} value={sc.monthlyDay} onChange={(e) => upd({ monthlyDay: Number(e.target.value) || 1 })} />)}
        <div className="mt-4 flex justify-end"><Button onClick={() => saveSc.mutate()} disabled={saveSc.isPending}>Save schedule</Button></div>
      </Card>
      <Card className="p-6 min-[900px]:col-span-2">
        <h2 className="mb-3 text-lg font-medium">Delivery history</h2>
        {!deliveries.data?.deliveries?.length ? <p className="text-ink-soft">Nothing sent yet.</p> : (
          <ul className="divide-y divide-line">{deliveries.data!.deliveries.map((d) => (
            <li key={d._id} className="flex flex-wrap items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="font-medium">{d.type} · {d.channel === 'EMAIL' ? 'Email' : 'WhatsApp'} · {d.rangeLabel}</p><p className="text-sm text-ink-soft">{d.to} · {fmtDateTime(d.createdAt)}{d.error ? ` · ${d.error}` : ''}</p></div><Badge tone={d.status === 'FAILED' ? 'bad' : d.status === 'QUEUED' ? 'warn' : 'ok'}>{d.status}</Badge>{d.status === 'FAILED' && <Button size="sm" variant="soft" onClick={() => retry.mutate(d._id)}>Retry</Button>}</li>))}</ul>
        )}
      </Card>
      <Modal open={!!code} onClose={() => setCode(null)} title="Enter the code">
        <div className="flex flex-col gap-4"><p className="text-ink-soft">We sent a 6-digit code. It works for 10 minutes.</p><input className={`${inputCls} num text-center text-3xl tracking-[0.4em]`} inputMode="numeric" maxLength={6} autoFocus value={codeVal} onChange={(e) => setCodeVal(e.target.value.replace(/\D/g, ''))} /><Button size="lg" disabled={codeVal.length < 6 || verify.isPending} onClick={() => verify.mutate()}>Verify</Button></div>
      </Modal>
    </div>
  );
}

function Team() {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<{ users: any[] }>('/users') });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<{ roles: any[]; permissions: string[] }>('/roles') });
  const [edit, setEdit] = useState<any>(null);
  const [roleEdit, setRoleEdit] = useState<any>(null);
  return (
    <div className="grid gap-6 min-[900px]:grid-cols-[1.2fr_1fr]">
      <div>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-medium">Staff</h2><Button size="sm" onClick={() => setEdit({ _new: true, roleKey: 'cashier' })}>Add staff</Button></div>
        {users.isLoading ? <Skeleton className="h-40" /> : <ul className="grid gap-2">{users.data?.users.map((u) => <li key={u._id}><button onClick={() => setEdit(u)} className="press flex w-full items-center gap-3 rounded-[10px] border border-line bg-card p-4 text-left hover:border-forest/40"><div className="min-w-0 flex-1"><p className="font-medium">{u.name}</p><p className="text-sm text-ink-soft">{u.username} · {u.roleKey}</p></div><Badge tone={u.active ? 'ok' : 'info'}>{u.active ? 'Active' : 'Off'}</Badge></button></li>)}</ul>}
      </div>
      <div>
        <h2 className="mb-3 text-lg font-medium">What each role can do</h2>
        <ul className="grid gap-2">{roles.data?.roles.map((r) => <li key={r.key}><button disabled={r.system} onClick={() => setRoleEdit(r)} className="press flex w-full items-center justify-between rounded-[10px] border border-line bg-card p-4 text-left disabled:opacity-70"><span className="font-medium">{r.name}</span><span className="text-sm text-ink-soft">{r.system ? 'Everything' : `${r.permissions.length} permissions`}</span></button></li>)}</ul>
      </div>
      {edit && <UserForm u={edit} roles={roles.data?.roles ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); qc.invalidateQueries({ queryKey: ['users'] }); }} />}
      {roleEdit && <RoleForm r={roleEdit} all={roles.data?.permissions ?? []} onClose={() => setRoleEdit(null)} onSaved={() => { setRoleEdit(null); qc.invalidateQueries({ queryKey: ['roles'] }); }} />}
    </div>
  );
}

function UserForm({ u, roles, onClose, onSaved }: any) {
  const isNew = !!u._new;
  const [f, setF] = useState({ username: u.username ?? '', name: u.name ?? '', password: '', roleKey: u.roleKey ?? 'cashier', active: u.active ?? true });
  const save = useMutation({
    mutationFn: () => isNew ? api('/users', { body: { username: f.username, name: f.name, password: f.password, roleKey: f.roleKey } }) : api(`/users/${u._id}`, { method: 'PUT', body: { name: f.name, roleKey: f.roleKey, active: f.active, password: f.password || undefined } }),
    onSuccess: () => { toast.ok('Saved'); onSaved(); }, onError: (e) => toast.error(errText(e)),
  });
  return (
    <Modal open onClose={onClose} title={isNew ? 'Add staff' : u.name}>
      <div className="flex flex-col gap-4">
        {isNew && <Field label="Username"><input className={inputCls} autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>}
        <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Role"><select className={inputCls} value={f.roleKey} onChange={(e) => setF({ ...f, roleKey: e.target.value })}>{roles.map((r: any) => <option key={r.key} value={r.key}>{r.name}</option>)}</select></Field>
        <Field label={isNew ? 'Password' : 'New password (leave empty to keep)'} hint="At least 8 characters."><input className={inputCls} type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        {!isNew && <label className="flex items-center gap-3"><input type="checkbox" className="shrink-0 h-6 w-6 accent-[#1f3d2e]" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /><span>Can sign in</span></label>}
        <ErrorNote error={save.error} />
        <Button size="lg" disabled={save.isPending || !f.name || (isNew && (!f.username || f.password.length < 8))} onClick={() => save.mutate()}>Save</Button>
      </div>
    </Modal>
  );
}

function RoleForm({ r, all, onClose, onSaved }: any) {
  const [sel, setSel] = useState<string[]>(r.permissions);
  const save = useMutation({ mutationFn: () => api(`/roles/${r.key}`, { method: 'PUT', body: { permissions: sel } }), onSuccess: () => { toast.ok('Saved'); onSaved(); }, onError: (e) => toast.error(errText(e)) });
  const groups = all.reduce((m: Record<string, string[]>, p: string) => { (m[p.split('.')[0]] ??= []).push(p); return m; }, {});
  return (
    <Modal open onClose={onClose} title={`${r.name} role`} wide>
      <div className="grid gap-4 min-[768px]:grid-cols-2">{Object.entries(groups).map(([g, ps]: any) => (
        <fieldset key={g} className="rounded-lg border border-line p-3"><legend className="px-2 text-sm font-bold text-forest">{g}</legend>{ps.map((p: string) => <label key={p} className="flex min-h-11 items-center gap-3"><input type="checkbox" className="shrink-0 h-5 w-5 accent-[#1f3d2e]" checked={sel.includes(p)} onChange={(e) => setSel(e.target.checked ? [...sel, p] : sel.filter((x) => x !== p))} /><span className="text-sm">{p.split('.')[1]}</span></label>)}</fieldset>))}</div>
      <Button size="lg" className="mt-5 w-full" disabled={save.isPending} onClick={() => save.mutate()}>Save role</Button>
    </Modal>
  );
}

const auditDetails = (l: any) => l.note ?? (l.after != null ? JSON.stringify(l.after) : '');
const auditGroup = (action: string) => String(action ?? '').split('.')[0];

function Audit() {
  const t = useT();
  const q = useQuery({ queryKey: ['audit'], queryFn: () => api<{ logs: any[] }>('/audit?limit=300') });
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('ALL');
  const [sort, setSort] = useState<Sort>({ key: 'at', dir: 'desc' });
  const groups = useMemo(() => Array.from(new Set((q.data?.logs ?? []).map((l) => auditGroup(l.action)).filter(Boolean))).sort(), [q.data]);
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const d = sort.dir === 'asc' ? 1 : -1;
    return (q.data?.logs ?? [])
      .filter((l) => (group === 'ALL' || auditGroup(l.action) === group) && (!term || `${l.userName ?? ''} ${l.action ?? ''} ${auditDetails(l)}`.toLowerCase().includes(term)))
      .sort((a, b) => (sort.key === 'who' ? String(a.userName ?? '').localeCompare(String(b.userName ?? '')) : sort.key === 'action' ? String(a.action ?? '').localeCompare(String(b.action ?? '')) : new Date(a.at).getTime() - new Date(b.at).getTime()) * d);
  }, [q.data, search, group, sort]);
  const paged = usePaged(rows, 25);
  const dirty = !!search || group !== 'ALL';
  const reset = () => { setSearch(''); setGroup('ALL'); paged.resetPage(); };
  const columns: Column<any>[] = [
    { key: 'at', header: 'When', width: '150px', sortable: true, cell: (l) => <span className="num text-[13px] text-ink-soft">{fmtDateTime(l.at)}</span> },
    { key: 'who', header: 'Who', width: '160px', sortable: true, firstDir: 'asc', cell: (l) => l.userName },
    { key: 'action', header: 'What', width: '230px', sortable: true, firstDir: 'asc', cell: (l) => <span className="font-medium">{l.action}</span> },
    { key: 'details', header: 'Details', cell: (l) => <span className="text-[13px] text-ink-soft" title={auditDetails(l)}>{auditDetails(l)}</span> },
  ];
  const mobileRow = (l: any) => (
    <span className="block px-4 py-3">
      <span className="flex items-baseline justify-between gap-3"><span className="font-medium">{l.action}</span><span className="num text-xs text-ink-soft">{fmtDateTime(l.at)}</span></span>
      <span className="block text-sm">{l.userName}</span>
      {auditDetails(l) && <span className="mt-0.5 block break-words text-[13px] text-ink-soft">{auditDetails(l)}</span>}
    </span>
  );
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.isLoading && !q.data?.logs.length) return <Empty title="No history yet" hint="Every important change is recorded here." />;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-card p-4">
        <SearchBox label={t('Search')} placeholder="Person, action, details" value={search} onChange={(v) => { setSearch(v); paged.resetPage(); }} className="grow basis-64" />
        <FilterSelect label="Area" value={group} onChange={(v) => { setGroup(v); paged.resetPage(); }} options={[{ value: 'ALL', label: t('All') }, ...groups.map((g) => ({ value: g, label: g }))]} />
        {dirty && <Button variant="ghost" onClick={reset}>{t('Reset filters')}</Button>}
      </div>
      <DataTable
        columns={columns} rows={paged.slice} rowKey={(l) => l._id} sort={sort} onSort={(s) => { setSort(s); paged.resetPage(); }} mobileRow={mobileRow} minWidth={900} loading={q.isLoading}
        empty={<div><Empty title="No history matches these filters" /><div className="mt-3 text-center"><Button variant="soft" onClick={reset}>{t('Reset filters')}</Button></div></div>}
        footer={<Pagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onPage={paged.setPage} onPageSize={paged.setPageSize} />}
      />
    </>
  );
}

function Account() {
  const { me } = useAuth();
  const [cur, setCur] = useState(''); const [next, setNext] = useState('');
  const devices = useQuery({ queryKey: ['devices'], queryFn: () => api<{ devices: any[] }>('/auth/devices') });
  const qc = useQueryClient();
  const change = useMutation({ mutationFn: () => api('/auth/change-password', { body: { current: cur, next } }), onSuccess: () => { toast.ok('Password changed'); setCur(''); setNext(''); }, onError: (e) => toast.error(errText(e)) });
  const out = useMutation({ mutationFn: (id: string) => api(`/auth/devices/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }) });
  return (
    <div className="grid gap-6 min-[900px]:grid-cols-2">
      <Card className="flex flex-col gap-4 p-6"><h2 className="text-lg font-medium">{me?.name}</h2>
        <Field label="Current password"><input type="password" className={inputCls} value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="New password" hint="At least 8 characters."><input type="password" className={inputCls} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
        <Button disabled={!cur || next.length < 8 || change.isPending} onClick={() => change.mutate()}>Change password</Button></Card>
      <Card className="p-6"><h2 className="mb-3 text-lg font-medium">Signed-in devices</h2>
        <ul className="divide-y divide-line">{devices.data?.devices.map((d) => <li key={d.id} className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm">{d.device || 'Device'}</p><p className="text-xs text-ink-soft">{fmtDateTime(d.lastSeenAt)}{d.current ? ' · this device' : ''}</p></div>{!d.current && <Button size="sm" variant="ghost" onClick={() => out.mutate(d.id)}>Sign out</Button>}</li>)}</ul></Card>
    </div>
  );
}
