import { describe, expect, it } from "vitest";
import { accountSummary, customerDetails, newCustomerPrefill, searchReady, toCartCustomer } from "./pos-customers";

describe("till customer search helpers", () => {
  it("searches after two letters or any digit", () => {
    expect(searchReady("a")).toBe(false);
    expect(searchReady("al")).toBe(true);
    expect(searchReady("7")).toBe(true);
    expect(searchReady("  ")).toBe(false);
  });

  it("starts a new customer from what was typed", () => {
    expect(newCustomerPrefill("0300 1234567")).toEqual({ name: "", phone: "0300 1234567" });
    expect(newCustomerPrefill("Hamza Raza")).toEqual({ name: "Hamza Raza", phone: "+92" });
    expect(newCustomerPrefill("12")).toEqual({ name: "12", phone: "+92" }); // too short for a phone: a name or roll
  });

  it("describes a customer with whatever is known", () => {
    expect(customerDetails({ khata_no: "12", member_no: "R-12", room: "C-7", phone: "+923001112233", guardian_phone: null })).toBe("Khata 12 · Roll R-12 · Room C-7 · +923001112233");
    expect(customerDetails({ khata_no: null, member_no: null, room: null, phone: null, guardian_phone: "+923119998877" })).toBe("Guardian +923119998877");
  });

  it("keeps what the cart needs", () => {
    expect(toCartCustomer({ id: "c1", name: "Ali", phone: null, balance_minor: 500, credit_limit_minor: null })).toEqual({ id: "c1", name: "Ali", phone: null, balance_minor: 500, credit_limit_minor: null, last_order_at: null, is_walk_in: false });
    // The last order and walk-in flag go along so the till can work out a regular discount offline (pos-regular).
    expect(toCartCustomer({ id: "c2", name: "Sadia", phone: null, balance_minor: 0, credit_limit_minor: null, last_order_at: "2026-10-17T10:00:00Z", is_walk_in: false })).toMatchObject({ last_order_at: "2026-10-17T10:00:00Z" });
  });

  it("explains the account and warns before the limit is passed", () => {
    const open = accountSummary({ balance_minor: 300_000, credit_limit_minor: null }, 58_000);
    expect(open).toMatchObject({ owes: "owes Rs 3,000", limitText: "no limit", after: 358_000, over: false, overText: null });
    expect(open.afterText).toBe("Rs 3,580 after this sale");
    const capped = accountSummary({ balance_minor: 450_000, credit_limit_minor: 500_000 }, 80_000);
    expect(capped.over).toBe(true);
    expect(capped.overText).toContain("by Rs 300");
    expect(accountSummary({ balance_minor: 0, credit_limit_minor: 0 }, 100).overText).toContain("not allowed");
    expect(accountSummary({ balance_minor: -20_000, credit_limit_minor: null }, 0).owes).toBe("Rs 200 in advance");
  });

  it("claims nothing it does not know for a customer that came with a saved order", () => {
    // A table, resumed or reopened order brings only the id, name and phone.
    expect(accountSummary({}, 80_000)).toEqual({ owes: null, limitText: null, after: null, afterText: null, over: false, overText: null });
    // Balance known, limit not: what they will owe is shown, but no limit and no warning.
    expect(accountSummary({ balance_minor: 450_000 }, 80_000)).toMatchObject({ owes: "owes Rs 4,500", limitText: null, afterText: "Rs 5,300 after this sale", over: false });
    // A known "no limit" still reads as one.
    expect(accountSummary({ balance_minor: 0, credit_limit_minor: null }, 100).limitText).toBe("no limit");
  });
});

describe("recent customers on the till", () => {
  it("keeps the newest eight, one entry per person, and survives junk", async () => {
    const { readRecentCustomers, rememberRecentCustomer } = await import("./pos-customers");
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    const c = (id: string, name: string) => ({ id, name, phone: null, khata_no: null, room: null, member_no: null, balance_minor: 0, orders_count: 0, last_order_at: null, status: "active" });
    for (let i = 1; i <= 9; i++) rememberRecentCustomer(c(`c${i}`, `Customer ${i}`), storage);
    rememberRecentCustomer(c("c3", "Customer 3 again"), storage);
    const list = readRecentCustomers(storage);
    expect(list).toHaveLength(8);
    expect(list.map((r) => r.id)).toEqual(["c3", "c9", "c8", "c7", "c6", "c5", "c4", "c2"]);
    expect(list[0].name).toBe("Customer 3 again");
    store.set("easalpha.pos.recent_customers", "{not json");
    expect(readRecentCustomers(storage)).toEqual([]);
    store.set("easalpha.pos.recent_customers", JSON.stringify([{ id: 1 }, null, { id: "ok", name: "Fine" }]));
    expect(readRecentCustomers(storage).map((r) => r.id)).toEqual(["ok"]);
  });
});
