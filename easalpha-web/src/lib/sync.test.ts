import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttentionItem, LocalOrder, QueueItem } from "@/lib/db";

// The till's IndexedDB in memory: one row per id per table, as Dexie keeps them.
const h = vi.hoisted(() => {
  const table = (m: Map<string, unknown>) => ({
    get: async (id: string) => m.get(id),
    put: async (row: { id: string }) => void m.set(row.id, row),
    bulkPut: async (rows: { id: string }[]) => rows.forEach((r) => m.set(r.id, r)),
    delete: async (id: string) => void m.delete(id),
    count: async () => m.size,
    toArray: async () => [...m.values()],
    where: (field: string) => ({ equals: (v: unknown) => ({ toArray: async () => [...m.values()].filter((i) => (i as Record<string, unknown>)[field] === v) }) }),
  });
  const queue = new Map<string, unknown>();
  const attention = new Map<string, unknown>();
  const orders = new Map<string, unknown>();
  return { queue, attention, orders, api: vi.fn(), db: { queue: table(queue), attention: table(attention), orders: table(orders) } };
});
vi.mock("@/lib/db", () => ({ db: h.db, kvGet: async () => undefined, kvSet: async () => undefined }));
vi.mock("@/lib/api", async () => ({ ...(await vi.importActual<typeof import("@/lib/api")>("@/lib/api")), api: (...a: unknown[]) => h.api(...a) }));

import { ApiError } from "@/lib/api";
import { useSyncStore } from "@/store/sync";
import { dismissAttention, isMoneyRecord, patchQueued, planBatch, processQueue, reachability, recoverStuck, retryAttention, UNREACHABLE_FOR_MS } from "./sync";

const item = (over: Partial<QueueItem>): QueueItem => ({ id: "o-1", type: "order", payload: {}, created_at: "2026-10-13T10:00:00Z", attempts: 0, next_at: 0, last_error: null, status: "pending", ...over });
const payment = (id: string, order_id: string, over: Partial<QueueItem> = {}): QueueItem => item({ id, type: "payment", payload: { order_id, amount_minor: 50000, method_code: "cash" }, created_at: "2026-10-13T10:01:00Z", ...over });
const addPayment = (p: Record<string, unknown>) => ({ ...p, payments: [{ id: "pay-1", amount_minor: 1000 }] });
const localOrder = (id: string, status: string): LocalOrder => ({ id, status, open: ["draft", "held", "placed"].includes(status) ? 1 : 0, local_only: true, paid_minor: status === "paid" ? 50000 : 0, total_minor: 50000, payments: [], lines: [] } as unknown as LocalOrder);
const queued = () => [...h.queue.values()] as QueueItem[];
const attention = () => [...h.attention.values()] as AttentionItem[];
const sentRecords = (call = 0) => (h.api.mock.calls[call][1] as { body: { records: Record<string, unknown>[] } }).body.records;
const accepted = (...ids: string[]) => ({ batch_id: "b", server_time: "2026-10-13T10:02:00Z", results: ids.map((id) => ({ id, type: "order", status: "accepted" })) });

describe("patchQueued", () => {
  // patchQueued schedules a queue run; fake timers keep it from starting.
  beforeEach(() => { vi.useFakeTimers(); h.queue.clear(); });
  afterEach(() => { vi.useRealTimers(); });

  it("merges into an order still queued as new", async () => {
    h.queue.set("o-1", item({}));
    expect(await patchQueued("o-1", addPayment, "order")).toBe(true);
    expect((h.queue.get("o-1") as QueueItem).payload.payments).toHaveLength(1);
  });

  it("leaves an order_update with the same id alone when an order is asked for, so its payments get their own records", async () => {
    h.queue.set("o-1", item({ type: "order_update", payload: { lines: [] } }));
    expect(await patchQueued("o-1", addPayment, "order")).toBe(false);
    expect((h.queue.get("o-1") as QueueItem).payload).toEqual({ lines: [] });
  });

  it("does not touch a record already being sent, nor one that is not there", async () => {
    h.queue.set("o-1", item({ status: "sending" }));
    expect(await patchQueued("o-1", addPayment, "order")).toBe(false);
    expect(await patchQueued("o-2", addPayment)).toBe(false);
  });
});

