import type { Deal, ModifierGroup, Product, Variant } from "@/lib/types";
import { formatMoney } from "@/lib/money";

// Pure helpers for the guest QR ordering page (/q/<table token>): the cart a guest builds on their phone, modifier
// rules, totals and the wording of an order's state. No React; tested in qr-guest.test.ts.

/** GET /qr/:token: the live menu for one table, plus what the branch allows guests to do. */
export interface QrMenu {
  business: { name: string; currency: string; logo_key: string | null };
  branch: { id: string; name: string; address: string | null; phone: string | null };
  table: { id: string; code: string; name: string | null; seats: number | null };
  settings: { enabled?: boolean; cashier_accept?: boolean; call_waiter?: boolean; ask_bill?: boolean; running_bill?: boolean; guest_name?: boolean; welcome?: string | null };
  ordering: boolean;
  message?: string;
  categories?: { id: string; name: string; subtitle?: string | null; image_key?: string | null }[];
  products?: (Product & { price_minor: number })[];
  modifier_groups?: ModifierGroup[];
  deals?: Deal[];
  running_bill?: QrBill | null;
}

export interface QrBill {
  order_id: string | null; label?: string | null; status?: string; guest_name?: string | null;
  items: { name: string; quantity: string; line_subtotal_minor?: number; line_total_minor: number }[];
  subtotal_minor?: number; discount_minor?: number; service_charge_minor?: number; tax_minor?: number; tax_inclusive_minor?: number; rounding_minor?: number; total_minor: number; paid_minor?: number;
}

/** POST /qr/:token/orders and GET /qr/:token/orders/:id: what the guest sees after ordering. */
export interface QrGuestOrder {
  id: string; guest_token: string; label: string | null; status: string; qr_status: "pending" | "accepted" | "rejected" | string | null; guest_name: string | null; table_code: string;
  items: { name: string; quantity: string; line_subtotal_minor?: number; line_total_minor: number; status: string }[];
  subtotal_minor: number; discount_minor?: number; tax_minor: number; tax_inclusive_minor?: number; service_charge_minor: number; rounding_minor?: number; total_minor: number; message: string;
}

export interface QrCartModifier { modifier_id: string; name: string; price_minor: number; quantity: number }
export interface QrCartLine {
  key: string; product_id: string | null; variant_id: string | null; deal_id: string | null; name: string; detail: string | null;
  unit_minor: number; modifiers: QrCartModifier[]; notes: string | null; quantity: number;
}

/** One line per product, size, modifier set and note; the same choice tapped twice bumps the quantity. */
export function qrLineKey(productId: string | null, variantId: string | null, dealId: string | null, modifiers: QrCartModifier[], notes: string | null): string {
  const mods = [...modifiers].sort((a, b) => a.modifier_id.localeCompare(b.modifier_id)).map((m) => `${m.modifier_id}x${m.quantity}`).join(",");
  return [dealId ? `d:${dealId}` : `p:${productId}`, variantId ?? "", mods, (notes ?? "").trim()].join("|");
}

export function qrLineTotal(line: QrCartLine): number {
  return (line.unit_minor + line.modifiers.reduce((s, m) => s + m.price_minor * m.quantity, 0)) * line.quantity;
}

export function qrSubtotal(lines: QrCartLine[]): number {
  return lines.reduce((s, l) => s + qrLineTotal(l), 0);
}

export function qrCount(lines: QrCartLine[]): number {
  return lines.reduce((s, l) => s + l.quantity, 0);
}

/** Adds a line or bumps the matching one. */
export function qrAddLine(lines: QrCartLine[], line: Omit<QrCartLine, "key">): QrCartLine[] {
  const key = qrLineKey(line.product_id, line.variant_id, line.deal_id, line.modifiers, line.notes);
  const existing = lines.find((l) => l.key === key);
  if (existing) return lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + line.quantity } : l));
  return [...lines, { ...line, key }];
}

export function qrSetQuantity(lines: QrCartLine[], key: string, quantity: number): QrCartLine[] {
  return quantity <= 0 ? lines.filter((l) => l.key !== key) : lines.map((l) => (l.key === key ? { ...l, quantity } : l));
}

/** The modifier groups a product offers, in the menu's order. */
export function qrGroupsFor(product: Pick<Product, "modifier_group_ids">, groups: ModifierGroup[]): ModifierGroup[] {
  const ids = product.modifier_group_ids ?? [];
  return groups.filter((g) => ids.includes(g.id)).map((g) => ({ ...g, modifiers: g.modifiers.filter((m) => m.active) })).filter((g) => g.modifiers.length);
}

/** Why the picked modifiers are not enough yet, or null when the choice is complete. Mirrors the till's rule. */
export function qrModifierProblem(groups: ModifierGroup[], picked: Record<string, number>): string | null {
  for (const g of groups) {
    const n = g.modifiers.reduce((s, m) => s + (picked[m.id] ?? 0), 0);
    const min = g.required ? Math.max(1, g.min_select) : g.min_select;
    if (n < min) return `Choose ${min === 1 ? "one" : `at least ${min}`} from ${g.name}`;
    if (g.max_select && n > g.max_select) return `Up to ${g.max_select} from ${g.name}`;
  }
  return null;
}

