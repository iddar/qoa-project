"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  clearTokens,
  ensureAuth,
  getAccessToken,
  isTokenExpired,
  login as authLogin,
  logout as authLogout,
  signup as authSignup,
} from "@/lib/auth";

type AuthState = {
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, phone: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  role: string | null;
};

const AuthContext = createContext<AuthState | null>(null);
const walletRoles = ["consumer", "customer"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  const ensureWalletSession = useCallback(async (accessToken: string) => {
    const { data, error } = await api.v1.users.me.get({
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (error || !data?.data) {
      throw new Error("profile_fetch_failed");
    }

    if (!walletRoles.includes(data.data.role ?? "")) {
      throw new Error("not_wallet_user");
    }

    const wallet = await api.v1.users.me.wallet.get({
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (wallet.error || !wallet.data?.data?.card?.id) {
      throw new Error("wallet_provision_failed");
    }

    setRole(data.data.role ?? null);
  }, []);

  useEffect(() => {
    ensureAuth()
      .then(async (resolvedToken) => {
        if (!resolvedToken) {
          setToken(null);
          return;
        }
        await ensureWalletSession(resolvedToken);
        setToken(resolvedToken);
      })
      .catch(() => {
        clearTokens();
        setToken(null);
        setRole(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [ensureWalletSession]);

  useEffect(() => {
    const interval = setInterval(() => {
      const currentToken = getAccessToken();
      if (currentToken && isTokenExpired(currentToken)) {
        clearTokens();
        setToken(null);
        setRole(null);
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authLogin(email, password);
      await ensureWalletSession(result.accessToken);
      setToken(result.accessToken);
    },
    [ensureWalletSession],
  );

  const signup = useCallback(
    async (email: string, phone: string, password: string, name?: string) => {
      const result = await authSignup(email, phone, password, name);
      await ensureWalletSession(result.accessToken);
      setToken(result.accessToken);
    },
    [ensureWalletSession],
  );

  const logout = useCallback(async () => {
    await authLogout();
    setToken(null);
    setRole(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        isLoading,
        isAuthenticated: token !== null,
        login,
        signup,
        logout,
        role,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
