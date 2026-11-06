import { describe, expect, it } from "vitest";
import { bumpRequest, doneAtStation, linesText } from "./kitchen-bump";

describe("ticket and rider lines", () => {
  it("shows whole quantities without a decimal and keeps a weight's", () => {
    expect(linesText([{ quantity: "1.0", name: "Chai" }, { quantity: "2.0", name: "Zinger Burger" }])).toBe("1 Chai, 2 Zinger Burger");
    expect(linesText([{ quantity: "0.5", name: "Mutton" }])).toBe("0.5 Mutton");
    expect(linesText([{ quantity: "1.0", name: "Chai" }], " x ")).toBe("1 x Chai");
  });
});

describe("Bump order on the kitchen display", () => {
  it("bumps the station the screen shows, and the whole order on the all-stations screen", () => {
    expect(bumpRequest("o1", "grill")).toEqual({ path: "/kitchen/orders/o1/bump", body: { station_id: "grill" } });
    expect(bumpRequest("o1", "")).toEqual({ path: "/kitchen/orders/o1/bump" });
    expect(bumpRequest("o1", null)).toEqual({ path: "/kitchen/orders/o1/bump" });
  });

  it("says a station is done while the order waits for another one", () => {
    const grill = (status: string) => ({ status, station_id: "grill" });
    expect(doneAtStation("grill", "preparing", [grill("ready"), grill("ready")])).toBe(true);
    expect(doneAtStation("grill", "preparing", [grill("ready"), grill("sent")])).toBe(false);
    expect(doneAtStation("grill", "ready", [grill("ready")])).toBe(false);
    expect(doneAtStation("", "preparing", [grill("ready")])).toBe(false);
    expect(doneAtStation("grill", "preparing", [])).toBe(false);
    // A deal with a part at the grill belongs to the drinks station that makes its first part: it does not hold the grill.
    expect(doneAtStation("grill", "preparing", [grill("ready"), { status: "sent", station_id: "drinks" }])).toBe(true);
    expect(doneAtStation("grill", "preparing", [{ status: "sent", station_id: "drinks" }])).toBe(false);
  });
});
