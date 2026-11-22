import { Router } from 'express';
import { z } from 'zod';
import { Ingredient, Purchase, StockMovement, Supplier } from '../models/index.js';
import { asyncHandler, HttpError, parse } from '../middleware/error.js';
import { requirePerm } from '../middleware/auth.js';
import { audit, lowStockItems } from '../services/core.js';
import { toBase, UNITS, type Unit } from '../lib/units.js';

export const stockRouter = Router();
const unit = z.enum(UNITS);

stockRouter.get('/ingredients', requirePerm('stock.view'), asyncHandler(async (_req, res) => {
  const items = await Ingredient.find({ active: true }).sort({ sortOrder: 1, name: 1 });
  res.json({ ingredients: items.map((i) => ({ ...i.toObject(), low: i.reorderLevel > 0 && i.qty <= i.reorderLevel })) });
}));

stockRouter.post('/ingredients', requirePerm('stock.edit'), asyncHandler(async (req, res) => {
  const b = parse(z.object({ name: z.string().min(1).max(60), nameTa: z.string().max(80).optional(), baseUnit: unit, reorderLevel: z.number().min(0).default(0) }), req.body);
  const i = await Ingredient.create({ ...b, lastUnit: b.baseUnit });
  await audit(req, 'ingredient.create', 'Ingredient', i._id, { after: b });
  res.status(201).json({ ingredient: i });
}));

stockRouter.put('/ingredients/:id', requirePerm('stock.edit'), asyncHandler(async (req, res) => {
  const b = parse(z.object({ name: z.string().min(1).max(60).optional(), nameTa: z.string().max(80).optional(), reorderLevel: z.number().min(0).optional(), active: z.boolean().optional() }), req.body);
  const i = await Ingredient.findByIdAndUpdate(req.params.id, b, { new: true });
  if (!i) throw new HttpError(404, 'Item not found.');
  await audit(req, 'ingredient.update', 'Ingredient', i._id, { after: b });
  res.json({ ingredient: i });
}));

const move = z.object({
  ingredientId: z.string(), qty: z.number().positive().max(1_000_000), unit,
  reason: z.string().max(200).optional(), supplierId: z.string().optional(), costPaise: z.number().int().min(0).optional(),
});

/** Apply a stock change atomically and write a ledger line (who, when, qty, unit, reason). */
async function applyMovement(
  req: any,
  type: 'PURCHASE' | 'ADJUST' | 'COUNT' | 'WASTE',
  b: z.infer<typeof move>,
  sign: 1 | -1,
  extra: Record<string, unknown> = {},
) {
  const ing = await Ingredient.findById(b.ingredientId);
  if (!ing) throw new HttpError(404, 'Item not found.');
  const base = toBase(b.qty, b.unit as Unit, ing.baseUnit as Unit);
  const delta = sign * base;
  const updated = await Ingredient.findOneAndUpdate(
    sign < 0 ? { _id: ing._id, qty: { $gte: base } } : { _id: ing._id },
    { $inc: { qty: delta }, $set: { lastUnit: b.unit } },
    { new: true },
  );
  if (!updated) throw new HttpError(409, `Only ${ing.qty} ${ing.baseUnit} in stock. Use Stock Count to correct the number.`);
  updated.qty = Math.round(updated.qty * 1000) / 1000;
  await updated.save();
  const mv = await StockMovement.create({
    ingredientId: ing._id, type, qty: b.qty, unit: b.unit, deltaBase: delta, balanceAfter: updated.qty,
    reason: b.reason, by: req.user.id, byName: req.user.name, supplierId: b.supplierId, ...extra,
  });
  await audit(req, `stock.${type.toLowerCase()}`, 'Ingredient', ing._id, { before: ing.qty, after: updated.qty, note: b.reason });
  return { ingredient: updated, movement: mv };
}

stockRouter.post('/receive', requirePerm('stock.edit'), asyncHandler(async (req, res) => {
  const b = parse(move, req.body);
  res.status(201).json(await applyMovement(req, 'PURCHASE', b, 1, { costPaise: b.costPaise ?? null }));
}));

stockRouter.post('/adjust', requirePerm('stock.edit'), asyncHandler(async (req, res) => {
  const b = parse(move.extend({ direction: z.enum(['IN', 'OUT']), reason: z.string().min(2, 'Please give a reason').max(200) }), req.body);
  res.status(201).json(await applyMovement(req, 'ADJUST', b, b.direction === 'IN' ? 1 : -1));
}));

/** A physical count sets the quantity; the difference is recorded as a COUNT movement. */
stockRouter.post('/count', requirePerm('stock.edit'), asyncHandler(async (req, res) => {
  const b = parse(z.object({ ingredientId: z.string(), qty: z.number().min(0), unit, reason: z.string().max(200).optional() }), req.body);
  const ing = await Ingredient.findById(b.ingredientId);
  if (!ing) throw new HttpError(404, 'Item not found.');
  const counted = toBase(b.qty, b.unit as Unit, ing.baseUnit as Unit);
  const delta = Math.round((counted - ing.qty) * 1000) / 1000;
  const before = ing.qty;
  ing.qty = counted;
  ing.lastUnit = b.unit;
  await ing.save();
  const mv = await StockMovement.create({
    ingredientId: ing._id, type: 'COUNT', qty: b.qty, unit: b.unit, deltaBase: delta, balanceAfter: counted,
    reason: b.reason ?? 'Stock count', by: req.user!.id, byName: req.user!.name,
  });
  await audit(req, 'stock.count', 'Ingredient', ing._id, { before, after: counted });
  res.status(201).json({ ingredient: ing, movement: mv });
}));

