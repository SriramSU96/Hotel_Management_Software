import type { Request } from 'express';
import { AuditLog, Counter, Ingredient, Settings } from '../models/index.js';
import { localDateString } from '../lib/time.js';
import type { Server as IOServer } from 'socket.io';

let io: IOServer | null = null;
export const setIO = (s: IOServer) => { io = s; };
export const emit = (event: string, payload: unknown = {}) => { io?.emit(event, payload); };

export async function audit(
  req: Request | null,
  action: string,
  entity: string,
  entityId: unknown,
  data: { before?: unknown; after?: unknown; note?: string } = {},
) {
  await AuditLog.create({
    userId: req?.user?.id,
    userName: req?.user?.name ?? 'system',
    action, entity, entityId: entityId ? String(entityId) : undefined,
    before: data.before, after: data.after, note: data.note,
    ip: req?.ip,
  });
}

export async function getSettings(): Promise<any> {
  const s = await Settings.findOneAndUpdate({ key: 'main' }, { $setOnInsert: { key: 'main' } }, { upsert: true, new: true });
  return s;
}

/** Items at or below their reorder level. Filtered in code so it works on any MongoDB-compatible database. */
export async function lowStockItems(select = '') {
  const items = await Ingredient.find({ active: true, reorderLevel: { $gt: 0 } }).select(select).sort({ name: 1 });
  return items.filter((i: any) => i.qty <= i.reorderLevel);
}

export async function nextSeq(id: string): Promise<number> {
  const c = await Counter.findByIdAndUpdate(id, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return c.seq;
}

/** Human-readable, unique, never reused: AM-20261118-0001 (resets numbering each local day). */
export async function nextBillNo(tz: string): Promise<string> {
  const day = localDateString(new Date(), tz).replaceAll('-', '');
  const n = await nextSeq(`bill-${day}`);
  return `AM-${day}-${String(n).padStart(4, '0')}`;
}

export async function nextKotNo(tz: string): Promise<number> {
  const day = localDateString(new Date(), tz).replaceAll('-', '');
  return nextSeq(`kot-${day}`);
}
