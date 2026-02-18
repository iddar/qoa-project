"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  login as authLogin,
  logout as authLogout,
  ensureAuth,
  clearTokens,
  getAccessToken,
  isTokenExpired,
} from "@/lib/auth";
import { api } from "@/lib/api";

type AuthState = {
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  tenantId: string | null;
  tenantType: "cpg" | "store" | null;
  role: string | null;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantType, setTenantType] = useState<"cpg" | "store" | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const ensureCpgSession = useCallback(async (accessToken: string) => {
    const { data, error } = await api.v1.users.me.get({
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (error || !data?.data) {
      throw new Error("profile_fetch_failed");
    }

    const me = data.data;
    const isCpgOwner =
      me.role === "cpg_admin" &&
      me.tenantType === "cpg" &&
      typeof me.tenantId === "string" &&
      me.tenantId.length > 0;

    if (!isCpgOwner) {
      throw new Error("not_cpg_owner");
    }

    setTenantId(me.tenantId ?? null);
    setTenantType((me.tenantType as "cpg" | "store" | undefined) ?? null);
    setRole(me.role ?? null);
  }, []);

  useEffect(() => {
    ensureAuth()
      .then(async (t) => {
        if (!t) {
          setToken(null);
          return;
        }

        await ensureCpgSession(t);
        setToken(t);
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
  }, [ensureCpgSession]);

  useEffect(() => {
    const checkToken = () => {
      const currentToken = getAccessToken();
      if (currentToken && isTokenExpired(currentToken)) {
        clearTokens();
        setToken(null);
      }
    };

    const interval = setInterval(checkToken, 60_000);
    return () => clearInterval(interval);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authLogin(email, password);
    await ensureCpgSession(result.accessToken);
    setToken(result.accessToken);
  }, [ensureCpgSession]);

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
