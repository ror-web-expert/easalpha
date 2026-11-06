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

/** Every line on this station's card is ready while the order still waits for another station. */
export function doneAtStation(station: string | null | undefined, orderStatus: string, items: { status: string }[]): boolean {
  return !!station && orderStatus !== "ready" && items.length > 0 && items.every((i) => i.status === "ready" || i.status === "served");
}
