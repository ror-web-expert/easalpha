import { createHmac, randomBytes, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttentionItem, QueueItem } from "@/lib/db";
import type { Session } from "@/lib/types";

if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto);

// The till's IndexedDB in memory, as in sync.test.ts.
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
import { useDeviceStore } from "@/store/device";
import { useCatalogStore } from "@/store/catalog";
import { STASH_STORAGE_KEY } from "@/lib/session-stash";
import { toBase64Url, fromBase64Url } from "@/lib/sync-sign";
import { dismissAttention, enqueue, flushDismissals, noteReachable, patchQueued, processQueue, pullChanges, retryAttention } from "./sync";

// Signed sync records (final round, 6 Nov 2026, sync-auth#0): every record the till queues keeps the key of the
// session that made it and is pushed signed with it, so a record naming the manager can only be the manager's.
const newKey = (id: string) => ({ id, key: toBase64Url(new Uint8Array(randomBytes(32))) });
const cashierKey = newKey("k-cashier");
const managerKey = newKey("k-manager");
const signIn = (membership: string, key: { id: string; key: string } | null) =>
  useDeviceStore.setState({ session: { access_token: "a", refresh_token: "r", app: "pos", membership: { id: membership }, user: { name: membership }, permissions: [], ...(key ? { sync_key: key.key, sync_key_id: key.id } : {}) } as unknown as Session });
const queued = (id: string) => h.queue.get(id) as QueueItem;
const sent = (call = 0) => (h.api.mock.calls.filter((c) => c[0] === "/sync/push")[call][1] as { body: { records: Record<string, unknown>[] } }).body.records;
const macOf = (key: string, signed: string) => createHmac("sha256", Buffer.from(fromBase64Url(key))).update(signed).digest("base64url");
const pushAnswer = (results: Record<string, unknown>[]) => (path: string) => (path === "/sync/push" ? { batch_id: "b", server_time: "2026-11-06T10:02:00Z", results } : undefined);

beforeEach(async () => {
  h.queue.clear(); h.attention.clear(); h.orders.clear(); h.api.mockReset(); localStorage.clear();
  // A network failure in one test leaves the till offline for 30 s: the server answers again, a moment later.
  await new Promise((r) => setTimeout(r, 2));
  noteReachable();
});
afterEach(() => { useDeviceStore.setState({ session: null }); vi.unstubAllGlobals(); if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto); });

describe("enqueue", () => {
  it("keeps the signed-in session's key with a record that session makes, and none with one naming someone else", async () => {
    signIn("m-cashier", cashierKey);
    await enqueue({ type: "void", id: "v-1", membership_id: "m-cashier", payload: { order_id: "o-1", reason: "x" } });
    await enqueue({ type: "void", id: "v-2", membership_id: "m-manager", payload: { order_id: "o-1", reason: "x" } });
    expect(queued("v-1")).toMatchObject({ membership_id: "m-cashier", sync_key_id: cashierKey.id, sync_key: cashierKey.key });
    expect(queued("v-2")).not.toHaveProperty("sync_key");
    expect(queued("v-2")).not.toHaveProperty("sync_key_id");
  });

  it("dates a record with no time of its own when it is queued, and keeps the time a record already carries", async () => {
    signIn("m-cashier", cashierKey);
    await enqueue({ type: "cash_movement", id: "c-1", membership_id: "m-cashier", payload: { shift_id: "s-1", kind: "cash_out", amount_minor: 500 } });
    await enqueue({ type: "order", id: "o-1", membership_id: "m-cashier", payload: { client_created_at: "2026-11-06T09:00:00.000Z" } });
    expect(Date.now() - Date.parse(queued("c-1").payload.client_created_at as string)).toBeLessThan(5_000);
    expect(queued("o-1").payload.client_created_at).toBe("2026-11-06T09:00:00.000Z");
  });

  it("queues unsigned when the session has no key yet (signed in before the signatures)", async () => {
    signIn("m-cashier", null);
    await enqueue({ type: "void", id: "v-1", membership_id: "m-cashier", payload: { order_id: "o-1" } });
    expect(queued("v-1")).not.toHaveProperty("sync_key");
  });
});

