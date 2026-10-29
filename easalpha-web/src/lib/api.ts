"use client";
import { useAuthStore } from "@/store/auth";
import { useDeviceStore } from "@/store/device";
import type { Session } from "@/lib/types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1").replace(/\/$/, "");
// Accepts http(s) or ws(s); the socket always opens on ws(s) so the value can be written either way.
export const CABLE_URL = (process.env.NEXT_PUBLIC_CABLE_URL || API_URL.replace(/\/api\/v1$/, "") + "/cable").replace(/^http/, "ws");

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
  get isNetwork() { return this.status === 0; }
}

export type AuthArea = "admin" | "pos" | "device" | "none";

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Which token to send. "auto" picks by the current route. */
  auth?: AuthArea | "auto";
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function areaFromPath(): AuthArea {
  if (typeof window === "undefined") return "none";
  const p = window.location.pathname;
  if (p.startsWith("/pos")) return "pos";
  if (p.startsWith("/kitchen") || p.startsWith("/token") || p.startsWith("/queue") || p.startsWith("/canteen")) {
    const d = useDeviceStore.getState();
    if (d.session?.access_token || d.deviceToken) return "pos";
    return "admin";
  }
  return "admin";
}

interface Principal { token: string | null; refresh: string | null; branchId: string | null; kind: AuthArea }

function principalFor(area: AuthArea): Principal {
  if (area === "admin") {
    const s = useAuthStore.getState();
    return { token: s.session?.access_token ?? null, refresh: s.session?.refresh_token ?? null, branchId: s.branchId, kind: "admin" };
  }
  if (area === "pos") {
    const d = useDeviceStore.getState();
    if (d.session?.access_token) return { token: d.session.access_token, refresh: d.session.refresh_token, branchId: null, kind: "pos" };
    return { token: d.deviceToken, refresh: null, branchId: null, kind: "device" };
  }
  if (area === "device") return { token: useDeviceStore.getState().deviceToken, refresh: null, branchId: null, kind: "device" };
  return { token: null, refresh: null, branchId: null, kind: "none" };
}

let refreshing: Promise<boolean> | null = null;

async function refreshSession(kind: AuthArea, refreshToken: string): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: refreshToken }) });
      if (!res.ok) return false;
      const data = (await res.json()) as Session;
      if (kind === "admin") useAuthStore.getState().setSession(data);
      else useDeviceStore.getState().setSession(data);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

function buildQuery(q?: RequestOptions["query"]) {
  if (!q) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === "") continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const area: AuthArea = !opts.auth || opts.auth === "auto" ? areaFromPath() : opts.auth;
  const attempt = async (retry: boolean): Promise<T> => {
    const p = principalFor(area);
    const headers: Record<string, string> = { Accept: "application/json", ...(opts.headers ?? {}) };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (p.token) headers.Authorization = `Bearer ${p.token}`;
    if (p.branchId && p.kind === "admin") headers["X-Branch-Id"] = p.branchId;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20000);
    opts.signal?.addEventListener("abort", () => controller.abort());
    let res: Response;
    try {
      res = await fetch(`${API_URL}${path}${buildQuery(opts.query)}`, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      throw new ApiError("network", e instanceof Error && e.name === "AbortError" ? "Request timed out" : "Cannot reach the server", 0);
    }
    clearTimeout(timer);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (res.ok) return data as T;
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    if (res.status === 401 && retry && p.refresh && (p.kind === "admin" || p.kind === "pos")) {
      const ok = await refreshSession(p.kind, p.refresh);
      if (ok) return attempt(false);
      if (p.kind === "admin") useAuthStore.getState().clear();
      else useDeviceStore.getState().lock();
    }
    throw new ApiError(err?.code ?? `http_${res.status}`, err?.message ?? res.statusText ?? "Request failed", res.status, err?.details);
  };
  return attempt(true);
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

export function errorCode(e: unknown): string {
  return e instanceof ApiError ? e.code : "unknown";
}

export const needsApproval = (e: unknown) => e instanceof ApiError && (e.code === "approval.required" || e.code === "permission.denied" || e.code === "approval.invalid");
