"use client";
// Till actions. Each one saves locally first and talks to the server when it can; otherwise it queues a sync record.
import { api, ApiError } from "@/lib/api";
import { db, kvGet, kvSet, type LocalOrder, type LocalPayment } from "@/lib/db";
import { enqueue, isOnline, isQueued, patchQueued, processQueue } from "@/lib/sync";
import { lineTotals, toLineInput, type CartLine } from "@/lib/pricing";
import { payableTotals, reconcilePayments, roundsCash, serverDueForPayment } from "@/lib/pos-rules";
import { deliveryChargeFields, resolveDeliveryCharge, resolveServiceCharge, serviceChargeFields, totalsWithCharges } from "@/lib/pos-charges";
import { businessDayFor } from "@/lib/business-day";
import { uuid } from "@/lib/utils";
import { useCartStore, type Cart } from "@/store/cart";
import { useCatalogStore } from "@/store/catalog";
import { useDeviceStore } from "@/store/device";
import { useSyncStore, type OpenCounts } from "@/store/sync";
import type { HeaderPills, Order, OrderInput, PaymentInput, PaymentResult, Receipt, Shift, ZReport, CashMovement } from "@/lib/types";
import { OPEN_STATUSES } from "@/lib/types";

const isNetwork = (e: unknown) => e instanceof ApiError && e.isNetwork;

function ctx() {
  const d = useDeviceStore.getState();
  const c = useCatalogStore.getState();
  return {
    device: d.device, branch: d.branch ?? c.catalog?.branch ?? null, session: d.session, membershipId: d.session?.membership?.id ?? null,
    cashier: d.session?.user?.name ?? null, settings: c.catalog?.business.settings ?? d.business?.settings ?? {}, catalog: c.catalog,
  };
}

async function nextTillSerial(): Promise<string> {
  const code = ctx().device?.code ?? "T1";
  const n = ((await kvGet<number>("till_serial_seq")) ?? 0) + 1;
  await kvSet("till_serial_seq", n);
  return `${code}-${String(n).padStart(3, "0")}`;
}

export function cartToLocal(cart: Cart, status: string, extra: Partial<LocalOrder> = {}): LocalOrder {
  const { settings, membershipId, cashier, branch } = ctx();
  const t = totalsWithCharges(cart.lines, cart, { settings, staffMeal: cart.is_staff_meal, tip_minor: extra.tip_minor ?? cart.tip_minor, rounding_minor: extra.rounding_minor ?? cart.rounding_minor, discount_minor: cart.discount_minor });
  const now = new Date().toISOString();
  return {
    id: cart.id, serial: null, till_serial: null, label: cart.label ?? "draft", status, payment_status: "unpaid", order_type: cart.order_type, table_id: cart.table_id, table_code: cart.table_code,
    guest_name: cart.guest_name || null, covers: cart.covers, customer_id: cart.customer?.id ?? null, customer_name: cart.customer?.name ?? null, customer_phone: cart.customer?.phone ?? null,
    notes: cart.notes || null, is_staff_meal: cart.is_staff_meal, staff_meal_reason: cart.staff_meal_reason || null, lines: cart.lines,
    subtotal_minor: t.subtotal_minor, discount_minor: t.discount_minor, service_charge_minor: t.service_charge_minor, tax_minor: t.tax_minor, rounding_minor: t.rounding_minor, tip_minor: t.tip_minor, total_minor: t.total_minor,
    paid_minor: 0, payments: [], receipt_number: null, void_reason: null, membership_id: membershipId, cashier_name: cashier, business_day: businessDayFor(branch?.day_end_time),
    client_created_at: cart.client_created_at, created_at: now, updated_at: now, local_only: true, open: OPEN_STATUSES.includes(status as never) ? 1 : 0,
    delivery_charge_minor: t.delivery_charge_minor, address_id: cart.address_id ?? null,
    ...chargeFields(cart), tax_choice: cart.tax_choice ?? null, tax_rate_id: cart.tax_rate_id ?? null,
    ...extra,
  };
}

