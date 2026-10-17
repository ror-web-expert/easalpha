import { describe, expect, it } from "vitest";
import { applyOutbox, directionsUrl, newlyAssigned, outcomeFor, statusBody, type OutboxItem } from "./outbox-helpers";

const item = (p: Partial<OutboxItem>): OutboxItem => ({ id: "q1", deliveryId: "d1", orderLabel: "#12", to: "picked_up", occurredAt: "2026-10-17T10:00:00.000Z", membershipId: "m1", attempts: 0, ...p });

describe("outbox rules", () => {
  it("retries what can still succeed and drops what never will", () => {
    for (const status of [0, 401, 408, 429, 500, 502, 503]) expect(outcomeFor({ status }), String(status)).toBe("retry");
    for (const status of [400, 403, 404, 409, 422]) expect(outcomeFor({ status }), String(status)).toBe("drop");
    expect(outcomeFor(new Error("boom"))).toBe("retry");
  });

  it("sends the time of the tap, the cash, the reason and the position", () => {
    expect(statusBody(item({ to: "delivered", cashCollectedMinor: 125000, lat: 31.52, lng: 74.35 }))).toEqual({ status: "delivered", occurred_at: "2026-10-17T10:00:00.000Z", cash_collected_minor: 125000, lat: 31.52, lng: 74.35 });
    expect(statusBody(item({ to: "failed", note: "Not home" }))).toEqual({ status: "failed", occurred_at: "2026-10-17T10:00:00.000Z", note: "Not home" });
    expect(statusBody(item({ lat: 31.5 }))).not.toHaveProperty("lat");
    expect(statusBody(item({ cashCollectedMinor: 0, to: "delivered" }))).toHaveProperty("cash_collected_minor", 0);
  });

  it("shows queued taps on the cards in order, with the count still waiting", () => {
    const rows = [{ id: "d1", status: "assigned", picked_up_at: null, delivered_at: null, cash_collected_minor: null }, { id: "d2", status: "assigned" }];
    const out = applyOutbox(rows, [item({}), item({ id: "q2", to: "delivered", occurredAt: "2026-10-17T10:20:00.000Z", cashCollectedMinor: 90000 })]);
    expect(out[0]).toMatchObject({ status: "delivered", picked_up_at: "2026-10-17T10:00:00.000Z", delivered_at: "2026-10-17T10:20:00.000Z", cash_collected_minor: 90000, queued: 2 });
    expect(out[1]).toMatchObject({ status: "assigned", queued: 0 });
    expect(rows[0].status).toBe("assigned");
  });

  it("builds Google Maps directions from coordinates, else from the address", () => {
    expect(directionsUrl({ lat: 31.5, lng: 74.3 }, "Gulberg")).toBe("https://www.google.com/maps/dir/?api=1&destination=31.5,74.3&travelmode=driving");
    expect(directionsUrl({ lat: null, lng: null }, "161 P Block, Gulberg 3")).toBe("https://www.google.com/maps/dir/?api=1&destination=161%20P%20Block%2C%20Gulberg%203&travelmode=driving");
    expect(directionsUrl(null, "  ")).toBeNull();
  });

  it("announces only open deliveries that were not there before, and nothing on the first load", () => {
    expect(newlyAssigned(null, [{ id: "a", status: "assigned" }])).toEqual([]);
    expect(newlyAssigned(new Set(["a"]), [{ id: "a", status: "assigned" }, { id: "b", status: "assigned" }, { id: "c", status: "delivered" }])).toEqual(["b"]);
  });
});
