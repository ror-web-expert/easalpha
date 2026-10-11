// Pure helpers for the SPEC order screens (Orders Management, the order drawer, Pending Orders, the dashboard).
// Kept free of React so they can be unit tested.
import { addDays, eachDayOfInterval, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import type { BadgeVariant } from "@/components/ui/badge";
import type { DashboardPeriod, OrderDiff, OrderEvent, OrderSummary, SpecPaymentStatus, SpecStatus } from "@/lib/types";
import { formatMoney, formatQty } from "@/lib/money";
import { titleCase } from "@/lib/utils";

export const SPEC_STATUSES: SpecStatus[] = ["pending", "preparing", "ready", "dispatched", "completed", "cancelled"];
export const SPEC_PAYMENT_STATUSES: SpecPaymentStatus[] = ["paid", "pending", "unpaid", "account", "complimentary"];
export const ORDER_TYPES = ["walk_in", "takeaway", "delivery", "dine_in"] as const;
/** SPEC sources: Counter (POS), Website, Mobile App, QR Table and the Online Orders bucket, plus EasAlpha's extra channels. */
export const ORDER_SOURCES: { value: string; label: string }[] = [
  { value: "till", label: "Counter (POS)" }, { value: "online", label: "Website" }, { value: "app", label: "Mobile App" }, { value: "qr", label: "QR Table" },
  { value: "phone", label: "Phone" }, { value: "foodpanda", label: "Foodpanda" }, { value: "kiosk", label: "Kiosk" },
];
export const ORDER_SORTS: { value: OrderSort; label: string }[] = [
  { value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }, { value: "serial_asc", label: "Serial ascending" },
  { value: "serial_desc", label: "Serial descending" }, { value: "amount_desc", label: "Amount, high to low" }, { value: "amount_asc", label: "Amount, low to high" },
];
export type OrderSort = "newest" | "oldest" | "serial_asc" | "serial_desc" | "amount_desc" | "amount_asc";

export function sourceLabel(source: string | null | undefined): string {
  return ORDER_SOURCES.find((s) => s.value === source)?.label ?? titleCase(source);
}

export function specStatusVariant(status: SpecStatus | string | null | undefined): BadgeVariant {
  switch (status) {
    case "pending": return "warning";
    case "preparing": case "dispatched": return "info";
    case "ready": return "success";
    case "completed": return "primary";
    case "cancelled": return "danger";
    default: return "neutral";
  }
}

export function specPaymentVariant(status: SpecPaymentStatus | string | null | undefined): BadgeVariant {
  switch (status) {
    case "paid": return "success";
    case "pending": return "warning";
    case "unpaid": return "danger";
    case "account": return "info";
    case "complimentary": return "accent";
    default: return "neutral";
  }
}

export const isSpecOpen = (status: SpecStatus | string | null | undefined) => ["pending", "preparing", "ready", "dispatched"].includes(String(status));

/** The order code the SPEC shows beside the serial: receipt number, else the till serial. */
export function orderCode(o: Pick<OrderSummary, "receipt_number" | "till_serial">): string {
  return o.receipt_number || o.till_serial || "";
}

/** "cash:50000,card:20000" → "Cash Rs 500, Card Rs 200". */
export function paymentMethods(summary: string | null | undefined, currency = "PKR"): string {
  if (!summary) return "";
  return summary.split(",").filter(Boolean).map((p) => {
    const [m, v] = p.split(":");
    return v === undefined ? titleCase(m) : `${titleCase(m)} ${formatMoney(Number(v), currency)}`;
  }).join(", ");
}

/** Header line of the order story: "Reopened 2 times and edited 3 times", or null when untouched. */
export function reopenLine(reopenCount: number | null | undefined, editCount: number | null | undefined): string | null {
  const r = reopenCount ?? 0;
  const e = editCount ?? 0;
  if (!r && !e) return null;
  const times = (n: number) => `${n} ${n === 1 ? "time" : "times"}`;
  if (r && e) return `Reopened ${times(r)} and edited ${times(e)}`;
  return r ? `Reopened ${times(r)}` : `Edited ${times(e)}`;
}

export const EVENT_TITLES: Record<string, string> = { punched: "Punched", reopened: "Reopened for editing", edited: "Edited", completed: "Completed", cancelled: "Cancelled", payment: "Payment collected" };
export const eventTitle = (type: string) => EVENT_TITLES[type] ?? titleCase(type);

/** Item diff of an edit as SPEC-style lines: "+ Cold Drink (1.5 Ltr) × 1", "− Chai × 1", "Chai 2 → 1". */
export function diffLines(diff: OrderDiff | null | undefined): string[] {
  if (!diff) return [];
  return [
    ...(diff.added ?? []).map((a) => `+ ${a.name} × ${formatQty(a.quantity)}`),
    ...(diff.removed ?? []).map((r) => `− ${r.name} × ${formatQty(r.quantity)}`),
    ...(diff.changed ?? []).map((c) => `${c.name} ${formatQty(c.from)} → ${formatQty(c.to)}`),
  ];
}

/** "amount due 980 → 1230" with the money formatter, or null when the amount did not move. */
export function amountLine(before: number | null | undefined, after: number | null | undefined, currency = "PKR"): string | null {
  if (before === null || before === undefined || after === null || after === undefined || before === after) return null;
  return `amount due ${formatMoney(before, currency)} → ${formatMoney(after, currency)}`;
}

/** Every detail line of one story event, in display order. */
export function storyLines(e: Pick<OrderEvent, "diff" | "amount_before" | "amount_after" | "note">, currency = "PKR"): string[] {
  const lines = diffLines(e.diff);
  const money = amountLine(e.amount_before, e.amount_after, currency);
  if (money) lines.push(money);
  if (e.note) lines.push(e.note);
  return lines;
}

export const DASHBOARD_PERIODS: { value: DashboardPeriod; label: string }[] = [
  { value: "today", label: "Today" }, { value: "yesterday", label: "Yesterday" }, { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" }, { value: "month", label: "This month" }, { value: "custom", label: "Custom" },
];

/** The business days a dashboard period covers, matching Reports::Dashboard.spec on the API. */
export function periodRange(period: DashboardPeriod, today: Date | string = new Date(), custom?: { from: string; to: string }): { from: string; to: string } {
  const t = typeof today === "string" ? parseISO(today) : today;
  const iso = (d: Date) => format(d, "yyyy-MM-dd");
  switch (period) {
    case "yesterday": return { from: iso(addDays(t, -1)), to: iso(addDays(t, -1)) };
    case "7d": return { from: iso(addDays(t, -6)), to: iso(t) };
    case "30d": return { from: iso(addDays(t, -29)), to: iso(t) };
    case "month": return { from: iso(startOfMonth(t)), to: iso(t) };
    case "custom": return custom ?? { from: iso(t), to: iso(t) };
    default: return { from: iso(t), to: iso(t) };
  }
}

/** "Mon 6 am" style hour label for the hourly charts: 0 → "12 am", 13 → "1 pm". */
export function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${hour < 12 ? "am" : "pm"}`;
}

export interface CalendarCell { day: string; inMonth: boolean; count: number }
/** Weeks (Monday first) covering a month, each day carrying its open-order count from the Pending Orders calendar. */
export function monthGrid(month: Date | string, counts: { day: string; count: number }[]): CalendarCell[][] {
  const m = typeof month === "string" ? parseISO(month) : month;
  const byDay = new Map(counts.map((c) => [c.day, c.count]));
  const start = startOfWeek(startOfMonth(m), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(m), { weekStartsOn: 1 });
  const cells = eachDayOfInterval({ start, end }).map((d) => {
    const day = format(d, "yyyy-MM-dd");
    return { day, inMonth: d.getMonth() === m.getMonth(), count: byDay.get(day) ?? 0 };
  });
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** "22 open orders today · 80 from previous days". */
export function openOrdersPill(today: number, previous: number): string {
  const t = `${today} open ${today === 1 ? "order" : "orders"} today`;
  return previous > 0 ? `${t} · ${previous} from previous days` : t;
}
