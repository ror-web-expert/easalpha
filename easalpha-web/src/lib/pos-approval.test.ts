import { describe, expect, it } from "vitest";
import type { CartLine } from "./pricing";
import { approvalWhat } from "./pos-approval";

const line = (name: string, over: Partial<CartLine> = {}): CartLine => ({ key: name, name, unit_price_minor: 25000, quantity: 1, modifiers: [], tax_rate: 0, tax_inclusive: false, ...over });

describe("approvalWhat (QA T6)", () => {
  it("names a new price override and a new open item after the action", () => {
    expect(approvalWhat("Send to kitchen", [line("Karahi", { price_override_minor: 100 }), line("Special", { open_item: { name: "Special", price_minor: 50000 } })]))
      .toBe("Send to kitchen: Karahi Rs 250 to Rs 1, open item Special Rs 500");
  });

  it("leaves out what the server already holds: a price it saved, an open item with its id, a cancelled line", () => {
    const saved = [line("Karahi", { id: "i-1", price_override_minor: 25000 }), line("Special", { id: "i-2", open_item: { name: "Special", price_minor: 50000 } }), line("Naan", { status: "cancelled", price_override_minor: 1 })];
    expect(approvalWhat("Take payment", saved)).toBe("Take payment");
  });

  it("counts what does not fit", () => {
    const four = ["A", "B", "C", "D"].map((n) => line(n, { price_override_minor: 100 }));
    expect(approvalWhat("Hold order", four)).toBe("Hold order: A Rs 250 to Rs 1, B Rs 250 to Rs 1 and 2 more");
  });
});
