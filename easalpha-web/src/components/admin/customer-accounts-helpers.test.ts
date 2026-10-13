import { describe, expect, it } from "vitest";
import type { LedgerEntry, LedgerTotals } from "@/lib/types";
import {
  ALL_TIME, accountPhones, amountDue, balanceText, billEntryLabel, billFileName, billLines, canReverseEntry, cleanPhone, closingFrom, closingMessage, duplicateQuery,
  entryDay, entryDetails, entryKindLabel, entryKindVariant, entryRef, importColumns, isAllTime, isApprovalCancelled, isFutureDay, ledgerRows, openingAmount, periodError,
  periodFor, periodLabel, periodQuery, presetOf, runCounts, runStatusLabel, runStatusVariant, sendErrorText, signedAmount, signedMoney, templateCsv, toggleAll, toggleId, triggerLabel,
  billTargets, effectiveDay, IMPORT_COLUMNS, khataLimitError, MIN_KHATA_LIMIT, printIds, templateTable,
} from "./customer-accounts-helpers";
import { businessDayFor } from "@/lib/business-day";

const today = new Date(2026, 9, 12); // 12 Oct 2026
const totals = (t: Partial<LedgerTotals> = {}): LedgerTotals => ({ charges_minor: 0, payments_minor: 0, refunds_minor: 0, paid_out_minor: 0, adjustments_minor: 0, ...t });
const entry = (e: Partial<LedgerEntry>): LedgerEntry => ({ at: "2026-09-03T10:00:00Z", kind: "charge", amount_minor: 0, business_day: "2026-09-03", ref: "r", balance_minor: 0, ...e });

