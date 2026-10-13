// Pure helpers for customer accounts (khata): bill periods, signed amounts for adjustments and opening balances,
// ledger row labels, bill summary math, bill run counts, duplicate checks and the import template. No React, no API,
// so every rule here is covered by customer-accounts-helpers.test.ts.
import { endOfMonth, format, isValid, parseISO, startOfMonth, subMonths } from "date-fns";
import type { BillRunResult, LedgerEntry, LedgerTotals } from "@/lib/types";
import type { BadgeVariant } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { toCsv } from "@/lib/csv";

// ---- Periods ----

/** A bill or ledger period as YYYY-MM-DD strings. Both blank means all time. */
export interface Period { from: string; to: string }
export type PeriodPreset = "this_month" | "last_month" | "all" | "custom";
export const ALL_TIME: Period = { from: "", to: "" };

const day = (d: Date) => format(d, "yyyy-MM-dd");
const parse = (s: string): Date | null => { if (!s) return null; const d = parseISO(s); return isValid(d) ? d : null; };

/** The dates behind a preset. This month runs to today; last month is the whole previous calendar month. */
export function periodFor(preset: Exclude<PeriodPreset, "custom">, today: Date = new Date()): Period {
  if (preset === "all") return { ...ALL_TIME };
  if (preset === "this_month") return { from: day(startOfMonth(today)), to: day(today) };
  const prev = subMonths(startOfMonth(today), 1);
  return { from: day(prev), to: day(endOfMonth(prev)) };
}

/** Which preset a period matches, or custom. */
export function presetOf(p: Period, today: Date = new Date()): PeriodPreset {
  if (isAllTime(p)) return "all";
  const same = (q: Period) => q.from === p.from && q.to === p.to;
  if (same(periodFor("last_month", today))) return "last_month";
  if (same(periodFor("this_month", today))) return "this_month";
  return "custom";
}

export function isAllTime(p: Period): boolean { return !p.from && !p.to; }

/** A message when the period cannot be used, or null. */
export function periodError(p: Period): string | null {
  if (isAllTime(p)) return null;
  if (!parse(p.from) || !parse(p.to)) return "Pick both dates";
  if (p.from > p.to) return "The end date is before the start date";
  return null;
}

/** "September 2026" for a whole calendar month, otherwise "1 Sep 2026 to 15 Sep 2026" (the API names bills the same way). */
export function periodLabel(p: Period): string {
  if (isAllTime(p)) return "All time";
  const f = parse(p.from);
  const t = parse(p.to);
  if (!f || !t) return "";
  if (f.getDate() === 1 && day(endOfMonth(f)) === p.to) return format(f, "MMMM yyyy");
  return `${format(f, "d MMM yyyy")} to ${format(t, "d MMM yyyy")}`;
}

/** Query params for a period; all time sends nothing. */
export function periodQuery(p: Period): { from?: string; to?: string } {
  return isAllTime(p) ? {} : { from: p.from || undefined, to: p.to || undefined };
}

/** today is the branch's business day (YYYY-MM-DD), which the API checks against: at 1 am it is still yesterday. */
export function isFutureDay(value: string, today: string): boolean {
  return !!value && value > today;
}

/** The date to send with an opening balance or adjustment: a past day as picked. Today, or blank, is left out so the
 *  API dates it by its own business day in the branch's time zone, and a browser clock ahead of it cannot be refused. */
export function effectiveDay(value: string, today: string): string | undefined {
  return value && value < today ? value : undefined;
}

// ---- Khata limit ----

/** The smallest credit limit: Rs 1. A limit of 0 means khata is not allowed. */
export const MIN_KHATA_LIMIT = 100;

/** Why Save must wait: a limit above 0 but under Rs 1. null (no limit) and 0 (not allowed) are fine. */
export function khataLimitError(limitMinor: number | null | undefined): string | null {
  return limitMinor !== null && limitMinor !== undefined && limitMinor > 0 && limitMinor < MIN_KHATA_LIMIT ? "Enter a limit of at least Rs 1" : null;
}

// ---- Signed amounts ----

/** increase = the customer owes more; decrease = the customer owes less. */
export type Direction = "increase" | "decrease";

/** The API's signed amount: positive means the customer owes more. */
export function signedAmount(direction: Direction, amountMinor: number): number {
  const a = Math.abs(Math.round(Number(amountMinor) || 0));
  return direction === "increase" ? a : -a;
}

/** Opening balance: what the customer already owes, or negative when they paid in advance. */
export function openingAmount(amountMinor: number, inAdvance: boolean): number {
  return signedAmount(inAdvance ? "decrease" : "increase", amountMinor);
}

