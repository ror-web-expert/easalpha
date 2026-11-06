// What a refund may give back right now, for the till's Orders screen and the admin order drawer.
// A settled order returns what it was paid. An open order is never refunded from under the kitchen, except what it
// was paid beyond its total (reopened, then a line taken off): the server completes it only once that excess is back
// (409 order.overpaid), so the screens offer exactly that amount.

const SETTLED = ["paid", "closed", "refunded"];

export interface RefundOffer {
  amount_minor: number;
  /** True for an open order's excess, which must go back before the order can be completed. */
  excess: boolean;
}

export function refundOffer(o: { status: string; paid_minor: number; total_minor: number }): RefundOffer | null {
  if (!(o.paid_minor > 0)) return null;
  if (SETTLED.includes(o.status)) return { amount_minor: o.paid_minor, excess: false };
  const excess = o.paid_minor - o.total_minor;
  return excess > 0 ? { amount_minor: excess, excess: true } : null;
}

/** The note under "N orders completed" after Mark All Completed: what it left open, and what to do about it. */
export function bulkCompleteNote(r: { skipped_unpaid?: number; skipped_overpaid?: number }): string | undefined {
  const parts = [
    r.skipped_unpaid ? `${r.skipped_unpaid} unpaid left open; they complete through payment.` : "",
    r.skipped_overpaid ? `${r.skipped_overpaid} paid above ${r.skipped_overpaid === 1 ? "its" : "their"} total left open; refund the excess, then complete.` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}
