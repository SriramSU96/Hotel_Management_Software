import crypto from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { Category, Ingredient, Product, Role, Settings, StockMovement, Table, User } from './models/index.js';
import { DEFAULT_ROLES } from './lib/permissions.js';

const U = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=700&q=82`;

/** Sample menu, categories, prices and photos taken from the AMMAS reference design. The owner replaces them in Menu. */
// everyday items shown in the POS Quick Order row; the owner changes stars in Menu > Price list
const STARRED = new Set(['Chicken Rice', 'Chicken Biryani', 'Veg Meals', 'Parotta', 'Tea']);

const MENU: { cat: string; catTa: string; items: { name: string; ta: string; price: number; img?: string }[] }[] = [
  { cat: 'Rice', catTa: 'சாதம்', items: [
    { name: 'Chicken Rice', ta: 'சிக்கன் ரைஸ்', price: 12000, img: U('photo-1604908176997-125f25cc6f3d') },
    { name: 'Egg Rice', ta: 'முட்டை ரைஸ்', price: 10000, img: U('photo-1512058564366-18510be2db19') } ] },
  { cat: 'Biryani', catTa: 'பிரியாணி', items: [
    { name: 'Chicken Biryani', ta: 'சிக்கன் பிரியாணி', price: 22000, img: U('photo-1563379091339-03246963d96c') },
    { name: 'Mutton Biryani', ta: 'மட்டன் பிரியாணி', price: 32000, img: U('photo-1589302168068-964664d93dc0') } ] },
  { cat: 'Meals', catTa: 'சாப்பாடு', items: [
    { name: 'Veg Meals', ta: 'வெஜ் மீல்ஸ்', price: 9000, img: U('photo-1546833999-b9f581a1996d') } ] },
  { cat: 'Snacks', catTa: 'சிற்றுண்டி', items: [
    { name: 'Parotta', ta: 'பரோட்டா', price: 1500, img: U('photo-1601050690597-df0568f70950') },
    { name: 'Chicken 65', ta: 'சிக்கன் 65', price: 16000, img: U('photo-1603894584373-5ac82b2ae398') } ] },
  { cat: 'Drinks', catTa: 'பானங்கள்', items: [
    { name: 'Tea', ta: 'டீ', price: 2000, img: U('photo-1544787219-7f47ccb76574') },
    // the reference file's Lime Juice photo link is incomplete, so this one starts with the placeholder
    { name: 'Lime Juice', ta: 'எலுமிச்சை ஜூஸ்', price: 3500 } ] },
];

/** name, Tamil, base unit, reorder level, opening quantity (from the reference stock table) */
const STOCK: [string, string, 'pcs' | 'kg' | 'L', number, number][] = [
  ['Rice', 'அரிசி', 'kg', 40, 120], ['Chicken', 'கோழி', 'kg', 35, 28], ['Egg', 'முட்டை', 'pcs', 50, 90], ['Onion', 'வெங்காயம்', 'kg', 25, 75],
  ['Cooking oil', 'எண்ணெய்', 'L', 20, 18], ['Tomato', 'தக்காளி', 'kg', 15, 8], ['Milk', 'பால்', 'L', 10, 24],
];

export async function ensureRoles() {
  for (const r of DEFAULT_ROLES) {
    await Role.updateOne({ key: r.key }, { $setOnInsert: r }, { upsert: true });
  }
  // existing databases: give the cashier the new bill-check permissions ONCE (a later removal by the owner is respected)
  await Role.updateOne(
    { key: 'cashier', migrations: { $ne: 'verify-bill' } },
    { $addToSet: { permissions: { $each: ['bills.verify'] }, migrations: 'verify-bill' } },
  );
  // the owner role always has every permission, even after upgrades add new ones
  const owner = DEFAULT_ROLES.find((r) => r.key === 'owner')!;
  await Role.updateOne({ key: 'owner' }, { $set: { permissions: owner.permissions } });
}

export async function seed(opts: { ownerPassword?: string; sampleData?: boolean } = {}) {
  await ensureRoles();
  await Settings.updateOne({ key: 'main' }, { $setOnInsert: { key: 'main' } }, { upsert: true });

  let generated: string | null = null;
  if (!(await User.exists({ roleKey: 'owner' }))) {
    const pw = opts.ownerPassword || (generated = crypto.randomBytes(9).toString('base64url'));
    await User.create({ username: 'owner', name: 'Owner', roleKey: 'owner', passwordHash: await hash(pw) });
  }

  if (opts.sampleData !== false) {
    if (!(await Category.exists({}))) {
      let sort = 0;
      for (const [ci, c] of MENU.entries()) {
        const cat = await Category.create({ name: c.cat, nameTa: c.catTa, sortOrder: ci });
        for (const it of c.items) {
          await Product.create({ categoryId: cat._id, name: it.name, nameTa: it.ta, pricePaise: it.price, imageUrl: it.img, starred: STARRED.has(it.name), sortOrder: sort++ });
        }
      }
    }
    if (!(await Table.exists({}))) {
      for (let i = 1; i <= 10; i++) {
        await Table.create({ label: String(i), capacity: 4, sortOrder: i, publicToken: crypto.randomBytes(9).toString('base64url') });
      }
    }
    if (!(await Ingredient.exists({}))) {
      for (const [i, [name, nameTa, baseUnit, reorderLevel, qty]] of STOCK.entries()) {
        const ing = await Ingredient.create({ name, nameTa, baseUnit, lastUnit: baseUnit, reorderLevel, sortOrder: i, qty });
        // opening balance goes through the ledger like every other stock change
        await StockMovement.create({ ingredientId: ing._id, type: 'OPENING', qty, unit: baseUnit, deltaBase: qty, balanceAfter: qty, reason: 'Opening stock (sample)', byName: 'system' });
      }
    }
  }
  return { generatedOwnerPassword: generated };
}
