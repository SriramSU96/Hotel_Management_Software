import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

let socket: Socket | null = null;

/** One shared socket. Events are only "something changed" pings; data is re-fetched through the secured REST API. */
export function useLive(enabled: boolean) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(true);
  useEffect(() => {
    if (!enabled) return;
    socket ??= io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    const s = socket;
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    const refetch = (keys: string[]) => () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    const handlers: [string, () => void][] = [
      ['orders:changed', refetch(['orders', 'order', 'tables', 'kitchen'])],
      ['kitchen:changed', refetch(['kitchen', 'orders', 'order'])],
      ['print:changed', refetch(['print-jobs', 'print-status', 'order'])],
      ['print:status', refetch(['print-status'])],
      ['menu:changed', refetch(['products'])],
      ['connect', () => { on(); qc.invalidateQueries(); }],
      ['disconnect', off],
    ];
    handlers.forEach(([e, h]) => s.on(e, h));
    setConnected(s.connected);
    return () => { handlers.forEach(([e, h]) => s.off(e, h)); };
  }, [enabled, qc]);
  return connected;
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const a = () => setOnline(true), b = () => setOnline(false);
    window.addEventListener('online', a); window.addEventListener('offline', b);
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b); };
  }, []);
  return online;
}
