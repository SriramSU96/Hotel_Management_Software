import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface Product { _id: string; categoryId: string; name: string; nameTa?: string; pricePaise: number; takeawayPricePaise?: number | null; parcelPricePaise?: number | null; starred?: boolean; status: 'AVAILABLE' | 'UNAVAILABLE' | 'SOLD_OUT'; imageUrl?: string; description?: string; prepNote?: string; active: boolean; sortOrder: number }
export interface Category { _id: string; name: string; nameTa?: string; sortOrder: number; active: boolean }
export interface TableRow { _id: string; label: string; capacity?: number; activeOrderId?: string | null; publicToken: string }
export interface Settings {
  restaurantName: string; address: string; phone: string; gstin: string; billFooter: string; receiptWidth: number; timezone: string;
  taxMode: 'NONE' | 'EXCLUSIVE' | 'INCLUSIVE'; taxBp: number; discountsEnabled: boolean; parcelEnabled: boolean; kotPrinterEnabled: boolean; printerConnection: string;
  useTables?: boolean; billMessage?: string;
  browserPrint?: { paperMm: number; copies: number; fontPx: number; autoPrintBill: boolean; autoPrintKot: boolean; showTamil: boolean };
  emailCfg?: { host: string; port: number; user: string; from: string; passSet: boolean };
  whatsappCfg?: { phoneNumberId: string; templateName: string; templateLang: string; billMessage: string; tokenSet: boolean };
  reportContent?: Record<'payments' | 'peakHour' | 'topItems' | 'expenses' | 'lowStock' | 'waste' | 'cancelled' | 'verified', boolean>;
  feedbackRetentionDays?: number; owner?: { email: string; emailVerified: boolean; whatsapp: string; whatsappVerified: boolean }; schedule?: any;
}

export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'PARCEL';
/** Price for an order type. An empty special price means the dine-in price. */
export const priceFor = (p: Pick<Product, 'pricePaise' | 'takeawayPricePaise' | 'parcelPricePaise'>, type: OrderType) => {
  const v = type === 'TAKEAWAY' ? p.takeawayPricePaise : type === 'PARCEL' ? p.parcelPricePaise : null;
  return typeof v === 'number' ? v : p.pricePaise;
};

export const useProducts = (all = false) => useQuery({ queryKey: ['products', all], queryFn: () => api<{ products: Product[] }>(`/products${all ? '?all=1' : ''}`).then((r) => r.products) });
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => api<{ categories: Category[] }>('/categories').then((r) => r.categories) });
export const useTables = () => useQuery({ queryKey: ['tables'], queryFn: () => api<{ tables: TableRow[] }>('/tables').then((r) => r.tables) });
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api<{ settings: Settings; providers?: { email: boolean; whatsapp: boolean } }>('/settings'), staleTime: 60_000 });
