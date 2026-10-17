// The customers saved on the till, so the customer search keeps working with no internet (a canteen or hostel till
// looks students up by name, roll no., room or a guardian's phone all day). The list comes from GET /sync/customers
// once, then /sync/changes keeps it current. Search follows Customers::Search on the server, so a name or number
// finds the same people offline as online.
import type { Customer } from "@/lib/types";

export type CachedCustomer = Pick<Customer, "id" | "name" | "phone" | "khata_no" | "status" | "is_walk_in" | "balance_minor" | "credit_limit_minor" | "orders_count" | "last_order_at"> &
  Pick<Customer, "member_no" | "room" | "guardian_name" | "guardian_phone"> & { company?: string | null; email?: string | null };

/** The fields the till keeps from a customer row (the rest stays on the server). */
export function toCachedCustomer(c: Customer | CachedCustomer): CachedCustomer {
  return {
    id: c.id, name: c.name, phone: c.phone ?? null, khata_no: c.khata_no ?? null, status: c.status ?? "active", is_walk_in: !!c.is_walk_in,
    balance_minor: c.balance_minor ?? 0, credit_limit_minor: c.credit_limit_minor ?? null, orders_count: c.orders_count ?? 0, last_order_at: c.last_order_at ?? null,
    member_no: c.member_no ?? null, room: c.room ?? null, guardian_name: c.guardian_name ?? null, guardian_phone: c.guardian_phone ?? null,
    company: c.company ?? null, email: c.email ?? null,
  };
}

const TEXT_FIELDS = ["name", "member_no", "room", "guardian_name", "company", "email"] as const;

const isNumber = (q: string) => /^[+\d\s\-()]+$/.test(q) && /\d/.test(q);
const khataLike = (q: string, digits: string) => digits.length <= 7 && !q.startsWith("0") && !q.startsWith("+");
/** 03001234567, 923001234567 and +923001234567 all become 3001234567, as phones are stored +92... */
const localDigits = (digits: string) => digits.replace(/^(?:92|0)/, "");
const lower = (v: unknown) => (v === null || v === undefined ? "" : String(v).toLowerCase());
const khataIs = (c: CachedCustomer, k: number | null) => k !== null && c.khata_no !== null && c.khata_no !== undefined && Number(c.khata_no) === k;

/**
 * Customers::Search.call on the saved list:
 *   "#12"        khata no. 12 only
 *   "12", "345"  khata no. (exact), roll no., or a phone or guardian phone containing the digits
 *   "0300 12"    a phone or guardian phone containing it (typed with or without 0, 92 or +92), or a roll no.
 *   "ali c-7"    every word in the name, roll no., room, guardian, company or email
 * Exact khata and roll numbers first, then names starting with what was typed, then the rest by name. Walk-in never.
 */
export function searchCachedCustomers(list: readonly CachedCustomer[], raw: string, limit = 8): CachedCustomer[] {
  const q = raw.trim();
  if (!q) return [];
  const digits = q.replace(/\D/g, "");
  const pool = list.filter((c) => !c.is_walk_in);
  const lq = q.toLowerCase();
  let found: CachedCustomer[];
  let rank: (c: CachedCustomer) => number;
  if (/^#\s*\d+$/.test(q)) {
    const k = parseInt(digits, 10);
    found = pool.filter((c) => khataIs(c, k));
    rank = () => 0;
  } else if (isNumber(q)) {
    const k = khataLike(q, digits) ? parseInt(digits, 10) : null;
    const local = localDigits(digits);
    found = pool.filter((c) => lower(c.member_no).includes(lq) || khataIs(c, k) || (local.length >= 3 && (lower(c.phone).includes(local) || lower(c.guardian_phone).includes(local))));
    rank = (c) => (khataIs(c, k) ? 0 : lower(c.member_no) === lq ? 1 : 2);
  } else {
    const words = q.split(/\s+/).slice(0, 5).map((w) => w.toLowerCase());
    found = pool.filter((c) => words.every((w) => TEXT_FIELDS.some((f) => lower(c[f]).includes(w))));
    rank = (c) => (lower(c.member_no) === lq ? 0 : lower(c.name).startsWith(lq) ? 1 : 2);
  }
  const n = Math.min(25, Math.max(1, Math.round(limit) || 8));
  return found.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, n);
}

/** The saved copy with the changed rows put in (and walk-in rows left out) and the archived ones taken out. */
export function mergeCustomers(list: readonly CachedCustomer[], changed: readonly (Customer | CachedCustomer)[], removedIds: readonly string[] = []): CachedCustomer[] {
  const map = new Map(list.map((c) => [c.id, c]));
  for (const c of changed) {
    if (c.is_walk_in || (c as Customer).archived_at) map.delete(c.id);
    else map.set(c.id, toCachedCustomer(c));
  }
  removedIds.forEach((id) => map.delete(id));
  return [...map.values()];
}

/** A sale finished offline: what it adds to the customer's khata, and their last order, as the server will record them. */
export function afterOfflineSale(c: CachedCustomer, sale: { khata_minor: number; paid: boolean; at: string }): CachedCustomer {
  return { ...c, balance_minor: (c.balance_minor ?? 0) + Math.max(0, sale.khata_minor), ...(sale.paid ? { last_order_at: sale.at, orders_count: (c.orders_count ?? 0) + 1 } : {}) };
}

/** Download again after this long, so balances and recency changed on other tills catch up even without /sync/changes. */
export const CUSTOMERS_REFRESH_MS = 6 * 60 * 60_000;

export function customersStale(syncedAt: string | null | undefined, now = Date.now()): boolean {
  const t = syncedAt ? Date.parse(syncedAt) : NaN;
  return !Number.isFinite(t) || now - t > CUSTOMERS_REFRESH_MS;
}
