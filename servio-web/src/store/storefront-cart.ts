"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { EMPTY_CUSTOMER, lineKey, type StorefrontCartLine, type StorefrontCustomer, type StorefrontOrderType } from "@/components/store/cart-helpers";

// The guest's cart on the public storefront (/store/:slug). Persisted in localStorage under servio.store.cart so a
// refresh keeps the basket, the customer details and the last order's guest token for tracking. One cart at a time:
// opening a different store's slug starts a fresh basket.

export interface StorefrontLastOrder { id: string; guest_token: string }

export interface StorefrontCartState {
  slug: string | null;
  lines: StorefrontCartLine[];
  order_type: StorefrontOrderType;
  customer: StorefrontCustomer;
  notes: string;
  lastOrder: StorefrontLastOrder | null;
  hydrated: boolean;
  /** Bind the cart to a store. A different slug resets the lines and the last order (they belong to another store). */
  setSlug: (slug: string) => void;
  add: (line: Omit<StorefrontCartLine, "key" | "quantity">, quantity?: number) => void;
  increment: (key: string) => void;
  /** Decrement to zero removes the line. */
  decrement: (key: string) => void;
  remove: (key: string) => void;
  /** Empties the lines only; customer details, order type and the last order are kept. */
  clear: () => void;
  setCustomer: (patch: Partial<StorefrontCustomer>) => void;
  setOrderType: (t: StorefrontOrderType) => void;
  setNotes: (notes: string) => void;
  setLastOrder: (o: StorefrontLastOrder | null) => void;
}

export const useStorefrontCart = create<StorefrontCartState>()(
  persist(
    (set) => ({
      slug: null,
      lines: [],
      order_type: "delivery",
      customer: { ...EMPTY_CUSTOMER },
      notes: "",
      lastOrder: null,
      hydrated: false,
      setSlug: (slug) => set((s) => (s.slug === slug ? {} : { slug, lines: [], lastOrder: null, notes: "" })),
      add: (line, quantity = 1) =>
        set((s) => {
          const key = lineKey(line.product_id, line.variant_id);
          const existing = s.lines.find((l) => l.key === key);
          if (existing) return { lines: s.lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l)) };
          return { lines: [...s.lines, { ...line, key, quantity }] };
        }),
      increment: (key) => set((s) => ({ lines: s.lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l)) })),
      decrement: (key) => set((s) => ({ lines: s.lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity - 1 } : l)).filter((l) => l.quantity > 0) })),
      remove: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),
      clear: () => set({ lines: [] }),
      setCustomer: (patch) => set((s) => ({ customer: { ...s.customer, ...patch } })),
      setOrderType: (order_type) => set({ order_type }),
      setNotes: (notes) => set({ notes }),
      setLastOrder: (lastOrder) => set({ lastOrder }),
    }),
    {
      name: "servio.store.cart",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ slug: s.slug, lines: s.lines, order_type: s.order_type, customer: s.customer, notes: s.notes, lastOrder: s.lastOrder }),
      onRehydrateStorage: () => () => useStorefrontCart.setState({ hydrated: true }),
    },
  ),
);
