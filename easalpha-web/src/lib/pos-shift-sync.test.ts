import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Shift } from "@/lib/types";

// A shift opened and closed with no internet: both records reach the sync queue, which keeps one record per id. The
// close used the shift's id, the open's too, so it replaced the open and the server never heard of the shift (its
// float, its cash sales and payouts all went with it). Final round, sync package.
const h = vi.hoisted(() => ({ queued: [] as { type: string; id: string; payload: Record<string, unknown> }[], shift: null as unknown }));
vi.mock("@/lib/sync", () => ({
  isOnline: () => false,
  reachabilityUnknown: () => false,
  probeHealth: async () => false,
  noteNetworkFailure: () => {},
  isQueued: async (id: string) => h.queued.some((r) => r.id === id),
  processQueue: async () => undefined,
  patchQueued: async () => false,
  enqueue: async (r: { type: string; id: string; payload: Record<string, unknown> }) => {
    const i = h.queued.findIndex((q) => q.id === r.id);
    if (i >= 0) h.queued.splice(i, 1);
    h.queued.push(r);
  },
}));
vi.mock("@/lib/db", () => ({ db: {}, kvGet: async () => undefined, kvSet: async () => undefined }));
vi.mock("@/store/catalog", () => ({ useCatalogStore: { getState: () => ({ catalog: null, paymentMethods: [], shift: h.shift, setShift: (s: unknown) => { h.shift = s; } }) } }));
vi.mock("@/store/device", () => ({ useDeviceStore: { getState: () => ({ device: { id: "d-1" }, branch: { id: "b-1", day_end_time: "02:01" }, session: { membership: { id: "m-1" } }, business: null }) } }));

import { closeShift, openShift } from "./pos-actions";

beforeEach(() => { h.queued.length = 0; h.shift = null; });

describe("a shift opened and closed offline", () => {
  it("queues the close under its own id, naming the shift, so the open is still there to go first", async () => {
    const { shift } = await openShift(100_000);
    await closeShift(shift as Shift, 100_000, { "1000": 100 }, "");
    expect(h.queued.map((r) => r.type)).toEqual(["shift_open", "shift_close"]);
    const [open, close] = h.queued;
    expect(open.id).toBe(shift.id);
    expect(close.id).not.toBe(shift.id);
    expect(close.payload).toMatchObject({ shift_id: shift.id, counted_cash_minor: 100_000 });
  });
});
