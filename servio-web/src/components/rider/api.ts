"use client";
// Rider app requests. The shared api() picks a token by route and knows nothing about the rider store, so the rider
// app sends its own Authorization header with auth "none". A 401 on the PIN session signs the rider out.
import { ApiError, api, type RequestOptions } from "@/lib/api";
import { useRiderStore } from "./store";

export async function riderApi<T = unknown>(path: string, opts: Omit<RequestOptions, "auth"> & { token?: "device" | "session" } = {}): Promise<T> {
  const s = useRiderStore.getState();
  const token = (opts.token ?? "session") === "device" ? s.deviceToken : s.session?.access_token;
  try {
    return await api<T>(path, { ...opts, auth: "none", headers: { ...(opts.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && (opts.token ?? "session") === "session") useRiderStore.getState().signOut();
    throw e;
  }
}
