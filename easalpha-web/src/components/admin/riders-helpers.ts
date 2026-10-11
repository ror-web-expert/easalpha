// Pure helpers for the Riders screens (Manage, Vault, Reports), the rider app and the Cashier Till report.
// SPEC Riders: permanent riders carry contact details, vehicle, a per-delivery charge and assigned-versus-completed
// counts; temporary riders are throwaway records with a lifetime (one order, N orders, the rest of today or N hours),
// each with its own permissions. SPEC Cashier Till: orders taken and money collected do not reconcile.
import type { CashierTillRow, DeliveryStatus, Rider, RiderLifetimeKind } from "@/lib/types";

export const TEMPORARY_RIDER_SENTENCE = "Temporary riders are throwaway records with a lifetime - one order, N orders, the rest of today, or N hours - each with its own permissions.";

// ---- Lifetime ----
export const LIFETIME_KINDS: { value: RiderLifetimeKind; label: string; needsValue: boolean; unit?: string }[] = [
  { value: "one_order", label: "One order", needsValue: false },
  { value: "n_orders", label: "N orders", needsValue: true, unit: "orders" },
  { value: "rest_of_today", label: "Rest of today", needsValue: false },
  { value: "n_hours", label: "N hours", needsValue: true, unit: "hours" },
];

export function lifetimeNeedsValue(kind: RiderLifetimeKind | string | null | undefined) {
  return kind === "n_orders" || kind === "n_hours";
}

/** The lifetime as the admin reads it: "One order", "3 orders", "Rest of today", "4 hours". */
export function lifetimeLabel(kind: RiderLifetimeKind | string | null | undefined, value?: number | null): string {
  switch (kind) {
    case "one_order": return "One order";
    case "n_orders": return `${Math.max(value ?? 1, 1)} orders`;
    case "rest_of_today": return "Rest of today";
    case "n_hours": return `${Math.max(value ?? 1, 1)} hours`;
    default: return "-";
  }
}

/** Mirrors Rider#expired? on the API so the list shows Expired before the next refresh. */
export function riderExpired(r: Pick<Rider, "temporary" | "expires_at" | "orders_allowed" | "orders_used" | "expired">, now: Date = new Date()): boolean {
  if (!r.temporary) return false;
  if (r.expired) return true;
  if (r.expires_at && new Date(r.expires_at).getTime() <= now.getTime()) return true;
  if (r.orders_allowed != null && (r.orders_used ?? 0) >= r.orders_allowed) return true;
  return false;
}

/** What is left of a temporary rider: "1 / 3 orders used", "Expires 18:00", or "Expired". */
export function lifetimeRemaining(r: Pick<Rider, "temporary" | "expires_at" | "orders_allowed" | "orders_used" | "expired">, now: Date = new Date()): string {
  if (!r.temporary) return "-";
  if (riderExpired(r, now)) return "Expired";
  if (r.orders_allowed != null) return `${r.orders_used ?? 0} / ${r.orders_allowed} orders used`;
  if (r.expires_at) {
    const d = new Date(r.expires_at);
    const sameDay = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });
    return sameDay ? `Expires ${time}` : `Expires ${d.toLocaleDateString("en-PK", { day: "numeric", month: "short" })} ${time}`;
  }
  return "Open";
}

/** "12 / 10" assigned versus completed, the SPEC's counter on the permanent list. */
export function assignedVsCompleted(r: Pick<Rider, "assigned_count" | "completed_count">): string {
  return `${r.assigned_count ?? 0} / ${r.completed_count ?? 0}`;
}

// ---- Permissions (SPEC Riders (9)) ----
export const RIDER_PERMS = {
  view: ["RIDERS", "RIDER_VIEW", "DUMMY_RIDER_VIEW", "riders.manage"],
  permanent: { create: ["RIDER_CREATE"], edit: ["RIDER_EDIT"], delete: ["RIDER_DELETE"] },
  temporary: { create: ["DUMMY_RIDER_CREATE"], edit: ["DUMMY_RIDER_EDIT"], delete: ["DUMMY_RIDER_DELETE"] },
  vault: ["cash.in_out", "shifts.any", "staff.manage"],
  dayEnd: ["shifts.any"],
  myTill: ["MY_TILL", "shifts.own", "shifts.any"],
} as const;

/** The permission codes that gate Edit and Deactivate for one rider: DUMMY_* for temporary riders, RIDER_* otherwise. */
export function riderActionPerms(r: Pick<Rider, "temporary">): { edit: readonly string[]; delete: readonly string[] } {
  const set = r.temporary ? RIDER_PERMS.temporary : RIDER_PERMS.permanent;
  return { edit: set.edit, delete: set.delete };
}

