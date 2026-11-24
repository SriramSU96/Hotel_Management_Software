import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DownloadSimple, Star, Trash, Users } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime } from '../lib/format';
import { useT } from '../lib/i18n';
import { Badge, Button, ConfirmDialog, Empty, ErrorNote, IconButton, PageHead } from '../components/ui';
import { DataTable, FilterSelect, Pagination, SearchBox, usePaged, type Column, type Sort } from '../components/DataTable';
import { errText, toast } from '../lib/toast';

interface FeedbackRow { _id: string; rating?: number; tableLabel?: string; notes?: string; name?: string; phone?: string; email?: string; profession?: string; consentMarketing?: boolean; createdAt: string }

function Stars({ n, size = 18 }: { n: number; size?: number }) {
  return <span className="inline-flex" aria-label={`${n} of 5 stars`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} weight={i <= n ? 'fill' : 'regular'} className={i <= n ? 'text-gold' : 'text-line'} />)}</span>;
}
const who = (f: FeedbackRow) => [f.name, f.profession, f.phone, f.email].filter(Boolean).join(' · ');

export default function Customers() {
  const t = useT();
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['feedback'], queryFn: () => api<{ feedback: FeedbackRow[]; averageRating: number | null }>('/customers/feedback') });
  const del = useMutation({ mutationFn: (id: string) => api(`/customers/feedback/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback'] }), onError: (e) => toast.error(errText(e)) });

  const [search, setSearch] = useState('');
  const [delF, setDelF] = useState<FeedbackRow | null>(null);
  const [rating, setRating] = useState('ALL');
  const [msg, setMsg] = useState('ALL');
  const [sort, setSort] = useState<Sort>({ key: 'createdAt', dir: 'desc' });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const dir = sort.dir === 'asc' ? 1 : -1;
    return (q.data?.feedback ?? [])
      .filter((f) => (rating === 'ALL' || (rating === 'LOW' ? (f.rating ?? 0) <= 2 : f.rating === Number(rating)))
        && (msg === 'ALL' || !!f.consentMarketing)
        && (!term || [f.notes, f.name, f.phone, f.email, f.profession, f.tableLabel].some((x) => (x ?? '').toLowerCase().includes(term))))
      .sort((a, b) => (sort.key === 'rating' ? (a.rating ?? 0) - (b.rating ?? 0) : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir);
  }, [q.data, search, rating, msg, sort]);
  const paged = usePaged(rows, 10);
  const dirty = !!search || rating !== 'ALL' || msg !== 'ALL';
  const reset = () => { setSearch(''); setRating('ALL'); setMsg('ALL'); paged.resetPage(); };

  const canDelete = can('settings.manage');
  const columns: Column<FeedbackRow>[] = [
    { key: 'createdAt', header: t('Date & time'), width: '140px', sortable: true, cell: (f) => <span className="num text-[13px] text-ink-soft">{fmtDateTime(f.createdAt)}</span> },
    { key: 'table', header: t('Table'), width: '80px', cell: (f) => <span className="num font-medium">{f.tableLabel ?? '–'}</span> },
    { key: 'rating', header: t('Rating'), width: '125px', sortable: true, cell: (f) => <Stars n={f.rating ?? 0} /> },
    { key: 'notes', header: t('Notes'), cell: (f) => <span title={f.notes}>{f.notes || <span className="text-ink-soft">–</span>}</span> },
    { key: 'who', header: t('Customers'), width: '240px', cell: (f) => <span className="text-[13px] text-ink-soft" title={who(f)}>{who(f) || '–'}</span> },
    { key: 'consent', header: 'Message', width: '120px', cell: (f) => f.consentMarketing ? <Badge tone="ok">OK to message</Badge> : <span className="text-ink-soft">–</span> },
    ...(canDelete ? [{ key: 'actions', header: '', width: '76px', align: 'right' as const, cell: (f: FeedbackRow) => <IconButton label={t('Delete')} tone="danger" onClick={(e) => { e.stopPropagation(); setDelF(f); }}><Trash size={16} /></IconButton> }] : []),
  ];

  const mobileRow = (f: FeedbackRow) => (
    <span className="block p-4">
      <span className="flex items-center justify-between gap-2"><Stars n={f.rating ?? 0} size={20} /><span className="text-xs text-ink-soft">{t('Table')} {f.tableLabel} · {fmtDateTime(f.createdAt)}</span></span>
      {f.notes && <span className="mt-3 block">{f.notes}</span>}
      {who(f) && <span className="mt-3 block text-sm text-ink-soft">{who(f)}</span>}
      <span className="mt-3 flex items-center gap-2">
        {f.consentMarketing && <Badge tone="ok">OK to message</Badge>}
        {canDelete && <IconButton label={t('Delete')} tone="danger" className="ml-auto" onClick={() => setDelF(f)}><Trash size={16} /></IconButton>}
      </span>
    </span>
  );

  const total = q.data?.feedback.length ?? 0;
  return (
    <div>
      <PageHead title={t('Customers')} sub={q.data?.averageRating ? `Average rating ${q.data.averageRating} / 5` : 'Feedback from table QR codes'} action={<a href="/api/v1/customers/export.csv" className="press inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium ring-1 ring-line hover:bg-forest-soft"><DownloadSimple size={18} />Export CSV</a>} />
      {q.error ? <ErrorNote error={q.error} /> : !q.isLoading && total === 0 ? <Empty title="No feedback yet" hint="Print the table QR cards from Tables. Customers can scan and share their thoughts." icon={<Users size={40} />} />
      : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-card p-4">
            <SearchBox label={t('Search')} placeholder="Name, phone, note, table" value={search} onChange={(v) => { setSearch(v); paged.resetPage(); }} className="grow basis-64" />
            <FilterSelect label={t('Rating')} value={rating} onChange={(v) => { setRating(v); paged.resetPage(); }} options={[{ value: 'ALL', label: t('All') }, { value: '5', label: '5 ★' }, { value: '4', label: '4 ★' }, { value: '3', label: '3 ★' }, { value: 'LOW', label: '1–2 ★' }]} />
            <FilterSelect label="Message" value={msg} onChange={(v) => { setMsg(v); paged.resetPage(); }} options={[{ value: 'ALL', label: t('All') }, { value: 'OK', label: 'OK to message' }]} />
            {dirty && <Button variant="ghost" onClick={reset}>{t('Reset filters')}</Button>}
          </div>
          <DataTable
            columns={columns} rows={paged.slice} rowKey={(f) => f._id} sort={sort} onSort={(s) => { setSort(s); paged.resetPage(); }} mobileRow={mobileRow} minWidth={900}
            loading={q.isLoading}
            empty={<div><Empty title="No feedback matches these filters" icon={<Users size={36} />} /><div className="mt-3 text-center"><Button variant="soft" onClick={reset}>{t('Reset filters')}</Button></div></div>}
            footer={<Pagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onPage={paged.setPage} onPageSize={paged.setPageSize} />}
          />
        </>
      )}
      <ConfirmDialog open={!!delF} onClose={() => setDelF(null)} title="Delete this feedback?" danger confirmLabel={t('Delete')} busy={del.isPending} onConfirm={() => delF && del.mutate(delF._id, { onSettled: () => setDelF(null) })} body={<p>{delF?.name ? `${delF.name} · ` : ''}{delF?.rating ?? 0} ★{delF?.notes ? ` · ${delF.notes}` : ''}</p>} />
    </div>
  );
}
