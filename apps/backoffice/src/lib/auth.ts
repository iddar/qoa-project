"use client";

import { api } from "./api";

const ACCESS_TOKEN_KEY = "qoa_access_token";
const REFRESH_TOKEN_KEY = "qoa_refresh_token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export async function login(email: string, password: string) {
  const { data, error } = await api.v1.auth.login.post({
    email,
    password,
  });

  if (error) throw error;

  setTokens(data.data.accessToken, data.data.refreshToken);
  return data.data;
}

export async function refreshSession(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const { data, error } = await api.v1.auth.refresh.post({
      refreshToken,
    });

    if (error) return false;

    setTokens(data.data.accessToken, data.data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function logout() {
  const refreshToken = getRefreshToken();
  const accessToken = getAccessToken();

  if (refreshToken && accessToken) {
    try {
      await api.v1.auth.logout.post(
        { refreshToken },
        { headers: { authorization: `Bearer ${accessToken}` } },
      );
    } catch {
      // ignore - clear tokens anyway
    }
  }

  clearTokens();
}

/** Ensure we have a valid access token, refreshing if needed. */
export async function ensureAuth(): Promise<string | null> {
  const token = getAccessToken();
  if (token && !isTokenExpired(token)) return token;

  const refreshed = await refreshSession();
  if (refreshed) return getAccessToken();

  clearTokens();
  return null;
}
