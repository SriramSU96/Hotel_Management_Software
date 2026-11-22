import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowsClockwise, CheckCircle, Printer, WarningCircle } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime } from '../lib/format';
import { useT } from '../lib/i18n';
import { Badge, Button, Card, Empty, ErrorNote, PageHead, Skeleton } from '../components/ui';
import { errText, toast } from '../lib/toast';

const tone = (s: string) => (s === 'PRINTED' ? 'ok' : s === 'FAILED' ? 'bad' : s === 'CANCELLED' ? 'info' : 'warn') as 'ok' | 'bad' | 'info' | 'warn';

export default function Prints() {
  const t = useT();
  const { can } = useAuth();
  const qc = useQueryClient();
  const st = useQuery({ queryKey: ['print-status'], queryFn: () => api<any>('/printing/status'), refetchInterval: 8_000 });
  const jobs = useQuery({ queryKey: ['print-jobs'], queryFn: () => api<{ jobs: any[] }>('/printing/jobs'), refetchInterval: 8_000 });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['print-jobs'] }); qc.invalidateQueries({ queryKey: ['print-status'] }); };
  const retry = useMutation({ mutationFn: (id: string) => api(`/printing/jobs/${id}/retry`, { method: 'POST', body: {} }), onSuccess: () => { toast.info(t('Printing...')); refresh(); }, onError: (e) => toast.error(errText(e)) });
  const cancel = useMutation({ mutationFn: (id: string) => api(`/printing/jobs/${id}/cancel`, { method: 'POST', body: {} }), onSuccess: refresh, onError: (e) => toast.error(errText(e)) });
  const test = useMutation({ mutationFn: () => api('/printing/test', { method: 'POST', body: {} }), onSuccess: () => { toast.info('Test page sent'); refresh(); }, onError: (e) => toast.error(errText(e)) });
  const retryAll = async () => { for (const j of (jobs.data?.jobs ?? []).filter((x) => x.status === 'FAILED')) await retry.mutateAsync(j._id).catch(() => {}); };

  const s = st.data;
  const failed = (jobs.data?.jobs ?? []).filter((j) => j.status === 'FAILED').length;
  return (
    <div>
      <PageHead title={t('Pending Prints')} action={can('printers.manage') ? <Button variant="soft" onClick={() => test.mutate()} disabled={test.isPending}><Printer size={20} />Print test page</Button> : undefined} />
      <Card className="mb-6 p-5">
        {st.isLoading ? <Skeleton className="h-16" /> : (
          <div className="flex flex-wrap items-center gap-4">
            <div className={`grid h-14 w-14 place-items-center rounded-lg ${s?.printerOk ? 'bg-forest-soft text-forest' : 'bg-gold-soft text-warn'}`}>{s?.printerOk ? <CheckCircle size={30} weight="fill" /> : <WarningCircle size={30} weight="fill" />}</div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold">{s?.printerOk ? 'Printer ready' : s?.bridgeOnline ? 'Printer problem' : 'Print bridge not connected'}</p>
              <p className="text-sm text-ink-soft">{s?.detail}{s?.lastSeen ? ` · seen ${fmtDateTime(s.lastSeen)}` : ''}</p>
              {!s?.bridgeOnline && <p className="mt-1 text-sm text-warn">Printer not connected. Bills are saved and print later.</p>}
            </div>
            {failed > 0 && <Button onClick={retryAll}><ArrowsClockwise size={20} />Retry all ({failed})</Button>}
          </div>
        )}
      </Card>
      {jobs.error ? <ErrorNote error={jobs.error} /> : jobs.isLoading ? <Skeleton className="h-32" />
      : !jobs.data?.jobs.length ? <Empty title="Nothing waiting to print" hint="Every bill and kitchen ticket has been printed." icon={<CheckCircle size={40} />} />
      : (
        <ul className="grid gap-3">
          {jobs.data.jobs.map((j) => (
            <li key={j._id} className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-card p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium"><span className="num">{j.billNo ?? 'Test'}</span> · {j.kind === 'BILL' ? 'Bill' : 'Kitchen ticket'}{j.isCopy ? ' (copy)' : ''}</p>
                <p className="text-sm text-ink-soft">{fmtDateTime(j.createdAt)} · {j.attempts} tries{j.lastError ? ` · ${j.lastError}` : ''}</p>
              </div>
              <Badge tone={tone(j.status)}>{j.status === 'SENT' ? 'Sent, not confirmed' : j.status}</Badge>
              {['FAILED', 'SENT', 'QUEUED'].includes(j.status) && <Button size="sm" variant="soft" onClick={() => retry.mutate(j._id)} disabled={retry.isPending || j.status === 'QUEUED'}>{t('Retry Print')}</Button>}
              {can('printers.manage') && ['FAILED', 'SENT', 'QUEUED'].includes(j.status) && <Button size="sm" variant="ghost" onClick={() => cancel.mutate(j._id)}>{t('Cancel')}</Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