describe("periods", () => {
  it("gives this month to today, last month as the whole previous month, and all time as blank", () => {
    expect(periodFor("this_month", today)).toEqual({ from: "2026-10-01", to: "2026-10-12" });
    expect(periodFor("last_month", today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(periodFor("all", today)).toEqual(ALL_TIME);
    expect(periodFor("last_month", new Date(2026, 0, 15))).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(periodFor("last_month", new Date(2024, 2, 31))).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });
  it("recognises the preset a period matches", () => {
    expect(presetOf({ from: "2026-09-01", to: "2026-09-30" }, today)).toBe("last_month");
    expect(presetOf({ from: "2026-10-01", to: "2026-10-12" }, today)).toBe("this_month");
    expect(presetOf(ALL_TIME, today)).toBe("all");
    expect(presetOf({ from: "2026-09-05", to: "2026-09-30" }, today)).toBe("custom");
  });
  it("checks the dates", () => {
    expect(periodError(ALL_TIME)).toBeNull();
    expect(periodError({ from: "2026-09-01", to: "2026-09-30" })).toBeNull();
    expect(periodError({ from: "2026-09-01", to: "" })).toBe("Pick both dates");
    expect(periodError({ from: "2026-10-01", to: "2026-09-30" })).toBe("The end date is before the start date");
  });
  it("names a whole month by its name and any other period by its dates", () => {
    expect(periodLabel({ from: "2026-09-01", to: "2026-09-30" })).toBe("September 2026");
    expect(periodLabel({ from: "2026-10-01", to: "2026-10-12" })).toBe("1 Oct 2026 to 12 Oct 2026");
    expect(periodLabel({ from: "2026-02-01", to: "2026-02-28" })).toBe("February 2026");
    expect(periodLabel(ALL_TIME)).toBe("All time");
  });
  it("sends no dates for all time", () => {
    expect(periodQuery(ALL_TIME)).toEqual({});
    expect(periodQuery({ from: "2026-09-01", to: "2026-09-30" })).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(isAllTime({ from: "", to: "" })).toBe(true);
  });
  it("flags a date after the branch's business day, which at 00:30 is still yesterday", () => {
    const halfPastMidnight = businessDayFor("02:01", new Date(2026, 9, 13, 0, 30)); // 13 Oct 00:30 belongs to 12 Oct
    expect(halfPastMidnight).toBe("2026-10-12");
    expect(isFutureDay("2026-10-13", halfPastMidnight)).toBe(true); // the calendar date is still the future to the API
    expect(isFutureDay("2026-10-12", halfPastMidnight)).toBe(false);
    expect(isFutureDay("", halfPastMidnight)).toBe(false);
    const afterDayEnd = businessDayFor("02:01", new Date(2026, 9, 13, 2, 30));
    expect(afterDayEnd).toBe("2026-10-13");
    expect(isFutureDay("2026-10-13", afterDayEnd)).toBe(false);
  });
  it("sends only a past day; today or blank is left to the API's own business day", () => {
    expect(effectiveDay("", "2026-10-12")).toBeUndefined();
    expect(effectiveDay("2026-10-12", "2026-10-12")).toBeUndefined();
    expect(effectiveDay("2026-10-01", "2026-10-12")).toBe("2026-10-01");
    expect(effectiveDay("2026-10-13", "2026-10-12")).toBeUndefined(); // Save is held for a future day anyway
  });
});

describe("signed amounts", () => {
  it("makes increases positive and decreases negative whatever sign was typed", () => {
    expect(signedAmount("increase", 50000)).toBe(50000);
    expect(signedAmount("decrease", 50000)).toBe(-50000);
    expect(signedAmount("increase", -300)).toBe(300);
    expect(signedAmount("decrease", 0)).toBe(-0);
  });
  it("makes an opening paid in advance negative", () => {
    expect(openingAmount(250000, false)).toBe(250000);
    expect(openingAmount(100000, true)).toBe(-100000);
  });
  it("formats signed money and balances", () => {
    expect(signedMoney(50000)).toBe("+Rs 500");
    expect(signedMoney(-20000)).toBe("-Rs 200");
    expect(signedMoney(0)).toBe("Rs 0"); // zero has no sign: "Payments Rs 0", not "+Rs 0"
    expect(balanceText(150000)).toBe("Owes Rs 1,500");
    expect(balanceText(-5000)).toBe("Rs 50 in advance");
    expect(balanceText(0)).toBe("Settled");
  });
});

describe("ledger rows", () => {
  it("labels every kind for staff and for the bill", () => {
    expect(entryKindLabel("charge")).toBe("On account");
    expect(entryKindLabel("opening")).toBe("Opening balance");
    expect(entryKindLabel("reversal")).toBe("Reversal");
    expect(entryKindLabel("something_new")).toBe("Something new");
    expect(billEntryLabel("charge")).toBe("Purchase");
    expect(billEntryLabel("paid_out")).toBe("Paid to you");
    expect(billEntryLabel("payment")).toBe("Payment");
    expect(entryKindVariant("payment")).toBe("success");
    expect(entryKindVariant("adjustment")).toBe("accent");
  });
  it("shows items for purchases, the reason for adjustments and the link for reversals", () => {
    expect(entryDetails(entry({ kind: "charge", items: "2x Chai, 1x Samosa" }))).toBe("2x Chai, 1x Samosa");
    expect(entryDetails(entry({ kind: "adjustment", reason: "Double charged" }))).toBe("Double charged");
    expect(entryDetails(entry({ kind: "reversal", reverses_label: "ADJ-000012", reason: "Entered twice" }))).toBe("Reverses ADJ-000012: Entered twice");
    expect(entryDetails(entry({ kind: "payment", method_name: "Cash", reference: "R-9" }))).toBe("Cash · R-9");
    expect(entryDetails(entry({ kind: "payment", method: "jazzcash" }))).toBe("jazzcash");
  });
  it("picks the reference and the date an entry counts on", () => {
    expect(entryRef(entry({ order_label: "T-104" }))).toBe("T-104");
    expect(entryRef(entry({ kind: "adjustment", label: "ADJ-000003" }))).toBe("ADJ-000003");
    expect(entryRef(entry({ kind: "payment", number: 17 }))).toBe("17");
    expect(entryRef(entry({}))).toBe("");
    expect(entryDay(entry({ date: "2026-09-01", business_day: "2026-09-04" }))).toBe("2026-09-01");
    expect(entryDay(entry({ business_day: "2026-09-04" }))).toBe("2026-09-04");
  });
  it("lets only open openings and adjustments be reversed", () => {
    expect(canReverseEntry({ kind: "adjustment", reversed: false })).toBe(true);
    expect(canReverseEntry({ kind: "opening" })).toBe(true);
    expect(canReverseEntry({ kind: "adjustment", reversed: true })).toBe(false);
    expect(canReverseEntry({ kind: "reversal" })).toBe(false);
    expect(canReverseEntry({ kind: "charge" })).toBe(false);
  });
  it("adds brought forward and closing rows only for a period", () => {
    const entries = [entry({ ref: "a", amount_minor: 1000, balance_minor: 6000 }), entry({ ref: "b", kind: "payment", amount_minor: -2000, balance_minor: 4000 })];
    expect(ledgerRows({ entries }, ALL_TIME).map((r) => r.type)).toEqual(["entry", "entry"]);
    const rows = ledgerRows({ entries, from: "2026-09-01", to: "2026-09-30", brought_forward_minor: 5000, closing_balance_minor: 4000 }, { from: "2026-09-01", to: "2026-09-30" });
    expect(rows.map((r) => r.type)).toEqual(["brought_forward", "entry", "entry", "closing"]);
    expect(rows[0]).toEqual({ type: "brought_forward", day: "2026-09-01", balance_minor: 5000 });
    expect(rows[3]).toEqual({ type: "closing", day: "2026-09-30", balance_minor: 4000 });
  });
  it("closes on the brought forward when a period is empty", () => {
    const rows = ledgerRows({ entries: [], brought_forward_minor: 7000 }, { from: "2026-09-01", to: "2026-09-30" });
    expect(rows).toEqual([{ type: "brought_forward", day: "2026-09-01", balance_minor: 7000 }, { type: "closing", day: "2026-09-30", balance_minor: 7000 }]);
  });
});

describe("bill summary", () => {
  const t = totals({ charges_minor: 1200000, payments_minor: 800000, refunds_minor: 10000, paid_out_minor: 5000, adjustments_minor: -20000 });
  it("adds up to the closing balance", () => {
    expect(closingFrom(300000, t)).toBe(300000 + 1200000 - 800000 - 10000 + 5000 - 20000);
    const lines = billLines({ brought_forward_minor: 300000, totals: t });
    expect(lines.reduce((s, l) => s + l.amount_minor, 0)).toBe(closingFrom(300000, t));
  });
  it("hides refunds, paid out and adjustments when there are none", () => {
    expect(billLines({ brought_forward_minor: 0, totals: totals({ charges_minor: 500 }) }).map((l) => l.key)).toEqual(["previous", "purchases", "payments"]);
    expect(billLines({ brought_forward_minor: 0, totals: t }).map((l) => l.key)).toEqual(["previous", "purchases", "payments", "refunds", "paid_out", "adjustments"]);
    expect(billLines({ brought_forward_minor: 0, totals: t }).at(-1)?.label).toBe("Adjustments");
    expect(billLines({ brought_forward_minor: 0, totals: t, entries: [{ kind: "opening" }] }).at(-1)?.label).toBe("Opening & adjustments");
  });
  it("never asks for a negative amount", () => {
    expect(amountDue(5000)).toBe(5000);
    expect(amountDue(-5000)).toBe(0);
  });
  it("ends the bill with what to pay and by when", () => {
    expect(closingMessage({ closing_balance_minor: 675000, due_on: "2026-10-10" })).toBe("Please pay Rs 6,750 by 10 Oct 2026.");
    expect(closingMessage({ closing_balance_minor: 675000, due_on: null })).toBe("Please pay Rs 6,750.");
    expect(closingMessage({ closing_balance_minor: -20000, due_on: "2026-10-10" })).toBe("You have Rs 200 in advance. Nothing to pay.");
    expect(closingMessage({ closing_balance_minor: 0, due_on: null })).toBe("Nothing to pay. Thank you.");
  });
  it("names the PDF after the khata no and month", () => {
    expect(billFileName(12, "2026-09-30")).toBe("bill-12-2026-09.pdf");
    expect(billFileName(null, "2026-09-30")).toBe("bill-customer-2026-09.pdf");
  });
  it("sends to the guardian only when asked or when the customer has no phone", () => {
    expect(accountPhones({ phone: "+923001234567", guardian_phone: "+923211234567", notify_guardian: false })).toEqual(["+923001234567"]);
    expect(accountPhones({ phone: "+923001234567", guardian_phone: "+923211234567", notify_guardian: true })).toEqual(["+923001234567", "+923211234567"]);
    expect(accountPhones({ phone: null, guardian_phone: "+923211234567" })).toEqual(["+923211234567"]);
    expect(accountPhones({ phone: "+923001234567", guardian_phone: "+923001234567", notify_guardian: true })).toEqual(["+923001234567"]);
    expect(accountPhones({})).toEqual([]);
  });
});

describe("bill runs and errors", () => {
  it("counts results and labels them", () => {
    expect(runCounts([{ status: "sent" }, { status: "sent" }, { status: "failed" }, { status: "skipped" }])).toEqual({ sent: 2, failed: 1, skipped: 1 });
    expect(runStatusLabel("skipped")).toBe("No phone");
    expect(runStatusVariant("failed")).toBe("danger");
    expect(triggerLabel("auto")).toBe("Automatic");
    expect(triggerLabel("manual")).toBe("Sent by staff");
  });
  it("explains WhatsApp errors in plain words", () => {
    expect(sendErrorText("whatsapp.disabled", "x")).toMatch(/switched off/);
    expect(sendErrorText("whatsapp.no_phone", "x", "Ali")).toBe("Ali has no phone number and no guardian phone.");
    expect(sendErrorText("other", "Server said no")).toBe("Server said no");
  });
  it("recognises a cancelled PIN", () => {
    expect(isApprovalCancelled({ code: "approval.cancelled" })).toBe(true);
    expect(isApprovalCancelled({ code: "approval.required" })).toBe(false);
    expect(isApprovalCancelled(null)).toBe(false);
  });
});

describe("duplicates and phones", () => {
  it("drops a phone that is only the country code", () => {
    expect(cleanPhone("+92")).toBeNull();
    expect(cleanPhone("  ")).toBeNull();
    expect(cleanPhone("0300 1234567")).toBe("0300 1234567");
  });
  it("asks only once something worth checking is typed", () => {
    expect(duplicateQuery({ name: "Al", phone: "+92" })).toBeNull();
    expect(duplicateQuery({ name: "Ali", phone: "+92300" })).toEqual({ name: "Ali" });
    expect(duplicateQuery({ phone: "03001234567", member_no: " 2024-CS-17 ", guardian_phone: "+923211234567" }, "c1"))
      .toEqual({ phone: "03001234567", member_no: "2024-CS-17", guardian_phone: "+923211234567", exclude_id: "c1" });
    expect(duplicateQuery({ name: "", member_no: "" }, "c1")).toBeNull();
  });
});

describe("selection", () => {
  it("toggles one id and all ids", () => {
    expect([...toggleId(new Set(["a"]), "b")]).toEqual(["a", "b"]);
    expect([...toggleId(new Set(["a", "b"]), "a")]).toEqual(["b"]);
    expect([...toggleAll(new Set(["a"]), ["a", "b"])].sort()).toEqual(["a", "b"]);
    expect([...toggleAll(new Set(["a", "b", "x"]), ["a", "b"])]).toEqual(["x"]);
    expect([...toggleAll(new Set(), [])]).toEqual([]);
  });
});

describe("monthly bills screen", () => {
  const row = (id: string, closing: number, entries = 1) => ({ customer: { id }, closing_balance_minor: closing, entries_count: entries });
  const rows = [row("a", 50000), row("b", 50), row("c", 0), row("d", -2000), row("e", 0, 0)];
  it("sends to the selection, or else to everyone who owes at least the minimum", () => {
    expect(billTargets(rows, new Set(["c", "d"]))).toEqual({ rows: [rows[2], rows[3]], selected: true });
    expect(billTargets(rows, new Set()).rows.map((r) => r.customer.id)).toEqual(["a", "b"]);
    expect(billTargets(rows, new Set(), 10000).rows.map((r) => r.customer.id)).toEqual(["a"]);
    expect(billTargets(rows, new Set(), 0).rows.map((r) => r.customer.id)).toEqual(["a", "b"]);
    expect(billTargets(rows, new Set(["gone"])).selected).toBe(false);
  });
  it("prints the selection, the filtered rows that have a bill, or leaves it to the API", () => {
    expect(printIds(rows, new Set(["d"]), false)).toEqual(["d"]);
    expect(printIds(rows, new Set(), false)).toBeUndefined();
    expect(printIds(rows, new Set(), true)).toEqual(["a", "b", "c", "d"]);
    expect(printIds([row("e", 0, 0)], new Set(), true)).toEqual([]);
  });
});

describe("khata limit", () => {
  it("refuses a limit above 0 but under Rs 1, and accepts no limit, not allowed and Rs 1 or more", () => {
    expect(MIN_KHATA_LIMIT).toBe(100);
    expect(khataLimitError(1)).toBe("Enter a limit of at least Rs 1");
    expect(khataLimitError(99)).toBe("Enter a limit of at least Rs 1");
    expect(khataLimitError(100)).toBeNull();
    expect(khataLimitError(800_000)).toBeNull();
    expect(khataLimitError(0)).toBeNull();
    expect(khataLimitError(null)).toBeNull();
    expect(khataLimitError(undefined)).toBeNull();
  });
});

describe("import template", () => {
  it("tells Excel users to keep phone columns as Text", () => {
    for (const key of ["phone", "guardian_phone"]) expect(IMPORT_COLUMNS.find((c) => c.key === key)?.help, key).toMatch(/as Text/);
  });
  it("gives the same template as a table for download", () => {
    const t = templateTable(true);
    expect(t.columns.map((c) => c.key)).toContain("roll_no");
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0].name).toBe("Ali Raza");
  });
  it("has every column and two example rows with customer accounts on", () => {
    const lines = templateCsv(true).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("name,phone,email,company,group,address,notes,room,roll_no,guardian_name,guardian_phone,credit_limit,opening_balance");
    expect(lines[1].split(",")).toHaveLength(13);
    expect(lines[2]).toContain("-1000");
  });
  it("leaves out the khata columns when customer accounts are off", () => {
    expect(importColumns(false).map((c) => c.key)).not.toContain("opening_balance");
    expect(templateCsv(false).split("\n")[0]).toBe("name,phone,email,company,group,address,notes,room,roll_no,guardian_name,guardian_phone");
  });
});