export function serverToLocal(o: Order, prev?: LocalOrder | null): LocalOrder {
  const lines: CartLine[] = (o.items ?? []).map((i) => ({
    key: i.id, id: i.id, product_id: i.product_id ?? undefined, variant_id: i.variant_id, deal_id: i.deal_id ?? undefined, name: i.name, unit_price_minor: i.unit_price_minor, quantity: Number(i.quantity),
    notes: i.notes, modifiers: (i.modifiers ?? []).map((m) => ({ modifier_id: m.modifier_id ?? "", name: m.name, price_minor: m.price_minor, quantity: Number(m.quantity) })),
    open_item: i.open_item ? { name: i.name, price_minor: i.unit_price_minor } : undefined, price_override_minor: i.price_overridden ? i.unit_price_minor : null,
    tax_rate: i.tax_rate, tax_inclusive: i.tax_inclusive, station_id: i.station_id, status: i.status, sent: !!i.sent_at,
  }));
  return {
    id: o.id, serial: o.serial, till_serial: o.till_serial, label: o.label, status: o.status, payment_status: o.payment_status, order_type: o.order_type, table_id: o.table_id, table_code: o.table_code,
    guest_name: o.guest_name, covers: o.covers, customer_id: o.customer_id, customer_name: prev?.customer_name ?? null, customer_phone: prev?.customer_phone ?? null, notes: o.notes,
    is_staff_meal: o.is_staff_meal, staff_meal_reason: o.staff_meal_reason ?? null, lines, subtotal_minor: o.subtotal_minor, discount_minor: o.discount_minor, service_charge_minor: o.service_charge_minor,
    tax_minor: o.tax_minor, rounding_minor: o.rounding_minor, tip_minor: o.tip_minor, total_minor: o.total_minor, paid_minor: o.paid_minor, payments: prev?.payments ?? [], receipt_number: o.receipt_number,
    void_reason: o.void_reason, membership_id: o.taken_by_membership_id, cashier_name: prev?.cashier_name ?? null, business_day: o.business_day, client_created_at: o.client_created_at ?? o.created_at,
    created_at: o.created_at, updated_at: o.updated_at, local_only: false, open: OPEN_STATUSES.includes(o.status) ? 1 : 0,
    delivery_charge_minor: o.delivery_charge_minor ?? 0, address_id: prev?.address_id ?? null,
    service_charge_percent: o.service_charge_percent ?? null, service_charge_fixed_minor: o.service_charge_fixed_minor ?? 0, delivery_charge_percent: o.delivery_charge_percent ?? 0,
    tax_choice: o.tax_choice ?? null, tax_rate_id: o.tax_rate_id ?? null,
    // SPEC discounts: a summary row carries no lines; keep the ones already known rather than dropping them.
    order_discounts: o.discounts ? o.discounts.map((d) => ({ id: d.id, kind: d.kind, value: Number(d.value), amount_minor: d.amount_minor, reason: d.reason, order_item_id: d.order_item_id })) : prev?.order_discounts,
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

/** True when the cart has lines, an order type or a customer that the stored copy of the order does not have yet. */
function unsavedChanges(cart: Cart, stored: LocalOrder | undefined): boolean {
  if (!stored) return true;
  const lines = (ls: CartLine[]) => JSON.stringify(ls.filter((l) => l.status !== "cancelled").map(toLineInput));
  return lines(cart.lines) !== lines(stored.lines) || cart.order_type !== stored.order_type || (cart.customer?.id ?? null) !== (stored.customer_id ?? null);
}

export function localToCart(o: LocalOrder): Cart {
  return {
    id: o.id, saved: true, local_only: o.local_only, status: o.status, order_type: o.order_type as Cart["order_type"], lines: o.lines.filter((l) => l.status !== "cancelled"),
    customer: o.customer_id ? { id: o.customer_id, name: o.customer_name ?? "Customer", phone: o.customer_phone } : null, table_id: o.table_id, table_code: o.table_code,
    guest_name: o.guest_name ?? "", covers: o.covers, notes: o.notes ?? "", is_staff_meal: o.is_staff_meal, staff_meal_reason: o.staff_meal_reason ?? "", label: o.label, client_created_at: o.client_created_at,
    discount_minor: orderLevelDiscount(o), discounts: o.order_discounts, delivery_charge_minor: o.delivery_charge_minor || undefined, address_id: o.address_id ?? null,
    paid_minor: o.paid_minor || undefined, rounding_minor: o.rounding_minor || undefined, tip_minor: o.tip_minor || undefined,
    service_charge_percent: o.service_charge_percent ?? undefined, service_charge_fixed_minor: o.service_charge_fixed_minor ?? undefined, delivery_charge_percent: o.delivery_charge_percent ?? undefined,
    tax_choice: o.tax_choice ?? undefined, tax_rate_id: o.tax_rate_id ?? undefined,
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

function orderInput(cart: Cart, place: boolean, approver_pin?: string): OrderInput {
  return {
    id: cart.id, order_type: cart.order_type, source: "till", table_id: cart.table_id, guest_name: cart.guest_name || null, covers: cart.covers, customer_id: cart.customer?.id ?? null,
    notes: cart.notes || null, client_created_at: cart.client_created_at, lines: cart.lines.map(toLineInput), place, is_staff_meal: cart.is_staff_meal || undefined,
    staff_meal_reason: cart.is_staff_meal ? cart.staff_meal_reason : undefined, approver_pin,
    address_id: cart.order_type === "delivery" ? cart.address_id ?? null : null, ...chargeFields(cart),
  };
}

/** SPEC reopen flow: the server fields the cart keeps so the till knows the order must go back through payment. */
export function reopenFields(o: Order): Pick<Cart, "reopened" | "reopen_count" | "paid_minor" | "payment_method_summary"> {
  return { reopened: !!o.reopened_at && OPEN_STATUSES.includes(o.status), reopen_count: o.reopen_count ?? 0, paid_minor: o.paid_minor ?? 0, payment_method_summary: o.payment_method_summary ?? null };
}

/**
 * Save the current cart: create or update on the server when online, else keep it local and queue it.
 * `pin` is the user's own order-update PIN (SPEC REQUIRE_PIN_FOR_ORDER_UPDATE) for a reopened order; `approver_pin` is a manager's.
 */
export async function saveOrder(cart: Cart, opts: { place?: boolean; approver_pin?: string; pin?: string } = {}): Promise<{ cart: Cart; local: LocalOrder; offline: boolean }> {
  const place = !!opts.place;
  const { membershipId } = ctx();
  // Already queued locally and not yet accepted: just update the queued record.
  if (cart.local_only && (await isQueued(cart.id))) {
    const local = cartToLocal(cart, place || cart.status === "placed" ? "placed" : cart.status === "held" ? "held" : "draft");
    const prev = await db.orders.get(cart.id);
    await saveLocal({ ...local, till_serial: prev?.till_serial ?? local.till_serial, label: prev?.label ?? local.label, created_at: prev?.created_at ?? local.created_at, payments: prev?.payments ?? [], paid_minor: prev?.paid_minor ?? 0 });
    await patchQueued(cart.id, (p) => ({ ...p, ...orderInput(cart, place), status: place || p.status === "placed" ? "placed" : "draft", place: undefined, approver_pin: undefined }));
    return { cart: { ...cart, saved: true, local_only: true, status: local.status }, local, offline: true };
  }
  if (isOnline()) {
    try {
      let order: Order;
      if (cart.saved && !cart.local_only) {
        const input = orderInput(cart, place, opts.approver_pin);
        order = await api<Order>(`/orders/${cart.id}`, { method: "PATCH", auth: "pos", body: { ...input, place: undefined, id: undefined, is_staff_meal: undefined, staff_meal_reason: undefined, pin: opts.pin } });
        if (place && ["draft", "held"].includes(order.status)) order = await api<Order>(`/orders/${cart.id}/place`, { method: "POST", auth: "pos" });
      } else {
        order = await api<Order>("/orders", { method: "POST", auth: "pos", body: orderInput(cart, place, opts.approver_pin) });
      }
      const local = await storeServerOrder(order);
      return { cart: { ...localToCart(local), lines: local.lines.filter((l) => l.status !== "cancelled"), ...reopenFields(order) }, local, offline: false };
    } catch (e) {
      if (!isNetwork(e)) throw e;
    }
  }
  // Offline path
  if (cart.saved && !cart.local_only) {
    // Exists on the server: queue an update; status changes wait for the connection.
    const prev = await db.orders.get(cart.id);
    const local = cartToLocal(cart, place ? "placed" : cart.status, { till_serial: prev?.till_serial ?? null, label: prev?.label ?? cart.label ?? "draft", serial: prev?.serial ?? null, created_at: prev?.created_at, payments: prev?.payments ?? [], paid_minor: prev?.paid_minor ?? 0, local_only: false });
    await saveLocal(local);
    await enqueue({ type: "order_update", id: cart.id, membership_id: membershipId ?? undefined, payload: { order_type: cart.order_type, table_id: cart.table_id, guest_name: cart.guest_name || null, covers: cart.covers, customer_id: cart.customer?.id ?? null, notes: cart.notes || null, lines: cart.lines.map(toLineInput), client_seq: Date.now(), address_id: cart.order_type === "delivery" ? cart.address_id ?? null : null, ...chargeFields(cart) } });
    return { cart: { ...cart, saved: true, status: local.status }, local, offline: true };
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
  const cash = roundsCash(payments.map((p) => p.method_code));
  // Ids are fixed before anything is sent: a payment the server took but answered too late (a timeout counts as
  // offline) is queued under the same id, and the server skips it instead of recording it twice.
  let pays = payments.map((p) => ({ ...p, id: p.id ?? uuid() }));
  let current = cart;
  let synced = false;
  if (isOnline()) {
    if (current.local_only) { await processQueue(); const o = await db.orders.get(current.id); if (o && !o.local_only) current = { ...current, local_only: false }; }
    if (!current.local_only) {
      try {
        // Always sync the cart to the server first so the payment applies to the latest lines.
        const shownDue = opts.shownDue ?? Math.max(0, payableTotals(cart, { settings, tip_minor, cash }).total_minor - (cart.paid_minor ?? 0));
        const saved = await saveOrder(current, { approver_pin, pin: opts.pin });
        current = saved.cart;
        synced = true; // saved on the server, or stored and queued when it could not be reached
        if (saved.offline) throw new ApiError("network", "Offline", 0);
        // The server prices the order again on this save (a regular customer's discount, a price change). Never take
        // money against an amount the cashier did not see: a gap under Rs 1 is paisa rounding and moves the payment;
        // a bigger gap stops here once with the server's figure, and the next press pays that figure.
        const serverDue = serverDueForPayment(saved.local, { settings, tip_minor, cash });
        const toSend = reconcilePayments(pays, shownDue, serverDue, opts.seenDue);
        if (!toSend) throw new TotalChangedError({ ...current, customer: cart.customer, address_text: cart.address_text, zone_name: cart.zone_name }, shownDue, serverDue);
        pays = toSend;
        const res = await api<PaymentResult>(`/orders/${current.id}/payments`, { method: "POST", auth: "pos", body: { payments: pays, tip_minor } });
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
  // Offline: order must be local (queued) or already on the server. Lines added since it was last stored (a table
  // order opened offline, say) are stored and queued first, so the payment covers them, as the online path does.
  const stored = await db.orders.get(current.id);
  const saved = synced || (current.saved && !unsavedChanges(current, stored)) ? { cart: current } : await saveOrder(current, { place: !current.saved });
  current = saved.cart;
  const prev = (await db.orders.get(current.id)) ?? cartToLocal(current, "placed");
  // Priced as the server will when the queue reaches it, with the order-level discount once: the lines carry the
  // product discounts when the till stored the order, and the server's figure holds them when it came from there.
  const totals = payableTotals({ ...prev, discount_minor: orderLevelPool(prev) }, { settings, tip_minor, cash });
  let due = totals.total_minor - prev.paid_minor;
  let change = 0;
  const now = new Date().toISOString();
  const newPayments: LocalPayment[] = [];
  for (const p of pays) {
    const applied = Math.min(p.amount_minor, due);
    if (applied <= 0) continue;
    const tendered = p.method_code === "cash" ? Math.max(p.tendered_minor ?? 0, p.amount_minor) : undefined;
    const ch = p.method_code === "cash" ? Math.max((tendered ?? 0) - applied, 0) : 0;
    change += ch;
    due -= applied;
    newPayments.push({ id: p.id, method_code: p.method_code, amount_minor: applied, tendered_minor: tendered, change_minor: ch, reference: p.reference, client_created_at: now });
  }
  const paid = prev.paid_minor + newPayments.reduce((s, p) => s + p.amount_minor, 0);
  const status = paid >= totals.total_minor ? "paid" : prev.status === "draft" || prev.status === "held" ? "placed" : prev.status;
  const local = await saveLocal({ ...prev, ...totals, paid_minor: paid, payments: [...prev.payments, ...newPayments], status, payment_status: paid >= totals.total_minor ? "paid" : paid > 0 ? "partial" : "unpaid", receipt_number: prev.receipt_number ?? (paid >= totals.total_minor ? `${prev.till_serial ?? prev.label}` : null) });
  // Payments ride along only with an order still queued as new; a queued order_update (same id) does not carry them.
  const merged = await patchQueued(current.id, (p) => ({ ...p, status: "placed", payments: [...((p.payments as unknown[]) ?? []), ...newPayments.map((np) => ({ id: np.id, method_code: np.method_code, amount_minor: np.amount_minor, tendered_minor: np.tendered_minor, reference: np.reference, client_created_at: np.client_created_at }))], tip_minor: ((p.tip_minor as number) ?? 0) + tip_minor }), "order");
  if (!merged) {
    for (const np of newPayments) {
      await enqueue({ type: "payment", id: np.id, membership_id: membershipId ?? undefined, payload: { order_id: current.id, method_code: np.method_code, amount_minor: np.amount_minor, tendered_minor: np.tendered_minor, reference: np.reference, client_created_at: np.client_created_at, tip_minor } });
    }
  }
  // The cart keeps everything the cashier set (customer, discount lines, reopen state); only the payment moved on.
  const next: Cart = { ...current, saved: true, local_only: local.local_only, status: local.status, label: local.label, paid_minor: local.paid_minor, rounding_minor: local.rounding_minor || undefined, tip_minor: local.tip_minor || undefined };
  return { receipt: buildLocalReceipt(local), change_minor: change, offline: true, local, cart: next };
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

export async function refundOrder(id: string, amount_minor: number, method_code: string, reason: string, approver_pin?: string) {
  const res = await api<{ order: Order }>(`/orders/${id}/refunds`, { method: "POST", auth: "pos", body: { amount_minor, method_code, reason, approver_pin, refund_id: uuid() } });
  await storeServerOrder(res.order);
  return res;
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
 * also when a regular discount tier is applied automatically), then `fn` runs against the server order id.
 */
export async function applyServerDiscount(cart: Cart, fn: (orderId: string) => Promise<Order>, opts: { approver_pin?: string; pin?: string } = {}): Promise<Cart> {
  if (!isOnline()) throw new ApiError("offline", "Discounts need the internet", 0);
  const saved = await saveOrder(cart, opts);
  if (saved.offline) throw new ApiError("offline", "Discounts need the internet", 0);
  const current = saved.cart;
  const order = await fn(current.id);
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
  if (isOnline() && (!prev || !prev.local_only)) {
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
 * save goes through the payment screen. Online only: a reopen is never queued.
 */
export async function reopenOrder(id: string): Promise<Cart> {
  if (!isOnline()) throw new ApiError("offline", "Reopening an order needs the internet", 0);
  const o = await api<Order>(`/orders/${id}/reopen`, { method: "POST", auth: "pos" });
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
        const local = serverToLocal({ ...o, items: o.items ?? [] }, prev);
        await db.orders.put(o.items ? local : { ...local, lines: prev?.lines ?? [] });
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

export async function cashMovement(shift: Shift, kind: string, amount_minor: number, reason: string, approver_pin?: string): Promise<{ offline: boolean }> {
  const { membershipId } = ctx();
  const id = uuid();
  if (isOnline()) {
    try {
      const r = await api<{ movement: CashMovement; shift: Shift }>(`/shifts/${shift.id}/cash_movements`, { method: "POST", auth: "pos", body: { kind, amount_minor, reason, approver_pin, movement_id: id } });
      useCatalogStore.getState().setShift(r.shift);
      return { offline: false };
    } catch (e) { if (!isNetwork(e)) throw e; }
  }
  const signed = kind === "cash_in" ? amount_minor : -amount_minor;
  useCatalogStore.getState().setShift({ ...shift, movements: [...shift.movements, { id, shift_id: shift.id, kind, amount_minor: signed, reason, reference: null, by_membership_id: membershipId, approved_by_membership_id: null, occurred_at: new Date().toISOString() }] });
  await enqueue({ type: "cash_movement", id, membership_id: membershipId ?? undefined, payload: { shift_id: shift.id, kind, amount_minor, reason } });
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
  await enqueue({ type: "shift_close", id: shift.id, membership_id: membershipId ?? undefined, payload: { counted_cash_minor, count_detail, note } });
  useCatalogStore.getState().setShift(null);
  return { shift: { ...shift, status: "closed", closed_at: new Date().toISOString(), counted_cash_minor }, z: null, offline: true };
}

// ---- Receipt ----
export function buildLocalReceipt(o: LocalOrder, duplicate = false): Receipt {
  const { catalog, settings, branch } = ctx();
  const biz = catalog?.business ?? useDeviceStore.getState().business;
  // The catalog sync's business block carries logo_key (API catalog_controller); the pairing payload is the fallback for older caches.
  const catalogLogo = catalog?.business.logo_key;
  const receipt = (settings.receipt ?? {}) as { header?: string; footer?: string; language?: string; paper?: string };
  const active = o.lines.filter((l) => l.status !== "cancelled");
  const taxGroups = new Map<string, { rate: number; inclusive: boolean; taxable_minor: number; tax_minor: number }>();
  active.forEach((l) => {
    const t = lineTotals(l);
    const k = `${l.tax_rate}-${l.tax_inclusive}`;
    const g = taxGroups.get(k) ?? { rate: l.tax_rate, inclusive: l.tax_inclusive, taxable_minor: 0, tax_minor: 0 };
    g.taxable_minor += t.line_subtotal_minor; g.tax_minor += t.line_tax_minor;
    taxGroups.set(k, g);
  });
  return {
    receipt_number: o.receipt_number, duplicate, printed_at: new Date().toISOString(),
    business: { name: biz?.name ?? "", legal_name: null, phone: useDeviceStore.getState().business?.phone ?? null, logo_key: catalogLogo ?? useDeviceStore.getState().business?.logo_key ?? null, currency: biz?.currency ?? "PKR" },
    branch: { name: branch?.name ?? "", address: branch?.address ?? null, city: branch?.city ?? null, phone: branch?.phone ?? null, tax_registration: branch?.tax_registration ?? null },
    header: receipt.header ?? null, footer: receipt.footer ?? null, language: receipt.language ?? "en", paper: receipt.paper ?? "80",
    order: { id: o.id, serial: o.serial, label: o.label, order_type: o.order_type as Receipt["order"]["order_type"], table: o.table_code, business_day: o.business_day, placed_at: o.created_at, paid_at: o.updated_at, cashier: o.cashier_name, customer: o.customer_id ? { name: o.customer_name ?? "", phone: o.customer_phone, khata_no: null } : null, guest_name: o.guest_name, notes: o.notes },
    lines: active.map((l) => { const t = lineTotals(l); return { name: l.name, quantity: String(l.quantity), unit_price_minor: l.price_override_minor ?? l.unit_price_minor, modifiers: l.modifiers.map((m) => ({ name: m.name, price_minor: m.price_minor })), line_total_minor: t.line_total_minor, discount_minor: t.line_discount_minor, notes: l.notes ?? null }; }),
    totals: { subtotal_minor: o.subtotal_minor, discount_minor: o.discount_minor, service_charge_minor: o.service_charge_minor, tax_minor: o.tax_minor, tax_lines: [...taxGroups.values()].filter((g) => g.rate), delivery_charge_minor: o.delivery_charge_minor ?? 0, rounding_minor: o.rounding_minor, tip_minor: o.tip_minor, total_minor: o.total_minor, paid_minor: o.paid_minor, due_minor: Math.max(0, o.total_minor - o.paid_minor) },
    payments: o.payments.map((p) => ({ method: p.method_code, amount_minor: p.amount_minor, tendered_minor: p.tendered_minor ?? null, change_minor: p.change_minor ?? 0, reference: p.reference ?? null })),
    refunds: [], khata: null,
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
