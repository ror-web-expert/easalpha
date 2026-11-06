import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// startSync on each kind of paired device, with the till's IndexedDB in memory and the API recorded (review R4: a
// kitchen display signed in on the till's PIN screen started the till's queue, change pull and customer download).
const h = vi.hoisted(() => {
  const table = () => {
    const m = new Map<string, unknown>();
    return {
      get: async (id: string) => m.get(id), put: async (row: { id: string }) => void m.set(row.id, row), bulkPut: async () => {}, delete: async (id: string) => void m.delete(id),
      count: async () => m.size, toArray: async () => [...m.values()], where: () => ({ equals: () => ({ toArray: async () => [] }) }),
    };
  };
  return { calls: [] as string[], db: { queue: table(), attention: table(), orders: table(), customers: table(), transaction: (_mode: string, _tables: unknown, fn: () => Promise<unknown>) => fn() } };
});
vi.mock("@/lib/db", () => ({ db: h.db, kvGet: async () => undefined, kvSet: async () => undefined }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: async (path: string) => { h.calls.push(path); return {}; } }));
vi.mock("@/store/customers", () => ({ useCustomerStore: { getState: () => ({ downloadIfStale: async () => { h.calls.push("/sync/customers"); } }) } }));

import { keepsTillData, startSync } from "./sync";
import { useDeviceStore } from "@/store/device";
import type { Device } from "@/lib/types";

let stop: () => void = () => {};
const pairedAs = (kind: string) => useDeviceStore.setState({ deviceToken: "device-token", device: { id: "d-1", code: "K1", name: kind, kind } as unknown as Device });

beforeEach(() => { vi.useFakeTimers(); h.calls.length = 0; });
afterEach(() => { stop(); vi.useRealTimers(); useDeviceStore.setState({ deviceToken: null, device: null }); });

describe("startSync", () => {
  it("on a till: heartbeat, the change pull and the customer download run", async () => {
    pairedAs("till");
    stop = startSync();
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1000);
    expect(h.calls).toContain("/devices/heartbeat");
    expect(h.calls).toContain("/catalog");
    expect(h.calls).toContain("/sync/customers");
  });

  it.each(["kitchen", "rider", "token_screen", "customer_display"])("on a %s device: nothing starts, online or not", async (kind) => {
    pairedAs(kind);
    stop = startSync();
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1000);
    expect(h.calls).toEqual([]);
  });

  it("on a kiosk with pull: false: the queue only, never the catalogue or customers", async () => {
    pairedAs("kiosk");
    stop = startSync({ pull: false });
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1000);
    expect(h.calls).toContain("/devices/heartbeat");
    expect(h.calls).not.toContain("/catalog");
    expect(h.calls).not.toContain("/sync/customers");
  });
});

describe("keepsTillData", () => {
  it("is the API's till kinds, plus a device stored before kinds were", () => {
    expect(["till", "tablet", "kiosk", null, undefined].map(keepsTillData)).toEqual([true, true, true, true, true]);
    expect(["kitchen", "rider", "token_screen", "customer_display"].map(keepsTillData)).toEqual([false, false, false, false]);
  });
});
