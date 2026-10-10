import { describe, expect, it } from "vitest";
import type { AttendanceDay, AttendanceRuleSet, PayslipRow } from "@/lib/types";
import {
  advanceStatusVariant, attendanceStatusLabel, attendanceStatusVariant, BLANK_RULES, counterCards, daysInMonth, deriveCounters, formatMoneyExact, leaveStatusVariant, minutesLabel, monthKey, monthLabel,
  payslipPdfRow, payslipTotals, PENALTY_OPTIONS, perDayMinor, ruleToForm, rulesPayload, runStatusVariant, scanResultLabel, scanResultVariant, shiftMonth, validateRulesForm, weeklyOffsFromWorkingDays, workingDaysFromWeeklyOffs,
} from "./payroll-helpers";

const day = (over: Partial<AttendanceDay>): Pick<AttendanceDay, "checked_in_at" | "checked_out_at" | "status"> =>
  ({ checked_in_at: "2026-10-11T09:00:00Z", checked_out_at: null, status: "present", ...over });

describe("status labels and tones", () => {
  it("names the seven SPEC attendance statuses", () => {
    expect(attendanceStatusLabel("present")).toBe("Present");
    expect(attendanceStatusLabel("half_day")).toBe("Half day");
    expect(attendanceStatusLabel("weekly_off")).toBe("Weekly off");
    expect(attendanceStatusLabel("something_new")).toBe("something new");
    expect(attendanceStatusLabel(null)).toBe("-");
  });
  it("tones: present green, late amber, absent red, unknown neutral", () => {
    expect(attendanceStatusVariant("present")).toBe("success");
    expect(attendanceStatusVariant("late")).toBe("warning");
    expect(attendanceStatusVariant("absent")).toBe("danger");
    expect(attendanceStatusVariant("x")).toBe("neutral");
  });
  it("scan results use the SPEC wording for the gap", () => {
    expect(scanResultLabel("already_marked")).toBe("Already Marked");
    expect(scanResultVariant("already_marked")).toBe("warning");
    expect(scanResultVariant("rejected")).toBe("danger");
    expect(scanResultLabel("auto_close")).toBe("Auto-closed");
  });
  it("run, advance and leave statuses", () => {
    expect(runStatusVariant("generated")).toBe("info");
    expect(runStatusVariant("paid")).toBe("success");
    expect(runStatusVariant("cancelled")).toBe("danger");
    expect(runStatusVariant(undefined)).toBe("neutral");
    expect(advanceStatusVariant("pending")).toBe("warning");
    expect(advanceStatusVariant("repaid")).toBe("success");
    expect(leaveStatusVariant("approved")).toBe("success");
    expect(leaveStatusVariant("rejected")).toBe("danger");
  });
});

describe("Today counters", () => {
  const rows = [day({}), day({ checked_out_at: "2026-10-11T18:00:00Z" }), day({ status: "late" }), day({ status: "late", checked_out_at: "2026-10-11T18:00:00Z" }), day({ status: "absent", checked_in_at: null })];
  it("derives currently in, checked out, late and absent from the rows", () => {
    expect(deriveCounters(rows, 3, 9)).toEqual({ scans: 9, currently_in: 2, checked_out: 2, not_checked_in: 3, late: 2, half_day: 0, absent: 1 });
  });
  it("lays out the five SPEC counters in order", () => {
    const cards = counterCards(deriveCounters(rows, 3, 9));
    expect(cards.map((c) => c.label)).toEqual(["Total scans", "Currently in", "Checked out", "Not checked in", "Late"]);
    expect(cards.map((c) => c.value)).toEqual([9, 2, 2, 3, 2]);
    expect(counterCards(undefined).every((c) => c.value === 0)).toBe(true);
  });
});

describe("weekly offs and working days", () => {
  it("are inverses of each other over 0..6", () => {
    expect(weeklyOffsFromWorkingDays([1, 2, 3, 4, 5, 6])).toEqual([0]);
    expect(weeklyOffsFromWorkingDays([1, 2, 3, 4, 5])).toEqual([0, 6]);
    expect(workingDaysFromWeeklyOffs([0, 6])).toEqual([1, 2, 3, 4, 5]);
    expect(workingDaysFromWeeklyOffs(weeklyOffsFromWorkingDays([0, 2, 4]))).toEqual([0, 2, 4]);
  });
  it("treats a missing working_days as every day working", () => {
    expect(weeklyOffsFromWorkingDays(null)).toEqual([]);
    expect(weeklyOffsFromWorkingDays(undefined)).toEqual([]);
  });
});

