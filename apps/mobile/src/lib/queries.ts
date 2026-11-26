import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface Product { _id: string; categoryId: string; name: string; nameTa?: string; pricePaise: number; takeawayPricePaise?: number | null; parcelPricePaise?: number | null; starred?: boolean; status: 'AVAILABLE' | 'UNAVAILABLE' | 'SOLD_OUT'; imageUrl?: string; active: boolean; sortOrder: number }
export interface Category { _id: string; name: string; nameTa?: string; sortOrder: number; active: boolean }
export interface TableRow { _id: string; label: string; capacity?: number; activeOrderId?: string | null }
export interface Settings {
  restaurantName: string; taxMode: 'NONE' | 'EXCLUSIVE' | 'INCLUSIVE'; taxBp: number; discountsEnabled: boolean; parcelEnabled: boolean; useTables?: boolean;
}

export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'PARCEL';
/** Price for an order type. An empty special price means the dine-in price. */
export const priceFor = (p: Pick<Product, 'pricePaise' | 'takeawayPricePaise' | 'parcelPricePaise'>, type: OrderType) => {
  const v = type === 'TAKEAWAY' ? p.takeawayPricePaise : type === 'PARCEL' ? p.parcelPricePaise : null;
  return typeof v === 'number' ? v : p.pricePaise;
};

export const useProducts = () => useQuery({ queryKey: ['products'], queryFn: () => api<{ products: Product[] }>('/products').then((r) => r.products) });
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => api<{ categories: Category[] }>('/categories').then((r) => r.categories) });
export const useTables = () => useQuery({ queryKey: ['tables'], queryFn: () => api<{ tables: TableRow[] }>('/tables').then((r) => r.tables) });
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api<{ settings: Settings }>('/settings'), staleTime: 60_000 });
