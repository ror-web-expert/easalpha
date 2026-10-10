"use client";
// Dialogs and pickers shared by the SPEC purchasing and supplier screens: supplier search select, manual ledger
// adjustment, record a supplier payment, pay a purchase order.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import type { Page, PurchaseOrderRow, Supplier, SupplierAdjustment, SupplierPayment } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useSave } from "@/components/admin/crud";
import { useAllSuppliers, usePaymentMethods } from "@/components/admin/purchasing";
import { adjustmentAmount, outstandingOnOrder, type AdjustmentDirection } from "@/components/admin/purchasing-helpers";
import { Button, Dialog, Field, Input, MoneyInput, Select } from "@/components/ui";

/** Query keys that change when a supplier balance moves. */
export const SUPPLIER_MONEY_KEYS = ["supplier", "supplier_ledger", "supplier_payments", "supplier_payments_all", "suppliers", "suppliers_all", "purchasing_summary", "purchasing_aging", "supplier_insights", "supplier_ranking", "supplier_adjustments", "purchase_orders", "purchase_order", "purchase_orders_summary", "finance"];

/** Active payment methods a supplier can be paid with; the customer account ("khata") is not one. */
export function useUsableMethods() {
  const methods = usePaymentMethods();
  return useMemo(() => methods.data?.filter((m) => m.active && m.kind !== "khata") ?? [], [methods.data]);
}
function useDefaultMethod(open: boolean, code: string, setCode: (c: string) => void) {
  const usable = useUsableMethods();
  useEffect(() => { if (open && !code && usable.length) setCode(usable.find((m) => m.kind === "cash")?.code ?? usable[0].code); }, [open, usable, code, setCode]);
  return usable;
}

/** Type-to-search supplier picker (same behaviour as the stock ItemPicker). */
export function SupplierSearchSelect({ value, onChange, className, placeholder, autoFocus, allowClear }: { value: string; onChange: (id: string, supplier: Supplier | null) => void; className?: string; placeholder?: string; autoFocus?: boolean; allowClear?: boolean }) {
  const suppliers = useAllSuppliers();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const selected = suppliers.data?.find((s) => s.id === value) ?? null;
  const needle = q.trim().toLowerCase();
  const matches = (suppliers.data ?? []).filter((s) => !needle || [s.name, s.phone, s.contact_name].some((v) => v?.toLowerCase().includes(needle))).slice(0, 40);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={wrap} className={cn("relative w-full sm:w-72", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
      <Input className="pl-9" value={open ? q : selected?.name ?? ""} placeholder={placeholder ?? (suppliers.isLoading ? "Loading suppliers…" : "Search supplier")} autoFocus={autoFocus}
        onFocus={() => { setOpen(true); setQ(""); }} onChange={(e) => { setQ(e.target.value); setOpen(true); }} aria-label="Supplier" />
      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border bg-card shadow-lg">
          {allowClear && value ? <button type="button" className="w-full px-3 py-2 text-left text-sm text-fg-secondary hover:bg-muted" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange("", null); setOpen(false); }}>All suppliers</button> : null}
          {suppliers.isLoading ? <div className="px-3 py-2 text-sm text-fg-muted">Loading…</div> : matches.length ? matches.map((s) => (
            <button key={s.id} type="button" className={cn("flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted", s.id === value && "bg-muted")} onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(s.id, s); setOpen(false); setQ(""); }}>
              <span className="truncate"><span className="font-medium">{s.name}</span>{s.contact_name ? <span className="ml-2 text-xs text-fg-muted">{s.contact_name}</span> : null}</span>
              <span className={cn("shrink-0 text-xs tabular", s.balance_minor > 0 ? "text-danger" : s.balance_minor < 0 ? "text-success" : "text-fg-muted")}>{s.balance_minor ? formatMoney(s.balance_minor) : "Settled"}</span>
            </button>
          )) : <div className="px-3 py-2 text-sm text-fg-muted">No suppliers match.</div>}
        </div>
      ) : null}
    </div>
  );
}

