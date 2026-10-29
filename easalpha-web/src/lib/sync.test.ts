import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueItem } from "@/lib/db";

// The offline queue in memory: one record per id, as db.queue keeps it.
const queue = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/db", () => ({
  db: {
    queue: {
      get: async (id: string) => queue.get(id),
      put: async (item: { id: string }) => void queue.set(item.id, item),
      bulkPut: async (items: { id: string }[]) => items.forEach((i) => queue.set(i.id, i)),
      count: async () => queue.size,
      where: (field: string) => ({ equals: (v: unknown) => ({ toArray: async () => [...queue.values()].filter((i) => (i as Record<string, unknown>)[field] === v) }) }),
    },
    attention: { count: async () => 0 },
  },
}));

import { patchQueued, recoverStuck } from "./sync";

const item = (over: Partial<QueueItem>): QueueItem => ({ id: "o-1", type: "order", payload: {}, created_at: "2026-10-13T10:00:00Z", attempts: 0, next_at: 0, last_error: null, status: "pending", ...over });
const addPayment = (p: Record<string, unknown>) => ({ ...p, payments: [{ id: "pay-1", amount_minor: 1000 }] });

describe("patchQueued", () => {
  // patchQueued schedules a queue run; fake timers keep it from starting.
  beforeEach(() => { vi.useFakeTimers(); queue.clear(); });
  afterEach(() => { vi.useRealTimers(); });

  it("merges into an order still queued as new", async () => {
    queue.set("o-1", item({}));
    expect(await patchQueued("o-1", addPayment, "order")).toBe(true);
    expect((queue.get("o-1") as QueueItem).payload.payments).toHaveLength(1);
  });

  it("leaves an order_update with the same id alone when an order is asked for, so its payments get their own records", async () => {
    queue.set("o-1", item({ type: "order_update", payload: { lines: [] } }));
    expect(await patchQueued("o-1", addPayment, "order")).toBe(false);
    expect((queue.get("o-1") as QueueItem).payload).toEqual({ lines: [] });
  });

  it("does not touch a record already being sent, nor one that is not there", async () => {
    queue.set("o-1", item({ status: "sending" }));
    expect(await patchQueued("o-1", addPayment, "order")).toBe(false);
    expect(await patchQueued("o-2", addPayment)).toBe(false);
  });
});

describe("recoverStuck", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-29T10:00:00Z")); queue.clear(); });
  afterEach(() => { vi.useRealTimers(); });

  it("on a fresh start puts every row left sending back to pending", async () => {
    queue.set("o-1", item({ status: "sending", sending_at: Date.now() - 1000 }));
    queue.set("o-2", item({ id: "o-2", status: "sending" }));
    queue.set("o-3", item({ id: "o-3", status: "pending" }));
    expect(await recoverStuck(true)).toBe(2);
    expect([...queue.values()].map((i) => (i as QueueItem).status)).toEqual(["pending", "pending", "pending"]);
    expect((queue.get("o-1") as QueueItem).sending_at).toBeUndefined();
  });

  it("while running leaves a push in flight alone and recovers one older than two minutes or with no start time", async () => {
    queue.set("o-1", item({ status: "sending", sending_at: Date.now() - 30_000 }));
    queue.set("o-2", item({ id: "o-2", status: "sending", sending_at: Date.now() - 3 * 60_000 }));
    queue.set("o-3", item({ id: "o-3", status: "sending" }));
    expect(await recoverStuck()).toBe(2);
    expect((queue.get("o-1") as QueueItem).status).toBe("sending");
    expect((queue.get("o-2") as QueueItem).status).toBe("pending");
    expect((queue.get("o-3") as QueueItem).status).toBe("pending");
  });
});
