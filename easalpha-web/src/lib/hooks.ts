"use client";
import { useCallback, useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api, type RequestOptions } from "@/lib/api";
import type { Page } from "@/lib/types";

/** Cursor-paginated list ({data, next_cursor}) with load more. */
export function usePagedList<T>(key: unknown[], path: string, query: Record<string, string | number | boolean | null | undefined> = {}, opts: { enabled?: boolean; auth?: RequestOptions["auth"] } = {}) {
  const q = useInfiniteQuery({
    queryKey: [...key, query],
    queryFn: ({ pageParam }) => api<Page<T>>(path, { query: { ...query, cursor: pageParam || undefined }, auth: opts.auth }),
    initialPageParam: "",
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: opts.enabled,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  return { ...q, rows, nextCursor: q.hasNextPage ? "more" : null };
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

export function useLocalState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [state, setState] = useState<T>(initial);
  useEffect(() => {
    try { const raw = localStorage.getItem(key); if (raw) setState(JSON.parse(raw)); } catch {}
  }, [key]);
  const set = useCallback((v: T) => { setState(v); try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key]);
  return [state, set];
}

export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>, deps: unknown[] = []) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const fn = map[e.key];
      if (fn) { fn(e); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
