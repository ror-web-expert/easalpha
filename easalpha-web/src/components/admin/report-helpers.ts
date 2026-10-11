// Pure helpers for the Reports screens (SPEC "Report catalogue"): share bars, the Sales Calendar grid, AI badge
// labels and tones, and flattening nested rows for CSV and PDF export. No React here so Vitest can cover them.
import type { BadgeVariant } from "@/components/ui";
import type { AiPricingSuggestion, SalesCalendarDay, StockUrgency } from "@/lib/types";
import { formatMoney } from "@/lib/money";

/** Width of a share bar as a percentage string. Clamped to 0..100; anything above zero shows at least a sliver. */
export function shareWidth(percent: number | null | undefined): string {
  const n = Number(percent ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0%";
  return `${Math.min(100, Math.max(2, n))}%`;
}

/** Percentage of part in total, one decimal, 0 when the total is zero. */
export function pctOf(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part * 1000) / total) / 10;
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday-first column index for a JS weekday (0 = Sunday). */
export function weekColumn(wday: number): number {
  return (wday + 6) % 7;
}

/**
 * Lays a month's days out as rows of seven cells, Monday first. Leading cells before the first day and trailing
 * cells after the last are null so the grid lines up with the weekday header.
 */
export function buildCalendarGrid<T extends Pick<SalesCalendarDay, "wday">>(days: T[]): (T | null)[][] {
  if (!days.length) return [];
  const cells: (T | null)[] = Array.from({ length: weekColumn(days[0].wday) }, () => null);
  cells.push(...days);
  while (cells.length % 7) cells.push(null);
  const rows: (T | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** "2026-10" plus or minus whole months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "October 2026" for a YYYY-MM month. */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function suggestionLabel(s: AiPricingSuggestion | string | null | undefined): string {
  switch (s) {
    case "raise_price": return "Raise price";
    case "promote": return "Promote";
    case "review_cost": return "Review cost";
    case "ok": return "Fine as is";
    default: return "-";
  }
}

export function suggestionTone(s: AiPricingSuggestion | string | null | undefined): BadgeVariant {
  switch (s) {
    case "raise_price": return "success";
    case "promote": return "info";
    case "review_cost": return "warning";
    default: return "neutral";
  }
}

export function urgencyLabel(u: StockUrgency | string | null | undefined): string {
  switch (u) {
    case "critical": return "Critical";
    case "soon": return "Soon";
    case "ok": return "Covered";
    default: return "-";
  }
}

export function urgencyTone(u: StockUrgency | string | null | undefined): BadgeVariant {
  switch (u) {
    case "critical": return "danger";
    case "soon": return "warning";
    case "ok": return "success";
    default: return "neutral";
  }
}

/** Margin badge: healthy above 50, thin between 20 and 50, loss or near loss below 20. */
export function marginTone(percent: number | null | undefined): BadgeVariant {
  if (percent === null || percent === undefined) return "neutral";
  if (percent < 0) return "danger";
  if (percent < 20) return "warning";
  if (percent < 50) return "info";
  return "success";
}

export function hourLabel(hour: number | null | undefined): string {
  if (hour === null || hour === undefined) return "-";
  const h = hour % 12 || 12;
  return `${h}${hour < 12 ? "am" : "pm"}`;
}

export function minutesLabel(m: number | null | undefined): string {
  if (m === null || m === undefined) return "-";
  return `${Number(m).toFixed(1)} min`;
}

/** "cash Rs 1,200, card Rs 300" from a by-method map, largest first. */
export function methodTotalsText(map: Record<string, number> | null | undefined): string {
  return Object.entries(map ?? {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.replace(/_/g, " ")} ${formatMoney(v)}`).join(", ");
}

type Flat = Record<string, string | number | boolean | null>;

/**
 * Flattens a nested row for CSV: objects become parent_child keys, arrays of scalars join with ", ", arrays of
 * objects are counted, and *_minor keys are formatted as money so the export reads like the screen.
 */
export function flattenRow(row: Record<string, unknown>, prefix = ""): Flat {
  const out: Flat = {};
  for (const [key, value] of Object.entries(row)) {
    const name = prefix ? `${prefix}_${key}` : key;
    if (value === null || value === undefined) out[name] = null;
    else if (Array.isArray(value)) {
      out[name] = value.length && typeof value[0] === "object" ? value.length : value.map((v) => String(v)).join(", ");
    } else if (typeof value === "object") Object.assign(out, flattenRow(value as Record<string, unknown>, name));
    else if (typeof value === "number" && /_minor$/.test(key)) out[name] = formatMoney(value);
    else out[name] = value as string | number | boolean;
  }
  return out;
}

export function flattenRows(rows: Record<string, unknown>[]): Flat[] {
  return rows.map((r) => flattenRow(r));
}

/** Column list from flattened rows: header is the key in words, so a one-off export needs no column spec. */
export function columnsFor(rows: Flat[]): { header: string; key: string }[] {
  const keys = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
  return [...keys].map((k) => ({ header: k.replace(/_minor$/, "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), key: k }));
}
