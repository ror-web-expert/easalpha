// What a receipt says, shared by the printed lines (lib/print.ts) and the on-screen view (components/pos/receipt.tsx)
// so both read the same: the title, the tax registration lines, the tax row labels, the item count and the savings.
import type { Receipt } from "@/lib/types";
import { formatMoney } from "@/lib/money";

/** "BILL" before any money is taken, "RECEIPT" once paid, "TAX INVOICE" when the authority numbered it, "DUPLICATE RECEIPT" on a reprint. */
export function receiptTitle(r: Pick<Receipt, "duplicate" | "receipt_number" | "payments" | "tax_invoice">): string {
  if (r.duplicate) return "DUPLICATE RECEIPT";
  if (!r.receipt_number && !r.payments?.length) return "BILL";
  return r.tax_invoice?.number ? "TAX INVOICE" : "RECEIPT";
}

/** "NTN 1234567-8", "STRN 03-00-1234-567-89": every registration the branch holds, in the order they were entered. */
export function registrationLines(tax_registration: Record<string, string> | null | undefined): string[] {
  return Object.entries(tax_registration ?? {}).filter(([, v]) => String(v ?? "").trim()).map(([k, v]) => `${k.replace(/_/g, " ").toUpperCase()} ${String(v).trim()}`);
}

/** The phones on one line: "0300-1234567 | 021-1111111" (single spaces, so the printed line wraps the same as the screen). */
export function phoneLine(primary: string | null | undefined, secondary: string | null | undefined): string | null {
  const phones = [primary, secondary].filter((p, i, a) => p && a.indexOf(p) === i) as string[];
  return phones.length ? phones.join(" | ") : null;
}

/** "Tax 16% on Rs 1,070": the bill row label with the taxable base, when the receipt knows it. */
export function taxRowLabel(label: string, key: string, tax_lines: Receipt["totals"]["tax_lines"] | undefined, currency: string): string {
  const m = /^tax:(.+)$/.exec(key);
  if (!m) return label;
  const line = tax_lines?.find((t) => !t.inclusive && String(t.rate) === m[1]);
  return line?.taxable_minor ? `${label} on ${formatMoney(line.taxable_minor, currency)}` : label;
}

/** The quantities added up: "3 items", "1 item", "1.5 items" for weighed lines. */
export function itemCount(lines: Pick<Receipt["lines"][number], "quantity">[] | undefined): string {
  const n = (lines ?? []).reduce((s, l) => s + Number(l.quantity ?? 0), 0);
  const shown = Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
  return `${shown} ${n === 1 ? "item" : "items"}`;
}

/**
 * The note under an item: "@ Rs 80 each" when there is more than one; for a weighed line its weight and price a unit,
 * "0.042 kg @ Rs 1,200/kg", ending ", label price" when a scale label set the amount (review 6 Nov 2026, R1).
 */
export function unitPriceNote(l: Pick<Receipt["lines"][number], "quantity" | "unit" | "unit_price_minor" | "label_price_minor">, money: (minor: number) => string): string | null {
  const qty = Number(l.quantity ?? 1);
  if (l.unit && l.unit_price_minor) return `${Number.isFinite(qty) ? qty : l.quantity} ${l.unit} @ ${money(l.unit_price_minor)}/${l.unit}${l.label_price_minor ? ", label price" : ""}`;
  return qty !== 1 && l.unit_price_minor ? `@ ${money(l.unit_price_minor)} each` : null;
}

/** Everything taken off the bill, lines and order together, as "You saved Rs 110"; null when nothing was. */
export function savingsLine(r: Pick<Receipt, "totals" | "business">): string | null {
  const saved = r.totals?.discount_minor ?? 0;
  return saved > 0 ? `You saved ${formatMoney(saved, r.business?.currency)}` : null;
}

/** The receipt number as the barcode encodes it: yymmdd-BRANCH-serial, printed on every paid receipt. */
export const RECEIPT_NUMBER_RE = /^\d{6}-\S+-\d+$/;
export const isReceiptNumber = (code: string): boolean => RECEIPT_NUMBER_RE.test(code.trim());
