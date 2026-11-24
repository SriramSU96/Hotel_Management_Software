import { Router } from 'express';
import { z } from 'zod';
import { Order, Payment, PrintJob, Refund, Table } from '../models/index.js';
import { asyncHandler, HttpError, parse } from '../middleware/error.js';
import { can, requireLogin, requirePerm } from '../middleware/auth.js';
import { audit, emit, getSettings } from '../services/core.js';
import { applyTotals, buildLines, confirmOrder, event, recordPayment, recordRefund, releaseTable } from '../services/orders.js';
import { enqueuePrint, orderForReceipt, settingsForReceipt } from '../services/printing.js';
import { renderBill, renderKot } from '../lib/receipt.js';
import { localDateString, startOfLocalDay, addDays } from '../lib/time.js';

export const ordersRouter = Router();

const lineSchema = z.object({ productId: z.string(), qty: z.number().int().min(1).max(99), note: z.string().max(80).optional() });
const orderBody = z.object({
  idempotencyKey: z.string().min(8).max(80),
  type: z.enum(['DINE_IN', 'TAKEAWAY', 'PARCEL']),
  tableId: z.string().nullish(),
  items: z.array(lineSchema).min(1).max(60),
  discountPaise: z.number().int().min(0).optional(),
  customerName: z.string().max(80).optional(),
  customerPhone: z.string().max(20).optional(),
  confirm: z.boolean().optional(),
});

function present(o: any) {
  const obj = o.toObject ? o.toObject() : o;
  return { ...obj, duePaise: obj.totalPaise - obj.paidPaise };
}

ordersRouter.get('/', requirePerm('orders.create', 'kitchen.view', 'reports.view'), asyncHandler(async (req, res) => {
  const s = await getSettings();
  const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const q = parse(z.object({
    view: z.enum(['active', 'today', 'history']).default('active'),
    date: day.optional(), from: day.optional(), to: day.optional(), // history range (date = older single-day form)
    q: z.string().max(60).optional(),
    type: z.enum(['DINE_IN', 'TAKEAWAY', 'PARCEL']).optional(),
    status: z.enum(['DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']).optional(),
    payment: z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'REFUNDED']).optional(),
    sort: z.enum(['createdAt', 'totalPaise', 'billNo']).default('createdAt'),
    dir: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(5).max(100).optional(),
  }), req.query);
  const ACTIVE = ['DRAFT', 'CONFIRMED', 'PREPARING', 'READY'];
  const filter: any = {};
  if (q.view === 'active') filter.status = { $in: q.status ? ACTIVE.filter((x) => x === q.status) : ACTIVE };
  else {
    const today = localDateString(new Date(), s.timezone);
    let from = q.view === 'today' ? today : (q.from ?? q.date ?? today);
    let to = q.view === 'today' ? today : (q.to ?? q.date ?? from);
    if (from > to) [from, to] = [to, from];
    filter.createdAt = { $gte: startOfLocalDay(from, s.timezone), $lt: startOfLocalDay(addDays(to, 1), s.timezone) };
    if (q.status) filter.status = q.status;
  }
  if (q.type) filter.type = q.type;
  if (q.payment) filter.paymentStatus = q.payment;
  const term = q.q?.trim();
  if (term) { // bill number, customer, phone, table or an item name
    const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ billNo: rx }, { customerName: rx }, { customerPhone: rx }, { tableLabel: rx }, { 'items.name': rx }];
  }
  // no page/pageSize in the request = the older call: first 200 rows in one go
  const legacy = req.query.page === undefined && req.query.pageSize === undefined;
  const pageSize = q.pageSize ?? (legacy ? 200 : 25);
  const total = await Order.countDocuments(filter);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(q.page, pages);
  const orders = await Order.find(filter).sort({ [q.sort]: q.dir === 'asc' ? 1 : -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize);
  res.json({ orders: orders.map(present), total, page, pageSize, pages });
}));

ordersRouter.get('/:id', requirePerm('orders.create', 'kitchen.view', 'reports.view'), asyncHandler(async (req, res) => {
  const o = await Order.findById(req.params.id);
  if (!o) throw new HttpError(404, 'Order not found.');
  const [payments, refunds, jobs] = await Promise.all([
    Payment.find({ orderId: o._id }).sort({ createdAt: 1 }),
    Refund.find({ orderId: o._id }).sort({ createdAt: 1 }),
    PrintJob.find({ orderId: o._id }).select('-lines').sort({ createdAt: 1 }),
  ]);
  res.json({ order: present(o), payments, refunds, printJobs: jobs });
}));

