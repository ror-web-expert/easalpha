import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Customer } from "@/lib/types";

// receiveCustomerPayment against a stand-in for POST /customers/:id/payments, with the sync queue and the saved
// customer list in memory (6 Nov 2026 review, debit side, items 1 to 3).
const h = vi.hoisted(() => ({
  online: true,
  queued: [] as { type: string; id: string; membership_id?: string; payload: Record<string, unknown> }[],
  handler: null as null | ((path: string, opts: { method?: string; body?: Record<string, unknown> }) => unknown),
  calls: [] as { path: string; body: Record<string, unknown> | undefined }[],
  branchTax: null as Record<string, unknown> | null,
}));
vi.mock("@/lib/db", () => ({ db: { customers: { put: async () => undefined, toArray: async () => [], clear: async () => undefined, bulkPut: async () => undefined, bulkDelete: async () => undefined }, transaction: async (_m: string, _t: unknown, fn: () => Promise<void>) => fn() }, kvGet: async () => undefined, kvSet: async () => undefined }));
vi.mock("@/lib/sync", () => ({ isOnline: () => h.online, noteNetworkFailure: () => {}, enqueue: async (r: (typeof h.queued)[number]) => { h.queued.push(r); } }));
vi.mock("@/lib/api", async () => ({ ...(await vi.importActual<typeof import("@/lib/api")>("@/lib/api")), api: async (path: string, opts: { method?: string; body?: Record<string, unknown> } = {}) => { h.calls.push({ path, body: opts.body }); return h.handler!(path, opts); } }));
vi.mock("@/store/catalog", () => ({ useCatalogStore: { getState: () => ({ catalog: { business: { name: "Beaconhouse Canteen", currency: "PKR", settings: {}, logo_key: null }, branch: { name: "Main", address: "12 Mall Road", city: "Lahore", phone: null, tax_registration: h.branchTax } }, paymentMethods: [{ id: "m1", code: "cash", name: "Cash", kind: "cash", active: true, works_offline: true, needs_reference: false, sort_order: 0, payment_account_id: null }] }) } }));
vi.mock("@/store/device", () => ({ useDeviceStore: { getState: () => ({ session: { membership: { id: "m-ayesha" }, user: { name: "Ayesha" } }, branch: null, business: { phone: "042-111" } }) } }));

import { ApiError } from "@/lib/api";
import { accountPaymentReceipt, receiveCustomerPayment } from "./customer-payments";
import { toCachedCustomer } from "./offline-customers";
import { useCustomerStore } from "@/store/customers";
import { readRecentCustomers, rememberRecentCustomer } from "./pos-customers";

const sadia = { id: "sadia", name: "Sadia Akhtar", phone: "+923001807130", khata_no: "32", status: "active", is_walk_in: false, balance_minor: 194_500, credit_limit_minor: null, orders_count: 4, last_order_at: null, room: "C-7", member_no: "R-12", guardian_name: null, guardian_phone: null, email: null, company: null, group_id: null, source: "in_store", loyalty_points: 0, birthday: null, whatsapp_opt_in: false, net_spent_minor: 0, notes: null, archived_at: null, created_at: "2026-10-01T00:00:00Z" } as Customer;
const serverPayment = { id: "cp-1", number: "CP-000012", customer_id: "sadia", direction: "received", amount_minor: 50_000, method_code: "cash", reference: null, collected_by_membership_id: "m-ayesha", business_day: "2026-11-06", received_at: "2026-11-06T10:00:00Z" };

beforeEach(() => {
  h.online = true;
  h.branchTax = null;
  h.queued.length = 0;
  h.calls.length = 0;
  localStorage.clear();
  const saved = toCachedCustomer(sadia);
  useCustomerStore.setState({ list: [saved], byId: new Map([["sadia", saved]]), loaded: true });
  rememberRecentCustomer(sadia);
  h.handler = () => ({ payment: serverPayment, customer: { ...sadia, balance_minor: 144_500 } });
});

describe("receiveCustomerPayment online", () => {
  it("posts the payment and takes the server's new balance into the saved list and the recent list", async () => {
    const r = await receiveCustomerPayment(sadia, { amount_minor: 50_000, method_code: "cash", reference: " slip 88 " }, undefined, "11111111-2222-4333-8444-555555555555");
    expect(h.calls).toEqual([{ path: "/customers/sadia/payments", body: { payment_id: "11111111-2222-4333-8444-555555555555", amount_minor: 50_000, method_code: "cash", reference: "slip 88", approver_pin: undefined } }]);
    expect(r).toMatchObject({ offline: false, id: "cp-1", number: "CP-000012", previous_balance_minor: 194_500, new_balance_minor: 144_500 });
    expect(useCustomerStore.getState().byId.get("sadia")?.balance_minor).toBe(144_500);
    expect(readRecentCustomers()[0]).toMatchObject({ id: "sadia", balance_minor: 144_500 });
    expect(h.queued).toEqual([]);
  });

  it("passes a manager's PIN through, and lets a refusal reach the approval dialog without queueing anything", async () => {
    h.handler = (_path, opts) => { if (!opts.body?.approver_pin) throw new ApiError("permission.denied", "khata.collect needed", 403); return { payment: serverPayment, customer: { ...sadia, balance_minor: 144_500 } }; };
    await expect(receiveCustomerPayment(sadia, { amount_minor: 50_000, method_code: "cash" })).rejects.toMatchObject({ code: "permission.denied" });
    expect(h.queued).toEqual([]);
    expect(useCustomerStore.getState().byId.get("sadia")?.balance_minor).toBe(194_500);
    const r = await receiveCustomerPayment(sadia, { amount_minor: 50_000, method_code: "cash" }, "4321");
    expect(h.calls.at(-1)?.body).toMatchObject({ approver_pin: "4321" });
    expect(r.offline).toBe(false);
  });
});

