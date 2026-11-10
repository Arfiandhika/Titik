import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const { user } = await api('/auth/me');
      setUser(user);
      return user;
    } catch (err) {
      if (err.status === 401) {
        setToken(null);
        setUser(null);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUnread = useCallback(async () => {
    if (!getToken()) return setUnread(0);
    try {
      const { unread } = await api('/notifications/unread');
      setUnread(unread);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // FR11: keep the bell count fresh.
  useEffect(() => {
    if (!user) return undefined;
    refreshUnread();
    const t = setInterval(refreshUnread, 30000);
    return () => clearInterval(t);
  }, [user, refreshUnread]);

  const signIn = useCallback((token, user) => {
    setToken(token);
    setUser(user);
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
    setUnread(0);
  }, []);

  const value = useMemo(
    () => ({ user, loading, unread, setUser, refresh, refreshUnread, signIn, signOut, setUnread }),
    [user, loading, unread, refresh, refreshUnread, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
