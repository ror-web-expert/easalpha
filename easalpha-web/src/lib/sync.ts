"use client";
// Offline queue: every till action is saved locally first, then pushed to POST /sync/push in order with backoff.
// Rejected records move to the Needs attention list; accepted or duplicate records are dropped from the queue.
import { api, ApiError } from "@/lib/api";
import { approvalAsk, mergeAsk, type ApprovalAsk } from "@/lib/approval-codes";
import { db, type AttentionItem, type QueueItem } from "@/lib/db";
import { useSyncStore } from "@/store/sync";
import { useCatalogStore } from "@/store/catalog";
import { useDeviceStore } from "@/store/device";
import { useCustomerStore } from "@/store/customers";
import { OPEN_STATUSES, type SyncChanges, type SyncPushResponse, type SyncRecordType } from "@/lib/types";

let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let stopped = true;

// ---- Reachability ----
// navigator.onLine only says the Wi-Fi is up. With the uplink down a push or heartbeat fails with a network error, and
// for the next 30 s the till treats itself as offline instead of waiting on 60 s timeouts before every payment.
export const UNREACHABLE_FOR_MS = 30_000;
let lastFailureAt = 0;
let lastSuccessAt = 0;

export type Reachability = "online" | "offline" | "unknown";

/** The decision behind isOnline(): the browser's flag first, then what the last push, heartbeat or probe said. */
export function reachability(input: { navigatorOnline: boolean; lastFailureAt: number; lastSuccessAt: number; now: number }): Reachability {
  if (!input.navigatorOnline) return "offline";
  const recentFailure = input.lastFailureAt > 0 && input.now - input.lastFailureAt < UNREACHABLE_FOR_MS;
  if (recentFailure && input.lastSuccessAt <= input.lastFailureAt) return "offline";
  if (input.lastSuccessAt > 0 && input.now - input.lastSuccessAt < UNREACHABLE_FOR_MS) return "online";
  return "unknown";
}

export function noteNetworkFailure() { lastFailureAt = Date.now(); }
export function noteReachable() { lastSuccessAt = Date.now(); }

function currentReachability(): Reachability {
  return reachability({ navigatorOnline: typeof navigator === "undefined" ? true : navigator.onLine, lastFailureAt, lastSuccessAt, now: Date.now() });
}

export function isOnline() {
  return currentReachability() !== "offline";
}

/** True when nothing in the last 30 s says whether the server answers (the moment before a payment to probe it). */
export function reachabilityUnknown() {
  return currentReachability() === "unknown";
}

/** GET /health with a short timeout. Any answer from the server counts as reachable; only a network error does not. */
export async function probeHealth(timeoutMs = 3000): Promise<boolean> {
  try {
    await api("/health", { auth: "none", timeoutMs });
  } catch (e) {
    if (e instanceof ApiError && e.isNetwork) { noteNetworkFailure(); return false; }
  }
  noteReachable();
  return true;
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

/** Rows in this browser that have not reached the server yet. */
export async function unsyncedCount(): Promise<number> {
  try { return await db.queue.count(); } catch { return 0; }
}

/**
 * True when this browser's till data may be replaced: nothing is waiting to reach the server, or the person agreed to
 * lose it. Pairing to another business with a queue still here would push the old business's sales under the new one.
 */
export async function confirmDiscardUnsynced(): Promise<boolean> {
  const n = await unsyncedCount();
  if (!n) return true;
  return confirm(`${n} record${n === 1 ? "" : "s"} on this device never reached the server. Pairing again discards ${n === 1 ? "it" : "them"}. Continue?`);
}

/**
 * A push that never came back (power cut, tab closed mid-send) leaves its rows marked "sending", and only "pending" rows
 * are ever picked up again. On a fresh start nothing can be in flight, so every such row goes back to pending; while
 * running, a row sending for over two minutes (the push times out at one) is treated the same way.
 */
export async function recoverStuck(all = false): Promise<number> {
  const stuck = (await db.queue.where("status").equals("sending").toArray()) as QueueItem[];
  const cutoff = Date.now() - 120_000;
  const back = stuck.filter((i) => all || !i.sending_at || i.sending_at < cutoff);
  if (back.length) await db.queue.bulkPut(back.map((i) => ({ ...i, status: "pending" as const, sending_at: undefined })));
  return back.length;
}

export function schedule(ms = 0) {
  if (stopped) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { processQueue(); }, ms);
}

