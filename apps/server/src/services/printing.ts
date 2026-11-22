import { Types } from 'mongoose';
import { PrintJob, Order } from '../models/index.js';
import { renderBill, renderKot, type ReceiptOrder, type ReceiptSettings } from '../lib/receipt.js';
import { emit, getSettings } from './core.js';
import { HttpError } from '../middleware/error.js';

export function settingsForReceipt(s: any): ReceiptSettings {
  return {
    restaurantName: s.restaurantName, address: s.address, phone: s.phone, gstin: s.gstin,
    billFooter: s.billFooter, receiptWidth: s.receiptWidth, taxMode: s.taxMode, taxBp: s.taxBp, timezone: s.timezone,
  };
}

export function orderForReceipt(o: any): ReceiptOrder {
  return {
    billNo: o.billNo, kotNo: o.kotNo, type: o.type, tableLabel: o.tableLabel,
    items: o.items.map((i: any) => ({ name: i.name, qty: i.qty, unitPricePaise: i.unitPricePaise, note: i.note })),
    subtotalPaise: o.subtotalPaise, discountPaise: o.discountPaise, taxPaise: o.taxPaise, totalPaise: o.totalPaise,
    paidPaise: o.paidPaise, paymentStatus: o.paymentStatus, confirmedAt: o.confirmedAt,
  };
}

/** Create (or return the existing) print job. The idempotency key makes this safe to repeat. */
export async function enqueuePrint(
  order: any,
  kind: 'BILL' | 'KOT',
  opts: { isCopy?: boolean; copyOfJobId?: Types.ObjectId; byName?: string; key?: string } = {},
) {
  const key = opts.key ?? `${kind}:${order._id}:${opts.isCopy ? `copy-${Date.now()}` : 'original'}`;
  const existing = await PrintJob.findOne({ idempotencyKey: key });
  if (existing) return existing;
  const s = await getSettings();
  const rs = settingsForReceipt(s);
  const ro = orderForReceipt(order);
  const lines = kind === 'BILL' ? renderBill(rs, ro, { isCopy: opts.isCopy }) : renderKot(rs, ro, { isCopy: opts.isCopy });
  try {
    const job = await PrintJob.create({
      idempotencyKey: key, orderId: order._id, kind, isCopy: !!opts.isCopy, copyOfJobId: opts.copyOfJobId,
      billNo: order.billNo, lines, createdByName: opts.byName,
      events: [{ at: new Date(), status: 'QUEUED', note: opts.isCopy ? 'Copy requested' : 'Created' }],
    });
    emit('print:changed', { id: String(job._id) });
    return job;
  } catch (e: any) {
    if (e?.code === 11000) return (await PrintJob.findOne({ idempotencyKey: key }))!;
    throw e;
  }
}

/** Retry resets the SAME job; it never creates a second bill or a second job. */
export async function retryJob(id: string) {
  const job = await PrintJob.findById(id);
  if (!job) throw new HttpError(404, 'Print job not found.');
  if (job.status === 'PRINTED') throw new HttpError(409, 'This was already printed. Use Reprint for a copy.');
  if (job.status === 'CANCELLED') throw new HttpError(409, 'This print was cancelled.');
  if (job.status === 'QUEUED' || job.status === 'PRINTING') return job;
  job.status = 'QUEUED';
  job.lastError = undefined;
  job.events.push({ at: new Date(), status: 'QUEUED', note: 'Retry requested' } as any);
  await job.save();
  emit('print:changed', { id: String(job._id) });
  return job;
}

/** Bridge claims the next queued job. Stale PRINTING claims (bridge crashed) are released after 60 s. */
export async function claimNext() {
  const stale = new Date(Date.now() - 60_000);
  await PrintJob.updateMany(
    { status: 'PRINTING', claimedAt: { $lt: stale } },
    { $set: { status: 'FAILED', lastError: 'Printer bridge did not respond' } },
  );
  const job = await PrintJob.findOneAndUpdate(
    { status: 'QUEUED' },
    { $set: { status: 'PRINTING', claimedAt: new Date() }, $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, new: true },
  );
  if (job) emit('print:changed', { id: String(job._id) });
  return job;
}

export async function reportResult(id: string, result: { status: 'PRINTED' | 'SENT' | 'FAILED'; error?: string }) {
  const job = await PrintJob.findById(id);
  if (!job) throw new HttpError(404, 'Print job not found.');
  if (job.status === 'PRINTED' || job.status === 'CANCELLED') return job; // idempotent
  job.status = result.status;
  job.lastError = result.status === 'FAILED' ? (result.error ?? 'Printer error') : undefined;
  job.finishedAt = new Date();
  job.events.push({ at: new Date(), status: result.status, note: result.error } as any);
  await job.save();
  if (job.kind === 'BILL' && !job.isCopy && (result.status === 'PRINTED' || result.status === 'SENT')) {
    await Order.updateOne({ _id: job.orderId, paperCopy: 'PENDING' }, { $set: { paperCopy: 'PRINTED' } });
  }
  emit('print:changed', { id: String(job._id), orderId: String(job.orderId) });
  return job;
}
