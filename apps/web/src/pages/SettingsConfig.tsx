import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useSettings, type Settings } from '../lib/queries';
import { printTest } from '../lib/printing';
import { Badge, Button, Card, ErrorNote, Field, Skeleton, inputCls } from '../components/ui';
import { errText, toast } from '../lib/toast';

/** Saves one section of the settings; every tab sends only its own fields. */
function useSaveSettings(what: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: object) => api('/settings', { method: 'PUT', body }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['settings'] }); toast.ok(`${what} saved`); },
    onError: (e) => toast.error(errText(e)),
  });
}
const Check = ({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-line bg-white p-3.5"><input type="checkbox" className="mt-0.5 h-6 w-6 shrink-0 accent-[#1f3d2e]" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span><b className="block font-medium">{label}</b>{hint && <span className="text-sm text-ink-soft">{hint}</span>}</span></label>
);
const Note = ({ children }: { children: ReactNode }) => <p className="rounded-lg bg-gold-soft p-3 text-sm text-warn">{children}</p>;

// ---------------- Printer ----------------
export function PrinterTab() {
  const q = useSettings(); const save = useSaveSettings('Printer');
  const [f, setF] = useState<Settings | null>(null);
  useEffect(() => { if (q.data && !f) setF(q.data.settings); }, [q.data, f]);
  if (!f || !f.browserPrint) return <Skeleton className="h-64" />;
  const bp = f.browserPrint; const setBp = (p: Partial<typeof bp>) => setF({ ...f, browserPrint: { ...bp, ...p } });
  const browser = f.printerConnection === 'BROWSER';
  return (
    <div className="grid gap-6 min-[900px]:grid-cols-2">
      <Card className="flex flex-col gap-4 p-6">
        <h2 className="text-lg font-medium">Printer type</h2>
        <Field label="How do you print?">
          <select className={inputCls} value={f.printerConnection} onChange={(e) => setF({ ...f, printerConnection: e.target.value })}>
            <option value="BROWSER">Any printer (browser print)</option>
            <option value="ETHERNET">Thermal: network</option>
            <option value="USB">Thermal: USB</option>
            <option value="BLUETOOTH">Thermal: Bluetooth</option>
          </select>
        </Field>
        {browser
          ? <Note>The computer's own print window opens. Pick the printer there once. Works with any printer, even a PDF.</Note>
          : <Field label="Characters per line" hint="32 for 58 mm paper, 42 or 48 for 80 mm."><input className={`${inputCls} num max-w-40`} inputMode="numeric" value={f.receiptWidth} onChange={(e) => setF({ ...f, receiptWidth: Number(e.target.value) || 42 })} /></Field>}
        <Check checked={f.kotPrinterEnabled} onChange={(v) => setF({ ...f, kotPrinterEnabled: v })} label="Print kitchen tickets" hint="A ticket for the chef with every bill." />
      </Card>
      <Card className={`flex flex-col gap-4 p-6 ${browser ? '' : 'opacity-60'}`}>
        <h2 className="text-lg font-medium">Paper and layout</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paper width"><select className={inputCls} value={bp.paperMm} onChange={(e) => setBp({ paperMm: Number(e.target.value) })}><option value={58}>58 mm roll</option><option value={80}>80 mm roll</option><option value={210}>A4 sheet</option></select></Field>
          <Field label="Copies"><select className={inputCls} value={bp.copies} onChange={(e) => setBp({ copies: Number(e.target.value) })}>{[1, 2, 3].map((n) => <option key={n}>{n}</option>)}</select></Field>
        </div>
        <Field label="Text size" hint="Bigger text for easy reading."><input type="range" min={10} max={18} value={bp.fontPx} onChange={(e) => setBp({ fontPx: Number(e.target.value) })} className="h-11 w-full accent-[#1f3d2e]" /><span className="num text-sm text-ink-soft">{bp.fontPx} px</span></Field>
        <Check checked={bp.autoPrintBill} onChange={(v) => setBp({ autoPrintBill: v })} label="Print the bill automatically" hint="Opens the print window when an order is confirmed." />
        <Button variant="soft" onClick={() => printTest(bp.paperMm, bp.fontPx, 1)}>Print a test slip</Button>
        <p className="text-xs text-ink-soft">Shop name, address and footer are in Settings &gt; Business.</p>
      </Card>
      <div className="flex justify-end min-[900px]:col-span-2"><Button size="lg" disabled={save.isPending} onClick={() => save.mutate({ printerConnection: f.printerConnection, receiptWidth: f.receiptWidth, kotPrinterEnabled: f.kotPrinterEnabled, browserPrint: bp })}>Save printer</Button></div>
      <ErrorNote error={save.error} />
    </div>
  );
}

// ---------------- WhatsApp ----------------
export function WhatsAppTab() {
  const q = useSettings(); const save = useSaveSettings('WhatsApp');
  const [c, setC] = useState<any>(null); const [token, setToken] = useState('');
  useEffect(() => { if (q.data?.settings.whatsappCfg && !c) setC(q.data.settings.whatsappCfg); }, [q.data, c]);
  if (!c) return <Skeleton className="h-64" />;
  const shop = q.data?.settings.restaurantName ?? 'AMMAS';
  const preview = String(c.billMessage ?? '').replaceAll('{shop}', shop).replaceAll('{bill}', 'AM-20261120-0012').replaceAll('{link}', 'https://your-site/r/abc123');
  return (
    <div className="grid gap-6 min-[900px]:grid-cols-2">
      <Card className="flex flex-col gap-4 p-6">
        <h2 className="text-lg font-medium">Message to the customer</h2>
        <Field label="Bill message" hint="Use {shop}, {bill} and {link}. The cashier taps Send bill on WhatsApp, so no account is needed for this.">
          <textarea className={`${inputCls} min-h-32`} maxLength={500} value={c.billMessage} onChange={(e) => setC({ ...c, billMessage: e.target.value })} />
        </Field>
        <div><p className="mb-1 text-xs font-bold text-ink-soft">Preview</p><pre className="whitespace-pre-wrap rounded-lg bg-[#e7f5dc] p-3 text-sm">{preview}</pre></div>
      </Card>
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between"><h2 className="text-lg font-medium">Owner reports (WhatsApp Business)</h2><Badge tone={c.tokenSet && c.phoneNumberId && c.templateName ? 'ok' : 'warn'}>{c.tokenSet && c.phoneNumberId && c.templateName ? 'Ready' : 'Not set'}</Badge></div>
        <p className="text-sm text-ink-soft">Only needed to send reports to the owner's WhatsApp by itself. Get these from your Meta WhatsApp Business account.</p>
        <Field label="Access token" hint={c.tokenSet ? 'A token is saved. Leave empty to keep it.' : 'Paste the token.'}><input className={inputCls} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={c.tokenSet ? '••••••••' : ''} /></Field>
        <Field label="Phone number ID"><input className={`${inputCls} num`} inputMode="numeric" value={c.phoneNumberId} onChange={(e) => setC({ ...c, phoneNumberId: e.target.value.replace(/\D/g, '') })} /></Field>
        <div className="grid grid-cols-[1fr_96px] gap-3"><Field label="Template name"><input className={inputCls} autoCapitalize="none" value={c.templateName} onChange={(e) => setC({ ...c, templateName: e.target.value.toLowerCase() })} placeholder="owner_report" /></Field><Field label="Language"><input className={inputCls} value={c.templateLang} onChange={(e) => setC({ ...c, templateLang: e.target.value })} /></Field></div>
        <p className="text-xs text-ink-soft">The owner's own number is added and verified in Settings &gt; Reports.</p>
      </Card>
      <div className="flex justify-end min-[900px]:col-span-2"><Button size="lg" disabled={save.isPending} onClick={() => save.mutate({ whatsappCfg: { ...c, token: token || undefined, tokenSet: undefined } }, { onSuccess: () => { setToken(''); setC(null); } })}>Save WhatsApp</Button></div>
      <ErrorNote error={save.error} />
    </div>
  );
}

// ---------------- Email ----------------
export function EmailTab() {
  const q = useSettings(); const save = useSaveSettings('Email');
  const [c, setC] = useState<any>(null); const [pass, setPass] = useState(''); const [to, setTo] = useState('');
  useEffect(() => { if (q.data?.settings.emailCfg && !c) { setC(q.data.settings.emailCfg); setTo(q.data.settings.owner?.email ?? ''); } }, [q.data, c]);
  const test = useMutation({ mutationFn: () => api('/settings/test-email', { body: { to } }), onSuccess: () => toast.ok('Test email sent'), onError: (e) => toast.error(errText(e)) });
  if (!c) return <Skeleton className="h-64" />;
  const on = !!q.data?.providers?.email;
  return (
    <div className="grid gap-6 min-[900px]:grid-cols-2">
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between"><h2 className="text-lg font-medium">Email server (SMTP)</h2><Badge tone={on ? 'ok' : 'warn'}>{on ? 'Ready' : 'Not set'}</Badge></div>
        <div className="grid grid-cols-[1fr_96px] gap-3"><Field label="Server"><input className={inputCls} autoCapitalize="none" value={c.host} onChange={(e) => setC({ ...c, host: e.target.value.trim() })} placeholder="smtp.gmail.com" /></Field><Field label="Port"><input className={`${inputCls} num`} inputMode="numeric" value={c.port} onChange={(e) => setC({ ...c, port: Number(e.target.value.replace(/\D/g, '')) || 587 })} /></Field></div>
        <Field label="User name"><input className={inputCls} autoCapitalize="none" autoComplete="off" value={c.user} onChange={(e) => setC({ ...c, user: e.target.value })} /></Field>
        <Field label="Password" hint={c.passSet ? 'A password is saved. Leave empty to keep it.' : 'For Gmail use an app password.'}><input className={inputCls} type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={c.passSet ? '••••••••' : ''} /></Field>
        <Field label="Send from" hint="Example: AMMAS <reports@yourdomain.com>"><input className={inputCls} value={c.from} onChange={(e) => setC({ ...c, from: e.target.value })} /></Field>
        <Button size="lg" disabled={save.isPending} onClick={() => save.mutate({ emailCfg: { host: c.host, port: c.port, user: c.user, from: c.from, pass: pass || undefined } }, { onSuccess: () => { setPass(''); setC(null); } })}>Save email</Button>
        <ErrorNote error={save.error} />
      </Card>
      <Card className="flex flex-col gap-4 p-6">
        <h2 className="text-lg font-medium">Test it</h2>
        <Field label="Send a test email to"><input className={inputCls} type="email" autoCapitalize="none" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Button variant="soft" disabled={!to || test.isPending || !on} onClick={() => test.mutate()}>{test.isPending ? 'Sending...' : 'Send test email'}</Button>
        <p className="text-xs text-ink-soft">Save first, then test. The owner's email is added and verified in Settings &gt; Reports.</p>
      </Card>
    </div>
  );
}

// ---------------- What the owner report contains ----------------
const CONTENT: [keyof NonNullable<Settings['reportContent']>, string][] = [
  ['payments', 'Cash, UPI and unpaid'], ['peakHour', 'Busiest hour'], ['topItems', 'Best selling food'], ['expenses', 'Expenses'],
  ['lowStock', 'Low stock items'], ['waste', 'Waste'], ['cancelled', 'Cancelled orders'], ['verified', 'Verified digital bills'],
];
export function ReportContent() {
  const q = useSettings(); const save = useSaveSettings('Report content');
  const [rc, setRc] = useState<NonNullable<Settings['reportContent']> | null>(null);
  useEffect(() => { if (q.data?.settings.reportContent && !rc) setRc(q.data.settings.reportContent); }, [q.data, rc]);
  if (!rc) return null;
  return (
    <Card className="p-6 min-[900px]:col-span-2">
      <h2 className="mb-1 text-lg font-medium">What is in the report</h2>
      <p className="mb-3 text-sm text-ink-soft">Sales total is always included.</p>
      <div className="grid gap-2 min-[640px]:grid-cols-2">{CONTENT.map(([k, label]) => <Check key={k} checked={rc[k]} onChange={(v) => setRc({ ...rc, [k]: v })} label={label} />)}</div>
      <div className="mt-4 flex justify-end"><Button disabled={save.isPending} onClick={() => save.mutate({ reportContent: rc })}>Save report content</Button></div>
    </Card>
  );
}
