// Local pricing for the till, mirroring easalpha-api app/services/orders/pricing.rb and Product#price_for.
import type { BusinessSettings, Catalog, DiscountType, Product, TaxRate, Variant } from "@/lib/types";

export interface CartModifier { modifier_id: string; name: string; price_minor: number; quantity: number }
export interface CartLine {
  key: string;
  id?: string;
  product_id?: string;
  variant_id?: string | null;
  deal_id?: string;
  name: string;
  unit_price_minor: number;
  quantity: number;
  notes?: string | null;
  modifiers: CartModifier[];
  open_item?: { name: string; price_minor: number };
  price_override_minor?: number | null;
  tax_rate: number;
  tax_inclusive: boolean;
  station_id?: string | null;
  status?: string;
  sent?: boolean;
  /** SPEC: the discount set on the product itself (% or Rs), snapshotted onto the line so offline totals match the server. */
  discount_value?: number | string | null;
  discount_type?: DiscountType | null;
}

export interface LineTotals { modifiers_minor: number; line_subtotal_minor: number; line_discount_minor: number; line_tax_minor: number; line_total_minor: number }
export interface Totals { subtotal_minor: number; discount_minor: number; service_charge_minor: number; tax_minor: number; rounding_minor: number; tip_minor: number; total_minor: number; service_charge_percent: number; delivery_charge_minor: number }

export function effectiveUnit(line: CartLine) {
  return line.price_override_minor !== null && line.price_override_minor !== undefined ? line.price_override_minor : line.unit_price_minor;
}

/** Discount fields to copy from a product onto a cart line. */
export function productDiscountFields(p: Pick<Product, "discount_value" | "discount_type"> | null | undefined): Pick<CartLine, "discount_value" | "discount_type"> {
  if (!p || p.discount_value == null || !(Number(p.discount_value) > 0)) return { discount_value: null, discount_type: null };
  return { discount_value: p.discount_value, discount_type: p.discount_type ?? "percent" };
}

/**
 * Product discount exactly as Product#discount_minor_for on the server:
 * percent -> round(line_subtotal * value / 100); amount -> round(value * 100 * quantity); capped at the line subtotal;
 * zero when the value is not positive or the price was overridden (Orders::Pricing skips overridden lines).
 */
export function lineDiscount(line: Pick<CartLine, "discount_value" | "discount_type" | "price_override_minor" | "quantity">, line_subtotal_minor: number): number {
  if (line.price_override_minor !== null && line.price_override_minor !== undefined) return 0;
  const value = Number(line.discount_value ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const amount = line.discount_type === "amount" ? Math.round(value * 100 * line.quantity) : Math.round((line_subtotal_minor * value) / 100);
  return Math.max(0, Math.min(amount, line_subtotal_minor));
}

function taxOn(base: number, rate: number, inclusive: boolean) {
  const r = (rate || 0) / 100;
  if (inclusive) return { tax: r === 0 ? 0 : Math.round(base - base / (1 + r)), total: base };
  const tax = Math.round(base * r);
  return { tax, total: base + tax };
}

export function lineTotals(line: CartLine): LineTotals {
  const modifiers_minor = Math.round(line.modifiers.reduce((s, m) => s + m.price_minor * (m.quantity || 1), 0));
  const line_subtotal_minor = Math.round((effectiveUnit(line) + modifiers_minor) * line.quantity);
  const line_discount_minor = lineDiscount(line, line_subtotal_minor);
  const { tax, total } = taxOn(line_subtotal_minor - line_discount_minor, line.tax_rate, line.tax_inclusive);
  return { modifiers_minor, line_subtotal_minor, line_discount_minor, line_tax_minor: tax, line_total_minor: total };
}

export function serviceChargeFor(orderType: string, settings: BusinessSettings | undefined): number {
  const types = (settings?.service_charge_order_types as string[] | undefined) ?? ["dine_in"];
  return types.includes(orderType) ? Number(settings?.service_charge_percent ?? 0) : 0;
}

/** One key of the till settings object (business settings merged with the settings store), e.g. "catalog.display.columns". */
export function settingValue<T>(settings: BusinessSettings | Record<string, unknown> | undefined | null, key: string, fallback: T): T {
  const v = settings?.[key];
  return v === undefined || v === null || v === "" ? fallback : (v as T);
}

/** SPEC "Display Settings": how the POS tile grid draws. Columns are clamped to 3-6. */
export function displaySettings(settings: BusinessSettings | undefined | null) {
  const cols = Number(settingValue(settings, "catalog.display.columns", 4));
  return {
    images: settingValue<boolean>(settings, "catalog.display.images", true) !== false,
    columns: Number.isFinite(cols) ? Math.min(6, Math.max(3, Math.round(cols))) : 4,
    showPrices: settingValue<boolean>(settings, "catalog.display.show_prices", true) !== false,
  };
}

export function computeTotals(lines: CartLine[], opts: { orderType: string; settings?: BusinessSettings; tip_minor?: number; rounding_minor?: number; staffMeal?: boolean; discount_minor?: number; delivery_charge_minor?: number }): Totals {
  const active = lines.filter((l) => l.status !== "cancelled");
  let lt = active.map(lineTotals);
  const subtotal_minor = lt.reduce((s, t) => s + t.line_subtotal_minor, 0);
  const product_discount_minor = lt.reduce((s, t) => s + t.line_discount_minor, 0);
  // Order-level discount (e.g. loyalty points) comes after the product discounts and is allocated to lines in proportion
  // to what is left of their subtotals, as the server does, so tax is on the discounted amount.
  const pool_minor = subtotal_minor - product_discount_minor;
  const order_discount_minor = Math.max(0, Math.min(opts.discount_minor ?? 0, pool_minor));
  if (order_discount_minor > 0 && pool_minor > 0) {
    const bases = lt.map((t) => Math.max(0, t.line_subtotal_minor - t.line_discount_minor));
    const shares = bases.map((b) => (order_discount_minor * b) / pool_minor);
    const alloc = shares.map(Math.floor);
    let rem = order_discount_minor - alloc.reduce((s, v) => s + v, 0);
    shares.map((s, i) => [s - alloc[i], i] as const).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rem > 0 && bases[i] > 0) { alloc[i] += 1; rem -= 1; } });
    lt = lt.map((t, i) => {
      const line_discount_minor = t.line_discount_minor + alloc[i];
      const { tax, total } = taxOn(t.line_subtotal_minor - line_discount_minor, active[i].tax_rate, active[i].tax_inclusive);
      return { ...t, line_discount_minor, line_tax_minor: tax, line_total_minor: total };
    });
  }
  const discount_minor = lt.reduce((s, t) => s + t.line_discount_minor, 0);
  const service_charge_percent = serviceChargeFor(opts.orderType, opts.settings);
  const service_charge_minor = Math.round(((subtotal_minor - discount_minor) * service_charge_percent) / 100);
  const tax_minor = lt.reduce((s, t) => s + t.line_tax_minor, 0);
  const rounding_minor = opts.rounding_minor ?? 0;
  const tip_minor = opts.tip_minor ?? 0;
  const delivery_charge_minor = Math.max(0, opts.delivery_charge_minor ?? 0);
  let total_minor = lt.reduce((s, t) => s + t.line_total_minor, 0) + service_charge_minor + delivery_charge_minor + rounding_minor + tip_minor;
  if (opts.staffMeal) total_minor = 0;
  return { subtotal_minor, discount_minor, service_charge_minor, tax_minor, rounding_minor, tip_minor, total_minor, service_charge_percent, delivery_charge_minor };
}