// ---- Batch order ----
/** The order a record cannot be pushed before: an order_update shares its order's id; the others name it in the payload. */
export function parentOrderId(item: Pick<QueueItem, "type" | "id" | "payload">): string | null {
  if (item.type === "order_update") return item.id;
  if (item.type === "payment" || item.type === "void" || item.type === "refund") {
    const id = item.payload.order_id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

const byCreated = (a: QueueItem, b: QueueItem) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);

/**
 * Which pending rows go in this push, in the order the server must see them: an order before anything about it (the
 * server works through a batch in array order). A payment, void, refund or update whose order is queued but not in this
 * batch (in backoff, or in flight) is held for a later one; one whose order was rejected is blocked, for the Attention
 * page. Dependents only ride along once every leading row fits, so a cut-off batch never carries a child without its parent.
 */
export function planBatch(pending: QueueItem[], opts: { now: number; queuedOrderIds: Set<string>; rejectedOrderIds: Set<string>; limit?: number }): { send: QueueItem[]; held: QueueItem[]; blocked: QueueItem[] } {
  const due = pending.filter((i) => i.next_at <= opts.now).sort(byCreated);
  const dueOrders = new Set(due.filter((i) => i.type === "order").map((i) => i.id));
  const heads: QueueItem[] = [];
  const tail: QueueItem[] = [];
  const held: QueueItem[] = [];
  const blocked: QueueItem[] = [];
  for (const i of due) {
    const parent = parentOrderId(i);
    if (!parent) { heads.push(i); continue; }
    if (opts.rejectedOrderIds.has(parent)) { blocked.push(i); continue; }
    if (dueOrders.has(parent)) { tail.push(i); continue; }
    if (opts.queuedOrderIds.has(parent)) { held.push(i); continue; }
    heads.push(i); // the order is already on the server
  }
  const limit = opts.limit ?? 200;
  const send = heads.length >= limit ? heads.slice(0, limit) : [...heads, ...tail].slice(0, limit);
  return { send, held, blocked };
}

// Manager PINs for a "Try again" from the Attention page, with the permissions the dialog showed the manager, kept in
// memory for one push only: never in IndexedDB.
const approvals = new Map<string, { pin: string } & ApprovalAsk>();
/** Refusals a manager's PIN resolves; their rejection keeps the permissions it named for the next Try again. */
const APPROVAL_REFUSALS = ["approval.required", "permission.denied", "approval.invalid"];

/** approver_pin with the codes it approves (R6); a PIN with no known codes goes alone, the form the server still takes. */
function approvalFields(a: ({ pin: string } & ApprovalAsk) | undefined) {
  if (!a) return {};
  return a.codes.length ? { approver_pin: a.pin, approval_codes: a.codes } : { approver_pin: a.pin };
}

async function queueSnapshot() {
  const all = (await db.queue.toArray()) as QueueItem[];
  const attention = (await db.attention.toArray()) as AttentionItem[];
  return {
    all, attention,
    pending: all.filter((i) => i.status === "pending"),
    queuedOrderIds: new Set(all.filter((i) => i.type === "order").map((i) => i.id)),
    rejectedOrderIds: new Set(attention.filter((a) => a.type === "order").map((a) => a.id)),
  };
}

/** A dependent whose order the server rejected leaves the queue for the Attention page, listed under that order. */
async function blockDependent(item: QueueItem, parentId: string, parentMessage: string | undefined) {
  await db.queue.delete(item.id);
  await db.attention.put({
    id: item.id, type: item.type, code: "blocked", message: `Waits on an order the server rejected${parentMessage ? `: ${parentMessage}` : ""}`,
    payload: { ...item.payload, __membership_id: item.membership_id }, blocked_by: parentId, created_at: new Date().toISOString(),
  });
}

export async function processQueue(): Promise<void> {
  if (running) return;
  const store = useSyncStore.getState();
  if (!isOnline()) { store.set({ status: "offline" }); return; }
  running = true;
  try {
    await recoverStuck();
    const now = Date.now();
    const snap = await queueSnapshot();
    const plan = planBatch(snap.pending, { now, queuedOrderIds: snap.queuedOrderIds, rejectedOrderIds: snap.rejectedOrderIds });
    for (const b of plan.blocked) {
      const parent = parentOrderId(b)!;
      await blockDependent(b, parent, snap.attention.find((a) => a.id === parent)?.message);
    }
    if (plan.blocked.length) await refreshCounts();
    const items = plan.send;
    if (!items.length) { store.set({ status: "online" }); await wake(now); return; }
    store.set({ status: "syncing" });
    await db.queue.bulkPut(items.map((i) => ({ ...i, status: "sending" as const, sending_at: now })));
    // What each record's PIN approved, kept past the push so a rejection can list it again with anything new.
    const approved = new Map<string, ApprovalAsk>();
    for (const i of items) { const a = approvals.get(i.id); if (a) approved.set(i.id, { codes: a.codes, labels: a.labels }); }
    let res: SyncPushResponse;
    try {
      const records = items.map((i) => ({ type: i.type, id: i.id, membership_id: i.membership_id, payload: i.payload, ...approvalFields(approvals.get(i.id)) }));
      res = await api<SyncPushResponse>("/sync/push", { method: "POST", auth: "pos", timeoutMs: 60000, body: { records } });
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      if (err?.code === "session.required") {
        // The till is locked: nothing is wrong with the records. They go back as they were and push at the next sign-in.
        await db.queue.bulkPut(items.map((i) => ({ ...i, status: "pending" as const, sending_at: undefined })));
        store.set({ status: "online" });
        return;
      }
      if (err?.isNetwork) noteNetworkFailure();
      await db.queue.bulkPut(items.map((i) => ({ ...i, status: "pending" as const, sending_at: undefined, attempts: i.attempts + 1, next_at: Date.now() + backoff(i.attempts + 1), last_error: err?.message ?? "Sync failed" })));
      store.set({ status: err?.isNetwork ? "offline" : "online", lastError: err?.message ?? "Sync failed" });
      if (!err?.isNetwork) schedule(backoff(items[0].attempts + 1));
      return;
    } finally {
      // The PIN served this one attempt, accepted or not.
      for (const i of items) approvals.delete(i.id);
    }
    noteReachable();
    const results = res.results ?? [];
    const rejectedNow = new Map(results.filter((r) => r.status === "rejected" && r.type === "order").map((r) => [r.id, r.message]));
    for (const r of results) {
      if (r.status === "accepted" || r.status === "duplicate") {
        await db.queue.delete(r.id);
        await markSynced(r.type as SyncRecordType, r.id, items.find((i) => i.id === r.id));
      } else {
        const item = items.find((i) => i.id === r.id);
        const parent = item ? parentOrderId(item) : null;
        const blockedBy = parent && (rejectedNow.has(parent) || snap.rejectedOrderIds.has(parent)) ? parent : undefined;
        await db.queue.delete(r.id);
        // A refusal for approval keeps what the manager must approve: what the last PIN approved, then what the server named.
        const ask = APPROVAL_REFUSALS.includes(r.code ?? "") ? mergeAsk(approved.get(r.id) ?? { codes: [], labels: {} }, approvalAsk(r)) : null;
        // __membership_id keeps the cashier who made the record, so Try again is attributed to them, not to whoever is signed in then.
        await db.attention.put({ id: r.id, type: r.type, code: r.code ?? "rejected", message: r.message ?? "Rejected", payload: { ...(item?.payload ?? {}), __membership_id: item?.membership_id }, created_at: new Date().toISOString(), ...(blockedBy ? { blocked_by: blockedBy } : {}),
          ...(ask?.codes.length ? { permissions: ask.codes, permission_labels: ask.labels } : {}) });
        await markRejected(r.type as SyncRecordType, r.id, item, r.message ?? "Rejected");
      }
    }
    // Anything still queued for an order rejected in this batch can never follow it: it waits on the Attention page with it.
    if (rejectedNow.size) {
      for (const q of (await db.queue.toArray()) as QueueItem[]) {
        const parent = parentOrderId(q);
        if (parent && rejectedNow.has(parent)) await blockDependent(q, parent, rejectedNow.get(parent));
      }
    }
    store.set({ status: "online", lastSyncAt: res.server_time ?? new Date().toISOString(), lastError: null });
    await refreshCounts();
    await wake(Date.now());
  } finally {
    running = false;
  }
}

/** The next run: at once while more is sendable, else when the earliest backoff ends (a held payment follows its order then). */
async function wake(now: number) {
  const snap = await queueSnapshot();
  const again = planBatch(snap.pending, { now, queuedOrderIds: snap.queuedOrderIds, rejectedOrderIds: snap.rejectedOrderIds });
  if (again.send.length) { schedule(200); return; }
  const next = Math.min(...snap.pending.map((i) => i.next_at).filter((t) => t > now));
  if (Number.isFinite(next)) schedule(Math.max(500, next - now + 50));
}

const orderIdOf = (type: SyncRecordType, id: string, payload: Record<string, unknown> | undefined) =>
  type === "order" || type === "order_update" ? id : typeof payload?.order_id === "string" ? payload.order_id : null;

async function markSynced(type: SyncRecordType, id: string, item?: Pick<QueueItem, "payload">) {
  const orderId = orderIdOf(type, id, item?.payload);
  if (!orderId) return;
  const o = await db.orders.get(orderId);
  if (!o) return;
  if (type === "order") await db.orders.put({ ...o, local_only: false, sync_status: undefined, sync_error: undefined });
  else if (o.sync_status) await db.orders.put({ ...o, sync_status: undefined, sync_error: undefined });
}

/**
 * The server refused the record: the local order shows it. A rejected order keeps its paid status (the money was taken)
 * but is flagged, so the Orders screen says "Rejected" and leaves it out of the paid totals; an open one closes as
 * rejected. A rejected payment, void, update or refund flags its order the same way.
 */
async function markRejected(type: SyncRecordType, id: string, item: Pick<QueueItem, "payload"> | undefined, reason: string) {
  const orderId = orderIdOf(type, id, item?.payload);
  if (!orderId) return;
  const o = await db.orders.get(orderId);
  if (!o) return;
  if (type === "order") await db.orders.put({ ...o, local_only: false, sync_status: "rejected", sync_error: reason, status: OPEN_STATUSES.includes(o.status as never) ? "rejected" : o.status, open: 0 });
  // The order's own refusal is the reason that matters; a payment refused because of it does not replace it.
  else await db.orders.put({ ...o, sync_status: "rejected", sync_error: o.sync_status === "rejected" && o.sync_error ? o.sync_error : `${type.replace("_", " ")} ${reason}` });
}

/** Back in the queue after Try again: the order is pending once more, open again if the rejection had closed it. */
async function unmarkRejected(type: SyncRecordType, id: string, payload: Record<string, unknown>) {
  const orderId = orderIdOf(type, id, payload);
  if (!orderId) return;
  const o = await db.orders.get(orderId);
  if (!o) return;
  const status = type === "order" && o.status === "rejected" ? (typeof payload.status === "string" ? payload.status : "placed") : o.status;
  await db.orders.put({ ...o, status, open: OPEN_STATUSES.includes(status as never) ? 1 : 0, sync_status: undefined, sync_error: undefined, ...(type === "order" ? { local_only: true } : {}) });
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

/** The device kinds that push a queue and keep the till's catalogue and customers: the API's Sync TILL_KINDS. */
export const TILL_SYNC_KINDS = ["till", "tablet", "kiosk"];

/** True for a till, a tablet or a canteen kiosk; a device stored without a kind is taken for the till it was paired as. */
export function keepsTillData(kind: string | null | undefined): boolean {
  return !kind || TILL_SYNC_KINDS.includes(kind);
}

/**
 * pull: false for a screen that pushes its queue but keeps no till catalogue (the canteen kiosk has its own sync call).
 * A kitchen display, rider phone or token screen signed in on the till's PIN screen starts nothing: it has no queue,
 * and the API refuses it the change pull and the customer list (403 device.required; review R4).
 */
export function startSync(opts: { pull?: boolean } = {}) {
  if (!keepsTillData(useDeviceStore.getState().device?.kind)) return () => {};
  stopped = false;
  const pull = opts.pull !== false;
  const onOnline = () => { lastFailureAt = 0; useSyncStore.getState().set({ status: "online" }); if (pull) pullChanges(); schedule(0); if (pull) void useCustomerStore.getState().downloadIfStale(); };
  const onOffline = () => useSyncStore.getState().set({ status: "offline" });
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  useSyncStore.getState().set({ status: isOnline() ? "online" : "offline" });
  refreshCounts();
  // Nothing is in flight on a fresh start: rows left "sending" by a crash go back to pending before the first push.
  recoverStuck(true).catch(() => {}).then(() => schedule(1000));
  // A push refused while the till was locked (session.required) goes again as soon as someone signs in.
  const unsubscribe = useDeviceStore.subscribe((s, prev) => { if (s.session && !prev.session) schedule(0); });
  const interval = setInterval(() => {
    if (!useDeviceStore.getState().deviceToken) return;
    schedule(0);
  }, 15000);
  // Menu, settings and customers changed on the server or other tills (a balance paid at the counter, a new student)
  // reach this till every few minutes, so what it shows and searches offline is never far behind.
  const pullTimer = setInterval(() => {
    if (!pull || !isOnline() || !useDeviceStore.getState().deviceToken) return;
    pullChanges();
    void useCustomerStore.getState().downloadIfStale();
  }, 5 * 60_000);
  const heartbeat = setInterval(() => {
    if (isOnline() && useDeviceStore.getState().deviceToken) {
      api("/devices/heartbeat", { method: "POST", auth: "pos", body: { app_version: "web" } })
        .then(() => noteReachable())
        .catch((e) => { if (e instanceof ApiError && e.isNetwork) noteNetworkFailure(); else noteReachable(); });
    }
  }, 60000);
  return () => {
    stopped = true;
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    unsubscribe();
    clearInterval(interval);
    clearInterval(pullTimer);
    clearInterval(heartbeat);
    if (timer) clearTimeout(timer);
  };
}

async function requeue(a: AttentionItem) {
  await db.attention.delete(a.id);
  const { __membership_id, ...payload } = a.payload;
  await unmarkRejected(a.type as SyncRecordType, a.id, payload);
  await enqueue({ type: a.type as SyncRecordType, id: a.id, membership_id: __membership_id as string | undefined, payload });
}

/**
 * Try again from the Attention page. `approverPin` is a manager's PIN for a record refused as approval.required or
 * permission.denied: it travels with that one push and is forgotten afterwards, with `codes`, what the PIN dialog
 * showed the manager (the record's permissions when not given), as approval_codes: the server grants only those.
 * Records held back by this one (a payment waiting on its rejected order) go back to the queue with it, so they
 * follow it in the same push.
 */
export async function retryAttention(id: string, approverPin?: string, codes?: string[]) {
  const a = await db.attention.get(id);
  if (!a) return;
  if (approverPin) approvals.set(id, { pin: approverPin, codes: codes ?? a.permissions ?? [], labels: a.permission_labels ?? {} });
  await requeue(a);
  for (const child of ((await db.attention.toArray()) as AttentionItem[]).filter((x) => x.blocked_by === id)) await requeue(child);
  await refreshCounts();
}

/** Drops the record from the list (and anything held back by it). The local order row stays, marked rejected. */
export async function dismissAttention(id: string) {
  await db.attention.delete(id);
  for (const child of ((await db.attention.toArray()) as AttentionItem[]).filter((x) => x.blocked_by === id)) await db.attention.delete(child.id);
  await refreshCounts();
}

/** A record whose dismissal loses money the server never recorded: a payment, refund, void, or an order paid offline. */
export function isMoneyRecord(a: Pick<AttentionItem, "type" | "payload">): boolean {
  if (a.type === "payment" || a.type === "refund" || a.type === "void" || a.type === "customer_payment") return true;
  return a.type === "order" && Array.isArray(a.payload.payments) && a.payload.payments.length > 0;
}
