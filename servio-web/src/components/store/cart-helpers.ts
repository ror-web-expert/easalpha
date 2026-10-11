import type { StorefrontOrderStage } from "@/lib/types";
import { formatMoney } from "@/lib/money";

// Pure helpers for the public storefront cart and order tracking. No React, no store: everything here is unit-tested in
// cart-helpers.test.ts. Money is in minor units (paisa) like the rest of the app; the delivery charge is never computed
// here because the server owns it (fixed or percent, waived above free_above_minor).

export type StorefrontOrderType = "delivery" | "takeaway";

export interface StorefrontCartLine {
  key: string;
  product_id: string;
  variant_id: string | null;
  name: string;
  variant_name: string | null;
  unit_minor: number;
  quantity: number;
}

export interface StorefrontCustomer { name: string; phone: string; address: string; area: string; city: string }

/** The `delivery` section of Website Config as the storefront receives it (unknown keys tolerated). */
export interface DeliverySettings { enabled?: unknown; min_order_minor?: unknown; free_above_minor?: unknown; eta_minutes?: unknown }

export const EMPTY_CUSTOMER: StorefrontCustomer = { name: "", phone: "", address: "", area: "", city: "" };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** One cart line per product + variant; the same variant tapped twice bumps the quantity instead of adding a row. */
export function lineKey(productId: string, variantId?: string | null): string {
  return variantId ? `${productId}:${variantId}` : productId;
}

export function subtotal(lines: StorefrontCartLine[]): number {
  return lines.reduce((sum, l) => sum + l.unit_minor * l.quantity, 0);
}

