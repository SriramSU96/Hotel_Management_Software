import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowsClockwise, Plus, Printer } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useTables, useSettings } from '../lib/queries';
import { useT } from '../lib/i18n';
import { Button, ConfirmDialog, Empty, PageHead, Skeleton, inputCls } from '../components/ui';
import { errText, toast } from '../lib/toast';

export default function TablesPage() {
  const t = useT();
  const qc = useQueryClient();
  const tables = useTables();
  const settings = useSettings().data?.settings;
  const [label, setLabel] = useState('');
  const [rotate, setRotate] = useState<any>(null);
  const [printing, setPrinting] = useState<string | 'all' | null>(null);
  const add = useMutation({ mutationFn: () => api('/tables', { body: { label: label.trim(), capacity: 4 } }), onSuccess: () => { setLabel(''); qc.invalidateQueries({ queryKey: ['tables'] }); }, onError: (e) => toast.error(errText(e)) });
  const rot = useMutation({ mutationFn: (id: string) => api(`/tables/${id}/rotate-qr`, { method: 'POST', body: {} }), onSuccess: () => { setRotate(null); qc.invalidateQueries({ queryKey: ['tables'] }); toast.ok('New QR created. Print it again.'); }, onError: (e) => toast.error(errText(e)) });
  const list = (tables.data ?? []).filter((x) => printing === 'all' || printing === null || x._id === printing);

  const doPrint = (what: string | 'all') => { setPrinting(what); setTimeout(() => { window.print(); setPrinting(null); }, 350); };
  return (
    <div>
      <div className="no-print">
        <PageHead title={t('Tables')} sub="Each table has a QR for feedback." action={<Button variant="soft" onClick={() => doPrint('all')}><Printer size={20} />Print all QR cards</Button>} />
        <div className="mb-6 flex max-w-sm gap-2"><input className={inputCls} placeholder="New table number" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={10} /><Button disabled={!label.trim() || add.isPending} onClick={() => add.mutate()}><Plus size={20} />Add</Button></div>
      </div>
      {tables.isLoading ? <Skeleton className="h-64" /> : !tables.data?.length ? <Empty title="No tables yet" hint="Add your tables to start dine-in orders." />
      : (
        <div className={`grid gap-4 ${printing ? 'print:grid-cols-2' : 'min-[640px]:grid-cols-2 min-[1280px]:grid-cols-4'}`}>
          {list.map((tb) => (
            <div key={tb._id} className="break-inside-avoid rounded-[10px] border border-line bg-card p-5 text-center shadow-soft">
              <p className="font-brand text-sm tracking-[0.2em] text-gold">{(settings?.restaurantName ?? 'AMMAS').toUpperCase()}</p>
              <p className="num mb-2 text-4xl font-bold text-forest">{t('Table')} {tb.label}</p>
              <img src={`/api/v1/tables/${tb._id}/qr.svg`} alt={`QR for table ${tb.label}`} className="mx-auto h-44 w-44" />
              <p className="mt-2 text-sm text-ink-soft">Scan to share your feedback</p>
              <p className="font-ta text-sm text-ink-soft">கருத்தைப் பகிர ஸ்கேன் செய்யவும்</p>
              <div className="no-print mt-3 flex justify-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => doPrint(tb._id)}><Printer size={16} /></Button>
                <Button size="sm" variant="ghost" onClick={() => setRotate(tb)} aria-label="Make a new QR"><ArrowsClockwise size={16} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog open={!!rotate} onClose={() => setRotate(null)} title="Make a new QR?" confirmLabel="Make new QR" danger busy={rot.isPending} onConfirm={() => rot.mutate(rotate._id)} body={<p>The old printed QR for table {rotate?.label} will stop working. Do this only if the card was misused.</p>} />
    </div>
  );
}
void useQuery;
