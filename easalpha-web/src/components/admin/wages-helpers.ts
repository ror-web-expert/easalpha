// Pure helpers for staff pay beside the monthly payroll: pay type labels, the daily and weekly wage row math the API
// applies (Payroll::Wages: gross from days and rate, net, the advance recovery cap) and its validation rules, day and
// period labels, the wage history export, and the employee statement wording and export rows.
import type { BadgeVariant } from "@/components/ui/badge";
import type { EmployeeStatement, EmployeeStatementEntry, PayFrequency, WagePayment, WagePreview } from "@/lib/types";
import { formatMoney } from "@/lib/money";

// ---- Pay type ----
export const PAY_TYPES: { value: PayFrequency; label: string; amountLabel: string; per: string }[] = [
  { value: "monthly", label: "Monthly salary", amountLabel: "Monthly salary", per: "month" },
  { value: "weekly", label: "Weekly wage", amountLabel: "Wage per week", per: "week" },
  { value: "daily", label: "Daily wage", amountLabel: "Wage per day", per: "day" },
];
const payType = (f: string | null | undefined) => PAY_TYPES.find((p) => p.value === f) ?? PAY_TYPES[0];

/** Anything unknown or blank is treated as monthly, as the API's column default is. */
export function asPayFrequency(f: string | null | undefined): PayFrequency {
  return payType(f).value;
}
/** "Monthly salary", "Weekly wage", "Daily wage". */
export const payTypeLabel = (f: string | null | undefined) => payType(f).label;
/** The amount field's label: "Monthly salary", "Wage per week", "Wage per day". */
export const payAmountLabel = (f: string | null | undefined) => payType(f).amountLabel;
/** "Rs 1,500 / day". base_salary_minor is the pay for one period of the employee's pay frequency. */
export const rateLabel = (rateMinor: number | null | undefined, f: string | null | undefined) => `${formatMoney(rateMinor ?? 0)} / ${payType(f).per}`;
/** Daily and weekly staff are paid from Pay Wages; monthly staff in Run Payroll. */
export const isWageStaff = (f: string | null | undefined) => f === "daily" || f === "weekly";

/** Employees screen summary: monthly salaries add up per month; wage staff are counted, not summed (different periods). */
export function payrollMix(rows: { base_salary_minor: number; pay_frequency: string }[]) {
  const monthly = rows.filter((r) => !isWageStaff(r.pay_frequency));
  return { monthly_count: monthly.length, monthly_minor: monthly.reduce((s, r) => s + r.base_salary_minor, 0), wage_count: rows.length - monthly.length };
}

