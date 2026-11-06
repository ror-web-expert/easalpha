import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/types";

if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto);
// Each copy costs 150,000 PBKDF2 rounds: room for a busy machine running the suite in parallel.
vi.setConfig({ testTimeout: 30_000 });

// clearTillData empties the till's IndexedDB: a stand-in that only needs clear().
vi.mock("@/lib/db", () => {
  const t = () => ({ clear: async () => {}, toArray: async () => [], count: async () => 0 });
  return { db: { kv: t(), orders: t(), queue: t(), attention: t(), customers: t() }, kvGet: async () => undefined, kvSet: async () => {} };
});

import { clearTillData } from "@/store/catalog";
import { useDeviceStore } from "@/store/device";
import {
  forgetStashes, forgetStashesOpenedBy, noteWrongOfflinePin, offlineWaitMs, OFFLINE_TRIES, OFFLINE_WAIT_MS, PBKDF2_ROUNDS, resetOfflineTries, restashSession,
  STASH_STORAGE_KEY, stashedMembers, stashSession, unlockStash,
} from "./session-stash";

// K5 (QA of 6 Nov 2026): offline, the till could not be unlocked at all. Each member who signs in online leaves an
// encrypted copy of their session that their PIN opens, and only their PIN.
const session = (member: string, refresh = "R1"): Session =>
  ({ access_token: `access-${member}-${refresh}`, refresh_token: `refresh-${member}-${refresh}`, app: "pos", membership: { id: member }, user: { name: member },
    permissions: ["orders.create"], sync_key: `key-${member}-secret`, sync_key_id: `k-${member}` }) as unknown as Session;
const file = () => JSON.parse(localStorage.getItem(STASH_STORAGE_KEY) ?? "{}") as Record<string, { salt: string; rounds: number; device_id: string; membership_id: string }>;

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("the copy of a session", () => {
  it("opens with the member's PIN and no other, and keeps no token or key in clear", async () => {
    await stashSession("4321", session("m-1"), "d-1");
    const raw = localStorage.getItem(STASH_STORAGE_KEY) ?? "";
    for (const secret of ["access-m-1", "refresh-m-1", "key-m-1-secret", "orders.create"]) expect(raw).not.toContain(secret);
    expect(await unlockStash("1234", "d-1")).toBeNull();
    expect(await unlockStash("4321", "d-1")).toMatchObject({ refresh_token: "refresh-m-1-R1", sync_key: "key-m-1-secret", sync_key_id: "k-m-1" });
  });

  it("is keyed by PBKDF2-SHA256 with at least 150,000 rounds and a new random salt for each copy", async () => {
    const derive = vi.spyOn(globalThis.crypto.subtle, "deriveKey");
    await stashSession("4321", session("m-1"), "d-1");
    await stashSession("5555", session("m-2"), "d-1");
    const firstSalt = file()["m-1"].salt;
    await stashSession("4321", session("m-1", "R2"), "d-1"); // signed in online again
    const params = derive.mock.calls.map((c) => c[0] as Pbkdf2Params);
    expect(params.every((p) => p.name === "PBKDF2" && p.hash === "SHA-256" && p.iterations >= 150_000)).toBe(true);
    expect(PBKDF2_ROUNDS).toBeGreaterThanOrEqual(150_000);
    expect(new Set([firstSalt, file()["m-2"].salt, file()["m-1"].salt]).size).toBe(3);
    expect((params[0].salt as Uint8Array).byteLength).toBe(16);
  });

  it("opens only on its own till and under its own member", async () => {
    await stashSession("4321", session("m-1"), "d-1");
    expect(await unlockStash("4321", "d-2")).toBeNull();
    const f = file();
    localStorage.setItem(STASH_STORAGE_KEY, JSON.stringify({ "m-9": { ...f["m-1"], membership_id: "m-9" } }));
    expect(await unlockStash("4321", "d-1")).toBeNull();
  });

  it("takes the new tokens at a refresh with no PIN typed, until the page is reloaded", async () => {
    await stashSession("4321", session("m-1"), "d-1");
    expect(await restashSession(session("m-1", "R2"), "d-1")).toBe(true);
    expect(await unlockStash("4321", "d-1")).toMatchObject({ refresh_token: "refresh-m-1-R2" });
    vi.resetModules(); // a reload: the key derived from the PIN lived in memory only
    const fresh = await import("./session-stash");
    expect(await fresh.restashSession(session("m-1", "R3"), "d-1")).toBe(false);
    expect(await fresh.unlockStash("4321", "d-1")).toMatchObject({ refresh_token: "refresh-m-1-R2" });
    // Unlocked offline, the key is known again, so the next refresh is kept.
    expect(await fresh.restashSession(session("m-1", "R4"), "d-1")).toBe(true);
  });
});

describe("forgetting copies", () => {
  it("drops the copy a refused PIN still opens, a member whose session the server ended, and every copy on unpair and a cleared till", async () => {
    await stashSession("4321", session("m-1"), "d-1");
    await stashSession("5555", session("m-2"), "d-1");
    await stashSession("6666", session("m-3"), "d-1");
    await forgetStashesOpenedBy("4321", "d-1"); // the server answered pin.invalid: the PIN was changed
    expect(stashedMembers("d-1").sort()).toEqual(["m-2", "m-3"]);
    forgetStashes(["m-2"]); // a refused refresh, or deactivated in the staff list
    expect(stashedMembers("d-1")).toEqual(["m-3"]);

    useDeviceStore.getState().unpair();
    expect(localStorage.getItem(STASH_STORAGE_KEY)).toBeNull();
    await stashSession("6666", session("m-3"), "d-1");
    await clearTillData();
    expect(localStorage.getItem(STASH_STORAGE_KEY)).toBeNull();
  });
});

describe("wrong PINs offline", () => {
  it("allows five, then waits a minute; tries during the wait neither count nor end it; a sign-in resets the count", () => {
    const t0 = 1_000_000;
    const left = Array.from({ length: OFFLINE_TRIES }, (_, i) => noteWrongOfflinePin(t0 + i));
    expect(left).toEqual([4, 3, 2, 1, 0]);
    expect(offlineWaitMs(t0 + 4)).toBe(OFFLINE_WAIT_MS);
    expect(noteWrongOfflinePin(t0 + 30_000)).toBe(0);
    expect(offlineWaitMs(t0 + 30_000)).toBe(OFFLINE_WAIT_MS - 30_000 + 4);
    expect(offlineWaitMs(t0 + 4 + OFFLINE_WAIT_MS)).toBe(0);
    expect(noteWrongOfflinePin(t0 + 5 + OFFLINE_WAIT_MS)).toBe(4);
    resetOfflineTries();
    expect(noteWrongOfflinePin(t0 + 6 + OFFLINE_WAIT_MS)).toBe(4);
  });
});
