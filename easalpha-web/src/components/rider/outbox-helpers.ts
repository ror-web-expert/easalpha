// Pure rules for the rider's outbox: which failures to retry, and how queued taps show on the delivery cards before the
// server has them. No React, so every rule is unit-tested.
import type { DeliveryStatus } from "@/lib/types";

export interface OutboxItem {
  id: string;
  deliveryId: string;
  orderLabel: string;
  to: DeliveryStatus;
  /** When the rider tapped, sent as occurred_at so the shop sees the real time even if the tap waited for signal. */
  occurredAt: string;
  note?: string;
  cashCollectedMinor?: number;
  lat?: number;
  lng?: number;
  /** The rider's login when the tap was made; another rider signing in on the same phone never sends it. */
  membershipId: string | null;
  attempts: number;
  lastError?: string | null;
}

/** No signal, a timeout, a server error, an expired login or rate limiting: keep it and try again. Anything else the
 *  server answered (409 already changed, 403 or 404 no longer this rider's) will never succeed, so it leaves the queue. */
export function outcomeFor(error: { status?: number } | unknown): "retry" | "drop" {
  const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: number }).status) : NaN;
  if (!Number.isFinite(status) || status === 0 || status === 401 || status === 408 || status === 429 || status >= 500) return "retry";
  return "drop";
}

/** The body of POST /rider/deliveries/:id/status for a queued tap. */
export function statusBody(item: OutboxItem): Record<string, unknown> {
  const body: Record<string, unknown> = { status: item.to, occurred_at: item.occurredAt };
  if (item.note) body.note = item.note;
  if (item.cashCollectedMinor !== undefined) body.cash_collected_minor = item.cashCollectedMinor;
  if (item.lat !== undefined && item.lng !== undefined) { body.lat = item.lat; body.lng = item.lng; }
  return body;
}

type DeliveryLike = { id: string; status: DeliveryStatus | string; picked_up_at?: string | null; delivered_at?: string | null; cash_collected_minor?: number | null; failed_reason?: string | null };

/** Deliveries as the rider last left them: each queued tap applied in order on top of what the server sent, with the
 *  number of taps still waiting so the card can say so. */
export function applyOutbox<T extends DeliveryLike>(rows: T[], items: OutboxItem[]): (T & { queued: number })[] {
  return rows.map((row) => {
    const mine = items.filter((i) => i.deliveryId === row.id);
    if (!mine.length) return { ...row, queued: 0 };
    const next = { ...row, queued: mine.length } as T & { queued: number };
    for (const i of mine) {
      next.status = i.to;
      if (i.to === "picked_up") next.picked_up_at = i.occurredAt;
      if (i.to === "delivered") next.delivered_at = i.occurredAt;
      if (i.cashCollectedMinor !== undefined) next.cash_collected_minor = i.cashCollectedMinor;
      if (i.to === "failed" && i.note) next.failed_reason = i.note;
    }
    return next;
  });
}

/** Google Maps directions to the address (opens the Maps app on a phone), by coordinates when the address has them. */
export function directionsUrl(address: { lat?: number | string | null; lng?: number | string | null } | null | undefined, line: string): string | null {
  if (address?.lat != null && address?.lng != null && address.lat !== "" && address.lng !== "") return `https://www.google.com/maps/dir/?api=1&destination=${address.lat},${address.lng}&travelmode=driving`;
  if (line.trim()) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(line.trim())}&travelmode=driving`;
  return null;
}

/** Open deliveries that were not in the previous list: a new assignment to announce. */
export function newlyAssigned(previous: Set<string> | null, rows: { id: string; status: string }[]): string[] {
  if (!previous) return [];
  return rows.filter((r) => !["delivered", "failed"].includes(r.status) && !previous.has(r.id)).map((r) => r.id);
}
