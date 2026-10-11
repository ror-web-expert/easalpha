import type { ConsumableOrderType, DiscountType, MenuImportSource, OrderTypeConsumable, OrderTypeConsumableInput } from "@/lib/types";

// Pure helpers for the SPEC "Menu and catalog" screens. No React here so they can be unit tested.

/** Order types the consumables mapping is keyed on (Product::ORDER_TYPES in the API). */
export const CONSUMABLE_ORDER_TYPES: ConsumableOrderType[] = ["dine_in", "takeaway", "delivery", "walk_in", "online"];

// ---- Discount (SPEC: "Discount with a %/Rs switch") ----

/** Validates the discount field. Returns a message to show under the field, or null when it is fine. */
export function discountProblem(value: string, type: DiscountType, basePriceMinor: number): string | null {
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return "Enter a number.";
  if (n < 0) return "A discount cannot be negative.";
  if (type === "percent" && n > 100) return "A percentage discount cannot be above 100%.";
  if (type === "amount" && basePriceMinor > 0 && Math.round(n * 100) > basePriceMinor) return "The discount is more than the base price.";
  return null;
}

/** "10%" or "Rs 50"; empty string when there is no discount. */
export function discountLabel(value: string | null | undefined, type: DiscountType | null | undefined): string {
  const n = Number(value ?? "");
  if (!value || !type || !Number.isFinite(n) || n <= 0) return "";
  const num = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
  return type === "percent" ? `${num}%` : `Rs ${num}`;
}

/** Price after the product's own discount, in minor units, never below zero. */
export function discountedPriceMinor(basePriceMinor: number, value: string | null | undefined, type: DiscountType | null | undefined): number {
  const n = Number(value ?? "");
  if (!value || !type || !Number.isFinite(n) || n <= 0) return basePriceMinor;
  const off = type === "percent" ? Math.round((basePriceMinor * n) / 100) : Math.round(n * 100);
  return Math.max(0, basePriceMinor - off);
}

/** What PATCH /products receives: blank value clears the discount. */
export function discountPayload(value: string, type: DiscountType): { discount_value: string | null; discount_type: DiscountType | null } {
  const t = value.trim();
  if (t === "" || Number(t) === 0) return { discount_value: null, discount_type: null };
  return { discount_value: t, discount_type: type };
}

// ---- Order Inventory consumables ----

export interface ConsumableRow { key: string; variant_id: string; order_type: string; stock_item_id: string; item_name: string; quantity: string; unit_id: string; unit_code: string }

export function consumableToRow(c: OrderTypeConsumable, key: string): ConsumableRow {
  return { key, variant_id: c.variant_id ?? "", order_type: c.order_type, stock_item_id: c.stock_item_id, item_name: c.item_name, quantity: String(Number(c.quantity)), unit_id: c.unit_id, unit_code: c.unit_code };
}

/** Rows that are complete enough to save. */
export function completeConsumables(rows: ConsumableRow[]): ConsumableRow[] {
  return rows.filter((r) => r.stock_item_id && r.unit_id && Number(r.quantity) > 0);
}

export function consumablesToInputs(rows: ConsumableRow[]): OrderTypeConsumableInput[] {
  return completeConsumables(rows).map((r) => ({ variant_id: r.variant_id || null, order_type: r.order_type, stock_item_id: r.stock_item_id, quantity: r.quantity, unit_id: r.unit_id }));
}

/** SPEC "Copy all order types": the rows of one order type replace the rows of every order type. Pure version of what the
 *  API does with copy_all_order_types: true, used to show the result and to build the request body. */
export function copyAllOrderTypes(rows: ConsumableRow[], source: string, orderTypes: readonly string[] = CONSUMABLE_ORDER_TYPES, keyFor: (i: number) => string = (i) => `copy-${i}`): ConsumableRow[] {
  const base = rows.filter((r) => r.order_type === source);
  let i = 0;
  return orderTypes.flatMap((ot) => base.map((r) => ({ ...r, key: keyFor(i++), order_type: ot })));
}

/** Per-card "Copy to...": replaces the target order type's rows with a copy of the source's rows; other types are untouched. */
export function copyOrderType(rows: ConsumableRow[], from: string, to: string, keyFor: (i: number) => string = (i) => `copy-${i}`): ConsumableRow[] {
  if (from === to) return rows;
  const copied = rows.filter((r) => r.order_type === from).map((r, i) => ({ ...r, key: keyFor(i), order_type: to }));
  return [...rows.filter((r) => r.order_type !== to), ...copied];
}

// ---- Import JSON ----

/** Picks the import source from pasted or uploaded text: EasAlpha's own export declares format "servio_json"; any other JSON is
 *  read as an ArfaPOS export; anything that is not JSON is treated as CSV. */
export function detectImportSource(text: string): MenuImportSource {
  const t = text.trim();
  if (!t) return "csv";
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const doc = JSON.parse(t) as unknown;
      if (doc && typeof doc === "object" && !Array.isArray(doc) && (doc as { format?: unknown }).format === "servio_json") return "servio_json";
      return "arfapos_json";
    } catch {
      return "arfapos_json";
    }
  }
  return "csv";
}

/** File name for Download Menu: servio-menu-YYYY-MM-DD.json. */
export function menuExportFileName(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `servio-menu-${y}-${m}-${d}.json`;
}

// ---- Image upload ----

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Client-side check matching the API's rules (PNG/JPG/WEBP, max 5 MB). */
export function imageProblem(file: { type: string; size: number; name?: string }): string | null {
  const ext = (file.name ?? "").toLowerCase().split(".").pop() ?? "";
  const typeOk = IMAGE_TYPES.includes(file.type) || (!file.type && ["png", "jpg", "jpeg", "webp"].includes(ext));
  if (!typeOk) return "Only PNG, JPG or WEBP images are allowed.";
  if (file.size > IMAGE_MAX_BYTES) return `The image must be 5 MB or smaller (this one is ${(file.size / 1024 / 1024).toFixed(1)} MB).`;
  return null;
}

// ---- Ordering ----

/** Moves one element to a new index, returning a new array. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const out = list.slice();
  const [it] = out.splice(from, 1);
  out.splice(to, 0, it);
  return out;
}
