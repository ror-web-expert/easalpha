// SPEC "Customers, credit, loyalty and feedback": the three discount mechanisms as the till shows them, and reviews
// from the tablet. Loyalty points (a points amount or a redemption option), regular discounts (recency tiers the
// server applies by itself when a customer with recent orders is attached) and vouchers (personal codes sent from the
// POS campaign screen, or one public code). Every one of them is decided on the server, so nothing here is queued
// offline; the pure helpers at the top are what the screens and the tests share.
import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import type { Customer, ID, LoyaltyRedemptionOption, Order, OrderDiscount, Page, Review, VoucherBatch, VoucherIssueResult } from "@/lib/types";

type DiscountLike = Pick<OrderDiscount, "kind" | "reason" | "value">;

/**
 * The label of one discount line by kind. The server's reason already carries the detail: "Voucher CODE (batch)",
 * "Regular discount: <tier>", "120 points: Free tea" or "50 loyalty points", the promotion's name, or the cashier's reason.
 */
export function discountLabel(d: DiscountLike): string {
  const reason = d.reason?.trim() || "";
  switch (d.kind) {
    case "voucher": return reason || "Voucher";
    case "regular": return reason.startsWith("Regular discount") ? reason : `Regular discount${reason ? `: ${reason}` : ""}`;
    case "loyalty": return reason ? `Loyalty: ${reason}` : "Loyalty points";
    case "promotion": return reason ? `Promotion: ${reason}` : "Promotion";
    case "percent": return `${Number(d.value)}% discount${reason ? ` (${reason})` : ""}`;
    case "fixed": return `Discount${reason ? ` (${reason})` : ""}`;
    default: return reason || "Discount";
  }
}

/** SPEC: regular discounts are applied by the server from the recency tiers; the cashier cannot edit or remove them. */
export const discountLocked = (d: Pick<OrderDiscount, "kind">) => d.kind === "regular";

/** The code of an applied voucher line ("Voucher EID-7F2A (Eid 2026)" -> "EID-7F2A"), or null for other kinds. */
export function voucherCode(d: DiscountLike): string | null {
  if (d.kind !== "voucher") return null;
  const m = /^Voucher\s+(\S+)/i.exec(d.reason ?? "");
  return m ? m[1] : null;
}

export interface DiscountRow { key: string; label: string; amount_minor: number; kind: string; locked: boolean; id: ID | null }

/**
 * Rows for the totals block: one per order-level discount line plus an "Item discounts" row for the product
 * discounts (what remains of the total once the lines are taken out). A total with no lines stays one plain row.
 */
export function discountRows(discounts: Pick<OrderDiscount, "id" | "kind" | "value" | "amount_minor" | "reason">[] | null | undefined, total_discount_minor: number): DiscountRow[] {
  const lines = (discounts ?? []).filter((d) => d.amount_minor > 0);
  if (!lines.length) return total_discount_minor > 0 ? [{ key: "all", label: "Discount", amount_minor: total_discount_minor, kind: "item", locked: true, id: null }] : [];
  const rows: DiscountRow[] = lines.map((d) => ({ key: d.id, label: discountLabel(d), amount_minor: d.amount_minor, kind: d.kind, locked: discountLocked(d), id: d.id }));
  const items = total_discount_minor - lines.reduce((s, d) => s + d.amount_minor, 0);
  if (items > 0) rows.unshift({ key: "items", label: "Item discounts", amount_minor: items, kind: "item", locked: true, id: null });
  return rows;
}

// ---- Vouchers ----
const VOUCHER_ERRORS: Record<string, { title: string; message: string }> = {
  "voucher.invalid": { title: "Voucher not found", message: "This voucher code does not exist." },
  "voucher.used": { title: "Voucher already used", message: "This voucher was already redeemed." },
  "voucher.customer": { title: "Wrong customer", message: "This voucher belongs to another customer. Attach that customer to the order first." },
  "voucher.expired": { title: "Voucher expired", message: "This voucher has expired." },
  "voucher.exhausted": { title: "Voucher limit reached", message: "This voucher has reached its usage limit." },
  "voucher.min_spend": { title: "Below the minimum spend", message: "The order is below this voucher's minimum spend." },
  "voucher.already": { title: "Voucher already applied", message: "A voucher is already applied to this order. Remove it to use another." },
  "voucher.inactive": { title: "Voucher switched off", message: "This voucher batch is switched off." },
  "voucher.public": { title: "Public batch", message: "A public batch has one shared code and is not sent per customer." },
  "order.not_editable": { title: "Order closed", message: "This order can no longer be changed." },
};

/**
 * The toast for a failed voucher apply: the server's message (it carries the expiry date or the minimum spend) under
 * a short title by code; unknown codes fall back to the message as sent, and a network failure says so.
 */
export function voucherError(e: unknown): { title: string; message: string } {
  if (e instanceof ApiError) {
    if (e.isNetwork) return { title: "Could not apply the voucher", message: "The voucher needs the internet. Try again when the till is online." };
    const known = VOUCHER_ERRORS[e.code];
    if (known) return { title: known.title, message: e.message?.trim() || known.message };
    return { title: "Could not apply the voucher", message: e.message || "Something went wrong" };
  }
  return { title: "Could not apply the voucher", message: e instanceof Error && e.message ? e.message : "Something went wrong" };
}

