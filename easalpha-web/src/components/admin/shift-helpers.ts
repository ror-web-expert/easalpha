// Pure helpers for the admin day-close and settlement screens: each drawer's count and what its settlement moved.
import type { DayCloseShift, DayEndShiftDetail } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { titleCase } from "@/lib/utils";

const given = (v: number | null | undefined): v is number => v !== null && v !== undefined;

/** "Ali · counted Rs 9,000 of Rs 9,280 · settled"; a summary saved before the counts were in it shows the status only. */
export function shiftLabel(s: DayCloseShift): string {
  const parts = [s.cashier ?? titleCase(s.status)];
  if (given(s.counted_minor)) parts.push(`counted ${formatMoney(s.counted_minor)}${given(s.expected_minor) ? ` of ${formatMoney(s.expected_minor)}` : ""}`);
  else if (s.status === "open") parts.push("still open");
  if (s.settlement_status && s.status !== "open") parts.push(s.settlement_status === "settled" ? "settled" : "not settled");
  return parts.join(" · ");
}

/** The shifts a Day-End Settlement cleared, from its detail (older records carry the amount only). */
export function settlementShifts(detail: Record<string, unknown> | null | undefined): DayEndShiftDetail[] {
  const rows = (detail as { shifts?: unknown } | null | undefined)?.shifts;
  return Array.isArray(rows) ? (rows as DayEndShiftDetail[]) : [];
}

/** "Ali: counted Rs 14,000, float Rs 5,000 back to the safe, Rs 9,000 cleared, short Rs 280". */
export function settlementShiftLine(d: DayEndShiftDetail): string {
  const parts = [given(d.counted_minor) ? `counted ${formatMoney(d.counted_minor)}` : null, d.float_to_safe_minor ? `float ${formatMoney(d.float_to_safe_minor)} back to the safe` : null,
    `${formatMoney(d.amount_minor)} cleared`, given(d.over_short_minor) && d.over_short_minor !== 0 ? `${d.over_short_minor < 0 ? "short" : "over"} ${formatMoney(Math.abs(d.over_short_minor))}` : null];
  return `${d.cashier ?? "Cashier"}: ${parts.filter(Boolean).join(", ")}`;
}
