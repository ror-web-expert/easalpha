"use client";
import { useEffect, useRef, useState } from "react";
import { Repeat, UserPlus } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Customer, CustomerLookup, DiningTable, Order } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { titleCase } from "@/lib/utils";
import type { CartCustomer } from "@/store/cart";
import { Badge, Button, Dialog, Field, Input, MoneyInput, Textarea, tableStatusVariant } from "@/components/ui";
import { cn } from "@/lib/utils";
import { customerDetails, newCustomerPrefill, toCartCustomer } from "@/lib/pos-customers";
import { CustomerSearch } from "./customer-search";

export function CustomerDialog({ open, onClose, onPick, onRepeat }: { open: boolean; onClose: () => void; onPick: (c: CartCustomer) => void; onRepeat: (o: Order) => void }) {
  // Search by name or number (CustomerSearch), then use the customer or repeat their last order; or add a new one.
  const [picked, setPicked] = useState<Customer | null>(null);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [adding, setAdding] = useState<{ name: string; phone: string; room: string; member_no: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Counts picks, so a slow lookup for an earlier pick never shows its last order on a later one.
  const pickNo = useRef(0);
  useEffect(() => { if (open) { pickNo.current++; setPicked(null); setLastOrder(null); setAdding(null); setError(null); } }, [open]);
  const choose = async (c: Customer) => {
    const n = ++pickNo.current;
    setPicked(c); setLastOrder(null); setError(null);
    // The last order (for one-tap repeat) comes with the phone lookup; a customer without a phone has none to repeat.
    if (c.phone) {
      try { const r = await api<CustomerLookup>("/customers/lookup", { auth: "pos", query: { phone: c.phone } }); if (n === pickNo.current && r.customer?.id === c.id) setLastOrder(r.last_order ?? null); } catch {}
    }
  };
  const searchAgain = () => { pickNo.current++; setPicked(null); setLastOrder(null); };
  const attach = (c: Customer) => { onPick(toCartCustomer(c)); onClose(); };
  const create = async () => {
    if (!adding) return;
    setBusy(true); setError(null);
    try {
      const phone = adding.phone.replace(/\s/g, "");
      const c = await api<Customer>("/customers", { method: "POST", auth: "pos", body: { name: adding.name.trim(), phone: phone && phone !== "+92" ? phone : null, room: adding.room.trim() || null, member_no: adding.member_no.trim() || null, source: "in_store" } });
      attach(c);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Customer" description="Pick a recent customer, search by name or number, or add a new one. One tap repeats the last order." size="md">
      <div className="space-y-4">
        {adding ? (
          <form onSubmit={(e) => { e.preventDefault(); void create(); }} className="space-y-3 rounded-lg border p-3">
            <div className="text-sm font-semibold">New customer</div>
            <Input placeholder="Name" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} className="h-12 text-base" autoFocus={!adding.name} />
            <Input type="tel" placeholder="Phone" value={adding.phone} onChange={(e) => setAdding({ ...adding, phone: e.target.value })} className="h-12 text-base" autoFocus={!!adding.name && adding.phone === "+92"} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Room" value={adding.room} onChange={(e) => setAdding({ ...adding, room: e.target.value })} className="h-12 text-base" />
              <Input placeholder="Roll / ID no." value={adding.member_no} onChange={(e) => setAdding({ ...adding, member_no: e.target.value })} className="h-12 text-base" />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="lg" onClick={() => setAdding(null)}>Back</Button>
              <Button type="submit" size="lg" className="flex-1" disabled={!adding.name.trim()} loading={busy}><UserPlus className="h-4 w-4" /> Add customer</Button>
            </div>
          </form>
        ) : picked ? (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><div className="text-lg font-semibold">{picked.name}</div><div className="text-sm text-fg-secondary">{customerDetails(picked) || "No phone"} · {picked.orders_count} orders</div></div>
              {picked.balance_minor > 0 ? <Badge variant="warning">owes {formatMoney(picked.balance_minor)}</Badge> : null}
            </div>
            {picked.status !== "active" ? <p className="text-sm text-danger">This customer is {picked.status.replace("_", " ")}.</p> : null}
            <Button className="w-full" size="lg" onClick={() => attach(picked)}>Use this customer</Button>
            {lastOrder ? (
              <Button className="w-full" size="lg" variant="secondary" onClick={() => { onPick(toCartCustomer(picked)); onRepeat(lastOrder); onClose(); }}>
                <Repeat className="h-4 w-4" /> Repeat last order · {formatMoney(lastOrder.total_minor)} · {lastOrder.items?.length} items
              </Button>
            ) : null}
            <Button className="w-full" variant="ghost" onClick={searchAgain}>Search again</Button>
          </div>
        ) : (
          <CustomerSearch autoFocus onPick={(c) => void choose(c)} onAddNew={(q) => setAdding({ ...newCustomerPrefill(q), room: "", member_no: "" })} />
        )}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </Dialog>
  );
}

export function TablePicker({ open, onClose, tables, current, onPick, onRefresh }: { open: boolean; onClose: () => void; tables: DiningTable[]; current: string | null; onPick: (t: DiningTable | null) => void; onRefresh: () => void }) {
  useEffect(() => { if (open) onRefresh(); }, [open, onRefresh]);
  return (
    <Dialog open={open} onClose={onClose} title="Pick a table" description="Occupied tables open their running order." size="lg" footer={<Button variant="secondary" onClick={() => { onPick(null); onClose(); }}>No table</Button>}>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {tables.map((t) => (
          <button key={t.id} onClick={() => { onPick(t); onClose(); }} className={cn("flex min-h-20 flex-col items-center justify-center rounded-lg border p-2", current === t.id ? "border-primary bg-primary-soft" : "bg-card hover:bg-muted")}>
            <span className="text-lg font-bold">{t.code}</span>
            <span className="text-xs text-fg-muted">{t.seats} seats</span>
            <Badge variant={tableStatusVariant(t.status)} className="mt-1">{titleCase(t.status)}</Badge>
          </button>
        ))}
        {!tables.length ? <p className="col-span-full py-8 text-center text-fg-muted">No tables set up for this branch.</p> : null}
      </div>
    </Dialog>
  );
}

export function OpenItemDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (name: string, price_minor: number) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState(0);
  useEffect(() => { if (open) { setName(""); setPrice(0); } }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title="Open item" description="An item that is not on the menu. Needs the open-item permission." size="sm" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => { onAdd(name, price); onClose(); }} disabled={!name.trim() || price <= 0}>Add</Button></>}>
      <div className="space-y-3">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} className="h-12 text-base" autoFocus /></Field>
        <Field label="Price"><MoneyInput value={price} onChange={setPrice} className="h-12 text-base" /></Field>
      </div>
    </Dialog>
  );
}

