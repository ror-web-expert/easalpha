"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { BadgeVariant } from "@/components/ui";
import type { DeductionAuditStatus, Page, PaymentMethod, PurchaseLineInput, StockItem, Supplier, Unit } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { unitsOfKind } from "@/lib/units";
import { uuid, cn } from "@/lib/utils";
import { useList, useSave } from "@/components/admin/crud";
import { ItemPicker } from "@/components/admin/stock";
import { Button, Dialog, Field, Input, MoneyInput, Select, Textarea } from "@/components/ui";

// ---- Badges ----
export function poStatusVariant(status: string | null | undefined): BadgeVariant {
  switch (status) {
    case "draft": return "neutral";
    case "sent": return "info";
    case "partial": return "warning";
    case "received": return "success";
    case "cancelled": return "danger";
    default: return "neutral";
  }
}
export function postedStatusVariant(status: string | null | undefined): BadgeVariant {
  return status === "posted" ? "success" : status === "cancelled" ? "danger" : "neutral";
}
export function auditStatusVariant(status: DeductionAuditStatus | string | null | undefined): BadgeVariant {
  switch (status) {
    case "ok": return "success";
    case "partial": case "skipped": return "warning";
    case "missing": case "error": return "danger";
    case "reversed": return "info";
    case "waste": return "accent";
    default: return "neutral";
  }
}
export const PO_STATUSES = ["draft", "sent", "partial", "received", "cancelled"] as const;
export const AUDIT_STATUSES: DeductionAuditStatus[] = ["ok", "missing", "partial", "reversed", "waste", "skipped", "error"];

// ---- Lookups ----
/** Every active supplier (first 200) for pickers and name lookups. */
export function useAllSuppliers() {
  return useQuery({ queryKey: ["suppliers_all"], queryFn: () => api<Page<Supplier>>("/suppliers", { query: { limit: 200 } }), select: (r) => r.data });
}
export function usePaymentMethods() { return useList<PaymentMethod>("payment_methods", "/payment_methods"); }

export function SupplierSelect({ value, onChange, className, disabled, autoFocus }: { value: string; onChange: (id: string, supplier: Supplier | null) => void; className?: string; disabled?: boolean; autoFocus?: boolean }) {
  const suppliers = useAllSuppliers();
  return (
    <Select className={className} value={value} disabled={disabled} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value, suppliers.data?.find((s) => s.id === e.target.value) ?? null)}>
      <option value="">{suppliers.isLoading ? "Loading…" : "Choose supplier…"}</option>
      {suppliers.data?.map((s) => <option key={s.id} value={s.id}>{s.name}{s.balance_minor ? ` (${formatMoney(s.balance_minor)})` : ""}</option>)}
    </Select>
  );
}

// ---- Supplier create / edit dialog ----
export interface SupplierForm { id?: string; name: string; contact_name: string; phone: string; email: string; address: string; ntn: string; payment_terms_days: string; opening_balance_minor: number; notes: string }
const blankSupplier: SupplierForm = { name: "", contact_name: "", phone: "", email: "", address: "", ntn: "", payment_terms_days: "0", opening_balance_minor: 0, notes: "" };
export function supplierToForm(s: Supplier): SupplierForm {
  return { id: s.id, name: s.name, contact_name: s.contact_name ?? "", phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "", ntn: s.ntn ?? "", payment_terms_days: String(s.payment_terms_days ?? 0), opening_balance_minor: s.opening_balance_minor, notes: s.notes ?? "" };
}

