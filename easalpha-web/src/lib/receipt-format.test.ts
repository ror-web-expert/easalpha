import { describe, expect, it } from "vitest";
import { isReceiptNumber, isTillSerial } from "./receipt-format";
import { classifyScan } from "@/components/pos/scanner";

describe("receipt barcodes (QA T12)", () => {
  // A receipt paid offline carries the till serial as its barcode: Sell offered to attach the code to a product and
  // Orders said "Not a receipt".
  it("takes the till serial of an offline receipt as well as a receipt number", () => {
    expect(isReceiptNumber("261106-MAIN-42")).toBe(true);
    expect(["T1-001", "t12-0450", " W2-014 "].map(isReceiptNumber)).toEqual([true, true, true]);
    expect(["R-12", "R-123", "T1-01", "K1-001", "8964000123456", "T-001"].map(isTillSerial)).toEqual([false, false, false, false, false, false]);
  });

  it("sends it from the sell screen's scanner to the order, after the catalog has had its look", () => {
    expect(classifyScan("T1-001", { product: () => null, receipt: true })).toEqual({ kind: "receipt", code: "T1-001" });
    expect(classifyScan("T1-001", { product: () => null, receipt: false })).toBeNull();
  });
});
