import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/types";
import { riderApi } from "./api";
import { flushOutbox, useOutbox } from "./outbox";
import { useRiderStore } from "./store";

const session = (token: string, refresh = "r1") => ({ access_token: token, refresh_token: refresh, app: "rider", membership: { id: "m1" } }) as unknown as Session;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
type Call = { url: string; auth: string | null; body: unknown };

function stubFetch(handler: (url: string, init: RequestInit, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    calls.push({ url, auth: headers.get("Authorization"), body: init.body ? JSON.parse(String(init.body)) : null });
    return handler(url, init, calls.length);
  }));
  return calls;
}

beforeEach(() => { useRiderStore.setState({ deviceToken: "dev", session: session("old"), cache: null }); useOutbox.setState({ items: [] }); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("riderApi", () => {
  it("renews an expired session with the refresh token and repeats the request, instead of signing the rider out", async () => {
    const calls = stubFetch((url, _i, n) => {
      if (url.endsWith("/auth/refresh")) return json(200, session("new", "r2"));
      return n === 1 ? json(401, { error: { code: "auth.expired", message: "expired" } }) : json(200, { ok: true });
    });
    await expect(riderApi("/rider/deliveries")).resolves.toEqual({ ok: true });
    expect(calls.map((c) => c.url.replace(/^.*\/api\/v1/, ""))).toEqual(["/rider/deliveries", "/auth/refresh", "/rider/deliveries"]);
    expect(calls[1].body).toEqual({ refresh_token: "r1" });
    expect(calls[2].auth).toBe("Bearer new");
    expect(useRiderStore.getState().session?.refresh_token).toBe("r2");
  });

  it("signs out only when the refresh token is refused", async () => {
    stubFetch((url) => (url.endsWith("/auth/refresh") ? json(401, { error: { code: "refresh.invalid" } }) : json(401, { error: { code: "auth.expired", message: "expired" } })));
    await expect(riderApi("/rider/deliveries")).rejects.toMatchObject({ status: 401 });
    expect(useRiderStore.getState().session).toBeNull();
  });

  it("keeps the rider signed in when there is no signal for the refresh", async () => {
    stubFetch((url) => { if (url.endsWith("/auth/refresh")) throw new TypeError("Failed to fetch"); return json(401, { error: { code: "auth.expired" } }); });
    await expect(riderApi("/rider/deliveries")).rejects.toMatchObject({ status: 0 });
    expect(useRiderStore.getState().session?.access_token).toBe("old");
  });
});

describe("flushOutbox", () => {
  const add = (id: string, deliveryId: string, to: "picked_up" | "delivered", membershipId = "m1") => useOutbox.getState().add({ id, deliveryId, orderLabel: `#${deliveryId}`, to, occurredAt: "2026-10-17T10:00:00.000Z", membershipId, attempts: 0 });

  it("keeps everything in order while there is no signal, then sends it all in order", async () => {
    add("a", "d1", "picked_up"); add("b", "d1", "delivered");
    stubFetch(() => { throw new TypeError("Failed to fetch"); });
    const offline = await flushOutbox();
    expect(offline).toMatchObject({ sent: [], waiting: 2 });
    expect(useOutbox.getState().items.map((i) => [i.id, i.attempts])).toEqual([["a", 1], ["b", 0]]);
    const calls = stubFetch(() => json(200, {}));
    const online = await flushOutbox();
    expect(online.sent.map((i) => i.id)).toEqual(["a", "b"]);
    expect(calls.map((c) => (c.body as { status: string }).status)).toEqual(["picked_up", "delivered"]);
    expect(useOutbox.getState().items).toEqual([]);
  });

  it("drops a tap the shop already changed and carries on; leaves another rider's taps alone", async () => {
    add("a", "d1", "picked_up"); add("x", "d9", "picked_up", "someone-else"); add("b", "d2", "picked_up");
    stubFetch((url) => (url.includes("/d1/") ? json(409, { error: { code: "delivery.status", message: "Cannot go from delivered to picked_up" } }) : json(200, {})));
    const r = await flushOutbox();
    expect(r.dropped.map((d) => [d.item.id, d.status])).toEqual([["a", 409]]);
    expect(r.sent.map((i) => i.id)).toEqual(["b"]);
    expect(useOutbox.getState().items.map((i) => i.id)).toEqual(["x"]);
  });
});
