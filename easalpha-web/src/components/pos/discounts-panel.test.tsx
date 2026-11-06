import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cart } from "@/store/cart";
import type { CartLine } from "@/lib/pricing";
import type { Order } from "@/lib/types";

// The payment screen's discounts with the API stubbed like the server's POST /orders/:id/discounts: a cashier's
// discount above their 10% limit is refused with approval.required until a manager's PIN comes with the request.
const h = vi.hoisted(() => ({ requests: [] as { path: string; body: Record<string, unknown> }[] }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: async (path: string, opts: { method?: string; body?: Record<string, unknown> } = {}) => {
      if (path === "/loyalty/redemption_options") return { data: [] };
      if (!path.endsWith("/discounts") || opts.method !== "POST") throw new Error(`unexpected ${path}`);
      h.requests.push({ path, body: opts.body ?? {} });
      const b = opts.body ?? {};
      if (b.kind === "percent" && Number(b.value) > 10 && !b.approver_pin) throw new actual.ApiError("approval.required", "A manager PIN is required for this action", 403, { permissions: ["discounts.above_limit"], labels: { "discounts.above_limit": "Apply a discount above the limit" } });
      return { id: "o-1", discounts: [] } as unknown as Order;
    },
  };
});
vi.mock("@/lib/till-extras", () => ({ getCustomerLoyalty: async () => ({ points: 0 }), redeemPointsOnOrder: vi.fn() }));

import { DiscountsPanel, type DiscountRunner } from "./discounts-panel";
import { needsApproval } from "@/lib/api";

const line = (key: string, name: string, price: number, id?: string): CartLine => ({ key, id, name, unit_price_minor: price, quantity: 1, modifiers: [], tax_rate: 0, tax_inclusive: false });
const cart = (lines: CartLine[]): Cart => ({
  id: "o-1", saved: false, local_only: false, status: "draft", order_type: "takeaway", lines, customer: null, table_id: null, table_code: null, guest_name: "", covers: null,
  notes: "", is_staff_meal: false, staff_meal_reason: "", label: null, client_created_at: "2026-11-06T10:00:00Z",
});
/** The sell screen's runner: saves (the saved lines carry the server's ids), retries with the manager's PIN on approval.required. */
const runner = (saved: Cart, pin = "4321") => vi.fn<DiscountRunner>(async (fn) => {
  try { await fn("o-1", { saved }); } catch (e) { if (!needsApproval(e)) throw e; await fn("o-1", { saved, approver_pin: pin }); }
  return true;
});
const panel = (c: Cart, onRun: DiscountRunner) => <DiscountsPanel cart={c} currency="PKR" online busy={false} locked={false} totalDiscountMinor={0} onRun={onRun} />;
const applyButton = () => within(screen.getByRole("group", { name: "Discount" })).getByRole("button", { name: /Apply/ });
const apply = () => act(async () => { fireEvent.click(applyButton()); });

beforeEach(() => { h.requests.length = 0; });

describe("the cashier's own discount on the payment screen (QA T10)", () => {
  // The till offered only coupon, voucher and points: discounts.apply, its 10% limit and the manager PIN above it were unreachable.
  it("takes a percent off the whole order, with its reason", async () => {
    const onRun = runner(cart([line("a", "Karahi", 120000, "i-1")]));
    render(panel(cart([line("a", "Karahi", 120000, "i-1")]), onRun));
    fireEvent.change(screen.getByLabelText("Discount percent"), { target: { value: "10" } });
    expect(applyButton()).toBeDisabled(); // a reason first
    fireEvent.change(screen.getByLabelText("Discount reason"), { target: { value: "Regular guest" } });
    await apply();
    expect(onRun).toHaveBeenCalledWith(expect.any(Function), "Discount: 10% off the order");
    expect(h.requests.map((r) => r.body)).toEqual([{ kind: "percent", value: 10, reason: "Regular guest" }]);
  });

  it("takes an amount off one line, naming the line by the id the saved order gave it", async () => {
    const unsaved = cart([line("a", "Karahi", 120000), line("b", "Naan", 5000)]);
    const onRun = runner(cart([line("i-1", "Karahi", 120000, "i-1"), line("i-2", "Naan", 5000, "i-2")]));
    render(panel(unsaved, onRun));
    fireEvent.change(screen.getByLabelText("Discount on"), { target: { value: "b" } });
    fireEvent.click(screen.getByRole("button", { name: "Rs" }));
    fireEvent.change(screen.getByLabelText("Discount amount"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Discount reason"), { target: { value: "Burnt" } });
    await apply();
    expect(onRun).toHaveBeenCalledWith(expect.any(Function), "Discount: Rs 20 off Naan");
    expect(h.requests.map((r) => r.body)).toEqual([{ kind: "fixed", value: 20, reason: "Burnt", order_item_id: "i-2" }]);
  });

  it("sends the manager's PIN with the discount when it is above the cashier's limit", async () => {
    const onRun = runner(cart([line("a", "Karahi", 120000, "i-1")]));
    render(panel(cart([line("a", "Karahi", 120000, "i-1")]), onRun));
    fireEvent.change(screen.getByLabelText("Discount percent"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("Discount reason"), { target: { value: "Owner's friend" } });
    await apply();
    expect(h.requests.map((r) => r.body)).toEqual([
      { kind: "percent", value: 25, reason: "Owner's friend" },
      { kind: "percent", value: 25, reason: "Owner's friend", approver_pin: "4321" },
    ]);
  });
});
