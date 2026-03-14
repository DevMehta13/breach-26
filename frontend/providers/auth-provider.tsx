"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { api, setToken, clearToken, getToken } from "@/lib/api";
import type { User, TokenResponse } from "@/lib/types";

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (code: string) => Promise<void>;
  linkGoogle: (code: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = getToken();
    if (!stored) {
      setIsLoading(false);
      return;
    }
    setTokenState(stored);
    api<User>("/api/auth/me")
      .then((u) => setUser(u))
      .catch(() => {
        clearToken();
        setTokenState(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<TokenResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.access_token);
    setTokenState(data.access_token);
    // Backend may not include user in login response — fetch from /me
    if (data.user) {
      setUser(data.user);
    } else {
      const u = await api<User>("/api/auth/me");
      setUser(u);
    }
  }, []);

  const loginWithGoogle = useCallback(async (code: string) => {
    const data = await api<TokenResponse>("/api/auth/google/callback", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    setToken(data.access_token);
    setTokenState(data.access_token);
    const u = await api<User>("/api/auth/me");
    setUser(u);
  }, []);

  const linkGoogle = useCallback(async (code: string) => {
    // Sends the code WITH the existing JWT — backend links the Google account
    await api("/api/auth/google/callback", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    // Refresh user to pick up google_connected: true
    const u = await api<User>("/api/auth/me");
    setUser(u);
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await api<User>("/api/auth/me");
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, loginWithGoogle, linkGoogle, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
