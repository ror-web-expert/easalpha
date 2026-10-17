// SPEC "Charges" and "Tax" (Payments, charges, tax and the finance ledger), as the till applies them.
// Service charge and delivery charge are each a percent or a fixed amount from the synced settings; they pre-fill the
// payment page and the cashier may change or remove either per order. The No Tax / rate choice only appears when the
// selected payment method's finance account is linked to a tax rate. Everything here is pure so it works offline.
import { computeTotals, settingValue, type CartLine, type Totals, roundToStep, totalRoundingStep } from "@/lib/pricing";
import type { BusinessSettings, OrderType, PaymentMethod, TaxRate } from "@/lib/types";

export type ChargeMode = "percent" | "fixed";
/** value is a percentage for "percent" and minor units (paisa) for "fixed". */
export interface ChargeState { mode: ChargeMode; value: number }
export const NO_CHARGE: ChargeState = { mode: "percent", value: 0 };

type Settings = BusinessSettings | Record<string, unknown> | null | undefined;
/** The order fields that carry a cashier override; undefined/null means "use the default". */
export interface ChargeFields {
  order_type: OrderType | string;
  service_charge_percent?: number | null;
  service_charge_fixed_minor?: number | null;
  delivery_charge_minor?: number | null;
  delivery_charge_percent?: number | null;
}