describe("the push", () => {
  it("sends a keyed row signed over its payload as it is then, the PIN fields beside it, and an unkeyed row as before", async () => {
    signIn("m-cashier", cashierKey);
    await enqueue({ type: "order", id: "o-1", membership_id: "m-cashier", payload: { status: "placed", client_created_at: "2026-11-06T09:00:00.000Z", payments: [] } });
    await patchQueued("o-1", (p) => ({ ...p, payments: [{ id: "p-1", amount_minor: 9_280 }] }), "order"); // paid while it waited
    h.queue.set("v-old", { id: "v-old", type: "void", membership_id: "m-cashier", payload: { order_id: "o-0" }, created_at: "2026-11-06T08:00:00Z", attempts: 0, next_at: 0, last_error: null, status: "pending" } satisfies QueueItem);
    h.api.mockImplementation(pushAnswer([{ id: "v-old", type: "void", status: "accepted" }, { id: "o-1", type: "order", status: "accepted" }]));
    await processQueue();
    const [legacy, signed] = sent();
    expect(legacy).toEqual({ type: "void", id: "v-old", membership_id: "m-cashier", payload: { order_id: "o-0" } });
    expect(Object.keys(signed).sort()).toEqual(["sig", "signed", "signed_by"]);
    expect(JSON.parse(signed.signed as string)).toEqual({ type: "order", id: "o-1", membership_id: "m-cashier", payload: { status: "placed", client_created_at: "2026-11-06T09:00:00.000Z", payments: [{ id: "p-1", amount_minor: 9_280 }] } });
    expect(signed).toMatchObject({ signed_by: cashierKey.id, sig: macOf(cashierKey.key, signed.signed as string) });
    expect(h.queue.size).toBe(0);
  });

  it("keeps a refused record's key on the Attention page, and Try again with another member signed in is still signed by its maker", async () => {
    signIn("m-cashier", cashierKey);
    await enqueue({ type: "void", id: "v-1", membership_id: "m-cashier", payload: { order_id: "o-1", reason: "x" } });
    h.api.mockImplementation(pushAnswer([{ id: "v-1", type: "void", status: "rejected", code: "approval.required", message: "A manager must approve", details: { permissions: ["orders.void"], labels: {} } }]));
    await processQueue();
    const a = h.attention.get("v-1") as AttentionItem;
    expect(a).toMatchObject({ sync_key_id: cashierKey.id, sync_key: cashierKey.key });
    expect(JSON.stringify(a.payload)).not.toContain(cashierKey.key); // the Record shown on the Attention page has no key

    signIn("m-manager", managerKey); // the manager unlocks the till and retries with their PIN
    await retryAttention("v-1", "4321");
    expect(queued("v-1")).toMatchObject({ membership_id: "m-cashier", sync_key_id: cashierKey.id, sync_key: cashierKey.key });
    h.api.mockReset();
    h.api.mockImplementation(pushAnswer([{ id: "v-1", type: "void", status: "accepted" }]));
    await processQueue();
    const [rec] = sent();
    expect(rec).toMatchObject({ signed_by: cashierKey.id, approver_pin: "4321", approval_codes: ["orders.void"] });
    expect(rec.sig).toBe(macOf(cashierKey.key, rec.signed as string));
    expect(rec.signed as string).not.toContain("4321");
    expect(JSON.parse(rec.signed as string)).toMatchObject({ membership_id: "m-cashier" });
  });

  it("keeps the key of a record held back by a rejected order, so it is signed by its maker when it goes again", async () => {
    signIn("m-cashier", cashierKey);
    await enqueue({ type: "order", id: "o-1", membership_id: "m-cashier", payload: { status: "placed", client_created_at: "2026-11-06T09:00:00.000Z" } });
    h.queue.set("p-1", { ...queued("o-1"), id: "p-1", type: "payment", payload: { order_id: "o-1", amount_minor: 100 }, next_at: Date.now() + 60_000 });
    h.api.mockImplementation(pushAnswer([{ id: "o-1", type: "order", status: "rejected", code: "day.locked", message: "closed" }]));
    await processQueue();
    expect(h.attention.get("p-1")).toMatchObject({ code: "blocked", blocked_by: "o-1", sync_key_id: cashierKey.id, sync_key: cashierKey.key });
  });

  it("never signs a record from a session without a key with someone else's", async () => {
    h.attention.set("v-1", { id: "v-1", type: "void", code: "approval.required", message: "m", payload: { order_id: "o-1", __membership_id: "m-old" }, created_at: "2026-11-06T09:00:00Z" } satisfies AttentionItem);
    signIn("m-old", managerKey); // even the same member's new session: the record was made before it, unsigned
    await retryAttention("v-1");
    expect(queued("v-1")).not.toHaveProperty("sync_key");
    expect(queued("v-1").payload).not.toHaveProperty("client_created_at");
  });
});

