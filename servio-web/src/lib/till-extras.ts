"use client";
// Till-side helpers for QR orders, deliveries, loyalty, checklists, petty cash and reservations. All calls use the PIN session token.
import { api } from "@/lib/api";
import { uuid } from "@/lib/utils";
import type { BadgeVariant } from "@/components/ui";
import type { Delivery, DeliveryStatus, Expense, ExpenseCategory, ID, Order, Page, QrOrder, Rider, TableRequest, ZoneQuote } from "@/lib/types";

// ---- Types not yet in lib/types.ts ----
export interface ChecklistRunItem { key: string; label: string; done: boolean; by_membership_id?: ID | null; at?: string | null }
export interface ChecklistRun { id: ID; kind: "opening" | "closing"; business_day: string; shift_id: ID | null; items: ChecklistRunItem[]; done_count: number; total_count: number; completed_at: string | null; completed_by_membership_id: ID | null }
export interface ChecklistTemplate { id: ID | null; kind: "opening" | "closing"; branch_id: ID | null; items: { key: string; label: string }[]; required_for_shift: boolean }
export interface LoyaltySettings { loyalty_enabled: boolean | string; loyalty_rupees_per_point: number | string; loyalty_point_value_minor: number | string; loyalty_min_redeem_points: number | string; loyalty_max_redeem_percent: number | string; birthday_discount_percent: number | string; birthday_offer_days: number | string }
export interface CustomerLoyalty { customer_id: ID; points: number; value_minor: number; transactions: { id: ID; kind: string; points: number; balance_after: number; order_id: ID | null; note: string | null; occurred_at: string }[] }
export type ReservationStatus = "booked" | "confirmed" | "seated" | "no_show" | "cancelled" | "completed" | string;
export interface Reservation {
  id: ID; branch_id: ID; table_id: ID | null; table_code: string | null; customer_id: ID | null; guest_name: string | null; phone: string | null; party_size: number | null; starts_at: string; ends_at: string;
  deposit_minor: number; deposit_payment_id: ID | null; status: ReservationStatus; notes: string | null; reminder_sent_at: string | null; seated_at: string | null; order_id: ID | null; created_at: string;
}

export const loyaltyEnabled = (s: LoyaltySettings | null | undefined) => !!s && (s.loyalty_enabled === true || s.loyalty_enabled === "true");

// ---- Delivery statuses (mirrors Deliveries::Manager on the API and components/admin/delivery.tsx) ----
export const DELIVERY_LABELS: Record<DeliveryStatus, string> = { unassigned: "Unassigned", assigned: "Assigned", picked_up: "Picked up", on_the_way: "On the way", arrived: "Arrived", delivered: "Delivered", failed: "Failed" };
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

// ---- QR orders ----
export const listPendingQrOrders = () => api<Page<QrOrder>>("/qr_orders", { auth: "pos", query: { status: "pending", limit: 100 } }).then((p) => p.data);
export const listOpenRequests = () => api<{ data: TableRequest[] }>("/qr_orders/requests", { auth: "pos", query: { open: true } }).then((r) => r.data);
export const acceptQrOrder = (id: ID) => api<Order>(`/qr_orders/${id}/accept`, { method: "POST", auth: "pos" });
export const rejectQrOrder = (id: ID, reason: string) => api<Order>(`/qr_orders/${id}/reject`, { method: "POST", auth: "pos", body: { reason } });
export const handleRequest = (id: ID) => api<{ id: ID; handled_at: string }>(`/qr_orders/requests/${id}/handle`, { method: "POST", auth: "pos" });

// ---- Deliveries ----
export const listDeliveries = (open: boolean) => api<Page<Delivery>>("/deliveries", { auth: "pos", query: { open: open ? true : undefined, limit: 200 } }).then((p) => p.data);
export const listRiders = () => api<{ data: Rider[] }>("/riders", { auth: "pos" }).then((r) => r.data);
export const assignRider = (deliveryId: ID, rider_id: ID) => api<Delivery>(`/deliveries/${deliveryId}/assign`, { method: "POST", auth: "pos", body: { rider_id } });
export const unassignRider = (deliveryId: ID) => api<Delivery>(`/deliveries/${deliveryId}/unassign`, { method: "POST", auth: "pos" });
export const moveDelivery = (deliveryId: ID, status: DeliveryStatus, extra: { note?: string; cash_collected_minor?: number } = {}) => api<Delivery>(`/deliveries/${deliveryId}/status`, { method: "POST", auth: "pos", body: { status, ...extra } });
export const recordDeliveryCash = (deliveryId: ID, cash_collected_minor: number) => api<Delivery>(`/deliveries/${deliveryId}/cash`, { method: "POST", auth: "pos", body: { cash_collected_minor } });
export const quoteDelivery = (text: string) => api<ZoneQuote>("/delivery_zones/quote", { auth: "pos", query: { text } });

// ---- Loyalty ----
export const getLoyaltySettings = () => api<LoyaltySettings>("/loyalty/settings", { auth: "pos" });
export const getCustomerLoyalty = (customerId: ID) => api<CustomerLoyalty>(`/customers/${customerId}/loyalty`, { auth: "pos" });
export const redeemPointsOnOrder = (orderId: ID, points: number) => api<Order>(`/orders/${orderId}/redeem_points`, { method: "POST", auth: "pos", body: { points } });

// ---- Checklists ----
export const getChecklistToday = (kind: "opening" | "closing") => api<ChecklistRun>("/checklists/today", { auth: "pos", query: { kind } });
export const getChecklistTemplates = () => api<{ data: ChecklistTemplate[] }>("/checklists/templates", { auth: "pos" }).then((r) => r.data);
export const tickChecklist = (runId: ID, key: string, done: boolean) => api<ChecklistRun>(`/checklists/runs/${runId}/tick`, { method: "POST", auth: "pos", body: { key, done } });
export const completeChecklist = (runId: ID) => api<ChecklistRun>(`/checklists/runs/${runId}/complete`, { method: "POST", auth: "pos" });

// ---- Petty cash ----
export const listExpenseCategories = () => api<{ data: ExpenseCategory[] }>("/expenses/categories", { auth: "pos" }).then((r) => r.data);
export const listTillExpensesToday = (day: string) => api<Page<Expense>>("/expenses", { auth: "pos", query: { source: "till", from: day, to: day, limit: 100 } }).then((p) => p.data);
export interface ExpenseDraft { client_id: string; category_id: string; amount_minor: number; paid_to: string; note: string; method_code?: string }
export const newExpenseDraft = (): ExpenseDraft => ({ client_id: uuid(), category_id: "", amount_minor: 0, paid_to: "", note: "", method_code: "cash" });
export const createExpense = (d: ExpenseDraft, approver_pin?: string) => api<Expense>("/expenses", { method: "POST", auth: "pos", body: { client_id: d.client_id, category_id: d.category_id, amount_minor: d.amount_minor, paid_to: d.paid_to || undefined, note: d.note || undefined, method_code: d.method_code || undefined, approver_pin } });

// ---- Reservations ----
export const listReservationsOn = (date: string) => api<Page<Reservation>>("/reservations", { auth: "pos", query: { date, limit: 100 } }).then((p) => p.data);
export const seatReservation = (id: ID, table_id?: ID | null) => api<Reservation>(`/reservations/${id}/seat`, { method: "POST", auth: "pos", body: { table_id: table_id ?? undefined } });

/** Local calendar date as YYYY-MM-DD (the API parses it in the branch time zone). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
