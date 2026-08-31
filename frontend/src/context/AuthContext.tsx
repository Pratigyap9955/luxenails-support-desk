import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, onUnauthorized, tokenStore } from "../lib/api";
import type { RuntimeConfig, User } from "../lib/types";

interface AuthContextValue {
  user: User | null;
  runtime: RuntimeConfig | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [runtime, setRuntime] = useState<RuntimeConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  // A 401 from anywhere in the app drops the session.
  useEffect(() => {
    onUnauthorized.handler = () => setUser(null);
    return () => {
      onUnauthorized.handler = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // The health endpoint is public — it tells the login screen about Demo Mode.
      try {
        const config = await api.get<RuntimeConfig>("/health");
        if (!cancelled) setRuntime(config);
      } catch {
        // Backend down; the UI surfaces this on the login screen.
      }

      if (tokenStore.get()) {
        try {
          const { user: me } = await api.get<{ user: User }>("/auth/me");
          if (!cancelled) setUser(me);
        } catch {
          tokenStore.clear();
        }
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: signedIn } = await api.post<{ token: string; user: User }>("/auth/login", {
      email,
      password,
    });
    tokenStore.set(token);
    setUser(signedIn);
  }, []);

  const value = useMemo(
    () => ({ user, runtime, loading, login, logout }),
    [user, runtime, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
