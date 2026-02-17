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

type AuthState = {
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    ensureAuth().then((t) => {
      setToken(t);
      setIsLoading(false);
    });
  }, []);

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
    setToken(result.accessToken);
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        isLoading,
        isAuthenticated: token !== null,
        login,
        logout,
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
