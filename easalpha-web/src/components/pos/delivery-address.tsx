"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Address, Customer, ZoneQuote } from "@/lib/types";
import { quoteDelivery } from "@/lib/till-extras";
import { addressFields, addressText, preferredAddress, zoneText, type AddressFields } from "@/lib/delivery-address";
import { formatMoney } from "@/lib/money";
import { useOnline } from "@/lib/hooks";
import { useCartStore, type CartCustomer } from "@/store/cart";
import { Badge, Button, Dialog, Field, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

type NewAddress = { line1: string; area: string; city: string; label: string };
const blank = (): NewAddress => ({ line1: "", area: "", city: "", label: "" });

/** "Zone DHA: delivery Rs 150, about 40 min. Minimum order Rs 500." */
export function quoteText(q: ZoneQuote | null, currency?: string): string {
  if (!q?.zone) return "No delivery zone covers this address: the standard delivery charge applies.";
  const eta = q.eta_minutes ? `, about ${q.eta_minutes} min` : "";
  const min = q.min_order_minor ? ` Minimum order ${formatMoney(q.min_order_minor, currency)}.` : "";
  return `Zone ${q.zone.name}: delivery ${formatMoney(q.charge_minor, currency)}${eta}.${min}`;
}

interface DialogProps {
  open: boolean; onClose: () => void;
  customer: CartCustomer | null; currentId: string | null; currency?: string;
  onPick: (fields: AddressFields) => void;
  onChooseCustomer: () => void;
}

/**
 * T3/F3: where a delivery goes. Lists the customer's saved addresses (the order's, else the default, picked first),
 * quotes the zone of the one picked (charge, minimum order, time) and puts it on the order with that zone's charge.
 * The charge is changed on the payment screen, as every charge is, by a role that may change charges. A new address
 * is saved on the customer. Needs the internet: offline the address goes in the order notes.
 */
export function DeliveryAddressDialog({ open, onClose, customer, currentId, currency, onPick, onChooseCustomer }: DialogProps) {
  const online = useOnline();
  const [list, setList] = useState<Address[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Address | null>(null);
  const [quote, setQuote] = useState<ZoneQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [adding, setAdding] = useState<NewAddress | null>(null);
  const [busy, setBusy] = useState(false);
  const customerId = customer?.id ?? null;
  // Read when the dialog opens, so picking an address (which changes it) does not load the list again.
  const current = useRef(currentId);
  current.current = currentId;

  useEffect(() => {
    if (!open) return;
    setList(null); setError(null); setPicked(null); setQuote(null); setAdding(null);
    if (!customerId || !online) return;
    let live = true;
    api<Customer>(`/customers/${customerId}`, { auth: "pos" })
      .then((c) => {
        if (!live) return;
        const saved = c.addresses ?? [];
        setList(saved);
        const first = preferredAddress(saved, current.current);
        if (first) setPicked(first); else setAdding(blank());
      })
      .catch((e) => { if (live) setError(errorMessage(e)); });
    return () => { live = false; };
  }, [open, customerId, online]);

  useEffect(() => {
    setQuote(null);
    if (!picked) return;
    let live = true;
    setQuoting(true);
    quoteDelivery(zoneText(picked)).then((q) => { if (live) setQuote(q); }).catch(() => {}).finally(() => { if (live) setQuoting(false); });
    return () => { live = false; };
  }, [picked]);

  const save = async () => {
    if (!adding?.line1.trim() || !customerId) return;
    setBusy(true); setError(null);
    try {
      const a = await api<Address>(`/customers/${customerId}/addresses`, { method: "POST", auth: "pos", body: { line1: adding.line1.trim(), area: adding.area.trim() || null, city: adding.city.trim() || null, label: adding.label.trim() || null, is_default: !list?.length } });
      setList([...(list ?? []), a]); setPicked(a); setAdding(null);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const use = () => { if (picked) { onPick(addressFields(picked, quote)); onClose(); } };
  const zone = quote?.zone;

  return (
    <Dialog open={open} onClose={onClose} title="Delivery address" description={customer ? `Where ${customer.name}'s order goes. The zone sets the delivery charge.` : "The address is saved on the customer."} size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={use} disabled={!picked || quoting || !!adding}>Use this address</Button></>}>
      <div className="space-y-3">
        {!customer ? (
          <div className="space-y-2">
            <p className="text-sm text-fg-secondary">Pick the customer first: their addresses are on their record.</p>
            <Button size="lg" className="w-full" onClick={onChooseCustomer}>Choose customer (F3)</Button>
          </div>
        ) : !online ? (
          <p className="text-sm text-warning-ink">Addresses need the internet. For now, write the address in the order notes.</p>
        ) : list === null && !error ? (
          <p className="text-sm text-fg-muted">Loading addresses…</p>
        ) : (
          <>
            {list?.length ? (
              <ul className="space-y-1.5" role="listbox" aria-label="Saved addresses">
                {list.map((a) => (
                  <li key={a.id}>
                    <button type="button" role="option" aria-selected={picked?.id === a.id} onClick={() => { setPicked(a); setAdding(null); }}
                      className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left", picked?.id === a.id ? "border-primary bg-primary-soft" : "bg-card hover:bg-muted")}>
                      <MapPin className="h-5 w-5 shrink-0 text-fg-muted" />
                      <span className="min-w-0 flex-1">{a.label ? <span className="block text-xs font-semibold uppercase tracking-wide text-fg-muted">{a.label}</span> : null}<span className="block truncate">{addressText(a)}</span></span>
                      {a.is_default ? <Badge>Default</Badge> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {adding ? (
              <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-2 rounded-lg border p-3">
                <div className="text-sm font-semibold">New address</div>
                <Field label="Address"><Input value={adding.line1} onChange={(e) => setAdding({ ...adding, line1: e.target.value })} placeholder="House 12, Street 4" className="h-12 text-base" autoFocus /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Area"><Input value={adding.area} onChange={(e) => setAdding({ ...adding, area: e.target.value })} placeholder="Phase 5, DHA" className="h-12 text-base" /></Field>
                  <Field label="City"><Input value={adding.city} onChange={(e) => setAdding({ ...adding, city: e.target.value })} className="h-12 text-base" /></Field>
                </div>
                <Field label="Label"><Input value={adding.label} onChange={(e) => setAdding({ ...adding, label: e.target.value })} placeholder="Home, office" className="h-12 text-base" /></Field>
                <div className="flex gap-2">
                  {list?.length ? <Button type="button" variant="secondary" onClick={() => setAdding(null)}>Back</Button> : null}
                  <Button type="submit" className="flex-1" disabled={!adding.line1.trim()} loading={busy}>Save address</Button>
                </div>
              </form>
            ) : (
              <Button variant="ghost" className="w-full" onClick={() => setAdding(blank())}><Plus className="h-4 w-4" /> Add an address</Button>
            )}
            {picked && !adding ? (
              <p className={cn("rounded-lg px-3 py-2 text-sm", zone ? "bg-info-soft text-info-ink" : "bg-muted text-fg-secondary")} role="status">
                {quoting ? "Checking the delivery zone…" : quoteText(quote, currency)}
              </p>
            ) : null}
          </>
        )}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </Dialog>
  );
}

/**
 * The address step of a delivery order at the till. `show` opens the dialog. `forCustomer` runs when a customer is
 * picked for a delivery: their usual address (the one just saved, the default, or the only one) goes on at once with
 * its zone's charge, and a customer with none gets the dialog to add one. The cart is changed only while the order
 * still has that customer and is still a delivery, so a slow answer never lands on the next order.
 */
export function useDeliveryAddress({ onChooseCustomer, currency }: { onChooseCustomer: () => void; currency?: string }) {
  const customer = useCartStore((s) => s.cart.customer);
  const currentId = useCartStore((s) => s.cart.address_id ?? null);
  const patch = useCartStore((s) => s.patch);
  const [open, setOpen] = useState(false);
  const apply = useCallback((customerId: string, fields: AddressFields) => {
    const now = useCartStore.getState().cart;
    if (now.customer?.id === customerId && now.order_type === "delivery") patch(fields);
  }, [patch]);
  const forCustomer = useCallback(async (c: Pick<CartCustomer, "id">, preferredId?: string | null) => {
    let saved: Address[];
    try { saved = (await api<Customer>(`/customers/${c.id}`, { auth: "pos" })).addresses ?? []; }
    catch { return; } // offline or unreachable: the address can be added from the order panel later
    const a = preferredAddress(saved, preferredId);
    const now = useCartStore.getState().cart;
    if (now.customer?.id !== c.id || now.order_type !== "delivery") return;
    if (!a) { setOpen(true); return; }
    const q = await quoteDelivery(zoneText(a)).catch(() => null);
    apply(c.id, addressFields(a, q));
  }, [apply]);
  const dialog = (
    <DeliveryAddressDialog open={open} onClose={() => setOpen(false)} customer={customer} currentId={currentId} currency={currency}
      onPick={(f) => { if (customer) apply(customer.id, f); }} onChooseCustomer={() => { setOpen(false); onChooseCustomer(); }} />
  );
  return { dialog, open, show: () => setOpen(true), forCustomer };
}