/** Create an order. The idempotency key makes a double tap or network retry return the same order. */
ordersRouter.post('/', requirePerm('orders.create'), asyncHandler(async (req, res) => {
  const b = parse(orderBody, req.body);
  const existing = await Order.findOne({ idempotencyKey: b.idempotencyKey });
  if (existing) return res.json({ order: present(existing), duplicate: true });
  const s = await getSettings();
  if (b.type === 'PARCEL' && !s.parcelEnabled) throw new HttpError(400, 'Parcel is not enabled.');
  if (b.discountPaise && !can(req, 'orders.discount')) throw new HttpError(403, 'You cannot give a discount.');
  let table: any = null;
  if (b.type === 'DINE_IN' && (s.useTables || b.tableId)) { // customers may sit anywhere: a table is only needed when Settings > Use tables is on
    table = b.tableId ? await Table.findById(b.tableId) : null;
    if (!table || !table.active) throw new HttpError(400, 'Please choose a table.');
    if (table.activeOrderId) throw new HttpError(409, `Table ${table.label} already has an open order.`, 'TABLE_BUSY');
  }
  const items = await buildLines(b.items, b.type);
  let order;
  try {
    order = new Order({
      idempotencyKey: b.idempotencyKey, type: b.type, tableId: table?._id ?? null, tableLabel: table?.label,
      items, customerName: b.customerName?.trim() || undefined, customerPhone: b.customerPhone?.trim() || undefined,
      createdBy: req.user!.id, createdByName: req.user!.name, discountPaise: b.discountPaise ?? 0,
    });
    await applyTotals(order, b.discountPaise ?? 0);
    event(order, 'CREATED', req.user!.name);
    await order.save();
  } catch (e: any) {
    if (e?.code === 11000) {
      const again = await Order.findOne({ idempotencyKey: b.idempotencyKey });
      if (again) return res.json({ order: present(again), duplicate: true });
    }
    throw e;
  }
  const final = b.confirm ? await confirmOrder(String(order._id), req.user!) : order;
  res.status(201).json({ order: present(final) });
}));

ordersRouter.put('/:id', requirePerm('orders.create'), asyncHandler(async (req, res) => {
  const b = parse(orderBody.pick({ items: true, discountPaise: true, customerName: true, customerPhone: true }), req.body);
  const o = await Order.findById(req.params.id);
  if (!o) throw new HttpError(404, 'Order not found.');
  if (o.status !== 'DRAFT') throw new HttpError(409, 'Only an unconfirmed order can be edited.');
  if (b.discountPaise && !can(req, 'orders.discount')) throw new HttpError(403, 'You cannot give a discount.');
  o.set('items', await buildLines(b.items, o.type as any));
  o.customerName = b.customerName?.trim() || undefined;
  o.customerPhone = b.customerPhone?.trim() || undefined;
  await applyTotals(o, b.discountPaise ?? 0);
  await o.save();
  res.json({ order: present(o) });
}));

ordersRouter.post('/:id/confirm', requirePerm('orders.create'), asyncHandler(async (req, res) => {
  const o = await confirmOrder(String(req.params.id), req.user!);
  res.json({ order: present(o) });
}));

ordersRouter.post('/:id/cancel', requirePerm('orders.cancel'), asyncHandler(async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().min(2, 'Please give a reason').max(200) }), req.body);
  const o = await Order.findById(req.params.id);
  if (!o) throw new HttpError(404, 'Order not found.');
  if (o.status === 'CANCELLED') return res.json({ order: present(o) });
  if (o.status === 'COMPLETED') throw new HttpError(409, 'A completed order cannot be cancelled. Use refund.');
  if (o.paidPaise - o.refundedPaise > 0) throw new HttpError(409, 'Refund the payment first, then cancel.');
  o.status = 'CANCELLED';
  o.cancelledAt = new Date();
  o.cancelReason = reason;
  event(o, 'CANCELLED', req.user!.name, reason);
  await o.save();
  await releaseTable(o);
  await PrintJob.updateMany({ orderId: o._id, status: { $in: ['QUEUED', 'FAILED'] } }, { $set: { status: 'CANCELLED' } });
  await audit(req, 'order.cancel', 'Order', o._id, { note: reason });
  emit('orders:changed', { id: String(o._id) });
  emit('kitchen:changed', { id: String(o._id) });
  res.json({ order: present(o) });
}));