export function count(lines: StorefrontCartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

export function deliveryEnabled(delivery: DeliverySettings | null | undefined): boolean {
  return delivery?.enabled === true;
}

export function deliveryMinimum(delivery: DeliverySettings | null | undefined): number {
  return Math.max(0, num(delivery?.min_order_minor) ?? 0);
}

/**
 * Whether a delivery order of this subtotal may be submitted. The server enforces the same rule (online.no_delivery,
 * online.min_order); this gives the guest a friendly line before they tap Place order.
 */
export function canDeliver(delivery: DeliverySettings | null | undefined, subtotalMinor: number, currency = "PKR"): { ok: boolean; reason: string | null } {
  if (!deliveryEnabled(delivery)) return { ok: false, reason: "This restaurant does not deliver. Choose Pickup instead." };
  const min = deliveryMinimum(delivery);
  if (min > 0 && subtotalMinor < min) {
    return { ok: false, reason: `The minimum order for delivery is ${formatMoney(min, currency)}. Add ${formatMoney(min - subtotalMinor, currency)} more to continue.` };
  }
  return { ok: true, reason: null };
}

/** "Delivery in about 45 minutes · minimum order Rs 500 · free above Rs 2,000", or "" when delivery is off. */
export function deliveryLine(delivery: DeliverySettings | null | undefined, currency = "PKR"): string {
  if (!deliveryEnabled(delivery)) return "";
  const parts: string[] = [];
  const eta = num(delivery?.eta_minutes);
  parts.push(eta && eta > 0 ? `Delivery in about ${eta} minutes` : "Delivery available");
  const min = deliveryMinimum(delivery);
  if (min > 0) parts.push(`minimum order ${formatMoney(min, currency)}`);
  const free = num(delivery?.free_above_minor);
  if (free !== null && free > 0) parts.push(`free above ${formatMoney(free, currency)}`);
  return parts.join(" · ");
}

export function phoneDigits(phone: string): string {
  return (phone ?? "").replace(/[^0-9]/g, "");
}

/** Pakistani mobiles are 03xx-xxxxxxx (11 digits) or +92 3xx xxxxxxx (12); anything with at least 10 digits is accepted. */
export function validPhone(phone: string): boolean {
  const d = phoneDigits(phone);
  return d.length >= 10 && d.length <= 15;
}

export interface CheckoutInput {
  lines: StorefrontCartLine[];
  order_type: StorefrontOrderType;
  customer: StorefrontCustomer;
  delivery: DeliverySettings | null | undefined;
  currency?: string;
}

/** Everything that still blocks Place order, in the order the form shows it. Empty means the order can be submitted. */
export function checkoutProblems(input: CheckoutInput): string[] {
  const problems: string[] = [];
  if (!input.lines.length) problems.push("Your cart is empty.");
  if (!input.customer.name.trim()) problems.push("Enter your name.");
  if (!validPhone(input.customer.phone)) problems.push("Enter a phone number with at least 10 digits, for example +92 300 1234567.");
  if (input.order_type === "delivery") {
    if (!input.customer.address.trim()) problems.push("Enter a delivery address.");
    const d = canDeliver(input.delivery, subtotal(input.lines), input.currency);
    if (!d.ok && d.reason) problems.push(d.reason);
  }
  return problems;
}

export const FINAL_STAGES: readonly StorefrontOrderStage[] = ["done", "rejected", "cancelled"];

export function isFinalStage(stage: StorefrontOrderStage | null | undefined): boolean {
  return !!stage && FINAL_STAGES.includes(stage);
}

export interface StageLabel { title: string; text: string; step: number; tone: "progress" | "done" | "failed" }

/** The five tracking steps; the last one depends on the order type. */
export function trackingSteps(orderType: StorefrontOrderType): string[] {
  return ["Waiting for the restaurant", "Accepted", "Preparing", "Ready", orderType === "delivery" ? "On the way" : "Collected"];
}

/** Human copy for a tracking stage. `step` is 1-5 for live orders, 5 for done, 0 for rejected or cancelled. */
export function stageLabel(stage: StorefrontOrderStage, orderType: StorefrontOrderType = "delivery", etaMinutes: number | null = null): StageLabel {
  const eta = orderType === "delivery" && etaMinutes && etaMinutes > 0 ? ` Estimated delivery in about ${etaMinutes} minutes.` : "";
  switch (stage) {
    case "waiting": return { title: "Waiting for the restaurant", text: "We have sent your order. The restaurant will confirm it shortly.", step: 1, tone: "progress" };
    case "accepted": return { title: "Order accepted", text: `The restaurant has accepted your order.${eta}`, step: 2, tone: "progress" };
    case "preparing": return { title: "Preparing your order", text: `The kitchen is working on it.${eta}`, step: 3, tone: "progress" };
    case "ready": return { title: orderType === "delivery" ? "Ready for dispatch" : "Ready for pickup", text: orderType === "delivery" ? "Your order is packed and waiting for the rider." : "Your order is ready. Please collect it at the counter.", step: 4, tone: "progress" };
    case "on_the_way": return { title: "On the way", text: `The rider has left with your order.${eta}`, step: 5, tone: "progress" };
    case "done": return { title: orderType === "delivery" ? "Delivered" : "Collected", text: "Enjoy your meal. Thank you for ordering.", step: 5, tone: "done" };
    case "rejected": return { title: "Order rejected", text: "Sorry, the restaurant could not take this order. Please call them if you have questions.", step: 0, tone: "failed" };
    case "cancelled": return { title: "Order cancelled", text: "This order was cancelled. Please contact the restaurant if this is unexpected.", step: 0, tone: "failed" };
    default: return { title: "Order placed", text: "", step: 1, tone: "progress" };
  }
}

/** The rating badge for the header: "4.6 · 23 reviews", or null when nobody has rated yet. */
export function ratingBadge(summary: { average: number | null; rated: number } | null | undefined): { average: string; reviews: string } | null {
  if (!summary || !summary.rated || summary.average === null || summary.average === undefined) return null;
  return { average: Number(summary.average).toFixed(1), reviews: `${summary.rated} review${summary.rated === 1 ? "" : "s"}` };
}
