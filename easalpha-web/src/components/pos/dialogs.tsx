"use client";
import { useEffect, useState } from "react";
import { Phone, Repeat, UserPlus } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Customer, CustomerLookup, DiningTable, Order } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { titleCase } from "@/lib/utils";
import type { CartCustomer } from "@/store/cart";
import { Badge, Button, Dialog, Field, Input, MoneyInput, Textarea, tableStatusVariant } from "@/components/ui";
import { cn } from "@/lib/utils";

export function CustomerDialog({ open, onClose, onPick, onRepeat }: { open: boolean; onClose: () => void; onPick: (c: CartCustomer) => void; onRepeat: (o: Order) => void }) {
  const [phone, setPhone] = useState("+92");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CustomerLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  useEffect(() => { if (open) { setResult(null); setError(null); setName(""); } }, [open]);
  const lookup = async () => {
    setBusy(true); setError(null);
    try { setResult(await api<CustomerLookup>("/customers/lookup", { auth: "pos", query: { phone } })); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const create = async () => {
    setBusy(true); setError(null);
    try {
      const c = await api<Customer>("/customers", { method: "POST", auth: "pos", body: { name, phone, source: "in_store" } });
      onPick({ id: c.id, name: c.name, phone: c.phone, balance_minor: c.balance_minor, credit_limit_minor: c.credit_limit_minor });
      onClose();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const c = result?.customer;
  return (
    <Dialog open={open} onClose={onClose} title="Customer" description="Look up by phone (F3). One tap repeats the last order." size="sm">
      <div className="space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); lookup(); }} className="flex gap-2">
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-12 text-lg" autoFocus />
          <Button type="submit" size="lg" loading={busy}><Phone className="h-4 w-4" /> Find</Button>
        </form>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {result && !result.found ? (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm text-fg-secondary">No customer with {result.phone}. Add them?</p>
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="h-12 text-base" />
            <Button className="w-full" size="lg" onClick={create} disabled={!name.trim()} loading={busy}><UserPlus className="h-4 w-4" /> Add customer</Button>
          </div>
        ) : null}
        {c ? (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-start justify-between">
              <div><div className="text-lg font-semibold">{c.name}</div><div className="text-sm text-fg-secondary">{c.phone}{c.khata_no ? ` · khata ${c.khata_no}` : ""}{c.member_no ? ` · roll ${c.member_no}` : ""}{c.room ? ` · room ${c.room}` : ""} · {c.orders_count} orders</div></div>
              {c.balance_minor > 0 ? <Badge variant="warning">owes {formatMoney(c.balance_minor)}</Badge> : null}
            </div>
            {c.status !== "active" ? <p className="text-sm text-danger">This customer is {c.status.replace("_", " ")}.</p> : null}
            <Button className="w-full" size="lg" onClick={() => { onPick({ id: c.id, name: c.name, phone: c.phone, balance_minor: c.balance_minor, credit_limit_minor: c.credit_limit_minor }); onClose(); }}>Use this customer</Button>
            {result?.last_order ? (
              <Button className="w-full" size="lg" variant="secondary" onClick={() => { onPick({ id: c.id, name: c.name, phone: c.phone, balance_minor: c.balance_minor, credit_limit_minor: c.credit_limit_minor }); onRepeat(result.last_order!); onClose(); }}>
                <Repeat className="h-4 w-4" /> Repeat last order · {formatMoney(result.last_order.total_minor)} · {result.last_order.items?.length} items
              </Button>
            ) : null}
          </div>
        ) : null}
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
