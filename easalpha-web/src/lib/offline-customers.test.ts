import { describe, expect, it } from "vitest";
import { afterOfflineSale, customersStale, mergeCustomers, searchCachedCustomers, toCachedCustomer, type CachedCustomer } from "@/lib/offline-customers";
import type { Customer } from "@/lib/types";

const c = (id: string, name: string, extra: Partial<CachedCustomer> = {}): CachedCustomer => toCachedCustomer({
  id, name, phone: null, khata_no: null, status: "active", is_walk_in: false, balance_minor: 0, credit_limit_minor: null, orders_count: 0, last_order_at: null,
  member_no: null, room: null, guardian_name: null, guardian_phone: null, ...extra,
} as CachedCustomer);

const list = [
  c("1", "Sadia Akhtar", { khata_no: "32", phone: "+923001807130", member_no: "R-12", room: "C-7" }),
  c("2", "Ali Raza", { khata_no: "12", phone: "+923331234567", guardian_name: "Raza Khan", guardian_phone: "+923451112233" }),
  c("3", "Hamza Ali", { khata_no: "7", member_no: "12", guardian_phone: "+923451112233" }),
  c("4", "Walk-in", { is_walk_in: true, khata_no: "1" }),
  c("5", "Aliya Noor", { email: "aliya@school.pk", company: "Beaconhouse" }),
];
const names = (q: string) => searchCachedCustomers(list, q).map((x) => x.name);

describe("offline customer search", () => {
  it("finds a khata number only with #", () => {
    expect(names("#32")).toEqual(["Sadia Akhtar"]);
    expect(names("#1")).toEqual([]); // the walk-in customer never shows
  });

  it("puts the exact khata number first, then the exact roll number, then the rest by name", () => {
    expect(names("12")).toEqual(["Ali Raza", "Hamza Ali", "Sadia Akhtar"]);
  });

  it("finds a phone typed with 0, 92 or +92, and every child on a guardian's phone", () => {
    expect(names("0300 1807130")).toEqual(["Sadia Akhtar"]);
    expect(names("923001807130")).toEqual(["Sadia Akhtar"]);
    expect(names("+92 300 180")).toEqual(["Sadia Akhtar"]);
    expect(names("0345 1112233")).toEqual(["Ali Raza", "Hamza Ali"]);
  });

  it("matches every word in the name, roll no., room, guardian, company or email, names starting with it first", () => {
    expect(names("ali")).toEqual(["Ali Raza", "Aliya Noor", "Hamza Ali"]);
    expect(names("sadia c-7")).toEqual(["Sadia Akhtar"]);
    expect(names("raza khan")).toEqual(["Ali Raza"]);
    expect(names("beaconhouse")).toEqual(["Aliya Noor"]);
    expect(names("nobody")).toEqual([]);
    expect(names("   ")).toEqual([]);
  });

  it("returns at most the limit asked for", () => {
    expect(searchCachedCustomers(list, "a", 2)).toHaveLength(2);
  });
});

describe("the saved customer list", () => {
  it("puts changed rows in, leaves walk-in and archived ones out, and drops removed ids", () => {
    const next = mergeCustomers(list.slice(0, 3), [
      { ...list[0], name: "Sadia A." } as Customer,
      { ...c("9", "New Student"), archived_at: null } as unknown as Customer,
      { ...list[1], archived_at: "2026-10-18T00:00:00Z" } as unknown as Customer,
      { ...c("10", "Walk-in"), is_walk_in: true } as Customer,
    ], ["3"]);
    expect(next.map((x) => x.name).sort()).toEqual(["New Student", "Sadia A."]);
  });

  it("adds an offline khata sale to the balance and moves the last order once it is paid", () => {
    const s = list[0];
    expect(afterOfflineSale({ ...s, balance_minor: 194_500 }, { khata_minor: 370_300, paid: true, at: "2026-10-18T02:26:00Z" })).toMatchObject({ balance_minor: 564_800, last_order_at: "2026-10-18T02:26:00Z", orders_count: 1 });
    expect(afterOfflineSale(s, { khata_minor: 0, paid: false, at: "2026-10-18T02:26:00Z" })).toMatchObject({ balance_minor: 0, last_order_at: null, orders_count: 0 });
  });

  it("downloads again when never downloaded or older than six hours", () => {
    const now = Date.parse("2026-10-18T12:00:00Z");
    expect(customersStale(null, now)).toBe(true);
    expect(customersStale("2026-10-18T07:00:00Z", now)).toBe(false);
    expect(customersStale("2026-10-18T05:00:00Z", now)).toBe(true);
  });
});
