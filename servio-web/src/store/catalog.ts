"use client";
import { create } from "zustand";
import { api } from "@/lib/api";
import { db, kvGet, kvSet } from "@/lib/db";
import type { Catalog, DiningTable, PaymentMethod, Shift, SyncChanges } from "@/lib/types";

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
    };
    const paymentMethods = upsert(get().paymentMethods, c.payment_methods ?? []);
    const tables = upsert(get().tables, c.tables ?? []);
    await Promise.all([kvSet("catalog", catalog), kvSet("payment_methods", paymentMethods), kvSet("tables", tables), kvSet("sync_cursor", c.cursor)]);
    set({ catalog, paymentMethods, tables, cursor: c.cursor });
  },
  setShift: (shift) => { set({ shift }); kvSet("shift", shift); },
  refreshTables: async () => {
    try { const r = await api<{ data: DiningTable[] }>("/tables", { auth: "pos" }); await kvSet("tables", r.data); set({ tables: r.data }); } catch {}
  },
}));

export async function clearTillData() {
  await Promise.all([db.kv.clear(), db.orders.clear(), db.attention.clear()]);
}
