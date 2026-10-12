import { describe, expect, it } from "vitest";
import type { WagePayment, WagePreview } from "@/lib/types";
import {
  asPayFrequency, attendanceChips, balanceCell, balanceNote, balanceWording, capRecovery, chipText, dayLabel, daysText, dueState, hasErrors, isWageStaff, maxRecovery, parseDays, payAmountLabel,
  payrollMix, payTypeLabel, periodLabel, rateLabel, resultsByEmployee, rowGross, rowNet, shiftDay, statementExportRows, statementKindLabel, statementRange, validateWageRow, wageBatchRow,
  wageGross, wageHistoryRow, wageNet, wageRowFromPreview, wageTotals, weekOf, type WageRow,
} from "./wages-helpers";

const daily = { rate_minor: 150_000, pay_frequency: "daily" as const, period_days: 1, advances_outstanding_minor: 200_000 };
const weekly = { rate_minor: 900_000, pay_frequency: "weekly" as const, period_days: 7, advances_outstanding_minor: 0 };
const row = (over: Partial<WageRow> = {}): WageRow => ({ days: "1", gross_minor: 0, gross_edited: false, bonus_minor: 0, deductions_minor: 0, recovery_minor: 0, ...over });
const wage = (over: Partial<WagePayment> = {}): WagePayment => ({
  id: "w1", number: 12, label: "WG-000012", employee_id: "e1", employee_name: "Bilal", period_from: "2026-10-12", period_to: "2026-10-12", days_worked: 1, rate_minor: 150_000,
  gross_minor: 150_000, bonus_minor: 20_000, deductions_minor: 5_000, advance_recovered_minor: 50_000, net_minor: 115_000, method_code: "cash", expense_id: "x1", note: null,
  status: "paid", void_reason: null, voided_at: null, by_membership_id: null, paid_at: "2026-10-12T22:00:00Z", ...over,
});

describe("pay type labels", () => {
  it("names the three pay types and their amount fields", () => {
    expect(payTypeLabel("monthly")).toBe("Monthly salary");
    expect(payTypeLabel("weekly")).toBe("Weekly wage");
    expect(payTypeLabel("daily")).toBe("Daily wage");
    expect(payAmountLabel("monthly")).toBe("Monthly salary");
    expect(payAmountLabel("weekly")).toBe("Wage per week");
    expect(payAmountLabel("daily")).toBe("Wage per day");
  });
  it("shows the rate per period", () => {
    expect(rateLabel(150_000, "daily")).toBe("Rs 1,500 / day");
    expect(rateLabel(900_000, "weekly")).toBe("Rs 9,000 / week");
    expect(rateLabel(3_000_000, "monthly")).toBe("Rs 30,000 / month");
  });
  it("treats unknown or blank as monthly, and only daily and weekly as wage staff", () => {
    expect(asPayFrequency("")).toBe("monthly");
    expect(asPayFrequency("fortnightly")).toBe("monthly");
    expect(asPayFrequency("daily")).toBe("daily");
    expect(isWageStaff("daily")).toBe(true);
    expect(isWageStaff("weekly")).toBe(true);
    expect(isWageStaff("monthly")).toBe(false);
  });
  it("adds up monthly salaries and counts wage staff", () => {
    expect(payrollMix([{ base_salary_minor: 3_000_000, pay_frequency: "monthly" }, { base_salary_minor: 150_000, pay_frequency: "daily" }, { base_salary_minor: 900_000, pay_frequency: "weekly" }]))
      .toEqual({ monthly_count: 1, monthly_minor: 3_000_000, wage_count: 2 });
  });
});

