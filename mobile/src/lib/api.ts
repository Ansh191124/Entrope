import { getToken, clearToken } from "./auth";

// Inlined at build time by Expo (EXPO_PUBLIC_ prefix) — see .env.example for
// why this can't just be "localhost" when testing on a physical device.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Every authenticated request carries the JWT as `Authorization: Bearer` —
 * the mobile equivalent of the web app's httpOnly session cookie (see
 * POST /api/auth/mobile-login and src/server/middleware/auth.ts on the
 * backend). A 401 here means the token is missing/expired/invalid, so we
 * proactively clear it — the caller's next render will fall back to the
 * login screen via AuthContext.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : null;

  if (!res.ok) {
    if (res.status === 401) {
      await clearToken();
    }
    throw new ApiError(res.status, body?.error ?? "UNKNOWN", body?.message ?? "Request failed. Please try again.");
  }
  return body as T;
}

export { API_BASE_URL };
