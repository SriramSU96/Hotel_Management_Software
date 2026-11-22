import { describe, expect, it } from 'vitest';
import { calcTotals, paiseToString } from '../src/lib/money.js';
import { toBase } from '../src/lib/units.js';
import { addDays, localDateString, resolveRange, startOfLocalDay } from '../src/lib/time.js';
import { renderBill, renderKot } from '../src/lib/receipt.js';
import { effectivePermissions } from '../src/lib/permissions.js';

const lines = [{ unitPricePaise: 6000, qty: 2 }, { unitPricePaise: 1500, qty: 3 }]; // 12000 + 4500

describe('money', () => {
  it('sums in integer paise', () => {
    expect(calcTotals(lines).totalPaise).toBe(16500);
  });
  it('adds exclusive tax with half-up rounding', () => {
    const t = calcTotals(lines, { taxMode: 'EXCLUSIVE', taxBp: 500 });
    expect(t.taxPaise).toBe(825);
    expect(t.totalPaise).toBe(17325);
  });
  it('extracts inclusive tax without changing the total', () => {
    const t = calcTotals(lines, { taxMode: 'INCLUSIVE', taxBp: 500 });
    expect(t.totalPaise).toBe(16500);
    expect(t.taxPaise).toBe(786);
  });
  it('caps discount at subtotal and never goes negative', () => {
    expect(calcTotals(lines, { discountPaise: 999999 }).totalPaise).toBe(0);
    expect(calcTotals(lines, { discountPaise: -5 }).discountPaise).toBe(0);
  });
  it('formats paise', () => {
    expect(paiseToString(12345)).toBe('123.45');
    expect(paiseToString(5)).toBe('0.05');
  });
});

describe('units', () => {
  it('converts mass and volume to the base unit', () => {
    expect(toBase(500, 'g', 'kg')).toBe(0.5);
    expect(toBase(2, 'kg', 'g')).toBe(2000);
    expect(toBase(250, 'ml', 'L')).toBe(0.25);
  });
  it('rejects incompatible units', () => {
    expect(() => toBase(1, 'kg', 'pcs')).toThrow();
  });
});

describe('time (Asia/Kolkata)', () => {
  const tz = 'Asia/Kolkata';
  it('start of local day is 18:30 UTC the day before', () => {
    expect(startOfLocalDay('2026-11-19', tz).toISOString()).toBe('2026-11-18T18:30:00.000Z');
  });
  it('late-night order belongs to the local date', () => {
    expect(localDateString(new Date('2026-11-18T20:00:00Z'), tz)).toBe('2026-11-19');
  });
  it('resolves ranges', () => {
    const r = resolveRange({ range: '7d' }, tz, new Date('2026-11-19T05:00:00Z'));
    expect(r.fromDate).toBe('2026-11-13');
    expect(r.toDate).toBe('2026-11-19');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('receipts', () => {
  const s = { restaurantName: 'AMMAS', receiptWidth: 32, taxMode: 'NONE', taxBp: 0, timezone: 'Asia/Kolkata', billFooter: 'Thank you' };
  const o = {
    billNo: 'AM-20261119-0001', kotNo: 7, type: 'DINE_IN', tableLabel: '4',
    items: [{ name: 'Masala Dosa', qty: 2, unitPricePaise: 7000, note: 'less oil' }],
    subtotalPaise: 14000, discountPaise: 0, taxPaise: 0, totalPaise: 14000, paidPaise: 14000, paymentStatus: 'PAID', confirmedAt: new Date('2026-11-19T05:00:00Z'),
  };
  it('never exceeds the paper width', () => {
    for (const l of renderBill(s, o)) expect(l.length).toBeLessThanOrEqual(32);
  });
  it('marks reprints as copies with the original bill number', () => {
    const t = renderBill(s, o, { isCopy: true }).join('\n');
    expect(t).toContain('COPY');
    expect(t).toContain('Original bill: AM-20261119-0001');
  });
  it('KOT has no payment or money details', () => {
    const t = renderKot(s, o).join('\n');
    expect(t).not.toMatch(/Rs\.|PAID|Payment|TOTAL|140\.00/);
    expect(t).toContain('2 x Masala Dosa');
    expect(t).toContain('less oil');
  });
});

describe('permissions', () => {
  it('applies grants then denies', () => {
    expect(effectivePermissions(['a', 'b'], ['c'], ['a']).sort()).toEqual(['b', 'c']);
  });
});
