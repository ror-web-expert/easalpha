"use client";
// Till actions. Each one saves locally first and talks to the server when it can; otherwise it queues a sync record.
import { api, ApiError } from "@/lib/api";
import { db, kvGet, kvSet, type LocalOrder, type LocalPayment } from "@/lib/db";
import { enqueue, isOnline, isQueued, patchQueued, processQueue } from "@/lib/sync";
import { computeTotals, cashRounding, lineTotals, toLineInput, type CartLine } from "@/lib/pricing";
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
  const t = computeTotals(cart.lines, { orderType: cart.order_type, settings, staffMeal: cart.is_staff_meal, tip_minor: extra.tip_minor, rounding_minor: extra.rounding_minor, discount_minor: cart.discount_minor, delivery_charge_minor: cart.order_type === "delivery" ? cart.delivery_charge_minor : 0 });
  const now = new Date().toISOString();
  return {
    id: cart.id, serial: null, till_serial: null, label: cart.label ?? "draft", status, payment_status: "unpaid", order_type: cart.order_type, table_id: cart.table_id, table_code: cart.table_code,
    guest_name: cart.guest_name || null, covers: cart.covers, customer_id: cart.customer?.id ?? null, customer_name: cart.customer?.name ?? null, customer_phone: cart.customer?.phone ?? null,
    notes: cart.notes || null, is_staff_meal: cart.is_staff_meal, staff_meal_reason: cart.staff_meal_reason || null, lines: cart.lines,
    subtotal_minor: t.subtotal_minor, discount_minor: t.discount_minor, service_charge_minor: t.service_charge_minor, tax_minor: t.tax_minor, rounding_minor: t.rounding_minor, tip_minor: t.tip_minor, total_minor: t.total_minor,
    paid_minor: 0, payments: [], receipt_number: null, void_reason: null, membership_id: membershipId, cashier_name: cashier, business_day: businessDayFor(branch?.day_end_time),
    client_created_at: cart.client_created_at, created_at: now, updated_at: now, local_only: true, open: OPEN_STATUSES.includes(status as never) ? 1 : 0,
    delivery_charge_minor: t.delivery_charge_minor, address_id: cart.address_id ?? null,
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
  };
}

export function localToCart(o: LocalOrder): Cart {
  return {
    id: o.id, saved: true, local_only: o.local_only, status: o.status, order_type: o.order_type as Cart["order_type"], lines: o.lines.filter((l) => l.status !== "cancelled"),
    customer: o.customer_id ? { id: o.customer_id, name: o.customer_name ?? "Customer", phone: o.customer_phone } : null, table_id: o.table_id, table_code: o.table_code,
    guest_name: o.guest_name ?? "", covers: o.covers, notes: o.notes ?? "", is_staff_meal: o.is_staff_meal, staff_meal_reason: o.staff_meal_reason ?? "", label: o.label, client_created_at: o.client_created_at,
    discount_minor: o.discount_minor || undefined, delivery_charge_minor: o.delivery_charge_minor || undefined, address_id: o.address_id ?? null,
    paid_minor: o.paid_minor || undefined,
  };
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
    delivery_charge_minor: cart.order_type === "delivery" ? cart.delivery_charge_minor ?? 0 : 0, address_id: cart.order_type === "delivery" ? cart.address_id ?? null : null,
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
    await enqueue({ type: "order_update", id: cart.id, membership_id: membershipId ?? undefined, payload: { order_type: cart.order_type, table_id: cart.table_id, guest_name: cart.guest_name || null, covers: cart.covers, customer_id: cart.customer?.id ?? null, notes: cart.notes || null, lines: cart.lines.map(toLineInput), client_seq: Date.now(), delivery_charge_minor: cart.order_type === "delivery" ? cart.delivery_charge_minor ?? 0 : 0, address_id: cart.order_type === "delivery" ? cart.address_id ?? null : null } });
    return { cart: { ...cart, saved: true, status: local.status }, local, offline: true };
  }
  const till_serial = await nextTillSerial();
  const local = cartToLocal(cart, place ? "placed" : "draft", { till_serial, label: till_serial });
  await saveLocal(local);
  await enqueue({ type: "order", id: cart.id, membership_id: membershipId ?? undefined, payload: { ...orderInput(cart, place), place: undefined, approver_pin: undefined, id: undefined, till_serial, status: place ? "placed" : "draft" } });
  return { cart: { ...cart, saved: true, local_only: true, status: local.status, label: till_serial }, local, offline: true };
}

/**
 * Take one or more payments (a part payment is allowed; the order then stays open with payment_status "partial").
 * Returns the receipt (server-built when online, local otherwise). `pin` is the order-update PIN for a reopened order.
 */
