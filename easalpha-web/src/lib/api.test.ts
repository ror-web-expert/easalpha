import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { useDeviceStore } from "@/store/device";
import { adoptSavedSession, api, shareSessionAcrossTabs } from "./api";

// Review R28: two tabs of one till break each other's session. Refresh tokens are spent on use and both tabs start from
// the session saved in localStorage, so the tab that refreshed second used to send a spent token and was signed out.
const session = (refresh: string, over: Partial<Session> = {}) =>
  ({ access_token: `access-${refresh}`, refresh_token: refresh, app: "pos", user: { name: "Bilal" }, membership: { id: "m-1" }, branch: { id: "b-main" }, permissions: [], ...over }) as unknown as Session;
/** What another tab's store writes when its session changes (zustand persist's JSON). */
const savedByOtherTab = (key: string, s: Session | null) => localStorage.setItem(key, JSON.stringify({ state: { session: s }, version: 0 }));

let calls: { url: string; auth: string | null; body: unknown }[] = [];
let refreshAnswer: (token: string) => Session | null;

beforeEach(() => {
  calls = [];
  localStorage.clear();
  refreshAnswer = (token) => session(`${token}+1`);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const auth = new Headers(init.headers).get("Authorization");
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, auth, body });
    if (url.endsWith("/auth/refresh")) {
      const next = refreshAnswer(body.refresh_token);
      return next ? new Response(JSON.stringify(next), { status: 200 }) : new Response(JSON.stringify({ error: { code: "refresh.invalid" } }), { status: 401 });
    }
    // The access token the test calls fresh is the one the API accepts.
    return auth?.includes("+1") ? new Response(JSON.stringify({ ok: true }), { status: 200 }) : new Response(JSON.stringify({ error: { code: "token.expired" } }), { status: 401 });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  useDeviceStore.setState({ session: null, deviceToken: null });
  useAuthStore.setState({ session: null, branchId: null });
});

describe("a till open in two tabs", () => {
  it("refreshes with the newer pair the other tab saved, not the token that tab already spent", async () => {
    useDeviceStore.setState({ deviceToken: "device", session: session("A") });
    savedByOtherTab("easalpha.device", session("B")); // the other tab refreshed A into B
    await expect(api("/orders", { auth: "pos" })).resolves.toEqual({ ok: true });
    expect(calls.find((c) => c.url.endsWith("/auth/refresh"))?.body).toEqual({ refresh_token: "B" });
    expect(useDeviceStore.getState().session?.refresh_token).toBe("B+1");
    expect(calls.at(-1)?.auth).toBe("Bearer access-B+1");
  });

  it("takes the other tab's new pair as soon as it is saved", () => {
    const stop = shareSessionAcrossTabs();
    useDeviceStore.setState({ deviceToken: "device", session: session("A") });
    savedByOtherTab("easalpha.device", session("B"));
    window.dispatchEvent(new StorageEvent("storage", { key: "easalpha.device" }));
    expect(useDeviceStore.getState().session?.refresh_token).toBe("B");
    stop();
  });

  it("leaves this tab alone when the other tab locked or another cashier signed in there", () => {
    useDeviceStore.setState({ deviceToken: "device", session: session("A") });
    savedByOtherTab("easalpha.device", null);
    expect(adoptSavedSession("pos")).toBe(false);
    savedByOtherTab("easalpha.device", session("Z", { membership: { id: "m-2" } } as Partial<Session>));
    expect(adoptSavedSession("pos")).toBe(false);
    expect(useDeviceStore.getState().session?.refresh_token).toBe("A");
  });

  it("shares one refresh between requests that fail together", async () => {
    useDeviceStore.setState({ deviceToken: "device", session: session("A") });
    await Promise.all([api("/orders", { auth: "pos" }), api("/me", { auth: "pos" })]);
    expect(calls.filter((c) => c.url.endsWith("/auth/refresh"))).toHaveLength(1);
  });

  it("refreshes again after a refresh that ended at once (the till locked while a request was out)", async () => {
    useDeviceStore.setState({ deviceToken: "device", session: session("A") });
    const fetchMock = vi.mocked(fetch);
    const real = fetchMock.getMockImplementation()!;
    // The first request's 401 arrives after the till was locked: nothing to refresh with, so that request fails.
    fetchMock.mockImplementationOnce(async () => { useDeviceStore.setState({ session: null }); return new Response("{}", { status: 401 }); });
    await expect(api("/orders", { auth: "pos" })).rejects.toMatchObject({ status: 401 });
    fetchMock.mockImplementation(real);
    useDeviceStore.setState({ session: session("C") }); // the cashier signs in again
    await expect(api("/orders", { auth: "pos" })).resolves.toEqual({ ok: true });
    expect(calls.filter((c) => c.url.endsWith("/auth/refresh")).map((c) => c.body)).toEqual([{ refresh_token: "C" }]);
  });

  it("locks the till when the refresh is refused", async () => {
    refreshAnswer = () => null;
    useDeviceStore.setState({ deviceToken: "device", session: session("A") });
    await expect(api("/orders", { auth: "pos" })).rejects.toMatchObject({ status: 401 });
    expect(useDeviceStore.getState().session).toBeNull();
  });
});

describe("the admin open in two tabs", () => {
  it("follows the other tab's refresh, and a refresh keeps the branch picked in the top bar", async () => {
    useAuthStore.setState({ session: session("A", { app: "admin" }), branchId: "b-2" });
    savedByOtherTab("easalpha.auth", session("B", { app: "admin" }));
    await expect(api("/reports/sales", { auth: "admin" })).resolves.toEqual({ ok: true });
    expect(calls.find((c) => c.url.endsWith("/auth/refresh"))?.body).toEqual({ refresh_token: "B" });
    expect(useAuthStore.getState()).toMatchObject({ branchId: "b-2", session: { refresh_token: "B+1" } });
  });
});
