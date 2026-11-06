import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { approvalAsk, attachApprovalCodes, mergeAsk, withApprovalCodes } from "./approval-codes";

describe("approvalAsk", () => {
  it("reads the codes and labels a refusal names, and nothing from one that names none", () => {
    const e = new ApiError("approval.required", "A manager PIN is required", 403, { permissions: ["orders.void", 7], labels: { "orders.void": "Void an order before payment", x: 1 } });
    expect(approvalAsk(e)).toEqual({ codes: ["orders.void"], labels: { "orders.void": "Void an order before payment" } });
    expect(approvalAsk(new ApiError("approval.required", "older server", 403))).toEqual({ codes: [], labels: {} });
    expect(approvalAsk({ details: { permissions: ["prices.override"] } })).toEqual({ codes: ["prices.override"], labels: {} }); // a sync result
    expect(approvalAsk(null)).toEqual({ codes: [], labels: {} });
  });

  it("merges two asks, the first one's order first, each code once", () => {
    expect(mergeAsk({ codes: ["a", "b"], labels: { a: "A" } }, { codes: ["b", "c"], labels: { c: "C" } })).toEqual({ codes: ["a", "b", "c"], labels: { a: "A", c: "C" } });
  });
});

describe("attachApprovalCodes", () => {
  it("adds the codes only to a body carrying the PIN being approved, and only while that retry runs", async () => {
    const seen: unknown[] = [];
    await withApprovalCodes("4321", ["orders.void"], async () => {
      seen.push(attachApprovalCodes({ reason: "x", approver_pin: "4321" }));
      seen.push(attachApprovalCodes({ reason: "x", approver_pin: "1111" })); // another PIN: not this approval
      seen.push(attachApprovalCodes({ reason: "x" })); // no PIN at all (a poll, a payment)
      seen.push(attachApprovalCodes({ approver_pin: "4321", approval_codes: ["menu.edit"] })); // the screen said what it approves
    });
    seen.push(attachApprovalCodes({ approver_pin: "4321" })); // after the retry
    expect(seen).toEqual([
      { reason: "x", approver_pin: "4321", approval_codes: ["orders.void"] },
      { reason: "x", approver_pin: "1111" },
      { reason: "x" },
      { approver_pin: "4321", approval_codes: ["menu.edit"] },
      { approver_pin: "4321" },
    ]);
  });

  it("sends a PIN alone when the refusal named nothing, the form an older server takes", async () => {
    let body: unknown;
    await withApprovalCodes("4321", [], async () => { body = attachApprovalCodes({ approver_pin: "4321" }); });
    expect(body).toEqual({ approver_pin: "4321" });
    expect(attachApprovalCodes(undefined)).toBeUndefined();
    expect(attachApprovalCodes([1, 2])).toEqual([1, 2]);
  });

  it("forgets the codes when the retry fails too", async () => {
    await expect(withApprovalCodes("4321", ["orders.void"], async () => { throw new Error("refused"); })).rejects.toThrow("refused");
    expect(attachApprovalCodes({ approver_pin: "4321" })).toEqual({ approver_pin: "4321" });
  });
});
