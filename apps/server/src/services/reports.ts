import { Expense, Ingredient, Order, Payment, Product, Refund, StockMovement } from '../models/index.js';
import { getSettings, lowStockItems } from './core.js';
import { localWeekday, previousRange, type DateRange } from '../lib/time.js';
import { paiseToString } from '../lib/money.js';

const hourOf = (d: Date, tz: string) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(d)) % 24;

interface Core {
  orders: number;
  grossPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalBilledPaise: number;
  refundsPaise: number;
  netPaise: number;
  avgOrderPaise: number;
  cashPaise: number;
  upiPaise: number;
  pendingPaise: number;
  cancelled: number;
  expensesPaise: number;
  purchasesPaise: number;
}

async function core(r: DateRange): Promise<Core> {
  const orders = await Order.find({ confirmedAt: { $gte: r.from, $lt: r.to }, status: { $ne: 'CANCELLED' } }).select('subtotalPaise discountPaise taxPaise totalPaise paidPaise refundedPaise');
  const [pay, ref, cancelled, exp, pur] = await Promise.all([
    Payment.aggregate([{ $match: { createdAt: { $gte: r.from, $lt: r.to } } }, { $group: { _id: '$method', t: { $sum: '$amountPaise' } } }]),
    Refund.aggregate([{ $match: { createdAt: { $gte: r.from, $lt: r.to } } }, { $group: { _id: null, t: { $sum: '$amountPaise' } } }]),
    Order.countDocuments({ cancelledAt: { $gte: r.from, $lt: r.to } }),
    Expense.aggregate([{ $match: { date: { $gte: r.from, $lt: r.to }, voided: { $ne: true } } }, { $group: { _id: null, t: { $sum: '$amountPaise' } } }]),
    StockMovement.aggregate([{ $match: { type: 'PURCHASE', createdAt: { $gte: r.from, $lt: r.to } } }, { $group: { _id: null, t: { $sum: { $ifNull: ['$costPaise', 0] } } } }]),
  ]);
  const sum = (k: 'subtotalPaise' | 'discountPaise' | 'taxPaise' | 'totalPaise') => orders.reduce((a, o) => a + (o[k] ?? 0), 0);
  const total = sum('totalPaise');
  const refunds = ref[0]?.t ?? 0;
  return {
    orders: orders.length,
    grossPaise: sum('subtotalPaise'),
    discountPaise: sum('discountPaise'),
    taxPaise: sum('taxPaise'),
    totalBilledPaise: total,
    refundsPaise: refunds,
    netPaise: total - sum('taxPaise') - refunds,
    avgOrderPaise: orders.length ? Math.round(total / orders.length) : 0,
    cashPaise: pay.find((p) => p._id === 'CASH')?.t ?? 0,
    upiPaise: pay.find((p) => p._id === 'UPI')?.t ?? 0,
    pendingPaise: orders.reduce((a, o) => a + Math.max(0, o.totalPaise - o.paidPaise), 0),
    cancelled,
    expensesPaise: exp[0]?.t ?? 0,
    purchasesPaise: pur[0]?.t ?? 0,
  };
}

