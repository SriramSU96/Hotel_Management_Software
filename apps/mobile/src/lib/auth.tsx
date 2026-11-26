import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, getBaseUrl, onUnauthorized, setBaseUrl, setToken } from './api';
import { getItem, removeItem, setItem } from './storage';

export interface User { id: string; username: string; name: string; roleKey: string; permissions: string[]; language: 'en' | 'ta' }

interface AuthState {
  status: 'loading' | 'out' | 'in';
  user: User | null;
  serverUrl: string;
  login: (username: string, password: string, serverUrl?: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
}

const TOKEN_KEY = 'ammas.token';
const URL_KEY = 'ammas.server';
const Ctx = createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [serverUrl, setServerUrl] = useState(getBaseUrl());

  const signedOut = useCallback(() => {
    setToken(null);
    setUser(null);
    setStatus('out');
    removeItem(TOKEN_KEY);
  }, []);

  useEffect(() => {
    onUnauthorized(signedOut);
    (async () => {
      const [savedUrl, savedToken] = await Promise.all([getItem(URL_KEY), getItem(TOKEN_KEY)]);
      if (savedUrl) { setBaseUrl(savedUrl); setServerUrl(savedUrl); }
      if (!savedToken) { setStatus('out'); return; }
      setToken(savedToken);
      try {
        const r = await api<{ user: User | null }>('/auth/me');
        if (r.user) { setUser(r.user); setStatus('in'); } else signedOut();
      } catch (e) {
        // server not reachable right now: keep the saved sign-in and let them try again from the login screen
        if (e instanceof ApiError && e.status === 0) setStatus('out'); else signedOut();
      }
    })();
    return () => onUnauthorized(null);
  }, [signedOut]);

  const login = useCallback(async (username: string, password: string, url?: string) => {
    if (url !== undefined) {
      setBaseUrl(url);
      setServerUrl(getBaseUrl());
      await setItem(URL_KEY, getBaseUrl());
    }
    const r = await api<{ user: User; token?: string }>('/auth/login', { body: { username: username.trim(), password } });
    if (!r.token) throw new ApiError(500, 'The server did not return a sign-in token. Update the server to the latest version.');
    setToken(r.token);
    await setItem(TOKEN_KEY, r.token);
    setUser(r.user);
    setStatus('in');
  }, []);

  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST', body: {} }); } catch { /* signing out locally anyway */ }
    signedOut();
  }, [signedOut]);

  const value = useMemo<AuthState>(() => ({
    status, user, serverUrl, login, logout,
    can: (p) => !!user?.permissions.includes(p),
  }), [status, user, serverUrl, login, logout]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Name to show: Tamil when the user's language is Tamil and a Tamil name exists. */
export function useLocalName() {
  const { user } = useAuth();
  return (x: { name: string; nameTa?: string }) => (user?.language === 'ta' && x.nameTa ? x.nameTa : x.name);
}
