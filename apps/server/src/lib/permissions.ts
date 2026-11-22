export const PERMISSIONS = [
  'orders.create', 'orders.complete', 'orders.cancel', 'orders.refund', 'orders.discount',
  'payments.record', 'bills.reprint', 'bills.verify', 'kot.reprint', 'printers.view', 'printers.manage',
  'kitchen.view', 'kitchen.update',
  'menu.edit', 'price.edit', 'tables.manage',
  'stock.view', 'stock.edit', 'waste.record', 'purchases.manage',
  'expenses.manage', 'cash.manage',
  'reports.view', 'reports.send', 'customers.view',
  'users.manage', 'settings.manage', 'audit.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const DEFAULT_ROLES: { key: string; name: string; nameTa: string; permissions: Permission[]; system: boolean }[] = [
  { key: 'owner', name: 'Owner', nameTa: 'உரிமையாளர்', permissions: [...PERMISSIONS], system: true },
  {
    key: 'cashier', name: 'Cashier', nameTa: 'காசாளர்', system: false,
    permissions: ['orders.create', 'orders.complete', 'payments.record', 'bills.reprint', 'bills.verify', 'printers.view', 'kitchen.view'],
  },
  // optional login for the person who carries food; can check customers' digital bills and nothing else
  { key: 'supplier', name: 'Supplier', nameTa: 'பரிமாறுபவர்', system: false, permissions: ['bills.verify'] },
  { key: 'kitchen', name: 'Kitchen', nameTa: 'சமையலறை', system: false, permissions: ['kitchen.view', 'kitchen.update', 'kot.reprint'] },
  { key: 'stock', name: 'Stock', nameTa: 'சரக்கு', system: false, permissions: ['stock.view', 'stock.edit', 'waste.record'] },
];

export function effectivePermissions(rolePerms: string[], grants: string[] = [], denies: string[] = []): string[] {
  const set = new Set([...rolePerms, ...grants]);
  for (const d of denies) set.delete(d);
  return [...set];
}