const num = (v: unknown, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
const mode = (v: unknown, fallback: ChargeMode): ChargeMode => (v === "fixed" || v === "percent" ? v : fallback);

/** Order types the service charge default applies to (charges.service_charge.order_types, legacy service_charge_order_types; dine-in by default). */
export function serviceChargeOrderTypes(settings: Settings): string[] {
  const v = settingValue<unknown>(settings, "charges.service_charge.order_types", settingValue<unknown>(settings, "service_charge_order_types", ["dine_in"]));
  return Array.isArray(v) ? v.map(String) : ["dine_in"];
}

/** Mirrors Orders::Builder.apply_charge_defaults! for the service charge: zero when the type is not covered or the value is blank. */
export function serviceChargeDefault(settings: Settings, orderType: string): ChargeState {
  if (!serviceChargeOrderTypes(settings).includes(orderType)) return NO_CHARGE;
  const value = num(settingValue<unknown>(settings, "charges.service_charge.value", settingValue<unknown>(settings, "service_charge_percent", 0)));
  const m = mode(settingValue<unknown>(settings, "charges.service_charge.mode", "percent"), "percent");
  if (value <= 0) return { mode: m, value: 0 };
  return m === "fixed" ? { mode: "fixed", value: Math.round(value * 100) } : { mode: "percent", value };
}

/** The delivery charge default (charges.delivery_charge.*): fixed rupees by default, or a percent of the net items. */
export function deliveryChargeDefault(settings: Settings): ChargeState {
  const value = num(settingValue<unknown>(settings, "charges.delivery_charge.value", 0));
  const m = mode(settingValue<unknown>(settings, "charges.delivery_charge.mode", "fixed"), "fixed");
  if (value <= 0) return { mode: m, value: 0 };
  return m === "fixed" ? { mode: "fixed", value: Math.round(value * 100) } : { mode: "percent", value };
}

const overridden = (v: number | null | undefined): v is number => v !== null && v !== undefined;

/** The service charge in force on an order: the cashier's values when either is set (zero removes), else the default. */
export function resolveServiceCharge(order: ChargeFields, settings: Settings): ChargeState {
  if (overridden(order.service_charge_fixed_minor) && order.service_charge_fixed_minor > 0) return { mode: "fixed", value: Math.round(order.service_charge_fixed_minor) };
  if (overridden(order.service_charge_percent) || overridden(order.service_charge_fixed_minor)) return { mode: "percent", value: Math.max(0, num(order.service_charge_percent)) };
  return serviceChargeDefault(settings, order.order_type);
}

/** The delivery charge in force: null for non-delivery orders; a zone quote or cashier amount wins over the default. */
export function resolveDeliveryCharge(order: ChargeFields, settings: Settings): ChargeState | null {
  if (order.order_type !== "delivery") return null;
  if (overridden(order.delivery_charge_percent) && order.delivery_charge_percent > 0) return { mode: "percent", value: order.delivery_charge_percent };
  if (overridden(order.delivery_charge_percent) || overridden(order.delivery_charge_minor)) return { mode: "fixed", value: Math.max(0, Math.round(num(order.delivery_charge_minor))) };
  return deliveryChargeDefault(settings);
}

/** Amount in minor units, as Orders::Pricing: fixed as given, percent rounded on the net (subtotal minus discounts). */
export function chargeAmount(state: ChargeState | null | undefined, net_minor: number): number {
  if (!state || state.value <= 0) return 0;
  return state.mode === "fixed" ? Math.round(state.value) : Math.round((Math.max(0, net_minor) * state.value) / 100);
}

/** "10%" or "Rs 150" for the charge row label; empty when the charge is removed. */
export function chargeDisplay(state: ChargeState | null | undefined, currency = "PKR"): string {
  if (!state || state.value <= 0) return "";
  if (state.mode === "percent") return `${Number(state.value.toFixed(2))}%`;
  const major = state.value / 100;
  const text = Number.isInteger(major) ? major.toLocaleString("en-PK") : major.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency === "PKR" ? "Rs" : currency} ${text}`;
}

/** Order fields to send for a charge state (both keys, so the server uses the cashier's values and zero removes). */
export function serviceChargeFields(state: ChargeState): { service_charge_percent: number; service_charge_fixed_minor: number } {
  return { service_charge_percent: state.mode === "percent" ? state.value : 0, service_charge_fixed_minor: state.mode === "fixed" ? Math.round(state.value) : 0 };
}
export function deliveryChargeFields(state: ChargeState): { delivery_charge_percent: number; delivery_charge_minor: number } {
  return { delivery_charge_percent: state.mode === "percent" ? state.value : 0, delivery_charge_minor: state.mode === "fixed" ? Math.round(state.value) : 0 };
}

/** Local totals with the charges in force replacing the plain percent that computeTotals derives from the legacy setting. */
export function totalsWithCharges(lines: CartLine[], order: ChargeFields, opts: { settings?: Settings; tip_minor?: number; rounding_minor?: number; staffMeal?: boolean; discount_minor?: number }): Totals {
  const settings = (opts.settings ?? undefined) as BusinessSettings | undefined;
  const base = computeTotals(lines, { orderType: order.order_type, settings, tip_minor: opts.tip_minor, rounding_minor: opts.rounding_minor, staffMeal: opts.staffMeal, discount_minor: opts.discount_minor, delivery_charge_minor: 0 });
  const net = base.subtotal_minor - base.discount_minor;
  const service = resolveServiceCharge(order, settings);
  const service_charge_minor = chargeAmount(service, net);
  const delivery_charge_minor = chargeAmount(resolveDeliveryCharge(order, settings), net);
  const service_charge_percent = service.mode === "percent" ? service.value : 0;
  if (opts.staffMeal) return { ...base, service_charge_minor, delivery_charge_minor, rounding_minor: 0, cash_rounding_minor: 0, total_minor: 0, service_charge_percent };
  // Rounded once, here, as Orders::Pricing does: the whole-rupee step on everything before cash rounding, then the cash
  // rounding a cash payment stored (opts.rounding_minor) on top. rounding_minor carries both so the bill balances.
  const cash_rounding_minor = opts.rounding_minor ?? 0;
  const raw = base.total_minor - base.rounding_minor - base.service_charge_minor + service_charge_minor + delivery_charge_minor;
  const rounded = roundToStep(raw, totalRoundingStep(settings));
  return { ...base, service_charge_minor, delivery_charge_minor, rounding_minor: rounded - raw + cash_rounding_minor, cash_rounding_minor, total_minor: rounded + cash_rounding_minor, service_charge_percent };
}

/**
 * SPEC Tax: the rate whose finance account is the selected payment method's account. Null when the method has no
 * account or no active rate is linked to it, in which case the till shows no tax choice at all.
 */
export function linkedTaxRate(method: Pick<PaymentMethod, "payment_account_id"> | null | undefined, rates: TaxRate[] | null | undefined): TaxRate | null {
  const account = method?.payment_account_id;
  if (!account || !rates?.length) return null;
  return rates.find((r) => r.active && r.payment_account_id === account) ?? null;
}

/** Segment label for the linked rate: "Sales tax 16%". */
export function taxRateLabel(rate: Pick<TaxRate, "name" | "rate">): string {
  return `${rate.name} ${Number(Number(rate.rate).toFixed(2))}%`;
}
