"use client";
import type { BadgeVariant } from "@/components/ui";
import type { DeliveryStatus, ExpenseCategory, Rider, RiderMovementKind } from "@/lib/types";
import { useList } from "@/components/admin/crud";

// ---- Delivery statuses ----
export const DELIVERY_STATUSES: DeliveryStatus[] = ["unassigned", "assigned", "picked_up", "on_the_way", "arrived", "delivered", "failed"];
export const DELIVERY_LABELS: Record<DeliveryStatus, string> = { unassigned: "Unassigned", assigned: "Assigned", picked_up: "Picked up", on_the_way: "On the way", arrived: "Arrived", delivered: "Delivered", failed: "Failed" };

/** Allowed next statuses (mirrors Deliveries::Manager on the API). */
export const NEXT_STATUSES: Record<DeliveryStatus, DeliveryStatus[]> = {
  unassigned: ["assigned"],
  assigned: ["picked_up", "on_the_way", "failed", "unassigned"],
  picked_up: ["on_the_way", "arrived", "delivered", "failed"],
  on_the_way: ["arrived", "delivered", "failed"],
  arrived: ["delivered", "failed"],
  delivered: [],
  failed: ["assigned", "unassigned"],
};

export function deliveryStatusVariant(s: DeliveryStatus | string | null | undefined): BadgeVariant {
  switch (s) {
    case "unassigned": return "warning";
    case "assigned": return "info";
    case "picked_up": case "on_the_way": return "primary";
    case "arrived": return "accent";
    case "delivered": return "success";
    case "failed": return "danger";
    default: return "neutral";
  }
}

export function riderStatusVariant(s: string | null | undefined): BadgeVariant {
  switch (s) {
    case "available": return "success";
    case "busy": return "info";
    case "offline": return "neutral";
    default: return "neutral";
  }
}

export const MOVEMENT_LABELS: Record<RiderMovementKind, string> = { issue: "Issued", return: "Returned", spend: "Spent", adjust: "Adjusted", settle: "Settled" };
export function movementVariant(k: RiderMovementKind | string): BadgeVariant {
  switch (k) {
    case "issue": return "info";
    case "return": return "success";
    case "spend": return "danger";
    case "adjust": return "warning";
    case "settle": return "primary";
    default: return "neutral";
  }
}

// ---- Lookups ----
export function useRiders(query: Record<string, string | undefined> = {}) { return useList<Rider>("riders", "/riders", query); }
export function useExpenseCategories() { return useList<ExpenseCategory>("expense_categories", "/expenses/categories"); }

/** Grouped <option>s for a category select: parents as optgroups, leaf parents selectable too. */
export function CategoryOptions({ categories }: { categories: ExpenseCategory[] | undefined }) {
  return (
    <>
      {categories?.map((c) => c.children?.length ? (
        <optgroup key={c.id} label={c.name}>
          <option value={c.id}>{c.name} (general)</option>
          {c.children.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </optgroup>
      ) : <option key={c.id} value={c.id}>{c.name}</option>)}
    </>
  );
}
