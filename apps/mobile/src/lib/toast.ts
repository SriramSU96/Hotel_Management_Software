import { create } from 'zustand';

interface ToastItem { id: number; text: string; kind: 'ok' | 'error' | 'info' }
interface ToastState { items: ToastItem[]; push: (text: string, kind: ToastItem['kind']) => void; drop: (id: number) => void }

let counter = 0;
export const useToasts = create<ToastState>((set, get) => ({
  items: [],
  push: (text, kind) => {
    const id = ++counter;
    set((s) => ({ items: [...s.items.slice(-2), { id, text, kind }] }));
    setTimeout(() => get().drop(id), 3200);
  },
  drop: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));

export const toast = {
  ok: (t: string) => useToasts.getState().push(t, 'ok'),
  error: (t: string) => useToasts.getState().push(t, 'error'),
  info: (t: string) => useToasts.getState().push(t, 'info'),
};

export const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
