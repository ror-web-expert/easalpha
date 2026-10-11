// Pure helpers for the Payroll group (SPEC "Staff, attendance and payroll"): status labels and tones, the Today counters,
// the rules form (validation, weekly offs to working_days and back), month keys and the per-day salary example.
import type { BadgeVariant } from "@/components/ui/badge";
import type { AdvanceStatus, AttendanceDay, AttendanceDayStatus, AttendanceRuleSet, AttendanceTodayCounters, LeaveStatus, PayrollRunStatus, PayslipRow, PenaltyKind, ScanResult } from "@/lib/types";
import { formatMoney } from "@/lib/money";

// ---- Attendance statuses ----
export const ATTENDANCE_STATUSES: { value: AttendanceDayStatus; label: string; variant: BadgeVariant }[] = [
  { value: "present", label: "Present", variant: "success" },
  { value: "late", label: "Late", variant: "warning" },
  { value: "half_day", label: "Half day", variant: "accent" },
  { value: "absent", label: "Absent", variant: "danger" },
  { value: "leave", label: "Leave", variant: "info" },
  { value: "holiday", label: "Holiday", variant: "primary" },
  { value: "weekly_off", label: "Weekly off", variant: "neutral" },
];
export function attendanceStatusLabel(s: string | null | undefined): string {
  return ATTENDANCE_STATUSES.find((x) => x.value === s)?.label ?? (s ? s.replace(/_/g, " ") : "-");
}
export function attendanceStatusVariant(s: string | null | undefined): BadgeVariant {
  return ATTENDANCE_STATUSES.find((x) => x.value === s)?.variant ?? "neutral";
}

// ---- Scan results (SPEC Scan Log: every tap on the reader) ----
export const SCAN_RESULTS: { value: ScanResult; label: string; variant: BadgeVariant }[] = [
  { value: "check_in", label: "Check in", variant: "success" },
  { value: "check_out", label: "Check out", variant: "primary" },
  { value: "already_marked", label: "Already Marked", variant: "warning" },
  { value: "rejected", label: "Rejected", variant: "danger" },
  { value: "unknown", label: "Unknown finger", variant: "danger" },
  { value: "manual_out", label: "Manual check out", variant: "info" },
  { value: "auto_close", label: "Auto-closed", variant: "neutral" },
];
export function scanResultLabel(r: string | null | undefined): string {
  return SCAN_RESULTS.find((x) => x.value === r)?.label ?? (r ? r.replace(/_/g, " ") : "-");
}
export function scanResultVariant(r: string | null | undefined): BadgeVariant {
  return SCAN_RESULTS.find((x) => x.value === r)?.variant ?? "neutral";
}

// ---- Other tones ----
export function runStatusVariant(s: PayrollRunStatus | string | null | undefined): BadgeVariant {
  switch (s) {
    case "generated": return "info";
    case "approved": return "primary";
    case "paid": return "success";
    case "cancelled": return "danger";
    default: return "neutral";
  }
}
export function advanceStatusVariant(s: AdvanceStatus | string | null | undefined): BadgeVariant {
  switch (s) {
    case "pending": return "warning";
    case "approved": return "info";
    case "paid": return "primary";
    case "repaid": return "success";
    case "rejected": return "danger";
    default: return "neutral";
  }
}
export function leaveStatusVariant(s: LeaveStatus | string | null | undefined): BadgeVariant {
  switch (s) {
    case "pending": return "warning";
    case "approved": return "success";
    case "rejected": return "danger";
    default: return "neutral";
  }
}

// ---- Today counters (SPEC: total scans, currently in, checked out, not checked in and late, against the business date) ----
export interface CounterCard { key: keyof AttendanceTodayCounters; label: string; value: number; tone: "primary" | "success" | "info" | "warning" | "danger" | "neutral" }

/** Derives the five counters from the rows when the API's counters are missing (scans must come from the API; 0 otherwise). */
export function deriveCounters(rows: Pick<AttendanceDay, "checked_in_at" | "checked_out_at" | "status">[], notCheckedIn: number, scans = 0): AttendanceTodayCounters {
  return {
    scans,
    currently_in: rows.filter((r) => r.checked_in_at && !r.checked_out_at).length,
    checked_out: rows.filter((r) => !!r.checked_out_at).length,
    not_checked_in: notCheckedIn,
    late: rows.filter((r) => r.status === "late").length,
    half_day: rows.filter((r) => r.status === "half_day").length,
    absent: rows.filter((r) => r.status === "absent").length,
  };
}

