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
  // A transaction runs its function: the in-memory tables have no other requests to interleave with.
  return { queue, attention, orders, api: vi.fn(), db: { queue: table(queue), attention: table(attention), orders: table(orders), transaction: (_mode: string, _tables: unknown, fn: () => Promise<unknown>) => fn() } };
});
vi.mock("@/lib/db", () => ({ db: h.db, kvGet: async () => undefined, kvSet: async () => undefined }));
vi.mock("@/lib/api", async () => ({ ...(await vi.importActual<typeof import("@/lib/api")>("@/lib/api")), api: (...a: unknown[]) => h.api(...a) }));

import { ApiError } from "@/lib/api";
import { useSyncStore } from "@/store/sync";
import { useDeviceStore } from "@/store/device";
import type { Session } from "@/lib/types";
import { dismissAttention, enqueue, isMoneyRecord, patchQueued, planBatch, processQueue, reachability, recoverStuck, retryAttention, UNREACHABLE_FOR_MS } from "./sync";

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

  // Final round, web-till#3: a change to an order a push is carrying was refused, and saveOrder lost its lines.
  it("keeps a change to an order being sent beside it, untouched by the push, and builds later changes on it", async () => {
    h.queue.set("o-1", item({ status: "sending", sending_at: 1, payload: { lines: [{ id: "l-1" }] } }));
    expect(await patchQueued("o-1", (p) => ({ ...p, lines: [{ id: "l-1" }, { id: "l-2" }] }))).toBe(true);
    expect(await patchQueued("o-1", addPayment, "order")).toBe(true);
    const row = h.queue.get("o-1") as QueueItem;
    expect(row).toMatchObject({ status: "sending", sending_at: 1, payload: { lines: [{ id: "l-1" }] } });
    expect(row.patched_payload).toEqual({ lines: [{ id: "l-1" }, { id: "l-2" }], payments: [{ id: "pay-1", amount_minor: 1000 }] });
  });

  it("does not touch another kind of record being sent, nor one that is not there", async () => {
    h.queue.set("p-1", item({ id: "p-1", type: "payment", status: "sending" }));
    expect(await patchQueued("p-1", addPayment)).toBe(false);
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

  it("sends a payment or void after a queued update of its order, and holds it while the update is in backoff or in flight", () => {
    const update = item({ id: "o-5", type: "order_update", created_at: "2026-10-13T10:02:00Z" });
    const p = plan([payment("p-5", "o-5", { created_at: "2026-10-13T10:00:00Z" }), item({ id: "v-5", type: "void", payload: { order_id: "o-5" } }), update], { queuedUpdateIds: new Set(["o-5"]) });
    expect(p.send.map((i) => i.id)).toEqual(["o-5", "p-5", "v-5"]);
    const waiting = plan([payment("p-5", "o-5"), { ...update, next_at: now + 4000 }], { queuedUpdateIds: new Set(["o-5"]) });
    expect(waiting.send).toEqual([]);
    expect(waiting.held.map((i) => i.id)).toEqual(["p-5"]);
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

  // Review of 6 Nov 2026, R6: the PIN approves the codes the rejection named, and nothing else the manager holds.
  it("sends the permissions the rejection named as approval_codes with the PIN, and a PIN alone for an older rejection", async () => {
    h.attention.set("v-1", { id: "v-1", type: "void", code: "approval.required", message: "Needs a manager", payload: { order_id: "o-7", reason: "x" }, created_at: "2026-10-13T10:00:00Z",
      permissions: ["orders.void"], permission_labels: { "orders.void": "Void an order before payment" } });
    h.attention.set("v-2", { id: "v-2", type: "void", code: "approval.required", message: "Needs a manager", payload: { order_id: "o-8", reason: "x" }, created_at: "2026-10-13T10:00:01Z" });
    await retryAttention("v-1", "4321");
    await retryAttention("v-2", "4321");
    h.api.mockResolvedValueOnce({ ...accepted(), results: [{ id: "v-1", type: "void", status: "accepted" }, { id: "v-2", type: "void", status: "accepted" }] });
    await processQueue();
    expect(sentRecords()[0]).toMatchObject({ id: "v-1", approver_pin: "4321", approval_codes: ["orders.void"] });
    expect(sentRecords()[1]).toMatchObject({ id: "v-2", approver_pin: "4321" });
    expect(sentRecords()[1]).not.toHaveProperty("approval_codes");
    expect(JSON.stringify([...h.queue.values(), ...h.attention.values()])).not.toContain("4321");
  });

  it("keeps on the Attention page what a refused record needs, after what the last PIN approved", async () => {
    h.queue.set("o-1", item({ payload: { status: "placed", is_staff_meal: true } }));
    h.api.mockResolvedValueOnce({ ...accepted(), results: [{ id: "o-1", type: "order", status: "rejected", code: "approval.required", message: "A manager with orders.staff_meal must approve this",
      details: { permissions: ["orders.staff_meal"], labels: { "orders.staff_meal": "Mark an order as staff meal" } } }] });
    await processQueue();
    expect(h.attention.get("o-1")).toMatchObject({ permissions: ["orders.staff_meal"], permission_labels: { "orders.staff_meal": "Mark an order as staff meal" } });
    // Approved, the staff meal passes and the price override behind it asks for its own: both are listed for the next try.
    await retryAttention("o-1", "4321");
    h.api.mockResolvedValueOnce({ ...accepted(), results: [{ id: "o-1", type: "order", status: "rejected", code: "approval.required", message: "A manager with prices.override must approve this",
      details: { permissions: ["prices.override"], labels: { "prices.override": "Override an item price" } } }] });
    await processQueue();
    expect(sentRecords(1)[0]).toMatchObject({ approver_pin: "4321", approval_codes: ["orders.staff_meal"] });
    expect(h.attention.get("o-1")).toMatchObject({ permissions: ["orders.staff_meal", "prices.override"], permission_labels: { "orders.staff_meal": "Mark an order as staff meal", "prices.override": "Override an item price" } });
    // A refusal for another reason lists nothing to approve.
    await retryAttention("o-1");
    h.api.mockResolvedValueOnce({ ...accepted(), results: [{ id: "o-1", type: "order", status: "rejected", code: "day.locked", message: "closed" }] });
    await processQueue();
    expect(h.attention.get("o-1")).not.toHaveProperty("permissions");
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

describe("processQueue: changes made while a push is out (final round, web-till#3, web-till#4)", () => {
  const lines = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `l-${i + 1}`, product_id: "chai", quantity: 1 }));
  const queuedOrder = () => item({ payload: { order_type: "takeaway", status: "draft", table_id: null, notes: null, lines: lines(1), till_serial: "T1-001" } });
  // Pay on the queued order while its push is out: a Naan added (saveOrder), then cash with a tip (payOrder).
  const payDuringPush = async () => {
    expect(await patchQueued("o-1", (p) => ({ ...p, status: "placed", lines: lines(2) }))).toBe(true);
    expect(await patchQueued("o-1", (p) => ({ ...p, payments: [{ id: "pay-1", method_code: "cash", amount_minor: 150000, tendered_minor: 150000, client_created_at: "2026-11-06T20:00:00Z" }], tip_minor: 5000 }), "order")).toBe(true);
  };
  const records = (call: number) => sentRecords(call).map((r) => ({ id: r.id, type: r.type, payload: r.payload as Record<string, unknown> }));

  beforeEach(() => {
    h.queue.clear(); h.attention.clear(); h.orders.clear(); h.api.mockReset();
    useSyncStore.setState({ status: "online", lastError: null, pending: 0, attention: 0 });
    useDeviceStore.setState({ session: { membership: { id: "m-2" } } as unknown as Session });
  });
  afterEach(() => { useDeviceStore.setState({ session: null }); });

  it("sends what changed as records of its own once the push is accepted: the update first, then the payment with the tip", async () => {
    h.queue.set("o-1", queuedOrder());
    h.orders.set("o-1", localOrder("o-1", "paid"));
    h.api.mockImplementationOnce(async () => { await payDuringPush(); return accepted("o-1"); });
    await processQueue();
    expect(records(0)).toEqual([{ id: "o-1", type: "order", payload: queuedOrder().payload }]);
    const left = queued();
    expect(left.map((i) => [i.type, i.id, i.membership_id])).toEqual([["order_update", "o-1", "m-2"], ["payment", "pay-1", "m-2"]]);
    expect(left[0].payload).toMatchObject({ lines: lines(2), status: "placed", order_type: "takeaway", is_staff_meal: false });
    expect(left[0].payload).toHaveProperty("client_seq");
    expect(left[0].payload).not.toHaveProperty("payments");
    expect(left[1].payload).toEqual({ order_id: "o-1", method_code: "cash", amount_minor: 150000, tendered_minor: 150000, reference: undefined, client_created_at: "2026-11-06T20:00:00Z", tip_minor: 5000 });
    // They go in the next push, the update before the payment.
    h.api.mockResolvedValueOnce({ ...accepted(), results: [{ id: "o-1", type: "order_update", status: "accepted" }, { id: "pay-1", type: "payment", status: "accepted" }] });
    await processQueue();
    expect(records(1).map((r) => r.id)).toEqual(["o-1", "pay-1"]);
    expect(h.queue.size).toBe(0);
  });

  it("keeps the change's maker and their sync key on the records it becomes, whoever is signed in when the push answers", async () => {
    h.queue.set("o-1", queuedOrder());
    useDeviceStore.setState({ session: { membership: { id: "m-2" }, sync_key: "secret-2", sync_key_id: "k-2" } as unknown as Session });
    h.api.mockImplementationOnce(async () => {
      await payDuringPush();
      useDeviceStore.setState({ session: { membership: { id: "m-3" }, sync_key: "secret-3", sync_key_id: "k-3" } as unknown as Session }); // another cashier signs in
      return accepted("o-1");
    });
    await processQueue();
    expect(queued().map((i) => [i.type, i.membership_id, i.sync_key_id, i.sync_key])).toEqual([["order_update", "m-2", "k-2", "secret-2"], ["payment", "m-2", "k-2", "secret-2"]]);
  });

  it("puts the change into the record when the push fails, so the next push carries it", async () => {
    h.queue.set("o-1", queuedOrder());
    // A server error, not a network one: those mark the till offline for 30 s and the next tests would not push.
    h.api.mockImplementationOnce(async () => { await payDuringPush(); throw new ApiError("http_500", "Server error", 500); });
    await processQueue();
    const row = h.queue.get("o-1") as QueueItem;
    expect(row).toMatchObject({ type: "order", status: "pending", attempts: 1, payload: { status: "placed", lines: lines(2), tip_minor: 5000 } });
    expect((row.payload.payments as unknown[]).length).toBe(1);
    expect(row).not.toHaveProperty("patched_payload");
  });

  it("takes the change to the Attention page with the record the server refused", async () => {
    h.queue.set("o-1", queuedOrder());
    h.orders.set("o-1", localOrder("o-1", "paid"));
    h.api.mockImplementationOnce(async () => { await payDuringPush(); return { ...accepted(), results: [{ id: "o-1", type: "order", status: "rejected", code: "day.locked", message: "closed" }] }; });
    await processQueue();
    expect(h.queue.size).toBe(0);
    expect(h.attention.get("o-1")).toMatchObject({ code: "day.locked", payload: { lines: lines(2), tip_minor: 5000 } });
  });

  it("sends a void made meanwhile as a void, and a staff meal completed on a queued update as a new update", async () => {
    h.queue.set("o-1", queuedOrder());
    h.queue.set("o-9", item({ id: "o-9", type: "order_update", payload: { lines: lines(1), client_seq: 1 } }));
    h.api.mockImplementationOnce(async () => {
      await patchQueued("o-1", (p) => ({ ...p, status: "voided", voided: true, void_reason: "Wrong table" }), "order");
      await patchQueued("o-9", (p) => ({ ...p, complete: true }), "order_update");
      return { ...accepted("o-1"), results: [{ id: "o-1", type: "order", status: "accepted" }, { id: "o-9", type: "order_update", status: "accepted" }] };
    });
    await processQueue();
    const left = queued();
    expect(left.find((i) => i.type === "void")?.payload).toMatchObject({ order_id: "o-1", reason: "Wrong table", client_created_at: expect.any(String) });
    const update = left.find((i) => i.type === "order_update")!;
    expect(update).toMatchObject({ id: "o-9", payload: { complete: true, lines: lines(1) } });
    expect(update.payload.client_seq).not.toBe(1);
  });

  it("leaves a newer record put under the same id during the push, whatever the push's answer", async () => {
    h.queue.set("o-1", item({ type: "order_update", payload: { lines: lines(1), client_seq: 1 } }));
    h.api.mockImplementationOnce(async () => { await enqueue({ type: "order_update", id: "o-1", payload: { lines: lines(2), client_seq: 2 } }); return { ...accepted(), results: [{ id: "o-1", type: "order_update", status: "accepted" }] }; });
    await processQueue();
    expect(h.queue.get("o-1")).toMatchObject({ status: "pending", payload: { lines: lines(2), client_seq: 2 } });
    h.api.mockImplementationOnce(async () => { await enqueue({ type: "order_update", id: "o-1", payload: { lines: lines(3), client_seq: 3 } }); throw new ApiError("http_500", "Server error", 500); });
    await processQueue();
    expect(h.queue.get("o-1")).toMatchObject({ status: "pending", attempts: 0, payload: { lines: lines(3), client_seq: 3 } });
  });

  it("does not send a push's rows back to pending when sync restarts under it, so a payment taken meanwhile is not lost with them", async () => {
    h.queue.set("o-1", queuedOrder());
    h.api.mockImplementationOnce(async () => {
      expect(await recoverStuck(true)).toBe(0); // startSync after a token refresh
      expect(await patchQueued("o-1", (p) => ({ ...p, payments: [{ id: "pay-1", method_code: "cash", amount_minor: 9280 }] }), "order")).toBe(true);
      return accepted("o-1");
    });
    await processQueue();
    expect(queued().map((i) => [i.type, i.id])).toEqual([["payment", "pay-1"]]);
    // With no push out, a fresh start still recovers a row a crash left sending.
    h.queue.clear();
    h.queue.set("o-2", item({ id: "o-2", status: "sending", sending_at: Date.now(), patched_payload: { lines: lines(2) } }));
    expect(await recoverStuck(true)).toBe(1);
    expect(h.queue.get("o-2")).toMatchObject({ status: "pending", payload: { lines: lines(2) } });
  });
});

describe("processQueue: the Rejected flag (final round, web-till#7)", () => {
  beforeEach(() => {
    h.queue.clear(); h.attention.clear(); h.orders.clear(); h.api.mockReset();
    useSyncStore.setState({ status: "online", lastError: null, pending: 0, attention: 0 });
  });

  it("keeps the flag a refused update set when a payment of the same order is accepted, in the same push or later", async () => {
    h.orders.set("o-1", { ...localOrder("o-1", "paid"), local_only: false });
    h.queue.set("o-1", item({ type: "order_update", payload: { lines: [] } }));
    h.queue.set("p-1", payment("p-1", "o-1"));
    h.api.mockResolvedValueOnce({ ...accepted(), results: [{ id: "o-1", type: "order_update", status: "rejected", code: "approval.required", message: "needs a manager" }, { id: "p-1", type: "payment", status: "accepted" }] });
    await processQueue();
    expect(h.orders.get("o-1")).toMatchObject({ sync_status: "rejected", sync_error: "order update needs a manager" });
    h.queue.set("p-2", payment("p-2", "o-1"));
    h.api.mockResolvedValueOnce({ ...accepted(), results: [{ id: "p-2", type: "payment", status: "accepted" }] });
    await processQueue();
    expect(h.orders.get("o-1")).toMatchObject({ sync_status: "rejected" });
    // Resolved, the next accepted record clears it.
    await dismissAttention("o-1");
    h.queue.set("p-3", payment("p-3", "o-1"));
    h.api.mockResolvedValueOnce({ ...accepted(), results: [{ id: "p-3", type: "payment", status: "accepted" }] });
    await processQueue();
    expect(h.orders.get("o-1")).toMatchObject({ sync_status: undefined, sync_error: undefined });
  });

  it("keeps the flag on Try again while another refused record of the order is still listed", async () => {
    h.orders.set("o-1", { ...localOrder("o-1", "paid"), local_only: false, sync_status: "rejected", sync_error: "payment refused" });
    h.attention.set("p-1", { id: "p-1", type: "payment", code: "khata.over_limit", message: "over", payload: { order_id: "o-1" }, created_at: "2026-10-13T10:00:00Z" });
    h.attention.set("o-1", { id: "o-1", type: "order_update", code: "approval.required", message: "needs a manager", payload: { lines: [] }, created_at: "2026-10-13T10:01:00Z" });
    await retryAttention("p-1");
    expect(h.orders.get("o-1")).toMatchObject({ sync_status: "rejected" });
    await retryAttention("o-1");
    expect(h.orders.get("o-1")).toMatchObject({ sync_status: undefined });
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
