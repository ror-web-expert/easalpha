// What a receipt says, shared by the printed lines (lib/print.ts) and the on-screen view (components/pos/receipt.tsx)
// so both read the same: the title, the tax registration lines, the tax row labels, the item count and the savings.
import type { BusinessSettings, Receipt, TaxRegistration } from "@/lib/types";
import { formatMoney } from "@/lib/money";

/** "BILL" before any money is taken, "RECEIPT" once paid, "TAX INVOICE" when the authority numbered it, "DUPLICATE RECEIPT" on a reprint. */
export function receiptTitle(r: Pick<Receipt, "duplicate" | "receipt_number" | "payments" | "tax_invoice">): string {
  if (r.duplicate) return "DUPLICATE RECEIPT";
  if (!r.receipt_number && !r.payments?.length) return "BILL";
  return r.tax_invoice?.number ? "TAX INVOICE" : "RECEIPT";
}

/** The parts of a branch's tax registration anything outside the server may hold: the authority and the public numbers.
 *  The API token the branch also keeps printed on every receipt until 6 Nov 2026 (S1); it is an allow-list now. */
export const PUBLIC_TAX_KEYS = ["authority", "ntn", "strn", "pos_id"] as const;
const PRINTED: [key: "ntn" | "strn" | "pos_id", label: string][] = [["ntn", "NTN"], ["strn", "STRN"], ["pos_id", "POS ID"]];

/** The registration reduced to PUBLIC_TAX_KEYS (null when nothing is left), whatever a stored copy carries. */
export function publicTaxRegistration(reg: TaxRegistration | Record<string, unknown> | null | undefined): TaxRegistration | null {
  const r = (reg ?? {}) as Record<string, unknown>;
  const out = Object.fromEntries(PUBLIC_TAX_KEYS.flatMap((k) => (typeof r[k] === "string" && (r[k] as string).trim() ? [[k, (r[k] as string).trim()]] : [])));
  return Object.keys(out).length ? (out as TaxRegistration) : null;
}

/** "NTN 1234567-8", "STRN 32-77-8761-234-56", "PRA POS ID 12345": the public numbers only, in that order. */
export function registrationLines(tax_registration: TaxRegistration | Record<string, unknown> | null | undefined): string[] {
  const r = publicTaxRegistration(tax_registration) ?? {};
  const authority = (r.authority ?? "").toUpperCase();
  return PRINTED.flatMap(([k, label]) => {
    const v = r[k];
    if (!v) return [];
    return [`${k === "pos_id" && authority && authority !== "NONE" ? `${authority} ${label}` : label} ${v}`];
  });
}

/**
 * The receipt's header, footer, language and paper: the pos.receipt.* settings the Branding page saves, else the
 * receipt hash older businesses kept in their settings, else the defaults; the same source as the server's
 * Receipts::Branding. The offline receipt read only that old hash, so a saved header and footer never printed (S6).
 */
export function receiptBranding(settings: BusinessSettings | Record<string, unknown> | null | undefined): { header: string | null; footer: string | null; language: string; paper: string } {
  const s = (settings ?? {}) as Record<string, unknown>;
  const legacy = (s.receipt && typeof s.receipt === "object" ? s.receipt : {}) as Record<string, unknown>;
  const pick = (field: string, fallback: string | null): string | null => {
    const key = `pos.receipt.${field}`;
    const v = key in s ? s[key] : field in legacy ? legacy[field] : fallback;
    return v === null || v === undefined || String(v) === "" ? null : String(v);
  };
  return { header: pick("header", null), footer: pick("footer", "Thank you"), language: pick("language", "en") ?? "en", paper: pick("paper", "80") ?? "80" };
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

/** "+ Extra raita (Rs 50)": a modifier under its item, its price a note since the item's amount already holds it. */
export function modifierNote(mo: { name: string; price_minor?: number | null }, money: (minor: number) => string): string {
  return `+ ${mo.name}${mo.price_minor ? ` (${money(mo.price_minor)})` : ""}`;
}

/** Everything taken off the bill, lines and order together, as "You saved Rs 110"; null when nothing was. */
export function savingsLine(r: Pick<Receipt, "totals" | "business">): string | null {
  const saved = r.totals?.discount_minor ?? 0;
  return saved > 0 ? `You saved ${formatMoney(saved, r.business?.currency)}` : null;
}

/** The receipt number as the barcode encodes it: yymmdd-BRANCH-serial, printed on every paid receipt. */
export const RECEIPT_NUMBER_RE = /^\d{6}-\S+-\d+$/;
/**
 * The label of an order saved offline: the till's code and its counter (T1-001; a tablet's is W2-014). A receipt paid
 * offline has no receipt number yet, so this is its barcode, and the scan must find the order by it (QA T12).
 */
export const TILL_SERIAL_RE = /^[TW]\d+-\d{3,}$/i;
export const isTillSerial = (code: string): boolean => TILL_SERIAL_RE.test(code.trim());
/** A receipt's barcode: its receipt number, or the till serial of a receipt printed offline. */
export const isReceiptNumber = (code: string): boolean => RECEIPT_NUMBER_RE.test(code.trim()) || isTillSerial(code);