/** "+Rs 500" / "-Rs 200" for adjustment and ledger amounts; zero has no sign. */
export function signedMoney(minor: number, currency?: string): string {
  if (!minor) return formatMoney(0, currency);
  return `${minor < 0 ? "-" : "+"}${formatMoney(Math.abs(minor), currency)}`;
}

/** What a balance reads as: owes, in advance or settled, with the amount. */
export function balanceText(minor: number, currency?: string): string {
  if (minor > 0) return `Owes ${formatMoney(minor, currency)}`;
  if (minor < 0) return `${formatMoney(-minor, currency)} in advance`;
  return "Settled";
}

// ---- Ledger rows ----

export const ADJUSTMENT_KINDS = ["opening", "adjustment", "reversal"];

export function entryKindLabel(kind: string): string {
  switch (kind) {
    case "charge": return "On account";
    case "payment": return "Payment";
    case "refund": return "Refund";
    case "paid_out": return "Paid out";
    case "opening": return "Opening balance";
    case "adjustment": return "Adjustment";
    case "reversal": return "Reversal";
    default: return kind.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }
}

/** The same kinds as the customer reads them on a bill. */
export function billEntryLabel(kind: string): string {
  return kind === "charge" ? "Purchase" : kind === "paid_out" ? "Paid to you" : entryKindLabel(kind);
}

export function entryKindVariant(kind: string): BadgeVariant {
  switch (kind) {
    case "charge": return "warning";
    case "payment": return "success";
    case "refund": return "info";
    case "opening": return "primary";
    case "adjustment": return "accent";
    case "reversal": return "outline";
    default: return "neutral";
  }
}

/** Order label, adjustment label (ADJ-000012) or payment number. */
export function entryRef(e: Pick<LedgerEntry, "order_label" | "label" | "number">): string {
  return e.order_label ?? e.label ?? (e.number !== undefined && e.number !== null ? String(e.number) : "");
}

/** The line under the entry: items for a purchase, the reason for an adjustment, the method for a payment. */
export function entryDetails(e: Pick<LedgerEntry, "kind" | "items" | "reason" | "reverses_label" | "method_name" | "method" | "reference">): string {
  switch (e.kind) {
    case "charge": return e.items ?? "";
    case "payment":
    case "paid_out": return [e.method_name ?? e.method, e.reference].filter(Boolean).join(" · ");
    case "reversal": return [e.reverses_label ? `Reverses ${e.reverses_label}` : null, e.reason].filter(Boolean).join(": ");
    default: return e.reason ?? "";
  }
}

/** The date an entry counts on (adjustments use their effective date). */
export function entryDay(e: Pick<LedgerEntry, "date" | "business_day">): string {
  return e.date ?? e.business_day;
}

/** An opening balance or adjustment that can still be reversed from a ledger row. */
export function canReverseEntry(e: Pick<LedgerEntry, "kind" | "reversed">): boolean {
  return (e.kind === "opening" || e.kind === "adjustment") && !e.reversed;
}

export type LedgerRow =
  | { type: "brought_forward"; day: string; balance_minor: number }
  | { type: "entry"; entry: LedgerEntry }
  | { type: "closing"; day: string; balance_minor: number };

/** Rows for the ledger table: with a period, a "Balance brought forward" first row and a "Closing balance" last row. */
export function ledgerRows(ledger: { entries: LedgerEntry[]; from?: string; to?: string; brought_forward_minor?: number; closing_balance_minor?: number }, period: Period): LedgerRow[] {
  const rows: LedgerRow[] = ledger.entries.map((entry) => ({ type: "entry", entry }));
  if (isAllTime(period)) return rows;
  const bf = ledger.brought_forward_minor ?? 0;
  const last = ledger.entries[ledger.entries.length - 1];
  return [
    { type: "brought_forward", day: ledger.from ?? period.from, balance_minor: bf },
    ...rows,
    { type: "closing", day: ledger.to ?? period.to, balance_minor: ledger.closing_balance_minor ?? last?.balance_minor ?? bf },
  ];
}

// ---- Bill summary ----

export interface BillLine { key: string; label: string; amount_minor: number }

/** Closing balance from the brought forward and the period totals (payments and refunds are positive in totals). */
export function closingFrom(broughtForward: number, t: LedgerTotals): number {
  return broughtForward + t.charges_minor - t.payments_minor - t.refunds_minor + t.paid_out_minor + t.adjustments_minor;
}

/** Summary lines for a bill, signed the way they move the balance. Refunds, paid out and adjustments show only when there are any;
 *  an opening balance entered in the period is part of the adjustments line, which then says so (as the PDF does). */
