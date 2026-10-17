// The money block of every bill the apps show: the till's order panel and payment screen, the on-screen and printed
// receipt, the admin order view, the customer's tracking page and the table QR page. One function, so the figures can
// never be worked out two ways. Each figure is shown as the currency shows it (whole rupees for PKR), and any
// difference between those shown figures and the total goes on a Rounding line, so the bill always adds up by hand.
import { displayStepMinor } from "./money";
import { roundToStep } from "./pricing";

export interface BillRow {
  key: string;
  label: string;
  /** Signed: discounts are negative. Already rounded to what the currency shows. */
  amount_minor: number;
  /** "Includes tax": shown for information, not part of the sum (tax inside the prices). */
  info?: boolean;
}

export interface BillInput {
  subtotal_minor: number;
  /** One row per discount when the caller knows them (voucher, loyalty, item discounts); else one Discount row. */
  discounts?: { key: string; label: string; amount_minor: number }[];
  discount_minor?: number;
  service_charge_minor?: number;
  service_charge_label?: string;
  delivery_charge_minor?: number;
  delivery_label?: string;
  tax_minor?: number;
  /** The part of tax_minor already inside inclusive prices. */
  tax_inclusive_minor?: number;
  tax_label?: string;
  /** Tax by rate (receipts): replaces the single Tax line; inclusive rates become "Includes tax" information rows. */
  tax_lines?: { rate: number; inclusive: boolean; tax_minor: number }[];
  tip_minor?: number;
  total_minor: number;
}

/** Rows from Subtotal to the last line before the total. sum(amount_minor of rows without info) === shown total. */
export function billRows(b: BillInput, currency = "PKR"): BillRow[] {
  const step = displayStepMinor(currency);
  const show = (v: number) => (v >= 0 ? roundToStep(v, step) : 0 - roundToStep(-v, step));
  const rows: BillRow[] = [{ key: "subtotal", label: "Subtotal", amount_minor: show(b.subtotal_minor) }];
  const discounts = b.discounts?.length ? b.discounts : (b.discount_minor ?? 0) > 0 ? [{ key: "discount", label: "Discount", amount_minor: b.discount_minor ?? 0 }] : [];
  for (const d of discounts) if (d.amount_minor) rows.push({ key: `d:${d.key}`, label: d.label, amount_minor: 0 - show(d.amount_minor) });
  if (b.service_charge_minor) rows.push({ key: "service", label: b.service_charge_label ?? "Service charge", amount_minor: show(b.service_charge_minor) });
  if (b.delivery_charge_minor) rows.push({ key: "delivery", label: b.delivery_label ?? "Delivery", amount_minor: show(b.delivery_charge_minor) });
  const byRate = b.tax_lines?.filter((t) => t.tax_minor) ?? [];
  const inclusive = byRate.length ? byRate.filter((t) => t.inclusive).reduce((s, t) => s + t.tax_minor, 0) : Math.max(0, Math.min(b.tax_inclusive_minor ?? 0, b.tax_minor ?? 0));
  if (byRate.length) {
    for (const t of byRate.filter((x) => !x.inclusive)) rows.push({ key: `tax:${t.rate}`, label: `Tax ${t.rate}%`, amount_minor: show(t.tax_minor) });
  } else {
    const exclusive = (b.tax_minor ?? 0) - inclusive;
    if (exclusive) rows.push({ key: "tax", label: b.tax_label ?? "Tax", amount_minor: show(exclusive) });
  }
  if (b.tip_minor) rows.push({ key: "tip", label: "Tip", amount_minor: show(b.tip_minor) });
  const shownTotal = show(b.total_minor);
  const rounding = shownTotal - rows.reduce((s, r) => s + r.amount_minor, 0);
  if (rounding) rows.push({ key: "rounding", label: "Rounding", amount_minor: rounding });
  if (byRate.length) {
    for (const t of byRate.filter((x) => x.inclusive)) rows.push({ key: `tax-included:${t.rate}`, label: `Includes tax ${t.rate}%`, amount_minor: show(t.tax_minor), info: true });
  } else if (inclusive) rows.push({ key: "tax-included", label: "Includes tax", amount_minor: show(inclusive), info: true });
  return rows;
}

/** Quick tender buttons for cash: the exact total first, then the next amounts a customer can hand over in notes
 *  (PKR: Rs 50, 100, 500, 1,000 and 5,000), up to five buttons in all. */
export function cashSuggestions(total_minor: number, currency = "PKR", max = 5): number[] {
  if (total_minor <= 0) return [];
  const notes = currency === "PKR" ? [50, 100, 500, 1000, 5000] : [5, 10, 20, 50, 100];
  const out = [total_minor];
  for (const n of notes) {
    const unit = n * 100;
    const next = Math.ceil(total_minor / unit) * unit;
    if (next > total_minor && !out.includes(next)) out.push(next);
  }
  // A total at or above the biggest note: keep offering the next round amounts of it.
  const big = notes[notes.length - 1] * 100;
  while (total_minor >= big && out.length < max) out.push((Math.floor(out[out.length - 1] / big) + 1) * big);
  return out.slice(0, max);
}
