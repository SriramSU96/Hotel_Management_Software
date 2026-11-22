/** Business-timezone helpers (default Asia/Kolkata). */

export function localDateString(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function localTimeHM(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

export function localWeekday(d: Date, tz: string): number {
  const s = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(s);
}

function tzOffsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** UTC instant of 00:00 local time on the given YYYY-MM-DD in tz. */
export function startOfLocalDay(dateStr: string, tz: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  const off1 = tzOffsetMinutes(guess, tz);
  const first = new Date(guess.getTime() - off1 * 60000);
  const off2 = tzOffsetMinutes(first, tz);
  return off2 === off1 ? first : new Date(guess.getTime() - off2 * 60000);
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export interface DateRange {
  from: Date; // inclusive
  to: Date; // exclusive
  fromDate: string;
  toDate: string; // inclusive local date
  label: string;
}

export function resolveRange(
  q: { range?: string; from?: string; to?: string },
  tz: string,
  now = new Date(),
): DateRange {
  // query strings can arrive as objects/arrays (?range[$gt]=); only plain strings are accepted
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  q = { range: str(q.range), from: str(q.from), to: str(q.to) };
  const today = localDateString(now, tz);
  let fromDate = today;
  let toDate = today;
  switch (q.range) {
    case 'yesterday': fromDate = toDate = addDays(today, -1); break;
    case '7d': fromDate = addDays(today, -6); break;
    case '30d': fromDate = addDays(today, -29); break;
    case 'custom':
      if (q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) fromDate = q.from;
      if (q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) toDate = q.to;
      if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];
      break;
    default: break; // today
  }
  return {
    from: startOfLocalDay(fromDate, tz),
    to: startOfLocalDay(addDays(toDate, 1), tz),
    fromDate, toDate,
    label: fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`,
  };
}

export function previousRange(r: DateRange, tz: string): DateRange {
  const ms = r.to.getTime() - r.from.getTime();
  const days = Math.round(ms / 86400000);
  const fromDate = addDays(r.fromDate, -days);
  const toDate = addDays(r.fromDate, -1);
  return {
    from: startOfLocalDay(fromDate, tz),
    to: r.from,
    fromDate, toDate,
    label: fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`,
  };
}
