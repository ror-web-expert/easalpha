"use client";
import { create } from "zustand";
import { api } from "@/lib/api";
import { db, kvGet, kvSet } from "@/lib/db";
import type { Catalog, DiningTable, PaymentMethod, Shift, SyncChanges } from "@/lib/types";
import { useCustomerStore } from "@/store/customers";

interface CatalogState {
  catalog: Catalog | null;
  paymentMethods: PaymentMethod[];
  tables: DiningTable[];
  shift: Shift | null;
  loaded: boolean;
  cursor: string | null;
  loadLocal: () => Promise<void>;
  refresh: () => Promise<void>;
  applyChanges: (c: SyncChanges) => Promise<void>;
  setShift: (s: Shift | null) => void;
  refreshTables: () => Promise<void>;
}

function upsert<T extends { id: string }>(list: T[], changes: T[]): T[] {
  const map = new Map(list.map((x) => [x.id, x]));
  changes.forEach((c) => map.set(c.id, c));
  return [...map.values()];
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  catalog: null,
  paymentMethods: [],
  tables: [],
  shift: null,
  loaded: false,
  cursor: null,
  loadLocal: async () => {
    const [catalog, paymentMethods, tables, shift, cursor] = await Promise.all([
      kvGet<Catalog>("catalog"), kvGet<PaymentMethod[]>("payment_methods"), kvGet<DiningTable[]>("tables"), kvGet<Shift | null>("shift"), kvGet<string>("sync_cursor"),
    ]);
    set({ catalog: catalog ?? null, paymentMethods: paymentMethods ?? [], tables: tables ?? [], shift: shift ?? null, cursor: cursor ?? null, loaded: true });
  },
  refresh: async () => {
    const [catalog, pm, tables] = await Promise.all([
      api<Catalog>("/catalog", { auth: "pos" }),
      api<{ data: PaymentMethod[] }>("/payment_methods", { auth: "pos" }).catch(() => ({ data: get().paymentMethods })),
      api<{ data: DiningTable[] }>("/tables", { auth: "pos" }).catch(() => ({ data: get().tables })),
    ]);
    const cursor = catalog.generated_at ?? new Date().toISOString();
    await Promise.all([kvSet("catalog", catalog), kvSet("payment_methods", pm.data), kvSet("tables", tables.data), kvSet("sync_cursor", cursor)]);
    set({ catalog, paymentMethods: pm.data, tables: tables.data, cursor, loaded: true });
    // The catalog carries no customers: fetch the whole list for the offline search, without holding up the till.
    void useCustomerStore.getState().download().catch(() => {});
  },
  applyChanges: async (c) => {
    const cur = get().catalog;
    if (!cur) return;
    const catalog: Catalog = {
      ...cur,
      business: { ...cur.business, settings: c.settings ?? cur.business.settings },
      branch: c.branch ?? cur.branch,
      menus: upsert(cur.menus, c.menus ?? []),
      categories: upsert(cur.categories, c.categories ?? []),
      products: upsert(cur.products, c.products ?? []),
      modifier_groups: upsert(cur.modifier_groups, c.modifier_groups ?? []),
      deals: upsert(cur.deals, c.deals ?? []),
      promotions: upsert(cur.promotions, c.promotions ?? []),
      tax_rates: upsert(cur.tax_rates, c.tax_rates ?? []),
      stations: upsert(cur.stations, c.stations ?? []),
      // SPEC "Quick Add Menu": the API always sends the whole (short) list, so the latest payload replaces it.
      quick_add_items: c.quick_add_items ?? cur.quick_add_items ?? [],
      // The same for the regular discount tiers (an older API sends none: keep what the till has).
      regular_discount_tiers: c.regular_discount_tiers ?? cur.regular_discount_tiers ?? [],
    };
    const paymentMethods = upsert(get().paymentMethods, c.payment_methods ?? []);
    const tables = upsert(get().tables, c.tables ?? []);
    await Promise.all([kvSet("catalog", catalog), kvSet("payment_methods", paymentMethods), kvSet("tables", tables), kvSet("sync_cursor", c.cursor)]);
    set({ catalog, paymentMethods, tables, cursor: c.cursor });
    // Customers changed since the cursor (balances, new students) keep the offline search current.
    await useCustomerStore.getState().apply(c.customers, c.archived_customer_ids ?? []);
    // A canteen kiosk keeps the day's plans, the workers and the claims for the counter without internet.
    if (c.canteen) await kvSet("canteen_sync", c.canteen);
  },
  setShift: (shift) => { set({ shift }); kvSet("shift", shift); },
  refreshTables: async () => {
    try { const r = await api<{ data: DiningTable[] }>("/tables", { auth: "pos" }); await kvSet("tables", r.data); set({ tables: r.data }); } catch {}
  },
}));

/** Everything this browser holds for a till, including the sync queue: a new pairing starts clean (confirmDiscardUnsynced first). */
export async function clearTillData() {
  await Promise.all([db.kv.clear(), db.orders.clear(), db.queue.clear(), db.attention.clear(), useCustomerStore.getState().clear()]);
}