ordersRouter.post('/:id/complete', requirePerm('orders.complete'), asyncHandler(async (req, res) => {
  const o = await Order.findById(req.params.id);
  if (!o) throw new HttpError(404, 'Order not found.');
  if (o.status === 'COMPLETED') return res.json({ order: present(o) });
  if (!['CONFIRMED', 'PREPARING', 'READY'].includes(o.status)) throw new HttpError(409, 'This order cannot be completed.');
  o.status = 'COMPLETED';
  o.completedAt = new Date();
  event(o, 'COMPLETED', req.user!.name);
  await o.save();
  await releaseTable(o);
  emit('orders:changed', { id: String(o._id) });
  emit('kitchen:changed', { id: String(o._id) });
  res.json({ order: present(o) });
}));

ordersRouter.post('/:id/payments', requirePerm('payments.record'), asyncHandler(async (req, res) => {
  const b = parse(z.object({
    idempotencyKey: z.string().min(8).max(80), method: z.enum(['CASH', 'UPI']),
    amountPaise: z.number().int().min(1), tenderedPaise: z.number().int().min(0).optional(),
    upiVerified: z.boolean().optional(), upiRef: z.string().max(60).optional(),
  }), req.body);
  const r = await recordPayment(String(req.params.id), b, req.user!);
  res.json({ order: present(r.order), payment: r.payment, duplicate: r.duplicate });
}));

ordersRouter.post('/:id/refunds', requirePerm('orders.refund'), asyncHandler(async (req, res) => {
  const b = parse(z.object({
    idempotencyKey: z.string().min(8).max(80), method: z.enum(['CASH', 'UPI']),
    amountPaise: z.number().int().min(1), reason: z.string().min(2).max(200),
  }), req.body);
  const r = await recordRefund(String(req.params.id), b, req.user!);
  await audit(req, 'order.refund', 'Order', req.params.id, { after: b });
  res.json({ order: present(r.order), refund: r.refund });
}));

/** Cashier decision after a print failure: finish the sale without paper. */
ordersRouter.post('/:id/paper-copy', requirePerm('orders.create', 'payments.record'), asyncHandler(async (req, res) => {
  const { value } = parse(z.object({ value: z.enum(['NOT_PRINTED', 'PRINTED']) }), req.body);
  const o = await Order.findByIdAndUpdate(req.params.id, { paperCopy: value }, { new: true });
  if (!o) throw new HttpError(404, 'Order not found.');
  event(o, 'PAPER_COPY', req.user!.name, value);
  await o.save();
  await audit(req, 'order.paper_copy', 'Order', o._id, { after: value });
  res.json({ order: present(o) });
}));

// Text of the bill or kitchen ticket for printing from the browser (any printer the computer can use).
// The first browser print of a bill is the original; later ones are marked COPY so a printed copy is never mistaken for a new bill.
ordersRouter.get('/:id/receipt', requirePerm('orders.create', 'payments.record', 'kitchen.view', 'bills.reprint'), asyncHandler(async (req, res) => {
  const { kind, copy } = parse(z.object({ kind: z.enum(['BILL', 'KOT']).default('BILL'), copy: z.enum(['0', '1']).default('0') }), req.query);
  const o = await Order.findById(req.params.id);
  if (!o || !o.billNo) throw new HttpError(404, 'Bill not found.');
  const st = await getSettings();
  const bp = st.browserPrint ?? {};
  const width = bp.paperMm <= 58 ? 32 : bp.paperMm <= 80 ? 42 : 64; // characters per line for the chosen paper
  const rs = { ...settingsForReceipt(st), receiptWidth: width };
  const lines = (kind === 'BILL' ? renderBill : renderKot)(rs, orderForReceipt(o), { isCopy: copy === '1' });
  await audit(req, `print.browser_${kind.toLowerCase()}`, 'Order', o._id, { note: copy === '1' ? 'copy' : 'original' });
  res.json({ lines, paperMm: bp.paperMm ?? 80, fontPx: bp.fontPx ?? 13, copies: bp.copies ?? 1 });
}));

ordersRouter.post('/:id/reprint', requirePerm('bills.reprint'), asyncHandler(async (req, res) => {
  const { kind } = parse(z.object({ kind: z.enum(['BILL', 'KOT']).default('BILL') }), req.body);
  const o = await Order.findById(req.params.id);
  if (!o || !o.billNo) throw new HttpError(404, 'Bill not found.');
  if (kind === 'KOT' && !can(req, 'kot.reprint')) throw new HttpError(403, 'You cannot reprint kitchen tickets.');
  const job = await enqueuePrint(o, kind, { isCopy: true, byName: req.user!.name });
  await audit(req, `print.reprint_${kind.toLowerCase()}`, 'Order', o._id);
  res.json({ job: { id: job._id, status: job.status } });
}));
