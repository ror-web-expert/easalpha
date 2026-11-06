import { describe, expect, it } from "vitest";
import { publicTaxRegistration, receiptBranding, registrationLines } from "./receipt-format";
import { receiptLines, type PrintLine } from "./print";
import type { Receipt } from "./types";

const texts = (lines: PrintLine[]) => lines.filter((l): l is Extract<PrintLine, { text: string }> => "text" in l).map((l) => l.text);

// S1: a branch record stored before the API stopped sending the token still holds it; nothing outside the allow-list prints.
const stored = { authority: "pra", token: "QA-PRA-SECRET-TOKEN-42", ntn: "1234567-8", strn: "32-77-8761-234-56", pos_id: "POS-77", environment: "production" };

describe("registrationLines", () => {
  it("prints the public numbers only, NTN, STRN and the POS id with its authority, never the token", () => {
    expect(registrationLines(stored)).toEqual(["NTN 1234567-8", "STRN 32-77-8761-234-56", "PRA POS ID POS-77"]);
    expect(registrationLines({ ntn: " 1234567-8 ", pos_id: "9", authority: "none" })).toEqual(["NTN 1234567-8", "POS ID 9"]);
    expect(registrationLines({ token: "x" })).toEqual([]);
    expect(registrationLines(null)).toEqual([]);
  });
  it("cuts a stored registration down to the authority and the numbers", () => {
    expect(publicTaxRegistration(stored)).toEqual({ authority: "pra", ntn: "1234567-8", strn: "32-77-8761-234-56", pos_id: "POS-77" });
    expect(publicTaxRegistration({ token: "x", ntn: "" })).toBeNull();
  });
});

describe("receiptBranding", () => {
  it("reads the pos.receipt.* settings the Branding page saves (S6)", () => {
    expect(receiptBranding({ "pos.receipt.header": "Halal food since 1998", "pos.receipt.footer": "Come again", "pos.receipt.paper": "58", "pos.receipt.language": "ur", receipt: { header: "old", paper: "80" } }))
      .toEqual({ header: "Halal food since 1998", footer: "Come again", language: "ur", paper: "58" });
  });
  it("falls back to the old receipt hash, then to the defaults; a cleared footer stays cleared", () => {
    expect(receiptBranding({ receipt: { header: "Old header", paper: "58" } })).toEqual({ header: "Old header", footer: "Thank you", language: "en", paper: "58" });
    expect(receiptBranding({})).toEqual({ header: null, footer: "Thank you", language: "en", paper: "80" });
    expect(receiptBranding({ "pos.receipt.footer": "", "pos.receipt.header": "" }).footer).toBeNull();
  });
});

describe("the printed receipt", () => {
  const receipt: Receipt = {
    receipt_number: "261106-B1-1", duplicate: false, printed_at: "2026-11-06T16:41:00Z",
    business: { name: "QA Setup", legal_name: null, phone: null, logo_key: null, currency: "PKR" },
    branch: { name: "Main", address: null, city: null, phone: null, tax_registration: stored },
    header: "Halal food since 1998", footer: "Come again", language: "en", paper: "58",
    order: { id: "o1", serial: 1, label: "1", order_type: "walk_in", table: null, business_day: "2026-11-06", placed_at: null, paid_at: "2026-11-06T16:41:00Z", cashier: "Owner", customer: null, guest_name: null, notes: null },
    lines: [{ name: "Chai", quantity: "1", unit_price_minor: 8000, modifiers: [], line_total_minor: 8000, discount_minor: 0, notes: null }],
    totals: { subtotal_minor: 8000, discount_minor: 0, service_charge_minor: 0, tax_minor: 0, tax_lines: [], delivery_charge_minor: 0, rounding_minor: 0, tip_minor: 0, total_minor: 8000, paid_minor: 8000, due_minor: 0 },
    payments: [{ method: "cash", amount_minor: 8000, tendered_minor: 8000, change_minor: 0, reference: null }],
    refunds: [], khata: null, tax_invoice: { number: null, qr: null, status: "pending" }, feedback_whatsapp: null,
  };
  it("carries the header and footer and no token, and wraps at 32 characters on 58 mm paper", () => {
    const t = texts(receiptLines(receipt, { settings: { "pos.receipt.paper": "58" } }));
    expect(t).toContain("Halal food since 1998");
    expect(t).toContain("Come again");
    expect(t).toContain("PRA POS ID POS-77");
    expect(t.join("\n")).not.toMatch(/TOKEN|SECRET|ENVIRONMENT/);
    expect(Math.max(...t.map((x) => x.length))).toBeLessThanOrEqual(32);
  });
});
