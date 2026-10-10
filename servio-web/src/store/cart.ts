"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CartLine } from "@/lib/pricing";
import type { Address, OrderType, TaxChoice } from "@/lib/types";
import { uuid } from "@/lib/utils";

export interface CartCustomer { id: string; name: string; phone: string | null; balance_minor?: number; credit_limit_minor?: number | null; addresses?: Address[] }

export interface Cart {
  id: string;
  /** true once the order exists on the server (or in the local queue) */
  saved: boolean;
  local_only: boolean;
  status: string;
  order_type: OrderType;
  lines: CartLine[];
  customer: CartCustomer | null;
  table_id: string | null;
  table_code: string | null;
  guest_name: string;
  covers: number | null;
  notes: string;
  is_staff_meal: boolean;
  staff_meal_reason: string;
  label: string | null;
  client_created_at: string;
  /** Delivery orders: chosen customer address and the zone quote (editable). */
  address_id?: string | null;
  address_text?: string | null;
  delivery_charge_minor?: number;
  zone_name?: string | null;
  /** Order-level discount already applied on the server (loyalty points). */
  discount_minor?: number;
  /** SPEC reopen flow: set when the order was reopened on the server and is being edited; it must go back through payment. */
  reopened?: boolean;
  reopen_count?: number;
  /** Money already taken against this order (part payments, or the payments of a reopened order). */
  paid_minor?: number;
  /** "cash:4500,khata:2000" from the server; a reopened order pre-selects its original method from it. */
  payment_method_summary?: string | null;
  /** SPEC Charges: the cashier's per-order service / delivery charge. Undefined means the settings default applies; zero removes it. */
  service_charge_percent?: number | null;
  service_charge_fixed_minor?: number | null;
  delivery_charge_percent?: number | null;
  /** SPEC Tax: the No Tax / linked-rate choice made on the payment page (server-side; never queued offline). */
  tax_choice?: TaxChoice | null;
  tax_rate_id?: string | null;
}

const fresh = (orderType: OrderType = "walk_in"): Cart => ({
  id: uuid(), saved: false, local_only: false, status: "draft", order_type: orderType, lines: [], customer: null, table_id: null, table_code: null,
  guest_name: "", covers: null, notes: "", is_staff_meal: false, staff_meal_reason: "", label: null, client_created_at: new Date().toISOString(),
});

interface CartState {
  cart: Cart;
  defaultType: OrderType;
  reset: (orderType?: OrderType) => void;
  load: (c: Cart) => void;
  patch: (p: Partial<Cart>) => void;
  addLine: (line: Omit<CartLine, "key">) => void;
  updateLine: (key: string, p: Partial<CartLine>) => void;
  removeLine: (key: string) => void;
  setQty: (key: string, qty: number) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      cart: fresh(),
      defaultType: "walk_in",
      reset: (orderType) => set({ cart: fresh(orderType ?? get().defaultType) }),
      load: (cart) => set({ cart }),
      patch: (p) => set({ cart: { ...get().cart, ...p } }),
      addLine: (line) => {
        const cart = get().cart;
        // Merge with an identical unsent line (same product/variant, no notes, same modifiers)
        const same = cart.lines.find((l) => !l.sent && !l.open_item && l.product_id && l.product_id === line.product_id && (l.variant_id ?? null) === (line.variant_id ?? null) && !l.notes && !line.notes && !l.price_override_minor && !line.price_override_minor && JSON.stringify(l.modifiers) === JSON.stringify(line.modifiers));
        if (same) return set({ cart: { ...cart, lines: cart.lines.map((l) => (l === same ? { ...l, quantity: l.quantity + line.quantity } : l)) } });
        set({ cart: { ...cart, lines: [...cart.lines, { ...line, key: uuid() }] } });
      },
      updateLine: (key, p) => set({ cart: { ...get().cart, lines: get().cart.lines.map((l) => (l.key === key ? { ...l, ...p } : l)) } }),
      removeLine: (key) => set({ cart: { ...get().cart, lines: get().cart.lines.filter((l) => l.key !== key) } }),
      setQty: (key, qty) => {
        if (qty <= 0) return get().removeLine(key);
        set({ cart: { ...get().cart, lines: get().cart.lines.map((l) => (l.key === key ? { ...l, quantity: qty } : l)) } });
      },
    }),
    { name: "servio.cart", storage: createJSONStorage(() => localStorage), skipHydration: true },
  ),
);