export async function payOrder(cart: Cart, payments: PaymentInput[], tip_minor = 0, approver_pin?: string, opts: { pin?: string } = {}): Promise<{ receipt: Receipt; change_minor: number; offline: boolean; local: LocalOrder }> {
  const { settings, membershipId } = ctx();
  let current = cart;
  if (isOnline()) {
    if (current.local_only) { await processQueue(); const o = await db.orders.get(current.id); if (o && !o.local_only) current = { ...current, local_only: false }; }
    if (!current.local_only) {
      try {
        // Always sync the cart to the server first so the payment applies to the latest lines.
        const saved = await saveOrder(current, { approver_pin, pin: opts.pin });
        current = saved.cart;
        if (saved.offline) throw new ApiError("network", "Offline", 0);
        const res = await api<PaymentResult>(`/orders/${current.id}/payments`, { method: "POST", auth: "pos", body: { payments: payments.map((p) => ({ ...p, id: p.id ?? uuid() })), tip_minor } });
        const prev = await db.orders.get(current.id);
        const local = await saveLocal({ ...serverToLocal(res.order, prev), payments: [...(prev?.payments ?? []), ...res.payments.map((p) => ({ id: p.id, method_code: p.method_code, amount_minor: p.amount_minor, tendered_minor: p.tendered_minor ?? undefined, change_minor: p.change_minor, reference: p.reference ?? undefined, client_created_at: p.received_at }))] });
        const receipt = res.receipt ?? buildLocalReceipt(local);
        return { receipt, change_minor: res.change_minor, offline: false, local };
      } catch (e) {
        if (!isNetwork(e)) throw e;
      }
    }
  }
  // Offline: order must be local (queued) or already on the server.
  const saved = current.saved ? { cart: current } : await saveOrder(current, { place: true });
  current = saved.cart;
  const prev = (await db.orders.get(current.id)) ?? cartToLocal(current, "placed");
  const hasCash = payments.some((p) => p.method_code === "cash");
  const rounding = prev.paid_minor === 0 && hasCash ? cashRounding(prev.total_minor - prev.rounding_minor, settings) : prev.rounding_minor;
  const totals = computeTotals(prev.lines, { orderType: prev.order_type, settings, staffMeal: prev.is_staff_meal, tip_minor: prev.tip_minor + tip_minor, rounding_minor: rounding });
  let due = totals.total_minor - prev.paid_minor;
  let change = 0;
  const now = new Date().toISOString();
  const newPayments: LocalPayment[] = [];
  for (const p of payments) {
    const applied = Math.min(p.amount_minor, due);
    if (applied <= 0) continue;
    const tendered = p.method_code === "cash" ? Math.max(p.tendered_minor ?? 0, p.amount_minor) : undefined;
    const ch = p.method_code === "cash" ? Math.max((tendered ?? 0) - applied, 0) : 0;
    change += ch;
    due -= applied;
    newPayments.push({ id: p.id ?? uuid(), method_code: p.method_code, amount_minor: applied, tendered_minor: tendered, change_minor: ch, reference: p.reference, client_created_at: now });
  }
  const paid = prev.paid_minor + newPayments.reduce((s, p) => s + p.amount_minor, 0);
  const status = paid >= totals.total_minor ? "paid" : prev.status === "draft" || prev.status === "held" ? "placed" : prev.status;
  const local = await saveLocal({ ...prev, ...totals, tip_minor: prev.tip_minor + tip_minor, paid_minor: paid, payments: [...prev.payments, ...newPayments], status, payment_status: paid >= totals.total_minor ? "paid" : paid > 0 ? "partial" : "unpaid", receipt_number: prev.receipt_number ?? (paid >= totals.total_minor ? `${prev.till_serial ?? prev.label}` : null) });
  const merged = await patchQueued(current.id, (p) => ({ ...p, status: "placed", payments: [...((p.payments as unknown[]) ?? []), ...newPayments.map((np) => ({ id: np.id, method_code: np.method_code, amount_minor: np.amount_minor, tendered_minor: np.tendered_minor, reference: np.reference, client_created_at: np.client_created_at }))], tip_minor: ((p.tip_minor as number) ?? 0) + tip_minor }));
  if (!merged) {
    for (const np of newPayments) {
      await enqueue({ type: "payment", id: np.id, membership_id: membershipId ?? undefined, payload: { order_id: current.id, method_code: np.method_code, amount_minor: np.amount_minor, tendered_minor: np.tendered_minor, reference: np.reference, client_created_at: np.client_created_at, tip_minor } });
    }
  }
  return { receipt: buildLocalReceipt(local), change_minor: change, offline: true, local };
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
  const merged = await patchQueued(id, (p) => ({ ...p, status: "voided", voided: true, void_reason: reason }));
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
    business: { name: biz?.name ?? "", legal_name: null, phone: useDeviceStore.getState().business?.phone ?? null, logo_key: null, currency: biz?.currency ?? "PKR" },
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
