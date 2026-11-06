import { describe, expect, it } from "vitest";
import { defaultRefundMethod, paidBy } from "./refund-method";

const methods = [{ code: "cash", kind: "cash" }, { code: "card", kind: "card" }, { code: "khata", kind: "khata" }, { code: "old", kind: "card", active: false }];

describe("defaultRefundMethod", () => {
  it("offers the account for an account sale, not cash", () => {
    expect(defaultRefundMethod("khata:52200", methods)).toBe("khata");
  });
  it("offers the method that took most of a split order", () => {
    expect(defaultRefundMethod("cash:30000,card:22200", methods)).toBe("cash");
    expect(defaultRefundMethod("cash:10000,khata:42200", methods)).toBe("khata");
  });
  it("falls back to the till's own payments, then to cash, and skips inactive methods", () => {
    expect(defaultRefundMethod(null, methods, [{ method_code: "card", amount_minor: 900 }])).toBe("card");
    expect(defaultRefundMethod("old:5000", methods)).toBe("cash");
    expect(defaultRefundMethod("", methods)).toBe("cash");
  });
  it("adds up repeated codes", () => {
    expect(paidBy("card:100,cash:150,card:100")).toEqual([{ code: "card", amount_minor: 200 }, { code: "cash", amount_minor: 150 }]);
  });
});
