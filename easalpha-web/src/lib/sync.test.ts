import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueItem } from "@/lib/db";

// The offline queue in memory: one record per id, as db.queue keeps it.
const queue = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/db", () => ({
  db: {
    queue: { get: async (id: string) => queue.get(id), put: async (item: { id: string }) => void queue.set(item.id, item), count: async () => queue.size },
    attention: { count: async () => 0 },
  },
}));

import { patchQueued } from "./sync";

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
