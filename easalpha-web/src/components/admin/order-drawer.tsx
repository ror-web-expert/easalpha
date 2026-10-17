"use client";
// SPEC order detail: a side panel with three tabs (Order Details with the order story, Cost Analysis, Payments) and the
// reopen and complete flows in the footer. EasAlpha's void and refund actions stay.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { CostAnalysis, Delivery, Order, PaymentMethod, Receipt, Refund, Rider } from "@/lib/types";
import { formatMoney, formatPercent, formatQty } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { Badge, Button, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Select, Sheet, Stat, SummaryCard, Table, TBody, TD, TH, THead, TR, Tabs, Textarea, orderStatusVariant, orderTypeVariant } from "@/components/ui";
import { useApproval } from "@/components/approval";
import { toast } from "@/store/toast";
import { useAuthStore, useCan } from "@/store/auth";
import { useList } from "@/components/admin/crud";
import { OrderStory } from "@/components/admin/order-story";
import { isSpecOpen, orderCode, paymentMethods, reopenLine, sourceLabel, specPaymentVariant, specStatusVariant } from "@/components/admin/order-helpers";
import { billRows } from "@/lib/bill";

type Tab = "details" | "cost" | "payments";

export function OrderDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { run, dialog } = useApproval();
  const can = useCan();
  const currency = useAuthStore((s) => s.session?.business.currency);
  const [tab, setTab] = useState<Tab>("details");
  useEffect(() => { setTab("details"); }, [id]);
  const q = useQuery({ queryKey: ["order", id], queryFn: () => api<Order>(`/orders/${id}`), enabled: !!id });
  const o = q.data;
  // The full order carries no customer, payments or delivery address: the receipt and the delivery record do.
  const receipt = useQuery({ queryKey: ["order_receipt", id], queryFn: () => api<Receipt>(`/orders/${id}/receipt`), enabled: !!id });
  const delivery = useQuery({ queryKey: ["order_delivery", id], queryFn: () => api<Delivery>(`/orders/${id}/delivery`), enabled: !!id && o?.order_type === "delivery", retry: false });
  const riders = useList<Rider>("riders", "/riders", {}, !!o?.rider_id && !delivery.data?.rider_name);
  const cost = useQuery({ queryKey: ["order_cost", id], queryFn: () => api<CostAnalysis>(`/orders/${id}/cost_analysis`), enabled: !!id && tab === "cost" });

  const [voidOpen, setVoidOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("cash");
  const methods = useQuery({ queryKey: ["payment_methods"], queryFn: () => api<{ data: PaymentMethod[] }>("/payment_methods"), enabled: refundOpen });
  const invalidate = () => {
    ["order", "order_receipt", "order_delivery", "order_cost"].forEach((k) => qc.invalidateQueries({ queryKey: [k, id] }));
    ["orders", "orders_summary", "orders_pending", "pills", "dashboard"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

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
  const reopenM = useMutation({
    mutationFn: () => run((pin) => api<Order>(`/orders/${id}/reopen`, { method: "POST", body: pin ? { approver_pin: pin } : {} }), `Reopen ${o?.label}`),
    onSuccess: () => { toast.success("Order reopened", "It is open for editing again; every change is recorded in the story."); setReopenOpen(false); invalidate(); },
    onError: (e) => toast.error(e instanceof ApiError && e.status === 403 ? "Not allowed" : "Could not reopen", errorMessage(e)),
  });
  const completeM = useMutation({
    mutationFn: () => api<Order>(`/orders/${id}/complete`, { method: "POST" }),
    onSuccess: () => { toast.success("Order completed"); invalidate(); },
    onError: (e) => toast.error(e instanceof ApiError && e.status === 409 ? "Order not completed" : "Could not complete", errorMessage(e)),
  });

  const isOpen = o && ["draft", "held", "placed", "preparing", "ready", "served", "dispatched"].includes(o.status);
  const sent = o && !["draft", "held"].includes(o.status);
  const canRefund = o && o.paid_minor > 0 && ["paid", "closed", "refunded"].includes(o.status);
  const canReopen = o && o.spec_status === "completed" && can("REOPEN_ORDER", "orders.refund");
  const canComplete = o && isSpecOpen(o.spec_status) && sent && can("COMPLETE_ORDER", "orders.create");
  const header = o ? reopenLine(o.reopen_count, o.edit_count) : null;
  const customer = receipt.data?.order.customer ?? delivery.data?.customer ?? null;
  const riderName = delivery.data?.rider_name ?? (o?.rider_id ? riders.data?.find((r) => r.id === o.rider_id)?.name : null);

  return (
    <Sheet
      open={!!id}
      onClose={onClose}
      title={o ? `Order ${o.label}${orderCode(o) ? ` · ${orderCode(o)}` : ""}` : "Order"}
      description={o ? (
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant={specStatusVariant(o.spec_status)}>{titleCase(o.spec_status)}</Badge>
          <Badge variant={orderTypeVariant(o.order_type)}>{titleCase(o.order_type)}</Badge>
          <Badge variant={specPaymentVariant(o.spec_payment_status)}>{titleCase(o.spec_payment_status)}</Badge>
          <Badge variant={orderStatusVariant(o.status)} title="EasAlpha internal status">{titleCase(o.status)}</Badge>
          {o.is_staff_meal ? <Badge variant="accent">Complimentary</Badge> : null}
          {header ? <span className="text-xs text-warning-ink">{header}</span> : null}
        </span>
      ) : undefined}
      footer={o ? (<>
        {canReopen ? <Button variant="secondary" onClick={() => setReopenOpen(true)}>Reopen</Button> : null}
        {canComplete ? <Button onClick={() => completeM.mutate()} loading={completeM.isPending}>Complete</Button> : null}
        {isOpen ? <Button variant="destructive" onClick={() => setVoidOpen(true)}>Void order</Button> : null}
        {canRefund ? <Button variant="secondary" onClick={() => { setAmount(o.paid_minor); setRefundOpen(true); }}>Refund</Button> : null}
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </>) : undefined}
    >
      {q.isLoading ? <Loading /> : null}
      {q.error ? <p className="text-sm text-danger">{errorMessage(q.error)}</p> : null}
      {o ? (
        <div className="space-y-5">
          <Tabs value={tab} onChange={setTab} items={[{ value: "details", label: "Order Details" }, { value: "cost", label: "Cost Analysis" }, { value: "payments", label: "Payments" }]} className="max-w-full" />
          {tab === "details" ? (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div className="text-fg-secondary">Customer</div><div className="text-right">{customer?.name ?? o.guest_name ?? (o.customer_id ? "Customer" : "Walk-in")}</div>
                {customer?.phone ? <><div className="text-fg-secondary">Phone</div><div className="text-right tabular">{customer.phone}</div></> : null}
                {o.order_type === "delivery" ? <><div className="text-fg-secondary">Rider</div><div className="text-right">{riderName ?? "Not assigned"}</div></> : null}
                {delivery.data?.address ? <><div className="text-fg-secondary">Address</div><div className="text-right">{delivery.data.address.text}</div></> : null}
                {delivery.data?.zone_name ? <><div className="text-fg-secondary">Zone</div><div className="text-right">{delivery.data.zone_name}</div></> : null}
                <div className="text-fg-secondary">Punched</div><div className="text-right">{formatDateTime(o.created_at)}</div>
                {o.table_code ? <><div className="text-fg-secondary">Table</div><div className="text-right">{o.table_code}</div></> : null}
                {o.covers ? <><div className="text-fg-secondary">Covers</div><div className="text-right">{o.covers}</div></> : null}
                <div className="text-fg-secondary">Source</div><div className="text-right">{sourceLabel(o.source)}</div>
                {o.void_reason ? <><div className="text-fg-secondary">Cancel reason</div><div className="text-right text-danger">{o.void_reason}</div></> : null}
                {o.notes ? <><div className="text-fg-secondary">Notes</div><div className="text-right">{o.notes}</div></> : null}
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Items</h3>
                <Table>
                  <THead><tr><TH>Item</TH><TH right>Qty</TH><TH right>Unit price</TH><TH right>Amount</TH></tr></THead>
                  <TBody>
                    {o.items.map((it) => (
                      <TR key={it.id} className={it.status === "cancelled" ? "opacity-50 line-through" : ""}>
                        <TD>
                          {it.name}{it.open_item ? <Badge className="ml-1" variant="outline">open</Badge> : null}{it.price_overridden ? <Badge className="ml-1" variant="warning">override</Badge> : null}
                          {it.modifiers?.length ? <div className="text-xs text-fg-secondary">{it.modifiers.map((m) => `+ ${m.name}${m.price_minor ? ` (${formatMoney(m.price_minor, currency)})` : ""}`).join(", ")}</div> : null}
                          {it.notes ? <div className="text-xs italic text-fg-secondary">“{it.notes}”</div> : null}
                          {it.cancelled_reason ? <div className="text-xs text-fg-muted">{it.cancelled_reason}</div> : null}
                        </TD>
                        <TD right>{formatQty(it.quantity)}</TD>
                        <TD right>{formatMoney(it.unit_price_minor, currency)}</TD>
                        {/* Unit price with modifiers times quantity: the lines add up to the Subtotal below. */}
                        <TD right className="font-medium">{formatMoney(it.line_subtotal_minor ?? it.line_total_minor, currency)}</TD>
                      </TR>
                    ))}
                    {!o.items.length ? <EmptyRow colSpan={4}>No items</EmptyRow> : null}
                  </TBody>
                </Table>
              </div>
              <div className="rounded-lg border p-3">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Payment summary</h3>
                {/* The shared bill block (lib/bill.ts), so this view adds up exactly like the till and the receipt. */}
                {billRows({ subtotal_minor: o.subtotal_minor, discount_minor: o.discount_minor, service_charge_minor: o.service_charge_minor, delivery_charge_minor: o.delivery_charge_minor, tax_minor: o.tax_minor, tip_minor: o.tip_minor, total_minor: o.total_minor, tax_inclusive_minor: o.items.filter((it) => it.tax_inclusive && it.status !== "cancelled").reduce((s, it) => s + (it.line_tax_minor ?? 0), 0), service_charge_label: `Service charge${o.service_charge_percent ? ` (${o.service_charge_percent}%)` : ""}` }, currency).map((r) => (
                  <Stat key={r.key} label={r.label} value={r.amount_minor < 0 ? `-${formatMoney(-r.amount_minor, currency)}` : formatMoney(r.amount_minor, currency)} tone={r.amount_minor < 0 ? "danger" : undefined} />
                ))}
                <Stat label="Total" value={<span className="text-base font-semibold">{formatMoney(o.total_minor, currency)}</span>} />
                <Stat label="Method" value={paymentMethods(o.payment_method_summary, currency) || "-"} />
                <Stat label="Status" value={<Badge variant={specPaymentVariant(o.spec_payment_status)}>{titleCase(o.spec_payment_status)}</Badge>} />
                {o.due_minor ? <Stat label="Due" value={formatMoney(o.due_minor, currency)} tone="danger" /> : null}
              </div>
              {o.discounts?.length ? (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Discounts</h3>
                  <ul className="space-y-1 text-sm">{o.discounts.map((d) => <li key={d.id} className="flex justify-between"><span>{d.kind} {d.value}{d.kind === "percent" ? "%" : ""} · {d.reason}</span><span className="tabular">-{formatMoney(d.amount_minor, currency)}</span></li>)}</ul>
                </div>
              ) : null}
              <OrderStory story={o.story} currency={currency} />
            </>
          ) : null}
          {tab === "cost" ? <CostTab data={cost.data} loading={cost.isLoading} error={cost.error} currency={currency} /> : null}
          {tab === "payments" ? <PaymentsTab order={o} receipt={receipt.data} loading={receipt.isLoading} currency={currency} /> : null}
        </div>
      ) : null}
      <ConfirmDialog open={reopenOpen} onClose={() => setReopenOpen(false)} onConfirm={() => reopenM.mutate()} title={`Reopen ${o?.label}?`}
        description="The order goes back to open for editing. The reopen, every edit and the money difference are recorded in the order story." confirmLabel="Reopen" loading={reopenM.isPending} />
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

function CostTab({ data, loading, error, currency }: { data: CostAnalysis | undefined; loading: boolean; error: unknown; currency?: string }) {
  if (loading) return <Loading />;
  if (error) return <p className="text-sm text-danger">{errorMessage(error)}</p>;
  if (!data) return null;
  const margin = data.margin_percent;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Revenue" value={formatMoney(data.revenue_minor, currency)} sub="Excluding tax" tone="success" />
        <SummaryCard label="COGS" value={formatMoney(data.cogs_minor, currency)} sub={`${data.ingredients.length} ingredient lines`} tone="warning" />
        <SummaryCard label="Labour" value={formatMoney(data.labour_minor, currency)} sub="Overheads per order" tone="neutral" />
        <SummaryCard label="Profit" value={formatMoney(data.profit_minor, currency)} sub={margin === null ? "No revenue" : `Margin ${formatPercent(margin)}`} tone={data.profit_minor < 0 ? "danger" : "primary"} />
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Items</h3>
        <Table>
          <THead><tr><TH>Item</TH><TH right>Qty</TH><TH right>Revenue</TH><TH right>Cost</TH><TH right>Profit</TH></tr></THead>
          <TBody>
            {data.items.length ? data.items.map((i) => (
              <TR key={i.id}><TD>{i.name}</TD><TD right>{formatQty(i.quantity)}</TD><TD right>{formatMoney(i.revenue_minor, currency)}</TD><TD right>{formatMoney(i.cost_minor, currency)}</TD><TD right className={i.revenue_minor - i.cost_minor < 0 ? "text-danger" : ""}>{formatMoney(i.revenue_minor - i.cost_minor, currency)}</TD></TR>
            )) : <EmptyRow colSpan={5}>No items</EmptyRow>}
          </TBody>
        </Table>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Ingredients deducted</h3>
        <Table>
          <THead><tr><TH>Ingredient</TH><TH right>Quantity</TH><TH>Kind</TH><TH right>Cost</TH></tr></THead>
          <TBody>
            {data.ingredients.length ? data.ingredients.map((g, i) => (
              <TR key={`${g.line_id}-${g.item}-${i}`}><TD>{g.item}</TD><TD right>{formatQty(g.quantity)} {g.unit}</TD><TD className="text-fg-secondary">{titleCase(g.kind)}</TD><TD right>{formatMoney(g.cost_minor, currency)}</TD></TR>
            )) : <EmptyRow colSpan={4}>No stock was deducted for this order; COGS falls back to the recipe cost snapshot</EmptyRow>}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

function PaymentsTab({ order: o, receipt, loading, currency }: { order: Order; receipt: Receipt | undefined; loading: boolean; currency?: string }) {
  const payments = receipt?.payments ?? [];
  const refunds = receipt?.refunds ?? [];
  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3">
        <Stat label="Payment status" value={<Badge variant={specPaymentVariant(o.spec_payment_status)}>{titleCase(o.spec_payment_status)}</Badge>} />
        <Stat label="Order total" value={<span className="text-base font-semibold">{formatMoney(o.total_minor, currency)}</span>} />
        <Stat label="Method" value={paymentMethods(o.payment_method_summary, currency) || "-"} />
        <Stat label="Paid" value={formatMoney(o.paid_minor, currency)} tone="success" />
        {o.due_minor ? <Stat label="Due" value={formatMoney(o.due_minor, currency)} tone="danger" /> : null}
        {o.paid_at ? <Stat label="Paid at" value={formatDateTime(o.paid_at)} /> : null}
        {receipt?.order.cashier ? <Stat label="Collected by" value={receipt.order.cashier} /> : null}
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Payment records</h3>
        {loading ? <Loading /> : (
          <Table>
            <THead><tr><TH>Method</TH><TH right>Amount</TH><TH right>Tendered</TH><TH right>Change</TH><TH>Reference</TH></tr></THead>
            <TBody>
              {payments.length ? payments.map((p, i) => (
                <TR key={i}><TD>{titleCase(p.method)}</TD><TD right className="font-medium">{formatMoney(p.amount_minor, currency)}</TD><TD right>{p.tendered_minor !== null ? formatMoney(p.tendered_minor, currency) : "-"}</TD><TD right>{p.change_minor ? formatMoney(p.change_minor, currency) : "-"}</TD><TD className="text-fg-secondary">{p.reference ?? "-"}</TD></TR>
              )) : <EmptyRow colSpan={5}>No payment taken yet</EmptyRow>}
            </TBody>
          </Table>
        )}
      </div>
      {refunds.length ? (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Refunds</h3>
          <ul className="space-y-1 text-sm">{refunds.map((r, i) => <li key={i} className="flex justify-between"><span>{titleCase(r.method)} · {r.reason}</span><span className="tabular text-danger">-{formatMoney(r.amount_minor, currency)}</span></li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}
