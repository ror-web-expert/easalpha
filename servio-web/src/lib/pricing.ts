// Local pricing for the till, mirroring servio-api app/services/orders/pricing.rb and Product#price_for.
import type { BusinessSettings, Catalog, Product, TaxRate, Variant } from "@/lib/types";

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
}

export interface LineTotals { modifiers_minor: number; line_subtotal_minor: number; line_tax_minor: number; line_total_minor: number }
export interface Totals { subtotal_minor: number; discount_minor: number; service_charge_minor: number; tax_minor: number; rounding_minor: number; tip_minor: number; total_minor: number; service_charge_percent: number; delivery_charge_minor: number }

export function effectiveUnit(line: CartLine) {
  return line.price_override_minor !== null && line.price_override_minor !== undefined ? line.price_override_minor : line.unit_price_minor;
}

export function lineTotals(line: CartLine): LineTotals {
  const modifiers_minor = Math.round(line.modifiers.reduce((s, m) => s + m.price_minor * (m.quantity || 1), 0));
  const line_subtotal_minor = Math.round((effectiveUnit(line) + modifiers_minor) * line.quantity);
  const r = (line.tax_rate || 0) / 100;
  let line_tax_minor: number;
  let line_total_minor: number;
  if (line.tax_inclusive) {
    line_tax_minor = r === 0 ? 0 : Math.round(line_subtotal_minor - line_subtotal_minor / (1 + r));
    line_total_minor = line_subtotal_minor;
  } else {
    line_tax_minor = Math.round(line_subtotal_minor * r);
    line_total_minor = line_subtotal_minor + line_tax_minor;
  }
  return { modifiers_minor, line_subtotal_minor, line_tax_minor, line_total_minor };
}

export function serviceChargeFor(orderType: string, settings: BusinessSettings | undefined): number {
  const types = (settings?.service_charge_order_types as string[] | undefined) ?? ["dine_in"];
  return types.includes(orderType) ? Number(settings?.service_charge_percent ?? 0) : 0;
}

export function computeTotals(lines: CartLine[], opts: { orderType: string; settings?: BusinessSettings; tip_minor?: number; rounding_minor?: number; staffMeal?: boolean; discount_minor?: number; delivery_charge_minor?: number }): Totals {
  const active = lines.filter((l) => l.status !== "cancelled");
  let lt = active.map(lineTotals);
  const subtotal_minor = lt.reduce((s, t) => s + t.line_subtotal_minor, 0);
  // Order-level discount (e.g. loyalty points) allocated to lines in proportion to their subtotals, as the server does, so tax is on the discounted amount.
  const discount_minor = Math.max(0, Math.min(opts.discount_minor ?? 0, subtotal_minor));
  if (discount_minor > 0 && subtotal_minor > 0) {
    const shares = lt.map((t) => (discount_minor * t.line_subtotal_minor) / subtotal_minor);
    const alloc = shares.map(Math.floor);
    let rem = discount_minor - alloc.reduce((s, v) => s + v, 0);
    shares.map((s, i) => [s - alloc[i], i] as const).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rem > 0) { alloc[i] += 1; rem -= 1; } });
    lt = lt.map((t, i) => {
      const base = t.line_subtotal_minor - alloc[i];
      const r = (active[i].tax_rate || 0) / 100;
      const line_tax_minor = active[i].tax_inclusive ? (r === 0 ? 0 : Math.round(base - base / (1 + r))) : Math.round(base * r);
      return { ...t, line_tax_minor, line_total_minor: active[i].tax_inclusive ? base : base + line_tax_minor };
    });
  }
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

/** Re-price product lines when the order type changes (open items and overrides keep their price). */
export function repriceLines(lines: CartLine[], orderType: string, catalog: Catalog | null, branchId?: string | null): CartLine[] {
  if (!catalog) return lines;
  return lines.map((l) => {
    if (!l.product_id || l.open_item || l.price_override_minor) return l;
    const p = catalog.products.find((x) => x.id === l.product_id);
    if (!p) return l;
    const v = l.variant_id ? p.variants?.find((x) => x.id === l.variant_id) : null;
    return { ...l, unit_price_minor: priceFor(p, orderType, v, branchId) };
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
