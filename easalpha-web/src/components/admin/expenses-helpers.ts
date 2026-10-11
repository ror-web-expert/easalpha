// Pure helpers for the admin Expenses screen (SPEC "Purchasing, suppliers and expenses": filters by category,
// subcategory, method and source with a date range; totals; PDF and CSV export).
import type { Expense, ExpenseCategory } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { titleCase } from "@/lib/utils";

/** Children of the chosen top-level category; empty when no category is chosen or it has none. */
export function subcategoriesOf(categories: ExpenseCategory[] | null | undefined, parentId: string | null | undefined): ExpenseCategory[] {
  if (!parentId || !categories?.length) return [];
  const parent = categories.find((c) => c.id === parentId);
  return (parent?.children ?? []).filter((c) => !c.archived_at);
}

/** Where an expense was entered: an admin in the back office, a cashier at the till, or one of the automatic feeds. */
export const EXPENSE_SOURCES: { value: string; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "till", label: "Till" },
  { value: "payroll_sync", label: "Payroll sync" },
  { value: "rider_float", label: "Rider float" },
];

export function sourceLabel(source: string | null | undefined): string {
  if (!source) return "-";
  return EXPENSE_SOURCES.find((s) => s.value === source)?.label ?? titleCase(source);
}

/** "Utilities / Gas" -> { category: "Utilities", subcategory: "Gas" }; a top-level category has no subcategory. */
export function splitCategory(fullName: string | null | undefined): { category: string; subcategory: string | null } {
  const [category, ...rest] = (fullName ?? "").split(" / ");
  return { category: category ?? "", subcategory: rest.length ? rest.join(" / ") : null };
}

export interface ExpenseTotals { count: number; total_minor: number; voided_count: number; voided_minor: number }

/** Totals over the loaded rows; voided expenses are counted separately and left out of the total. */
export function expenseTotals(rows: Pick<Expense, "amount_minor" | "voided_at">[]): ExpenseTotals {
  return rows.reduce<ExpenseTotals>((t, r) => {
    if (r.voided_at) return { ...t, voided_count: t.voided_count + 1, voided_minor: t.voided_minor + r.amount_minor };
    return { ...t, count: t.count + 1, total_minor: t.total_minor + r.amount_minor };
  }, { count: 0, total_minor: 0, voided_count: 0, voided_minor: 0 });
}

/** Footer lines for the PDF export, built from the rows the screen shows. */
export function totalsFooter(rows: Pick<Expense, "amount_minor" | "voided_at">[], currency?: string): string[] {
  const t = expenseTotals(rows);
  const lines = [`Total ${formatMoney(t.total_minor, currency)} across ${t.count} ${t.count === 1 ? "expense" : "expenses"}`];
  if (t.count) lines.push(`Average ${formatMoney(Math.round(t.total_minor / t.count), currency)}`);
  if (t.voided_count) lines.push(`${t.voided_count} voided (${formatMoney(t.voided_minor, currency)}) not included`);
  return lines;
}

/** One PDF row per expense, with the category split in two columns and money already formatted. */
export function pdfRow(e: Expense, currency?: string): Record<string, unknown> {
  const { category, subcategory } = splitCategory(e.category);
  return {
    label: e.label, spent_on: e.spent_on, category, subcategory: subcategory ?? "", method: e.method_code ? titleCase(e.method_code) : "-",
    source: sourceLabel(e.source), paid_to: e.paid_to ?? "", note: e.note ?? "", amount: formatMoney(e.amount_minor, currency), status: e.voided_at ? "Voided" : "",
  };
}
