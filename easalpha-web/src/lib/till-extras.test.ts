import { describe, expect, it } from "vitest";
import { DRAWER_MOVES, drawerMoveExtra, drawerMoveReady, expenseDraftReady, flatCategories, newDrawerMove, newExpenseDraft } from "./till-extras";
import type { ExpenseCategory } from "./types";

const cat = (id: string, name: string, children: ExpenseCategory[] = [], archived_at: string | null = null): ExpenseCategory =>
  ({ id, name, parent_id: null, full_name: name, sort_order: 0, archived_at, children });

describe("drawer moves on the till (QA B7)", () => {
  it("offers a drop to the safe and a payout beside cash in and out, each saying where the money goes", () => {
    expect(Object.keys(DRAWER_MOVES)).toEqual(["cash_in", "cash_out", "drop", "payout"]);
    expect(DRAWER_MOVES.drop.hint).toMatch(/safe/);
    expect(DRAWER_MOVES.payout.hint).toMatch(/expense/);
    expect(DRAWER_MOVES.cash_out.hint).toMatch(/owner/);
  });

  it("needs an amount and a reason, and sends a payout's category and payee only with a payout", () => {
    const m = newDrawerMove("payout");
    expect(drawerMoveReady(m)).toBe(false);
    expect(drawerMoveReady({ ...m, amount: 1_500 })).toBe(false);
    expect(drawerMoveReady({ ...m, amount: 1_500, reason: "  " })).toBe(false);
    const ready = { ...m, amount: 1_500, reason: "Ice", paid_to: " Ice man ", category_id: "c1" };
    expect(drawerMoveReady(ready)).toBe(true);
    expect(drawerMoveExtra(ready)).toEqual({ category_id: "c1", paid_to: "Ice man" });
    expect(drawerMoveExtra({ ...ready, category_id: "", paid_to: "" })).toEqual({ category_id: undefined, paid_to: undefined });
    expect(drawerMoveExtra({ ...ready, kind: "drop" })).toEqual({});
  });
});

describe("expenses from the till", () => {
  it("needs a category and an amount, and keeps one client id per draft", () => {
    const d = newExpenseDraft();
    expect(d.method_code).toBe("cash");
    expect(expenseDraftReady(d)).toBe(false);
    expect(expenseDraftReady({ ...d, category_id: "c1" })).toBe(false);
    expect(expenseDraftReady({ ...d, category_id: "c1", amount_minor: 3_000 })).toBe(true);
    expect(newExpenseDraft().client_id).not.toBe(d.client_id);
  });

  it("lists categories then their live subcategories as Parent / Child", () => {
    const cats = [cat("u", "Utilities", [cat("g", "Gas"), cat("w", "Water", [], "2026-11-01")]), cat("p", "Petty cash")];
    expect(flatCategories(cats)).toEqual([{ id: "u", label: "Utilities" }, { id: "g", label: "Utilities / Gas" }, { id: "p", label: "Petty cash" }]);
    expect(flatCategories(null)).toEqual([]);
  });
});
