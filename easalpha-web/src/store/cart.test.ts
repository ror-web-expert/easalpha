import { beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@/lib/types";
import { useCartStore } from "./cart";
import { useDeviceStore } from "./device";
import { readRecentCustomers, rememberRecentCustomer } from "@/lib/pos-customers";

// 6 Nov 2026 review, item 7: the cart, its customer and the staff-meal flag survived lock, sign-out and unpair, so
// cashier B paid cashier A's order under B's name.
const session = (membershipId: string) => ({ access_token: "a", refresh_token: "r", app: "pos", membership: { id: membershipId }, user: { name: "x" }, permissions: [] }) as unknown as Session;
const chai = { product_id: "p-chai", variant_id: null, name: "Chai", unit_price_minor: 5000, quantity: 1, modifiers: [], tax_rate: 0, tax_inclusive: false };
const sadia = { id: "c-1", name: "Sadia Akhtar", phone: null };

function aliOrders() {
  useDeviceStore.getState().setSession(session("m-ali"));
  useCartStore.getState().addLine(chai);
  useCartStore.getState().patch({ customer: sadia, is_staff_meal: true, staff_meal_reason: "lunch" });
}

beforeEach(() => {
  localStorage.clear();
  useCartStore.getState().clear();
  useDeviceStore.setState({ session: null, deviceToken: "tok" });
});

describe("the cart between cashiers", () => {
  it("survives a lock and the same cashier signing in again", () => {
    aliOrders();
    useDeviceStore.getState().lock();
    expect(useDeviceStore.getState().session).toBeNull();
    useDeviceStore.getState().setSession(session("m-ali"));
    expect(useCartStore.getState().cart).toMatchObject({ lines: [expect.objectContaining({ name: "Chai" })], customer: sadia, is_staff_meal: true });
  });

  it("starts empty for another cashier: no lines, no customer, no staff-meal flag", () => {
    aliOrders();
    useDeviceStore.getState().lock();
    useDeviceStore.getState().setSession(session("m-bilal"));
    expect(useCartStore.getState().cart).toMatchObject({ lines: [], customer: null, is_staff_meal: false, staff_meal_reason: "" });
    expect(useCartStore.getState().owner).toBe("m-bilal");
  });

  it("keeps the cart through a token refresh for the signed-in cashier", () => {
    aliOrders();
    useDeviceStore.getState().setSession(session("m-ali"));
    expect(useCartStore.getState().cart.lines).toHaveLength(1);
  });

  it("is cleared, with the recent customers, on unpair", () => {
    aliOrders();
    rememberRecentCustomer({ id: "c-1", name: "Sadia Akhtar", phone: null, khata_no: "32", room: null, member_no: null, balance_minor: 0, orders_count: 1, last_order_at: null, status: "active" });
    expect(readRecentCustomers()).toHaveLength(1);
    useDeviceStore.getState().unpair();
    expect(useCartStore.getState().cart).toMatchObject({ lines: [], customer: null });
    expect(useCartStore.getState().owner).toBeNull();
    expect(readRecentCustomers()).toEqual([]);
    expect(useDeviceStore.getState().deviceToken).toBeNull();
  });
});