describe("rules form", () => {
  const rule: AttendanceRuleSet = {
    id: "r", employee_id: null, shift_start: "10:00", shift_end: "22:00", grace_minutes: 0, late_fine_minor: 20000, late_fine_after_minutes: 0, absent_rule: "calendar_days", working_days: [1, 2, 3, 4, 5, 6], require_fingerprint_to_close_shift: false,
    rules_enabled: true, late_after_minutes: 15, half_day_after_minutes: null, absent_after_minutes: 240, overtime_enabled: true, overtime_rate_minor_per_hour: 15000, no_scan_counts_absent: true,
    free_lates: 2, free_half_days: 0, free_absents: 1, late_penalty: "fine_only", half_day_penalty: "lose_day", absent_penalty: "both", half_day_fine_minor: 0, absent_fine_minor: 50000, fine_cap_minor: 300000, checkout_gap_minutes: 30, fixed_divisor: 26,
  };
  it("round-trips a rule through the form, keeping blank thresholds blank", () => {
    const f = ruleToForm(rule);
    expect(f.late_after_minutes).toBe("15");
    expect(f.half_day_after_minutes).toBe("");
    expect(f.weekly_offs).toEqual([0]);
    expect(validateRulesForm(f)).toEqual({});
    const body = rulesPayload(f, "emp-1");
    expect(body.employee_id).toBe("emp-1");
    expect(body.half_day_after_minutes).toBeNull();
    expect(body.late_after_minutes).toBe(15);
    expect(body.working_days).toEqual([1, 2, 3, 4, 5, 6]);
    expect(body.fine_cap_minor).toBe(300000);
    expect(body.checkout_gap_minutes).toBe(30);
  });
  it("saves the business defaults without an employee and an empty cap as null", () => {
    const body = rulesPayload({ ...BLANK_RULES, fine_cap_minor: 0 });
    expect(body.employee_id).toBeUndefined();
    expect(body.fine_cap_minor).toBeNull();
    expect(body.shift_start).toBeNull();
    expect(body.late_after_minutes).toBeNull();
  });
  it("offers the four SPEC penalties", () => {
    expect(PENALTY_OPTIONS.map((o) => o.label)).toEqual(["Fine only", "Lose the day's pay", "Both", "Not charged"]);
    expect(PENALTY_OPTIONS.map((o) => o.value)).toEqual(["fine_only", "lose_day", "both", "none"]);
  });
  it("rejects a bad penalty, a negative fine, bad times and seven weekly offs", () => {
    const e = validateRulesForm({ ...BLANK_RULES, late_penalty: "maybe" as never, late_fine_minor: -1, shift_start: "25:00", weekly_offs: [0, 1, 2, 3, 4, 5, 6] });
    expect(e.late_penalty).toBeDefined();
    expect(e.late_fine_minor).toBeDefined();
    expect(e.shift_start).toBe("Use HH:MM");
    expect(e.weekly_offs).toBeDefined();
  });
  it("accepts blank thresholds but not negative or fractional minutes, and keeps the ordering", () => {
    expect(validateRulesForm({ ...BLANK_RULES, late_after_minutes: "", half_day_after_minutes: "", absent_after_minutes: "" })).toEqual({});
    expect(validateRulesForm({ ...BLANK_RULES, late_after_minutes: "-5" }).late_after_minutes).toBeDefined();
    expect(validateRulesForm({ ...BLANK_RULES, late_after_minutes: "1.5" }).late_after_minutes).toBeDefined();
    expect(validateRulesForm({ ...BLANK_RULES, late_after_minutes: "60", half_day_after_minutes: "30" }).half_day_after_minutes).toBeDefined();
    expect(validateRulesForm({ ...BLANK_RULES, half_day_after_minutes: "120", absent_after_minutes: "60" }).absent_after_minutes).toBeDefined();
    expect(validateRulesForm({ ...BLANK_RULES, late_after_minutes: "15", half_day_after_minutes: "120", absent_after_minutes: "240" })).toEqual({});
  });
  it("needs an hourly rate when overtime is on", () => {
    expect(validateRulesForm({ ...BLANK_RULES, overtime_enabled: true, overtime_rate_minor_per_hour: 0 }).overtime_rate_minor_per_hour).toBeDefined();
    expect(validateRulesForm({ ...BLANK_RULES, overtime_enabled: true, overtime_rate_minor_per_hour: 10000 })).toEqual({});
  });
});

describe("months", () => {
  it("keys, labels and shifts months", () => {
    expect(monthKey(new Date(2026, 8, 15))).toBe("2026-09");
    expect(monthLabel("2026-09")).toBe("September 2026");
    expect(monthLabel("2026-02-01")).toBe("February 2026");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-01")).toBe(31);
  });
});

describe("per-day salary example (SPEC Rs 30,000)", () => {
  it("prices a February day at Rs 1,071.43 and a January day at Rs 967.74", () => {
    expect(perDayMinor(3_000_000, 28)).toBe(107143);
    expect(formatMoneyExact(perDayMinor(3_000_000, 28))).toBe("Rs 1,071.43");
    expect(formatMoneyExact(perDayMinor(3_000_000, 31))).toBe("Rs 967.74");
    expect(formatMoneyExact(perDayMinor(3_000_000, 26))).toBe("Rs 1,153.85");
    expect(perDayMinor(3_000_000, 0)).toBe(0);
    expect(formatMoneyExact(-150)).toBe("-Rs 1.50");
  });
  it("formats minutes", () => {
    expect(minutesLabel(0)).toBe("0m");
    expect(minutesLabel(45)).toBe("45m");
    expect(minutesLabel(125)).toBe("2h 05m");
  });
});

describe("payslip PDF rows", () => {
  const slip = (n: number): PayslipRow => ({
    id: `p${n}`, payroll_run_id: "r", employee_id: `e${n}`, employee_name: `Emp ${n}`, designation: "Cook", base_minor: 3_000_000, earnings_minor: 100_000, deductions_minor: 50_000, absence_minor: 107_143,
    late_fines_minor: 20_000, advances_recovered_minor: 500_000, tips_minor: 0, commission_minor: 0, net_minor: 2_422_857, days_present: 26, days_absent: 1, days_leave: 0, detail: {}, paid_at: null, expense_id: null,
  });
  it("formats money and sums the table", () => {
    expect(payslipPdfRow(slip(1), { month: "Sep 2026" })).toMatchObject({ employee: "Emp 1", base: "Rs 30,000", net: "Rs 24,229", month: "Sep 2026" });
    const t = payslipTotals([slip(1), slip(2)]);
    expect(t.base).toBe(6_000_000);
    expect(t.net).toBe(4_845_714);
    expect(t.advances).toBe(1_000_000);
  });
});