export function counterCards(c: AttendanceTodayCounters | null | undefined): CounterCard[] {
  const v = c ?? { scans: 0, currently_in: 0, checked_out: 0, not_checked_in: 0, late: 0, half_day: 0, absent: 0 };
  return [
    { key: "scans", label: "Total scans", value: v.scans, tone: "primary" },
    { key: "currently_in", label: "Currently in", value: v.currently_in, tone: "success" },
    { key: "checked_out", label: "Checked out", value: v.checked_out, tone: "info" },
    { key: "not_checked_in", label: "Not checked in", value: v.not_checked_in, tone: "neutral" },
    { key: "late", label: "Late", value: v.late, tone: "warning" },
  ];
}

// ---- Rules form ----
export const PENALTY_OPTIONS: { value: PenaltyKind; label: string }[] = [
  { value: "fine_only", label: "Fine only" },
  { value: "lose_day", label: "Lose the day's pay" },
  { value: "both", label: "Both" },
  { value: "none", label: "Not charged" },
];
export const penaltyLabel = (p: string | null | undefined) => PENALTY_OPTIONS.find((o) => o.value === p)?.label ?? "Not charged";

export const WEEKDAYS: { value: number; label: string; short: string }[] = [
  { value: 0, label: "Sunday", short: "Sun" }, { value: 1, label: "Monday", short: "Mon" }, { value: 2, label: "Tuesday", short: "Tue" }, { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" }, { value: 5, label: "Friday", short: "Fri" }, { value: 6, label: "Saturday", short: "Sat" },
];

/** SPEC Weekly offs: the days the screen toggles are the inverse of the stored working_days. */
export function weeklyOffsFromWorkingDays(working: number[] | null | undefined): number[] {
  const w = new Set(working ?? [0, 1, 2, 3, 4, 5, 6]);
  return WEEKDAYS.map((d) => d.value).filter((d) => !w.has(d));
}
export function workingDaysFromWeeklyOffs(offs: number[]): number[] {
  const o = new Set(offs);
  return WEEKDAYS.map((d) => d.value).filter((d) => !o.has(d));
}

/** Text fields so a blank threshold can stay blank ("A blank field skips that rule"). Money stays in minor units. */
export interface RulesForm {
  rules_enabled: boolean; shift_start: string; shift_end: string;
  late_after_minutes: string; half_day_after_minutes: string; absent_after_minutes: string;
  overtime_enabled: boolean; overtime_rate_minor_per_hour: number;
  weekly_offs: number[]; no_scan_counts_absent: boolean;
  free_lates: string; free_half_days: string; free_absents: string;
  late_penalty: PenaltyKind; half_day_penalty: PenaltyKind; absent_penalty: PenaltyKind;
  late_fine_minor: number; half_day_fine_minor: number; absent_fine_minor: number;
  fine_cap_minor: number; checkout_gap_minutes: string;
}

export const BLANK_RULES: RulesForm = {
  rules_enabled: true, shift_start: "", shift_end: "", late_after_minutes: "", half_day_after_minutes: "", absent_after_minutes: "",
  overtime_enabled: false, overtime_rate_minor_per_hour: 0, weekly_offs: [], no_scan_counts_absent: false, free_lates: "0", free_half_days: "0", free_absents: "0",
  late_penalty: "fine_only", half_day_penalty: "lose_day", absent_penalty: "lose_day", late_fine_minor: 0, half_day_fine_minor: 0, absent_fine_minor: 0, fine_cap_minor: 0, checkout_gap_minutes: "0",
};

const str = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

export function ruleToForm(r: Partial<AttendanceRuleSet> | null | undefined): RulesForm {
  if (!r) return BLANK_RULES;
  return {
    rules_enabled: r.rules_enabled ?? true, shift_start: r.shift_start ?? "", shift_end: r.shift_end ?? "",
    late_after_minutes: str(r.late_after_minutes), half_day_after_minutes: str(r.half_day_after_minutes), absent_after_minutes: str(r.absent_after_minutes),
    overtime_enabled: r.overtime_enabled ?? false, overtime_rate_minor_per_hour: r.overtime_rate_minor_per_hour ?? 0,
    weekly_offs: weeklyOffsFromWorkingDays(r.working_days), no_scan_counts_absent: r.no_scan_counts_absent ?? false,
    free_lates: str(r.free_lates ?? 0), free_half_days: str(r.free_half_days ?? 0), free_absents: str(r.free_absents ?? 0),
    late_penalty: r.late_penalty ?? "fine_only", half_day_penalty: r.half_day_penalty ?? "lose_day", absent_penalty: r.absent_penalty ?? "lose_day",
    late_fine_minor: r.late_fine_minor ?? 0, half_day_fine_minor: r.half_day_fine_minor ?? 0, absent_fine_minor: r.absent_fine_minor ?? 0,
    fine_cap_minor: r.fine_cap_minor ?? 0, checkout_gap_minutes: str(r.checkout_gap_minutes ?? 0),
  };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const intOrNull = (s: string): number | null => (s.trim() === "" ? null : Number(s));

/** Field errors keyed by form field; empty when the form can be saved. */
export function validateRulesForm(f: RulesForm): Partial<Record<keyof RulesForm, string>> {
  const errors: Partial<Record<keyof RulesForm, string>> = {};
  const nonNeg = (k: keyof RulesForm, s: string, what: string) => {
    if (s.trim() === "") return;
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0) errors[k] = `${what} must be a whole number of minutes or blank`;
  };
  if (f.shift_start && !TIME.test(f.shift_start)) errors.shift_start = "Use HH:MM";
  if (f.shift_end && !TIME.test(f.shift_end)) errors.shift_end = "Use HH:MM";
  nonNeg("late_after_minutes", f.late_after_minutes, "Late after");
  nonNeg("half_day_after_minutes", f.half_day_after_minutes, "Half day after");
  nonNeg("absent_after_minutes", f.absent_after_minutes, "Absent after");
  const late = intOrNull(f.late_after_minutes), half = intOrNull(f.half_day_after_minutes), absent = intOrNull(f.absent_after_minutes);
  if (late !== null && half !== null && half < late && !errors.half_day_after_minutes) errors.half_day_after_minutes = "Half day after must not be earlier than Late after";
  if (half !== null && absent !== null && absent < half && !errors.absent_after_minutes) errors.absent_after_minutes = "Absent after must not be earlier than Half day after";
  if (late !== null && half === null && absent !== null && absent < late && !errors.absent_after_minutes) errors.absent_after_minutes = "Absent after must not be earlier than Late after";
  (["free_lates", "free_half_days", "free_absents"] as const).forEach((k) => {
    const n = Number(f[k] === "" ? 0 : f[k]);
    if (!Number.isInteger(n) || n < 0) errors[k] = "Must be a whole number";
  });
  (["late_penalty", "half_day_penalty", "absent_penalty"] as const).forEach((k) => {
    if (!PENALTY_OPTIONS.some((o) => o.value === f[k])) errors[k] = "Choose a penalty";
  });
  (["late_fine_minor", "half_day_fine_minor", "absent_fine_minor", "fine_cap_minor", "overtime_rate_minor_per_hour"] as const).forEach((k) => {
    if (f[k] < 0) errors[k] = "Cannot be negative";
  });
  if (f.overtime_enabled && f.overtime_rate_minor_per_hour <= 0) errors.overtime_rate_minor_per_hour = "Set an hourly rate when overtime is on";
  if (f.checkout_gap_minutes.trim() !== "") {
    const n = Number(f.checkout_gap_minutes);
    if (!Number.isInteger(n) || n < 0) errors.checkout_gap_minutes = "Must be a whole number of minutes";
  }
  if (f.weekly_offs.length === 7) errors.weekly_offs = "At least one day must be a working day";
  return errors;
}

/** PUT /employees/rules body. employee_id undefined saves the business Defaults. */
export function rulesPayload(f: RulesForm, employeeId?: string | null) {
  return {
    employee_id: employeeId || undefined,
    rules_enabled: f.rules_enabled, shift_start: f.shift_start || null, shift_end: f.shift_end || null,
    late_after_minutes: intOrNull(f.late_after_minutes), half_day_after_minutes: intOrNull(f.half_day_after_minutes), absent_after_minutes: intOrNull(f.absent_after_minutes),
    overtime_enabled: f.overtime_enabled, overtime_rate_minor_per_hour: f.overtime_rate_minor_per_hour, working_days: workingDaysFromWeeklyOffs(f.weekly_offs),
    no_scan_counts_absent: f.no_scan_counts_absent, free_lates: Number(f.free_lates || 0), free_half_days: Number(f.free_half_days || 0), free_absents: Number(f.free_absents || 0),
    late_penalty: f.late_penalty, half_day_penalty: f.half_day_penalty, absent_penalty: f.absent_penalty,
    late_fine_minor: f.late_fine_minor, half_day_fine_minor: f.half_day_fine_minor, absent_fine_minor: f.absent_fine_minor,
    fine_cap_minor: f.fine_cap_minor > 0 ? f.fine_cap_minor : null, checkout_gap_minutes: Number(f.checkout_gap_minutes || 0),
  };
}

// ---- Months ----
/** "YYYY-MM" for a date (local time). */
export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
/** "2026-09" -> "September 2026". Also accepts "2026-09-01". */
export function monthLabel(key: string | null | undefined): string {
  if (!key) return "";
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}
/** Days in the month of a "YYYY-MM" key. */
export function daysInMonth(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

// ---- Money per day (SPEC worked example: Rs 30,000 is Rs 1,071.43 for a February day against Rs 967.74 for a January day) ----
export function perDayMinor(salaryMinor: number, divisor: number): number {
  if (!divisor || divisor <= 0) return 0;
  return Math.round(salaryMinor / divisor);
}
/** Money with paisa shown ("Rs 1,071.43"), for the per-day figures the SPEC quotes with decimals. */
export function formatMoneyExact(minor: number | null | undefined): string {
  const n = Number(minor ?? 0);
  const body = `Rs ${(Math.abs(n) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n < 0 ? `-${body}` : body;
}

export function minutesLabel(m: number | null | undefined): string {
  const n = Math.max(0, Math.round(Number(m ?? 0)));
  if (!n) return "0m";
  const h = Math.floor(n / 60), r = n % 60;
  return h ? `${h}h ${String(r).padStart(2, "0")}m` : `${r}m`;
}

// ---- Payslip PDF ----
export const PAYSLIP_PDF_COLUMNS = [
  { header: "Employee", key: "employee" }, { header: "Designation", key: "designation" }, { header: "Base", key: "base", align: "right" as const }, { header: "Earnings", key: "earnings", align: "right" as const },
  { header: "Deductions", key: "deductions", align: "right" as const }, { header: "Absence", key: "absence", align: "right" as const }, { header: "Fines", key: "fines", align: "right" as const },
  { header: "Advances", key: "advances", align: "right" as const }, { header: "Net", key: "net", align: "right" as const },
];
export function payslipPdfRow(p: PayslipRow, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    employee: p.employee_name, designation: p.designation ?? "", base: formatMoney(p.base_minor), earnings: formatMoney(p.earnings_minor), deductions: formatMoney(p.deductions_minor),
    absence: formatMoney(p.absence_minor), fines: formatMoney(p.late_fines_minor), advances: formatMoney(p.advances_recovered_minor), net: formatMoney(p.net_minor), ...extra,
  };
}
export function payslipTotals(rows: PayslipRow[]) {
  return rows.reduce((t, p) => ({
    base: t.base + p.base_minor, earnings: t.earnings + p.earnings_minor, deductions: t.deductions + p.deductions_minor, absence: t.absence + p.absence_minor,
    fines: t.fines + p.late_fines_minor, advances: t.advances + p.advances_recovered_minor, net: t.net + p.net_minor,
  }), { base: 0, earnings: 0, deductions: 0, absence: 0, fines: 0, advances: 0, net: 0 });
}
