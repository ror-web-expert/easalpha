import { describe, expect, it } from "vitest";
import {
  addressLine, assignedVsCompleted, dayEndNeedsForce, groupDeliveries, isCashOrder, lifetimeLabel, lifetimeNeedsValue, lifetimeRemaining, methodChips,
  riderActionPerms, riderExpired, riderNextSteps, tillNeedsSettlement, tillShiftsText,
} from "./riders-helpers";

const now = new Date("2026-10-11T12:00:00");

describe("lifetime", () => {
  it("labels each kind, with N for orders and hours", () => {
    expect(lifetimeLabel("one_order")).toBe("One order");
    expect(lifetimeLabel("n_orders", 3)).toBe("3 orders");
    expect(lifetimeLabel("rest_of_today")).toBe("Rest of today");
    expect(lifetimeLabel("n_hours", 4)).toBe("4 hours");
    expect(lifetimeLabel(null)).toBe("-");
  });
  it("only N orders and N hours need a value", () => {
    expect(lifetimeNeedsValue("n_orders")).toBe(true);
    expect(lifetimeNeedsValue("n_hours")).toBe(true);
    expect(lifetimeNeedsValue("one_order")).toBe(false);
    expect(lifetimeNeedsValue("rest_of_today")).toBe(false);
  });
  it("shows orders used against allowed", () => {
    expect(lifetimeRemaining({ temporary: true, orders_allowed: 3, orders_used: 1, expires_at: null }, now)).toBe("1 / 3 orders used");
  });
  it("shows the expiry time for the rest of today", () => {
    expect(lifetimeRemaining({ temporary: true, orders_allowed: null, orders_used: 0, expires_at: "2026-10-11T18:00:00" }, now)).toMatch(/^Expires \d{2}:\d{2}/);
  });
  it("reads Expired once the time or the orders run out", () => {
    expect(lifetimeRemaining({ temporary: true, orders_allowed: null, orders_used: 0, expires_at: "2026-10-11T11:00:00" }, now)).toBe("Expired");
    expect(lifetimeRemaining({ temporary: true, orders_allowed: 1, orders_used: 1, expires_at: null }, now)).toBe("Expired");
  });
  it("is a dash for permanent riders", () => {
    expect(lifetimeRemaining({ temporary: false, orders_allowed: null, orders_used: 0, expires_at: null }, now)).toBe("-");
  });
});

describe("riderExpired", () => {
  it("never expires a permanent rider", () => {
    expect(riderExpired({ temporary: false, expires_at: "2020-01-01T00:00:00", orders_allowed: 1, orders_used: 5 }, now)).toBe(false);
  });
  it("trusts the API flag and recomputes from time and orders", () => {
    expect(riderExpired({ temporary: true, expired: true, expires_at: null, orders_allowed: null, orders_used: 0 }, now)).toBe(true);
    expect(riderExpired({ temporary: true, expires_at: "2026-10-11T12:00:00", orders_allowed: null, orders_used: 0 }, now)).toBe(true);
    expect(riderExpired({ temporary: true, expires_at: "2026-10-11T12:00:01", orders_allowed: null, orders_used: 0 }, now)).toBe(false);
    expect(riderExpired({ temporary: true, expires_at: null, orders_allowed: 2, orders_used: 1 }, now)).toBe(false);
  });
});

describe("assignedVsCompleted", () => {
  it("formats as assigned / completed", () => {
    expect(assignedVsCompleted({ assigned_count: 12, completed_count: 10 })).toBe("12 / 10");
    expect(assignedVsCompleted({})).toBe("0 / 0");
  });
});

describe("riderActionPerms", () => {
  it("gates permanent riders on RIDER_* and temporary riders on DUMMY_RIDER_*", () => {
    expect(riderActionPerms({ temporary: false })).toEqual({ edit: ["RIDER_EDIT"], delete: ["RIDER_DELETE"] });
    expect(riderActionPerms({ temporary: true })).toEqual({ edit: ["DUMMY_RIDER_EDIT"], delete: ["DUMMY_RIDER_DELETE"] });
  });
});