describe("recoverStuck", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-29T10:00:00Z")); h.queue.clear(); });
  afterEach(() => { vi.useRealTimers(); });

  it("on a fresh start puts every row left sending back to pending", async () => {
    h.queue.set("o-1", item({ status: "sending", sending_at: Date.now() - 1000 }));
    h.queue.set("o-2", item({ id: "o-2", status: "sending" }));
    h.queue.set("o-3", item({ id: "o-3", status: "pending" }));
    expect(await recoverStuck(true)).toBe(2);
    expect(queued().map((i) => i.status)).toEqual(["pending", "pending", "pending"]);
    expect((h.queue.get("o-1") as QueueItem).sending_at).toBeUndefined();
  });

  it("while running leaves a push in flight alone and recovers one older than two minutes or with no start time", async () => {
    h.queue.set("o-1", item({ status: "sending", sending_at: Date.now() - 30_000 }));
    h.queue.set("o-2", item({ id: "o-2", status: "sending", sending_at: Date.now() - 3 * 60_000 }));
    h.queue.set("o-3", item({ id: "o-3", status: "sending" }));
    expect(await recoverStuck()).toBe(2);
    expect((h.queue.get("o-1") as QueueItem).status).toBe("sending");
    expect((h.queue.get("o-2") as QueueItem).status).toBe("pending");
    expect((h.queue.get("o-3") as QueueItem).status).toBe("pending");
  });
});

describe("reachability", () => {
  // Review item 15: with the Wi-Fi up and the internet down, navigator.onLine stays true and Pay waited ~80 s.
  const now = Date.parse("2026-11-06T10:00:00Z");
  it("is offline when the browser says so, or when the last push or heartbeat failed within 30 s and nothing answered since", () => {
    expect(reachability({ navigatorOnline: false, lastFailureAt: 0, lastSuccessAt: now, now })).toBe("offline");
    expect(reachability({ navigatorOnline: true, lastFailureAt: now - 10_000, lastSuccessAt: 0, now })).toBe("offline");
    expect(reachability({ navigatorOnline: true, lastFailureAt: now - 10_000, lastSuccessAt: now - 20_000, now })).toBe("offline");
  });
  it("is online when something answered in the last 30 s after any failure, and unknown otherwise", () => {
    expect(reachability({ navigatorOnline: true, lastFailureAt: now - 20_000, lastSuccessAt: now - 5_000, now })).toBe("online");
    expect(reachability({ navigatorOnline: true, lastFailureAt: 0, lastSuccessAt: now - 5_000, now })).toBe("online");
    expect(reachability({ navigatorOnline: true, lastFailureAt: now - UNREACHABLE_FOR_MS - 1, lastSuccessAt: 0, now })).toBe("unknown");
    expect(reachability({ navigatorOnline: true, lastFailureAt: 0, lastSuccessAt: 0, now })).toBe("unknown");
    expect(reachability({ navigatorOnline: true, lastFailureAt: 0, lastSuccessAt: now - 60_000, now })).toBe("unknown");
  });
});