/** Open (not cancelled) purchase orders for one supplier, for the optional PO link on a payment. */
export function useSupplierOrders(supplierId: string) {
  return useQuery({
    queryKey: ["purchase_orders", { supplier_id: supplierId, for: "payment" }],
    queryFn: () => api<Page<PurchaseOrderRow>>("/purchase_orders", { query: { supplier_id: supplierId, limit: 50 } }),
    enabled: !!supplierId,
    select: (r) => r.data.filter((po) => po.status !== "cancelled" && po.status !== "draft"),
  });
}

// ---- Manual ledger adjustment (SPEC: entered on the Supplier Ledger) ----
export function AdjustmentDialog({ supplier, open, onClose }: { supplier: Supplier | null; open: boolean; onClose: () => void }) {
  const [direction, setDirection] = useState<AdjustmentDirection>("owe_more");
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) { setDirection("owe_more"); setAmount(0); setReason(""); } }, [open]);
  const save = useSave<{ amount_minor: number; reason: string }, { adjustment: SupplierAdjustment; supplier: Supplier }>(SUPPLIER_MONEY_KEYS, () => `/suppliers/${supplier?.id}/adjust`, { success: "Adjustment recorded", onSuccess: onClose });
  if (!supplier) return null;
  const signed = adjustmentAmount(direction, amount);
  return (
    <Dialog open={open} onClose={onClose} title="Manual adjustment" description={`${supplier.name} · balance ${formatMoney(supplier.balance_minor)}. Adjustments are posted to the ledger and journal with your name and the reason.`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={amount <= 0 || !reason.trim()} onClick={() => save.mutate({ amount_minor: signed, reason: reason.trim() })}>Post adjustment</Button></>}>
      <div className="space-y-3">
        <Field label="Direction">
          <Select value={direction} onChange={(e) => setDirection(e.target.value as AdjustmentDirection)}>
            <option value="owe_more">We owe more (credit the supplier)</option>
            <option value="owe_less">We owe less (debit the supplier)</option>
          </Select>
        </Field>
        <Field label="Amount"><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>
        <Field label="Reason" hint="Required. Shown on the ledger line."><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Invoice correction, discount agreed, rounding…" /></Field>
        {amount > 0 ? <p className="text-xs text-fg-muted">Balance after: <span className="font-medium text-fg tabular">{formatMoney(supplier.balance_minor + signed)}</span></p> : null}
      </div>
    </Dialog>
  );
}

