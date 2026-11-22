import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { Skeleton } from '../components/ui';

export default function PublicReceipt() {
  const { token } = useParams();
  const q = useQuery({ queryKey: ['receipt', token], queryFn: () => api<any>(`/public/receipt/${token}`), retry: false });
  const r = q.data;
  return (
    <div className="mx-auto min-h-[100dvh] max-w-md px-5 py-8">
      {q.isLoading ? <Skeleton className="h-64" /> : q.error ? <p className="rounded-[10px] bg-[#f7e3df] p-6 text-bad">This receipt link is not valid.</p> : (
        <div className="rounded-[10px] border border-line bg-card p-6 shadow-soft">
          <p className="text-center font-brand text-3xl text-forest">{r.restaurant.name}</p>
          {r.restaurant.address && <p className="mt-1 text-center text-sm text-ink-soft">{r.restaurant.address}</p>}
          {r.restaurant.gstin && <p className="text-center text-sm text-ink-soft">GSTIN {r.restaurant.gstin}</p>}
          <div className="my-4 flex justify-between border-y border-dashed border-line py-3 text-sm"><span className="num">{r.billNo}</span><span>{fmtDateTime(r.at)}</span></div>
          <ul className="flex flex-col gap-2">{r.items.map((i: any, n: number) => <li key={n} className="flex justify-between"><span><span className="num font-bold">{i.qty}</span> × {i.name}</span><span className="num">₹{i.total}</span></li>)}</ul>
          <dl className="mt-4 flex flex-col gap-1 border-t border-dashed border-line pt-3 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd className="num">₹{r.subtotal}</dd></div>
            {r.discount !== '0.00' && <div className="flex justify-between"><dt>Discount</dt><dd className="num">−₹{r.discount}</dd></div>}
            {r.tax !== '0.00' && <div className="flex justify-between"><dt>Tax</dt><dd className="num">₹{r.tax}</dd></div>}
            <div className="mt-1 flex justify-between text-xl font-bold text-forest"><dt>Total</dt><dd className="num">₹{r.total}</dd></div>
          </dl>
          <p className="mt-4 text-center text-sm text-ink-soft">{r.restaurant.footer}</p>
        </div>
      )}
    </div>
  );
}
