import { HttpError } from '../middleware/error.js';

export const UNITS = ['pcs', 'kg', 'g', 'L', 'ml', 'packet', 'box'] as const;
export type Unit = (typeof UNITS)[number];

const MASS: Unit[] = ['kg', 'g'];
const VOLUME: Unit[] = ['L', 'ml'];

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

/** Convert a quantity entered in `unit` to the ingredient's base unit. */
export function toBase(qty: number, unit: Unit, base: Unit): number {
  if (unit === base) return round3(qty);
  if (MASS.includes(unit) && MASS.includes(base)) {
    return round3(unit === 'g' ? qty / 1000 : qty * 1000);
  }
  if (VOLUME.includes(unit) && VOLUME.includes(base)) {
    return round3(unit === 'ml' ? qty / 1000 : qty * 1000);
  }
  throw new HttpError(400, `Cannot convert ${unit} to ${base} for this item.`);
}
