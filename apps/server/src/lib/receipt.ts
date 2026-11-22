import { paiseToString } from './money.js';

export interface ReceiptSettings {
  restaurantName: string;
  address?: string;
  phone?: string;
  gstin?: string;
  billFooter?: string;
  receiptWidth: number;
  taxMode: string;
  taxBp: number;
  timezone: string;
}

export interface ReceiptOrder {
  billNo?: string | null;
  kotNo?: number | null;
  type: string;
  tableLabel?: string | null;
  items: { name: string; qty: number; unitPricePaise: number; note?: string | null }[];
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  paidPaise: number;
  paymentStatus: string;
  confirmedAt?: Date | null;
}

function center(s: string, w: number) {
  if (s.length >= w) return s;
  const pad = Math.floor((w - s.length) / 2);
  return ' '.repeat(pad) + s;
}
function lr(left: string, right: string, w: number) {
  const space = w - left.length - right.length;
  if (space < 1) return left.slice(0, Math.max(0, w - right.length - 1)) + ' ' + right;
  return left + ' '.repeat(space) + right;
}
function wrap(s: string, w: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of s.split(/\s+/)) {
    if (!word) continue;
    if ((line + ' ' + word).trim().length > w) {
      if (line) out.push(line);
      line = word.length > w ? word.slice(0, w) : word;
    } else {
      line = (line + ' ' + word).trim();
    }
  }
  if (line) out.push(line);
  return out;
}
function when(d: Date | null | undefined, tz: string) {
  const dt = d ?? new Date();
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(dt).replace(',', '');
}
const TYPE_LABEL: Record<string, string> = { DINE_IN: 'Eat here', TAKEAWAY: 'Takeaway', PARCEL: 'Parcel' };

/** Plain-text customer bill. Uses "Rs." because many thermal printers cannot print the rupee symbol. */
export function renderBill(s: ReceiptSettings, o: ReceiptOrder, opts: { isCopy?: boolean } = {}): string[] {
  const w = s.receiptWidth;
  const rule = '-'.repeat(w);
  const L: string[] = [];
  if (opts.isCopy) L.push(center('*** COPY / DUPLICATE ***', w));
  L.push(center(s.restaurantName.toUpperCase(), w));
  for (const l of wrap(s.address ?? '', w)) L.push(center(l, w));
  if (s.phone) L.push(center(`Ph: ${s.phone}`, w));
  if (s.gstin) L.push(center(`GSTIN: ${s.gstin}`, w));
  L.push(rule);
  L.push(lr(`Bill: ${o.billNo ?? '-'}`, when(o.confirmedAt, s.timezone), w));
  L.push(`${TYPE_LABEL[o.type] ?? o.type}${o.tableLabel ? ` - Table ${o.tableLabel}` : ''}`);
  L.push(rule);
  L.push(lr('Item', 'Amount', w));
  for (const it of o.items) {
    const amount = paiseToString(it.unitPricePaise * it.qty);
    const left = `${it.qty} x ${it.name}`;
    const room = w - amount.length - 1;
    const parts = wrap(left, room);
    parts.forEach((p, i) => L.push(i === 0 ? lr(p, amount, w) : p));
    if (it.note) L.push(`  (${it.note.slice(0, w - 4)})`);
  }
  L.push(rule);
  L.push(lr('Subtotal', paiseToString(o.subtotalPaise), w));
  if (o.discountPaise > 0) L.push(lr('Discount', `-${paiseToString(o.discountPaise)}`, w));
  if (o.taxPaise > 0) {
    const pct = (s.taxBp / 100).toString();
    L.push(lr(s.taxMode === 'INCLUSIVE' ? `Tax ${pct}% (incl.)` : `Tax ${pct}%`, paiseToString(o.taxPaise), w));
  }
  L.push(lr('TOTAL (Rs.)', paiseToString(o.totalPaise), w));
  L.push(rule);
  L.push(`Payment: ${o.paymentStatus.replace('_', ' ')}${o.paidPaise > 0 ? ` (Rs. ${paiseToString(o.paidPaise)})` : ''}`);
  if (s.billFooter) {
    L.push(rule);
    for (const l of wrap(s.billFooter, w)) L.push(center(l, w));
  }
  if (opts.isCopy) L.push(center(`Original bill: ${o.billNo ?? '-'}`, w));
  return L;
}

/** Kitchen ticket: never contains customer contact or payment details. */
export function renderKot(s: ReceiptSettings, o: ReceiptOrder, opts: { isCopy?: boolean } = {}): string[] {
  const w = s.receiptWidth;
  const rule = '='.repeat(w);
  const L: string[] = [];
  if (opts.isCopy) L.push(center('*** COPY ***', w));
  L.push(center(`KOT #${o.kotNo ?? '-'}`, w));
  L.push(rule);
  L.push(`${TYPE_LABEL[o.type] ?? o.type}${o.tableLabel ? ` - Table ${o.tableLabel}` : ''}`);
  L.push(when(o.confirmedAt, s.timezone));
  L.push(rule);
  for (const it of o.items) {
    wrap(`${it.qty} x ${it.name}`, w).forEach((p) => L.push(p));
    if (it.note) L.push(`   >> ${it.note.slice(0, w - 7)}`);
  }
  L.push(rule);
  return L;
}
