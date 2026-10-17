// SPEC Regular discounts on the till. The server takes a regular customer's recency discount off every order
// (Marketing::RegularDiscounts). Offline the till works out the same discount itself, so a sale taken with no
// connection is priced, paid and put on khata at the figure the server will ask for when the queue reaches it.
// Pure; the till's live inputs are gathered in pos-actions (regularPricing).
import { lineTotals, settingValue, type CartLine } from "@/lib/pricing";
import { settingBool, type Settings } from "@/lib/pos-rules";
import type { RegularDiscountTier } from "@/lib/types";
import type { Cart, CartDiscount } from "@/store/cart";

/** The id of the discount line the till adds itself; the server's own line replaces it once the order syncs. */
export const LOCAL_REGULAR_ID = "local-regular";

export interface RegularCustomer { id: string; is_walk_in?: boolean | null; last_order_at?: string | null }

export interface RegularInput {
  lines: CartLine[];
  orderType: string;
  customer: RegularCustomer | null | undefined;
  tiers: RegularDiscountTier[] | null | undefined;
  settings: Settings;
  /** The time of sale; recency is counted to it, as the server does for an order that syncs later. */
  at: Date;
  /** A product's category, for tiers that leave categories out. */
  categoryOf?: (productId: string) => string | null | undefined;
}

/** RegularDiscountTier#discount_for: nothing under the minimum order, a percent rounded half up, a fixed amount capped. */
export function tierAmount(tier: Pick<RegularDiscountTier, "kind" | "value" | "min_order_minor">, base_minor: number): number {
  if (base_minor <= 0 || base_minor < (tier.min_order_minor ?? 0)) return 0;
  const cents = Math.round(Number(tier.value) * 100); // value has two decimals; whole numbers keep the sum exact
  return tier.kind === "percent" ? Math.round((base_minor * cents) / 10000) : Math.min(base_minor, cents);
}

function excluded(tier: RegularDiscountTier, line: CartLine, categoryOf?: RegularInput["categoryOf"]): boolean {
  if (!line.product_id) return false;
  if ((tier.excluded_product_ids ?? []).includes(line.product_id)) return true;
  const category = categoryOf?.(line.product_id);
  return !!category && (tier.excluded_category_ids ?? []).includes(category);
}

/**
 * The tier the customer qualifies for and its amount, exactly as Marketing::RegularDiscounts.apply!: a known customer
 * who has ordered before and is not blocked; the smallest day window that covers the days since their last order and
 * does not leave out this order type; worked out on each line the tier keeps, after the product's own discount only.
 */
export function regularDiscountFor(input: RegularInput): { tier: RegularDiscountTier; amount_minor: number } | null {
  const { customer, settings } = input;
  if (!customer || customer.is_walk_in || !customer.last_order_at) return null;
  if (!settingBool(settings, "marketing.regular_discounts.enabled", true)) return null;
  const blocked = settingValue<unknown>(settings, "marketing.regular_discounts.blocked_customer_ids", []);
  if (Array.isArray(blocked) && blocked.map(String).includes(customer.id)) return null;
  const last = Date.parse(customer.last_order_at);
  if (!Number.isFinite(last)) return null;
  const days = Math.floor((input.at.getTime() - last) / 86_400_000);
  const tier = (input.tiers ?? [])
    .filter((t) => t.active && !t.archived_at)
    .sort((a, b) => a.within_days - b.within_days)
    .find((t) => days <= t.within_days && !(t.excluded_order_types ?? []).includes(input.orderType));
  if (!tier) return null;
  const base = input.lines
    .filter((l) => l.status !== "cancelled" && !excluded(tier, l, input.categoryOf))
    .reduce((s, l) => { const t = lineTotals(l); return s + t.line_subtotal_minor - t.line_discount_minor; }, 0);
  const amount_minor = tierAmount(tier, base);
  return amount_minor > 0 ? { tier, amount_minor } : null;
}

/**
 * The cart with the till's own regular discount line worked out again: the previous one (if any) is taken off first,
 * so calling this after any change is safe. Nothing is added when `apply` is false (the server prices the order) or
 * the server already put a regular discount on it.
 */
export function withRegularDiscount(cart: Cart, ctx: Omit<RegularInput, "lines" | "orderType"> & { apply: boolean }): Cart {
  const mine = cart.discounts?.find((d) => d.id === LOCAL_REGULAR_ID);
  const others = (cart.discounts ?? []).filter((d) => d.id !== LOCAL_REGULAR_ID);
  const rest = Math.max(0, (cart.discount_minor ?? 0) - (mine?.amount_minor ?? 0));
  const base: Cart = mine ? { ...cart, discounts: others, discount_minor: rest || undefined } : cart;
  if (!ctx.apply || cart.is_staff_meal || others.some((d) => d.kind === "regular")) return base;
  const r = regularDiscountFor({ ...ctx, lines: cart.lines, orderType: cart.order_type });
  if (!r) return base;
  const line: CartDiscount = { id: LOCAL_REGULAR_ID, kind: "regular", value: r.amount_minor / 100, amount_minor: r.amount_minor, reason: `Regular discount: ${r.tier.name}`, order_item_id: null };
  return { ...base, discounts: [...others, line], discount_minor: rest + r.amount_minor };
}

/** The time of sale for recency: when the cart was started, never later than now. */
export function saleTime(cart: Pick<Cart, "client_created_at">, now = new Date()): Date {
  const t = Date.parse(cart.client_created_at);
  return Number.isFinite(t) && t < now.getTime() ? new Date(t) : now;
}
