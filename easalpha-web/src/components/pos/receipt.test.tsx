import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Receipt } from "@/lib/types";

vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64," } }));
vi.mock("@/components/admin/barcode-labels", () => ({ loadSymbol: async () => ({ kind: "text" }), svgDataUrl: () => "", symbolSvg: () => "" }));

import { ReceiptView } from "./receipt";

const receipt = (payment: Receipt["payments"][number]): Receipt => ({
  receipt_number: "R-0007", duplicate: false, printed_at: "2026-10-10T12:00:00Z",
  business: { name: "Karachi Grill", legal_name: null, phone: "021-1111111", logo_key: null, currency: "PKR" },
  branch: { name: "DHA", address: null, city: null, phone: null, tax_registration: {} },
  header: null, footer: null, language: "en", paper: "80",
  order: { id: "o1", serial: 42, label: "A-42", order_type: "takeaway", table: null, business_day: "2026-10-10", placed_at: null, paid_at: "2026-10-10T12:00:00Z", cashier: "Ali", customer: null, guest_name: null, notes: null },
  lines: [{ name: "Karahi", quantity: "1", unit_price_minor: 117700, modifiers: [], line_total_minor: 117700, discount_minor: 0, notes: null }],
  totals: { subtotal_minor: 117700, discount_minor: 0, service_charge_minor: 0, tax_minor: 0, tax_lines: [], delivery_charge_minor: 0, rounding_minor: 0, tip_minor: 0, total_minor: 117700, paid_minor: 117700, due_minor: 0 },
  payments: [payment], refunds: [], khata: null, tax_invoice: { number: null, qr: null, status: "not_registered" }, feedback_whatsapp: null,
});

describe("ReceiptView payments", () => {
  it("shows what was tendered and the change for any cash-kind method, and none for a card", () => {
    // Only a cash-kind method carries a tendered amount (the server and the offline till both set it by kind).
    const { unmount } = render(<ReceiptView r={receipt({ method: "cod", amount_minor: 117700, tendered_minor: 120000, change_minor: 2300, reference: null })} branding={{ barcode: false }} />);
    expect(screen.getByText("Cash tendered").nextElementSibling?.textContent).toBe("Rs 1,200");
    expect(screen.getByText("Change").nextElementSibling?.textContent).toBe("Rs 23");
    unmount();
    render(<ReceiptView r={receipt({ method: "card", amount_minor: 117700, tendered_minor: null, change_minor: 0, reference: "4242" })} branding={{ barcode: false }} />);
    expect(screen.queryByText("Cash tendered")).toBeNull();
    expect(screen.queryByText("Change")).toBeNull();
  });
});

describe("ReceiptView items (QA T13)", () => {
  // A modifier's price sat in the AMOUNT column as well as inside its item's amount.
  it("shows a modifier's price and a line discount as notes, leaving the item's amount the only figure", () => {
    const r = receipt({ method: "cash", amount_minor: 117700, tendered_minor: 117700, change_minor: 0, reference: null });
    r.lines = [{ name: "Karahi", quantity: "1", unit_price_minor: 107700, modifiers: [{ name: "Extra cheese", price_minor: 10000 }], line_subtotal_minor: 117700, line_total_minor: 107700, discount_minor: 10000, notes: null }];
    const { container } = render(<ReceiptView r={r} branding={{ barcode: false }} />);
    expect(screen.getByText("+ Extra cheese (Rs 100)")).toBeInTheDocument();
    expect(screen.getByText("Discount -Rs 100")).toBeInTheDocument();
    // The item block's figures: only the item's own amount.
    const block = screen.getByText("Karahi").closest(".mt-1")!;
    expect([...block.querySelectorAll(".tabular")].map((el) => el.textContent)).toEqual(["1", "Rs 1,177"]);
    expect(container).toBeTruthy();
  });
});