/** Toggles a modifier: single-choice groups swap, multi-choice groups stop at max_select. */
export function qrToggleModifier(groups: ModifierGroup[], picked: Record<string, number>, groupId: string, modifierId: string): Record<string, number> {
  const g = groups.find((x) => x.id === groupId);
  if (!g) return picked;
  const next = { ...picked };
  if (next[modifierId]) { delete next[modifierId]; return next; }
  const n = g.modifiers.reduce((s, m) => s + (next[m.id] ?? 0), 0);
  if (g.max_select === 1) g.modifiers.forEach((m) => delete next[m.id]);
  else if (g.max_select && n >= g.max_select) return picked;
  next[modifierId] = 1;
  return next;
}

/** The price a guest pays for a product or size: the dine-in price for this branch when one is set. */
export function qrPrice(product: Product & { price_minor?: number }, variant: Variant | null, branchId: string | null): number {
  const rows = (product.prices ?? []).filter((p) => (p.variant_id ?? null) === (variant?.id ?? null) && p.order_type === "dine_in");
  const row = rows.find((p) => p.branch_id === branchId) ?? rows.find((p) => !p.branch_id);
  if (row) return row.price_minor;
  if (variant) return variant.price_minor;
  return product.price_minor ?? product.base_price_minor;
}

/** The lines as POST /qr/:token/orders wants them. */
export function qrOrderLines(lines: QrCartLine[]) {
  return lines.map((l) => ({
    ...(l.deal_id ? { deal_id: l.deal_id } : { product_id: l.product_id, variant_id: l.variant_id ?? undefined }),
    quantity: l.quantity,
    modifiers: l.modifiers.length ? l.modifiers.map((m) => ({ modifier_id: m.modifier_id, quantity: m.quantity })) : undefined,
    notes: l.notes ?? undefined,
  }));
}

export type QrStage = "waiting" | "kitchen" | "ready" | "done" | "rejected" | "cancelled";

/** What the guest's order is doing now, from its QR state and the kitchen's state. */
export function qrStage(order: Pick<QrGuestOrder, "qr_status" | "status" | "items">): QrStage {
  if (order.qr_status === "rejected") return "rejected";
  if (order.status === "voided" || order.status === "cancelled") return "cancelled";
  if (order.qr_status === "pending") return "waiting";
  if (order.status === "completed" || order.status === "paid" || order.status === "closed") return "done";
  if (order.items.length && order.items.every((i) => i.status === "ready" || i.status === "served" || i.status === "delivered")) return "ready";
  return "kitchen";
}

export function qrStageText(stage: QrStage, tableCode: string): { title: string; text: string; tone: "wait" | "ok" | "done" | "failed" } {
  switch (stage) {
    case "waiting": return { title: "Sent to the counter", text: "A cashier will accept your order in a moment.", tone: "wait" };
    case "kitchen": return { title: "Being prepared", text: `The kitchen has your order. It will come to table ${tableCode}.`, tone: "ok" };
    case "ready": return { title: "On its way", text: `Your food is ready and coming to table ${tableCode}.`, tone: "ok" };
    case "done": return { title: "Order complete", text: "Thank you for dining with us.", tone: "done" };
    case "rejected": return { title: "Order not accepted", text: "Sorry, the counter could not take this order. Please speak to a waiter.", tone: "failed" };
    case "cancelled": return { title: "Order cancelled", text: "This order was cancelled. Please speak to a waiter if that is unexpected.", tone: "failed" };
  }
}

export function qrIsFinal(stage: QrStage): boolean {
  return stage === "done" || stage === "rejected" || stage === "cancelled";
}

/** "2 items · Rs 1,250" for the cart bar. */
export function qrCartLabel(lines: QrCartLine[], currency: string): string {
  const n = qrCount(lines);
  return `${n} item${n === 1 ? "" : "s"} · ${formatMoney(qrSubtotal(lines), currency)}`;
}

/** What a guest keeps on their phone for one table: the cart, their name and the order they placed last. */
export interface QrGuestState { lines: QrCartLine[]; guest_name: string; notes: string; lastOrder: { id: string; guest_token: string } | null }
export const EMPTY_GUEST: QrGuestState = { lines: [], guest_name: "", notes: "", lastOrder: null };
export const qrStorageKey = (token: string) => `easalpha.qr.${token}`;

export function readGuestState(token: string): QrGuestState {
  try {
    const raw = localStorage.getItem(qrStorageKey(token));
    if (!raw) return EMPTY_GUEST;
    const v = JSON.parse(raw) as Partial<QrGuestState>;
    return { ...EMPTY_GUEST, ...v, lines: Array.isArray(v.lines) ? v.lines : [] };
  } catch { return EMPTY_GUEST; }
}

export function writeGuestState(token: string, state: QrGuestState): void {
  try { localStorage.setItem(qrStorageKey(token), JSON.stringify(state)); } catch {}
}
