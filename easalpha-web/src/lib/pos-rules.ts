// Pure till rules from SPEC "Orders, order taking and tables", "Payments, charges, tax and the finance ledger",
// "Kitchen display, printing and devices" and "Roles and permissions". Every rule reads the synced settings object
// (settingValue) and the session's permission codes, so the till behaves the same offline as online.
import { cashRounding, settingValue, type CartLine, type Totals } from "@/lib/pricing";
import { totalsWithCharges, type ChargeFields } from "@/lib/pos-charges";
import type { BusinessSettings, OrderType } from "@/lib/types";

export type Settings = BusinessSettings | Record<string, unknown> | null | undefined;

/** SPEC "Take Orders": one permission per order type. Dine-in has no SPEC code and rides on orders.create. */
export const SALES_PERMISSION: Record<OrderType, string | null> = { walk_in: "SALES_WALKIN", takeaway: "SALES_TAKEAWAY", delivery: "SALES_DELIVERY", dine_in: null };
const SALES_CODES = Object.values(SALES_PERMISSION).filter((c): c is string => !!c);

/** Booleans arrive as true/false from the settings store, but an older cache may hold "true"/"false" strings. */
export function settingBool(settings: Settings, key: string, fallback: boolean): boolean {
  const v = settingValue<unknown>(settings, key, fallback);
  if (typeof v === "string") return v === "true" || v === "1";
  return !!v;
}

