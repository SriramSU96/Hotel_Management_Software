import { Types } from 'mongoose';
import { CashSession, Order, Payment, Product, Refund, Table } from '../models/index.js';
import { calcTotals } from '../lib/money.js';
import { HttpError } from '../middleware/error.js';
import { emit, getSettings, nextBillNo, nextKotNo } from './core.js';
import { enqueuePrint } from './printing.js';
import { newToken } from '../middleware/auth.js';
import { withLock } from '../lib/lock.js';

export interface LineInput { productId: string; qty: number; note?: string }

/** Re-price lines from the server catalogue. Browser prices are never trusted. */
export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'PARCEL';

/** Price of a product for an order type; falls back to the dine-in price when no special price is set. */
export function priceFor(p: any, type: OrderType): number {
  const v = type === 'TAKEAWAY' ? p.takeawayPricePaise : type === 'PARCEL' ? p.parcelPricePaise : null;
  return typeof v === 'number' ? v : p.pricePaise;
}

export async function buildLines(inputs: LineInput[], type: OrderType = 'DINE_IN') {
  const ids = inputs.map((l) => l.productId);
  if (ids.some((id) => !Types.ObjectId.isValid(id))) throw new HttpError(400, 'Unknown item.');
  const products = await Product.find({ _id: { $in: ids }, active: true }).populate('categoryId', 'name');
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const merged = new Map<string, LineInput>();
  for (const l of inputs) {
    const prev = merged.get(l.productId + '|' + (l.note ?? ''));
    if (prev) prev.qty += l.qty;
    else merged.set(l.productId + '|' + (l.note ?? ''), { ...l });
  }
  return [...merged.values()].map((l) => {
    const p = byId.get(l.productId);
    if (!p) throw new HttpError(400, 'An item on this order no longer exists.');
    if (p.status !== 'AVAILABLE') throw new HttpError(409, `${p.name} is not available right now.`, 'UNAVAILABLE');
    return {
      productId: p._id, name: p.name, nameTa: p.nameTa ?? undefined,
      category: (p.categoryId as any)?.name, unitPricePaise: priceFor(p, type), qty: l.qty, note: l.note?.trim() || undefined,
    };
  });
}

export async function applyTotals(order: any, discountPaise = 0) {
  const s = await getSettings();
  order.taxMode = s.taxMode;
  order.taxBp = s.taxBp;
  const t = calcTotals(order.items, { discountPaise: s.discountsEnabled ? discountPaise : 0, taxMode: s.taxMode as any, taxBp: s.taxBp });
  order.subtotalPaise = t.subtotalPaise;
  order.discountPaise = t.discountPaise;
  order.taxPaise = t.taxPaise;
  order.totalPaise = t.totalPaise;
}

export function event(order: any, type: string, by?: string, note?: string) {
  order.events.push({ at: new Date(), type, by, note });
}

/**
 * Confirm an order: assign bill + KOT numbers, occupy the table, and queue the prints.
 * Safe against double taps: an atomic status flip decides the single winner.
 */
