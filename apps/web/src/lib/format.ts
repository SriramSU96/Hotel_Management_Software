/** paise (integer) -> "1,234.50" in Indian digit grouping. */
export function inr(paise: number, opts: { symbol?: boolean; short?: boolean } = {}): string {
  const neg = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100);
  const pr = abs % 100;
  const s = rupees.toString();
  const grouped = s.length > 3 ? s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3) : s;
  const body = opts.short && pr === 0 ? grouped : `${grouped}.${String(pr).padStart(2, '0')}`;
  return `${neg ? '-' : ''}${opts.symbol === false ? '' : '₹'}${body}`;
}

export const toPaise = (rupees: string | number): number => Math.round(Number(rupees) * 100);

export function hourLabel(h: number) {
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12} ${ap}`;
}

export function timeAgo(d: string | Date | undefined | null): string {
  if (!d) return '';
  const s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export const fmtTime = (d: string | Date | undefined | null) =>
  d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
export const fmtDateTime = (d: string | Date | undefined | null) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '';