const WASTE_REASONS = ['SPOILAGE', 'OVER_PREPARATION', 'UNSOLD_FOOD', 'PREPARATION_ERROR', 'CUSTOMER_RETURN', 'OTHER'] as const;

stockRouter.post('/waste', requirePerm('waste.record', 'stock.edit'), asyncHandler(async (req, res) => {
  const b = parse(move.extend({ wasteReason: z.enum(WASTE_REASONS) }), req.body);
  const ing = await Ingredient.findById(b.ingredientId);
  if (!ing) throw new HttpError(404, 'Item not found.');
  const base = toBase(b.qty, b.unit as Unit, ing.baseUnit as Unit);
  // waste is valued at recorded purchase cost only; unknown cost stays null (never the selling price)
  const costPaise = ing.costPerBasePaise != null ? Math.round(ing.costPerBasePaise * base) : null;
  res.status(201).json(await applyMovement(req, 'WASTE', b, -1, { wasteReason: b.wasteReason, costPaise }));
}));

stockRouter.get('/movements', requirePerm('stock.view'), asyncHandler(async (req, res) => {
  const q = z.object({ ingredientId: z.string().optional(), limit: z.coerce.number().max(300).default(100) }).parse(req.query);
  const filter: any = q.ingredientId ? { ingredientId: q.ingredientId } : {};
  const rows = await StockMovement.find(filter).sort({ createdAt: -1 }).limit(q.limit).populate('ingredientId', 'name baseUnit');
  res.json({ movements: rows });
}));

stockRouter.get('/low-stock', requirePerm('stock.view'), asyncHandler(async (_req, res) => {
  res.json({ items: await lowStockItems() });
}));

// ---- Suppliers & purchases ----
stockRouter.get('/suppliers', requirePerm('stock.view'), asyncHandler(async (_req, res) => {
  res.json({ suppliers: await Supplier.find({ active: true }).sort({ name: 1 }) });
}));

stockRouter.post('/suppliers', requirePerm('purchases.manage'), asyncHandler(async (req, res) => {
  const b = parse(z.object({ name: z.string().min(1).max(80), phone: z.string().max(20).optional(), note: z.string().max(200).optional() }), req.body);
  res.status(201).json({ supplier: await Supplier.create(b) });
}));

stockRouter.get('/purchases', requirePerm('purchases.manage'), asyncHandler(async (_req, res) => {
  res.json({ purchases: await Purchase.find().sort({ createdAt: -1 }).limit(100).populate('supplierId', 'name') });
}));

/** Receive a purchase: one stock-in movement per line, with cost recorded for later COGS and waste value. */
stockRouter.post('/purchases', requirePerm('purchases.manage'), asyncHandler(async (req, res) => {
  const b = parse(z.object({
    supplierId: z.string().optional(), invoiceRef: z.string().max(60).optional(),
    items: z.array(z.object({ ingredientId: z.string(), qty: z.number().positive(), unit, costPaise: z.number().int().min(0) })).min(1).max(40),
  }), req.body);
  const lines: any[] = [];
  let total = 0;
  const purchase = new Purchase({ supplierId: b.supplierId, invoiceRef: b.invoiceRef, by: req.user!.id, byName: req.user!.name });
  for (const l of b.items) {
    const ing = await Ingredient.findById(l.ingredientId);
    if (!ing) throw new HttpError(404, 'An item was not found.');
    const base = toBase(l.qty, l.unit as Unit, ing.baseUnit as Unit);
    const before = ing.qty;
    ing.qty = Math.round((ing.qty + base) * 1000) / 1000;
    ing.lastUnit = l.unit;
    // weighted-average cost per base unit, only from recorded purchase costs
    if (l.costPaise > 0 && base > 0) {
      const prevValue = ing.costPerBasePaise != null ? ing.costPerBasePaise * Math.max(before, 0) : 0;
      ing.costPerBasePaise = (prevValue + l.costPaise) / (Math.max(before, 0) + base);
    }
    await ing.save();
    await StockMovement.create({
      ingredientId: ing._id, type: 'PURCHASE', qty: l.qty, unit: l.unit, deltaBase: base, balanceAfter: ing.qty,
      costPaise: l.costPaise, supplierId: b.supplierId, purchaseId: purchase._id, reason: b.invoiceRef ? `Invoice ${b.invoiceRef}` : 'Purchase',
      by: req.user!.id, byName: req.user!.name,
    });
    lines.push({ ingredientId: ing._id, name: ing.name, qty: l.qty, unit: l.unit, costPaise: l.costPaise });
    total += l.costPaise;
  }
  purchase.set('items', lines);
  purchase.totalPaise = total;
  await purchase.save();
  await audit(req, 'purchase.receive', 'Purchase', purchase._id, { after: { total, count: lines.length } });
  res.status(201).json({ purchase });
}));