export async function confirmOrder(orderId: string, user: { id: string; name: string }) {
  const claimed = await Order.findOneAndUpdate(
    { _id: orderId, status: 'DRAFT', confirmLock: { $ne: true } },
    { $set: { confirmLock: true } },
    { new: true },
  );
  if (!claimed) {
    const existing = await Order.findById(orderId);
    if (!existing) throw new HttpError(404, 'Order not found.');
    if (existing.status !== 'DRAFT') return existing; // already confirmed: return it, do nothing twice
    throw new HttpError(409, 'This order is being confirmed. Please wait a moment.');
  }
  try {
    if (!claimed.items.length) throw new HttpError(400, 'Add at least one item.');
    // re-check availability and refresh prices at confirm time
    const fresh = await buildLines(claimed.items.map((i: any) => ({ productId: String(i.productId), qty: i.qty, note: i.note })), claimed.type as OrderType);
    claimed.set('items', fresh);
    await applyTotals(claimed, claimed.discountPaise);
    let tableClaimed = false;
    if (claimed.type === 'DINE_IN' && (claimed.tableId || (await getSettings()).useTables)) {
      const t = claimed.tableId ? await Table.findById(claimed.tableId) : null;
      if (!t || !t.active) throw new HttpError(400, 'Please choose a table.');
      // Claim the table atomically: of several simultaneous orders for one table, exactly one wins.
      const won = await withLock(`table:${t._id}`, () => Table.findOneAndUpdate(
        { _id: t._id, active: true, $or: [{ activeOrderId: null }, { activeOrderId: { $exists: false } }, { activeOrderId: claimed._id }] },
        { $set: { activeOrderId: claimed._id } },
      ));
      if (!won) throw new HttpError(409, `Table ${t.label} already has an open order.`, 'TABLE_BUSY');
      tableClaimed = true;
    }
    const s = await getSettings();
    claimed.billNo = await nextBillNo(s.timezone);
    claimed.kotNo = await nextKotNo(s.timezone);
    claimed.status = 'CONFIRMED';
    claimed.confirmedAt = new Date();
    claimed.receiptToken = newToken().slice(0, 22);
    event(claimed, 'CONFIRMED', user.name);
    try { await claimed.save(); } catch (e) {
      if (tableClaimed) await Table.updateOne({ _id: claimed.tableId, activeOrderId: claimed._id }, { $set: { activeOrderId: null } });
      throw e;
    }
    // in "Browser print" mode the cashier prints from the screen, so no job waits for a print bridge
    if (s.printerConnection !== 'BROWSER') await enqueuePrint(claimed, 'BILL', { byName: user.name, key: `BILL:${claimed._id}:original` });
    if (s.kotPrinterEnabled && s.printerConnection !== 'BROWSER') await enqueuePrint(claimed, 'KOT', { byName: user.name, key: `KOT:${claimed._id}:original` });
    emit('orders:changed', { id: String(claimed._id) });
    emit('kitchen:changed', { id: String(claimed._id) });
    return claimed;
  } catch (e) {
    await Order.updateOne({ _id: orderId, status: 'DRAFT' }, { $set: { confirmLock: false } });
    if (claimed.type === 'DINE_IN' && claimed.tableId) await Table.updateOne({ _id: claimed.tableId, activeOrderId: claimed._id }, { $set: { activeOrderId: null } });
    throw e;
  }
}

export async function currentCashSession() {
  return CashSession.findOne({ status: 'OPEN' }).sort({ openedAt: -1 });
}

type PayInput = { idempotencyKey: string; method: 'CASH' | 'UPI'; amountPaise: number; tenderedPaise?: number; upiVerified?: boolean; upiRef?: string };
type User = { id: string; name: string };

/** Payments for one bill are processed one at a time (see lib/lock.ts). */
export const recordPayment = (orderId: string, input: PayInput, user: User) => withLock(`order:${orderId}`, () => recordPaymentLocked(orderId, input, user));
export const recordRefund = (orderId: string, input: RefundInput, user: User) => withLock(`order:${orderId}`, () => recordRefundLocked(orderId, input, user));
type RefundInput = { idempotencyKey: string; method: 'CASH' | 'UPI'; amountPaise: number; reason: string };

