import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowsClockwise, CheckCircle, Printer, WarningCircle } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime } from '../lib/format';
import { useT } from '../lib/i18n';
import { Badge, Button, Card, Empty, ErrorNote, PageHead, Skeleton } from '../components/ui';
import { DataTable, FilterSelect, Pagination, SearchBox, usePaged, type Column } from '../components/DataTable';
import { errText, toast } from '../lib/toast';

const tone = (s: string) => (s === 'PRINTED' ? 'ok' : s === 'FAILED' ? 'bad' : s === 'CANCELLED' ? 'info' : 'warn') as 'ok' | 'bad' | 'info' | 'warn';
const statusLabel = (s: string) => (s === 'SENT' ? 'Sent, not confirmed' : s);
const actionable = (s: string) => ['FAILED', 'SENT', 'QUEUED'].includes(s);

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

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [kind, setKind] = useState('ALL');
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (jobs.data?.jobs ?? []).filter((j) => (status === 'ALL' || j.status === status) && (kind === 'ALL' || j.kind === kind)
      && (!term || `${j.billNo ?? 'test'} ${j.lastError ?? ''}`.toLowerCase().includes(term)));
  }, [jobs.data, search, status, kind]);
  const paged = usePaged(rows, 10);
  const dirty = !!search || status !== 'ALL' || kind !== 'ALL';
  const reset = () => { setSearch(''); setStatus('ALL'); setKind('ALL'); paged.resetPage(); };

  const s = st.data;
  const failed = (jobs.data?.jobs ?? []).filter((j) => j.status === 'FAILED').length;
  const canManage = can('printers.manage');

  const columns: Column<any>[] = [
    { key: 'billNo', header: t('Bill no'), width: '160px', cell: (j) => <span className="num font-semibold">{j.billNo ?? 'Test'}</span> },
    { key: 'kind', header: t('Type'), width: '170px', cell: (j) => <span>{j.kind === 'BILL' ? 'Bill' : 'Kitchen ticket'}{j.isCopy ? ' (copy)' : ''}</span> },
    { key: 'createdAt', header: t('Date & time'), width: '140px', cell: (j) => <span className="num text-[13px] text-ink-soft">{fmtDateTime(j.createdAt)}</span> },
    { key: 'attempts', header: 'Tries', width: '70px', cell: (j) => <span className="num">{j.attempts}</span> },
    { key: 'lastError', header: 'Details', cell: (j) => <span className="text-[13px] text-ink-soft" title={j.lastError}>{j.lastError || '–'}</span> },
    { key: 'status', header: t('Status'), width: '170px', cell: (j) => <Badge tone={tone(j.status)}>{statusLabel(j.status)}</Badge> },
    { key: 'actions', header: '', width: '200px', align: 'right', cell: (j) => (
      <span className="inline-flex gap-2">
        {actionable(j.status) && <Button size="sm" variant="soft" onClick={() => retry.mutate(j._id)} disabled={retry.isPending || j.status === 'QUEUED'}>{t('Retry Print')}</Button>}
        {canManage && actionable(j.status) && <Button size="sm" variant="ghost" onClick={() => cancel.mutate(j._id)}>{t('Cancel')}</Button>}
      </span>
    ) },
  ];

  const mobileRow = (j: any) => (
    <span className="flex flex-wrap items-center gap-3 p-4">
      <span className="min-w-0 flex-1">
        <span className="block font-medium"><span className="num">{j.billNo ?? 'Test'}</span> · {j.kind === 'BILL' ? 'Bill' : 'Kitchen ticket'}{j.isCopy ? ' (copy)' : ''}</span>
        <span className="block text-sm text-ink-soft">{fmtDateTime(j.createdAt)} · {j.attempts} tries{j.lastError ? ` · ${j.lastError}` : ''}</span>
      </span>
      <Badge tone={tone(j.status)}>{statusLabel(j.status)}</Badge>
      {actionable(j.status) && <Button size="sm" variant="soft" onClick={() => retry.mutate(j._id)} disabled={retry.isPending || j.status === 'QUEUED'}>{t('Retry Print')}</Button>}
      {canManage && actionable(j.status) && <Button size="sm" variant="ghost" onClick={() => cancel.mutate(j._id)}>{t('Cancel')}</Button>}
    </span>
  );

  return (
    <div>
      <PageHead title={t('Pending Prints')} action={canManage ? <Button variant="soft" onClick={() => test.mutate()} disabled={test.isPending}><Printer size={20} />Print test page</Button> : undefined} />
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
      {jobs.error ? <ErrorNote error={jobs.error} /> : !jobs.isLoading && !jobs.data?.jobs.length ? <Empty title="Nothing waiting to print" hint="Every bill and kitchen ticket has been printed." icon={<CheckCircle size={40} />} />
      : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-card p-4">
            <SearchBox label={t('Search')} placeholder="Bill no or error" value={search} onChange={(v) => { setSearch(v); paged.resetPage(); }} className="grow basis-64" />
            <FilterSelect label={t('Status')} value={status} onChange={(v) => { setStatus(v); paged.resetPage(); }} options={[{ value: 'ALL', label: t('All') }, { value: 'FAILED', label: 'Failed' }, { value: 'QUEUED', label: 'Queued' }, { value: 'SENT', label: 'Sent, not confirmed' }, { value: 'PRINTED', label: 'Printed' }, { value: 'CANCELLED', label: t('Cancelled') }]} />
            <FilterSelect label={t('Type')} value={kind} onChange={(v) => { setKind(v); paged.resetPage(); }} options={[{ value: 'ALL', label: t('All') }, { value: 'BILL', label: 'Bill' }, { value: 'KOT', label: 'Kitchen ticket' }]} />
            {dirty && <Button variant="ghost" onClick={reset}>{t('Reset filters')}</Button>}
          </div>
          <DataTable
            columns={columns} rows={paged.slice} rowKey={(j) => j._id} mobileRow={mobileRow} minWidth={900} loading={jobs.isLoading}
            empty={<div><Empty title="No print jobs match these filters" icon={<Printer size={36} />} /><div className="mt-3 text-center"><Button variant="soft" onClick={reset}>{t('Reset filters')}</Button></div></div>}
            footer={<Pagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onPage={paged.setPage} onPageSize={paged.setPageSize} />}
          />
        </>
      )}
    </div>
  );
}
