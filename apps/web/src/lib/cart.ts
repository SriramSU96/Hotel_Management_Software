import { create } from 'zustand';
import { uid } from './api';
import { priceFor, type OrderType, type Product } from './queries';

export interface CartLine { productId: string; name: string; nameTa?: string; pricePaise: number; qty: number; note?: string; prices: Pick<Product, 'pricePaise' | 'takeawayPricePaise' | 'parcelPricePaise'> }

interface CartState {
  type: OrderType; tableId: string | null; lines: CartLine[]; customerName: string; customerPhone: string; discountPaise: number;
  /** One key per order attempt: a double tap or network retry returns the same order. */
  key: string;
  placedOrderId: string | null;
  setType: (t: OrderType) => void; setTable: (id: string | null) => void;
  add: (p: Product) => void; setQty: (id: string, qty: number) => void; setNote: (id: string, note: string) => void;
  setCustomer: (n: string, p: string) => void; setDiscount: (p: number) => void;
  setPlaced: (id: string | null) => void; reset: () => void;
}

const fresh = () => ({ type: 'DINE_IN' as OrderType, tableId: null, lines: [], customerName: '', customerPhone: '', discountPaise: 0, key: uid(), placedOrderId: null });

export const useCart = create<CartState>((set) => ({
  ...fresh(),
  // switching order type re-prices every line; the server re-prices again on confirm
  setType: (type) => set((s) => ({ type, tableId: type === 'DINE_IN' ? s.tableId : null, lines: s.lines.map((l) => ({ ...l, pricePaise: priceFor(l.prices, type) })) })),
  setTable: (tableId) => set({ tableId }),
  add: (p) => set((s) => {
    const i = s.lines.findIndex((l) => l.productId === p._id && !l.note);
    if (i >= 0) return { lines: s.lines.map((l, j) => (j === i ? { ...l, qty: Math.min(99, l.qty + 1) } : l)) };
    return { lines: [...s.lines, { productId: p._id, name: p.name, nameTa: p.nameTa, pricePaise: priceFor(p, s.type), qty: 1, prices: { pricePaise: p.pricePaise, takeawayPricePaise: p.takeawayPricePaise, parcelPricePaise: p.parcelPricePaise } }] };
  }),
  setQty: (id, qty) => set((s) => ({ lines: qty <= 0 ? s.lines.filter((l) => l.productId !== id) : s.lines.map((l) => (l.productId === id ? { ...l, qty: Math.min(99, qty) } : l)) })),
  setNote: (id, note) => set((s) => ({ lines: s.lines.map((l) => (l.productId === id ? { ...l, note: note || undefined } : l)) })),
  setCustomer: (customerName, customerPhone) => set({ customerName, customerPhone }),
  setDiscount: (discountPaise) => set({ discountPaise }),
  setPlaced: (placedOrderId) => set({ placedOrderId }),
  reset: () => set(fresh()),
}));
