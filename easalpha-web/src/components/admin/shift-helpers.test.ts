import { describe, expect, it } from "vitest";
import { settlementShiftLine, settlementShifts, shiftLabel } from "./shift-helpers";

describe("day close shift rows (QA B6)", () => {
  it("names the cashier and what was counted against what was expected", () => {
    expect(shiftLabel({ id: "s1", cashier_membership_id: "m1", cashier: "Ali", status: "closed", settlement_status: "pending", expected_minor: 928_000, counted_minor: 900_000, over_short_minor: -28_000 }))
      .toBe("Ali · counted Rs 9,000 of Rs 9,280 · not settled");
    expect(shiftLabel({ id: "s2", cashier_membership_id: "m1", cashier: "Ali", status: "open", settlement_status: "pending", expected_minor: null, counted_minor: null, over_short_minor: null })).toBe("Ali · still open");
  });

  it("falls back to the status for a summary saved before the counts were in it", () => {
    expect(shiftLabel({ id: "s1", cashier_membership_id: "m1", status: "closed", over_short_minor: 0 })).toBe("Closed");
  });
});

describe("Day-End Settlement detail (QA B3, B6)", () => {
  it("lists each shift with its count, the float back to the safe and what was cleared", () => {
    const detail = { forced: false, shifts: [{ shift_id: "s1", cashier_membership_id: "m1", cashier: "Ali", business_day: "2026-11-06", counted_minor: 1_400_000, float_to_safe_minor: 500_000, amount_minor: 900_000, over_short_minor: -28_000 }] };
    const rows = settlementShifts(detail);
    expect(rows).toHaveLength(1);
    expect(settlementShiftLine(rows[0])).toBe("Ali: counted Rs 14,000, float Rs 5,000 back to the safe, Rs 9,000 cleared, short Rs 280");
  });

  it("reads an older record with amounts only, and one with no detail", () => {
    const rows = settlementShifts({ shifts: [{ shift_id: "s1", cashier_membership_id: "m1", business_day: "2026-11-01", amount_minor: 928_000 }] });
    expect(settlementShiftLine(rows[0])).toBe("Cashier: Rs 9,280 cleared");
    expect(settlementShifts(null)).toEqual([]);
    expect(settlementShifts({ forced: true })).toEqual([]);
  });
});
