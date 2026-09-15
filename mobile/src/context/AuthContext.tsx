import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getToken, saveToken, clearToken } from "../lib/auth";
import { apiFetch, ApiError } from "../lib/api";

export interface StudentUser {
  id: string;
  name: string;
  email: string;
  role: "STUDENT";
  student: { id: string; enrollmentNo: string; department: string; presence: string } | null;
}

interface AuthContextValue {
  user: StudentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StudentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCurrentUser = useCallback(async () => {
    try {
      const res = await apiFetch<{ success: true; user: StudentUser }>("/api/auth/me");
      setUser(res.user);
    } catch {
      // Invalid/expired token — apiFetch already cleared it on a 401.
      setUser(null);
    }
  }, []);

  // On app launch, a stored token means "try to restore the session" —
  // never trust the mere presence of a token as proof of a valid session;
  // /api/auth/me re-validates it against the server every time.
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        await loadCurrentUser();
      }
      setLoading(false);
    })();
  }, [loadCurrentUser]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<{ success: true; token: string; user: StudentUser }>("/api/auth/mobile-login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await saveToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await clearToken();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