async function recordPaymentLocked(
  orderId: string,
  input: PayInput,
  user: User,
) {
  const dup = await Payment.findOne({ idempotencyKey: input.idempotencyKey });
  if (dup) {
    // a retry of the same payment returns it; the same key on a DIFFERENT bill is refused (it would silently leave that bill unpaid)
    if (String(dup.orderId) !== String(orderId)) throw new HttpError(409, 'This payment was already saved on another bill. Please try again.', 'KEY_REUSED');
    return { order: await Order.findById(orderId), payment: dup, duplicate: true };
  }
  const order = await Order.findById(orderId);
  if (!order) throw new HttpError(404, 'Order not found.');
  if (order.status === 'DRAFT') throw new HttpError(409, 'Confirm the order before taking payment.');
  if (order.status === 'CANCELLED') throw new HttpError(409, 'This order was cancelled.');
  if (input.method === 'UPI' && !input.upiVerified) {
    throw new HttpError(400, 'Confirm that the UPI payment has arrived before saving.', 'UPI_NOT_VERIFIED');
  }
  const due = order.totalPaise - order.paidPaise;
  if (due <= 0) throw new HttpError(409, 'This bill is already fully paid.');
  if (input.amountPaise > due) throw new HttpError(400, 'Amount is more than the balance due.');
  // Reserve the amount in ONE atomic step. The filter only matches while the new total still fits the bill, so two
  // payments arriving together (two tablets, a double tap with a fresh key) can never add up to more than the bill.
  const reserved = await Order.findOneAndUpdate(
    { _id: order._id, status: { $nin: ['DRAFT', 'CANCELLED'] }, paidPaise: { $lte: order.totalPaise - input.amountPaise } },
    { $inc: { paidPaise: input.amountPaise } },
    { new: true },
  );
  if (!reserved) throw new HttpError(409, 'This bill was just changed by someone else. Please check the balance and try again.', 'BALANCE_CHANGED');
  const cs = input.method === 'CASH' ? await currentCashSession() : null;
  let payment;
  try {
    payment = await Payment.create({
      orderId: order._id, idempotencyKey: input.idempotencyKey, method: input.method,
      amountPaise: input.amountPaise, tenderedPaise: input.tenderedPaise, upiVerified: input.method === 'UPI',
      upiRef: input.upiRef, cashSessionId: cs?._id, by: user.id, byName: user.name,
    });
  } catch (e: any) {
    await Order.updateOne({ _id: order._id }, { $inc: { paidPaise: -input.amountPaise } }); // give the reserved amount back
    if (e?.code === 11000) {
      const again = await Payment.findOne({ idempotencyKey: input.idempotencyKey });
      if (again && String(again.orderId) === String(orderId)) return { order: await Order.findById(orderId), payment: again, duplicate: true };
      throw new HttpError(409, 'This payment was already saved on another bill. Please try again.', 'KEY_REUSED');
    }
    throw e;
  }
  // status only ever moves forward, so a slower concurrent request cannot overwrite a newer one with a stale value
  await Order.updateOne({ _id: order._id, paidPaise: { $gte: order.totalPaise } }, { $set: { paymentStatus: 'PAID' } });
  await Order.updateOne({ _id: order._id, paidPaise: { $gt: 0, $lt: order.totalPaise }, paymentStatus: 'UNPAID' }, { $set: { paymentStatus: 'PARTIALLY_PAID' } });
  await Order.updateOne({ _id: order._id }, { $push: { events: { at: new Date(), type: 'PAYMENT', by: user.name, note: `${input.method} ${input.amountPaise}` } } });
  emit('orders:changed', { id: String(order._id) });
  return { order: await Order.findById(order._id), payment, duplicate: false };
}

export async function releaseTable(order: any) {
  if (order.tableId) await Table.updateOne({ _id: order.tableId, activeOrderId: order._id }, { $set: { activeOrderId: null } });
}

async function recordRefundLocked(
  orderId: string,
  input: RefundInput,
  user: User,
) {
  const dup = await Refund.findOne({ idempotencyKey: input.idempotencyKey });
  if (dup) {
    if (String(dup.orderId) !== String(orderId)) throw new HttpError(409, 'This refund was already saved on another bill. Please try again.', 'KEY_REUSED');
    return { order: await Order.findById(orderId), refund: dup };
  }
  const order = await Order.findById(orderId);
  if (!order) throw new HttpError(404, 'Order not found.');
  const refundable = order.paidPaise - order.refundedPaise;
  if (input.amountPaise > refundable) throw new HttpError(400, 'Refund is more than the amount paid.');
  // atomic reservation: concurrent refunds can never add up to more than was paid
  const reserved = await Order.findOneAndUpdate(
    { _id: order._id, refundedPaise: { $lte: order.paidPaise - input.amountPaise } },
    { $inc: { refundedPaise: input.amountPaise } },
    { new: true },
  );
  if (!reserved) throw new HttpError(409, 'This bill was just changed by someone else. Please check the balance and try again.', 'BALANCE_CHANGED');
  const cs = input.method === 'CASH' ? await currentCashSession() : null;
  let refund;
  try {
    refund = await Refund.create({ orderId: order._id, ...input, cashSessionId: cs?._id, by: user.id, byName: user.name });
  } catch (e: any) {
    await Order.updateOne({ _id: order._id }, { $inc: { refundedPaise: -input.amountPaise } });
    if (e?.code === 11000) {
      const again = await Refund.findOne({ idempotencyKey: input.idempotencyKey });
      if (again && String(again.orderId) === String(orderId)) return { order: await Order.findById(orderId), refund: again };
      throw new HttpError(409, 'This refund was already saved on another bill. Please try again.', 'KEY_REUSED');
    }
    throw e;
  }
  await Order.updateOne({ _id: order._id, refundedPaise: { $gte: reserved.paidPaise } }, { $set: { paymentStatus: 'REFUNDED' } });
  await Order.updateOne({ _id: order._id }, { $push: { events: { at: new Date(), type: 'REFUND', by: user.name, note: `${input.method} ${input.amountPaise}: ${input.reason}` } } });
  emit('orders:changed', { id: String(order._id) });
  return { order: await Order.findById(order._id), refund };
}
