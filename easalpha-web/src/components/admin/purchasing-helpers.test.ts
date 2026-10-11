import { describe, expect, it } from "vitest";
import { adjustmentAmount, balanceLabel, balanceLabelFor, csvCell, ledgerTypeVariant, outstandingOnOrder, paymentStatusFor, poActions, poPaymentLabel, signedPercent, suppliersCsv, toCsv, verdictVariant } from "./purchasing-helpers";
import type { SupplierRow } from "@/lib/types";

describe("supplier balance label", () => {
  it("maps the direction to the SPEC text and tone", () => {
    expect(balanceLabel("to_pay")).toEqual({ text: "To Pay", variant: "danger" });
    expect(balanceLabel("to_receive")).toEqual({ text: "To Receive", variant: "success" });
    expect(balanceLabel("settled")).toEqual({ text: "Settled", variant: "neutral" });
  });
  it("derives the direction from the balance when the API row has no label", () => {
    expect(balanceLabelFor(12000)).toBe("to_pay");
    expect(balanceLabelFor(-500)).toBe("to_receive");
    expect(balanceLabelFor(0)).toBe("settled");
    expect(balanceLabel(undefined, -500).text).toBe("To Receive");
  });
});

describe("purchase order payment status", () => {
  it("labels unpaid, partial and paid with the right tone", () => {
    expect(poPaymentLabel("unpaid")).toEqual({ text: "Unpaid", variant: "danger" });
    expect(poPaymentLabel("partial")).toEqual({ text: "Partial", variant: "warning" });
    expect(poPaymentLabel("paid")).toEqual({ text: "Paid", variant: "success" });
    expect(poPaymentLabel(undefined).text).toBe("Unpaid");
  });
  it("computes the status and the outstanding amount from totals", () => {
    expect(paymentStatusFor(10000, 0)).toBe("unpaid");
    expect(paymentStatusFor(10000, 4000)).toBe("partial");
    expect(paymentStatusFor(10000, 10000)).toBe("paid");
    expect(paymentStatusFor(0, 0)).toBe("unpaid");
    expect(outstandingOnOrder(10000, 4000)).toBe(6000);
    expect(outstandingOnOrder(10000, 12000)).toBe(0);
    expect(outstandingOnOrder(10000, undefined)).toBe(10000);
  });
});

describe("price history verdict tone", () => {
  it("keeps OK neutral and flags the rest", () => {
    expect(verdictVariant("ok")).toBe("neutral");
    expect(verdictVariant("wrong_unit")).toBe("danger");
    expect(verdictVariant("below")).toBe("warning");
    expect(verdictVariant("above")).toBe("warning");
    expect(verdictVariant("no_cost")).toBe("warning");
    expect(verdictVariant(null)).toBe("neutral");
  });
  it("gives each ledger line type its own tone", () => {
    expect(ledgerTypeVariant("Purchase")).toBe("warning");
    expect(ledgerTypeVariant("Payment")).toBe("success");
    expect(ledgerTypeVariant("Adjustment")).toBe("accent");
    expect(ledgerTypeVariant("Opening")).toBe("neutral");
  });
});

describe("purchase order allowed actions", () => {
  const all = () => true;
  const none = () => false;
  const only = (...held: string[]) => (...codes: string[]) => codes.some((c) => held.includes(c));
  it("a draft can be sent, edited, deleted, cancelled or received but not paid", () => {
    expect(poActions("draft", all)).toEqual({ send: true, edit: true, delete: true, cancel: true, receive: true, pay: false });
  });
  it("a sent order can be received, cancelled or paid; a partial one can no longer be cancelled", () => {
    expect(poActions("sent", all, "unpaid")).toEqual({ send: false, edit: false, delete: false, cancel: true, receive: true, pay: true });
    expect(poActions("partial", all, "partial")).toEqual({ send: false, edit: false, delete: false, cancel: false, receive: true, pay: true });
  });
  it("a received order can only be paid, and only while something is owed; cancelled orders do nothing", () => {
    expect(poActions("received", all, "partial").pay).toBe(true);
    expect(poActions("received", all, "paid").pay).toBe(false);
    expect(poActions("received", all, "unpaid").receive).toBe(false);
    expect(Object.values(poActions("cancelled", all, "unpaid")).every((v) => v === false)).toBe(true);
  });
  it("each action is gated by its own permission", () => {
    expect(Object.values(poActions("draft", none)).every((v) => v === false)).toBe(true);
    expect(poActions("sent", only("PO_PAYMENT"), "unpaid")).toEqual({ send: false, edit: false, delete: false, cancel: false, receive: false, pay: true });
    expect(poActions("draft", only("PO_DELETE"))).toMatchObject({ delete: true, edit: false, send: false });
    expect(poActions("sent", only("PO_RECEIVE"))).toMatchObject({ receive: true, cancel: false });
    expect(poActions("draft", only("purchasing.manage"))).toMatchObject({ send: true, edit: true, delete: true, receive: true });
  });
});

describe("manual adjustment sign", () => {
  it("is positive when we owe more and negative when we owe less, always from the absolute amount", () => {
    expect(adjustmentAmount("owe_more", 5000)).toBe(5000);
    expect(adjustmentAmount("owe_less", 5000)).toBe(-5000);
    expect(adjustmentAmount("owe_less", -5000)).toBe(-5000);
    expect(adjustmentAmount("owe_more", -5000)).toBe(5000);
    expect(adjustmentAmount("owe_more", 0)).toBe(0);
  });
});

describe("CSV export", () => {
  it("quotes cells with commas, quotes or line breaks", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('Say "hi", ok')).toBe('"Say ""hi"", ok"');
    expect(csvCell(null)).toBe("");
    expect(toCsv(["a", "b"], [[1, "x,y"]])).toBe('a,b\n1,"x,y"\n');
  });
  it("writes suppliers with the import columns first so the file round-trips", () => {
    const row = { id: "1", name: "Metro", contact_name: "Ali", phone: "0300", email: null, address: "Lahore", ntn: null, opening_balance_minor: 100000, balance_minor: -2500, balance_label: "to_receive", payment_terms_days: 7, notes: null, active: true, archived_at: null, created_at: "", items_count: 4, purchases_count: 9 } as SupplierRow;
    const [header, line] = suppliersCsv([row]).trim().split("\n");
    expect(header).toBe("name,contact,phone,email,address,terms,opening_balance,balance,direction,items,purchases");
    expect(line).toBe("Metro,Ali,0300,,Lahore,7,1000,-25,To Receive,4,9");
  });
  it("formats a signed percentage", () => {
    expect(signedPercent(12.34)).toBe("+12.3%");
    expect(signedPercent(-4)).toBe("-4.0%");
    expect(signedPercent(null)).toBe("-");
  });
});
