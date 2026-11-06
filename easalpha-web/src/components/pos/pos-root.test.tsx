import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Device, Session } from "@/lib/types";

// The till's root with the sync engine, the catalogue and the customer list stubbed: what matters here is which paired
// devices start them once someone signs in (review R4: a kitchen display signing in got 403 from /sync/customers).
const h = vi.hoisted(() => ({
  startSync: vi.fn(() => () => {}),
  pullChanges: vi.fn(async () => {}),
  refresh: vi.fn(async () => {}),
  downloadIfStale: vi.fn(async () => {}),
  catalog: null as unknown,
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/pos", useRouter: () => ({ replace: () => {}, push: () => {} }) }));
vi.mock("@/lib/sync", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/sync")>()), startSync: h.startSync, pullChanges: h.pullChanges }));
vi.mock("@/lib/pos-actions", () => ({ loadCurrentShift: vi.fn(async () => {}), pruneOldOrders: vi.fn(async () => {}) }));
vi.mock("@/store/catalog", () => {
  const state = () => ({ catalog: h.catalog, loaded: true, loadLocal: async () => {}, refresh: h.refresh });
  return { useCatalogStore: Object.assign((sel: (s: ReturnType<typeof state>) => unknown) => sel(state()), { getState: state }), clearTillData: async () => {} };
});
vi.mock("@/store/customers", () => ({ useCustomerStore: { getState: () => ({ load: async () => {}, downloadIfStale: h.downloadIfStale }) } }));

import { PosRoot } from "./pos-root";
import { useDeviceStore } from "@/store/device";

const session = { access_token: "a", refresh_token: "r", app: "pos", user: { name: "Bilal" }, membership: { id: "m-1" }, permissions: ["orders.create"] } as unknown as Session;
const device = (kind: string) => ({ id: `d-${kind}`, code: "D1", name: kind, kind }) as unknown as Device;

function signedIn(kind: string | null, app = "pos") {
  useDeviceStore.setState({ hydrated: true, deviceToken: "device-token", device: kind ? device(kind) : null, session: { ...session, app } as Session });
  render(<PosRoot><p>till</p></PosRoot>);
}

beforeEach(() => {
  for (const f of [h.startSync, h.pullChanges, h.refresh, h.downloadIfStale]) f.mockClear();
  h.catalog = null;
});
afterEach(() => { cleanup(); useDeviceStore.setState({ session: null, deviceToken: null, device: null }); });

describe("the till's sync after a PIN sign-in", () => {
  it.each(["till", "tablet", "kiosk"])("starts the queue, the catalogue and the customer download on a %s", async (kind) => {
    signedIn(kind);
    await waitFor(() => expect(h.startSync).toHaveBeenCalledTimes(1));
    expect(h.refresh).toHaveBeenCalledTimes(1); // no catalogue yet: the whole download
    expect(h.downloadIfStale).toHaveBeenCalledTimes(1);
  });

  it("pulls the changes when the catalogue is already here", async () => {
    h.catalog = { business: { settings: {} } };
    signedIn("till");
    await waitFor(() => expect(h.pullChanges).toHaveBeenCalledTimes(1));
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it.each([["kitchen", "kitchen"], ["rider", "rider"], ["token_screen", "pos"], ["customer_display", "pos"]])("starts none of it on a %s device", async (kind, app) => {
    signedIn(kind, app);
    await new Promise((r) => setTimeout(r, 20));
    expect(h.startSync).not.toHaveBeenCalled();
    expect(h.refresh).not.toHaveBeenCalled();
    expect(h.pullChanges).not.toHaveBeenCalled();
    expect(h.downloadIfStale).not.toHaveBeenCalled();
  });

  it("treats a device stored without a kind as the till it was paired as", async () => {
    signedIn(null);
    await waitFor(() => expect(h.startSync).toHaveBeenCalledTimes(1));
  });

  // Final round, web-till#4: every token refresh stored a new session and restarted sync under a push still out.
  it("keeps sync running through a token refresh, and starts it again for the next person signed in", async () => {
    const stop = vi.fn();
    h.startSync.mockImplementation(() => stop);
    signedIn("till");
    await waitFor(() => expect(h.startSync).toHaveBeenCalledTimes(1));
    act(() => useDeviceStore.setState({ session: { ...session, access_token: "a2", refresh_token: "r2" } as Session }));
    await new Promise((r) => setTimeout(r, 20));
    expect(h.startSync).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    act(() => useDeviceStore.setState({ session: { ...session, membership: { id: "m-2" } } as unknown as Session }));
    await waitFor(() => expect(h.startSync).toHaveBeenCalledTimes(2));
    expect(stop).toHaveBeenCalledTimes(1);
    h.startSync.mockImplementation(() => () => {});
  });
});
