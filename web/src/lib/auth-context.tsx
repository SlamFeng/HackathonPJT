"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { getMe, logout as apiLogout, type Me } from "@/lib/auth";

type AuthState = {
  me: Me | null;
  // 首次拉取登录态是否仍在进行，用于受保护路由的加载占位
  loading: boolean;
  // 重新拉取当前用户（登录/注册成功后调用，刷新全局登录态）
  refresh: () => Promise<Me | null>;
  // 退出登录并清空本地登录态
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await getMe();
    setMe(next);
    setLoading(false);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    await apiLogout();
    setMe(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((next) => {
        if (cancelled) return;
        setMe(next);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ me, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
