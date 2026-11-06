"use client";
// Till actions. Each one saves locally first and talks to the server when it can; otherwise it queues a sync record.
import { api, ApiError } from "@/lib/api";
import { db, type LocalOrder, type LocalPayment } from "@/lib/db";
import { enqueue, isOnline, isQueued, noteNetworkFailure, patchQueued, probeHealth, processQueue, reachabilityUnknown, refreshCounts } from "@/lib/sync";
import { allocatedLineTotals, labelPrice, lineTotals, toLineInput, type CartLine } from "@/lib/pricing";
import { isCashCode, payableTotals, reconcilePayments, roundsCash, serverDueForPayment } from "@/lib/pos-rules";
import { deliveryChargeFields, resolveDeliveryCharge, resolveServiceCharge, serviceChargeFields, totalsWithCharges } from "@/lib/pos-charges";
import { businessDayFor } from "@/lib/business-day";
import { uuid } from "@/lib/utils";
import { useCartStore, type Cart } from "@/store/cart";
import { useCatalogStore } from "@/store/catalog";
import { useDeviceStore } from "@/store/device";
import { useSyncStore, type OpenCounts } from "@/store/sync";
import { useCustomerStore } from "@/store/customers";
import { rememberRecentCustomer, readRecentCustomers } from "@/lib/pos-customers";
import { saleTime, withRegularDiscount } from "@/lib/pos-regular";
import { publicTaxRegistration, receiptBranding } from "@/lib/receipt-format";
import type { HeaderPills, Order, OrderInput, PaymentInput, PaymentResult, Receipt, Shift, ZReport, CashMovement } from "@/lib/types";
import { OPEN_STATUSES } from "@/lib/types";

/** A network error (no answer, a timeout). Noting it keeps isOnline() false for 30 s, so the next action goes offline at once instead of waiting again. */
const isNetwork = (e: unknown) => { const net = e instanceof ApiError && e.isNetwork; if (net) noteNetworkFailure(); return net; };

/** How long a payment waits on the queue push, then on the pre-payment save, before it goes the offline way (review item 15). */
const QUEUE_WAIT_MS = 8000;
const SAVE_TIMEOUT_MS = 8000;
/** How long a save waits for a push of the same order that is in flight before it tells the cashier to press again. */
const PUSH_WAIT_MS = 8000;
const withTimeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<undefined>((resolve) => setTimeout(resolve, ms))]);

