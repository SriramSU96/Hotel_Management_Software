import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DownloadSimple, Star, Users } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime } from '../lib/format';
import { useT } from '../lib/i18n';
import { Badge, Button, Empty, ErrorNote, PageHead, Skeleton } from '../components/ui';
import { errText, toast } from '../lib/toast';

export default function Customers() {
  const t = useT();
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['feedback'], queryFn: () => api<{ feedback: any[]; averageRating: number | null }>('/customers/feedback') });
  const del = useMutation({ mutationFn: (id: string) => api(`/customers/feedback/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback'] }), onError: (e) => toast.error(errText(e)) });
  return (
    <div>
      <PageHead title={t('Customers')} sub={q.data?.averageRating ? `Average rating ${q.data.averageRating} / 5` : 'Feedback from table QR codes'} action={<a href="/api/v1/customers/export.csv" className="press inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium ring-1 ring-line hover:bg-forest-soft"><DownloadSimple size={18} />Export CSV</a>} />
      {q.isLoading ? <Skeleton className="h-48" /> : q.error ? <ErrorNote error={q.error} /> : !q.data?.feedback.length ? <Empty title="No feedback yet" hint="Print the table QR cards from Tables. Customers can scan and share their thoughts." icon={<Users size={40} />} />
      : (
        <div className="grid gap-3 min-[768px]:grid-cols-2">
          {q.data.feedback.map((f) => (
            <article key={f._id} className="rounded-[10px] border border-line bg-card p-5 shadow-soft">
              <div className="flex items-center justify-between gap-2"><div className="flex" aria-label={`${f.rating ?? 0} of 5 stars`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={20} weight={n <= (f.rating ?? 0) ? 'fill' : 'regular'} className={n <= (f.rating ?? 0) ? 'text-gold' : 'text-line'} />)}</div><span className="text-xs text-ink-soft">{t('Table')} {f.tableLabel} · {fmtDateTime(f.createdAt)}</span></div>
              {f.notes && <p className="mt-3">{f.notes}</p>}
              {(f.name || f.phone || f.email || f.profession) && <p className="mt-3 text-sm text-ink-soft">{[f.name, f.profession, f.phone, f.email].filter(Boolean).join(' · ')}</p>}
              <div className="mt-3 flex items-center gap-2">{f.consentMarketing && <Badge tone="ok">OK to message</Badge>}{can('settings.manage') && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => del.mutate(f._id)}>{t('Delete')}</Button>}</div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
