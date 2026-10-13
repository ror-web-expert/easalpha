import { describe, expect, it } from "vitest";
import type { CartLine } from "./pricing";
import {
  allowedOrderTypes, canTakeOrderType, confirmationPopup, customerRequired, defaultPaymentMethod, directUnpaidAllowed,
  kdsAlerts, kdsTimeoutMinutes, kdsTone, minutesUntilDayEnd, parsePaymentSummary, payableTotals, pendingReminderState, reconcilePayments,
  roundingForPayment, roundsCash, serverDueForPayment } from "./pos-rules";

const at = (h: number, m: number) => new Date(2026, 9, 10, h, m);

describe("customerRequired", () => {
  it("reads the per-type key and never requires one for dine-in", () => {
    const s = { "pos.customer_required.delivery": true, "pos.customer_required.walk_in": false };
    expect(customerRequired(s, "delivery")).toBe(true);
    expect(customerRequired(s, "walk_in")).toBe(false);
    expect(customerRequired(s, "takeaway")).toBe(false);
    expect(customerRequired({ "pos.customer_required.dine_in": true }, "dine_in")).toBe(false);
  });
  it("accepts a string boolean from an older cache", () => {
    expect(customerRequired({ "pos.customer_required.takeaway": "true" }, "takeaway")).toBe(true);
  });
});

describe("canTakeOrderType", () => {
  it("gates each type on its SALES_* code", () => {
    const perms = ["orders.create", "SALES_WALKIN"];
    expect(canTakeOrderType(perms, "walk_in")).toBe(true);
    expect(canTakeOrderType(perms, "takeaway")).toBe(false);
    expect(canTakeOrderType(perms, "delivery")).toBe(false);
    expect(canTakeOrderType(perms, "dine_in")).toBe(true);
  });
  it("keeps every type for a role with orders.create and no SALES_* code", () => {
    expect(allowedOrderTypes(["orders.create"])).toEqual(["dine_in", "takeaway", "delivery", "walk_in"]);
  });
  it("allows nothing without permissions", () => {
    expect(canTakeOrderType(undefined, "walk_in")).toBe(false);
    expect(allowedOrderTypes(["reports.view_own"])).toEqual([]);
  });
});

describe("directUnpaidAllowed", () => {
  const on = { "pos.order_behavior.direct_unpaid_orders": true };
  it("needs the setting on and PLACE_UNPAID_DIRECT", () => {
    expect(directUnpaidAllowed(on, ["PLACE_UNPAID_DIRECT"], "cashier")).toBe(true);
    expect(directUnpaidAllowed(on, ["orders.create"], "cashier")).toBe(false);
    expect(directUnpaidAllowed({}, ["PLACE_UNPAID_DIRECT"], "cashier")).toBe(false);
  });
  it("always qualifies admin staff when the setting is on", () => {
    expect(directUnpaidAllowed(on, [], "admin")).toBe(true);
    expect(directUnpaidAllowed({}, [], "admin")).toBe(false);
  });
});

describe("confirmationPopup", () => {
  it("is on by default and can be switched off", () => {
    expect(confirmationPopup({})).toBe(true);
    expect(confirmationPopup({ "pos.order_behavior.confirmation_popup": false })).toBe(false);
  });
});

describe("pendingReminderState", () => {
  it("builds the badge text from today and previous days", () => {
    const s = pendingReminderState({ today: 22, previous: 80 }, at(12, 0), "02:01", {});
    expect(s).toMatchObject({ count: 102, tone: "normal", text: "22 open orders today · 80 from previous days" });
  });
  it("uses the singular and drops the previous-days part when it is zero", () => {
    expect(pendingReminderState({ today: 1, previous: 0 }, at(12, 0), "02:01", {})?.text).toBe("1 open order today");
    expect(pendingReminderState({ today: 0, previous: 0 }, at(12, 0), "02:01", {})?.text).toBe("No open orders");
  });
  it("turns red within red_minutes_before_close of the day end, across midnight", () => {
    expect(pendingReminderState({ today: 3, previous: 0 }, at(1, 30), "02:01", {})?.tone).toBe("red");
    expect(pendingReminderState({ today: 3, previous: 0 }, at(23, 30), "02:01", {})?.tone).toBe("normal");
    expect(pendingReminderState({ today: 3, previous: 0 }, at(23, 30), "02:01", { "pos.pending_reminder.red_minutes_before_close": 180 })?.tone).toBe("red");
  });
  it("never goes red with no open orders and is null when the reminder is off", () => {
    expect(pendingReminderState({ today: 0, previous: 0 }, at(1, 30), "02:01", {})?.tone).toBe("normal");
    expect(pendingReminderState({ today: 5, previous: 1 }, at(1, 30), "02:01", { "pos.pending_reminder.enabled": false })).toBeNull();
  });
  it("computes minutes until the day end", () => {
    expect(minutesUntilDayEnd(at(1, 1), "02:01")).toBe(60);
    expect(minutesUntilDayEnd(at(23, 0), "02:00")).toBe(180);
    expect(minutesUntilDayEnd(at(23, 0), null)).toBeNull();
  });
});