/** Pass `supplier` as null to keep closed, "new" to create, or a Supplier to edit. */
export function SupplierDialog({ supplier, onClose, onSaved }: { supplier: Supplier | "new" | null; onClose: () => void; onSaved?: (s: Supplier) => void }) {
  const [form, setForm] = useState<SupplierForm>(blankSupplier);
  useEffect(() => { if (supplier === "new") setForm(blankSupplier); else if (supplier) setForm(supplierToForm(supplier)); }, [supplier]);
  const save = useSave<Record<string, unknown>, Supplier>(["suppliers", "suppliers_all", "supplier", "purchasing_summary", "purchasing_aging"], (f) => (f.id ? `/suppliers/${f.id}` : "/suppliers"), {
    success: supplier === "new" ? "Supplier added" : "Supplier saved", onSuccess: (s) => { onSaved?.(s); onClose(); },
  });
  const set = <K extends keyof SupplierForm>(k: K, v: SupplierForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const submit = () => save.mutate({
    id: form.id, name: form.name.trim(), contact_name: form.contact_name || null, phone: form.phone || null, email: form.email || null, address: form.address || null, ntn: form.ntn || null,
    payment_terms_days: Number(form.payment_terms_days) || 0, notes: form.notes || null, ...(form.id ? {} : { opening_balance_minor: form.opening_balance_minor }),
  });
  return (
    <Dialog open={!!supplier} onClose={onClose} title={supplier === "new" ? "New supplier" : "Edit supplier"} description="A positive balance is what you owe the supplier."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={save.isPending} disabled={!form.name.trim()}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2"><Input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
        <Field label="Contact person"><Input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} /></Field>
        <Field label="Phone"><Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0300 1234567" /></Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="NTN"><Input className="font-mono" value={form.ntn} onChange={(e) => set("ntn", e.target.value)} /></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
        <Field label="Payment terms (days)" hint="0 = pay on delivery"><Input type="number" inputMode="numeric" min={0} className="tabular" value={form.payment_terms_days} onChange={(e) => set("payment_terms_days", e.target.value)} /></Field>
        {supplier === "new" ? <Field label="Opening balance" hint="What you already owe them"><MoneyInput value={form.opening_balance_minor} onChange={(v) => set("opening_balance_minor", v)} /></Field> : null}
        <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}

// ---- Supplier payment dialog ----
export interface PaymentForm { amount_minor: number; method_code: string; reference: string; direction: "paid" | "received"; note: string }
export function SupplierPaymentDialog({ supplier, open, onClose }: { supplier: Supplier; open: boolean; onClose: () => void }) {
  const methods = usePaymentMethods();
  const [form, setForm] = useState<PaymentForm>({ amount_minor: 0, method_code: "", reference: "", direction: "paid", note: "" });
  useEffect(() => { if (open) setForm({ amount_minor: Math.max(0, supplier.balance_minor), method_code: "", reference: "", direction: "paid", note: "" }); }, [open, supplier.balance_minor]);
  const usable = useMemo(() => methods.data?.filter((m) => m.active && m.kind !== "khata") ?? [], [methods.data]);
  useEffect(() => { if (open && !form.method_code && usable.length) setForm((f) => ({ ...f, method_code: usable.find((m) => m.kind === "cash")?.code ?? usable[0].code })); }, [open, usable, form.method_code]);
  const save = useSave<PaymentForm & { id?: string }>(["supplier", "supplier_ledger", "supplier_payments", "suppliers", "suppliers_all", "purchasing_summary", "purchasing_aging", "supplier_insights"], () => `/suppliers/${supplier.id}/payments`, { success: "Payment recorded", onSuccess: onClose });
  const method = usable.find((m) => m.code === form.method_code);
  return (
    <Dialog open={open} onClose={onClose} title={`Pay ${supplier.name}`} description={`Balance ${formatMoney(supplier.balance_minor)}`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={form.amount_minor <= 0 || !form.method_code} onClick={() => save.mutate({ ...form, reference: form.reference || (null as unknown as string), note: form.note || (null as unknown as string) })}>Record {form.direction === "paid" ? "payment" : "receipt"}</Button></>}>
      <div className="space-y-3">
        <Field label="Direction"><Select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as "paid" | "received" })}><option value="paid">Paid to supplier</option><option value="received">Received from supplier</option></Select></Field>
        <Field label="Amount"><MoneyInput value={form.amount_minor} onChange={(v) => setForm({ ...form, amount_minor: v })} autoFocus /></Field>
        <Field label="Method"><Select value={form.method_code} onChange={(e) => setForm({ ...form, method_code: e.target.value })}>{usable.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select></Field>
        <Field label={method?.needs_reference ? "Reference (required by this method)" : "Reference"}><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Cheque no, transaction id" /></Field>
        <Field label="Note"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

// ---- Purchase line editor (orders, receipts, returns) ----
export interface PurchaseLine { key: string; item: StockItem | null; unit_id: string; quantity: string; unit_cost_minor: number; cost_touched: boolean; batch_no: string; expires_on: string }
export const newPurchaseLine = (partial: Partial<PurchaseLine> = {}): PurchaseLine => ({ key: uuid(), item: null, unit_id: "", quantity: "", unit_cost_minor: 0, cost_touched: false, batch_no: "", expires_on: "", ...partial });

export function purchaseLineTotal(l: PurchaseLine): number { return l.item ? Math.round(l.unit_cost_minor * (Number(l.quantity) || 0)) : 0; }
export function purchaseLinesTotal(lines: PurchaseLine[]): number { return lines.reduce((a, l) => a + purchaseLineTotal(l), 0); }
/** Lines with an item, as the API expects. `unit_cost_minor` is omitted when the user never typed one so the API can prefill from price history. */
export function purchaseLinesToInput(lines: PurchaseLine[], opts: { batch?: boolean } = {}): PurchaseLineInput[] {
  return lines.filter((l) => l.item && l.quantity !== "").map((l) => ({
    stock_item_id: l.item!.id, unit_id: l.unit_id || undefined, quantity: l.quantity, unit_cost_minor: l.cost_touched || l.unit_cost_minor ? l.unit_cost_minor : undefined,
    ...(opts.batch ? { batch_no: l.batch_no || null, expires_on: l.expires_on || null } : {}),
  }));
}

/** Average cost per chosen unit from the item's average per base unit. */
export function avgCostForUnit(item: StockItem, unit: Pick<Unit, "factor_to_base"> | null | undefined): number {
  const perBase = Number(item.avg_cost_minor_per_base ?? 0);
  return Math.round(perBase * Number(unit?.factor_to_base ?? 1));
}

export function PurchaseLineEditor({ lines, onChange, units, showCost = true, showBatch = false, costHint, onPickItem, className }: {
  lines: PurchaseLine[]; onChange: (lines: PurchaseLine[]) => void; units: Unit[] | undefined; showCost?: boolean; showBatch?: boolean;
  /** Optional cost shown under a line (e.g. "Last paid Rs 520 / kg"). */
  costHint?: (line: PurchaseLine, unit: Unit | undefined) => React.ReactNode;
  /** Override what happens on pick; default picks the purchase unit and prefills the average cost. */
  onPickItem?: (line: PurchaseLine, item: StockItem) => Partial<PurchaseLine>;
  className?: string;
}) {
  const setLine = (key: string, patch: Partial<PurchaseLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pick = (l: PurchaseLine, item: StockItem) => {
    const unit = item.purchase_unit ?? item.base_unit;
    const base: Partial<PurchaseLine> = { item, unit_id: unit.id, unit_cost_minor: l.cost_touched ? l.unit_cost_minor : avgCostForUnit(item, unit) };
    setLine(l.key, { ...base, ...(onPickItem ? onPickItem(l, item) : {}) });
  };
  const cols = cn("grid items-end gap-2", showCost && showBatch ? "sm:grid-cols-[1fr_90px_110px_130px_110px_130px_40px]" : showCost ? "sm:grid-cols-[1fr_100px_120px_140px_40px]" : "sm:grid-cols-[1fr_110px_120px_40px]");
  return (
    <div className={cn("space-y-3", className)}>
      {lines.map((l, idx) => {
        const kindUnits = unitsOfKind(units, l.item?.base_unit.kind);
        const unit = kindUnits.find((u) => u.id === l.unit_id) ?? l.item?.base_unit;
        const total = purchaseLineTotal(l);
        return (
          <div key={l.key} className="rounded-md border p-3">
            <div className={cols}>
              <Field label={idx === 0 ? "Item" : undefined}><ItemPicker value={l.item} onPick={(it) => pick(l, it)} autoFocus={idx === lines.length - 1 && !l.item && idx > 0} /></Field>
              <Field label={idx === 0 ? "Unit" : undefined}>
                <Select value={l.unit_id} disabled={!l.item} onChange={(e) => {
                  const nu = kindUnits.find((u) => u.id === e.target.value);
                  setLine(l.key, { unit_id: e.target.value, unit_cost_minor: l.cost_touched || !l.item || !nu ? l.unit_cost_minor : avgCostForUnit(l.item, nu) });
                }}>
                  {l.item ? kindUnits.map((u) => <option key={u.id} value={u.id}>{u.code}</option>) : <option value="">-</option>}
                </Select>
              </Field>
              <Field label={idx === 0 ? "Quantity" : undefined}><Input type="number" inputMode="decimal" min={0} step="any" className="tabular" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} disabled={!l.item} /></Field>
              {showCost ? <Field label={idx === 0 ? `Cost per ${unit?.code ?? "unit"}` : undefined}><MoneyInput value={l.unit_cost_minor} onChange={(v) => setLine(l.key, { unit_cost_minor: v, cost_touched: true })} disabled={!l.item} /></Field> : null}
              {showBatch ? <Field label={idx === 0 ? "Batch no" : undefined}><Input value={l.batch_no} onChange={(e) => setLine(l.key, { batch_no: e.target.value })} disabled={!l.item} /></Field> : null}
              {showBatch ? <Field label={idx === 0 ? "Expires" : undefined}><Input type="date" value={l.expires_on} onChange={(e) => setLine(l.key, { expires_on: e.target.value })} disabled={!l.item} /></Field> : null}
              <Button variant="ghost" size="icon" onClick={() => onChange(lines.length > 1 ? lines.filter((x) => x.key !== l.key) : [newPurchaseLine()])} aria-label="Remove line"><Trash2 className="h-4 w-4 text-danger" /></Button>
            </div>
            {l.item ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 text-xs text-fg-muted">
                {unit && !unit.is_base ? <span>1 {unit.code} = {Number(unit.factor_to_base)} {l.item.base_unit.code}</span> : null}
                {costHint ? costHint(l, unit) : null}
                {showCost ? <span className="ml-auto font-medium text-fg">Line total {formatMoney(total)}</span> : null}
              </div>
            ) : null}
          </div>
        );
      })}
      <Button size="sm" variant="secondary" onClick={() => onChange([...lines, newPurchaseLine()])}><Plus className="h-4 w-4" /> Add line</Button>
    </div>
  );
}