export async function buildSummary(r: DateRange, withCompare = true) {
  const s = await getSettings();
  const tz = s.timezone;
  const current = await core(r);
  const previous = withCompare ? await core(previousRange(r, tz)) : null;

  const orders = await Order.find({ confirmedAt: { $gte: r.from, $lt: r.to }, status: { $ne: 'CANCELLED' } })
    .select('confirmedAt readyAt totalPaise type items createdByName');

  // hourly demand
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, salesPaise: 0 }));
  const weekday = Array.from({ length: 7 }, (_, d) => ({ day: d, orders: 0, salesPaise: 0 }));
  const typeSplit: Record<string, { orders: number; salesPaise: number }> = {};
  const prod = new Map<string, { name: string; category?: string; qty: number; salesPaise: number }>();
  let prepMs = 0, prepN = 0;
  const staff = new Map<string, { name: string; orders: number; salesPaise: number }>();
  for (const o of orders) {
    const at = o.confirmedAt!;
    const h = hours[hourOf(at, tz)];
    h.orders += 1; h.salesPaise += o.totalPaise;
    const wd = weekday[localWeekday(at, tz)];
    wd.orders += 1; wd.salesPaise += o.totalPaise;
    const t = (typeSplit[o.type] ??= { orders: 0, salesPaise: 0 });
    t.orders += 1; t.salesPaise += o.totalPaise;
    const who = o.createdByName || 'Unknown';
    const st = staff.get(who) ?? { name: who, orders: 0, salesPaise: 0 };
    st.orders += 1; st.salesPaise += o.totalPaise; staff.set(who, st);
    if (o.readyAt) { prepMs += o.readyAt.getTime() - at.getTime(); prepN += 1; }
    for (const it of o.items) {
      const k = it.name;
      const p = prod.get(k) ?? { name: it.name, category: it.category ?? undefined, qty: 0, salesPaise: 0 };
      p.qty += it.qty; p.salesPaise += it.unitPricePaise * it.qty;
      prod.set(k, p);
    }
  }
  const peak = [...hours].sort((a, b) => b.orders - a.orders || b.salesPaise - a.salesPaise)[0];
  const imgs = new Map((await Product.find().select('name imageUrl')).map((x) => [x.name, x.imageUrl ?? undefined]));
  const products = [...prod.values()].map((x) => ({ ...x, imageUrl: imgs.get(x.name) }));
  const byQty = [...products].sort((a, b) => b.qty - a.qty);
  const slow = [...products].sort((a, b) => a.qty - b.qty).slice(0, 5);
  const catMap = new Map<string, number>();
  for (const p of products) catMap.set(p.category ?? 'Other', (catMap.get(p.category ?? 'Other') ?? 0) + p.salesPaise);

  // The owner's trend view: sales for each of the last 7 local days, whatever range is selected.
  const dayKey = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);
  const trendOrders = await Order.find({ confirmedAt: { $gte: new Date(Date.now() - 8 * 86_400_000) }, status: { $ne: 'CANCELLED' } }).select('confirmedAt totalPaise taxPaise');
  const byDay = new Map<string, { orders: number; salesPaise: number }>();
  for (const o of trendOrders) {
    const k = dayKey(o.confirmedAt!);
    const v = byDay.get(k) ?? { orders: 0, salesPaise: 0 };
    v.orders += 1; v.salesPaise += o.totalPaise - (o.taxPaise ?? 0); byDay.set(k, v);
  }
  const daily = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(Date.now() - (6 - i) * 86_400_000);
    const key = dayKey(dt);
    return { date: key, day: localWeekday(dt, tz), orders: byDay.get(key)?.orders ?? 0, salesPaise: byDay.get(key)?.salesPaise ?? 0 };
  });

  // What is happening right now (not tied to the selected range).
  const [cooking, ready, openUnpaid] = await Promise.all([
    Order.countDocuments({ status: { $in: ['CONFIRMED', 'PREPARING'] } }),
    Order.countDocuments({ status: 'READY' }),
    Order.aggregate([
      { $match: { status: { $in: ['CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'] }, paymentStatus: { $in: ['UNPAID', 'PARTIALLY_PAID'] } } },
      { $group: { _id: null, n: { $sum: 1 }, t: { $sum: { $subtract: ['$totalPaise', '$paidPaise'] } } } },
    ]),
  ]);
  const live = { cooking, ready, unpaidCount: openUnpaid[0]?.n ?? 0, unpaidPaise: openUnpaid[0]?.t ?? 0 };

  const [lowStock, waste] = await Promise.all([
    lowStockItems('name qty baseUnit reorderLevel'),
    StockMovement.aggregate([
      { $match: { type: 'WASTE', createdAt: { $gte: r.from, $lt: r.to } } },
      { $group: { _id: null, known: { $sum: { $ifNull: ['$costPaise', 0] } }, unknown: { $sum: { $cond: [{ $eq: ['$costPaise', null] }, 1, 0] } }, entries: { $sum: 1 } } },
    ]),
  ]);

  // Profit honesty: without a recipe/consumption mapping there is no COGS, so no real profit.
  const profit = {
    available: false as const,
    reason: 'Profit needs ingredient cost per dish. Add recipes and purchase costs first.',
    partial: {
      label: 'Net sales minus expenses (before ingredient cost)',
      paise: current.netPaise - current.expensesPaise,
    },
    cashView: {
      label: 'Net sales minus expenses minus stock purchases (cash basis, not accounting profit)',
      paise: current.netPaise - current.expensesPaise - current.purchasesPaise,
    },
  };

  return {
    range: { from: r.fromDate, to: r.toDate, label: r.label, timezone: tz },
    current, previous, profit,
    hourly: hours,
    weekday,
    daily,
    live,
    byStaff: [...staff.values()].sort((a, b) => b.salesPaise - a.salesPaise).slice(0, 8),
    peak: peak && peak.orders > 0 ? { hour: peak.hour, orders: peak.orders, salesPaise: peak.salesPaise } : null,
    avgPrepMinutes: prepN ? Math.round(prepMs / prepN / 6000) / 10 : null,
    typeSplit,
    topByQty: byQty.slice(0, 10),
    topBySales: [...products].sort((a, b) => b.salesPaise - a.salesPaise).slice(0, 10),
    slowMoving: slow,
    categoryMix: [...catMap.entries()].map(([name, salesPaise]) => ({ name, salesPaise })).sort((a, b) => b.salesPaise - a.salesPaise),
    lowStock: lowStock.map((i) => ({ name: i.name, qty: i.qty, unit: i.baseUnit, reorderLevel: i.reorderLevel })),
    waste: { entries: waste[0]?.entries ?? 0, valuePaise: waste[0]?.known ?? 0, entriesWithoutCost: waste[0]?.unknown ?? 0 },
  };
}

