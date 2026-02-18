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
} from "@/lib/auth";

type AuthState = {
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  tenantId: string | null;
  tenantType: "store" | "cpg" | null;
  role: string | null;
};

const AuthContext = createContext<AuthState | null>(null);

const allowedRoles = ["store_staff", "store_admin", "qoa_support", "qoa_admin"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantType, setTenantType] = useState<"store" | "cpg" | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const ensureStoreSession = useCallback(async (accessToken: string) => {
    const { data, error } = await api.v1.users.me.get({
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (error || !data?.data) {
      throw new Error("profile_fetch_failed");
    }

    const me = data.data;
    if (!allowedRoles.includes(me.role ?? "")) {
      throw new Error("not_store_operator");
    }

    if (
      (me.role === "store_admin" || me.role === "store_staff") &&
      (me.tenantType !== "store" || !me.tenantId)
    ) {
      throw new Error("store_tenant_required");
    }

    setTenantId(me.tenantId ?? null);
    setTenantType((me.tenantType as "store" | "cpg" | undefined) ?? null);
    setRole(me.role ?? null);
  }, []);

  useEffect(() => {
    ensureAuth()
      .then(async (resolvedToken) => {
        if (!resolvedToken) {
          setToken(null);
          return;
        }

        await ensureStoreSession(resolvedToken);
        setToken(resolvedToken);
      })
      .catch(() => {
        clearTokens();
        setToken(null);
        setTenantId(null);
        setTenantType(null);
        setRole(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [ensureStoreSession]);

  useEffect(() => {
    const interval = setInterval(() => {
      const currentToken = getAccessToken();
      if (currentToken && isTokenExpired(currentToken)) {
        clearTokens();
        setToken(null);
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authLogin(email, password);
      await ensureStoreSession(result.accessToken);
      setToken(result.accessToken);
    },
    [ensureStoreSession],
  );

  const logout = useCallback(async () => {
    await authLogout();
    setToken(null);
    setTenantId(null);
    setTenantType(null);
    setRole(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        isLoading,
        isAuthenticated: token !== null,
        login,
        logout,
        tenantId,
        tenantType,
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
