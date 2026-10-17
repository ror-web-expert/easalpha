"use client";
// The till's saved customer list (offline-customers.ts), in memory for instant search and in IndexedDB so it survives
// a restart with no internet.
import { create } from "zustand";
import { api } from "@/lib/api";
import { db, kvGet, kvSet } from "@/lib/db";
import { afterOfflineSale, customersStale, mergeCustomers, toCachedCustomer, type CachedCustomer } from "@/lib/offline-customers";
import type { Customer } from "@/lib/types";

interface CustomersState {
  list: CachedCustomer[];
  byId: Map<string, CachedCustomer>;
  loaded: boolean;
  /** When the whole list was last downloaded. */
  syncedAt: string | null;
  downloading: boolean;
  load: () => Promise<void>;
  /** Downloads every customer again (GET /sync/customers, page by page) and replaces the saved copy. */
  download: () => Promise<void>;
  downloadIfStale: () => Promise<void>;
  /** Rows from /sync/changes: changed customers in, archived ones out. */
  apply: (changed: readonly Customer[] | undefined, removedIds?: readonly string[]) => Promise<void>;
  /** A sale finished offline for this customer: its khata and last order, until the server's own figures arrive. */
  noteSale: (id: string, sale: { khata_minor: number; paid: boolean; at: string }) => Promise<void>;
  clear: () => Promise<void>;
}

const index = (list: CachedCustomer[]) => new Map(list.map((c) => [c.id, c]));

export const useCustomerStore = create<CustomersState>((set, get) => ({
  list: [],
  byId: new Map(),
  loaded: false,
  syncedAt: null,
  downloading: false,
  load: async () => {
    try {
      const [list, syncedAt] = await Promise.all([db.customers.toArray(), kvGet<string>("customers_synced_at")]);
      set({ list, byId: index(list), syncedAt: syncedAt ?? null, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  download: async () => {
    if (get().downloading) return;
    set({ downloading: true });
    try {
      const rows: CachedCustomer[] = [];
      let after: string | null = null;
      for (let page = 0; page < 200; page++) {
        const res: { data: Customer[]; next_after: string | null } = await api("/sync/customers", { auth: "pos", query: after ? { after } : {}, timeoutMs: 60000 });
        rows.push(...res.data.filter((c) => !c.is_walk_in).map(toCachedCustomer));
        after = res.next_after;
        if (!after) break;
      }
      const syncedAt = new Date().toISOString();
      await db.transaction("rw", db.customers, async () => { await db.customers.clear(); await db.customers.bulkPut(rows); });
      await kvSet("customers_synced_at", syncedAt);
      set({ list: rows, byId: index(rows), syncedAt });
    } finally {
      set({ downloading: false });
    }
  },
  downloadIfStale: async () => {
    if (!get().loaded) await get().load();
    if (customersStale(get().syncedAt)) await get().download().catch(() => {});
  },
  apply: async (changed, removedIds = []) => {
    if (!changed?.length && !removedIds.length) return;
    if (!get().loaded) await get().load();
    const list = mergeCustomers(get().list, changed ?? [], removedIds);
    set({ list, byId: index(list) });
    try {
      const keep = new Set(list.map((c) => c.id));
      const gone = [...(changed ?? []).map((c) => c.id), ...removedIds].filter((id) => !keep.has(id));
      await db.transaction("rw", db.customers, async () => {
        if (gone.length) await db.customers.bulkDelete(gone);
        await db.customers.bulkPut((changed ?? []).filter((c) => keep.has(c.id)).map((c) => get().byId.get(c.id)!));
      });
    } catch {}
  },
  noteSale: async (id, sale) => {
    const c = get().byId.get(id);
    if (!c) return;
    const next = afterOfflineSale(c, sale);
    const list = get().list.map((x) => (x.id === id ? next : x));
    set({ list, byId: index(list) });
    try { await db.customers.put(next); } catch {}
  },
  clear: async () => {
    set({ list: [], byId: new Map(), syncedAt: null });
    try { await db.customers.clear(); await kvSet("customers_synced_at", null); } catch {}
  },
}));