export type Summary = Awaited<ReturnType<typeof buildSummary>>;

const hr = (h: number) => `${String(h).padStart(2, '0')}:00-${String((h + 1) % 24).padStart(2, '0')}:00`;
const rs = (p: number) => `Rs. ${paiseToString(p)}`;

export function summaryText(sm: Summary, title: string, content: Record<string, boolean> = {}) {
  const on = (k: string) => content[k] !== false;
  const c = sm.current;
  const L: string[] = [
    `${title} - ${sm.range.label}`,
    `Sales (net): ${rs(c.netPaise)} from ${c.orders} orders (avg ${rs(c.avgOrderPaise)})`,
  ];
  if (on('payments')) L.push(`Cash ${rs(c.cashPaise)} | UPI ${rs(c.upiPaise)} | Unpaid ${rs(c.pendingPaise)}`);
  if (on('peakHour') && sm.peak) L.push(`Peak hour: ${hr(sm.peak.hour)} (${sm.peak.orders} orders)`);
  if (on('topItems') && sm.topByQty.length) L.push('Best sellers: ' + sm.topByQty.slice(0, 3).map((p) => `${p.name} x${p.qty}`).join(', '));
  if (on('expenses')) L.push(`Expenses: ${rs(c.expensesPaise)}`);
  if (on('lowStock') && sm.lowStock.length) L.push('Low stock: ' + sm.lowStock.map((i) => `${i.name} (${i.qty} ${i.unit})`).join(', '));
  if (on('waste') && sm.waste.entries) L.push(`Waste: ${sm.waste.entries} entries, recorded cost ${rs(sm.waste.valuePaise)}${sm.waste.entriesWithoutCost ? ` (+${sm.waste.entriesWithoutCost} without cost)` : ''}`);
  if (on('cancelled') && c.cancelled) L.push(`Cancelled orders: ${c.cancelled}`);
  return L.join('\n');
}
