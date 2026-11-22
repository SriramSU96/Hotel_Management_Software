import crypto from 'node:crypto';
import { CashSession, Category, Expense, Feedback, Ingredient, Order, Payment, Product, Purchase, StockMovement, Supplier, Table, mongoose } from '../models/index.js';

/**
 * Demo data for trying out every page (dashboard, orders, kitchen, stock, money, customers, verified report).
 * Every row carries demo:true, so removing it never touches real data.
 */

const rnd = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = <T,>(arr: T[]): T => arr[rnd(0, arr.length - 1)];
const oid = () => new mongoose.Types.ObjectId();
const daysAgo = (d: number, hour = 0, minute = 0) => { const x = new Date(); x.setDate(x.getDate() - d); x.setHours(hour, minute, 0, 0); return x; };

const DEMO_MODELS = [Order, Payment, Expense, CashSession, Feedback, StockMovement, Purchase, Supplier, Ingredient, Product, Category, Table] as const;

export async function demoStatus() {
  const [orders, products, expenses, stock, customers, suppliers, tables] = await Promise.all([
    Order.countDocuments({ demo: true }), Product.countDocuments({ demo: true }), Expense.countDocuments({ demo: true }),
    Ingredient.countDocuments({ demo: true }), Feedback.countDocuments({ demo: true }), Supplier.countDocuments({ demo: true }), Table.countDocuments({ demo: true }),
  ]);
  const counts = { orders, products, expenses, stock, customers, suppliers, tables };
  return { loaded: Object.values(counts).some((n) => n > 0), counts };
}

export async function deleteDemo() {
  const before = await demoStatus();
  // children first, so nothing is left pointing at a deleted row
  for (const m of DEMO_MODELS) await (m as any).deleteMany({ demo: true });
  return before.counts;
}

