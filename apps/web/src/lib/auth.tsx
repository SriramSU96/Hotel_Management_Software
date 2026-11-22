import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface Me { id: string; name: string; username: string; roleKey: string; permissions: string[]; language: 'en' | 'ta' }
interface Ctx { me: Me | null; loading: boolean; can: (p: string) => boolean; refresh: () => void }
const AuthCtx = createContext<Ctx>({ me: null, loading: true, can: () => false, refresh: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me'], queryFn: () => api<{ user: Me | null }>('/auth/me'), staleTime: 60_000, retry: false });
  const me = q.data?.user ?? null;
  return (
    <AuthCtx.Provider value={{ me, loading: q.isLoading, can: (p) => !!me?.permissions.includes(p), refresh: () => qc.invalidateQueries({ queryKey: ['me'] }) }}>
      {children}
    </AuthCtx.Provider>
  );
}
export const useAuth = () => useContext(AuthCtx);