describe("kds alerts", () => {
  it("reads the timeout and treats blank or zero as disabled", () => {
    expect(kdsTimeoutMinutes({ "pos.kds.timeout_minutes": 20 })).toBe(20);
    expect(kdsTimeoutMinutes({ "pos.kds.timeout_minutes": "15" })).toBe(15);
    expect(kdsTimeoutMinutes({ "pos.kds.timeout_minutes": null })).toBeNull();
    expect(kdsTimeoutMinutes({ "pos.kds.timeout_minutes": 0 })).toBeNull();
    expect(kdsTimeoutMinutes({})).toBeNull();
  });
  it("defaults both sounds to off", () => {
    expect(kdsAlerts({})).toEqual({ newOrderSound: false, timeoutMinutes: null, redSound: false });
    expect(kdsAlerts({ "pos.kds.new_order_sound": true, "pos.kds.red_sound": true, "pos.kds.timeout_minutes": 10 })).toEqual({ newOrderSound: true, timeoutMinutes: 10, redSound: true });
  });
  it("colours the timer red at the timeout and amber from half of it, never without a timeout", () => {
    expect(kdsTone(20, 20)).toBe("red");
    expect(kdsTone(10, 20)).toBe("warning");
    expect(kdsTone(9, 20)).toBe("normal");
    expect(kdsTone(500, null)).toBe("normal");
  });
});

describe("defaultPaymentMethod", () => {
  it("pre-selects the store default, or nothing when unset", () => {
    expect(defaultPaymentMethod({ "pos.order_behavior.default_payment_method": "jazzcash" }, null)).toBe("jazzcash");
    expect(defaultPaymentMethod({}, null)).toBeNull();
    expect(defaultPaymentMethod({ "pos.order_behavior.default_payment_method": " " }, null)).toBeNull();
  });
  it("opens a reopened order on its original method", () => {
    const s = { "pos.order_behavior.default_payment_method": "cash" };
    expect(defaultPaymentMethod(s, { reopened_at: "2026-10-10T10:00:00Z", payment_method_summary: "khata:2000,easypaisa:4500" })).toBe("easypaisa");
    expect(defaultPaymentMethod(s, { reopened: true, payment_method_summary: null })).toBe("cash");
    expect(defaultPaymentMethod(s, { reopened_at: null, payment_method_summary: "khata:2000" })).toBe("cash");
  });
  it("parses the payment summary largest first", () => {
    expect(parsePaymentSummary("cash:4500,khata:2000")).toEqual([{ code: "cash", amount_minor: 4500 }, { code: "khata", amount_minor: 2000 }]);
    expect(parsePaymentSummary(null)).toEqual([]);
  });
});

describe("paying against the server's total (13 Oct 2026 fix)", () => {
  const cash = (amount: number, tendered = amount) => ({ method_code: "cash", amount_minor: amount, tendered_minor: tendered });
  it("sends the payments unchanged when the totals agree or it is a part payment", () => {
    expect(reconcilePayments([cash(125280)], 125280, 125280)).toEqual([cash(125280)]);
    expect(reconcilePayments([cash(50000)], 125280, 126672)).toEqual([cash(50000)]); // part payment: the rest stays due
  });
  it("moves the last payment by a paisa-rounding gap under Rs 1", () => {
    expect(reconcilePayments([cash(125280, 130000)], 125280, 125281)).toEqual([cash(125281, 130000)]);
    expect(reconcilePayments([{ method_code: "khata", amount_minor: 125280 }], 125280, 125279)).toEqual([{ method_code: "khata", amount_minor: 125279 }]);
    expect(reconcilePayments([cash(125280, 125280)], 125280, 125290)).toEqual([cash(125290, 125290)]); // tendered covers the new amount
  });
  it("stops a full payment when the total moved by Rs 1 or more, so nothing is charged against a total nobody saw", () => {
    expect(reconcilePayments([cash(125280)], 125280, 126672)).toBeNull(); // the regular-discount case: Rs 13.92 more
    expect(reconcilePayments([cash(60000), { method_code: "khata", amount_minor: 65280 }], 125280, 120000)).toBeNull();
  });
  it("stops a payment meant as a part payment that would settle the server's lower figure", () => {
    expect(reconcilePayments([cash(95000)], 100000, 90000)).toBeNull();
  });
  it("pays the server's figure once the cashier has been shown it, so the check cannot stop the same payment again", () => {
    expect(reconcilePayments([cash(125280, 130000)], 125280, 126672, 126672)).toEqual([cash(126672, 130000)]);
    expect(reconcilePayments([cash(125280)], 125280, 126672, 126000)).toBeNull(); // a figure the cashier has not seen
    // A cut larger than the last payment comes off the one before it; a payment left at zero is dropped.
    expect(reconcilePayments([cash(60000), { method_code: "card", amount_minor: 500 }], 60500, 59000, 59000)).toEqual([cash(59000, 60000)]);
  });
});

