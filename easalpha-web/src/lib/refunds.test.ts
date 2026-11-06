import { describe, expect, it } from "vitest";
import { bulkCompleteNote, refundOffer } from "./refunds";

describe("refundOffer", () => {
  it("offers what a settled order was paid", () => {
    expect(refundOffer({ status: "paid", paid_minor: 61480, total_minor: 61480 })).toEqual({ amount_minor: 61480, excess: false });
    expect(refundOffer({ status: "closed", paid_minor: 52200, total_minor: 52200 })).toEqual({ amount_minor: 52200, excess: false });
  });

  it("offers an open order only what it was paid above its total, so it can then be completed", () => {
    // Reopened, the chai taken off: Rs 614.80 paid against Rs 522.
    expect(refundOffer({ status: "served", paid_minor: 61480, total_minor: 52200 })).toEqual({ amount_minor: 9280, excess: true });
    // A paid order turned into a staff meal: all of it.
    expect(refundOffer({ status: "served", paid_minor: 9280, total_minor: 0 })).toEqual({ amount_minor: 9280, excess: true });
  });

  it("offers nothing on an open order paid in part or exactly, or on one with nothing paid", () => {
    expect(refundOffer({ status: "placed", paid_minor: 10000, total_minor: 52200 })).toBeNull();
    expect(refundOffer({ status: "served", paid_minor: 52200, total_minor: 52200 })).toBeNull();
    expect(refundOffer({ status: "refunded", paid_minor: 0, total_minor: 52200 })).toBeNull();
    expect(refundOffer({ status: "voided", paid_minor: 0, total_minor: 0 })).toBeNull();
  });
});

describe("bulkCompleteNote", () => {
  it("says what Mark All Completed left open", () => {
    expect(bulkCompleteNote({ skipped_unpaid: 0, skipped_overpaid: 0 })).toBeUndefined();
    expect(bulkCompleteNote({ skipped_unpaid: 2 })).toBe("2 unpaid left open; they complete through payment.");
    expect(bulkCompleteNote({ skipped_unpaid: 1, skipped_overpaid: 1 })).toBe("1 unpaid left open; they complete through payment. 1 paid above its total left open; refund the excess, then complete.");
    expect(bulkCompleteNote({ skipped_overpaid: 3 })).toBe("3 paid above their total left open; refund the excess, then complete.");
  });
});
