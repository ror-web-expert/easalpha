"use client";
// Rider app requests. The shared api() picks a token by route and knows nothing about the rider store, so the rider
// app sends its own Authorization header with auth "none". Access tokens live 15 minutes; on a 401 the rider's refresh
// token (30 days, rotated on every use) buys a new session and the request runs again, so a rider stays signed in for
// the whole shift instead of meeting the PIN screen in the middle of a delivery. Only a refused refresh signs out; no
// signal during the refresh is reported as a network error so queued work waits instead of being lost.
import { API_URL, ApiError, api, type RequestOptions } from "@/lib/api";
import type { Session } from "@/lib/types";
import { useRiderStore } from "./store";

export type RefreshResult = "ok" | "invalid" | "network";

let refreshing: Promise<RefreshResult> | null = null;

/** Trades the stored refresh token for a new rider session. Concurrent 401s share one call. */
export function refreshRiderSession(): Promise<RefreshResult> {
  if (refreshing) return refreshing;
  const refreshToken = useRiderStore.getState().session?.refresh_token;
  if (!refreshToken) return Promise.resolve("invalid");
  refreshing = (async (): Promise<RefreshResult> => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ refresh_token: refreshToken }) });
      if (res.status >= 500) return "network";
      if (!res.ok) return "invalid";
      const session = (await res.json()) as Session;
      if (session.app !== "rider") return "invalid";
      useRiderStore.getState().setSession(session);
      return "ok";
    } catch {
      return "network";
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function riderApi<T = unknown>(path: string, opts: Omit<RequestOptions, "auth"> & { token?: "device" | "session" } = {}): Promise<T> {
  const kind = opts.token ?? "session";
  const call = () => {
    const s = useRiderStore.getState();
    const token = kind === "device" ? s.deviceToken : s.session?.access_token;
    return api<T>(path, { ...opts, auth: "none", headers: { ...(opts.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  };
  try {
    return await call();
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401 || kind !== "session") throw e;
    const result = await refreshRiderSession();
    if (result === "ok") return call();
    if (result === "network") throw new ApiError("network", "Cannot reach the server", 0);
    useRiderStore.getState().signOut();
    throw e;
  }
}