describe("planBatch", () => {
  // Review item 8: a failed order got +4 s of backoff while its payment pushed in 500 ms and was refused as not_found.
  const now = Date.parse("2026-10-13T10:05:00Z");
  const plan = (pending: QueueItem[], over: Partial<Parameters<typeof planBatch>[1]> = {}) => planBatch(pending, { now, queuedOrderIds: new Set(pending.filter((i) => i.type === "order").map((i) => i.id)), rejectedOrderIds: new Set(), ...over });

  it("sends an order before its payment, void, refund or update, whatever their timestamps", () => {
    const p = plan([payment("p-1", "o-1", { created_at: "2026-10-13T09:59:00Z" }), item({ id: "v-1", type: "void", payload: { order_id: "o-1" } }), item({}), item({ id: "o-2", type: "order_update" })]);
    expect(p.send.map((i) => i.id)).toEqual(["o-1", "o-2", "p-1", "v-1"]);
    expect(p.held).toEqual([]);
  });

  it("holds a payment whose order is queued but in backoff or in flight, and sends one whose order is already on the server", () => {
    const p = plan([item({ next_at: now + 4000 }), payment("p-1", "o-1"), payment("p-9", "o-9")], { queuedOrderIds: new Set(["o-1", "o-3"]) });
    expect(p.send.map((i) => i.id)).toEqual(["p-9"]);
    expect(p.held.map((i) => i.id)).toEqual(["p-1"]);
    const inFlight = plan([payment("p-3", "o-3")], { queuedOrderIds: new Set(["o-3"]) });
    expect(inFlight.send).toEqual([]);
    expect(inFlight.held.map((i) => i.id)).toEqual(["p-3"]);
  });

  it("blocks a dependent of an order the server rejected", () => {
    const p = plan([payment("p-1", "o-1")], { rejectedOrderIds: new Set(["o-1"]) });
    expect(p.blocked.map((i) => i.id)).toEqual(["p-1"]);
    expect(p.send).toEqual([]);
  });

  it("never carries a dependent past the batch limit without its order", () => {
    const orders = ["a", "b", "c"].map((id) => item({ id }));
    const p = plan([...orders, payment("p-a", "a")], { limit: 2 });
    expect(p.send.map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("processQueue", () => {
  beforeEach(() => {
    h.queue.clear(); h.attention.clear(); h.orders.clear(); h.api.mockReset();
    useSyncStore.setState({ status: "online", lastError: null, pending: 0, attention: 0 });
  });

  it("pushes an order and its payment in that order, then marks the local order synced", async () => {
    h.queue.set("p-1", payment("p-1", "o-1"));
    h.queue.set("o-1", item({}));
    h.orders.set("o-1", localOrder("o-1", "paid"));
    h.api.mockResolvedValueOnce({ ...accepted(), results: [{ id: "o-1", type: "order", status: "accepted" }, { id: "p-1", type: "payment", status: "accepted" }] });
    await processQueue();
    expect(sentRecords().map((r) => r.id)).toEqual(["o-1", "p-1"]);
    expect(sentRecords()[0]).not.toHaveProperty("approver_pin");
    expect(h.queue.size).toBe(0);
    expect(h.orders.get("o-1")).toMatchObject({ local_only: false, sync_status: undefined });
    expect(useSyncStore.getState()).toMatchObject({ status: "online", lastError: null });
  });

  it("takes a rejected order's payments to the Attention page under it, in the batch and still queued, and flags the paid order as rejected", async () => {
    h.queue.set("o-1", item({ payload: { status: "placed", payments: [{ id: "p-0" }] } }));
    h.queue.set("p-1", payment("p-1", "o-1"));
    h.queue.set("p-2", payment("p-2", "o-1", { next_at: Date.now() + 60_000 })); // in backoff: not in this batch
    h.orders.set("o-1", localOrder("o-1", "paid"));
    h.api.mockResolvedValueOnce({ ...accepted(), results: [{ id: "o-1", type: "order", status: "rejected", code: "day.locked", message: "The day is closed" }, { id: "p-1", type: "payment", status: "rejected", code: "not_found", message: "Order not found" }] });
    await processQueue();
    expect(sentRecords().map((r) => r.id)).toEqual(["o-1", "p-1"]);
    expect(h.queue.size).toBe(0);
    expect(attention().map((a) => [a.id, a.code, a.blocked_by])).toEqual([["o-1", "day.locked", undefined], ["p-1", "not_found", "o-1"], ["p-2", "blocked", "o-1"]]);
    expect(h.orders.get("o-1")).toMatchObject({ status: "paid", open: 0, sync_status: "rejected", sync_error: "The day is closed" });
    expect(useSyncStore.getState().attention).toBe(3);
  });

  it("closes an open order the server rejected, and flags the order of a rejected void", async () => {
    h.queue.set("o-1", item({}));
    h.queue.set("v-2", item({ id: "v-2", type: "void", payload: { order_id: "o-2", reason: "x" } }));
    h.orders.set("o-1", localOrder("o-1", "placed"));
    h.orders.set("o-2", { ...localOrder("o-2", "voided"), local_only: false });
    h.api.mockResolvedValueOnce({ ...accepted(), results: [{ id: "o-1", type: "order", status: "rejected", code: "product.archived", message: "Karahi is archived" }, { id: "v-2", type: "void", status: "rejected", code: "order.paid", message: "Already paid" }] });
    await processQueue();
    expect(h.orders.get("o-1")).toMatchObject({ status: "rejected", open: 0, sync_status: "rejected" });
    expect(h.orders.get("o-2")).toMatchObject({ status: "voided", sync_status: "rejected", sync_error: "void Already paid" });
  });

  it("puts the batch back untouched when the till is locked (session.required): no attempt counted, no backoff, no error shown", async () => {
    h.queue.set("o-1", item({}));
    h.api.mockRejectedValueOnce(new ApiError("session.required", "Sign in first", 403));
    await processQueue();
    expect(h.queue.get("o-1")).toMatchObject({ status: "pending", attempts: 0, next_at: 0, last_error: null });
    expect(useSyncStore.getState()).toMatchObject({ status: "online", lastError: null });
  });

  it("backs off and reports a non-network failure, so the badge can say what is wrong", async () => {
    h.queue.set("o-1", item({}));
    h.api.mockRejectedValueOnce(new ApiError("device.revoked", "This till was revoked", 403));
    await processQueue();
    expect(h.queue.get("o-1")).toMatchObject({ status: "pending", attempts: 1, last_error: "This till was revoked" });
    expect(useSyncStore.getState()).toMatchObject({ status: "online", lastError: "This till was revoked" });
  });

  it("sends a manager PIN from Try again with that one push only, never storing it", async () => {
    h.attention.set("v-1", { id: "v-1", type: "void", code: "approval.required", message: "Needs a manager", payload: { order_id: "o-7", reason: "x", __membership_id: "m-1" }, created_at: "2026-10-13T10:00:00Z" });
    await retryAttention("v-1", "4321");
    expect(h.attention.size).toBe(0);
    expect(h.queue.get("v-1")).toMatchObject({ type: "void", membership_id: "m-1", payload: { order_id: "o-7", reason: "x" } });
    expect(JSON.stringify([...h.queue.values()])).not.toContain("4321");
    h.api.mockRejectedValueOnce(new ApiError("http_500", "Server error", 500));
    await processQueue();
    expect(sentRecords(0)[0]).toMatchObject({ id: "v-1", approver_pin: "4321" });
    // The attempt is over: the next push goes without the PIN.
    h.queue.set("v-1", { ...(h.queue.get("v-1") as QueueItem), next_at: 0 });
    h.api.mockResolvedValueOnce({ ...accepted(), results: [{ id: "v-1", type: "void", status: "accepted" }] });
    await processQueue();
    expect(sentRecords(1)[0]).not.toHaveProperty("approver_pin");
  });

  it("Try again on a rejected order brings the records held back by it back to the queue, pending and open again", async () => {
    h.attention.set("o-1", { id: "o-1", type: "order", code: "day.locked", message: "closed", payload: { status: "placed", __membership_id: "m-1" }, created_at: "2026-10-13T10:00:00Z" });
    h.attention.set("p-1", { id: "p-1", type: "payment", code: "blocked", message: "waits", payload: { order_id: "o-1" }, blocked_by: "o-1", created_at: "2026-10-13T10:01:00Z" });
    h.orders.set("o-1", { ...localOrder("o-1", "rejected"), local_only: false, sync_status: "rejected", sync_error: "closed" });
    await retryAttention("o-1");
    expect(h.attention.size).toBe(0);
    expect(queued().map((i) => i.id).sort()).toEqual(["o-1", "p-1"]);
    expect(h.orders.get("o-1")).toMatchObject({ status: "placed", open: 1, local_only: true, sync_status: undefined, sync_error: undefined });
  });

  it("dismissing a rejected order drops what it held back but keeps the local order row, marked rejected", async () => {
    h.attention.set("o-1", { id: "o-1", type: "order", code: "day.locked", message: "closed", payload: { payments: [{ id: "p-0" }] }, created_at: "2026-10-13T10:00:00Z" });
    h.attention.set("p-1", { id: "p-1", type: "payment", code: "blocked", message: "waits", payload: { order_id: "o-1" }, blocked_by: "o-1", created_at: "2026-10-13T10:01:00Z" });
    h.orders.set("o-1", { ...localOrder("o-1", "paid"), sync_status: "rejected", sync_error: "closed" });
    await dismissAttention("o-1");
    expect(h.attention.size).toBe(0);
    expect(h.orders.get("o-1")).toMatchObject({ status: "paid", sync_status: "rejected" });
  });
});

describe("isMoneyRecord", () => {
  it("is a payment, refund, void or account payment, or an order paid offline", () => {
    expect(isMoneyRecord({ type: "payment", payload: {} })).toBe(true);
    expect(isMoneyRecord({ type: "customer_payment", payload: {} })).toBe(true);
    expect(isMoneyRecord({ type: "order", payload: { payments: [{ id: "p" }] } })).toBe(true);
    expect(isMoneyRecord({ type: "order", payload: { payments: [] } })).toBe(false);
    expect(isMoneyRecord({ type: "order_update", payload: {} })).toBe(false);
  });
});
