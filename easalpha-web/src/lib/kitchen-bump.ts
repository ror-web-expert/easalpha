// The kitchen display's "Bump order" (F10, final round of 6 Nov 2026). On one station's screen it bumps that station's
// lines (POST /kitchen/orders/:id/bump with the station); the order goes ready once every station's lines are.
import { formatQty } from "@/lib/money";

/** "2 Chai, 1 Zinger Burger" for a changed or cancelled ticket, or a rider's card: quantities as 2, not 2.0 (F13). */
export function linesText(lines: { quantity?: string | number | null; name?: string | null }[], sep = " "): string {
  return lines.map((l) => `${formatQty(l.quantity ?? 1)}${sep}${l.name ?? ""}`.trim()).join(", ");
}

/** The request for a card's Bump order: with the station when the screen shows one station. */
export function bumpRequest(orderId: string, station: string | null | undefined): { path: string; body?: { station_id: string } } {
  return { path: `/kitchen/orders/${orderId}/bump`, ...(station ? { body: { station_id: station } } : {}) };
}

/** A line's own bump: with the station too, so a deal made at several stations has only this station's parts ready. */
export function bumpItemRequest(itemId: string, station: string | null | undefined): { path: string; body?: { station_id: string } } {
  return { path: `/kitchen/items/${itemId}/bump`, ...(station ? { body: { station_id: station } } : {}) };
}

/** A line as the kitchen display reads it; deal_components are a deal's parts, each with its station. */
export interface KitchenLine { status: string; quantity?: string | number | null; station_id?: string | null; deal_id?: string | null; deal_components?: Record<string, unknown>[] | null }

/** One part of a deal line: how many to make for the whole line, at which station, and whether it is ready. */
export interface DealPart { name: string; quantity: number; station_id: string | null; ready: boolean }

const lineReady = (i: KitchenLine) => i.status === "ready" || i.status === "served";
const partsOf = (i: KitchenLine) => (i.deal_id && Array.isArray(i.deal_components) ? i.deal_components : []);

/**
 * A deal line's parts (L3, 7 Nov 2026: the card showed a deal as one line): on one station's screen only those that
 * station makes, on the all-stations screen every part. A part counts its deal's quantity (2 burgers a box, 3 boxes:
 * 6), and is ready once its station bumped it (bumped_at) or the whole line is ready.
 */
export function dealParts(item: KitchenLine, station: string | null | undefined): DealPart[] {
  const parts = partsOf(item).map((c) => ({
    name: String(c.name ?? ""), quantity: Number(c.quantity ?? 1) * Number(item.quantity ?? 1),
    station_id: typeof c.station_id === "string" ? c.station_id : null, ready: lineReady(item) || !!c.bumped_at,
  }));
  return station ? parts.filter((p) => p.station_id === station) : parts;
}

/** A deal whose parts are made at more than one station: each station bumps its own parts (Orders::Transitions.split_deal?). */
export function isSplitDeal(item: KitchenLine): boolean {
  return new Set(partsOf(item).map((c) => c.station_id).filter((s): s is string => typeof s === "string")).size > 1;
}

/** True when the line has nothing left to make here: on one station's screen, a split deal once that station's parts are ready. */
export function doneHere(item: KitchenLine, station: string | null | undefined): boolean {
  if (station && isSplitDeal(item)) {
    const mine = dealParts(item, station);
    if (mine.length) return mine.every((p) => p.ready);
  }
  return lineReady(item);
}

/**
 * Every line this station makes is ready while the order still waits for another station. A deal made at several
 * stations counts with this station's parts only (each station bumps its own); any other line counts at its station.
 */
export function doneAtStation(station: string | null | undefined, orderStatus: string, items: KitchenLine[]): boolean {
  if (!station || orderStatus === "ready") return false;
  const work = items.flatMap((i) => (isSplitDeal(i) ? dealParts(i, station).map((p) => p.ready) : i.station_id === station ? [lineReady(i)] : []));
  return work.length > 0 && work.every(Boolean);
}