export function billLines(b: { brought_forward_minor: number; totals: LedgerTotals; entries?: { kind: string }[] }): BillLine[] {
  const t = b.totals;
  const lines: BillLine[] = [
    { key: "previous", label: "Previous balance", amount_minor: b.brought_forward_minor },
    { key: "purchases", label: "Purchases", amount_minor: t.charges_minor },
    { key: "payments", label: "Payments", amount_minor: -t.payments_minor },
  ];
  if (t.refunds_minor) lines.push({ key: "refunds", label: "Refunds", amount_minor: -t.refunds_minor });
  if (t.paid_out_minor) lines.push({ key: "paid_out", label: "Paid to you", amount_minor: t.paid_out_minor });
  const opening = (b.entries ?? []).some((e) => e.kind === "opening");
  if (t.adjustments_minor) lines.push({ key: "adjustments", label: opening ? "Opening & adjustments" : "Adjustments", amount_minor: t.adjustments_minor });
  return lines;
}

export function amountDue(closingMinor: number): number { return Math.max(0, closingMinor); }

/** The sentence at the end of a bill. */
export function closingMessage(b: { closing_balance_minor: number; due_on: string | null }, currency?: string): string {
  const c = b.closing_balance_minor;
  if (c > 0) {
    const due = parse(b.due_on ?? "");
    return due ? `Please pay ${formatMoney(c, currency)} by ${format(due, "d MMM yyyy")}.` : `Please pay ${formatMoney(c, currency)}.`;
  }
  if (c < 0) return `You have ${formatMoney(-c, currency)} in advance. Nothing to pay.`;
  return "Nothing to pay. Thank you.";
}

export function billFileName(khataNo: string | number | null | undefined, to: string): string {
  return `bill-${khataNo ?? "customer"}-${(to || day(new Date())).slice(0, 7)}.pdf`;
}

/** Phones that get account messages: the customer's own, and the guardian's when asked for or when there is no own phone. Same rule as the API. */
export function accountPhones(c: { phone?: string | null; guardian_phone?: string | null; notify_guardian?: boolean | null }): string[] {
  const list = [c.phone ?? ""];
  if (c.guardian_phone && (c.notify_guardian || !c.phone)) list.push(c.guardian_phone);
  return [...new Set(list.map((p) => p.trim()).filter(Boolean))];
}

// ---- Monthly bills screen ----

/** Bills print in one GET; above this many customer ids the URL gets too long for the server. */
export const MAX_PRINT_IDS = 150;

type BillsRowLike = { customer: { id: string }; closing_balance_minor: number; entries_count: number };

/** Who "Send bills" goes to: the selected rows, or else everyone listed who owes at least the minimum (at least 1 paisa). */
export function billTargets<T extends BillsRowLike>(rows: T[], selected: ReadonlySet<string>, minDueMinor = 1): { rows: T[]; selected: boolean } {
  const chosen = rows.filter((r) => selected.has(r.customer.id));
  if (chosen.length) return { rows: chosen, selected: true };
  const min = Math.max(1, Math.round(Number(minDueMinor) || 0));
  return { rows: rows.filter((r) => r.closing_balance_minor >= min), selected: false };
}

/** customer_ids for Print: the selection; else, when a search or a minimum hides some customers, the rows shown that
 *  have a bill; else undefined, and the API prints everyone with something on account for the period. */
export function printIds<T extends BillsRowLike>(rows: T[], selected: ReadonlySet<string>, filtered: boolean): string[] | undefined {
  const chosen = rows.filter((r) => selected.has(r.customer.id));
  if (chosen.length) return chosen.map((r) => r.customer.id);
  if (!filtered) return undefined;
  return rows.filter((r) => r.entries_count > 0 || r.closing_balance_minor !== 0).map((r) => r.customer.id);
}

// ---- Bill runs ----

export function runCounts(results: Pick<BillRunResult, "status">[]): { sent: number; failed: number; skipped: number } {
  return {
    sent: results.filter((r) => r.status === "sent").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
  };
}

export function runStatusLabel(status: BillRunResult["status"]): string {
  return status === "sent" ? "Sent" : status === "skipped" ? "No phone" : "Failed";
}

export function runStatusVariant(status: BillRunResult["status"]): BadgeVariant {
  return status === "sent" ? "success" : status === "skipped" ? "warning" : "danger";
}

export function triggerLabel(trigger: string): string {
  return trigger === "auto" ? "Automatic" : "Sent by staff";
}

