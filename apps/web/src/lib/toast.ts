import { create } from 'zustand';

export interface ToastItem { id: number; kind: 'ok' | 'error' | 'info'; text: string }
let n = 0;
export const useToasts = create<{ items: ToastItem[]; push: (kind: ToastItem['kind'], text: string) => void; dismiss: (id: number) => void }>((set) => ({
  items: [],
  push: (kind, text) => {
    const id = ++n;
    set((s) => ({ items: [...s.items.slice(-3), { id, kind, text }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), kind === 'error' ? 7000 : 3500);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));
export const toast = {
  ok: (t: string) => useToasts.getState().push('ok', t),
  error: (t: string) => useToasts.getState().push('error', t),
  info: (t: string) => useToasts.getState().push('info', t),
};
export const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
