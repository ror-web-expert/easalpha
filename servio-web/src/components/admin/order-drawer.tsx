"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import type { Order, PaymentMethod, Refund } from "@/lib/types";
import { formatMoney, formatQty } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { Badge, Button, Dialog, Field, Input, Loading, MoneyInput, Select, Sheet, Stat, Textarea, orderStatusVariant, orderTypeVariant, paymentStatusVariant } from "@/components/ui";
import { useApproval } from "@/components/approval";
import { toast } from "@/store/toast";
import { useAuthStore } from "@/store/auth";

export function OrderDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { run, dialog } = useApproval();
  const currency = useAuthStore((s) => s.session?.business.currency);
  const q = useQuery({ queryKey: ["order", id], queryFn: () => api<Order>(`/orders/${id}`), enabled: !!id });
  const [voidOpen, setVoidOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("cash");
  const methods = useQuery({ queryKey: ["payment_methods"], queryFn: () => api<{ data: PaymentMethod[] }>("/payment_methods"), enabled: refundOpen });
  const o = q.data;
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["order", id] }); qc.invalidateQueries({ queryKey: ["orders"] }); };

  const voidM = useMutation({
    mutationFn: () => run((pin) => api<Order>(`/orders/${id}/void`, { method: "POST", body: { reason, approver_pin: pin } }), `Void ${o?.label}`),
    onSuccess: () => { toast.success("Order voided"); setVoidOpen(false); setReason(""); invalidate(); },
    onError: (e) => toast.error("Could not void", errorMessage(e)),
  });
  const refundM = useMutation({
    mutationFn: () => run((pin) => api<{ refund: Refund; order: Order }>(`/orders/${id}/refunds`, { method: "POST", body: { amount_minor: amount, method_code: method, reason, approver_pin: pin } }), `Refund ${formatMoney(amount)} on ${o?.label}`),
    onSuccess: () => { toast.success("Refund recorded"); setRefundOpen(false); setReason(""); invalidate(); },
    onError: (e) => toast.error("Could not refund", errorMessage(e)),
  });

  const isOpen = o && ["draft", "held", "placed", "preparing", "ready", "served", "dispatched"].includes(o.status);
  const canRefund = o && o.paid_minor > 0 && ["paid", "closed", "refunded"].includes(o.status);

  return (
    <Sheet
      open={!!id}
      onClose={onClose}
      title={o ? `Order ${o.label}` : "Order"}
      description={o ? <span className="flex flex-wrap items-center gap-2"><Badge variant={orderStatusVariant(o.status)}>{titleCase(o.status)}</Badge><Badge variant={orderTypeVariant(o.order_type)}>{titleCase(o.order_type)}</Badge><Badge variant={paymentStatusVariant(o.payment_status)}>{titleCase(o.payment_status)}</Badge>{o.is_staff_meal ? <Badge variant="accent">Staff meal</Badge> : null}</span> : undefined}
      footer={o ? (<>
        {isOpen ? <Button variant="destructive" onClick={() => setVoidOpen(true)}>Void order</Button> : null}
        {canRefund ? <Button variant="secondary" onClick={() => { setAmount(o.paid_minor); setRefundOpen(true); }}>Refund</Button> : null}
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </>) : undefined}
    >
      {q.isLoading ? <Loading /> : null}
      {q.error ? <p className="text-sm text-danger">{errorMessage(q.error)}</p> : null}
      {o ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div className="text-fg-secondary">Created</div><div className="text-right">{formatDateTime(o.created_at)}</div>
            {o.table_code ? <><div className="text-fg-secondary">Table</div><div className="text-right">{o.table_code}</div></> : null}
            {o.guest_name ? <><div className="text-fg-secondary">Guest</div><div className="text-right">{o.guest_name}</div></> : null}
            {o.covers ? <><div className="text-fg-secondary">Covers</div><div className="text-right">{o.covers}</div></> : null}
            <div className="text-fg-secondary">Source</div><div className="text-right">{titleCase(o.source)}</div>
            {o.receipt_number ? <><div className="text-fg-secondary">Receipt</div><div className="text-right font-mono">{o.receipt_number}</div></> : null}
            {o.payment_method_summary ? <><div className="text-fg-secondary">Paid by</div><div className="text-right">{o.payment_method_summary.split(",").map((p) => { const [m, v] = p.split(":"); return `${m} ${formatMoney(Number(v), currency)}`; }).join(", ")}</div></> : null}
            {o.void_reason ? <><div className="text-fg-secondary">Void reason</div><div className="text-right text-danger">{o.void_reason}</div></> : null}
            {o.notes ? <><div className="text-fg-secondary">Notes</div><div className="text-right">{o.notes}</div></> : null}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Items</h3>
            <ul className="divide-y rounded-lg border">
              {o.items.map((it) => (
                <li key={it.id} className={`px-3 py-2 text-sm ${it.status === "cancelled" ? "opacity-50 line-through" : ""}`}>
                  <div className="flex justify-between gap-2">
                    <span><span className="tabular">{formatQty(it.quantity)} ×</span> {it.name}{it.open_item ? <Badge className="ml-1" variant="outline">open</Badge> : null}{it.price_overridden ? <Badge className="ml-1" variant="warning">override</Badge> : null}</span>
                    <span className="tabular">{formatMoney(it.line_total_minor, currency)}</span>
                  </div>
                  {it.modifiers?.length ? <div className="text-xs text-fg-secondary">{it.modifiers.map((m) => `+ ${m.name}${m.price_minor ? ` (${formatMoney(m.price_minor, currency)})` : ""}`).join(", ")}</div> : null}
                  {it.notes ? <div className="text-xs italic text-fg-secondary">“{it.notes}”</div> : null}
                  <div className="text-xs text-fg-muted">{titleCase(it.status)}{it.cancelled_reason ? ` · ${it.cancelled_reason}` : ""}</div>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border p-3">
            <Stat label="Subtotal" value={formatMoney(o.subtotal_minor, currency)} />
            {o.discount_minor ? <Stat label="Discount" value={`-${formatMoney(o.discount_minor, currency)}`} tone="danger" /> : null}
            {o.service_charge_minor ? <Stat label={`Service charge${o.service_charge_percent ? ` (${o.service_charge_percent}%)` : ""}`} value={formatMoney(o.service_charge_minor, currency)} /> : null}
            {o.tax_minor ? <Stat label="Tax" value={formatMoney(o.tax_minor, currency)} /> : null}
            {o.delivery_charge_minor ? <Stat label="Delivery" value={formatMoney(o.delivery_charge_minor, currency)} /> : null}
            {o.rounding_minor ? <Stat label="Rounding" value={formatMoney(o.rounding_minor, currency)} /> : null}
            {o.tip_minor ? <Stat label="Tip" value={formatMoney(o.tip_minor, currency)} /> : null}
            <Stat label="Total" value={<span className="text-base font-semibold">{formatMoney(o.total_minor, currency)}</span>} />
            <Stat label="Paid" value={formatMoney(o.paid_minor, currency)} tone="success" />
            {o.due_minor ? <Stat label="Due" value={formatMoney(o.due_minor, currency)} tone="danger" /> : null}
          </div>
          {o.discounts?.length ? (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Discounts</h3>
              <ul className="space-y-1 text-sm">{o.discounts.map((d) => <li key={d.id} className="flex justify-between"><span>{d.kind} {d.value}{d.kind === "percent" ? "%" : ""} · {d.reason}</span><span className="tabular">-{formatMoney(d.amount_minor, currency)}</span></li>)}</ul>
            </div>
          ) : null}
          {o.events?.length ? (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Timeline</h3>
              <ul className="space-y-1 text-xs text-fg-secondary">{o.events.map((e, i) => <li key={i} className="flex justify-between"><span>{e.from ? `${e.from} → ` : ""}{e.to}{e.reason ? ` · ${e.reason}` : ""}</span><span>{formatDateTime(e.at)}</span></li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}
      <Dialog open={voidOpen} onClose={() => setVoidOpen(false)} title={`Void ${o?.label}`} description="Give a reason. A manager PIN is asked for if your role cannot void." size="sm"
        footer={<><Button variant="secondary" onClick={() => setVoidOpen(false)}>Cancel</Button><Button variant="destructive" loading={voidM.isPending} disabled={!reason.trim()} onClick={() => voidM.mutate()}>Void order</Button></>}>
        <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer left, wrong order…" autoFocus /></Field>
      </Dialog>
      <Dialog open={refundOpen} onClose={() => setRefundOpen(false)} title={`Refund ${o?.label}`} description={`Paid ${formatMoney(o?.paid_minor, currency)}. Manager only.`} size="sm"
        footer={<><Button variant="secondary" onClick={() => setRefundOpen(false)}>Cancel</Button><Button variant="destructive" loading={refundM.isPending} disabled={!reason.trim() || amount <= 0} onClick={() => refundM.mutate()}>Refund {formatMoney(amount, currency)}</Button></>}>
        <div className="space-y-3">
          <Field label="Amount"><MoneyInput value={amount} onChange={setAmount} /></Field>
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {(methods.data?.data ?? [{ code: "cash", name: "Cash" } as PaymentMethod]).filter((m) => m.active !== false).map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
            </Select>
          </Field>
          <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Cold food, wrong item…" /></Field>
        </div>
      </Dialog>
      {dialog}
    </Sheet>
  );
}