describe("receiveCustomerPayment offline", () => {
  it("queues a customer_payment record as the server expects it and takes the amount off the saved balance at once", async () => {
    h.online = false;
    const r = await receiveCustomerPayment(sadia, { amount_minor: 50_000, method_code: "cash", reference: "" });
    expect(h.calls).toEqual([]);
    expect(h.queued).toHaveLength(1);
    expect(h.queued[0]).toMatchObject({ type: "customer_payment", id: r.id, membership_id: "m-ayesha", payload: { customer_id: "sadia", amount_minor: 50_000, method_code: "cash", reference: null, direction: "received", client_created_at: r.received_at } });
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r).toMatchObject({ offline: true, number: null, previous_balance_minor: 194_500, new_balance_minor: 144_500 });
    expect(useCustomerStore.getState().byId.get("sadia")?.balance_minor).toBe(144_500);
    expect(readRecentCustomers()[0]).toMatchObject({ id: "sadia", balance_minor: 144_500 });
  });

  it("prints the server's numeric payment number as text (QA 6 Nov 2026: padStart on a number broke the receipt)", async () => {
    h.handler = () => ({ payment: { ...serverPayment, number: 12 }, customer: { ...sadia, balance_minor: 144_500 } });
    const r = await receiveCustomerPayment(sadia, { amount_minor: 50_000, method_code: "cash" });
    expect(r.number).toBe("12");
  });

  it("queues under the same id the online attempt used, so a POST that reached the server is a duplicate at replay", async () => {
    h.handler = () => { throw new ApiError("network", "Request timed out", 0); };
    const r = await receiveCustomerPayment(sadia, { amount_minor: 20_000, method_code: "cash" }, undefined, "99999999-2222-4333-8444-555555555555");
    expect(h.calls.at(-1)?.body).toMatchObject({ payment_id: "99999999-2222-4333-8444-555555555555" });
    expect(r).toMatchObject({ offline: true, id: "99999999-2222-4333-8444-555555555555" });
    expect(h.queued.at(-1)).toMatchObject({ type: "customer_payment", id: "99999999-2222-4333-8444-555555555555" });
  });

  it("goes the same way when the server does not answer", async () => {
    h.handler = () => { throw new ApiError("network", "Request timed out", 0); };
    const r = await receiveCustomerPayment(sadia, { amount_minor: 20_000, method_code: "cash" });
    expect(r).toMatchObject({ offline: true, new_balance_minor: 174_500 });
    expect(h.queued.map((q) => q.type)).toEqual(["customer_payment"]);
  });
});

describe("accountPaymentReceipt", () => {
  it("takes the store, branch, cashier and method name from the till, and the khata number as text", async () => {
    h.online = false;
    const r = await receiveCustomerPayment({ id: "sadia", name: "Sadia Akhtar", khata_no: 32, balance_minor: 194_500 }, { amount_minor: 50_000, method_code: "cash" });
    expect(accountPaymentReceipt(r)).toMatchObject({
      business: { name: "Beaconhouse Canteen", currency: "PKR", phone: "042-111" }, branch: { name: "Main", address: "12 Mall Road", city: "Lahore" },
      number: null, customer: { name: "Sadia Akhtar", khata_no: "32" }, amount_minor: 50_000, method: "Cash", reference: null,
      previous_balance_minor: 194_500, new_balance_minor: 144_500, cashier: "Ayesha", offline: true,
    });
  });

  // L2, 7 Nov 2026: the receipt took the branch's whole tax registration, so a stored copy's API token went with it.
  it("takes only the public tax numbers the order receipt prints, never a token", async () => {
    h.online = false;
    h.branchTax = { authority: "pra", ntn: "1234567-8", strn: " ", pos_id: "POS-9", token: "pra-secret-token", access_code: "AC-1" };
    const r = await receiveCustomerPayment({ id: "sadia", name: "Sadia Akhtar", khata_no: 32, balance_minor: 194_500 }, { amount_minor: 50_000, method_code: "cash" });
    const receipt = accountPaymentReceipt(r);
    expect(receipt.branch.tax_registration).toEqual({ authority: "pra", ntn: "1234567-8", pos_id: "POS-9" });
    expect(JSON.stringify(receipt)).not.toContain("pra-secret-token");
  });
});
