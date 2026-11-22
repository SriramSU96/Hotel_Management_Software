/** All money is integer paise. Never use floating point for financial values. */

export type TaxMode = 'NONE' | 'EXCLUSIVE' | 'INCLUSIVE';

export interface Totals {
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
}

/** Integer division rounded half up, for non-negative integers. */
export function roundDiv(a: number, b: number): number {
  return Math.floor((2 * a + b) / (2 * b));
}

export function calcTotals(
  lines: { unitPricePaise: number; qty: number }[],
  opts: { discountPaise?: number; taxMode?: TaxMode; taxBp?: number } = {},
): Totals {
  const subtotal = lines.reduce((s, l) => s + l.unitPricePaise * l.qty, 0);
  const discount = Math.min(Math.max(0, Math.trunc(opts.discountPaise ?? 0)), subtotal);
  const taxable = subtotal - discount;
  const mode = opts.taxMode ?? 'NONE';
  const bp = Math.max(0, Math.trunc(opts.taxBp ?? 0));
  let tax = 0;
  let total = taxable;
  if (mode === 'EXCLUSIVE' && bp > 0) {
    tax = roundDiv(taxable * bp, 10000);
    total = taxable + tax;
  } else if (mode === 'INCLUSIVE' && bp > 0) {
    tax = taxable - roundDiv(taxable * 10000, 10000 + bp);
    total = taxable;
  }
  return { subtotalPaise: subtotal, discountPaise: discount, taxPaise: tax, totalPaise: total };
}

/** 12345 -> "123.45" */
export function paiseToString(p: number): string {
  const sign = p < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(p));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function rupeesToPaise(r: number): number {
  return Math.round(r * 100);
}