describe("cash rounding and tips as Payments::Processor takes them", () => {
  const settings = { cash_rounding: 10 };
  const line = (price: number): CartLine => ({ key: `l${price}`, name: "Karahi", unit_price_minor: price, quantity: 1, modifiers: [], tax_rate: 0, tax_inclusive: false });
  const order = (over: Record<string, unknown> = {}) => ({ order_type: "takeaway", lines: [line(125600)], is_staff_meal: false, ...over });

  it("rounds only with the method coded cash, and only while nothing has been paid", () => {
    expect(roundsCash(["card", "cash"])).toBe(true);
    expect(roundsCash(["card", "cash_usd", undefined])).toBe(false);
    expect(roundingForPayment(125600, 0, 0, true, settings)).toBe(400);
    expect(roundingForPayment(125600, 0, 0, false, settings)).toBe(0);
    expect(roundingForPayment(125600, 400, 50000, true, settings)).toBe(400); // later payments keep the stored rounding
    expect(roundingForPayment(125600, 400, 50000, false, settings)).toBe(400);
    expect(roundingForPayment(125600, 0, 0, true, { cash_rounding: 0 })).toBe(0);
  });

  it("prices the first payment with a fresh rounding and every later one with the stored rounding", () => {
    expect(payableTotals(order(), { settings, cash: true }).total_minor).toBe(126000);
    expect(payableTotals(order(), { settings, cash: false }).total_minor).toBe(125600);
    // Rs 500 cash taken first: the server stored Rs 4 of rounding, and the rest is Rs 760 by cash or by card.
    const partPaid = order({ rounding_minor: 400, paid_minor: 50000 });
    expect(payableTotals(partPaid, { settings, cash: true }).total_minor - 50000).toBe(76000);
    expect(payableTotals(partPaid, { settings, cash: false }).total_minor - 50000).toBe(76000);
  });

  it("keeps the tips already taken in the total and rounds a first cash payment with its tip", () => {
    const reopened = order({ lines: [line(100000), line(20000)], tip_minor: 10000, paid_minor: 110000 });
    expect(payableTotals(reopened, { settings: {}, cash: false })).toMatchObject({ tip_minor: 10000, total_minor: 130000 });
    expect(payableTotals(order(), { settings, tip_minor: 5000, cash: true })).toMatchObject({ tip_minor: 5000, rounding_minor: 400, total_minor: 131000 });
  });

  it("works out what the server will ask for from the order it just saved", () => {
    const saved = { total_minor: 125600, rounding_minor: 0, paid_minor: 0, is_staff_meal: false };
    expect(serverDueForPayment(saved, { settings, cash: true })).toBe(126000);
    expect(serverDueForPayment(saved, { settings, cash: false })).toBe(125600);
    expect(serverDueForPayment(saved, { settings, cash: true, tip_minor: 5000 })).toBe(131000);
    const partPaid = { total_minor: 126000, rounding_minor: 400, paid_minor: 50000, is_staff_meal: false };
    expect(serverDueForPayment(partPaid, { settings, cash: true })).toBe(76000);
    expect(serverDueForPayment(partPaid, { settings, cash: false })).toBe(76000);
    expect(serverDueForPayment({ ...saved, is_staff_meal: true, total_minor: 0 }, { settings, cash: true })).toBe(0);
  });

  it("agrees with the server around a rounding step, so a paisa gap before rounding never shifts a payment", () => {
    // Till 1,256.01 and server 1,256.00 both come to 1,260 with cash.
    expect(payableTotals(order({ lines: [line(125601)] }), { settings, cash: true }).total_minor).toBe(126000);
    expect(serverDueForPayment({ total_minor: 125600, rounding_minor: 0, paid_minor: 0, is_staff_meal: false }, { settings, cash: true })).toBe(126000);
    // Cash 600 and card 660 against 1,260: the server rounds 1,260 to itself, so the card stays at 660.
    const split = [{ method_code: "cash", amount_minor: 60000, tendered_minor: 60000 }, { method_code: "card", amount_minor: 66000 }];
    expect(reconcilePayments(split, 126000, serverDueForPayment({ total_minor: 126000, rounding_minor: 0, paid_minor: 0, is_staff_meal: false }, { settings, cash: true }))).toEqual(split);
  });
});