/** Cash rounding as the server does it: nearest step (settings.cash_rounding in rupees). Returns the rounding adjustment in minor units. */
export function cashRounding(total_minor: number, settings?: BusinessSettings): number {
  const step = Number(settings?.cash_rounding ?? 0) * 100;
  if (!step) return 0;
  const rounded = Math.floor((total_minor + step / 2) / step) * step;
  return rounded - total_minor;
}

export function priceFor(product: Product, orderType: string, variant?: Variant | null, branchId?: string | null): number {
  const candidates = (product.prices ?? []).filter((p) => (p.variant_id ?? null) === (variant?.id ?? null) && p.order_type === orderType);
  const row = candidates.find((p) => p.branch_id === branchId) ?? candidates.find((p) => !p.branch_id);
  if (row) return row.price_minor;
  return variant ? variant.price_minor : product.base_price_minor;
}

export function taxFor(product: Product | null, catalog: Catalog | null): { rate: number; inclusive: boolean } {
  const rates: TaxRate[] = catalog?.tax_rates ?? [];
  const t = (product?.tax_rate_id ? rates.find((r) => r.id === product.tax_rate_id) : null) ?? rates.find((r) => r.is_default && r.active) ?? null;
  return { rate: t?.rate ?? 0, inclusive: t?.inclusive ?? false };
}

/** Copy the current product discounts onto lines that came from the server or an older cache (they carry none). */
export function attachDiscounts(lines: CartLine[], catalog: Catalog | null): CartLine[] {
  if (!catalog) return lines;
  return lines.map((l) => {
    if (!l.product_id || l.open_item || l.discount_value !== undefined) return l;
    const p = catalog.products.find((x) => x.id === l.product_id);
    return p ? { ...l, ...productDiscountFields(p) } : l;
  });
}

/** Re-price product lines when the order type changes (open items and overrides keep their price). */
export function repriceLines(lines: CartLine[], orderType: string, catalog: Catalog | null, branchId?: string | null): CartLine[] {
  if (!catalog) return lines;
  return lines.map((l) => {
    if (!l.product_id || l.open_item || l.price_override_minor) return l;
    const p = catalog.products.find((x) => x.id === l.product_id);
    if (!p) return l;
    const v = l.variant_id ? p.variants?.find((x) => x.id === l.variant_id) : null;
    return { ...l, unit_price_minor: priceFor(p, orderType, v, branchId), ...productDiscountFields(p) };
  });
}

/** Payload line for POST /orders. */
export function toLineInput(l: CartLine) {
  return {
    id: l.id,
    product_id: l.product_id,
    variant_id: l.variant_id ?? undefined,
    deal_id: l.deal_id,
    quantity: l.quantity,
    notes: l.notes ?? undefined,
    modifiers: l.modifiers.length ? l.modifiers.map((m) => ({ modifier_id: m.modifier_id, quantity: m.quantity })) : undefined,
    open_item: l.open_item,
    price_override_minor: l.price_override_minor ?? undefined,
  };
}