export async function loadDemo() {
  if ((await demoStatus()).loaded) return null; // already loaded; delete first to reload

  // ---------- menu ----------
  const cStarters = await Category.create({ name: 'Starters', nameTa: 'தொடக்க உணவு', sortOrder: 10, demo: true });
  const cDesserts = await Category.create({ name: 'Desserts', nameTa: 'இனிப்பு', sortOrder: 11, demo: true });
  const newProducts = await Product.insertMany([
    { categoryId: cStarters._id, name: 'Gobi 65', nameTa: 'காலிஃப்ளவர் 65', pricePaise: 14000, sortOrder: 100 },
    { categoryId: cStarters._id, name: 'Paneer Tikka', nameTa: 'பன்னீர் டிக்கா', pricePaise: 18000, sortOrder: 101 },
    { categoryId: cStarters._id, name: 'Chilli Chicken', nameTa: 'சில்லி சிக்கன்', pricePaise: 19000, sortOrder: 102 },
    { categoryId: cDesserts._id, name: 'Gulab Jamun', nameTa: 'குலாப் ஜாமூன்', pricePaise: 6000, sortOrder: 103 },
    { categoryId: cDesserts._id, name: 'Ice Cream', nameTa: 'ஐஸ் கிரீம்', pricePaise: 7000, sortOrder: 104 },
    { categoryId: cDesserts._id, name: 'Filter Coffee', nameTa: 'ஃபில்டர் காபி', pricePaise: 3000, sortOrder: 105 },
  ].map((p) => ({ ...p, parcelPricePaise: p.pricePaise + 1000, demo: true })));
  void newProducts;

  // ---------- tables (skipped when the label already exists) ----------
  for (const label of ['T11', 'T12', 'T13', 'T14']) {
    if (await Table.exists({ label })) continue;
    await Table.create({ label, capacity: 4, sortOrder: 20, publicToken: crypto.randomBytes(9).toString('base64url'), demo: true });
  }

  // ---------- orders + payments (last 14 days, all products incl. the owner's own) ----------
  const pool = await Product.find({ active: true, status: 'AVAILABLE' }).lean();
  const cats = new Map((await Category.find().lean()).map((c: any) => [String(c._id), c.name]));
  const priceOf = (p: any, type: string) => (type === 'TAKEAWAY' ? p.takeawayPricePaise ?? p.pricePaise : type === 'PARCEL' ? p.parcelPricePaise ?? p.pricePaise : p.pricePaise);

  // one closed cash session for each of the last 6 days, so the Money page has history
  const sessions = new Map<number, { _id: any; openingPaise: number; cash: number }>();
  for (let d = 1; d <= 6; d++) sessions.set(d, { _id: oid(), openingPaise: 100000, cash: 0 });

  const HOURS = [11, 12, 12, 13, 13, 13, 14, 15, 17, 18, 19, 19, 20, 20, 20, 21];
  const NAMES = ['Priya', 'Karthik', 'Meena'];
  const CUSTOMERS = ['Arun', 'Divya', 'Suresh', 'Lakshmi', 'Ganesh', 'Kavitha', 'Ramesh', 'Anitha'];
  const orders: any[] = []; const payments: any[] = [];
  let n = 0;

  const makeOrder = (when: Date, opts: { status: string; payment: boolean; cancelled?: boolean; day: number }) => {
    const type = pick(['DINE_IN', 'DINE_IN', 'DINE_IN', 'TAKEAWAY', 'TAKEAWAY', 'PARCEL']);
    const chosen = [...pool].sort(() => Math.random() - 0.5).slice(0, rnd(1, 4));
    const items = chosen.map((p: any) => ({ productId: p._id, name: p.name, nameTa: p.nameTa, category: cats.get(String(p.categoryId)), unitPricePaise: priceOf(p, type), qty: pick([1, 1, 1, 2, 2, 3]) }));
    const total = items.reduce((a, i) => a + i.unitPricePaise * i.qty, 0);
    n++;
    const id = oid();
    const who = pick(NAMES);
    const named = Math.random() < 0.3;
    const digital = !opts.cancelled && opts.day <= 3 && named && Math.random() < 0.5;
    const sentAt = new Date(when.getTime() + 2 * 60_000);
    orders.push({
      _id: id, demo: true, idempotencyKey: `demo-ord-${n}`, billNo: `D${String(n).padStart(4, '0')}`, kotNo: n, type,
      tableLabel: type === 'DINE_IN' ? String(rnd(1, 10)) : undefined,
      status: opts.status, paymentStatus: opts.payment ? 'PAID' : 'UNPAID',
      items, taxMode: 'NONE', taxBp: 0, subtotalPaise: total, discountPaise: 0, taxPaise: 0, totalPaise: total, paidPaise: opts.payment ? total : 0,
      customerName: named ? pick(CUSTOMERS) : undefined, customerPhone: named ? `98400${rnd(10000, 99999)}` : undefined,
      paperCopy: 'PRINTED', receiptToken: crypto.randomBytes(9).toString('base64url'),
      ...(digital ? { digital: { channel: 'WHATSAPP', sentAt, sentBy: undefined, sentByName: who, phoneLast4: String(rnd(1000, 9999)) }, verifiedAt: new Date(sentAt.getTime() + rnd(1, 9) * 60_000), verifiedByName: pick(NAMES) } : {}),
      createdByName: who, confirmedAt: when, completedAt: opts.status === 'COMPLETED' ? new Date(when.getTime() + rnd(12, 35) * 60_000) : undefined,
      preparingAt: ['PREPARING', 'READY', 'COMPLETED'].includes(opts.status) ? new Date(when.getTime() + 2 * 60_000) : undefined,
      readyAt: ['READY', 'COMPLETED'].includes(opts.status) ? new Date(when.getTime() + 12 * 60_000) : undefined,
      ...(opts.cancelled ? { cancelledAt: new Date(when.getTime() + 4 * 60_000), cancelReason: 'Customer left (demo)' } : {}),
      events: [{ at: when, type: 'CONFIRMED', by: who }],
      createdAt: when, updatedAt: when,
    });
    if (opts.payment) {
      const method = Math.random() < 0.55 ? 'CASH' : 'UPI';
      const s = sessions.get(opts.day);
      if (method === 'CASH' && s) s.cash += total;
      payments.push({
        _id: oid(), demo: true, orderId: id, idempotencyKey: `demo-pay-${n}`, method, amountPaise: total, tenderedPaise: method === 'CASH' ? total : undefined,
        upiVerified: method === 'UPI', upiRef: method === 'UPI' ? `DEMO${rnd(100000, 999999)}` : undefined,
        ...(method === 'CASH' && s ? { cashSessionId: s._id } : {}), byName: who, createdAt: new Date(when.getTime() + 15 * 60_000), updatedAt: new Date(when.getTime() + 15 * 60_000),
      });
    }
  };

  if (pool.length) {
    for (let d = 13; d >= 0; d--) {
      const weekend = [0, 6].includes(daysAgo(d).getDay());
      const count = d === 0 ? 6 : rnd(7, 13) + (weekend ? 3 : 0);
      for (let i = 0; i < count; i++) {
        const when = daysAgo(d, pick(HOURS), rnd(0, 59));
        if (when.getTime() > Date.now() - 20 * 60_000) continue;
        const cancelled = Math.random() < 0.03;
        makeOrder(when, { status: cancelled ? 'CANCELLED' : 'COMPLETED', payment: !cancelled, cancelled, day: d });
      }
    }
    // two live orders so the Kitchen page has something to show
    makeOrder(new Date(Date.now() - 9 * 60_000), { status: 'PREPARING', payment: false, day: 0 });
    makeOrder(new Date(Date.now() - 3 * 60_000), { status: 'CONFIRMED', payment: false, day: 0 });
  }
  if (orders.length) await Order.insertMany(orders, { ordered: false });
  if (payments.length) await Payment.insertMany(payments, { ordered: false });

  for (const [d, s] of sessions) {
    const diff = Math.random() < 0.3 ? -rnd(1, 5) * 1000 : 0;
    const expected = s.openingPaise + s.cash;
    await CashSession.create({
      _id: s._id, demo: true, status: 'CLOSED', openedByName: 'Priya', openedAt: daysAgo(d, 9), openingPaise: s.openingPaise,
      closedByName: 'Priya', closedAt: daysAgo(d, 22, 30), expectedPaise: expected, countedPaise: expected + diff, differencePaise: diff, note: diff ? 'Small difference (demo)' : undefined,
    });
  }

  // ---------- expenses (last 30 days) ----------
  const EXP: [string, number, number, string][] = [
    ['Groceries', 800, 4500, 'Annapoorna Vegetables'], ['Gas', 1400, 1800, 'Kovai Gas Agency'], ['Meat & Fish', 3000, 9000, 'Kovai Meat Centre'], ['Salary', 8000, 15000, ''],
    ['Electricity', 3500, 6000, 'TNEB'], ['Repairs', 300, 2500, 'Local mechanic'], ['Packaging', 400, 1500, 'Sri Murugan Traders'],
  ];
  const expenses = Array.from({ length: 26 }, (_, i) => {
    const [category, lo, hi, vendor] = EXP[i % EXP.length];
    return { demo: true, category, amountPaise: rnd(lo, hi) * 100, date: daysAgo(rnd(0, 29)), method: pick(['CASH', 'CASH', 'UPI', 'BANK']), vendor: vendor || undefined, note: 'Demo entry', createdByName: 'Demo' };
  });
  await Expense.insertMany(expenses);

  // ---------- stock, suppliers, purchases ----------
  const suppliers = await Supplier.insertMany([
    { demo: true, name: 'Sri Murugan Traders', phone: '9840012345', note: 'Rice, oil, spices' },
    { demo: true, name: 'Annapoorna Vegetables', phone: '9840023456', note: 'Daily vegetables' },
    { demo: true, name: 'Kovai Meat Centre', phone: '9840034567', note: 'Chicken and mutton' },
  ]);
  const STOCK: [string, string, 'kg' | 'L' | 'pcs', number, number, number][] = [
    // name, Tamil, unit, reorder level, quantity now, bought recently
    ['Basmati rice', 'பாசுமதி அரிசி', 'kg', 20, 60, 40], ['Mutton', 'ஆட்டிறைச்சி', 'kg', 10, 6, 10], ['Paneer', 'பன்னீர்', 'kg', 5, 9, 5],
    ['Coriander', 'கொத்தமல்லி', 'kg', 3, 1.5, 0], ['Turmeric powder', 'மஞ்சள் தூள்', 'kg', 2, 4, 0], ['Red chilli powder', 'மிளகாய் தூள்', 'kg', 3, 2, 0], ['Gas cylinder', 'எரிவாயு', 'pcs', 2, 5, 3],
  ];
  const supplierOf = [0, 2, 1, 1, 0, 0, 0];
  const purchaseItems = new Map<number, any[]>();
  for (const [i, [name, nameTa, baseUnit, reorderLevel, qty, bought]] of STOCK.entries()) {
    if (await Ingredient.exists({ name })) continue; // name is unique
    const ing = await Ingredient.create({ demo: true, name, nameTa, baseUnit, lastUnit: baseUnit, reorderLevel, qty, sortOrder: 50 + i });
    await StockMovement.create({ demo: true, ingredientId: ing._id, type: 'OPENING', qty: qty - bought, unit: baseUnit, deltaBase: qty - bought, balanceAfter: qty - bought, reason: 'Opening stock (demo)', byName: 'Demo', createdAt: daysAgo(20) });
    if (bought > 0) {
      const cost = rnd(80, 600) * 100 * bought / 10;
      const list = purchaseItems.get(supplierOf[i]) ?? [];
      list.push({ ingredientId: ing._id, name, qty: bought, unit: baseUnit, costPaise: Math.round(cost) });
      purchaseItems.set(supplierOf[i], list);
    }
  }
  for (const [si, items] of purchaseItems) {
    const total = items.reduce((a, x) => a + x.costPaise, 0);
    const purchase = await Purchase.create({ demo: true, supplierId: suppliers[si]._id, invoiceRef: `DEMO-INV-${rnd(100, 999)}`, items, totalPaise: total, byName: 'Demo', createdAt: daysAgo(rnd(2, 8)) });
    for (const it of items) {
      const ing: any = await Ingredient.findById(it.ingredientId).lean();
      await StockMovement.create({ demo: true, ingredientId: it.ingredientId, type: 'PURCHASE', qty: it.qty, unit: it.unit, deltaBase: it.qty, balanceAfter: ing?.qty, costPaise: it.costPaise, supplierId: suppliers[si]._id, purchaseId: purchase._id, byName: 'Demo', createdAt: purchase.createdAt });
    }
  }

  // ---------- customers (feedback) ----------
  const NOTES = ['Biryani was excellent.', 'Service was quick.', 'A little salty today.', 'Loved the filter coffee.', 'Clean place, good value.', 'Waited a bit long for the table.', 'Parotta was very soft.', ''];
  const FULL = ['Arun Kumar', 'Divya R', 'Suresh Babu', 'Lakshmi N', 'Ganesh M', 'Kavitha S', 'Ramesh P', 'Anitha V', 'Vignesh K', 'Meena T', 'Prakash D', 'Sangeetha L'];
  await Feedback.insertMany(FULL.map((name, i) => {
    const consent = i % 3 !== 0;
    return { demo: true, tableLabel: String(rnd(1, 10)), rating: pick([3, 4, 4, 5, 5, 5]), notes: pick(NOTES) || undefined, name: consent ? name : undefined, phone: consent ? `98400${rnd(10000, 99999)}` : undefined, profession: consent ? pick(['Student', 'Engineer', 'Teacher', 'Business', 'Doctor']) : undefined, consentStoreContact: consent, consentMarketing: i % 2 === 0, createdAt: daysAgo(rnd(0, 20), rnd(11, 21), rnd(0, 59)) };
  }));

  return demoStatus();
}
