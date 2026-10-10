"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Truck, HandCoins, Pencil, Archive, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { GoodsReceipt, PurchaseOrder, Supplier, SupplierInsights, SupplierLedger, SupplierPayment } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime, daysAgo, isoDay } from "@/lib/dates";
import { formatBaseQty } from "@/lib/units";
import { titleCase } from "@/lib/utils";
import { usePagedList } from "@/lib/hooks";
import { Cards, DateRangePicker, FilterBar, LoadMore, PageHeader, type DateRange } from "@/components/admin/page";
import { useRemove } from "@/components/admin/crud";
import { poStatusVariant, postedStatusVariant, SupplierDialog, SupplierPaymentDialog } from "@/components/admin/purchasing";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ConfirmDialog, EmptyRow, KeyValue, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";

type Tab = "ledger" | "insights" | "payments" | "orders" | "receipts";
const ENTRY_LABEL: Record<string, string> = { opening: "Opening balance", receipt: "Goods received", return: "Return", refund_received: "Refund received", payment: "Paid", received: "Received" };
function entryVariant(kind: string) { return kind === "receipt" || kind === "opening" || kind === "refund_received" ? "warning" : kind === "payment" || kind === "return" ? "success" : "neutral"; }

export default function SupplierPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supplier = useQuery({ queryKey: ["supplier", id], queryFn: () => api<Supplier>(`/suppliers/${id}`) });
  const ledger = useQuery({ queryKey: ["supplier_ledger", id], queryFn: () => api<SupplierLedger>(`/suppliers/${id}/ledger`) });
  const [range, setRange] = useState<DateRange>({ from: daysAgo(89), to: isoDay() });
  const [tab, setTab] = useState<Tab>("ledger");
  const insights = useQuery({ queryKey: ["supplier_insights", id, range], queryFn: () => api<SupplierInsights>(`/suppliers/${id}/insights`, { query: { from: range.from, to: range.to } }), enabled: tab === "insights" });
  const payments = usePagedList<SupplierPayment>(["supplier_payments", id], `/suppliers/${id}/payments`, {}, { enabled: tab === "payments" });
  const orders = usePagedList<PurchaseOrder>(["purchase_orders", { supplier_id: id }], "/purchase_orders", { supplier_id: id }, { enabled: tab === "orders" });
  const receipts = usePagedList<GoodsReceipt>(["goods_receipts", { supplier_id: id }], "/goods_receipts", { supplier_id: id }, { enabled: tab === "receipts" });
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const remove = useRemove(["suppliers", "suppliers_all", "purchasing_summary"], (sid) => `/suppliers/${sid}`, "Supplier archived");
  const s = supplier.data ?? ledger.data?.supplier;
  if (!s) return <Loading />;
  const a = ledger.data?.aging;
  const ins = insights.data;
  return (
    <>
      <PageHeader icon={Truck} title={s.name} description={[s.contact_name, s.phone, s.email, s.ntn ? `NTN ${s.ntn}` : null, s.payment_terms_days ? `${s.payment_terms_days} day terms` : "Pay on delivery"].filter(Boolean).join(" · ")} actions={<>
        <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>
        <Link href={`/admin/purchasing/payables-aging/purchase-orders/new?supplier_id=${s.id}`}><Button variant="secondary"><Plus className="h-4 w-4" /> Purchase order</Button></Link>
        <Button onClick={() => setPaying(true)}><HandCoins className="h-4 w-4" /> Record payment</Button>
        {!s.balance_minor ? <Button variant="ghost" onClick={() => setArchiving(true)}><Archive className="h-4 w-4" /> Archive</Button> : null}
      </>} />
      <Cards>
        <SummaryCard label={s.balance_minor < 0 ? "Supplier owes you" : "You owe"} value={formatMoney(Math.abs(s.balance_minor))} sub={s.opening_balance_minor ? `Opening balance ${formatMoney(s.opening_balance_minor)}` : "Receipts less payments and returns"} tone={s.balance_minor > 0 ? "danger" : "success"} />
        <SummaryCard label="Overdue (31+ days)" value={formatMoney((a?.["31_60"] ?? 0) + (a?.["61_90"] ?? 0) + (a?.over_90 ?? 0))} sub={a ? `Current ${formatMoney(a.current)} · 31–60 ${formatMoney(a["31_60"])} · 61–90 ${formatMoney(a["61_90"])} · 90+ ${formatMoney(a.over_90)}` : ""} tone="warning" />
        <SummaryCard label="Ledger entries" value={ledger.data?.entries.length ?? 0} sub={`Since ${formatDate(s.created_at)}`} tone="neutral" />
      </Cards>
      <Tabs value={tab} onChange={setTab} items={[{ value: "ledger", label: "Ledger" }, { value: "insights", label: "Insights" }, { value: "payments", label: "Payments" }, { value: "orders", label: "Orders" }, { value: "receipts", label: "Receipts" }]} className="mb-4 w-fit" />
      {tab === "ledger" ? (
        <Table>
          <THead><tr><TH>When</TH><TH>Entry</TH><TH>Details</TH><TH right>Amount</TH><TH right>Balance</TH></tr></THead>
          <TBody>
            {ledger.data?.entries.length ? [...ledger.data.entries].reverse().map((e, i) => (
              <TR key={`${e.ref ?? e.kind}-${e.at}-${i}`}>
                <TD className="whitespace-nowrap text-fg-secondary">{formatDateTime(e.at)}</TD>
                <TD><Badge variant={entryVariant(e.kind)}>{ENTRY_LABEL[e.kind] ?? titleCase(e.kind)}</Badge>{e.number ? (e.kind === "receipt" ? <Link href={`/admin/purchasing/payables-aging/goods-received/${e.ref}`} className="ml-2 font-mono text-xs text-primary hover:underline">{e.number}</Link> : <span className="ml-2 font-mono text-xs">{e.number}</span>) : null}</TD>
                <TD className="text-fg-secondary">{e.description ?? "-"}</TD>
                <TD right className={e.amount_minor < 0 ? "text-success" : "text-danger"}>{e.amount_minor < 0 ? "-" : "+"}{formatMoney(Math.abs(e.amount_minor))}</TD>
                <TD right className="font-medium">{formatMoney(e.balance_minor)}</TD>
              </TR>
            )) : <EmptyRow colSpan={5}>No activity yet. Receive goods or record a payment.</EmptyRow>}
          </TBody>
        </Table>
      ) : null}
      {tab === "insights" ? (
        <>
          <FilterBar><DateRangePicker value={range} onChange={setRange} /></FilterBar>
          {insights.isLoading || !ins ? <Loading /> : (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader><CardTitle>In this period</CardTitle></CardHeader>
                <CardBody>
                  <KeyValue items={[
                    { label: "Purchased", value: formatMoney(ins.purchases_minor) }, { label: "Receipts", value: ins.receipts }, { label: "Returned", value: formatMoney(ins.returns_minor) },
                    { label: "Paid", value: formatMoney(ins.paid_minor) }, { label: "Payments", value: ins.payments }, { label: "Open orders", value: ins.open_orders },
                    { label: "Last receipt", value: ins.last_receipt_on ? formatDate(ins.last_receipt_on) : "-" }, { label: "Balance now", value: formatMoney(ins.balance_minor) },
                  ]} />
                </CardBody>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>Top items bought</CardTitle></CardHeader>
                <Table>
                  <THead><tr><TH>Item</TH><TH right>Receipts</TH><TH right>Quantity</TH><TH right>Last cost</TH><TH right>Value</TH></tr></THead>
                  <TBody>
                    {ins.top_items.length ? ins.top_items.map((t) => (
                      <TR key={t.item.id}><TD><Link href={`/admin/inventory/items/${t.item.id}`} className="font-medium text-primary hover:underline">{t.item.name}</Link></TD><TD right>{t.receipts}</TD><TD right>{formatBaseQty(t.quantity, t.item.base_unit.code)}</TD><TD right className="text-fg-secondary">{formatMoney(t.last_unit_cost_minor)} / {t.unit_code}</TD><TD right className="font-medium">{formatMoney(t.value_minor)}</TD></TR>
                    )) : <EmptyRow colSpan={5}>Nothing bought in this range.</EmptyRow>}
                  </TBody>
                </Table>
              </Card>
            </div>
          )}
        </>
      ) : null}
      {tab === "payments" ? (
        <>
          {payments.isLoading ? <Loading /> : (
            <Table>
              <THead><tr><TH>Payment</TH><TH>Date</TH><TH>Direction</TH><TH>Method</TH><TH>Reference</TH><TH right>Amount</TH></tr></THead>
              <TBody>
                {payments.rows.length ? payments.rows.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-mono font-medium">{p.label}</TD>
                    <TD className="text-fg-secondary">{formatDate(p.paid_on)}</TD>
                    <TD><Badge variant={p.direction === "paid" ? "success" : "warning"}>{p.direction === "paid" ? "Paid to supplier" : "Received"}</Badge></TD>
                    <TD className="text-fg-secondary">{p.method_code ? titleCase(p.method_code) : "-"}</TD>
                    <TD className="text-fg-secondary">{[p.reference, p.note].filter(Boolean).join(" · ") || "-"}</TD>
                    <TD right className="font-medium">{formatMoney(p.amount_minor)}</TD>
                  </TR>
                )) : <EmptyRow colSpan={6}>No payments yet.</EmptyRow>}
              </TBody>
            </Table>
          )}
          <LoadMore cursor={payments.nextCursor} onLoad={() => payments.fetchNextPage()} loading={payments.isFetchingNextPage} />
        </>
      ) : null}
      {tab === "orders" ? (
        <>
          {orders.isLoading ? <Loading /> : (
            <Table>
              <THead><tr><TH>Order</TH><TH>Status</TH><TH>Expected</TH><TH right>Lines</TH><TH right>Total</TH><TH>Created</TH></tr></THead>
              <TBody>
                {orders.rows.length ? orders.rows.map((po) => (
                  <TR key={po.id}><TD><Link href={`/admin/purchasing/payables-aging/purchase-orders/${po.id}`} className="font-mono font-medium text-primary hover:underline">{po.label}</Link></TD><TD><Badge variant={poStatusVariant(po.status)}>{titleCase(po.status)}</Badge></TD><TD className="text-fg-secondary">{po.expected_on ? formatDate(po.expected_on) : "-"}</TD><TD right>{po.line_count}</TD><TD right>{formatMoney(po.total_minor)}</TD><TD className="whitespace-nowrap text-fg-secondary">{formatDateTime(po.created_at)}</TD></TR>
                )) : <EmptyRow colSpan={6}>No purchase orders for this supplier.</EmptyRow>}
              </TBody>
            </Table>
          )}
          <LoadMore cursor={orders.nextCursor} onLoad={() => orders.fetchNextPage()} loading={orders.isFetchingNextPage} />
        </>
      ) : null}
      {tab === "receipts" ? (
        <>
          {receipts.isLoading ? <Loading /> : (
            <Table>
              <THead><tr><TH>Receipt</TH><TH>Status</TH><TH>Received</TH><TH>Invoice</TH><TH right>Lines</TH><TH right>Total</TH></tr></THead>
              <TBody>
                {receipts.rows.length ? receipts.rows.map((g) => (
                  <TR key={g.id}><TD><Link href={`/admin/purchasing/payables-aging/goods-received/${g.id}`} className="font-mono font-medium text-primary hover:underline">{g.label}</Link></TD><TD><Badge variant={postedStatusVariant(g.status)}>{g.status}</Badge></TD><TD className="text-fg-secondary">{formatDate(g.received_on)}</TD><TD className="text-fg-secondary">{g.invoice_ref ?? "-"}</TD><TD right>{g.line_count}</TD><TD right>{formatMoney(g.total_minor)}</TD></TR>
                )) : <EmptyRow colSpan={6}>No goods received from this supplier.</EmptyRow>}
              </TBody>
            </Table>
          )}
          <LoadMore cursor={receipts.nextCursor} onLoad={() => receipts.fetchNextPage()} loading={receipts.isFetchingNextPage} />
        </>
      ) : null}
      {s.address || s.notes ? <Card className="mt-4"><CardBody className="space-y-1 text-sm">{s.address ? <p><span className="text-fg-secondary">Address: </span>{s.address}</p> : null}{s.notes ? <p><span className="text-fg-secondary">Notes: </span>{s.notes}</p> : null}</CardBody></Card> : null}
      <SupplierDialog supplier={editing ? s : null} onClose={() => setEditing(false)} />
      <SupplierPaymentDialog supplier={s} open={paying} onClose={() => setPaying(false)} />
      <ConfirmDialog open={archiving} onClose={() => setArchiving(false)} onConfirm={() => remove.mutate(s.id, { onSuccess: () => router.replace("/admin/suppliers") })} title={`Archive ${s.name}?`} description="The balance must be zero. Past receipts and payments keep the name." confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}
