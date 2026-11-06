// The address and zone of a delivery order at the till (T3/F3, final round of 6 Nov 2026). Pure, so the till, the
// rider app and the boards share it; tested in delivery-address.test.ts.
import type { Address, Delivery, ZoneQuote } from "@/lib/types";
import type { Cart } from "@/store/cart";

/** What a zone is matched against, as the server matches it (Deliveries::Manager.zone_text): area, city, first line. */
export function zoneText(a: Pick<Address, "area" | "city" | "line1">): string {
  return [a.area, a.city, a.line1].map((v) => (v ?? "").trim()).filter(Boolean).join(" ");
}

/** The address on one line: the server's text when it sent one, else its parts. */
export function addressText(a: Partial<Pick<Address, "text" | "line1" | "line2" | "area" | "city">>): string {
  if (a.text?.trim()) return a.text.trim();
  return [a.line1, a.line2, a.area, a.city].map((v) => (v ?? "").trim()).filter(Boolean).join(", ");
}

/** The address the till offers first: the one on the order, else the customer's default, else their only one. */
export function preferredAddress(list: Address[], currentId?: string | null): Address | null {
  return list.find((a) => a.id === currentId) ?? list.find((a) => a.is_default) ?? (list.length === 1 ? list[0] : null);
}

export type AddressFields = Pick<Cart, "address_id" | "address_text" | "zone_name" | "delivery_charge_minor" | "delivery_charge_percent">;

/**
 * The cart fields for a picked address. The cashier's own charge wins (only a role that may change charges is offered
 * one); else a zone's charge; else the settings default again, so a charge quoted for an earlier address never
 * stays on one outside every zone.
 */
export function addressFields(a: Address, quote: ZoneQuote | null, chargeMinor?: number | null): AddressFields {
  const base = { address_id: a.id, address_text: addressText(a), zone_name: quote?.zone?.name ?? null };
  const charge = chargeMinor ?? (quote?.zone ? quote.charge_minor : null);
  if (charge == null) return { ...base, delivery_charge_minor: undefined, delivery_charge_percent: undefined };
  return { ...base, delivery_charge_minor: Math.max(0, Math.round(charge)), delivery_charge_percent: 0 };
}

/** A new customer on the order: the previous customer's address goes with them. */
export const NO_ADDRESS: Pick<Cart, "address_id" | "address_text" | "zone_name"> = { address_id: null, address_text: null, zone_name: null };

/** An address a website guest typed: on the order, with no saved address behind it. */
export const typedAddress = (cart: Pick<Cart, "address_id" | "address_text">) => !cart.address_id && !!cart.address_text;

/**
 * What putting a customer on the order takes off it: the previous customer's saved address. The address a website
 * guest typed stays, since it is where this order goes whoever it is put on.
 */
export function afterCustomerChange(cart: Pick<Cart, "customer" | "address_id" | "address_text">, customerId: string): Partial<Cart> {
  return cart.customer?.id === customerId || typedAddress(cart) ? {} : NO_ADDRESS;
}

/** Where a delivery goes, for the rider and the boards: the saved address, else what a storefront guest typed. */
export function deliveryAddressLine(d: Pick<Delivery, "address" | "address_text">): string {
  return (d.address ? addressText(d.address) : "") || (d.address_text ?? "").trim();
}

/** Whom to call: the customer's phone, else the storefront guest's. */
export function deliveryPhone(d: Pick<Delivery, "customer" | "phone">): string | null {
  return d.customer?.phone || d.phone || null;
}
