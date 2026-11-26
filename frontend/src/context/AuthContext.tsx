import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, clearTokens, getTokens, saveTokens } from '../api/client';
import type { RegisterInput, UserProfile } from '../types';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<UserProfile>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    const profile = await api.profile();
    setUser(profile);
  };

  useEffect(() => {
    let active = true;
    if (!getTokens()?.access) {
      setLoading(false);
      return () => { active = false; };
    }
    api.profile()
      .then((profile) => { if (active) setUser(profile); })
      .catch(() => { clearTokens(); if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const login = async (username: string, password: string) => {
    const result = await api.login(username, password);
    saveTokens({ access: result.access, refresh: result.refresh });
    setUser(result.user);
    return result.user;
  };

  const register = async (input: RegisterInput) => {
    await api.register(input);
  };

  const logout = () => {
    clearTokens();
    setUser(null);
  };

  const value = useMemo(() => ({ user, loading, login, register, logout, refreshProfile }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
