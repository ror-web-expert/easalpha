// What a manager's PIN approves at the till, in the PIN dialog's title (QA T6): the action and the changes on the cart
// that need a manager, so a Rs 250 to Rs 1 override reads as that, not only "Approve: Send to kitchen". The dialog's
// list under it names the permissions the server asked for (R6).
import { formatMoney } from "@/lib/money";
import type { CartLine } from "@/lib/pricing";

/** "Send to kitchen: Karahi Rs 250 to Rs 1, open item Special Rs 500"; the action alone when nothing on the cart needs one. */
export function approvalWhat(action: string, lines: readonly CartLine[], currency?: string): string {
  const changes: string[] = [];
  for (const l of lines) {
    if (l.status === "cancelled") continue;
    // A price the server already holds comes back as the line's own price; only a new one waits for approval.
    if (l.price_override_minor != null && l.price_override_minor !== l.unit_price_minor) changes.push(`${l.name} ${formatMoney(l.unit_price_minor, currency)} to ${formatMoney(l.price_override_minor, currency)}`);
    else if (l.open_item && !l.id) changes.push(`open item ${l.name} ${formatMoney(l.open_item.price_minor, currency)}`);
  }
  if (!changes.length) return action;
  return `${action}: ${changes.slice(0, 2).join(", ")}${changes.length > 2 ? ` and ${changes.length - 2} more` : ""}`;
}
