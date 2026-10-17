"use client";
// Offline queue: every till action is saved locally first, then pushed to POST /sync/push in order with backoff.
// Rejected records move to the Needs attention list; accepted or duplicate records are dropped from the queue.
import { api, ApiError } from "@/lib/api";
import { db, type QueueItem } from "@/lib/db";
import { useSyncStore } from "@/store/sync";
import { useCatalogStore } from "@/store/catalog";
import { useDeviceStore } from "@/store/device";
import { useCustomerStore } from "@/store/customers";
import type { SyncChanges, SyncPushResponse, SyncRecordType } from "@/lib/types";

let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let stopped = true;

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export async function refreshCounts() {
  try {
    const [pending, attention] = await Promise.all([db.queue.count(), db.attention.count()]);
    useSyncStore.getState().set({ pending, attention });
  } catch {}
}

export async function enqueue(rec: { type: SyncRecordType; id: string; membership_id?: string; payload: Record<string, unknown> }) {
  const item: QueueItem = { id: rec.id, type: rec.type, membership_id: rec.membership_id, payload: rec.payload, created_at: new Date().toISOString(), attempts: 0, next_at: 0, last_error: null, status: "pending" };
  await db.queue.put(item);
  await refreshCounts();
  schedule(500);
}

/**
 * Merge new payload fields into a queued record (e.g. add payments to an order that has not been pushed yet). Returns
 * false when not queued, or when `type` is given and the queued record is another type (an order_update shares its
 * order's id, and the server ignores payments or a void inside it).
 */
export async function patchQueued(id: string, patch: (p: Record<string, unknown>) => Record<string, unknown>, type?: SyncRecordType): Promise<boolean> {
  const item = await db.queue.get(id);
  if (!item || item.status === "sending" || (type && item.type !== type)) return false;
  await db.queue.put({ ...item, payload: patch(item.payload) });
  schedule(500);
  return true;
}

export async function isQueued(id: string) {
  return !!(await db.queue.get(id));
}

function backoff(attempts: number) {
  return Math.min(5 * 60_000, 2000 * 2 ** Math.min(attempts, 7));
}

export function schedule(ms = 0) {
  if (stopped) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { processQueue(); }, ms);
}

export async function processQueue(): Promise<void> {
  if (running) return;
  const store = useSyncStore.getState();
  if (!isOnline()) { store.set({ status: "offline" }); return; }
  running = true;
  try {
    const now = Date.now();
    const items = (await db.queue.where("status").equals("pending").sortBy("created_at")).filter((i) => i.next_at <= now).slice(0, 200);
    if (!items.length) { store.set({ status: "online" }); return; }
    store.set({ status: "syncing" });
    await db.queue.bulkPut(items.map((i) => ({ ...i, status: "sending" as const })));
    let res: SyncPushResponse;
    try {
      res = await api<SyncPushResponse>("/sync/push", { method: "POST", auth: "pos", timeoutMs: 60000, body: { records: items.map((i) => ({ type: i.type, id: i.id, membership_id: i.membership_id, payload: i.payload })) } });
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      await db.queue.bulkPut(items.map((i) => ({ ...i, status: "pending" as const, attempts: i.attempts + 1, next_at: Date.now() + backoff(i.attempts + 1), last_error: err?.message ?? "Sync failed" })));
      store.set({ status: err?.isNetwork ? "offline" : "online", lastError: err?.message ?? "Sync failed" });
      if (!err?.isNetwork) schedule(backoff(items[0].attempts + 1));
      return;
    }
    for (const r of res.results ?? []) {
      if (r.status === "accepted" || r.status === "duplicate") {
        await db.queue.delete(r.id);
        await markSynced(r.type as SyncRecordType, r.id);
      } else {
        const item = items.find((i) => i.id === r.id);
        await db.queue.delete(r.id);
        await db.attention.put({ id: r.id, type: r.type, code: r.code ?? "rejected", message: r.message ?? "Rejected", payload: item?.payload ?? {}, created_at: new Date().toISOString() });
        await markRejected(r.type as SyncRecordType, r.id);
      }
    }
    store.set({ status: "online", lastSyncAt: res.server_time ?? new Date().toISOString(), lastError: null });
    await refreshCounts();
    const remaining = await db.queue.where("status").equals("pending").count();
    if (remaining) schedule(200);
  } finally {
    running = false;
  }
}

async function markSynced(type: SyncRecordType, id: string) {
  if (type === "order") {
    const o = await db.orders.get(id);
    if (o) await db.orders.put({ ...o, local_only: false });
  }
}

async function markRejected(type: SyncRecordType, id: string) {
  if (type === "order") {
    const o = await db.orders.get(id);
    if (o) await db.orders.put({ ...o, local_only: false, status: o.status === "paid" ? o.status : "rejected", open: 0 });
  }
}

/** GET /sync/changes since the stored cursor, merged into the local catalog. */
export async function pullChanges() {
  const cs = useCatalogStore.getState();
  try {
    if (!cs.catalog) { await cs.refresh(); return; }
    const changes = await api<SyncChanges>("/sync/changes", { auth: "pos", query: { since: cs.cursor ?? undefined } });
    await cs.applyChanges(changes);
  } catch {}
}

export function startSync() {
  stopped = false;
  const onOnline = () => { useSyncStore.getState().set({ status: "online" }); pullChanges(); schedule(0); void useCustomerStore.getState().downloadIfStale(); };
  const onOffline = () => useSyncStore.getState().set({ status: "offline" });
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  useSyncStore.getState().set({ status: isOnline() ? "online" : "offline" });
  refreshCounts();
  schedule(1000);
  const interval = setInterval(() => {
    if (!useDeviceStore.getState().deviceToken) return;
    schedule(0);
  }, 15000);
  // Menu, settings and customers changed on the server or other tills (a balance paid at the counter, a new student)
  // reach this till every few minutes, so what it shows and searches offline is never far behind.
  const pull = setInterval(() => {
    if (!isOnline() || !useDeviceStore.getState().deviceToken) return;
    pullChanges();
    void useCustomerStore.getState().downloadIfStale();
  }, 5 * 60_000);
  const heartbeat = setInterval(() => {
    if (isOnline() && useDeviceStore.getState().deviceToken) api("/devices/heartbeat", { method: "POST", auth: "pos", body: { app_version: "web" } }).catch(() => {});
  }, 60000);
  return () => {
    stopped = true;
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    clearInterval(interval);
    clearInterval(pull);
    clearInterval(heartbeat);
    if (timer) clearTimeout(timer);
  };
}

export async function retryAttention(id: string) {
  const a = await db.attention.get(id);
  if (!a) return;
  await db.attention.delete(id);
  await enqueue({ type: a.type as SyncRecordType, id: a.id, membership_id: a.payload.__membership_id as string | undefined, payload: a.payload });
  await refreshCounts();
}

export async function dismissAttention(id: string) {
  await db.attention.delete(id);
  await refreshCounts();
}