function settingInt(settings: Settings, key: string, fallback: number | null): number | null {
  const v = settingValue<unknown>(settings, key, fallback);
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

/** SPEC "Customer Required": per order type; dine-in has no key and never requires one. */
export function customerRequired(settings: Settings, orderType: OrderType): boolean {
  if (orderType === "dine_in") return false;
  return settingBool(settings, `pos.customer_required.${orderType}`, false);
}

/**
 * SALES_WALKIN / SALES_TAKEAWAY / SALES_DELIVERY gate their order type. A user with orders.create and none of the
 * SALES_* codes keeps every type, so roles made before the SPEC codes existed are not locked out.
 */
export function canTakeOrderType(perms: readonly string[] | null | undefined, orderType: OrderType): boolean {
  if (!perms) return false;
  const anySales = SALES_CODES.some((c) => perms.includes(c));
  if (orderType === "dine_in") return perms.includes("orders.create") || anySales;
  const code = SALES_PERMISSION[orderType];
  if (code && perms.includes(code)) return true;
  return perms.includes("orders.create") && !anySales;
}

export function allowedOrderTypes(perms: readonly string[] | null | undefined): OrderType[] {
  return (["dine_in", "takeaway", "delivery", "walk_in"] as OrderType[]).filter((t) => canTakeOrderType(perms, t));
}

/** SPEC "Direct Unpaid Orders": the setting must be on and the user must hold PLACE_UNPAID_DIRECT or be admin staff. */
export function directUnpaidAllowed(settings: Settings, perms: readonly string[] | null | undefined, staffType: string | null | undefined): boolean {
  if (!settingBool(settings, "pos.order_behavior.direct_unpaid_orders", false)) return false;
  return staffType === "admin" || !!perms?.includes("PLACE_UNPAID_DIRECT");
}

/** SPEC "Order confirmation popup": on by default; off means the till goes straight to a new order after payment. */
export function confirmationPopup(settings: Settings): boolean {
  return settingBool(settings, "pos.order_behavior.confirmation_popup", true);
}

export function pendingReminderEnabled(settings: Settings): boolean {
  return settingBool(settings, "pos.pending_reminder.enabled", true);
}

/** Minutes from `now` until the branch day end ("HH:MM", which may fall on the next calendar day). */
export function minutesUntilDayEnd(now: Date, dayEnd: string | null | undefined): number | null {
  if (!dayEnd || !/^\d{1,2}:\d{2}/.test(dayEnd)) return null;
  const [h, m] = dayEnd.split(":").map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  let diff = h * 60 + (m || 0) - nowMins;
  if (diff < 0) diff += 24 * 60;
  return diff;
}

export interface OpenCounts { today: number; previous: number }
export interface PendingReminderState { count: number; today: number; previous: number; tone: "normal" | "red"; text: string }

/**
 * SPEC "Pending Orders": the header badge. Red within red_minutes_before_close (default 60) of the day end.
 * Returns null when the reminder setting is off.
 */
export function pendingReminderState(openCounts: OpenCounts | null | undefined, now: Date, dayEnd: string | null | undefined, settings: Settings): PendingReminderState | null {
  if (!pendingReminderEnabled(settings)) return null;
  const today = Math.max(0, openCounts?.today ?? 0);
  const previous = Math.max(0, openCounts?.previous ?? 0);
  const count = today + previous;
  const redMinutes = settingInt(settings, "pos.pending_reminder.red_minutes_before_close", 60) ?? 60;
  const left = minutesUntilDayEnd(now, dayEnd);
  const tone: PendingReminderState["tone"] = count > 0 && left !== null && left <= redMinutes ? "red" : "normal";
  const text = count === 0 ? "No open orders" : `${today} open ${today === 1 ? "order" : "orders"} today${previous ? ` · ${previous} from previous days` : ""}`;
  return { count, today, previous, tone, text };
}

/** SPEC "KDS Alerts": timeout in minutes after which a still-pending card turns red; null (blank) disables. */
export function kdsTimeoutMinutes(settings: Settings): number | null {
  const n = settingInt(settings, "pos.kds.timeout_minutes", null);
  return n && n > 0 ? n : null;
}

export function kdsAlerts(settings: Settings) {
  return {
    newOrderSound: settingBool(settings, "pos.kds.new_order_sound", false),
    timeoutMinutes: kdsTimeoutMinutes(settings),
    redSound: settingBool(settings, "pos.kds.red_sound", false),
  };
}

/** Card tone for the kitchen timer: red at the timeout, amber from half the timeout, neutral when no timeout is set. */
export function kdsTone(elapsedMinutes: number, timeoutMinutes: number | null): "normal" | "warning" | "red" {
  if (timeoutMinutes === null) return "normal";
  if (elapsedMinutes >= timeoutMinutes) return "red";
  if (elapsedMinutes >= timeoutMinutes / 2) return "warning";
  return "normal";
}

/** "cash:4500,khata:2000" -> [{ code: "cash", amount_minor: 4500 }, ...], largest first. */
export function parsePaymentSummary(summary: string | null | undefined): { code: string; amount_minor: number }[] {
  if (!summary) return [];
  return summary.split(",").map((part) => {
    const [code, amt] = part.split(":");
    return { code: (code ?? "").trim(), amount_minor: Number(amt) || 0 };
  }).filter((p) => p.code).sort((a, b) => b.amount_minor - a.amount_minor);
}

/**
 * SPEC: which method the payment screen pre-selects. A reopened order opens on its original method (the one that
 * took the most money); otherwise the store default (pos.order_behavior.default_payment_method), or null.
 */
export function defaultPaymentMethod(settings: Settings, order?: { reopened?: boolean | null; reopened_at?: string | null; payment_method_summary?: string | null } | null): string | null {
  const reopened = !!(order?.reopened || order?.reopened_at);
  if (reopened) {
    const original = parsePaymentSummary(order?.payment_method_summary)[0];
    if (original) return original.code;
  }
  const code = settingValue<unknown>(settings, "pos.order_behavior.default_payment_method", null);
  return typeof code === "string" && code.trim() ? code.trim() : null;
}

/** Payments::Processor rounds only when one of the payments uses the method coded "cash" (the default Cash method). */
export function roundsCash(methodCodes: readonly (string | null | undefined)[]): boolean {
  return methodCodes.includes("cash");
}

/**
 * The cash rounding in force once a payment is taken, as Payments::Processor#apply_rounding! works it out: a cash
 * payment while nothing has been paid rounds the total (tips included) to the cash_rounding step; every later payment
 * keeps the rounding already stored on the order.
 */
export function roundingForPayment(unroundedMinor: number, storedMinor: number, paidMinor: number, cash: boolean, settings: Settings): number {
  const step = Number(settingValue<unknown>(settings, "cash_rounding", 0)) || 0;
  if (!cash || paidMinor !== 0 || step <= 0) return storedMinor;
  return cashRounding(unroundedMinor, (settings ?? undefined) as BusinessSettings | undefined);
}

/** An order as the payment screen prices it. discount_minor is the order-level discount only: the lines carry the product discounts. */
export type PayableOrder = ChargeFields & { lines: CartLine[]; is_staff_meal: boolean; discount_minor?: number; rounding_minor?: number; tip_minor?: number; paid_minor?: number };

/**
 * The order's totals once this payment is taken, the way Orders::Pricing and Payments::Processor will charge them:
 * the tips already taken plus this one, and the rounding from roundingForPayment.
 */
export function payableTotals(order: PayableOrder, opts: { settings?: Settings; tip_minor?: number; cash: boolean }): Totals {
  const tip_minor = (order.tip_minor ?? 0) + Math.max(0, opts.tip_minor ?? 0);
  const t = totalsWithCharges(order.lines, order, { settings: opts.settings, staffMeal: order.is_staff_meal, tip_minor, discount_minor: order.discount_minor });
  const rounding_minor = roundingForPayment(t.total_minor, order.rounding_minor ?? 0, order.paid_minor ?? 0, opts.cash, opts.settings);
  return { ...t, rounding_minor, total_minor: order.is_staff_meal ? 0 : t.total_minor + rounding_minor };
}

/**
 * What Payments::Processor will ask for when this payment reaches it, from the order as the server just saved it. Its
 * total already holds the stored rounding and tips; the payment adds its tip and, as the first cash payment, rounds.
 */
export function serverDueForPayment(order: { total_minor: number; rounding_minor: number; paid_minor: number; is_staff_meal: boolean }, opts: { settings?: Settings; tip_minor?: number; cash: boolean }): number {
  const unrounded = order.total_minor - order.rounding_minor + Math.max(0, opts.tip_minor ?? 0);
  const rounding = roundingForPayment(unrounded, order.rounding_minor, order.paid_minor, opts.cash, opts.settings);
  return Math.max(0, (order.is_staff_meal ? 0 : unrounded + rounding) - order.paid_minor);
}

/**
 * What to send when the server will ask for a different amount than the payment screen showed (a discount re-checked
 * on the server, a price changed): the same payments when they agree or when this stays a part payment; the payments
 * moved to the server's figure when the gap is under Rs 1 (paisa rounding) or when the cashier was already shown that
 * figure (seenServerDueMinor, from the stop before); otherwise null, so the cashier sees it before any money is taken.
 */
export function reconcilePayments<P extends { amount_minor: number; tendered_minor?: number | null }>(payments: P[], shownDueMinor: number, serverDueMinor: number, seenServerDueMinor?: number | null): P[] | null {
  const diff = serverDueMinor - shownDueMinor;
  if (diff === 0 || !payments.length) return payments;
  const paying = payments.reduce((s, p) => s + p.amount_minor, 0);
  // Within Rs 1 of either figure: the cashier means to settle the order, so the two must agree.
  const full = paying + 100 >= Math.min(shownDueMinor, serverDueMinor);
  if (!full) return payments;
  if (Math.abs(diff) >= 100 && serverDueMinor !== seenServerDueMinor) return null;
  return shiftPayments(payments, diff);
}

/** The payments moved by diff: a rise goes on the last one; a cut comes off the last ones first, dropping any that reach zero. */
function shiftPayments<P extends { amount_minor: number; tendered_minor?: number | null }>(payments: P[], diff: number): P[] {
  const out = [...payments];
  let left = diff;
  for (let i = out.length - 1; i >= 0 && left !== 0; i--) {
    const p = out[i];
    const amount = Math.max(0, p.amount_minor + left);
    left -= amount - p.amount_minor;
    const tendered = p.tendered_minor != null ? Math.max(p.tendered_minor, amount) : p.tendered_minor;
    out[i] = { ...p, amount_minor: amount, ...(tendered != null ? { tendered_minor: tendered } : {}) };
  }
  return out.filter((p) => p.amount_minor > 0);
}

