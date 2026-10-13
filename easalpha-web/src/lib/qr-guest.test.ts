import { describe, expect, it } from "vitest";
import type { ModifierGroup, Product } from "@/lib/types";
import { qrAddLine, qrCartLabel, qrGroupsFor, qrLineKey, qrModifierProblem, qrOrderLines, qrPrice, qrSetQuantity, qrStage, qrSubtotal, qrToggleModifier, readGuestState, writeGuestState, type QrCartLine } from "./qr-guest";

const line = (over: Partial<QrCartLine> = {}): Omit<QrCartLine, "key"> => ({ product_id: "p1", variant_id: null, deal_id: null, name: "Karahi", detail: null, unit_minor: 120000, modifiers: [], notes: null, quantity: 1, ...over });

const groups: ModifierGroup[] = [
  { id: "g1", name: "Spice level", min_select: 1, max_select: 1, required: true, sort_order: 1, modifiers: [{ id: "m1", name: "Mild", name_ur: null, price_minor: 0, sort_order: 1, active: true }, { id: "m2", name: "Hot", name_ur: null, price_minor: 0, sort_order: 2, active: true }] },
  { id: "g2", name: "Extras", min_select: 0, max_select: 2, required: false, sort_order: 2, modifiers: [{ id: "m3", name: "Cheese", name_ur: null, price_minor: 5000, sort_order: 1, active: true }, { id: "m4", name: "Egg", name_ur: null, price_minor: 3000, sort_order: 2, active: true }, { id: "m5", name: "Old", name_ur: null, price_minor: 0, sort_order: 3, active: false }] },
];

describe("qr cart", () => {
  it("keys a line by product, size, modifiers and note, in any modifier order", () => {
    const a = qrLineKey("p1", "v1", null, [{ modifier_id: "m3", name: "", price_minor: 0, quantity: 1 }, { modifier_id: "m1", name: "", price_minor: 0, quantity: 1 }], " less salt ");
    const b = qrLineKey("p1", "v1", null, [{ modifier_id: "m1", name: "", price_minor: 0, quantity: 1 }, { modifier_id: "m3", name: "", price_minor: 0, quantity: 1 }], "less salt");
    expect(a).toBe(b);
    expect(qrLineKey(null, null, "d1", [], null)).toBe("d:d1|||");
  });

  it("bumps a matching line instead of adding a second row and sums modifiers into the subtotal", () => {
    let lines = qrAddLine([], line());
    lines = qrAddLine(lines, line());
    lines = qrAddLine(lines, line({ modifiers: [{ modifier_id: "m3", name: "Cheese", price_minor: 5000, quantity: 1 }], quantity: 2 }));
    expect(lines.map((l) => l.quantity)).toEqual([2, 2]);
    expect(qrSubtotal(lines)).toBe(120000 * 2 + (120000 + 5000) * 2);
    expect(qrCartLabel(lines, "PKR")).toBe("4 items · Rs 4,900");
    lines = qrSetQuantity(lines, lines[0].key, 0);
    expect(lines).toHaveLength(1);
  });

  it("sends the lines the way the API wants them", () => {
    const lines = qrAddLine(qrAddLine([], line({ variant_id: "v2", modifiers: [{ modifier_id: "m3", name: "Cheese", price_minor: 5000, quantity: 1 }], notes: "no onion" })), line({ product_id: null, deal_id: "d1", name: "Family deal" }));
    expect(qrOrderLines(lines)).toEqual([
      { product_id: "p1", variant_id: "v2", quantity: 1, modifiers: [{ modifier_id: "m3", quantity: 1 }], notes: "no onion" },
      { deal_id: "d1", quantity: 1, modifiers: undefined, notes: undefined },
    ]);
  });
});

describe("qr modifiers and prices", () => {
  it("lists only the product's groups with their active modifiers", () => {
    const g = qrGroupsFor({ modifier_group_ids: ["g2"] }, groups);
    expect(g.map((x) => x.id)).toEqual(["g2"]);
    expect(g[0].modifiers.map((m) => m.id)).toEqual(["m3", "m4"]);
  });

  it("explains a missing required choice and enforces the limits", () => {
    expect(qrModifierProblem(groups, {})).toBe("Choose one from Spice level");
    expect(qrModifierProblem(groups, { m1: 1 })).toBeNull();
    expect(qrModifierProblem(groups, { m1: 1, m3: 1, m4: 1, m5: 1 })).toBe("Up to 2 from Extras");
  });

  it("swaps a single choice and stops a multi choice at its limit", () => {
    let picked = qrToggleModifier(groups, {}, "g1", "m1");
    picked = qrToggleModifier(groups, picked, "g1", "m2");
    expect(picked).toEqual({ m2: 1 });
    picked = qrToggleModifier(groups, picked, "g2", "m3");
    picked = qrToggleModifier(groups, picked, "g2", "m4");
    expect(qrToggleModifier(groups, picked, "g2", "m5")).toEqual(picked); // full
    expect(qrToggleModifier(groups, picked, "g2", "m3")).toEqual({ m2: 1, m4: 1 });
  });

  it("prefers the branch dine-in price, then the general dine-in price, then the size or base price", () => {
    const p = { id: "p1", base_price_minor: 100000, price_minor: 110000, prices: [{ variant_id: null, branch_id: null, order_type: "dine_in", price_minor: 115000 }, { variant_id: null, branch_id: "b1", order_type: "dine_in", price_minor: 120000 }, { variant_id: "v1", branch_id: null, order_type: "takeaway", price_minor: 50000 }] } as unknown as Product & { price_minor: number };
    expect(qrPrice(p, null, "b1")).toBe(120000);
    expect(qrPrice(p, null, "b2")).toBe(115000);
    expect(qrPrice(p, { id: "v1", product_id: "p1", name: "Small", price_minor: 90000, sku: null, sort_order: 1 }, "b1")).toBe(90000);
    expect(qrPrice({ ...p, prices: [] }, null, "b1")).toBe(110000);
  });
});

describe("qr order stage", () => {
  const items = (status: string) => [{ name: "x", quantity: "1", line_total_minor: 1, status }];
  it("reads the QR state before the kitchen state", () => {
    expect(qrStage({ qr_status: "pending", status: "draft", items: [] })).toBe("waiting");
    expect(qrStage({ qr_status: "rejected", status: "voided", items: [] })).toBe("rejected");
    expect(qrStage({ qr_status: "accepted", status: "placed", items: items("sent") })).toBe("kitchen");
    expect(qrStage({ qr_status: "accepted", status: "placed", items: items("ready") })).toBe("ready");
    expect(qrStage({ qr_status: "accepted", status: "completed", items: items("served") })).toBe("done");
    expect(qrStage({ qr_status: "accepted", status: "voided", items: [] })).toBe("cancelled");
  });
});

describe("qr guest state", () => {
  it("round-trips through localStorage and survives junk", () => {
    localStorage.clear();
    expect(readGuestState("t1")).toEqual({ lines: [], guest_name: "", notes: "", lastOrder: null });
    writeGuestState("t1", { lines: qrAddLine([], line()), guest_name: "Ali", notes: "", lastOrder: { id: "o1", guest_token: "g" } });
    expect(readGuestState("t1").guest_name).toBe("Ali");
    expect(readGuestState("t1").lines).toHaveLength(1);
    localStorage.setItem("easalpha.qr.t2", "{\"lines\":\"nope\"}");
    expect(readGuestState("t2").lines).toEqual([]);
  });
});