export function PriceOverrideDialog({ open, onClose, current, onSet }: { open: boolean; onClose: () => void; current: number; onSet: (price: number | null) => void }) {
  const [price, setPrice] = useState(current);
  useEffect(() => { if (open) setPrice(current); }, [open, current]);
  return (
    <Dialog open={open} onClose={onClose} title="Override price" description="A manager PIN is asked for when the order is saved." size="sm" footer={<><Button variant="secondary" onClick={() => { onSet(null); onClose(); }}>Remove override</Button><Button onClick={() => { onSet(price); onClose(); }}>Set price</Button></>}>
      <Field label="New unit price"><MoneyInput value={price} onChange={setPrice} className="h-12 text-base" autoFocus /></Field>
    </Dialog>
  );
}

export function ReasonDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", loading, presets }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => void; title: string; description?: string; confirmLabel?: string; loading?: boolean; presets?: string[] }) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} size="sm" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="destructive" loading={loading} disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</Button></>}>
      <div className="space-y-3">
        {presets?.length ? <div className="flex flex-wrap gap-2">{presets.map((p) => <button key={p} onClick={() => setReason(p)} className={cn("min-h-11 rounded-lg border px-3 text-sm", reason === p ? "border-primary bg-primary-soft" : "bg-card")}>{p}</button>)}</div> : null}
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="text-base" />
      </div>
    </Dialog>
  );
}

export function StaffMealDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title="Staff meal" description="The order total becomes zero; the cost is tracked. A manager PIN is asked for if required." size="sm" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => { onConfirm(reason.trim()); onClose(); }} disabled={!reason.trim()}>Mark as staff meal</Button></>}>
      <Field label="Who and why"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ali, lunch" className="h-12 text-base" autoFocus /></Field>
    </Dialog>
  );
}