/** True once the queued record `id` is no longer being pushed (or has left the queue), false if it still is after `ms`. */
async function pushSettled(id: string, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  for (;;) {
    const row = await db.queue.get(id);
    if (!row || row.status !== "sending") return true;
    if (Date.now() >= until) return false;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** True when a queued order reached the server after the cart was loaded: its push was accepted (markSynced). */
async function reachedServer(id: string): Promise<boolean> {
  const o = await db.orders.get(id);
  return !!o && !o.local_only && o.sync_status !== "rejected";
}

/**
 * An edit of this order that has not reached the server: an update still queued, or one the server refused (Attention).
 * While there is one, the till's stored copy is its own, not the server's (orders-money#0, web-till#1).
 */
async function editPending(id: string): Promise<boolean> {
  return (await isQueued(id)) || !!(await db.attention.get(id));
}

/**
 * A queued update of an order that an online save has just overtaken: the save sent the whole order as the till shows
 * it, so the update replayed later would only put back older lines or be refused on the paid order, flagging it
 * Rejected. A completion it carries (a staff meal closed offline), or one being pushed right now, stays.
 */
async function dropSupersededUpdate(id: string) {
  const row = await db.queue.get(id);
  if (row?.type !== "order_update" || row.status !== "pending" || row.payload.complete) return;
  await db.queue.delete(id);
  await refreshCounts();
}

/** Which step of payOrder failed, for the message on the till: a save or a completion that fails is not a failed payment. */
export type PayStep = "save" | "complete" | "payment";
const failedAt = (e: unknown, step: PayStep) => { if (e && typeof e === "object") (e as { step?: PayStep }).step = step; return e; };
export const payStep = (e: unknown): PayStep => (e && typeof e === "object" ? (e as { step?: PayStep }).step ?? "payment" : "payment");

function ctx() {
  const d = useDeviceStore.getState();
  const c = useCatalogStore.getState();
  return {
    device: d.device, branch: d.branch ?? c.catalog?.branch ?? null, session: d.session, membershipId: d.session?.membership?.id ?? null,
    cashier: d.session?.user?.name ?? null, settings: c.catalog?.business.settings ?? d.business?.settings ?? {}, catalog: c.catalog,
  };
}

/**
 * The label of an order saved offline (T1-001). The counter is read and bumped in one read-write transaction:
 * IndexedDB runs those one after another, so two quick offline saves (a double tap, a second tab) never share a label.
 */
async function nextTillSerial(): Promise<string> {
  const code = ctx().device?.code ?? "T1";
  const n = await db.transaction("rw", db.kv, async () => {
    const next = (((await db.kv.get("till_serial_seq"))?.value as number | undefined) ?? 0) + 1;
    await db.kv.put({ key: "till_serial_seq", value: next });
    return next;
  });
  return `${code}-${String(n).padStart(3, "0")}`;
}

/**
 * The cart priced as the server will price it, regular customer discount included. Online the server adds that
 * discount when the order is saved (the payment screen saves first), so the till only works it out itself while it is
 * offline or the order is still waiting in the queue: otherwise a khata sale would be put on account at the full price
 * and the server would refuse it as more than the amount due.
 */
export function regularPricing(cart: Cart): Cart {
  const { settings, catalog } = ctx();
  const offline = !isOnline() || useSyncStore.getState().status === "offline";
  const saved = cart.customer ? useCustomerStore.getState().byId.get(cart.customer.id) : undefined;
  const customer = cart.customer ? { id: cart.customer.id, is_walk_in: saved?.is_walk_in ?? cart.customer.is_walk_in ?? false, last_order_at: saved?.last_order_at ?? cart.customer.last_order_at ?? null } : null;
  const categories = new Map((catalog?.products ?? []).map((p) => [p.id, p.category_id]));
  return withRegularDiscount(cart, { apply: offline || cart.local_only, customer, tiers: catalog?.regular_discount_tiers, settings, at: saleTime(cart), categoryOf: (id) => categories.get(id) });
}

export function cartToLocal(input: Cart, status: string, extra: Partial<LocalOrder> = {}): LocalOrder {
  const { settings, membershipId, cashier, branch } = ctx();
  const cart = regularPricing(input);
  const t = totalsWithCharges(cart.lines, cart, { settings, staffMeal: cart.is_staff_meal, tip_minor: extra.tip_minor ?? cart.tip_minor, rounding_minor: extra.rounding_minor ?? cart.rounding_minor, discount_minor: cart.discount_minor });
  const now = new Date().toISOString();
  return {
    id: cart.id, serial: null, till_serial: null, label: cart.label ?? "draft", status, payment_status: "unpaid", order_type: cart.order_type, table_id: cart.table_id, table_code: cart.table_code,
    guest_name: cart.guest_name || null, covers: cart.covers, customer_id: cart.customer?.id ?? null, customer_name: cart.customer?.name ?? null, customer_phone: cart.customer?.phone ?? null,
    notes: cart.notes || null, is_staff_meal: cart.is_staff_meal, staff_meal_reason: cart.staff_meal_reason || null, lines: cart.lines,
    subtotal_minor: t.subtotal_minor, discount_minor: t.discount_minor, service_charge_minor: t.service_charge_minor, tax_minor: t.tax_minor, rounding_minor: t.rounding_minor, cash_rounding_minor: t.cash_rounding_minor ?? 0, tip_minor: t.tip_minor, total_minor: t.total_minor,
    paid_minor: 0, payments: [], receipt_number: null, void_reason: null, membership_id: membershipId, cashier_name: cashier, business_day: businessDayFor(branch?.day_end_time),
    client_created_at: cart.client_created_at, created_at: now, updated_at: now, local_only: true, open: OPEN_STATUSES.includes(status as never) ? 1 : 0,
    delivery_charge_minor: t.delivery_charge_minor, address_id: cart.address_id ?? null, address_text: cart.address_text ?? null, zone_name: cart.zone_name ?? null,
    ...chargeFields(cart), tax_choice: cart.tax_choice ?? null, tax_rate_id: cart.tax_rate_id ?? null,
    // Kept so the order opens again with its discount lines (the till's own regular discount among them) and not twice.
    order_discounts: cart.discounts?.map((d) => ({ id: d.id, kind: d.kind, value: Number(d.value), amount_minor: d.amount_minor, reason: d.reason, order_item_id: d.order_item_id })),
    ...extra,
  };
}

/**
 * The till's copy of a server order. A summary row (GET /orders) has no items, discounts, charge settings, tax choice
 * or staff-meal reason: what the till already holds of those is kept, never blanked (review R2: a receipt scan stored
 * the summary row and emptied the cached lines).
 */
export function serverToLocal(o: Order, prev?: LocalOrder | null): LocalOrder {
  const full = Array.isArray(o.items);
  // T3/F3: the server names the delivery's address (an older one sends no key: the till's own stays). Its text (a
  // saved address, or what a website guest typed) comes from the full order, or stays from the till while the address
  // is the same one; the zone the till quoted stays with its address.
  const addressId = "address_id" in o ? o.address_id ?? null : prev?.address_id ?? null;
  const sameAddress = (prev?.address_id ?? null) === addressId;
  const addressText = full && "address_text" in o ? o.address_text ?? null : sameAddress ? prev?.address_text ?? null : null;
  const lines: CartLine[] = full ? o.items.map((i) => ({
    key: i.id, id: i.id, product_id: i.product_id ?? undefined, variant_id: i.variant_id, deal_id: i.deal_id ?? undefined, name: i.name, unit_price_minor: i.unit_price_minor, quantity: Number(i.quantity),
    notes: i.notes, modifiers: (i.modifiers ?? []).map((m) => ({ modifier_id: m.modifier_id ?? "", name: m.name, price_minor: m.price_minor, quantity: Number(m.quantity) })),
    open_item: i.open_item ? { name: i.name, price_minor: i.unit_price_minor } : undefined, price_override_minor: i.price_overridden ? i.unit_price_minor : null,
    tax_rate: i.tax_rate, tax_inclusive: i.tax_inclusive, station_id: i.station_id, status: i.status, sent: !!i.sent_at, label_price_minor: i.label_price_minor ?? null,
  })) : prev?.lines ?? [];
  return {
    id: o.id, serial: o.serial, till_serial: o.till_serial, label: o.label, status: o.status, payment_status: o.payment_status, order_type: o.order_type, table_id: o.table_id, table_code: o.table_code,
    guest_name: o.guest_name, covers: o.covers, customer_id: o.customer_id, customer_name: o.customer_name ?? prev?.customer_name ?? null, customer_phone: o.customer_phone ?? prev?.customer_phone ?? null, notes: o.notes,
    is_staff_meal: o.is_staff_meal, staff_meal_reason: (full ? o.staff_meal_reason : o.is_staff_meal ? prev?.staff_meal_reason : null) ?? null, lines, subtotal_minor: o.subtotal_minor, discount_minor: o.discount_minor, service_charge_minor: o.service_charge_minor,
    tax_minor: o.tax_minor, rounding_minor: o.rounding_minor, cash_rounding_minor: o.cash_rounding_minor ?? o.rounding_minor, tip_minor: o.tip_minor, total_minor: o.total_minor, paid_minor: o.paid_minor, payments: prev?.payments ?? [], payment_method_summary: o.payment_method_summary ?? prev?.payment_method_summary ?? null, receipt_number: o.receipt_number,
    void_reason: o.void_reason, membership_id: o.taken_by_membership_id, cashier_name: prev?.cashier_name ?? null, business_day: o.business_day, client_created_at: o.client_created_at ?? o.created_at,
    created_at: o.created_at, updated_at: o.updated_at, local_only: false, open: OPEN_STATUSES.includes(o.status) ? 1 : 0,
    delivery_charge_minor: o.delivery_charge_minor ?? 0, address_id: addressId,
    address_text: addressText, zone_name: addressId && sameAddress ? prev?.zone_name ?? null : null,
    service_charge_percent: (full ? o.service_charge_percent : prev?.service_charge_percent) ?? null, service_charge_fixed_minor: (full ? o.service_charge_fixed_minor : prev?.service_charge_fixed_minor) ?? 0,
    delivery_charge_percent: (full ? o.delivery_charge_percent : prev?.delivery_charge_percent) ?? 0,
    tax_choice: (full ? o.tax_choice : prev?.tax_choice) ?? null, tax_rate_id: (full ? o.tax_rate_id : prev?.tax_rate_id) ?? null,
    order_discounts: o.discounts ? o.discounts.map((d) => ({ id: d.id, kind: d.kind, value: Number(d.value), amount_minor: d.amount_minor, reason: d.reason, order_item_id: d.order_item_id })) : prev?.order_discounts,
    // The Orders cards read "? items" for every order known only from a summary row (roles QA, 6 Nov 2026).
    item_count: o.item_count ?? (full ? lines.filter((l) => l.status !== "cancelled").length : prev?.item_count) ?? null,
    reopened_at: o.reopened_at ?? null, reopen_count: o.reopen_count ?? 0,
  };
}

/**
 * The order-level discount the cart carries (loyalty, voucher, regular, promotion, percent, fixed lines). The server's
 * discount_minor also holds the product discounts, which the cart re-derives from its lines, so only the lines count here.
 */
function orderLevelDiscount(o: LocalOrder): number | undefined {
  if (!o.order_discounts) return o.discount_minor || undefined;
  const sum = o.order_discounts.reduce((s, d) => s + (d.amount_minor || 0), 0);
  return sum || undefined;
}

/**
 * The stored order's discount beyond what its own lines carry. Lines the till stored carry their product discounts
 * (discount_minor holds both); lines from the server carry none (its discount_minor is the whole discount).
 */
function orderLevelPool(o: LocalOrder): number {
  const onLines = o.lines.filter((l) => l.status !== "cancelled").reduce((s, l) => s + lineTotals(l).line_discount_minor, 0);
  return Math.max(0, o.discount_minor - onLines);
}

/**
 * True when the cart holds something the stored copy of the order does not have yet: lines, type, customer, table,
 * notes, guest, covers, the staff-meal flag, the address or a charge. When nothing changed a payment needs no save first.
 */
function unsavedChanges(cart: Cart, stored: LocalOrder | undefined): boolean {
  if (!stored) return true;
  const lines = (ls: CartLine[]) => JSON.stringify(ls.filter((l) => l.status !== "cancelled").map(toLineInput));
  const differs = (a: unknown, b: unknown) => (a ?? null) !== (b ?? null);
  return lines(cart.lines) !== lines(stored.lines) || cart.order_type !== stored.order_type || differs(cart.customer?.id, stored.customer_id)
    || differs(cart.table_id, stored.table_id) || differs(cart.notes || null, stored.notes) || differs(cart.guest_name || null, stored.guest_name) || differs(cart.covers, stored.covers)
    || !!cart.is_staff_meal !== !!stored.is_staff_meal || differs(cart.address_id, stored.address_id)
    || differs(cart.service_charge_percent, stored.service_charge_percent) || differs(cart.service_charge_fixed_minor, stored.service_charge_fixed_minor)
    || differs(cart.delivery_charge_percent, stored.delivery_charge_percent) || (cart.delivery_charge_minor ?? 0) !== (stored.delivery_charge_minor ?? 0);
}

export function localToCart(o: LocalOrder): Cart {
  return {
    id: o.id, saved: true, local_only: o.local_only, status: o.status, order_type: o.order_type as Cart["order_type"], lines: o.lines.filter((l) => l.status !== "cancelled"),
    customer: o.customer_id ? { id: o.customer_id, name: o.customer_name ?? "Customer", phone: o.customer_phone } : null, table_id: o.table_id, table_code: o.table_code,
    guest_name: o.guest_name ?? "", covers: o.covers, notes: o.notes ?? "", is_staff_meal: o.is_staff_meal, staff_meal_reason: o.staff_meal_reason ?? "", label: o.label, client_created_at: o.client_created_at,
    discount_minor: orderLevelDiscount(o), discounts: o.order_discounts, delivery_charge_minor: o.delivery_charge_minor || undefined, address_id: o.address_id ?? null,
    address_text: o.address_text ?? null, zone_name: o.zone_name ?? null,
    paid_minor: o.paid_minor || undefined, rounding_minor: (o.cash_rounding_minor ?? o.rounding_minor) || undefined, tip_minor: o.tip_minor || undefined,
    service_charge_percent: o.service_charge_percent ?? undefined, service_charge_fixed_minor: o.service_charge_fixed_minor ?? undefined, delivery_charge_percent: o.delivery_charge_percent ?? undefined,
    tax_choice: o.tax_choice ?? undefined, tax_rate_id: o.tax_rate_id ?? undefined,
    // As reopenFields reads the server's order: the till's copy opens reopened too (L3, 7 Nov 2026).
    reopened: !!o.reopened_at && OPEN_STATUSES.includes(o.status as never), reopen_count: o.reopen_count ?? 0, payment_method_summary: o.payment_method_summary ?? null,
  };
}

/**
 * SPEC Charges: the order fields for the charges in force. Service charge keys are sent only when the cashier changed
 * them (so a new order takes the server default); the delivery charge always travels, pre-filled from the synced
 * settings or the zone quote, which keeps the till's total equal to the server's.
 */
function chargeFields(cart: Cart): Pick<OrderInput, "service_charge_percent" | "service_charge_fixed_minor" | "delivery_charge_percent" | "delivery_charge_minor"> {
  const { settings } = ctx();
  const overridden = cart.service_charge_percent != null || cart.service_charge_fixed_minor != null;
  const service = overridden ? serviceChargeFields(resolveServiceCharge(cart, settings)) : {};
  const delivery = resolveDeliveryCharge(cart, settings);
  return { ...service, ...(delivery ? deliveryChargeFields(delivery) : { delivery_charge_minor: 0, delivery_charge_percent: 0 }) };
}

async function saveLocal(o: LocalOrder) {
  await db.orders.put({ ...o, updated_at: new Date().toISOString(), open: OPEN_STATUSES.includes(o.status as never) ? 1 : 0 });
  return o;
}

export async function storeServerOrder(o: Order) {
  const prev = await db.orders.get(o.id);
  return saveLocal(serverToLocal(o, prev));
}

/** The staff-meal fields for an update: always both, so a switch off reaches the server as well as a switch on. */
function staffMealFields(cart: Cart): Pick<OrderInput, "is_staff_meal" | "staff_meal_reason"> {
  return { is_staff_meal: !!cart.is_staff_meal, staff_meal_reason: cart.is_staff_meal ? cart.staff_meal_reason || null : null };
}

function orderInput(cart: Cart, place: boolean, approver_pin?: string): OrderInput {
  return {
    id: cart.id, order_type: cart.order_type, source: "till", table_id: cart.table_id, guest_name: cart.guest_name || null, covers: cart.covers, customer_id: cart.customer?.id ?? null,
    notes: cart.notes || null, client_created_at: cart.client_created_at, lines: cart.lines.map(toLineInput), place, is_staff_meal: cart.is_staff_meal || undefined,
    staff_meal_reason: cart.is_staff_meal ? cart.staff_meal_reason : undefined, approver_pin,
    address_id: cart.order_type === "delivery" ? cart.address_id ?? null : null, ...chargeFields(cart),
  };
}

/**
 * A staff meal the server has not approved, saved where no manager's PIN can be checked (offline, or into an order
 * still waiting in the queue): the sync refused it as approval.required after the till had printed it as paid (QA K8).
 * A cashier without orders.staff_meal keeps a staff meal there only when the server already holds the order as one.
 */
async function refuseUnapprovedStaffMeal(cart: Cart) {
  if (!cart.is_staff_meal || ctx().session?.permissions?.includes("orders.staff_meal")) return;
  const stored = cart.local_only ? undefined : await db.orders.get(cart.id);
  if (stored && !stored.local_only && stored.is_staff_meal) return;
  throw new ApiError("staff_meal.offline", "A staff meal needs a manager's approval, and the till can ask for it only online, once the order is on the server. Charge it normally, or mark it as a staff meal when the till is back online.", 403);
}

/** SPEC reopen flow: the server fields the cart keeps so the till knows the order must go back through payment. */
export function reopenFields(o: Order): Pick<Cart, "reopened" | "reopen_count" | "paid_minor" | "payment_method_summary"> {
  return { reopened: !!o.reopened_at && OPEN_STATUSES.includes(o.status), reopen_count: o.reopen_count ?? 0, paid_minor: o.paid_minor ?? 0, payment_method_summary: o.payment_method_summary ?? null };
}

/**
 * Save the current cart: create or update on the server when online, else keep it local and queue it.
 * `pin` is the user's own order-update PIN (SPEC REQUIRE_PIN_FOR_ORDER_UPDATE) for a reopened order; `approver_pin` is a manager's.
 */
export async function saveOrder(cart: Cart, opts: { place?: boolean; approver_pin?: string; pin?: string; timeoutMs?: number } = {}, retried = false): Promise<{ cart: Cart; local: LocalOrder; offline: boolean }> {
  const place = !!opts.place;
  const { membershipId } = ctx();
  // Already queued locally and not yet accepted: just update the queued record.
  if (cart.local_only && (await isQueued(cart.id))) {
    // A record that already carries the flag keeps it: its creator is the one the sync checks.
    if (cart.is_staff_meal && !(await db.queue.get(cart.id))?.payload.is_staff_meal) await refuseUnapprovedStaffMeal(cart);
    const local = cartToLocal(cart, place || cart.status === "placed" ? "placed" : cart.status === "held" ? "held" : "draft");
    const prev = await db.orders.get(cart.id);
    await saveLocal({ ...local, till_serial: prev?.till_serial ?? local.till_serial, label: prev?.label ?? local.label, created_at: prev?.created_at ?? local.created_at, payments: prev?.payments ?? [], paid_minor: prev?.paid_minor ?? 0 });
    if (await patchQueued(cart.id, (p) => ({ ...p, ...orderInput(cart, place), status: place || p.status === "placed" ? "placed" : "draft", place: undefined, approver_pin: undefined }))) {
      return { cart: { ...cart, saved: true, local_only: true, status: local.status }, local, offline: true };
    }
    // Refused: the record is being pushed (or has just left the queue). Reporting success here dropped the lines the
    // cart added (web-till#3): once that push is over the cart is saved again, onto the record or the server's order.
    if (retried || !(await pushSettled(cart.id, PUSH_WAIT_MS))) throw new ApiError("sync.sending", "This order is being sent to the server right now. Press again in a moment: nothing was charged and nothing is lost.", 409);
    return saveOrder({ ...cart, local_only: !(await reachedServer(cart.id)) }, opts, true);
  }
  // A queued order whose push was accepted since the cart was loaded is updated, never created again: POST /orders
  // answers an id it already has with that order unchanged, which dropped what the cart added.
  const onServer = cart.saved && (!cart.local_only || (await reachedServer(cart.id)));
  if (isOnline()) {
    try {
      let order: Order;
      if (onServer) {
        const input = orderInput(cart, place, opts.approver_pin);
        // The staff-meal flag travels on updates too, as an explicit boolean so switching it off reaches the server
        // (a saved staff meal used to spring back to Rs 0 after every save: first client report, 30 Oct 2026).
        order = await api<Order>(`/orders/${cart.id}`, { method: "PATCH", auth: "pos", body: { ...input, place: undefined, id: undefined, ...staffMealFields(cart), pin: opts.pin }, timeoutMs: opts.timeoutMs });
        await dropSupersededUpdate(cart.id);
        if (place && ["draft", "held"].includes(order.status)) order = await api<Order>(`/orders/${cart.id}/place`, { method: "POST", auth: "pos", timeoutMs: opts.timeoutMs });
      } else {
        order = await api<Order>("/orders", { method: "POST", auth: "pos", body: orderInput(cart, place, opts.approver_pin), timeoutMs: opts.timeoutMs });
      }
      const local = await storeServerOrder(order);
      return { cart: { ...localToCart(local), lines: local.lines.filter((l) => l.status !== "cancelled"), ...reopenFields(order) }, local, offline: false };
    } catch (e) {
      if (!isNetwork(e)) throw e;
    }
  }
  // Offline path
  await refuseUnapprovedStaffMeal(onServer ? { ...cart, local_only: false } : { ...cart, local_only: true });
  if (onServer) {
    // Exists on the server: queue an update; status changes wait for the connection.
    const prev = await db.orders.get(cart.id);
    const local = cartToLocal(cart, place ? "placed" : cart.status, { till_serial: prev?.till_serial ?? null, label: prev?.label ?? cart.label ?? "draft", serial: prev?.serial ?? null, created_at: prev?.created_at, payments: prev?.payments ?? [], paid_minor: prev?.paid_minor ?? 0, local_only: false,
      reopened_at: prev?.reopened_at ?? null, reopen_count: prev?.reopen_count ?? 0, payment_method_summary: prev?.payment_method_summary ?? null });
    await saveLocal(local);
    await enqueue({ type: "order_update", id: cart.id, membership_id: membershipId ?? undefined, payload: { order_type: cart.order_type, table_id: cart.table_id, guest_name: cart.guest_name || null, covers: cart.covers, customer_id: cart.customer?.id ?? null, notes: cart.notes || null, lines: cart.lines.map(toLineInput), client_seq: Date.now(), address_id: cart.order_type === "delivery" ? cart.address_id ?? null : null, ...chargeFields(cart), ...staffMealFields(cart) } });
    return { cart: { ...cart, saved: true, local_only: false, status: local.status }, local, offline: true };
  }
  const till_serial = await nextTillSerial();
  const local = cartToLocal(cart, place ? "placed" : "draft", { till_serial, label: till_serial });
  await saveLocal(local);
  await enqueue({ type: "order", id: cart.id, membership_id: membershipId ?? undefined, payload: { ...orderInput(cart, place), place: undefined, approver_pin: undefined, id: undefined, till_serial, status: place ? "placed" : "draft" } });
  return { cart: { ...cart, saved: true, local_only: true, status: local.status, label: till_serial }, local, offline: true };
}

/**
 * Thrown by payOrder when the server will ask for a different amount than the payment screen showed (a discount
 * re-checked on the server, a price changed). Nothing was paid; `cart` is the order as the server has it now, so the
 * payment screen shows the new amount due (`toMinor`, which the next press accepts) and the cashier presses Pay again.
 */
export class TotalChangedError extends Error {
  constructor(public cart: Cart, public fromMinor: number, public toMinor: number) {
    super(`The amount due changed from ${fromMinor} to ${toMinor}`);
    this.name = "TotalChangedError";
  }
}

/**
 * Take one or more payments (a part payment is allowed; the order then stays open with payment_status "partial").
 * Returns the receipt (server-built when online, local otherwise) and `cart`, the order as the till shows it next.
 * `pin` is the order-update PIN for a reopened order; `shownDue` is the amount due the payment screen showed, and
 * `seenDue` the server's figure from a TotalChangedError the cashier was already shown for this order.
 */
export async function payOrder(cart: Cart, payments: PaymentInput[], tip_minor = 0, approver_pin?: string, opts: { pin?: string; shownDue?: number; seenDue?: number | null } = {}): Promise<{ receipt: Receipt; change_minor: number; offline: boolean; local: LocalOrder; cart: Cart }> {
  const { settings, membershipId } = ctx();
  const methods = useCatalogStore.getState().paymentMethods ?? [];
  const cash = roundsCash(payments.map((p) => p.method_code), methods);
  // Ids are fixed before anything is sent: a payment the server took but answered too late (a timeout counts as
  // offline) is queued under the same id, and the server skips it instead of recording it twice.
  let pays = payments.map((p) => ({ ...p, id: p.id ?? uuid() }));
  let current = cart;
  let synced = false;
  // A staff meal has nothing to pay: the order is completed instead (the server refuses an empty payment list).
  const staffMeal = !!cart.is_staff_meal && !pays.length;
  // No payments for an order already paid in full (a reopened order whose total fell to what was paid, or whose excess
  // was refunded): it is completed too, online only, as the sync queue completes only staff meals (QA T5).
  const settled = !staffMeal && !pays.length;
  // Wi-Fi up but nothing recent from the server: one 3 s probe decides, rather than a 60 s push and a 20 s save.
  if (isOnline() && (!reachabilityUnknown() || (await probeHealth()))) {
    if (current.local_only) { await withTimeout(processQueue(), QUEUE_WAIT_MS); const o = await db.orders.get(current.id); if (o && !o.local_only) current = { ...current, local_only: false }; }
    if (!current.local_only) {
      try {
        const shownDue = opts.shownDue ?? Math.max(0, payableTotals(regularPricing(cart), { settings, tip_minor, cash }).total_minor - (cart.paid_minor ?? 0));
        const stored = await db.orders.get(current.id);
        // The cart is synced to the server first so the payment applies to the latest lines, unless the server already
        // has everything the cart holds. The stored copy says what the server has only when no edit of the order is on
        // its way there: an update queued offline (or refused, in Attention) put the till's own lines in it, and the
        // payment then met the server's old total (orders-money#0). A dispatched delivery is saved like any other
        // order, so a customer picked on the payment screen is charged (orders-money#1). A staff meal always saves,
        // placed, so /complete finds a placed order; a reopened order always saves (its PIN flow).
        const skipSave = !staffMeal && !current.reopened && current.saved && !unsavedChanges(current, stored) && !(await editPending(current.id));
        let serverCopy = stored;
        if (!skipSave) {
          const saved = await saveOrder(current, { approver_pin, pin: opts.pin, timeoutMs: SAVE_TIMEOUT_MS, place: staffMeal || undefined }).catch((e) => { throw failedAt(e, "save"); });
          current = saved.cart;
          synced = true; // saved on the server, or stored and queued when it could not be reached
          if (saved.offline) throw new ApiError("network", "Offline", 0);
          serverCopy = saved.local;
        }
        if (settled) {
          // Never close an order the server still has money due on: the screen shows that figure instead.
          const owed = serverDueForPayment(serverCopy ?? cartToLocal(current, current.status), { settings, tip_minor: 0, cash: false });
          if (owed > 0) throw new TotalChangedError({ ...current, customer: cart.customer, address_text: cart.address_text, zone_name: cart.zone_name }, 0, owed);
        }
        if (staffMeal || settled) {
          const order = await api<Order>(`/orders/${current.id}/complete`, { method: "POST", auth: "pos" }).catch((e) => { throw failedAt(e, "complete"); });
          const local = await storeServerOrder(order);
          const receipt = await api<Receipt>(`/orders/${current.id}/receipt`, { auth: "pos" }).catch(() => buildLocalReceipt(local));
          return { receipt, change_minor: 0, offline: false, local, cart: { ...localToCart(local), ...reopenFields(order), customer: cart.customer, address_text: cart.address_text, zone_name: cart.zone_name } };
        }
        // The server prices the order again on a save (a regular customer's discount, a price change). Never take
        // money against an amount the cashier did not see: a gap under Rs 1 is paisa rounding and moves the payment;
        // a bigger gap stops here once with the server's figure, and the next press pays that figure.
        const serverDue = serverDueForPayment(serverCopy ?? cartToLocal(current, current.status), { settings, tip_minor, cash });
        const toSend = reconcilePayments(pays, shownDue, serverDue, opts.seenDue);
        if (!toSend) throw new TotalChangedError({ ...current, customer: cart.customer, address_text: cart.address_text, zone_name: cart.zone_name }, shownDue, serverDue);
        pays = toSend;
        // A manager's PIN (a role without payments.take) goes with the payment it approves, not only the save before it.
        const res = await api<PaymentResult>(`/orders/${current.id}/payments`, { method: "POST", auth: "pos", body: { payments: pays, tip_minor, ...(approver_pin ? { approver_pin } : {}) } });
        const prev = await db.orders.get(current.id);
        const local = await saveLocal({ ...serverToLocal(res.order, prev), payments: [...(prev?.payments ?? []), ...res.payments.map((p) => ({ id: p.id, method_code: p.method_code, amount_minor: p.amount_minor, tendered_minor: p.tendered_minor ?? undefined, change_minor: p.change_minor, reference: p.reference ?? undefined, client_created_at: p.received_at }))] });
        const receipt = res.receipt ?? buildLocalReceipt(local);
        const next = { ...localToCart(local), ...reopenFields(res.order), customer: cart.customer, address_text: cart.address_text, zone_name: cart.zone_name };
        return { receipt, change_minor: res.change_minor, offline: false, local, cart: next };
      } catch (e) {
        if (!isNetwork(e)) throw e;
      }
    }
  }
  if (settled) throw failedAt(new ApiError("offline", "Completing a paid order needs the internet", 0), "complete");
  // Offline: order must be local (queued) or already on the server. Lines added since it was last stored (a table
  // order opened offline, say) are stored and queued first, so the payment covers them, as the online path does.
  const stored = await db.orders.get(current.id);
  // A staff meal always saves here, so a queued order (or update) exists to carry `complete` to the server.
  const saved = !staffMeal && (synced || (current.saved && !unsavedChanges(current, stored))) ? { cart: current } : await saveOrder(current, { place: !current.saved || staffMeal }).catch((e) => { throw failedAt(e, staffMeal ? "complete" : "save"); });
  current = saved.cart;
  const prev = (await db.orders.get(current.id)) ?? cartToLocal(current, "placed");
  // Priced as the server will when the queue reaches it, with the order-level discount once: the lines carry the
  // product discounts when the till stored the order, and the server's figure holds them when it came from there.
  const totals = payableTotals({ ...prev, discount_minor: orderLevelPool(prev), rounding_minor: prev.cash_rounding_minor ?? prev.rounding_minor }, { settings, tip_minor, cash });
  let due = totals.total_minor - prev.paid_minor;
  let change = 0;
  const now = new Date().toISOString();
  const newPayments: LocalPayment[] = [];
  for (const p of pays) {
    const applied = Math.min(p.amount_minor, due);
    if (applied <= 0) continue;
    // Tendered and change for any cash-kind method, as the server works them out at replay.
    const isCash = isCashCode(p.method_code, methods);
    const tendered = isCash ? Math.max(p.tendered_minor ?? 0, p.amount_minor) : undefined;
    const ch = isCash ? Math.max((tendered ?? 0) - applied, 0) : 0;
    change += ch;
    due -= applied;
    newPayments.push({ id: p.id, method_code: p.method_code, amount_minor: applied, tendered_minor: tendered, change_minor: ch, reference: p.reference, client_created_at: now });
  }
  const paid = prev.paid_minor + newPayments.reduce((s, p) => s + p.amount_minor, 0);
  const status = paid >= totals.total_minor ? "paid" : prev.status === "draft" || prev.status === "held" ? "placed" : prev.status;
  const local = await saveLocal({ ...prev, ...totals, cash_rounding_minor: totals.cash_rounding_minor ?? 0, paid_minor: paid, payments: [...prev.payments, ...newPayments], status, payment_status: paid >= totals.total_minor ? "paid" : paid > 0 ? "partial" : "unpaid", receipt_number: prev.receipt_number ?? (paid >= totals.total_minor ? `${prev.till_serial ?? prev.label}` : null) });
  // Payments ride along only with an order still queued as new; a queued order_update (same id) does not carry them.
  const merged = await patchQueued(current.id, (p) => ({ ...p, status: "placed", payments: [...((p.payments as unknown[]) ?? []), ...newPayments.map((np) => ({ id: np.id, method_code: np.method_code, amount_minor: np.amount_minor, tendered_minor: np.tendered_minor, reference: np.reference, client_created_at: np.client_created_at }))], tip_minor: ((p.tip_minor as number) ?? 0) + tip_minor, ...(staffMeal ? { complete: true } : {}) }), "order");
  if (!merged) {
    // The server has the order: a queued update carries `complete` for a staff meal, and each payment goes as its own
    // record. The tip rides on the first one only: Payments::Processor adds it per record (two splits doubled it).
    if (staffMeal) await patchQueued(current.id, (p) => ({ ...p, complete: true }), "order_update");
    for (const [i, np] of newPayments.entries()) {
      await enqueue({ type: "payment", id: np.id, membership_id: membershipId ?? undefined, payload: { order_id: current.id, method_code: np.method_code, amount_minor: np.amount_minor, tendered_minor: np.tendered_minor, reference: np.reference, client_created_at: np.client_created_at, tip_minor: i === 0 ? tip_minor : 0 } });
    }
  }
  if (local.customer_id) await noteOfflineSale(local.customer_id, newPayments, local.payment_status === "paid", now);
  // The cart keeps everything the cashier set (customer, discount lines, reopen state); only the payment moved on.
  const next: Cart = { ...current, saved: true, local_only: local.local_only, status: local.status, label: local.label, paid_minor: local.paid_minor, rounding_minor: (local.cash_rounding_minor ?? local.rounding_minor) || undefined, tip_minor: local.tip_minor || undefined };
  return { receipt: buildLocalReceipt(local), change_minor: change, offline: true, local, cart: next };
}

/**
 * A sale finished offline for a customer: the khata it added and (once paid) the last order date go on the till's
 * saved copy and the recent list, so the next search shows what they owe now and the next order gets the right tier.
 */
async function noteOfflineSale(customerId: string, payments: LocalPayment[], paid: boolean, at: string) {
  const khata = (useCatalogStore.getState().paymentMethods ?? []).filter((m) => m.kind === "khata").map((m) => m.code);
  const khata_minor = payments.filter((p) => khata.includes(p.method_code) || p.method_code === "khata").reduce((s, p) => s + p.amount_minor, 0);
  if (!khata_minor && !paid) return;
  await useCustomerStore.getState().noteSale(customerId, { khata_minor, paid, at });
  const recent = readRecentCustomers().find((r) => r.id === customerId);
  if (recent) rememberRecentCustomer({ ...recent, balance_minor: (recent.balance_minor ?? 0) + khata_minor, ...(paid ? { last_order_at: at, orders_count: (recent.orders_count ?? 0) + 1 } : {}) });
}

export async function voidOrder(id: string, reason: string, approver_pin?: string): Promise<{ offline: boolean }> {
  const { membershipId } = ctx();
  if (isOnline()) {
    const prev = await db.orders.get(id);
    if (!prev?.local_only) {
      try {
        const o = await api<Order>(`/orders/${id}/void`, { method: "POST", auth: "pos", body: { reason, approver_pin } });
        await storeServerOrder(o);
        return { offline: false };
      } catch (e) { if (!isNetwork(e)) throw e; }
    }
  }
  const prev = await db.orders.get(id);
  if (prev) await saveLocal({ ...prev, status: "voided", void_reason: reason, open: 0 });
  const merged = await patchQueued(id, (p) => ({ ...p, status: "voided", voided: true, void_reason: reason }), "order");
  if (!merged) await enqueue({ type: "void", id: uuid(), membership_id: membershipId ?? undefined, payload: { order_id: id, reason } });
  return { offline: true };
}

/**
 * `refund_id` is made once per refund dialog and sent with every try: a refund the server took but answered too late
 * (a timeout) and then pressed again is answered with the one it recorded, never booked twice (web-till#5).
 */
export async function refundOrder(id: string, amount_minor: number, method_code: string, reason: string, approver_pin?: string, refund_id: string = uuid()) {
  const res = await api<{ order: Order }>(`/orders/${id}/refunds`, { method: "POST", auth: "pos", body: { amount_minor, method_code, reason, approver_pin, refund_id } });
  const local = await storeServerOrder(res.order);
  return { ...res, local };
}

/**
 * An open order paid in full (a reopened order whose total fell to what was paid, its excess refunded) closed from the
 * Orders screen: POST /orders/:id/complete, as the payment screen does (QA T5). Online only; the server answers
 * order.overpaid while an excess is still to go back. Returns the order and its receipt.
 */
export async function completeOrder(id: string): Promise<{ local: LocalOrder; receipt: Receipt }> {
  if (!isOnline()) throw new ApiError("offline", "Completing an order needs the internet", 0);
  const order = await api<Order>(`/orders/${id}/complete`, { method: "POST", auth: "pos" });
  const local = await storeServerOrder(order);
  const receipt = await api<Receipt>(`/orders/${id}/receipt`, { auth: "pos" }).catch(() => buildLocalReceipt(local));
  return { local, receipt };
}

/**
 * The till's own copy of an order by a code its receipt carries: the receipt number, or the till serial (T1-001) that a
 * receipt printed offline has as its barcode (QA T12), from any day, newest first; null when the till has none.
 */
export async function findLocalOrder(code: string): Promise<LocalOrder | null> {
  const wanted = code.trim().toLowerCase();
  if (!wanted) return null;
  const rows = (await db.orders.toArray()).filter((o) => [o.receipt_number, o.till_serial, o.label].some((v) => (v ?? "").toLowerCase() === wanted));
  return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null;
}

export async function holdOrder(cart: Cart): Promise<Cart> {
  const saved = await saveOrder(cart);
  if (!saved.offline && isOnline()) {
    try {
      const o = await api<Order>(`/orders/${cart.id}/hold`, { method: "POST", auth: "pos" });
      const local = await storeServerOrder(o);
      return localToCart(local);
    } catch (e) { if (!isNetwork(e)) throw e; }
  }
  const prev = await db.orders.get(cart.id);
  if (prev) await saveLocal({ ...prev, status: "held" });
  return { ...saved.cart, status: "held" };
}

export async function resumeOrder(id: string): Promise<Cart> {
  const prev = await db.orders.get(id);
  if (prev && !prev.local_only && isOnline()) {
    try {
      const o = await api<Order>(`/orders/${id}/resume`, { method: "POST", auth: "pos" });
      return localToCart(await storeServerOrder(o));
    } catch (e) { if (!isNetwork(e)) throw e; }
  }
  if (!prev) throw new ApiError("not_found", "Order not found on this till", 404);
  return localToCart(prev);
}

/**
 * SPEC Tax: the cashier's No Tax / linked-rate choice. The server re-prices the order (POST /orders/:id/tax_choice),
 * so this is online only and never queued; an order not yet on the server is saved as a draft first.
 */
export async function applyTaxChoice(cart: Cart, choice: { none: true } | { tax_rate_id: string }, opts: { approver_pin?: string; pin?: string } = {}): Promise<Cart> {
  if (!isOnline()) throw new ApiError("offline", "The tax choice needs the internet", 0);
  let current = cart;
  if (!current.saved || current.local_only) {
    const saved = await saveOrder(current, opts);
    if (saved.offline) throw new ApiError("offline", "The tax choice needs the internet", 0);
    current = saved.cart;
  }
  const order = await api<Order>(`/orders/${current.id}/tax_choice`, { method: "POST", auth: "pos", body: { ...choice, pin: opts.pin, approver_pin: opts.approver_pin } });
  const local = await storeServerOrder(order);
  return { ...localToCart(local), customer: current.customer, address_text: current.address_text, zone_name: current.zone_name, lines: local.lines.filter((l) => l.status !== "cancelled"), ...reopenFields(order) };
}

/**
 * SPEC discounts: a voucher code, loyalty points or a redemption option, or removing one of them. The server decides
 * and re-prices (POST /orders/:id/discounts, /redeem_points, /redeem_option, DELETE /orders/:id/discounts/:id), so this
 * is online only and never queued. The cart is saved first so the server has the latest lines and customer (which is
 * also when a regular discount tier is applied automatically), then `fn` runs against the server order id, with the
 * cart as saved (whose lines carry the server's ids, for a line discount) and a manager's PIN when one was given: a
 * discount above the role's limit needs it on the discount request itself (QA T10).
 */
export async function applyServerDiscount(cart: Cart, fn: (orderId: string, ctx: { saved: Cart; approver_pin?: string }) => Promise<Order>, opts: { approver_pin?: string; pin?: string } = {}): Promise<Cart> {
  if (!isOnline()) throw new ApiError("offline", "Discounts need the internet", 0);
  const saved = await saveOrder(cart, opts);
  if (saved.offline) throw new ApiError("offline", "Discounts need the internet", 0);
  const current = saved.cart;
  const order = await fn(current.id, { saved: current, approver_pin: opts.approver_pin });
  const local = await storeServerOrder(order);
  return { ...localToCart(local), customer: cart.customer, address_text: cart.address_text, zone_name: cart.zone_name, lines: local.lines.filter((l) => l.status !== "cancelled"), ...reopenFields(order) };
}

/**
 * SPEC regular discounts: the server applies the best recency tier when a customer with recent orders is attached, so
 * before the payment screen opens the cart is synced once (online, with a customer) and the applied lines come back.
 * Returns null when nothing was synced (offline, no customer, or the order is already on the server unchanged).
 */
export async function syncForPayment(cart: Cart, opts: { approver_pin?: string; pin?: string } = {}): Promise<Cart | null> {
  if (!isOnline() || !cart.customer) return null;
  const saved = await saveOrder(cart, opts);
  if (saved.offline) return null;
  return { ...saved.cart, customer: cart.customer, address_text: cart.address_text, zone_name: cart.zone_name };
}

export async function loadOrderForEdit(id: string): Promise<Cart> {
  const prev = await db.orders.get(id);
  // An edit made offline and still queued is only in the till's copy: that copy opens, so the lines it added are on
  // the cart when it is paid (the save before payment then sends them) instead of vanishing behind the server's copy.
  if (isOnline() && (!prev || !prev.local_only) && !(prev && (await isQueued(id)))) {
    try {
      const o = await api<Order>(`/orders/${id}`, { auth: "pos" });
      return { ...localToCart(await storeServerOrder(o)), ...reopenFields(o) };
    } catch (e) { if (!isNetwork(e)) throw e; }
  }
  if (!prev) throw new ApiError("not_found", "Order not available offline", 404);
  return localToCart(prev);
}

/**
 * SPEC reopen flow (REOPEN_ORDER): POST /orders/:id/reopen brings a completed order back as open, keeping its payments.
 * The cart comes back in edit mode with `reopened` set so the panel hides the controls the user may not use and the
 * save goes through the payment screen. Online only: a reopen is never queued. `approver_pin` is a manager's, for a
 * cashier without REOPEN_ORDER (QA T11).
 */
export async function reopenOrder(id: string, approver_pin?: string): Promise<Cart> {
  if (!isOnline()) throw new ApiError("offline", "Reopening an order needs the internet", 0);
  const o = await api<Order>(`/orders/${id}/reopen`, { method: "POST", auth: "pos", body: approver_pin ? { approver_pin } : undefined });
  const local = await storeServerOrder(o);
  return { ...localToCart(local), ...reopenFields(o) };
}

/**
 * SPEC "Direct Unpaid Orders": place (or complete) an order without the payment screen. A new cart goes through
 * POST /orders with complete: true (PLACE_AND_COMPLETE_ORDER); an order already on the server is saved, placed if
 * needed, then POST /orders/:id/complete (COMPLETE_ORDER). The server answers 409 order.unpaid when the setting or
 * PLACE_UNPAID_DIRECT is missing, and always for a reopened order. Online only.
 */
export async function completeUnpaid(cart: Cart, approver_pin?: string): Promise<{ order: Order; local: LocalOrder }> {
  if (!isOnline()) throw new ApiError("offline", "Placing an unpaid order needs the internet", 0);
  if (cart.reopened) throw new ApiError("order.unpaid", "A reopened order must go through the payment screen", 409);
  let order: Order;
  if (cart.saved && !cart.local_only) {
    const saved = await saveOrder(cart, { place: true, approver_pin });
    if (saved.offline) throw new ApiError("offline", "Placing an unpaid order needs the internet", 0);
    order = await api<Order>(`/orders/${cart.id}/complete`, { method: "POST", auth: "pos" });
  } else {
    if (cart.local_only) { await processQueue(); const o = await db.orders.get(cart.id); if (o?.local_only) throw new ApiError("offline", "This order is still waiting to sync", 0); }
    order = await api<Order>("/orders", { method: "POST", auth: "pos", body: { ...orderInput(cart, true, approver_pin), complete: true } });
  }
  const local = await storeServerOrder(order);
  return { order, local };
}

/** Open orders on this till (not drafts), split into the current business day and earlier days, for the offline reminder. */
export async function localOpenCounts(business_day: string): Promise<OpenCounts> {
  const rows = await db.orders.where("open").equals(1).toArray();
  const live = rows.filter((o) => o.status !== "draft");
  return { today: live.filter((o) => o.business_day === business_day).length, previous: live.filter((o) => o.business_day < business_day).length };
}

/**
 * SPEC "Pending Orders" reminder: refresh the header counts from GET /me pills (every 60 s from the shell), falling
 * back to the orders cached on this till when offline or when the request fails.
 */
export async function refreshOpenCounts(): Promise<OpenCounts> {
  const { branch } = ctx();
  const day = businessDayFor(branch?.day_end_time);
  let counts: OpenCounts | null = null;
  if (isOnline()) {
    try {
      const me = await api<{ pills?: HeaderPills | null }>("/me", { auth: "pos" });
      if (me.pills) counts = { today: me.pills.open_orders_today ?? 0, previous: me.pills.open_orders_previous ?? 0 };
    } catch {}
  }
  counts ??= await localOpenCounts(day);
  useSyncStore.getState().set({ openCounts: counts });
  return counts;
}

/** Today's orders: server summaries merged over local copies (local-only orders and cached lines are kept). */
export async function refreshOrdersFromServer(business_day: string) {
  if (!isOnline()) return;
  try {
    let cursor: string | undefined;
    for (let i = 0; i < 5; i++) {
      const page = await api<{ data: Order[]; next_cursor: string | null }>("/orders", { auth: "pos", query: { business_day, limit: 200, cursor } });
      for (const o of page.data) {
        const prev = await db.orders.get(o.id);
        if (prev?.local_only) continue;
        await db.orders.put(serverToLocal(o, prev));
      }
      if (!page.next_cursor) break;
      cursor = page.next_cursor;
    }
  } catch {}
}

export async function listLocalOrders(business_day: string): Promise<LocalOrder[]> {
  const rows = await db.orders.where("business_day").equals(business_day).toArray();
  return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function pruneOldOrders(days = 7) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const old = await db.orders.where("updated_at").below(cutoff).toArray();
  for (const o of old) if (!o.local_only) await db.orders.delete(o.id);
}

// ---- Shifts ----
export async function openShift(opening_cash_minor: number): Promise<{ shift: Shift; offline: boolean }> {
  const { membershipId, branch, device } = ctx();
  const id = uuid();
  const client_created_at = new Date().toISOString();
  if (isOnline()) {
    try {
      const shift = await api<Shift>("/shifts", { method: "POST", auth: "pos", body: { id, opening_cash_minor, client_created_at } });
      useCatalogStore.getState().setShift(shift);
      return { shift, offline: false };
    } catch (e) { if (!isNetwork(e)) throw e; }
  }
  const shift: Shift = { id, branch_id: branch?.id ?? "", device_id: device?.id ?? null, cashier_membership_id: membershipId ?? "", drawer_account_id: null, business_day: businessDayFor(branch?.day_end_time), status: "open", settlement_status: "pending", opened_at: client_created_at, closed_at: null, opening_cash_minor, counted_cash_minor: null, approved_by_membership_id: null, close_note: null, movements: [] };
  useCatalogStore.getState().setShift(shift);
  await enqueue({ type: "shift_open", id, membership_id: membershipId ?? undefined, payload: { opening_cash_minor, client_created_at } });
  return { shift, offline: true };
}

export async function loadCurrentShift() {
  if (!isOnline()) return useCatalogStore.getState().shift;
  try {
    const r = await api<{ shift: Shift | null }>("/shifts/current", { auth: "pos" });
    const local = useCatalogStore.getState().shift;
    if (r.shift || !local || (await isQueued(local.id)) === false) useCatalogStore.getState().setShift(r.shift);
    return r.shift ?? useCatalogStore.getState().shift;
  } catch { return useCatalogStore.getState().shift; }
}

/** extra: what a payout carries (the expense category and who was paid), online and in the queued record alike. */
export async function cashMovement(shift: Shift, kind: string, amount_minor: number, reason: string, approver_pin?: string, extra: { category_id?: string; paid_to?: string } = {}): Promise<{ offline: boolean }> {
  const { membershipId } = ctx();
  const id = uuid();
  if (isOnline()) {
    try {
      const r = await api<{ movement: CashMovement; shift: Shift }>(`/shifts/${shift.id}/cash_movements`, { method: "POST", auth: "pos", body: { kind, amount_minor, reason, approver_pin, movement_id: id, ...extra } });
      useCatalogStore.getState().setShift(r.shift);
      return { offline: false };
    } catch (e) { if (!isNetwork(e)) throw e; }
  }
  const signed = kind === "cash_in" ? amount_minor : -amount_minor;
  useCatalogStore.getState().setShift({ ...shift, movements: [...shift.movements, { id, shift_id: shift.id, kind, amount_minor: signed, reason, reference: null, by_membership_id: membershipId, approved_by_membership_id: null, occurred_at: new Date().toISOString() }] });
  await enqueue({ type: "cash_movement", id, membership_id: membershipId ?? undefined, payload: { shift_id: shift.id, kind, amount_minor, reason, ...extra } });
  return { offline: true };
}

export async function closeShift(shift: Shift, counted_cash_minor: number, count_detail: Record<string, number>, note: string, approver_pin?: string): Promise<{ shift: Shift; z: ZReport | null; offline: boolean }> {
  const { membershipId } = ctx();
  if (isOnline()) {
    try {
      const closed = await api<Shift>(`/shifts/${shift.id}/close`, { method: "POST", auth: "pos", body: { counted_cash_minor, count_detail, note, approver_pin } });
      const z = await api<ZReport>(`/shifts/${shift.id}/z_report`, { auth: "pos" }).catch(() => null);
      useCatalogStore.getState().setShift(null);
      return { shift: closed, z, offline: false };
    } catch (e) { if (!isNetwork(e)) throw e; }
  }
  // A record id of its own: under the shift's id it replaced the queued shift_open of a shift opened offline too (the
  // queue keeps one record per id), and the server never heard of the shift. The server finds it by shift_id.
  await enqueue({ type: "shift_close", id: uuid(), membership_id: membershipId ?? undefined, payload: { shift_id: shift.id, counted_cash_minor, count_detail, note } });
  useCatalogStore.getState().setShift(null);
  return { shift: { ...shift, status: "closed", closed_at: new Date().toISOString(), counted_cash_minor }, z: null, offline: true };
}

// ---- Receipt ----
/** The unit a weighed line is sold in ("kg"), as the server snapshots it on the item; null for everything else. */
function weightUnit(catalog: ReturnType<typeof ctx>["catalog"], l: CartLine): string | null {
  const p = l.product_id && !l.open_item && !l.deal_id ? catalog?.products.find((x) => x.id === l.product_id) : null;
  return p?.sold_by_weight ? p.weight_unit || null : null;
}

export function buildLocalReceipt(o: LocalOrder, duplicate = false): Receipt {
  const { catalog, settings, branch } = ctx();
  const biz = catalog?.business ?? useDeviceStore.getState().business;
  // The catalog sync's business block carries logo_key (API catalog_controller); the pairing payload is the fallback for older caches.
  const catalogLogo = catalog?.business.logo_key;
  const receipt = receiptBranding(settings); // the pos.receipt.* settings the Branding page saves, as the server receipt (S6)
  const active = o.lines.filter((l) => l.status !== "cancelled");
  const taxGroups = new Map<string, { rate: number; inclusive: boolean; taxable_minor: number; tax_minor: number }>();
  // The base is what each line is taxed on: after its product discount and its share of the order's discount, as
  // Receipts::Builder states it. It said "Tax 16% on" the figure before any discount (QA T13).
  const allocated = allocatedLineTotals(active, orderLevelPool(o));
  active.forEach((l, i) => {
    const t = allocated[i];
    const k = `${l.tax_rate}-${l.tax_inclusive}`;
    const g = taxGroups.get(k) ?? { rate: l.tax_rate, inclusive: l.tax_inclusive, taxable_minor: 0, tax_minor: 0 };
    g.taxable_minor += t.line_subtotal_minor - t.line_discount_minor; g.tax_minor += t.line_tax_minor;
    taxGroups.set(k, g);
  });
  // An account sale says what the customer owes now, as the server's receipt does (QA K11): the till's saved balance,
  // which an offline sale has just added to. Left out when the till has no balance for the customer.
  const khataCodes = new Set((useCatalogStore.getState().paymentMethods ?? []).filter((m) => m.kind === "khata").map((m) => m.code).concat("khata"));
  const onAccount = !!o.customer_id && o.payments.some((p) => khataCodes.has(p.method_code));
  const balance = onAccount ? useCustomerStore.getState().byId.get(o.customer_id!)?.balance_minor ?? readRecentCustomers().find((c) => c.id === o.customer_id)?.balance_minor : undefined;
  return {
    receipt_number: o.receipt_number, duplicate, printed_at: new Date().toISOString(),
    business: { name: biz?.name ?? "", legal_name: null, phone: useDeviceStore.getState().business?.phone ?? null, email: null, logo_key: catalogLogo ?? useDeviceStore.getState().business?.logo_key ?? null, currency: biz?.currency ?? "PKR" },
    branch: { name: branch?.name ?? "", address: branch?.address ?? null, city: branch?.city ?? null, phone: branch?.phone ?? null, tax_registration: publicTaxRegistration(branch?.tax_registration) },
    header: receipt.header ?? null, footer: receipt.footer ?? null, language: receipt.language ?? "en", paper: receipt.paper ?? "80",
    order: { id: o.id, serial: o.serial, label: o.label, order_type: o.order_type as Receipt["order"]["order_type"], table: o.table_code, business_day: o.business_day, placed_at: o.created_at, paid_at: o.updated_at, cashier: o.cashier_name, till: useDeviceStore.getState().device?.name ?? null, is_staff_meal: o.is_staff_meal, staff_meal_reason: o.staff_meal_reason, customer: o.customer_id ? { name: o.customer_name ?? "", phone: o.customer_phone, khata_no: null } : null, guest_name: o.guest_name, notes: o.notes },
    // A weighed line prints its weight with the unit, and a scale label says it set the amount (as Receipts::Builder).
    lines: active.map((l) => { const t = lineTotals(l); return { name: l.name, quantity: String(l.quantity), unit: weightUnit(catalog, l), unit_price_minor: l.price_override_minor ?? l.unit_price_minor, label_price_minor: labelPrice(l), modifiers: l.modifiers.map((m) => ({ name: m.name, price_minor: m.price_minor })), line_subtotal_minor: t.line_subtotal_minor, line_total_minor: t.line_total_minor, discount_minor: t.line_discount_minor, notes: l.notes ?? null }; }),
    totals: { subtotal_minor: o.subtotal_minor, discount_minor: o.discount_minor, service_charge_minor: o.service_charge_minor, tax_minor: o.tax_minor, tax_lines: [...taxGroups.values()].filter((g) => g.rate), delivery_charge_minor: o.delivery_charge_minor ?? 0, rounding_minor: o.rounding_minor, tip_minor: o.tip_minor, total_minor: o.total_minor, paid_minor: o.paid_minor, due_minor: Math.max(0, o.total_minor - o.paid_minor) },
    payments: o.payments.map((p) => ({ method: p.method_code, amount_minor: p.amount_minor, tendered_minor: p.tendered_minor ?? null, change_minor: p.change_minor ?? 0, reference: p.reference ?? null })),
    refunds: [], khata: balance == null ? null : { balance_minor: balance },
    tax_invoice: { number: null, qr: null, status: branch?.tax_registration?.authority && branch.tax_registration.authority !== "none" ? "pending" : "not_registered" },
    feedback_whatsapp: useDeviceStore.getState().business?.phone ?? null,
  };
}

export async function fetchReceipt(orderId: string, reprint: boolean): Promise<Receipt> {
  const local = await db.orders.get(orderId);
  if (isOnline() && (!local || !local.local_only)) {
    try {
      return reprint ? await api<Receipt>(`/orders/${orderId}/receipt/reprint`, { method: "POST", auth: "pos" }) : await api<Receipt>(`/orders/${orderId}/receipt`, { auth: "pos" });
    } catch (e) { if (!isNetwork(e)) throw e; }
  }
  if (!local) throw new ApiError("not_found", "Receipt not available offline", 404);
  return buildLocalReceipt(local, reprint);
}

export function resetCartAfter(cart: Cart) {
  useCartStore.getState().reset(cart.order_type);
}