/** The permissions a temporary rider may be given in the rider app. */
export const TEMPORARY_RIDER_PERMISSIONS: { code: string; label: string; hint: string }[] = [
  { code: "collect_cash", label: "Collect cash", hint: "May take payment for cash-on-delivery orders" },
  { code: "see_phone", label: "See customer phone", hint: "The phone number shows on the delivery card" },
  { code: "mark_failed", label: "Mark failed", hint: "May mark a delivery as failed with a reason" },
];

// ---- Rider app: next steps ----
export interface RiderStep { to: DeliveryStatus; label: string; tone: "primary" | "secondary" | "destructive"; asksCash?: boolean; asksReason?: boolean }

/**
 * The buttons a rider sees for one delivery. Follows Deliveries::Manager's transitions minus the dispatcher-only ones
 * (assign, unassign). Temporary riders without mark_failed do not get Failed.
 */
export function riderNextSteps(status: DeliveryStatus | string, opts: { canFail?: boolean; cashOrder?: boolean } = {}): RiderStep[] {
  const canFail = opts.canFail ?? true;
  const delivered: RiderStep = { to: "delivered", label: "Delivered", tone: "primary", asksCash: !!opts.cashOrder };
  const failed: RiderStep = { to: "failed", label: "Failed", tone: "destructive", asksReason: true };
  let steps: RiderStep[];
  switch (status) {
    case "assigned": steps = [{ to: "picked_up", label: "Picked up", tone: "primary" }, failed]; break;
    case "picked_up": steps = [{ to: "on_the_way", label: "On the way", tone: "primary" }, { to: "arrived", label: "Arrived", tone: "secondary" }, delivered, failed]; break;
    case "on_the_way": steps = [{ to: "arrived", label: "Arrived", tone: "primary" }, delivered, failed]; break;
    case "arrived": steps = [delivered, failed]; break;
    default: steps = [];
  }
  return canFail ? steps : steps.filter((s) => s.to !== "failed");
}

/** A delivery still needs cash from the customer when the order is not already paid. */
export function isCashOrder(d: { payment_status: string | null | undefined; cash_collected_minor?: number | null }): boolean {
  return d.payment_status !== "paid" && d.payment_status !== "refunded";
}

export const RIDER_OPEN_STATUSES: DeliveryStatus[] = ["assigned", "picked_up", "on_the_way", "arrived"];

/** Deliveries grouped by status in the order the rider works them. */
export function groupDeliveries<T extends { status: DeliveryStatus | string }>(rows: T[]): { status: DeliveryStatus; rows: T[] }[] {
  const order: DeliveryStatus[] = ["arrived", "on_the_way", "picked_up", "assigned", "delivered", "failed"];
  return order.map((status) => ({ status, rows: rows.filter((r) => r.status === status) })).filter((g) => g.rows.length);
}

/** One address line for the rider card from the API's address object. */
export function addressLine(a: { line1?: string | null; line2?: string | null; area?: string | null; city?: string | null; text?: string | null } | null | undefined): string {
  if (!a) return "";
  if (a.text) return a.text;
  return [a.line1, a.line2, a.area, a.city].filter(Boolean).join(", ");
}

// ---- Cashier Till ----
/** "2 settled · 1 unsettled · 1 open" with zero parts dropped; "none" when there were no shifts. */
export function tillShiftsText(r: Pick<CashierTillRow, "shifts_settled" | "shifts_unsettled" | "shifts_open">): string {
  const parts = [[r.shifts_settled, "settled"], [r.shifts_unsettled, "unsettled"], [r.shifts_open, "open"]] as const;
  const text = parts.filter(([n]) => n > 0).map(([n, w]) => `${n} ${w}`).join(" · ");
  return text || "none";
}

/** Payment methods as chips, largest first, dropping zeros. */
export function methodChips(byMethod: Record<string, number> | null | undefined): { code: string; label: string; minor: number }[] {
  return Object.entries(byMethod ?? {})
    .filter(([, v]) => v !== 0)
    .sort((a, b) => b[1] - a[1])
    .map(([code, minor]) => ({ code, label: code.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), minor }));
}

/** A till row needs attention when it still holds cash or has closed shifts nobody settled. */
export function tillNeedsSettlement(r: Pick<CashierTillRow, "in_tills_now_minor" | "shifts_unsettled">): boolean {
  return r.in_tills_now_minor > 0 || r.shifts_unsettled > 0;
}

/** POST /day_end_settlements answers 409 day_end.open_shifts while a till is open; the screen then offers Force. */
export const DAY_END_OPEN_SHIFTS = "day_end.open_shifts";
export function dayEndNeedsForce(code: string | null | undefined): boolean {
  return code === DAY_END_OPEN_SHIFTS;
}
