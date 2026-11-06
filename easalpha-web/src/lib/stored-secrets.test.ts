import { beforeEach, describe, expect, it } from "vitest";
import type { Branch, Session } from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { useDeviceStore } from "@/store/device";
import { useRiderStore } from "@/components/rider/store";
import { cleanBranch, scrubStoredSecrets } from "./stored-secrets";

// S1: a till paired, or an admin signed in, while the API still sent the branch's tax token keeps it in localStorage.
const branch = { id: "b1", name: "Main", tax_registration: { authority: "pra", ntn: "1234567-8", token: "QA-PRA-SECRET-TOKEN-42" } } as unknown as Branch;
const session = { access_token: "a", refresh_token: "r", app: "pos", membership: { id: "m1" }, user: { name: "Ali" }, permissions: [], branch } as unknown as Session;
const persisted = (state: Record<string, unknown>) => JSON.stringify({ state, version: 0 });

beforeEach(() => {
  localStorage.clear();
  useDeviceStore.setState({ branch: null, session: null, deviceToken: null });
  useAuthStore.setState({ session: null });
  useRiderStore.setState({ branch: null, session: null });
});

describe("cleanBranch", () => {
  it("keeps the authority and the numbers, and hands back the same record when it was clean", () => {
    expect(cleanBranch(branch)?.tax_registration).toEqual({ authority: "pra", ntn: "1234567-8" });
    const clean = { ...branch, tax_registration: { authority: "pra", ntn: "1234567-8" } };
    expect(cleanBranch(clean)).toBe(clean);
    expect(cleanBranch(null)).toBeNull();
  });
});

describe("scrubStoredSecrets", () => {
  it("cleans the till's branch and its PIN session's branch as the store loads, and writes localStorage again", async () => {
    localStorage.setItem("easalpha.device", persisted({ deviceToken: "tok", device: null, business: null, branch, session, lockMinutes: 5 }));
    const stop = scrubStoredSecrets();
    await useDeviceStore.persist.rehydrate();
    expect(useDeviceStore.getState().branch?.tax_registration).toEqual({ authority: "pra", ntn: "1234567-8" });
    expect(useDeviceStore.getState().session?.branch?.tax_registration).toEqual({ authority: "pra", ntn: "1234567-8" });
    expect(useDeviceStore.getState().deviceToken).toBe("tok");
    expect(localStorage.getItem("easalpha.device")).not.toContain("SECRET");
    stop();
  });

  it("cleans the admin login, and a rider store that loaded first", async () => {
    localStorage.setItem("easalpha.auth", persisted({ session, branchId: "b1" }));
    localStorage.setItem("easalpha.rider", persisted({ deviceToken: "rt", device: null, business: null, branch, session: null, cache: null }));
    await useRiderStore.persist.rehydrate();
    const stop = scrubStoredSecrets();
    await useAuthStore.persist.rehydrate();
    expect(localStorage.getItem("easalpha.auth")).not.toContain("SECRET");
    expect(localStorage.getItem("easalpha.rider")).not.toContain("SECRET");
    expect(useAuthStore.getState().session?.access_token).toBe("a");
    stop();
  });
});
