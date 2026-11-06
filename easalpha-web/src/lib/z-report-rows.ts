// The cash drawer block of a Z report, shared by the till's dialog, the admin shift page (ZReportView) and the
// printed slip (zReportLines), so all three list the same rows and those rows add up to Expected (QA B8, review
// contracts#3: refunds, expenses, khata and supplier money were in Expected but on none of the three).
import type { ZReportCash } from "@/lib/types";

/** One drawer row: signed, money into the drawer positive and money out negative. */
export interface ZCashRow { key: keyof ZReportCash; label: string; minor: number }

const ROWS: { key: keyof ZReportCash; label: string; out?: boolean; always?: boolean }[] = [
  { key: "opening_minor", label: "Opening", always: true },
  { key: "cash_sales_minor", label: "Cash sales", always: true },
  { key: "cash_refunds_minor", label: "Cash refunds", out: true },
  { key: "khata_collected_minor", label: "Khata collected" },
  { key: "khata_paid_out_minor", label: "Khata paid out", out: true },
  { key: "cash_in_minor", label: "Cash in", always: true },
  { key: "cash_out_minor", label: "Cash out", out: true, always: true },
  { key: "drops_minor", label: "Drops to safe", out: true },
  { key: "payouts_minor", label: "Payouts", out: true },
  { key: "expenses_minor", label: "Expenses", out: true },
  { key: "supplier_payments_minor", label: "Paid to suppliers", out: true },
  { key: "supplier_refunds_minor", label: "Supplier refunds" },
  { key: "rider_float_minor", label: "Rider float" },
  { key: "other_minor", label: "Other" },
];

/** The rows to show: the usual four always, every other one the shift had. */
export function zCashRows(cash: Partial<ZReportCash> | null | undefined): ZCashRow[] {
  const c = cash ?? {};
  return ROWS.filter((r) => r.always || Number(c[r.key] ?? 0) !== 0).map((r) => {
    const v = Number(c[r.key] ?? 0);
    return { key: r.key, label: r.label, minor: (r.out ? -v : v) || 0 }; // never -0, which prints as "-0"
  });
}

/** What the rows add up to: Expected, for a Z report built from the drawer ledger. */
export const zCashTotal = (rows: ZCashRow[]) => rows.reduce((s, r) => s + r.minor, 0);
