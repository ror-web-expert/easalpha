import { webcrypto } from "node:crypto";
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/types";

if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto);

// K5 (QA of 6 Nov 2026): offline, Lock then PIN 4321 said "Cannot reach the server" and the counter stopped until the
// internet came back, while the badge said "Online". The page now shows the connection as it is, signs in with the
// server when it answers (keeping an encrypted copy of the session), and offline resumes the session whose copy the
// PIN opens. The real device store and session copies; the server, the probe and the router are stand-ins.
const h = vi.hoisted(() => ({ online: true, reachable: true, api: vi.fn(), router: { replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => h.router }));
vi.mock("@/lib/db", () => ({ db: {}, kvGet: async () => undefined, kvSet: async () => {} }));
vi.mock("@/store/catalog", () => {
  const state = { shift: null };
  return { useCatalogStore: Object.assign((sel: (s: typeof state) => unknown) => sel(state), { getState: () => state }), clearTillData: async () => {} };
});
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: (...a: unknown[]) => h.api(...a) }));
vi.mock("@/lib/sync", () => ({
  isOnline: () => h.online, probeHealth: async () => h.reachable, noteNetworkFailure: () => {}, unsyncedCount: async () => 0, processQueue: async () => {},
}));

import { ApiError } from "@/lib/api";
import { useDeviceStore } from "@/store/device";
import { useSyncStore } from "@/store/sync";
import { stashedMembers, stashSession } from "@/lib/session-stash";
import PinPage from "./page";

const cashier = { access_token: "access-1", refresh_token: "refresh-1", app: "pos", membership: { id: "m-1" }, user: { name: "Bilal" }, permissions: ["orders.create"], sync_key: "key-1", sync_key_id: "k-1" } as unknown as Session;
const type = (pin: string) => { for (const d of pin) fireEvent.keyDown(window, { key: d }); };

// Every offline try derives a key with 150,000 PBKDF2 rounds: room for a busy machine running the suite in parallel.
configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 30_000 });
const pinLogins = () => h.api.mock.calls.filter((c) => c[0] === "/devices/pin_login");

beforeEach(() => {
  localStorage.clear();
  h.online = true; h.reachable = true; h.api.mockReset(); h.router.replace.mockReset();
  useDeviceStore.setState({ deviceToken: "device", device: { id: "d-1", name: "Till", code: "T1" } as never, branch: { name: "Gulberg" } as never, session: null });
  useSyncStore.setState({ status: "online", lastError: null, pending: 0, attention: 0 });
});
afterEach(() => { cleanup(); useDeviceStore.setState({ session: null, device: null, deviceToken: null }); });

describe("PIN page", () => {
  it("shows the connection as it is: Offline when the server does not answer, though the last sync said Online", async () => {
    h.reachable = false;
    render(<PinPage />);
    expect(await screen.findByRole("status")).toHaveTextContent("Offline. Staff who signed in on this till while online can unlock it with their PIN.");
    expect(useSyncStore.getState().status).toBe("offline");
    expect(screen.getByRole("button", { name: /Offline/ })).toBeInTheDocument();
  });

  it("online: signs in with the server and keeps an encrypted copy of the session for an offline unlock", async () => {
    h.api.mockResolvedValue(cashier);
    render(<PinPage />);
    type("4321");
    await waitFor(() => expect(h.router.replace).toHaveBeenCalledWith("/pos"));
    expect(pinLogins()[0][1]).toMatchObject({ method: "POST", auth: "device", body: { pin: "4321" } });
    expect(useDeviceStore.getState().session).toMatchObject({ refresh_token: "refresh-1", sync_key_id: "k-1" });
    await waitFor(() => expect(stashedMembers("d-1")).toEqual(["m-1"]));
    // One sign-in for one PIN: the digits left on the pad used to be sent again before the page went.
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(pinLogins()).toHaveLength(1);
  });

  it("offline: the right PIN resumes the session from its copy without asking the server, a wrong one does not", async () => {
    await stashSession("4321", cashier, "d-1");
    h.online = false; h.reachable = false;
    render(<PinPage />);
    type("1234");
    expect(await screen.findByText(/That PIN did not open a sign-in kept on this till/)).toHaveTextContent("4 tries left");
    expect(useDeviceStore.getState().session).toBeNull();
    type("4321");
    await waitFor(() => expect(h.router.replace).toHaveBeenCalledWith("/pos"));
    expect(useDeviceStore.getState().session).toMatchObject({ access_token: "access-1", refresh_token: "refresh-1", sync_key: "key-1", membership: { id: "m-1" } });
    expect(pinLogins()).toHaveLength(0);
  });

  it("online with no answer from the server: falls back to the copy", async () => {
    await stashSession("4321", cashier, "d-1");
    h.api.mockRejectedValue(new ApiError("network", "Cannot reach the server", 0));
    render(<PinPage />);
    type("4321");
    await waitFor(() => expect(h.router.replace).toHaveBeenCalledWith("/pos"));
    expect(pinLogins()).toHaveLength(1);
    expect(useDeviceStore.getState().session?.membership.id).toBe("m-1");
  });

  it("five wrong PINs offline: a minute's wait, and even the right PIN waits", async () => {
    await stashSession("4321", cashier, "d-1");
    h.online = false; h.reachable = false;
    render(<PinPage />);
    for (const n of [4, 3, 2, 1]) {
      type("0000");
      expect(await screen.findByText(new RegExp(`${n} tr(y|ies) left`))).toBeInTheDocument();
    }
    type("0000");
    expect(await screen.findByText(/Too many wrong PINs while offline. Try again in 60 s/)).toBeInTheDocument();
    type("4321");
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(useDeviceStore.getState().session).toBeNull();
    expect(screen.getByText(/Try again in \d+ s/)).toBeInTheDocument();
  });

  it("online: a PIN the server refuses no longer opens the copy it used to", async () => {
    await stashSession("4321", cashier, "d-1"); // then a manager changed this cashier's PIN
    h.api.mockRejectedValue(new ApiError("pin.invalid", "Wrong PIN", 401));
    render(<PinPage />);
    type("4321");
    expect(await screen.findByText("Wrong PIN")).toBeInTheDocument();
    await waitFor(() => expect(stashedMembers("d-1")).toEqual([]));
    expect(useDeviceStore.getState().session).toBeNull();
  });
});
