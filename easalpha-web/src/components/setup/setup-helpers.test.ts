import { describe, expect, it } from "vitest";
import { canSetUpDevices, defaultDeviceName, existingScreen, ROLE_OPTIONS, roleOption, sortStaffForSetup, validPin } from "./setup-helpers";

describe("setup helpers", () => {
  it("offers one role per screen a machine can be, each with a kind the API knows", () => {
    expect(ROLE_OPTIONS.map((r) => r.role)).toEqual(["till", "tablet", "kitchen", "token", "queue", "rider", "canteen", "counter"]);
    for (const r of ROLE_OPTIONS) expect(["till", "tablet", "kitchen", "token_screen", "rider", "kiosk"]).toContain(r.kind);
    expect(roleOption("rider").store).toBe("rider");
    expect(roleOption("kitchen").login).toBe(false);
    // 29 Oct 2026: the canteen kiosk and counter are kiosk devices that open their own screens
    expect(roleOption("canteen")).toMatchObject({ kind: "kiosk", screen: "/canteen", login: false });
    expect(roleOption("counter")).toMatchObject({ kind: "kiosk", screen: "/canteen/serve", login: false });
    expect(existingScreen({ deviceKind: "kiosk", riderPaired: false, screenChoice: "/canteen/serve" })).toBe("/canteen/serve");
    expect(existingScreen({ deviceKind: "kiosk", riderPaired: false, screenChoice: null })).toBe("/canteen");
  });

  it("names the device after its role with the next free number at the branch", () => {
    const existing = [
      { name: "Counter 1", kind: "till", revoked_at: null },
      { name: "counter 2", kind: "till", revoked_at: null },
      { name: "Counter 3", kind: "till", revoked_at: "2026-10-01" },
      { name: "Kitchen 1", kind: "kitchen", revoked_at: null },
    ];
    expect(defaultDeviceName("till", existing)).toBe("Counter 3");
    expect(defaultDeviceName("kitchen", existing)).toBe("Kitchen 2");
    expect(defaultDeviceName("token", existing)).toBe("Token screen 1");
    expect(defaultDeviceName("rider", [])).toBe("Rider phone 1");
  });

  it("needs the devices permission", () => {
    expect(canSetUpDevices(["devices.manage", "orders.create"])).toBe(true);
    expect(canSetUpDevices(["orders.create"])).toBe(false);
    expect(canSetUpDevices(undefined)).toBe(false);
  });

  it("sends an already set-up browser to its screen", () => {
    expect(existingScreen({ deviceKind: null, riderPaired: false, screenChoice: null })).toBeNull();
    expect(existingScreen({ deviceKind: "till", riderPaired: false, screenChoice: null })).toBe("/pos");
    expect(existingScreen({ deviceKind: "tablet", riderPaired: false, screenChoice: null })).toBe("/pos");
    expect(existingScreen({ deviceKind: "kitchen", riderPaired: false, screenChoice: null })).toBe("/kitchen");
    expect(existingScreen({ deviceKind: "token_screen", riderPaired: false, screenChoice: null })).toBe("/token");
    expect(existingScreen({ deviceKind: "token_screen", riderPaired: false, screenChoice: "/queue" })).toBe("/queue");
    expect(existingScreen({ deviceKind: "till", riderPaired: true, screenChoice: null })).toBe("/rider");
  });

  it("lists people without a PIN first", () => {
    const s = sortStaffForSetup([{ name: "Zara", has_pin: true }, { name: "Bilal", has_pin: false }, { name: "Ali", has_pin: true }]);
    expect(s.map((x) => x.name)).toEqual(["Bilal", "Ali", "Zara"]);
  });

  it("accepts only four digits as a PIN", () => {
    expect(validPin("1234")).toBe(true);
    expect(validPin("123")).toBe(false);
    expect(validPin("12a4")).toBe(false);
  });
});