// ---- Record a supplier payment from the Supplier Payments screen ----
interface SupplierPaymentInput { supplier_id: string; direction: "paid" | "received"; amount_minor: number; method_code: string; reference: string; note: string; purchase_order_id: string }
export function RecordSupplierPaymentDialog({ open, onClose, supplierId }: { open: boolean; onClose: () => void; supplierId?: string }) {
  const suppliers = useAllSuppliers();
  const [form, setForm] = useState<SupplierPaymentInput>({ supplier_id: "", direction: "paid", amount_minor: 0, method_code: "", reference: "", note: "", purchase_order_id: "" });
  useEffect(() => { if (open) setForm({ supplier_id: supplierId ?? "", direction: "paid", amount_minor: 0, method_code: "", reference: "", note: "", purchase_order_id: "" }); }, [open, supplierId]);
  const usable = useDefaultMethod(open, form.method_code, (c) => setForm((f) => ({ ...f, method_code: c })));
  const orders = useSupplierOrders(form.supplier_id);
  const supplier = suppliers.data?.find((s) => s.id === form.supplier_id);
  const save = useSave<Record<string, unknown>, { payment: SupplierPayment; supplier: Supplier }>(SUPPLIER_MONEY_KEYS, () => `/suppliers/${form.supplier_id}/payments`, { success: "Payment recorded", onSuccess: onClose });
  const method = usable.find((m) => m.code === form.method_code);
  const pickOrder = (id: string) => {
    const po = orders.data?.find((o) => o.id === id);
    setForm((f) => ({ ...f, purchase_order_id: id, amount_minor: po && !f.amount_minor ? outstandingOnOrder(po.total_minor, po.paid_minor) : f.amount_minor }));
  };
  return (
    <Dialog open={open} onClose={onClose} title="Record supplier payment" description="Paid lowers what you owe; received is money back from the supplier." size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!form.supplier_id || form.amount_minor <= 0 || !form.method_code || (method?.needs_reference && !form.reference.trim())}
        onClick={() => save.mutate({ amount_minor: form.amount_minor, method_code: form.method_code, direction: form.direction, reference: form.reference || null, note: form.note || null, purchase_order_id: form.purchase_order_id || null })}>Record {form.direction === "paid" ? "payment" : "receipt"}</Button></>}>
      <div className="space-y-3">
        <Field label="Supplier" hint={supplier ? `Balance ${formatMoney(supplier.balance_minor)}` : undefined}><SupplierSearchSelect className="sm:w-full" value={form.supplier_id} onChange={(id) => setForm((f) => ({ ...f, supplier_id: id, purchase_order_id: "" }))} autoFocus={!form.supplier_id} /></Field>
        <Field label="Direction"><Select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as "paid" | "received" })}><option value="paid">Paid to supplier</option><option value="received">Received from supplier</option></Select></Field>
        <Field label="Purchase order (optional)">
          <Select value={form.purchase_order_id} disabled={!form.supplier_id} onChange={(e) => pickOrder(e.target.value)}>
            <option value="">Not against a specific order</option>
            {orders.data?.map((po) => <option key={po.id} value={po.id}>{po.label} · {formatMoney(po.total_minor)}{po.paid_minor ? ` (paid ${formatMoney(po.paid_minor)})` : ""}</option>)}
          </Select>
        </Field>
        <Field label="Amount"><MoneyInput value={form.amount_minor} onChange={(v) => setForm({ ...form, amount_minor: v })} /></Field>
        <Field label="Method"><Select value={form.method_code} onChange={(e) => setForm({ ...form, method_code: e.target.value })}>{usable.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select></Field>
        <Field label={method?.needs_reference ? "Reference (required by this method)" : "Reference"}><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Cheque no, transaction id" /></Field>
        <Field label="Note"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

// ---- Pay a purchase order (SPEC lifecycle: create -> receive -> pay) ----
export function PayOrderDialog({ po, open, onClose }: { po: PurchaseOrderRow; open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ amount_minor: 0, method_code: "", reference: "", note: "" });
  const due = outstandingOnOrder(po.total_minor, po.paid_minor);
  useEffect(() => { if (open) setForm({ amount_minor: due, method_code: "", reference: "", note: "" }); }, [open, due]);
  const usable = useDefaultMethod(open, form.method_code, (c) => setForm((f) => ({ ...f, method_code: c })));
  const method = usable.find((m) => m.code === form.method_code);
  const save = useSave<Record<string, unknown>, { payment: SupplierPayment; purchase_order: PurchaseOrderRow }>(SUPPLIER_MONEY_KEYS, () => `/purchase_orders/${po.id}/pay`, { success: `${po.label} payment recorded`, onSuccess: onClose });
  return (
    <Dialog open={open} onClose={onClose} title={`Pay ${po.label}`} description={`${po.supplier_name} · total ${formatMoney(po.total_minor)} · paid ${formatMoney(po.paid_minor)} · outstanding ${formatMoney(due)}${po.expected_on ? ` · expected ${formatDate(po.expected_on)}` : ""}`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={form.amount_minor <= 0 || !form.method_code || (method?.needs_reference && !form.reference.trim())}
        onClick={() => save.mutate({ amount_minor: form.amount_minor, method_code: form.method_code, reference: form.reference || null, note: form.note || null })}>Record payment</Button></>}>
      <div className="space-y-3">
        <Field label="Amount" hint={form.amount_minor > due ? "More than is outstanding; the extra becomes a credit with the supplier." : undefined}><MoneyInput value={form.amount_minor} onChange={(v) => setForm({ ...form, amount_minor: v })} autoFocus /></Field>
        <Field label="Method"><Select value={form.method_code} onChange={(e) => setForm({ ...form, method_code: e.target.value })}>{usable.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select></Field>
        <Field label={method?.needs_reference ? "Reference (required by this method)" : "Reference"}><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Cheque no, transaction id" /></Field>
        <Field label="Note"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}