// ---- Days ----
const pad = (n: number) => String(n).padStart(2, "0");
const parts = (day: string) => day.slice(0, 10).split("-").map(Number) as [number, number, number];
const utc = (day: string) => { const [y, m, d] = parts(day); return new Date(Date.UTC(y, m - 1, d)); };
const key = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-10-12" moved by n days (calendar arithmetic, no time zone drift). */
export function shiftDay(day: string, delta: number): string {
  const d = utc(day);
  d.setUTCDate(d.getUTCDate() + delta);
  return key(d);
}
/** The Monday to Sunday week holding a day, as the API pays weekly staff. */
export function weekOf(day: string): { from: string; to: string } {
  const back = (utc(day).getUTCDay() + 6) % 7;
  const from = shiftDay(day, -back);
  return { from, to: shiftDay(from, 6) };
}
/** "Mon 12 Oct 2026" */
export function dayLabel(day: string): string {
  const d = utc(day);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** "12 Oct 2026" for a "YYYY-MM-DD" day, without the time zone shifting it. */
export const dateText = (day: string) => periodLabel(day, day);
/** "12 Oct 2026", "6 to 12 Oct 2026", "28 Sep to 4 Oct 2026", "29 Dec 2025 to 4 Jan 2026". */
export function periodLabel(from: string, to: string): string {
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  const end = `${td} ${MONTHS[tm - 1]} ${ty}`;
  if (from.slice(0, 10) === to.slice(0, 10)) return end;
  if (fy === ty && fm === tm) return `${fd} to ${end}`;
  if (fy === ty) return `${fd} ${MONTHS[fm - 1]} to ${end}`;
  return `${fd} ${MONTHS[fm - 1]} ${fy} to ${end}`;
}

// ---- Wage row math (mirrors Payroll::Wages.pay!) ----
/** Blank or not a number is null so the row can say "Enter the days worked". */
export function parseDays(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
/** Daily: rate x days. Weekly: rate x days / 7. Rounded to the paisa like the API. */
export function wageGross(rateMinor: number, days: number, f: string): number {
  if (!Number.isFinite(days) || days <= 0 || rateMinor <= 0) return 0;
  return Math.round(f === "weekly" ? (rateMinor * days) / 7 : rateMinor * days);
}

/** One due row as the manager edits it. The wage follows days x rate until it is typed over. */
export interface WageRow { days: string; gross_minor: number; gross_edited: boolean; bonus_minor: number; deductions_minor: number; recovery_minor: number }
type RowPreview = Pick<WagePreview, "rate_minor" | "pay_frequency" | "period_days" | "advances_outstanding_minor">;

export function wageRowFromPreview(p: Pick<WagePreview, "days_worked" | "gross_minor">): WageRow {
  return { days: String(p.days_worked ?? 0), gross_minor: p.gross_minor ?? 0, gross_edited: false, bonus_minor: 0, deductions_minor: 0, recovery_minor: 0 };
}
export function rowGross(row: WageRow, p: Pick<WagePreview, "rate_minor" | "pay_frequency">): number {
  return row.gross_edited ? row.gross_minor : wageGross(p.rate_minor, parseDays(row.days) ?? 0, p.pay_frequency);
}
/** Net = wage + bonus - deductions - advance recovered. */
export function wageNet(a: { gross_minor: number; bonus_minor: number; deductions_minor: number; recovery_minor: number }): number {
  return a.gross_minor + a.bonus_minor - a.deductions_minor - a.recovery_minor;
}
export function rowNet(row: WageRow, p: Pick<WagePreview, "rate_minor" | "pay_frequency">): number {
  return wageNet({ ...row, gross_minor: rowGross(row, p) });
}
/** Recovery is between nothing and the advances outstanding. */
export function capRecovery(value: number, outstandingMinor: number): number {
  return Math.max(0, Math.min(Math.round(value || 0), Math.max(0, outstandingMinor || 0)));
}
/** The most that can be recovered from this row without the net going below zero. */
export function maxRecovery(row: WageRow, p: RowPreview): number {
  return capRecovery(rowGross(row, p) + row.bonus_minor - row.deductions_minor, p.advances_outstanding_minor);
}

export type WageRowErrors = Partial<Record<"days" | "gross" | "bonus" | "deductions" | "recovery" | "net", string>>;

/** The API's rules (wages.days, wages.amount, wages.recovery, wages.net) checked before paying. Empty when payable. */
export function validateWageRow(row: WageRow, p: RowPreview): WageRowErrors {
  const e: WageRowErrors = {};
  const days = parseDays(row.days);
  if (days === null) e.days = "Enter the days worked";
  else if (days < 0 || days > p.period_days) e.days = `Days worked must be between 0 and ${p.period_days}`;
  const gross = rowGross(row, p);
  if (gross < 0) e.gross = "Amounts cannot be negative";
  if (row.bonus_minor < 0) e.bonus = "Amounts cannot be negative";
  if (row.deductions_minor < 0) e.deductions = "Amounts cannot be negative";
  if (row.recovery_minor < 0) e.recovery = "Amounts cannot be negative";
  else if (row.recovery_minor > p.advances_outstanding_minor) e.recovery = `Only ${formatMoney(p.advances_outstanding_minor)} of advances is outstanding`;
  if (!e.days && !e.gross && !e.bonus && !e.deductions && !e.recovery && wageNet({ ...row, gross_minor: gross }) < 0) e.net = "The wage after deductions is below zero";
  return e;
}
export const hasErrors = (e: WageRowErrors) => Object.keys(e).length > 0;

/** One row of POST /wages/batch. The wage is sent only when typed over; otherwise the API prices the days itself. */
export function wageBatchRow(employeeId: string, row: WageRow) {
  return {
    employee_id: employeeId, days_worked: parseDays(row.days) ?? 0, ...(row.gross_edited ? { gross_minor: row.gross_minor } : {}),
    bonus_minor: row.bonus_minor, deductions_minor: row.deductions_minor, advance_recovery_minor: row.recovery_minor,
  };
}

/** Where a due employee stands: paid for this exact period, holding a payment inside it, or due. */
export type DueState = "paid" | "overlap" | "due";
export function dueState(p: Pick<WagePreview, "paid" | "already_paid">): DueState {
  if (p.paid) return "paid";
  return p.already_paid?.length ? "overlap" : "due";
}

// ---- Attendance chips (present, late, half day, absent, off, leave) ----
const CHIPS: { key: string; label: string; variant: BadgeVariant; statuses: string[] }[] = [
  { key: "present", label: "Present", variant: "success", statuses: ["present"] },
  { key: "late", label: "Late", variant: "warning", statuses: ["late"] },
  { key: "half_day", label: "Half day", variant: "accent", statuses: ["half_day"] },
  { key: "absent", label: "Absent", variant: "danger", statuses: ["absent"] },
  { key: "off", label: "Off", variant: "neutral", statuses: ["weekly_off", "holiday"] },
  { key: "leave", label: "Leave", variant: "info", statuses: ["leave"] },
];
export interface AttendanceChip { key: string; label: string; count: number; variant: BadgeVariant }
/** Counts per chip for the period, in a fixed order, leaving out the ones with none. */
export function attendanceChips(days: { status: string }[] | null | undefined): AttendanceChip[] {
  const list = days ?? [];
  return CHIPS.map((c) => ({ key: c.key, label: c.label, variant: c.variant, count: list.filter((d) => c.statuses.includes(d.status)).length })).filter((c) => c.count > 0);
}
/** "Present" for a one-day period, "Present 5" over a week. */
export const chipText = (c: AttendanceChip, singleDay: boolean) => (singleDay && c.count === 1 ? c.label : `${c.label} ${c.count}`);

// ---- Batch results ----
export interface WageBatchResult { employee_id: string; ok: boolean; wage?: WagePayment; error?: string }
export function resultsByEmployee(results: WageBatchResult[] | null | undefined): Record<string, WageBatchResult> {
  return Object.fromEntries((results ?? []).map((r) => [r.employee_id, r]));
}

// ---- Wage history ----
export const wageStatusVariant = (s: string | null | undefined): BadgeVariant => (s === "paid" ? "success" : s === "voided" ? "danger" : "neutral");
/** "1", "0.5", "6.5": days without trailing zeros. */
export const daysText = (n: number | string | null | undefined) => String(Number(n ?? 0));

/** Sums of the paid payments only; voided ones are shown but do not count (as the API's totals). */
export function wageTotals(rows: WagePayment[]) {
  return rows.filter((w) => w.status === "paid").reduce((t, w) => ({
    count: t.count + 1, gross_minor: t.gross_minor + w.gross_minor, bonus_minor: t.bonus_minor + w.bonus_minor, deductions_minor: t.deductions_minor + w.deductions_minor,
    advance_recovered_minor: t.advance_recovered_minor + w.advance_recovered_minor, net_minor: t.net_minor + w.net_minor,
  }), { count: 0, gross_minor: 0, bonus_minor: 0, deductions_minor: 0, advance_recovered_minor: 0, net_minor: 0 });
}

export const WAGE_HISTORY_COLUMNS = [
  { header: "Payment", key: "label" }, { header: "Employee", key: "employee" }, { header: "Period", key: "period" }, { header: "Days", key: "days" }, { header: "Rate", key: "rate" },
  { header: "Wage", key: "gross" }, { header: "Bonus", key: "bonus" }, { header: "Deductions", key: "deductions" }, { header: "Advance recovered", key: "recovered" }, { header: "Net", key: "net" },
  { header: "Paid from", key: "method" }, { header: "Paid at", key: "paid_at" }, { header: "Status", key: "status" }, { header: "Void reason", key: "void_reason" },
];
export function wageHistoryRow(w: WagePayment, extra: { method?: string; paid_at?: string } = {}): Record<string, unknown> {
  return {
    label: w.label, employee: w.employee_name ?? "", period: periodLabel(w.period_from, w.period_to), days: daysText(w.days_worked), rate: formatMoney(w.rate_minor),
    gross: formatMoney(w.gross_minor), bonus: formatMoney(w.bonus_minor), deductions: formatMoney(w.deductions_minor), recovered: formatMoney(w.advance_recovered_minor), net: formatMoney(w.net_minor),
    method: extra.method ?? w.method_code ?? "", paid_at: extra.paid_at ?? w.paid_at ?? "", status: w.status === "voided" ? "Voided" : "Paid", void_reason: w.void_reason ?? "",
  };
}

// ---- Employee statement ----
/** Balance above zero is still owed to the employee; below zero the employee owes (advances). */
export function balanceWording(minor: number | null | undefined): { label: string; amount_minor: number; text: string; tone: "warning" | "info" | "success" } {
  const n = Number(minor ?? 0);
  if (n > 0) return { label: "Owed to employee", amount_minor: n, text: `${formatMoney(n)} owed to employee`, tone: "warning" };
  if (n < 0) return { label: "Employee owes", amount_minor: -n, text: `Employee owes ${formatMoney(-n)}`, tone: "info" };
  return { label: "Nothing due", amount_minor: 0, text: "Nothing due either way", tone: "success" };
}
/** Short wording under a balance figure in the table. */
export const balanceNote = (minor: number) => (minor > 0 ? "owed to employee" : minor < 0 ? "employee owes" : "settled");
/** One cell for exports: "Rs 2,000 owed to employee", "Rs 500 employee owes", "Rs 0". */
export const balanceCell = (minor: number) => (minor === 0 ? formatMoney(0) : `${formatMoney(Math.abs(minor))} ${balanceNote(minor)}`);

const KINDS: Record<EmployeeStatementEntry["kind"], { label: string; variant: BadgeVariant }> = {
  salary: { label: "Salary", variant: "primary" },
  salary_paid: { label: "Salary paid", variant: "success" },
  wage: { label: "Wage", variant: "primary" },
  wage_paid: { label: "Wage paid", variant: "success" },
  advance: { label: "Advance", variant: "warning" },
};
export const statementKindLabel = (k: string) => KINDS[k as EmployeeStatementEntry["kind"]]?.label ?? k.replace(/_/g, " ");
export const statementKindVariant = (k: string): BadgeVariant => KINDS[k as EmployeeStatementEntry["kind"]]?.variant ?? "neutral";

export type StatementPreset = "this_month" | "last_month" | "custom";
export const STATEMENT_PRESETS: { value: StatementPreset; label: string }[] = [
  { value: "this_month", label: "This month" }, { value: "last_month", label: "Last month" }, { value: "custom", label: "Custom" },
];
/** Whole calendar months, so a salary dated the month end is inside "This month". */
export function statementRange(preset: Exclude<StatementPreset, "custom">, today: string): { from: string; to: string } {
  const [y, m] = parts(today);
  const first = (yy: number, mm: number) => key(new Date(Date.UTC(yy, mm - 1, 1)));
  const last = (yy: number, mm: number) => key(new Date(Date.UTC(yy, mm, 0)));
  if (preset === "last_month") {
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    return { from: first(py, pm), to: last(py, pm) };
  }
  return { from: first(y, m), to: last(y, m) };
}

export const STATEMENT_COLUMNS = [
  { header: "Date", key: "date" }, { header: "Entry", key: "entry" }, { header: "Detail", key: "detail" }, { header: "Ref", key: "ref" },
  { header: "Earned", key: "earned", align: "right" as const }, { header: "Paid / given", key: "paid", align: "right" as const }, { header: "Balance", key: "balance", align: "right" as const },
];
/** Brought forward, every entry, then the closing balance: the rows the PDF and CSV carry. */
export function statementExportRows(s: Pick<EmployeeStatement, "from" | "to" | "brought_forward_minor" | "closing_balance_minor" | "entries">): Record<string, unknown>[] {
  return [
    { date: dateText(s.from), entry: "Brought forward", detail: "", ref: "", earned: "", paid: "", balance: balanceCell(s.brought_forward_minor) },
    ...s.entries.map((e) => ({
      date: dateText(e.date), entry: e.label, detail: e.detail ?? "", ref: e.ref, earned: e.credit_minor ? formatMoney(e.credit_minor) : "", paid: e.debit_minor ? formatMoney(e.debit_minor) : "", balance: balanceCell(e.balance_minor),
    })),
    { date: dateText(s.to), entry: "Closing balance", detail: "", ref: "", earned: "", paid: "", balance: balanceCell(s.closing_balance_minor) },
  ];
}
