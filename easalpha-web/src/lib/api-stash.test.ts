import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/types";
import { useDeviceStore } from "@/store/device";
import { api } from "./api";
import { STASH_STORAGE_KEY, stashedMembers, stashSession, unlockStash } from "./session-stash";

if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto);
vi.setConfig({ testTimeout: 30_000 }); // PBKDF2 rounds on a busy machine

// K5: the copy of a till session kept for an offline unlock follows the session. Each refresh rewrites it with the new
// tokens (the sync key stays the same); a refresh the server refuses ends it.
const session = (refresh: string) =>
  ({ access_token: `access-${refresh}`, refresh_token: refresh, app: "pos", user: { name: "Bilal" }, membership: { id: "m-1" }, permissions: [], sync_key: "key", sync_key_id: "k-1" }) as unknown as Session;

let refreshAnswer: (token: string) => Session | null;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  refreshAnswer = (token) => session(`${token}+1`);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : null;
    if (url.endsWith("/auth/refresh")) {
      const next = refreshAnswer(body.refresh_token);
      return next ? new Response(JSON.stringify(next), { status: 200 }) : new Response(JSON.stringify({ error: { code: "refresh.invalid" } }), { status: 401 });
    }
    const auth = new Headers(init.headers).get("Authorization");
    return auth?.includes("+1") ? new Response(JSON.stringify({ ok: true }), { status: 200 }) : new Response(JSON.stringify({ error: { code: "token.expired" } }), { status: 401 });
  }));
  useDeviceStore.setState({ deviceToken: "device", device: { id: "d-1" } as never, session: session("A") });
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto);
  useDeviceStore.setState({ session: null, deviceToken: null, device: null });
});

describe("the offline-unlock copy across refreshes", () => {
  it("takes the refreshed tokens, so an unlock offline later resumes a session the server still knows", async () => {
    await stashSession("4321", session("A"), "d-1"); // the PIN sign-in
    const before = localStorage.getItem(STASH_STORAGE_KEY);
    await expect(api("/orders", { auth: "pos" })).resolves.toEqual({ ok: true });
    await vi.waitFor(() => expect(localStorage.getItem(STASH_STORAGE_KEY)).not.toBe(before), { timeout: 10_000 }); // rewritten
    expect(await unlockStash("4321", "d-1")).toMatchObject({ refresh_token: "A+1", sync_key_id: "k-1" });
  });

  it("is dropped when the server refuses the refresh: that session is over", async () => {
    await stashSession("4321", session("A"), "d-1");
    refreshAnswer = () => null;
    await expect(api("/orders", { auth: "pos" })).rejects.toMatchObject({ status: 401 });
    expect(stashedMembers("d-1")).toEqual([]);
    expect(useDeviceStore.getState().session).toBeNull();
  });

  it("stays when the refresh could not reach the server", async () => {
    await stashSession("4321", session("A"), "d-1");
    const real = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).endsWith("/auth/refresh")) throw new TypeError("Failed to fetch");
      return real(url as string, init as RequestInit);
    });
    await expect(api("/orders", { auth: "pos" })).rejects.toMatchObject({ status: 401 });
    expect(stashedMembers("d-1")).toEqual(["m-1"]);
  });
});
