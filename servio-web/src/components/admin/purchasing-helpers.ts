// Pure helpers for the purchasing and supplier screens (SPEC "Purchasing, suppliers and expenses").
// Kept free of React so they can be unit tested.
import type { BadgeVariant } from "@/components/ui";
import type { PoPaymentStatus, PriceVerdict, PurchaseOrderStatus, SupplierBalanceLabel, SupplierLedgerType, SupplierRow } from "@/lib/types";
import { formatMoney } from "@/lib/money";

// ---- Supplier balance direction (SPEC: To Pay, To Receive, Settled) ----
export function balanceLabelFor(balanceMinor: number): SupplierBalanceLabel {
  return balanceMinor > 0 ? "to_pay" : balanceMinor < 0 ? "to_receive" : "settled";
}
export function balanceLabel(label: SupplierBalanceLabel | null | undefined, balanceMinor?: number): { text: string; variant: BadgeVariant } {
  const l = label ?? balanceLabelFor(balanceMinor ?? 0);
  switch (l) {
    case "to_pay": return { text: "To Pay", variant: "danger" };
    case "to_receive": return { text: "To Receive", variant: "success" };
    default: return { text: "Settled", variant: "neutral" };
  }
}

// ---- Purchase order payment status (SPEC: Payment column badge Unpaid / Partial / Paid) ----
export function paymentStatusFor(totalMinor: number, paidMinor: number): PoPaymentStatus {
  if (paidMinor <= 0) return "unpaid";
  return paidMinor >= totalMinor && totalMinor > 0 ? "paid" : "partial";
}
export function poPaymentLabel(status: PoPaymentStatus | null | undefined): { text: string; variant: BadgeVariant } {
  switch (status) {
    case "paid": return { text: "Paid", variant: "success" };
    case "partial": return { text: "Partial", variant: "warning" };
    default: return { text: "Unpaid", variant: "danger" };
  }
}
/** What is still owed on an order; the Pay dialog defaults to this. */
export function outstandingOnOrder(totalMinor: number, paidMinor: number | null | undefined): number {
  return Math.max(0, totalMinor - (paidMinor ?? 0));
}

// ---- Price history verdicts ----
export function verdictVariant(verdict: PriceVerdict | string | null | undefined): BadgeVariant {
  switch (verdict) {
    case "ok": return "neutral";
    case "wrong_unit": return "danger";
    case "below": case "above": case "no_cost": return "warning";
    default: return "neutral";
  }
}

// ---- Ledger line type badges ----
export function ledgerTypeVariant(type: SupplierLedgerType | string | null | undefined): BadgeVariant {
  switch (type) {
    case "Purchase": return "warning";
    case "Payment": return "success";
    case "Return": return "info";
    case "Adjustment": return "accent";
    case "Opening": return "neutral";
    default: return "neutral";
  }
}

// ---- Permissions and allowed actions ----
/** SPEC codes with the legacy Servio code that implies each (see the API's Permission catalogue). */
export const PO_PERMS = {
  view: ["PURCHASE_ORDERS", "purchasing.manage", "stock.view"],
  create: ["PO_CREATE", "purchasing.manage"],
  edit: ["PO_EDIT", "purchasing.manage"],
  delete: ["PO_DELETE", "purchasing.manage"],
  receive: ["PO_RECEIVE", "purchasing.manage"],
  return: ["PO_RETURN", "purchasing.manage"],
  pay: ["PO_PAYMENT", "purchasing.manage"],
  addItem: ["PO_ADD_ITEM", "stock.actions"],
  addSupplier: ["PO_ADD_SUPPLIER", "SUPPLIERS", "suppliers.manage"],
} as const;
export const SUPPLIER_PERMS = {
  manage: ["SUPPLIERS", "suppliers.manage"],
  ledger: ["SUPPLIER_LEDGER", "suppliers.manage"],
  recordPayment: ["SUPPLIER_RECORD_PAYMENT", "suppliers.manage"],
} as const;

export type Can = (...codes: string[]) => boolean;
export interface PoActions { send: boolean; receive: boolean; cancel: boolean; edit: boolean; delete: boolean; pay: boolean }

/** Which buttons a purchase order shows, from its status and the user's permissions (mirrors the API's rules). */
export function poActions(status: PurchaseOrderStatus | string, can: Can, paymentStatus?: PoPaymentStatus | null): PoActions {
  const draft = status === "draft";
  const open = status === "sent" || status === "partial";
  const payable = (open || status === "received") && paymentStatus !== "paid";
  return {
    send: draft && can(...PO_PERMS.edit),
    edit: draft && can(...PO_PERMS.edit),
    delete: draft && can(...PO_PERMS.delete),
    cancel: (draft || status === "sent") && can(...PO_PERMS.edit),
    receive: (draft || open) && can(...PO_PERMS.receive),
    pay: payable && can(...PO_PERMS.pay),
  };
}

// ---- Manual ledger adjustments ----
export type AdjustmentDirection = "owe_more" | "owe_less";
/** The API takes a signed amount: positive = we owe the supplier more. */
export function adjustmentAmount(direction: AdjustmentDirection, amountMinor: number): number {
  const abs = Math.abs(Math.round(amountMinor));
  return direction === "owe_less" ? -abs : abs;
}

// ---- CSV ----
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
/** Same columns the import accepts (name, contact, phone, email, address, terms, opening_balance) plus the read-only figures. */
export function suppliersCsv(rows: SupplierRow[]): string {
  return toCsv(
    ["name", "contact", "phone", "email", "address", "terms", "opening_balance", "balance", "direction", "items", "purchases"],
    rows.map((s) => [s.name, s.contact_name, s.phone, s.email, s.address, s.payment_terms_days, s.opening_balance_minor / 100, s.balance_minor / 100, balanceLabel(s.balance_label, s.balance_minor).text, s.items_count, s.purchases_count]),
  );
}
export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Formatting ----
/** "Rs 520 / kg" from a minor-unit cost per base unit. */
export function moneyPerUnit(minorPerBase: string | number | null | undefined, unitCode: string | null | undefined): string {
  const n = Number(minorPerBase ?? 0);
  if (!n) return "-";
  return `${formatMoney(Math.round(n))} / ${unitCode ?? "unit"}`;
}
export function signedPercent(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "-";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}
export const AGING_BUCKETS: { key: "current" | "31_60" | "61_90" | "over_90"; label: string }[] = [
  { key: "current", label: "Current (0-30 days)" }, { key: "31_60", label: "31-60 days" }, { key: "61_90", label: "61-90 days" }, { key: "over_90", label: "Over 90 days" },
];
