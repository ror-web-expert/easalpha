import { describe, expect, it } from "vitest";
import { addressFields, addressText, deliveryAddressLine, deliveryPhone, preferredAddress, zoneText } from "./delivery-address";
import type { Address, ZoneQuote } from "./types";

const addr = (over: Partial<Address> = {}): Address => ({ id: "a1", customer_id: "c1", label: null, line1: "House 12", line2: null, area: "Phase 5 DHA", city: "Lahore", lat: null, lng: null, is_default: false, text: "House 12, Phase 5 DHA, Lahore", ...over });
const quote = (charge: number | null): ZoneQuote => ({ zone: charge === null ? null : { id: "z1", branch_id: "b1", name: "DHA", areas: ["DHA"], polygon: [], charge_minor: charge, min_order_minor: 0, eta_minutes: 40, active: true, archived_at: null }, charge_minor: charge ?? 0, min_order_minor: 0, eta_minutes: 40 });

describe("the till's delivery address", () => {
  it("matches zones on the same text as the server", () => {
    expect(zoneText(addr())).toBe("Phase 5 DHA Lahore House 12");
    expect(zoneText(addr({ area: null, city: " " }))).toBe("House 12");
  });

  it("offers the order's address, else the default, else the only one", () => {
    const a = addr({ id: "a" }), b = addr({ id: "b", is_default: true }), c = addr({ id: "c" });
    expect(preferredAddress([a, b, c], "c")?.id).toBe("c");
    expect(preferredAddress([a, b, c])?.id).toBe("b");
    expect(preferredAddress([a])?.id).toBe("a");
    expect(preferredAddress([a, c])).toBeNull();
  });

  it("takes the zone's charge, keeps the cashier's own, and goes back to the default outside every zone", () => {
    expect(addressFields(addr(), quote(15_000))).toEqual({ address_id: "a1", address_text: "House 12, Phase 5 DHA, Lahore", zone_name: "DHA", delivery_charge_minor: 15_000, delivery_charge_percent: 0 });
    expect(addressFields(addr(), quote(15_000), 5_000)).toMatchObject({ delivery_charge_minor: 5_000, delivery_charge_percent: 0 });
    const outside = addressFields(addr({ area: "Kasur" }), quote(null));
    expect(outside).toMatchObject({ zone_name: null });
    expect(outside.delivery_charge_minor).toBeUndefined();
    expect(outside.delivery_charge_percent).toBeUndefined();
    expect(addressFields(addr(), null).zone_name).toBeNull(); // no answer from the quote: the default applies
  });

  it("gives the rider and the boards an address and a phone for a till customer and for a storefront guest", () => {
    expect(addressText({ line1: "Flat 3", area: "Gulberg" })).toBe("Flat 3, Gulberg");
    expect(deliveryAddressLine({ address: addr(), address_text: "ignored" })).toBe("House 12, Phase 5 DHA, Lahore");
    expect(deliveryAddressLine({ address: null, address_text: "House 9, Lahore" })).toBe("House 9, Lahore");
    expect(deliveryAddressLine({ address: null, address_text: null })).toBe("");
    expect(deliveryPhone({ customer: { id: "c", name: "Hira", phone: "+923005556677" }, phone: "+92300" })).toBe("+923005556677");
    expect(deliveryPhone({ customer: null, phone: "+923005556677" })).toBe("+923005556677");
    expect(deliveryPhone({ customer: null, phone: null })).toBeNull();
  });
});