// K7: the till's Dismiss resolved nothing on the server, so the admin's Needs attention kept every refusal open.
describe("Dismiss on the Attention page", () => {
  const item = (id: string, over: Partial<AttentionItem> = {}): AttentionItem => ({ id, type: "payment", code: "not_found", message: "m", payload: { order_id: "o-1" }, created_at: "2026-11-06T09:00:00Z", ...over });
  const resolved = () => h.api.mock.calls.filter((c) => String(c[0]).startsWith("/sync/rejections/")).map((c) => [c[0], (c[1] as { body: unknown }).body]);

  it("resolves on the server what it refused, by the record's id, and not what the till held back", async () => {
    h.attention.set("o-1", item("o-1", { type: "order", code: "day.locked", payload: {} }));
    h.attention.set("p-1", item("p-1", { blocked_by: "o-1" }));
    h.attention.set("p-2", item("p-2", { code: "blocked", blocked_by: "o-1" }));
    await dismissAttention("o-1");
    await vi.waitFor(() => expect(resolved()).toHaveLength(2));
    expect(resolved()).toEqual([["/sync/rejections/o-1/resolve", { resolution: "dismissed" }], ["/sync/rejections/p-1/resolve", { resolution: "dismissed" }]]);
    expect(h.attention.size).toBe(0);
  });

  it("keeps a dismissal made offline until the server can be told, then sends it once", async () => {
    vi.stubGlobal("navigator", { ...navigator, onLine: false });
    h.attention.set("o-1", item("o-1", { type: "order" }));
    await dismissAttention("o-1");
    await Promise.resolve();
    expect(resolved()).toEqual([]);
    expect(JSON.parse(localStorage.getItem("easalpha.sync-dismissed") ?? "[]")).toEqual(["o-1"]);
    vi.unstubAllGlobals();
    // The connection drops again on the way: what was not sent stays for the next try.
    h.api.mockRejectedValueOnce(new ApiError("network", "Cannot reach the server", 0));
    await flushDismissals();
    expect(JSON.parse(localStorage.getItem("easalpha.sync-dismissed") ?? "[]")).toEqual(["o-1"]);
    // The server answers again (a push or a heartbeat got through), a moment after the failure.
    await new Promise((r) => setTimeout(r, 5));
    noteReachable();
    h.api.mockResolvedValue(undefined);
    await flushDismissals();
    expect(localStorage.getItem("easalpha.sync-dismissed")).toBeNull();
    expect(resolved().map((r) => r[0])).toEqual(["/sync/rejections/o-1/resolve", "/sync/rejections/o-1/resolve"]);
  });

  it("keeps a dismissal made while an earlier one is still being sent", async () => {
    let answer: () => void = () => {};
    h.api.mockImplementationOnce(() => new Promise<void>((resolve) => { answer = resolve; }));
    const first = flushDismissals(["o-1"]);
    vi.stubGlobal("navigator", { ...navigator, onLine: false });
    await flushDismissals(["o-2"]); // the connection dropped: this one waits
    answer();
    await first;
    expect(JSON.parse(localStorage.getItem("easalpha.sync-dismissed") ?? "[]")).toEqual(["o-2"]);
  });

  it("drops a dismissal the server refuses (not allowed, or nothing open) instead of trying it for ever", async () => {
    h.api.mockRejectedValueOnce(new ApiError("permission.denied", "Missing permission", 403));
    await flushDismissals(["v-9"]);
    expect(localStorage.getItem("easalpha.sync-dismissed")).toBeNull();
  });
});

describe("pullChanges", () => {
  it("drops the offline-unlock copy of a member deactivated since", async () => {
    localStorage.setItem(STASH_STORAGE_KEY, JSON.stringify({ "m-gone": { membership_id: "m-gone", device_id: "d-1" }, "m-here": { membership_id: "m-here", device_id: "d-1" } }));
    const applyChanges = vi.fn(async () => {});
    useCatalogStore.setState({ catalog: { business: {} } as never, cursor: "c-1", applyChanges } as never);
    h.api.mockResolvedValue({ staff: [{ id: "m-gone", status: "deactivated" }, { id: "m-here", status: "active" }] });
    await pullChanges();
    expect(applyChanges).toHaveBeenCalled();
    expect(Object.keys(JSON.parse(localStorage.getItem(STASH_STORAGE_KEY) ?? "{}"))).toEqual(["m-here"]);
  });
});
