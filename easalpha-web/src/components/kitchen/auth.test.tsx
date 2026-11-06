import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Device, Session } from "@/lib/types";

// Final round, contracts#7 and deploy#8: a kitchen, queue or token screen in a window of a till with nobody signed in.
// The API takes the till's own token for the queue and token lists only; the kitchen display needs a session, and a
// manager logged in on the browser comes before the till's token.
const h = vi.hoisted(() => ({ path: "/kitchen", push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => h.path, useRouter: () => ({ push: h.push, replace: () => {} }) }));
vi.mock("@/store/catalog", () => ({ clearTillData: async () => {} }));
vi.mock("@/lib/sync", () => ({ confirmDiscardUnsynced: async () => true }));

import { KitchenGate, useKitchenToken } from "./auth";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { useDeviceStore } from "@/store/device";

const device = (kind: string) => ({ id: `d-${kind}`, code: "D1", name: kind, kind }) as unknown as Device;
const pos = { access_token: "pos-session", refresh_token: "r", app: "pos", membership: { id: "m-1" } } as unknown as Session;
const admin = { access_token: "admin-session", refresh_token: "r2", app: "admin", membership: { id: "m-9" } } as unknown as Session;

function Token() {
  const t = useKitchenToken();
  return <p data-testid="token">{`${t.token}|${t.tillOnly}`}</p>;
}
const tokenShown = () => { render(<Token />); return screen.getByTestId("token").textContent; };

beforeEach(() => {
  useDeviceStore.setState({ hydrated: true, deviceToken: "device-token", device: device("till"), session: null });
  useAuthStore.setState({ hydrated: true, session: null });
  h.path = "/kitchen";
  h.push.mockClear();
});
afterEach(() => { cleanup(); useDeviceStore.setState({ deviceToken: null, device: null, session: null }); useAuthStore.setState({ session: null }); vi.unstubAllGlobals(); });

describe("useKitchenToken", () => {
  it("takes the cashier's session, then a manager logged in here before a till's own token", () => {
    useDeviceStore.setState({ session: pos });
    useAuthStore.setState({ session: admin });
    expect(tokenShown()).toBe("pos-session|false");
    cleanup();
    useDeviceStore.setState({ session: null });
    expect(tokenShown()).toBe("admin-session|false");
    cleanup();
    useAuthStore.setState({ session: null });
    expect(tokenShown()).toBe("device-token|true");
  });

  it("keeps a kitchen or token screen's own token first", () => {
    useDeviceStore.setState({ device: device("kitchen") });
    useAuthStore.setState({ session: admin });
    expect(tokenShown()).toBe("device-token|false");
  });
});

describe("KitchenGate", () => {
  it("asks for a PIN instead of a board that never loads, on a till's kitchen display with nobody signed in", () => {
    render(<KitchenGate title="Kitchen display"><p>board</p></KitchenGate>);
    expect(screen.queryByText("board")).toBeNull();
    screen.getByRole("button", { name: "Sign in with a PIN" }).click();
    expect(h.push).toHaveBeenCalledWith("/pos/pin");
  });

  it("opens the queue and token screens on the till's own token, and the kitchen display once someone is signed in", () => {
    h.path = "/queue";
    render(<KitchenGate title="Queue screen"><p>queue</p></KitchenGate>);
    expect(screen.getByText("queue")).toBeTruthy();
    cleanup();
    h.path = "/kitchen";
    useDeviceStore.setState({ session: pos });
    render(<KitchenGate title="Kitchen display"><p>board</p></KitchenGate>);
    expect(screen.getByText("board")).toBeTruthy();
  });
});

describe("api on the kitchen screens", () => {
  it("sends a manager's login rather than a till's own token, and a kitchen screen's own token", async () => {
    const seen: (string | null)[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => { seen.push(new Headers(init.headers).get("Authorization")); return new Response("{}", { status: 200 }); }));
    window.history.pushState({}, "", "/kitchen");
    useAuthStore.setState({ session: admin });
    await api("/kitchen/orders");
    useDeviceStore.setState({ device: device("kitchen") });
    await api("/kitchen/orders");
    useAuthStore.setState({ session: null });
    useDeviceStore.setState({ device: device("till") });
    await api("/kitchen/queue");
    expect(seen).toEqual(["Bearer admin-session", "Bearer device-token", "Bearer device-token"]);
    window.history.pushState({}, "", "/");
  });
});