/** Plain words for the errors a bill send can return. */
export function sendErrorText(code: string, fallback: string, name?: string): string {
  if (code === "whatsapp.disabled") return "WhatsApp sending is switched off. Turn it on in Settings, WhatsApp, then send again.";
  if (code === "whatsapp.no_phone") return `${name ?? "This customer"} has no phone number and no guardian phone.`;
  if (code === "module.disabled") return "Customer accounts are switched off. The owner can switch them on in Settings, Modules.";
  return fallback;
}

/** The PIN dialog was closed without approving; nothing to report. */
export function isApprovalCancelled(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { code?: unknown }).code === "approval.cancelled";
}

// ---- Duplicates and phones ----

export function phoneDigits(v: string | null | undefined): string { return String(v ?? "").replace(/\D/g, ""); }

/** A phone worth saving: null for blank or just the country code ("+92"). */
export function cleanPhone(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  return phoneDigits(s).length >= 7 ? s : null;
}

export interface DuplicateFields { name?: string | null; phone?: string | null; member_no?: string | null; guardian_phone?: string | null }

/** Query for GET /customers/duplicates, or null while nothing worth checking has been typed. */
export function duplicateQuery(f: DuplicateFields, excludeId?: string | null): Record<string, string> | null {
  const q: Record<string, string> = {};
  const name = String(f.name ?? "").trim();
  if (name.toLowerCase().replace(/[^a-z0-9]/g, "").length >= 3) q.name = name;
  if (phoneDigits(f.phone).length >= 10) q.phone = String(f.phone).trim();
  const roll = String(f.member_no ?? "").trim();
  if (roll) q.member_no = roll;
  if (phoneDigits(f.guardian_phone).length >= 10) q.guardian_phone = String(f.guardian_phone).trim();
  if (!Object.keys(q).length) return null;
  if (excludeId) q.exclude_id = excludeId;
  return q;
}

// ---- Selection ----

export function toggleId(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

/** Selects every id, or clears them all when they are all selected already. */
export function toggleAll(selected: ReadonlySet<string>, ids: string[]): Set<string> {
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  const next = new Set(selected);
  ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
  return next;
}

// ---- Import template ----

export interface ImportColumn { key: string; help: string; examples: [string, string]; khata?: boolean }

/** CSV columns for POST /customers/import, in template order. khata: only with customer accounts switched on. */
export const IMPORT_COLUMNS: ImportColumn[] = [
  { key: "name", help: "Required. The customer's full name.", examples: ["Ali Raza", "Sana Khan"] },
  { key: "phone", help: "Mobile number, 03001234567 or +923001234567. Used to find an existing customer. In Excel, format the phone columns as Text first, or Excel changes the numbers (it drops the leading 0).", examples: ["03001234567", "03451234567"] },
  { key: "email", help: "Optional.", examples: ["", "sana@example.com"] },
  { key: "company", help: "Office or company, optional.", examples: ["", "Head office"] },
  { key: "group", help: "Customer group. A new group is made when the name is new.", examples: ["Hostel A", "Staff"] },
  { key: "address", help: "Saved as the default address for new customers.", examples: ["", "House 5, Street 2"] },
  { key: "notes", help: "Anything else about the customer.", examples: ["First year", ""] },
  { key: "room", help: "Room or unit.", examples: ["B-12", "C-4"] },
  { key: "roll_no", help: "Roll or ID number. Used to find an existing customer when there is no phone match.", examples: ["2024-CS-17", "EMP-203"] },
  { key: "guardian_name", help: "Parent or guardian.", examples: ["Raza Ahmed", ""] },
  { key: "guardian_phone", help: "Guardian's mobile number. Format it as Text in Excel, like phone.", examples: ["03211234567", ""] },
  { key: "credit_limit", help: "Khata limit in rupees. Leave blank for no limit.", examples: ["10000", "5000"], khata: true },
  { key: "opening_balance", help: "What the customer already owes, in rupees. Negative means paid in advance. Skipped when they already have one.", examples: ["2500", "-1000"], khata: true },
];

export function importColumns(khata: boolean): ImportColumn[] {
  return IMPORT_COLUMNS.filter((c) => khata || !c.khata);
}

/** The template as columns and two example rows, ready for downloadCsv. */
export function templateTable(khata: boolean): { columns: { header: string; key: string }[]; rows: Record<string, string>[] } {
  const cols = importColumns(khata);
  return { columns: cols.map((c) => ({ header: c.key, key: c.key })), rows: [0, 1].map((i) => Object.fromEntries(cols.map((c) => [c.key, c.examples[i]]))) };
}

/** Header line plus two example rows. */
export function templateCsv(khata: boolean): string {
  const t = templateTable(khata);
  return toCsv(t.columns, t.rows);
}
