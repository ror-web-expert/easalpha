import { describe, expect, it } from "vitest";
import { bumpItemRequest, bumpRequest, dealParts, doneAtStation, doneHere, isSplitDeal, linesText } from "./kitchen-bump";

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
    expect(bumpItemRequest("i1", "drinks")).toEqual({ path: "/kitchen/items/i1/bump", body: { station_id: "drinks" } });
    expect(bumpItemRequest("i1", "")).toEqual({ path: "/kitchen/items/i1/bump" });
  });

  it("says a station is done while the order waits for another one", () => {
    const grill = (status: string) => ({ status, station_id: "grill" });
    expect(doneAtStation("grill", "preparing", [grill("ready"), grill("ready")])).toBe(true);
    expect(doneAtStation("grill", "preparing", [grill("ready"), grill("sent")])).toBe(false);
    expect(doneAtStation("grill", "ready", [grill("ready")])).toBe(false);
    expect(doneAtStation("", "preparing", [grill("ready")])).toBe(false);
    expect(doneAtStation("grill", "preparing", [])).toBe(false);
    // Another station's line does not hold the grill.
    expect(doneAtStation("grill", "preparing", [grill("ready"), { status: "sent", station_id: "drinks" }])).toBe(true);
    expect(doneAtStation("grill", "preparing", [{ status: "sent", station_id: "drinks" }])).toBe(false);
  });
});

// Leftovers of 7 Nov 2026 (L3): a deal showed as one line, and only the station of its first part could bump it.
describe("a deal on the kitchen display", () => {
  const part = (name: string, station_id: string | null, quantity = 1, bumped_at: string | null = null) => ({ name, station_id, quantity, product_id: `p-${name}`, variant_id: null, bumped_at });
  // A Lunch Box kept by the grill (its first part), with a chai from the drinks station and a sauce from no station.
  const box = (status = "sent", over: { quantity?: string; parts?: Record<string, unknown>[] } = {}) => ({
    status, quantity: over.quantity ?? "2.0", deal_id: "deal-1", station_id: "grill",
    deal_components: over.parts ?? [part("Zinger Burger", "grill"), part("Chai", "drinks", 2), part("Raita", null)],
  });

  it("lists this station's parts on its screen and every part on All stations, counted for the whole line", () => {
    expect(dealParts(box(), "drinks")).toEqual([{ name: "Chai", quantity: 4, station_id: "drinks", ready: false }]);
    expect(dealParts(box(), "grill").map((p) => [p.name, p.quantity])).toEqual([["Zinger Burger", 2]]);
    expect(dealParts(box(), null).map((p) => [p.name, p.station_id])).toEqual([["Zinger Burger", "grill"], ["Chai", "drinks"], ["Raita", null]]);
    expect(dealParts({ status: "sent", quantity: "1", station_id: "grill", deal_id: null, deal_components: [] }, null)).toEqual([]);
  });

  it("shows a part ready once its station bumped it, and every part once the line is ready", () => {
    const drinksDone = box("sent", { parts: [part("Zinger Burger", "grill"), part("Chai", "drinks", 1, "2026-11-07T09:00:00Z")] });
    expect(dealParts(drinksDone, null).map((p) => p.ready)).toEqual([false, true]);
    expect(dealParts(box("ready"), null).every((p) => p.ready)).toBe(true);
    expect(doneHere(drinksDone, "drinks")).toBe(true);
    expect(doneHere(drinksDone, "grill")).toBe(false);
    expect(doneHere(drinksDone, "")).toBe(false); // All stations: the line is not ready yet
  });

  it("holds a station only for its own parts of a deal made at several stations", () => {
    const drinksDone = box("sent", { parts: [part("Zinger Burger", "grill"), part("Chai", "drinks", 1, "2026-11-07T09:00:00Z")] });
    expect(isSplitDeal(drinksDone)).toBe(true);
    expect(doneAtStation("drinks", "preparing", [drinksDone])).toBe(true);
    expect(doneAtStation("grill", "preparing", [drinksDone])).toBe(false); // the box is the grill's line, its burger still cooks
    expect(doneAtStation("drinks", "preparing", [box()])).toBe(false);
    // A deal made at one station is that station's line, as any other.
    const oneStation = box("ready", { parts: [part("Zinger Burger", "grill"), part("Fries", "grill")] });
    expect(isSplitDeal(oneStation)).toBe(false);
    expect(doneAtStation("grill", "preparing", [oneStation])).toBe(true);
  });
});
