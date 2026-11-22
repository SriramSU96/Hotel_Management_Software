import { describe, expect, it } from 'vitest';
import { csvCell } from '../src/lib/csv.js';
import { withLock } from '../src/lib/lock.js';
import { resolveRange } from '../src/lib/time.js';
import { Order } from '../src/models/index.js';
import { priceFor } from '../src/services/orders.js';

describe('CSV formula injection', () => {
  it('neutralises spreadsheet formulas planted through the public feedback form', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csvCell('+919999999999')).toBe("'+919999999999");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-2+3')).toBe("'-2+3");
  });
  it('leaves ordinary text and numbers alone', () => {
    expect(csvCell('Chicken Rice')).toBe('Chicken Rice');
    expect(csvCell('-12.50')).toBe('-12.50');
    expect(csvCell(120)).toBe('120');
    expect(csvCell('a,b')).toBe('"a,b"');
  });
});

describe('withLock', () => {
  it('runs tasks for the same key one at a time, in order', async () => {
    const log: string[] = [];
    const task = (n: number) => withLock('bill:1', async () => { log.push(`start${n}`); await new Promise((r) => setTimeout(r, 15)); log.push(`end${n}`); });
    await Promise.all([task(1), task(2), task(3)]);
    expect(log).toEqual(['start1', 'end1', 'start2', 'end2', 'start3', 'end3']);
  });
  it('does not block other keys and survives a failing task', async () => {
    await expect(withLock('k', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(withLock('k', async () => 'ok')).resolves.toBe('ok');
  });
});

describe('date range query hardening', () => {
  it('ignores object/array values such as ?range[$gt]= instead of crashing', () => {
    const r = resolveRange({ range: { $gt: '' } as any, from: ['x'] as any, to: { $ne: 1 } as any }, 'Asia/Kolkata');
    expect(r.fromDate).toBe(r.toDate); // falls back to "today"
  });
});

describe('Order model', () => {
  // Regression: `events: [{ type: String, ... }]` made Mongoose read `type` as the element type, so EVERY order save failed.
  it('accepts order events that have a "type" field', () => {
    const o = new Order({ type: 'TAKEAWAY', items: [] });
    o.events.push({ at: new Date(), type: 'CREATED', by: 'Cashier', note: undefined } as any);
    const err = o.validateSync();
    expect(err?.errors?.events).toBeUndefined();
    expect(o.events[0].type).toBe('CREATED');
    expect(o.events[0].by).toBe('Cashier');
  });
});

describe('per-order-type pricing', () => {
  const p = { pricePaise: 12000, takeawayPricePaise: 12500, parcelPricePaise: null };
  it('uses the special price, or falls back to dine-in when none is set', () => {
    expect(priceFor(p, 'DINE_IN')).toBe(12000);
    expect(priceFor(p, 'TAKEAWAY')).toBe(12500);
    expect(priceFor(p, 'PARCEL')).toBe(12000);
    expect(priceFor({ pricePaise: 5000, parcelPricePaise: 0 }, 'PARCEL')).toBe(0); // 0 is a real price, not "unset"
  });
});

import { parseBillInput, phoneLast4, verdictFor } from '../src/lib/verify.js';

describe('digital bill verification', () => {
  const sent = { sentAt: new Date() };
  const ok = { status: 'CONFIRMED', paymentStatus: 'PAID', totalPaise: 24000, paidPaise: 24000, verifiedAt: null, digital: sent };
  it('only a digital, confirmed, fully paid, unverified bill is genuine', () => {
    expect(verdictFor(ok)).toBe('GENUINE');
    expect(verdictFor(null)).toBe('NOT_FOUND');
    expect(verdictFor({ ...ok, status: 'DRAFT' })).toBe('NOT_FOUND');
    expect(verdictFor({ ...ok, status: 'CANCELLED' })).toBe('CANCELLED');
    expect(verdictFor({ ...ok, paymentStatus: 'PARTIALLY_PAID', paidPaise: 10000 })).toBe('NOT_PAID');
    expect(verdictFor({ ...ok, paymentStatus: 'REFUNDED' })).toBe('REFUNDED');
  });
  it('a bill the system never sent digitally is fake when shown on a phone', () => {
    expect(verdictFor({ ...ok, digital: undefined })).toBe('NOT_SENT');
    expect(verdictFor({ ...ok, digital: null })).toBe('NOT_SENT');
  });
  it('a verified bill cannot be verified again', () => {
    expect(verdictFor({ ...ok, verifiedAt: new Date() })).toBe('ALREADY_VERIFIED');
  });
  it('understands short and full bill numbers and rejects anything else', () => {
    expect(parseBillInput('12', '20261120')).toBe('AM-20261120-0012');
    expect(parseBillInput(' 0012 ', '20261120')).toBe('AM-20261120-0012');
    expect(parseBillInput('am-20261119-0003', '20261120')).toBe('AM-20261119-0003');
    for (const bad of ['', 'abc', '12345', 'AM-1-2', { $ne: '' }, ['12'], null]) expect(parseBillInput(bad as any, '20261120')).toBeNull();
  });
  it('keeps only the last 4 digits of a valid mobile number', () => {
    expect(phoneLast4('98765 43210')).toBe('3210');
    expect(phoneLast4('+91 9876543210')).toBe('3210');
    expect(phoneLast4('12345')).toBeNull();
    expect(phoneLast4({ $ne: 1 } as any)).toBeNull();
  });
});

import { decryptSecret, encryptSecret } from '../src/lib/secrets.js';
import { summaryText } from '../src/services/reports.js';

describe('secrets typed in Settings', () => {
  it('round-trips, is not stored in plain text, and a damaged value reads as empty', () => {
    const enc = encryptSecret('my-smtp-password');
    expect(enc).not.toContain('my-smtp-password');
    expect(decryptSecret(enc)).toBe('my-smtp-password');
    expect(encryptSecret('x')).not.toBe(encryptSecret('x')); // fresh random IV each time
    expect(decryptSecret(enc.slice(0, -4) + 'AAAA')).toBe('');
    expect(decryptSecret('')).toBe('');
  });
});

describe('owner report content settings', () => {
  const sm: any = {
    range: { label: 'Today' }, peak: { hour: 13, orders: 9 }, topByQty: [{ name: 'Tea', qty: 20 }], lowStock: [{ name: 'Egg', qty: 3, unit: 'pcs' }],
    waste: { entries: 0 }, current: { netPaise: 100000, orders: 10, avgOrderPaise: 10000, cashPaise: 60000, upiPaise: 40000, pendingPaise: 0, expensesPaise: 5000, cancelled: 1 },
  };
  it('includes everything by default and drops what the owner switched off', () => {
    const all = summaryText(sm, 'T');
    expect(all).toContain('Cash'); expect(all).toContain('Best sellers'); expect(all).toContain('Low stock');
    const less = summaryText(sm, 'T', { payments: false, topItems: false, lowStock: false });
    expect(less).not.toContain('Cash'); expect(less).not.toContain('Best sellers'); expect(less).not.toContain('Low stock');
    expect(less).toContain('Sales (net)');
  });
});
