"use client";
// Live till feed: pending QR orders and open table requests, polled every 10 s and nudged by the Action Cable orders channel.
// One poller and one socket are shared no matter how many screens mount the shell.
import { useEffect } from "react";
import { create } from "zustand";
import { ApiError } from "@/lib/api";
import { subscribe, type CableSubscription } from "@/lib/cable";
import { listOpenRequests, listPendingQrOrders } from "@/lib/till-extras";
import type { QrOrder, TableRequest } from "@/lib/types";
import { useDeviceStore } from "@/store/device";
import { toast } from "@/store/toast";

interface LiveState {
  pending: QrOrder[];
  requests: TableRequest[];
  /** false when this login may not see QR orders (403): the tab hides its badge and stops polling. */
  available: boolean;
  live: boolean;
  loading: boolean;
  lastAt: string | null;
  set: (p: Partial<LiveState>) => void;
}

export const useLiveStore = create<LiveState>((set) => ({ pending: [], requests: [], available: true, live: false, loading: false, lastAt: null, set: (p) => set(p) }));

let refs = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let sub: CableSubscription | null = null;
let inflight: Promise<void> | null = null;

export function refreshLive(): Promise<void> {
  if (inflight) return inflight;
  const store = useLiveStore.getState();
  if (!store.available || !useDeviceStore.getState().session?.access_token) return Promise.resolve();
  store.set({ loading: true });
  inflight = Promise.all([listPendingQrOrders(), listOpenRequests()])
    .then(([pending, requests]) => useLiveStore.getState().set({ pending, requests, lastAt: new Date().toISOString() }))
    .catch((e) => { if (e instanceof ApiError && (e.status === 403 || e.status === 404)) useLiveStore.getState().set({ available: false, pending: [], requests: [] }); })
    .finally(() => { useLiveStore.getState().set({ loading: false }); inflight = null; });
  return inflight;
}

function start(token: string) {
  refreshLive();
  timer = setInterval(refreshLive, 10_000);
  sub = subscribe("OrdersChannel", token, (m) => {
    const type = m.type as string | undefined;
    if (type === "order") refreshLive();
    if (type === "table_request") {
      const r = (m.request ?? {}) as { table_code?: string; kind?: string; guest_name?: string | null };
      toast.info(r.kind === "ask_bill" ? `Bill requested at table ${r.table_code ?? ""}` : `Waiter called at table ${r.table_code ?? ""}`, r.guest_name || undefined);
      refreshLive();
    }
  }, (s) => useLiveStore.getState().set({ live: s === "open" }));
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  sub?.close();
  sub = null;
  useLiveStore.getState().set({ live: false });
}

/** Mount once per screen (the shell does it). Starts the shared poller and socket while a PIN session exists. */
export function useTillLive() {
  const token = useDeviceStore((s) => s.session?.access_token ?? null);
  useEffect(() => {
    if (!token) return;
    refs += 1;
    if (refs === 1) start(token);
    return () => { refs -= 1; if (refs === 0) stop(); };
  }, [token]);
  return useLiveStore();
}
