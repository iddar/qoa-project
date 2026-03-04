"use client";

import { createAuthClient } from "@qoa/auth-client";
import { api } from "./api";

const auth = createAuthClient("qoa", api);

export const getAccessToken = auth.getAccessToken;
export const getRefreshToken = auth.getRefreshToken;
export const setTokens = auth.setTokens;
export const clearTokens = auth.clearTokens;
export const isTokenExpired = auth.isTokenExpired;
export const login = auth.login;
export const refreshSession = auth.refreshSession;
export const logout = auth.logout;
export const ensureAuth = auth.ensureAuth;