describe("days and periods", () => {
  it("moves days across months and years", () => {
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDay("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("finds the Monday to Sunday week", () => {
    expect(weekOf("2026-10-12")).toEqual({ from: "2026-10-12", to: "2026-10-18" }); // a Monday
    expect(weekOf("2026-10-18")).toEqual({ from: "2026-10-12", to: "2026-10-18" }); // a Sunday
    expect(weekOf("2026-10-01")).toEqual({ from: "2026-09-28", to: "2026-10-04" });
  });
  it("labels a day and a period", () => {
    expect(dayLabel("2026-10-12")).toBe("Mon 12 Oct 2026");
    expect(periodLabel("2026-10-12", "2026-10-12")).toBe("12 Oct 2026");
    expect(periodLabel("2026-10-12", "2026-10-18")).toBe("12 to 18 Oct 2026");
    expect(periodLabel("2026-09-28", "2026-10-04")).toBe("28 Sep to 4 Oct 2026");
    expect(periodLabel("2025-12-29", "2026-01-04")).toBe("29 Dec 2025 to 4 Jan 2026");
  });
});

describe("wage math", () => {
  it("prices a daily wage as rate x days", () => {
    expect(wageGross(150_000, 1, "daily")).toBe(150_000);
    expect(wageGross(150_000, 0.5, "daily")).toBe(75_000);
    expect(wageGross(150_000, 0, "daily")).toBe(0);
  });
  it("prices a weekly wage as rate x days / 7, rounded to the paisa", () => {
    expect(wageGross(900_000, 7, "weekly")).toBe(900_000);
    expect(wageGross(900_000, 6, "weekly")).toBe(771_429);
    expect(wageGross(900_000, 5.5, "weekly")).toBe(707_143);
  });
  it("follows the days until the wage is typed over", () => {
    expect(rowGross(row({ days: "0.5" }), daily)).toBe(75_000);
    expect(rowGross(row({ days: "0.5", gross_minor: 100_000, gross_edited: true }), daily)).toBe(100_000);
    expect(rowGross(row({ days: "" }), daily)).toBe(0);
  });
  it("nets wage + bonus - deductions - advance recovered", () => {
    expect(wageNet({ gross_minor: 150_000, bonus_minor: 20_000, deductions_minor: 5_000, recovery_minor: 50_000 })).toBe(115_000);
    expect(rowNet(row({ bonus_minor: 10_000, recovery_minor: 60_000 }), daily)).toBe(100_000);
  });
  it("caps recovery at what is outstanding and what the row pays", () => {
    expect(capRecovery(300_000, 200_000)).toBe(200_000);
    expect(capRecovery(-5, 200_000)).toBe(0);
    expect(capRecovery(50_000, 0)).toBe(0);
    expect(maxRecovery(row(), daily)).toBe(150_000);
    expect(maxRecovery(row({ bonus_minor: 100_000 }), daily)).toBe(200_000);
    expect(maxRecovery(row({ deductions_minor: 200_000 }), daily)).toBe(0);
  });
  it("starts a row from the API's suggestion", () => {
    expect(wageRowFromPreview({ days_worked: 5.5, gross_minor: 707_143 })).toEqual({ days: "5.5", gross_minor: 707_143, gross_edited: false, bonus_minor: 0, deductions_minor: 0, recovery_minor: 0 });
    expect(parseDays(" ")).toBeNull();
    expect(parseDays("abc")).toBeNull();
    expect(parseDays("2.5")).toBe(2.5);
  });
});

describe("row validation (the API's wages rules)", () => {
  it("accepts a normal row", () => {
    expect(validateWageRow(row(), daily)).toEqual({});
    expect(hasErrors(validateWageRow(row(), daily))).toBe(false);
  });
  it("keeps days between 0 and the period's days (wages.days)", () => {
    expect(validateWageRow(row({ days: "2" }), daily).days).toBe("Days worked must be between 0 and 1");
    expect(validateWageRow(row({ days: "-1" }), weekly).days).toBe("Days worked must be between 0 and 7");
    expect(validateWageRow(row({ days: "7" }), weekly)).toEqual({});
    expect(validateWageRow(row({ days: "" }), weekly).days).toBe("Enter the days worked");
  });
  it("rejects negative amounts (wages.amount)", () => {
    expect(validateWageRow(row({ bonus_minor: -1 }), daily).bonus).toBe("Amounts cannot be negative");
    expect(validateWageRow(row({ deductions_minor: -1 }), daily).deductions).toBe("Amounts cannot be negative");
    expect(validateWageRow(row({ gross_edited: true, gross_minor: -100 }), daily).gross).toBe("Amounts cannot be negative");
  });
  it("recovers no more than is outstanding (wages.recovery)", () => {
    expect(validateWageRow(row({ recovery_minor: 250_000 }), daily).recovery).toBe("Only Rs 2,000 of advances is outstanding");
    expect(validateWageRow(row({ recovery_minor: 1 }), weekly).recovery).toBe("Only Rs 0 of advances is outstanding");
  });
  it("never pays below zero (wages.net)", () => {
    expect(validateWageRow(row({ deductions_minor: 200_000 }), daily).net).toBe("The wage after deductions is below zero");
    expect(validateWageRow(row({ recovery_minor: 160_000 }), daily).net).toBe("The wage after deductions is below zero");
    expect(validateWageRow(row({ recovery_minor: 150_000 }), daily)).toEqual({});
  });
});

describe("batch rows and states", () => {
  it("sends the wage only when it was typed over", () => {
    expect(wageBatchRow("e1", row({ days: "0.5", bonus_minor: 100 }))).toEqual({ employee_id: "e1", days_worked: 0.5, bonus_minor: 100, deductions_minor: 0, advance_recovery_minor: 0 });
    expect(wageBatchRow("e1", row({ gross_edited: true, gross_minor: 99_900 }))).toMatchObject({ gross_minor: 99_900, days_worked: 1 });
  });
  it("tells paid, overlapping and due rows apart", () => {
    const p = (over: Partial<WagePreview>) => ({ paid: null, already_paid: [], ...over }) as Pick<WagePreview, "paid" | "already_paid">;
    expect(dueState(p({}))).toBe("due");
    expect(dueState(p({ paid: wage(), already_paid: [wage()] }))).toBe("paid");
    expect(dueState(p({ already_paid: [wage({ period_from: "2026-10-10", period_to: "2026-10-12" })] }))).toBe("overlap");
  });
  it("indexes batch results by employee", () => {
    const r = resultsByEmployee([{ employee_id: "e1", ok: true, wage: wage() }, { employee_id: "e2", ok: false, error: "Bilal was already paid for 2026-10-12" }]);
    expect(r.e1.ok).toBe(true);
    expect(r.e2.error).toMatch(/already paid/);
    expect(resultsByEmployee(undefined)).toEqual({});
  });
});

describe("attendance chips", () => {
  it("counts the period in a fixed order and folds weekly off and holidays into Off", () => {
    const chips = attendanceChips([{ status: "late" }, { status: "present" }, { status: "present" }, { status: "weekly_off" }, { status: "holiday" }, { status: "half_day" }, { status: "absent" }]);
    expect(chips.map((c) => [c.label, c.count])).toEqual([["Present", 2], ["Late", 1], ["Half day", 1], ["Absent", 1], ["Off", 2]]);
    expect(chips[0].variant).toBe("success");
    expect(attendanceChips(null)).toEqual([]);
  });
  it("drops the count for a single day", () => {
    const [c] = attendanceChips([{ status: "present" }]);
    expect(chipText(c, true)).toBe("Present");
    expect(chipText(c, false)).toBe("Present 1");
  });
});

describe("wage history", () => {
  it("sums paid payments only", () => {
    const t = wageTotals([wage(), wage({ id: "w2", status: "voided", net_minor: 999_999 }), wage({ id: "w3", net_minor: 100_000, gross_minor: 100_000, bonus_minor: 0, deductions_minor: 0, advance_recovered_minor: 0 })]);
    expect(t).toEqual({ count: 2, gross_minor: 250_000, bonus_minor: 20_000, deductions_minor: 5_000, advance_recovered_minor: 50_000, net_minor: 215_000 });
  });
  it("formats an export row", () => {
    expect(wageHistoryRow(wage({ days_worked: 5.5, period_to: "2026-10-18" }), { method: "Cash" })).toMatchObject({ label: "WG-000012", period: "12 to 18 Oct 2026", days: "5.5", net: "Rs 1,150", method: "Cash", status: "Paid" });
    expect(wageHistoryRow(wage({ status: "voided", void_reason: "Wrong person" }))).toMatchObject({ status: "Voided", void_reason: "Wrong person", method: "cash" });
    expect(daysText(1)).toBe("1");
  });
});

describe("employee statement", () => {
  it("words the balance for the owner", () => {
    expect(balanceWording(200_000)).toMatchObject({ label: "Owed to employee", amount_minor: 200_000, text: "Rs 2,000 owed to employee" });
    expect(balanceWording(-50_000)).toMatchObject({ label: "Employee owes", amount_minor: 50_000, text: "Employee owes Rs 500" });
    expect(balanceWording(0)).toMatchObject({ label: "Nothing due", text: "Nothing due either way" });
    expect(balanceNote(-1)).toBe("employee owes");
    expect(balanceCell(-50_000)).toBe("Rs 500 employee owes");
    expect(balanceCell(0)).toBe("Rs 0");
  });
  it("names the entry kinds", () => {
    expect(statementKindLabel("wage_paid")).toBe("Wage paid");
    expect(statementKindLabel("advance")).toBe("Advance");
    expect(statementKindLabel("something_else")).toBe("something else");
  });
  it("covers whole months for This month and Last month", () => {
    expect(statementRange("this_month", "2026-10-12")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(statementRange("last_month", "2026-10-12")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(statementRange("last_month", "2026-01-05")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(statementRange("this_month", "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
  it("exports brought forward, the entries and the closing balance", () => {
    const rows = statementExportRows({
      from: "2026-10-01", to: "2026-10-31", brought_forward_minor: -50_000, closing_balance_minor: 0,
      entries: [
        { date: "2026-10-12", at: "", kind: "wage", label: "Wage 12 Oct", ref: "WG-000012", credit_minor: 165_000, debit_minor: 0, detail: "1.0 day(s)", balance_minor: 115_000 },
        { date: "2026-10-12", at: "", kind: "wage_paid", label: "Wage paid", ref: "WG-000012", credit_minor: 0, debit_minor: 115_000, recovered_minor: 50_000, detail: "Advance recovered 500", balance_minor: 0 },
      ],
    });
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ date: "1 Oct 2026", entry: "Brought forward", balance: "Rs 500 employee owes" });
    expect(rows[1]).toMatchObject({ earned: "Rs 1,650", paid: "", balance: "Rs 1,150 owed to employee" });
    expect(rows[2]).toMatchObject({ earned: "", paid: "Rs 1,150", detail: "Advance recovered 500" });
    expect(rows[3]).toMatchObject({ date: "31 Oct 2026", entry: "Closing balance", balance: "Rs 0" });
  });
});