/** "10% off" or "Rs 500 off" for a batch or an option whose value is in major units. */
export function valueLabel(value_kind: string, value: number | string, currency?: string): string {
  const v = Number(value);
  if (value_kind === "percent") return `${Number(v.toFixed(2))}% off`;
  return `${formatMoney(Math.round(v * 100), currency)} off`;
}

/** A personal batch can be sent only while it is active and not yet expired. */
export function batchSendable(b: Pick<VoucherBatch, "active" | "expired" | "kind">): boolean {
  return b.kind === "personal" && b.active && !b.expired;
}

// ---- Loyalty redemption options ----
/** What an option gives: "Free Green tea", "10% off" or "Rs 100 off". */
export function optionGives(o: Pick<LoyaltyRedemptionOption, "kind" | "value" | "product_name">, currency?: string): string {
  if (o.kind === "free_item") return `Free ${o.product_name ?? "item"}`;
  return valueLabel(o.kind, o.value, currency);
}

export interface OptionContext { points: number | null; hasCustomer: boolean; alreadyRedeemed: boolean; online: boolean; productIds?: string[] | null }

/**
 * Whether a redemption option can be tapped now, with the reason shown under a disabled button. The server checks the
 * same things (loyalty.no_customer, loyalty.insufficient, loyalty.already, loyalty.item_missing).
 */
export function optionAvailability(o: Pick<LoyaltyRedemptionOption, "points" | "active" | "kind" | "product_id" | "product_name">, ctx: OptionContext): { ok: boolean; reason: string | null } {
  if (!o.active) return { ok: false, reason: "Switched off" };
  if (!ctx.online) return { ok: false, reason: "Needs the internet" };
  if (!ctx.hasCustomer) return { ok: false, reason: "Attach a customer first" };
  if (ctx.alreadyRedeemed) return { ok: false, reason: "Points already redeemed on this order" };
  if (ctx.points === null) return { ok: false, reason: "Loading points" };
  if (ctx.points < o.points) return { ok: false, reason: `Needs ${o.points} points (has ${ctx.points})` };
  if (o.kind === "free_item" && ctx.productIds && o.product_id && !ctx.productIds.includes(o.product_id)) return { ok: false, reason: `Add ${o.product_name ?? "the item"} to the order first` };
  return { ok: true, reason: null };
}

// ---- Reviews ----
/** SPEC Reviews: the 1-to-5 rating shown as a word; no rating is Pending (Unrated). Mirrors Review::WORDS on the API. */
export const RATING_WORDS: Record<number, string> = { 1: "Poor", 2: "Fair", 3: "Good", 4: "Very good", 5: "Excellent" };
export function ratingWord(rating: number | null | undefined): string {
  const r = Number(rating);
  return Number.isInteger(r) && RATING_WORDS[r] ? RATING_WORDS[r] : "Pending";
}

// ---- API (PIN session token; online only) ----
export const applyVoucher = (orderId: ID, code: string) => api<Order>(`/orders/${orderId}/discounts`, { method: "POST", auth: "pos", body: { voucher_code: code.trim().toUpperCase() } });
export const applyCoupon = (orderId: ID, code: string, approver_pin?: string) => api<Order>(`/orders/${orderId}/discounts`, { method: "POST", auth: "pos", body: { kind: "promotion", coupon_code: code.trim().toUpperCase(), approver_pin } });
export const removeDiscount = (orderId: ID, discountId: ID) => api<Order>(`/orders/${orderId}/discounts/${discountId}`, { method: "DELETE", auth: "pos" });
export const listRedemptionOptions = () => api<{ data: LoyaltyRedemptionOption[] }>("/loyalty/redemption_options", { auth: "pos" }).then((r) => r.data.filter((o) => o.active).sort((a, b) => a.sort_order - b.sort_order || a.points - b.points));
export const redeemOption = (orderId: ID, option_id: ID) => api<Order>(`/orders/${orderId}/redeem_option`, { method: "POST", auth: "pos", body: { option_id } });
export const listPersonalBatches = () => api<{ data: VoucherBatch[] }>("/voucher_batches", { auth: "pos", query: { kind: "personal" } }).then((r) => r.data);
export const issueVouchers = (batchId: ID, customer_ids: ID[]) => api<VoucherIssueResult>(`/voucher_batches/${batchId}/issue`, { method: "POST", auth: "pos", body: { customer_ids, send: true } });
export const searchCustomers = (q: string) => api<Page<Customer>>("/customers", { auth: "pos", query: { q: q.trim() || undefined, limit: 30 } }).then((p) => p.data.filter((c) => !c.is_walk_in));
export const createReview = (input: { order_id: ID; rating?: number | null; comment?: string | null }) => api<Review>("/reviews", { method: "POST", auth: "pos", body: { order_id: input.order_id, rating: input.rating ?? undefined, comment: input.comment?.trim() || undefined, source: "tablet" } });
