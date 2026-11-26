/** paise (integer) -> "1,234.50" in Indian digit grouping. */
export function inr(paise: number, opts: { symbol?: boolean; short?: boolean } = {}): string {
  const neg = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100);
  const pr = abs % 100;
  const s = rupees.toString();
  const grouped = s.length > 3 ? s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3) : s;
  const body = opts.short && pr === 0 ? grouped : `${grouped}.${String(pr).padStart(2, '0')}`;
  return `${neg ? '-' : ''}${opts.symbol === false ? '' : '\u20b9'}${body}`;
}

export const toPaise = (rupees: string | number): number => Math.round(Number(rupees) * 100);

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number) => String(n).padStart(2, '0');

/** "23 Nov, 10:52 pm" (done by hand: Intl formatting differs between devices). */
export function fmtDateTime(d: string | Date | undefined | null): string {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const h = x.getHours();
  return `${p2(x.getDate())} ${MON[x.getMonth()]}, ${p2(h % 12 === 0 ? 12 : h % 12)}:${p2(x.getMinutes())} ${h >= 12 ? 'pm' : 'am'}`;
}

export function timeAgo(d: string | Date | undefined | null): string {
  if (!d) return '';
  const s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** YYYY-MM-DD for today minus `back` days, in this device's local time. */
export function dayStr(back: number): string {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