describe("riderNextSteps", () => {
  it("offers the rider's moves for each open status", () => {
    expect(riderNextSteps("assigned").map((s) => s.to)).toEqual(["picked_up", "failed"]);
    expect(riderNextSteps("picked_up").map((s) => s.to)).toEqual(["on_the_way", "arrived", "delivered", "failed"]);
    expect(riderNextSteps("on_the_way").map((s) => s.to)).toEqual(["arrived", "delivered", "failed"]);
    expect(riderNextSteps("arrived").map((s) => s.to)).toEqual(["delivered", "failed"]);
  });
  it("has nothing left once delivered or failed", () => {
    expect(riderNextSteps("delivered")).toEqual([]);
    expect(riderNextSteps("failed")).toEqual([]);
  });
  it("asks for cash on cash orders and a reason on Failed", () => {
    const steps = riderNextSteps("arrived", { cashOrder: true });
    expect(steps.find((s) => s.to === "delivered")?.asksCash).toBe(true);
    expect(steps.find((s) => s.to === "failed")?.asksReason).toBe(true);
    expect(riderNextSteps("arrived", { cashOrder: false }).find((s) => s.to === "delivered")?.asksCash).toBe(false);
  });
  it("hides Failed from a temporary rider without mark_failed", () => {
    expect(riderNextSteps("arrived", { canFail: false }).map((s) => s.to)).toEqual(["delivered"]);
  });
});

describe("isCashOrder and grouping", () => {
  it("treats unpaid orders as cash on delivery", () => {
    expect(isCashOrder({ payment_status: "unpaid" })).toBe(true);
    expect(isCashOrder({ payment_status: "partial" })).toBe(true);
    expect(isCashOrder({ payment_status: "paid" })).toBe(false);
  });
  it("groups by status in working order and drops empty groups", () => {
    const g = groupDeliveries([{ status: "assigned" }, { status: "arrived" }, { status: "assigned" }]);
    expect(g.map((x) => [x.status, x.rows.length])).toEqual([["arrived", 1], ["assigned", 2]]);
  });
  it("builds one address line", () => {
    expect(addressLine({ line1: "12 Main St", line2: null, area: "DHA", city: "Lahore" })).toBe("12 Main St, DHA, Lahore");
    expect(addressLine({ text: "Full text" })).toBe("Full text");
    expect(addressLine(null)).toBe("");
  });
});

describe("cashier till rows", () => {
  it("counts shifts and drops zero parts", () => {
    expect(tillShiftsText({ shifts_settled: 2, shifts_unsettled: 1, shifts_open: 1 })).toBe("2 settled · 1 unsettled · 1 open");
    expect(tillShiftsText({ shifts_settled: 0, shifts_unsettled: 0, shifts_open: 1 })).toBe("1 open");
    expect(tillShiftsText({ shifts_settled: 0, shifts_unsettled: 0, shifts_open: 0 })).toBe("none");
  });
  it("turns collected_by_method into chips, largest first", () => {
    expect(methodChips({ cash: 500, card: 1200, bank_transfer: 0 })).toEqual([{ code: "card", label: "Card", minor: 1200 }, { code: "cash", label: "Cash", minor: 500 }]);
    expect(methodChips({ bank_transfer: 10 })[0].label).toBe("Bank transfer");
    expect(methodChips(undefined)).toEqual([]);
  });
  it("flags tills that still hold cash or unsettled shifts", () => {
    expect(tillNeedsSettlement({ in_tills_now_minor: 100, shifts_unsettled: 0 })).toBe(true);
    expect(tillNeedsSettlement({ in_tills_now_minor: 0, shifts_unsettled: 1 })).toBe(true);
    expect(tillNeedsSettlement({ in_tills_now_minor: 0, shifts_unsettled: 0 })).toBe(false);
  });
  it("offers Force only on the open-shifts conflict", () => {
    expect(dayEndNeedsForce("day_end.open_shifts")).toBe(true);
    expect(dayEndNeedsForce("permission.denied")).toBe(false);
    expect(dayEndNeedsForce(undefined)).toBe(false);
  });
});
