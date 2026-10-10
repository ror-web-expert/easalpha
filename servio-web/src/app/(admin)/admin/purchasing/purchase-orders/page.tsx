"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, Plus, FileDown } from "lucide-react";
import { api } from "@/lib/api";
import type { PurchaseOrderRow, PurchaseOrdersSummary } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, isoDay } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { usePagedList } from "@/lib/hooks";
import { exportTablePdf } from "@/lib/pdf";
import { useCan } from "@/store/auth";
import { Cards, DateRangePicker, FilterBar, LoadMore, PageHeader, type DateRange } from "@/components/admin/page";
import { PO_STATUSES, poStatusVariant, SupplierSelect } from "@/components/admin/purchasing";
import { PO_PERMS, poPaymentLabel } from "@/components/admin/purchasing-helpers";
import { Badge, Button, EmptyRow, Loading, Select, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

const PAYMENTS = ["unpaid", "partial", "paid"] as const;

export default function PurchaseOrdersPage() {
  const can = useCan();
  const [status, setStatus] = useState("");
  const [supplier, setSupplier] = useState("");
  const [payment, setPayment] = useState("");
  // Blank dates mean all time; the API skips empty filters.
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const list = usePagedList<PurchaseOrderRow>(["purchase_orders"], "/purchase_orders", { status, supplier_id: supplier, payment, from: range.from, to: range.to });
  const summary = useQuery({ queryKey: ["purchase_orders_summary", range], queryFn: () => api<PurchaseOrdersSummary>("/purchase_orders/summary", { query: { from: range.from, to: range.to } }) });
  const s = summary.data;
  const rangeText = range.from || range.to ? `${range.from ? formatDate(range.from) : "start"} to ${range.to ? formatDate(range.to) : "today"}` : "All time";
  const exportPdf = () => exportTablePdf({
    title: "Purchase orders",
    subtitle: [rangeText, status ? titleCase(status) : null, payment ? poPaymentLabel(payment as typeof PAYMENTS[number]).text : null].filter(Boolean).join(" | "),
    columns: [{ header: "PO Number", key: "label" }, { header: "Date", key: "date" }, { header: "Supplier", key: "supplier" }, { header: "Items", key: "items", align: "right" }, { header: "Total Amount", key: "total", align: "right" }, { header: "Paid", key: "paid", align: "right" }, { header: "Status", key: "status" }, { header: "Payment", key: "payment" }],
    rows: list.rows.map((po) => ({ label: po.label, date: formatDate(po.created_at), supplier: po.supplier_name, items: po.line_count, total: formatMoney(po.total_minor), paid: formatMoney(po.paid_minor), status: titleCase(po.status), payment: poPaymentLabel(po.payment_status).text })),
    footer: [`${list.rows.length} orders listed`, `Total ${formatMoney(list.rows.reduce((a, po) => a + (po.status === "cancelled" ? 0 : po.total_minor), 0))} (cancelled excluded) · Paid ${formatMoney(list.rows.reduce((a, po) => a + po.paid_minor, 0))}`],
    filename: `purchase-orders-${isoDay()}.pdf`, landscape: true,
  });
  return (
    <>
      <PageHeader icon={ShoppingCart} title="Purchase Orders" description="Create an order, receive the stock against it (which writes a GRN stock action), then pay. Each step has its own permission." actions={<>
        <Button variant="secondary" onClick={exportPdf} disabled={!list.rows.length}><FileDown className="h-4 w-4" /> Export PDF</Button>
        {can(...PO_PERMS.create) ? <Link href="/admin/purchasing/purchase-orders/new"><Button><Plus className="h-4 w-4" /> New order</Button></Link> : null}
      </>} />
      <Cards>
        <SummaryCard label="Total POs" value={s?.total ?? 0} sub={`${rangeText} · ${s?.open ?? 0} open`} />
        <SummaryCard label="Drafts" value={s?.drafts ?? 0} sub="Not yet sent to the supplier" tone="neutral" />
        <SummaryCard label="Received" value={s?.received ?? 0} sub={`${s?.cancelled ?? 0} cancelled`} tone="success" />
        <SummaryCard label="Total value" value={formatMoney(s?.total_value_minor)} sub={`Paid ${formatMoney(s?.paid_minor)}`} tone="warning" />
      </Cards>
      <FilterBar>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">Any status</option>{PO_STATUSES.map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}</Select>
        <SupplierSelect className="w-auto" value={supplier} onChange={(id) => setSupplier(id)} />
        <DateRangePicker value={range} onChange={setRange} />
        <Select className="w-auto" value={payment} onChange={(e) => setPayment(e.target.value)} aria-label="Payment"><option value="">Any payment</option>{PAYMENTS.map((x) => <option key={x} value={x}>{poPaymentLabel(x).text}</option>)}</Select>
        {range.from || range.to ? <Button variant="ghost" size="sm" onClick={() => setRange({ from: "", to: "" })}>All time</Button> : null}
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>PO Number</TH><TH>Date</TH><TH>Supplier</TH><TH right>Items</TH><TH right>Total Amount</TH><TH>Status</TH><TH>Payment</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((po) => {
              const pay = poPaymentLabel(po.payment_status);
              return (
                <TR key={po.id}>
                  <TD><Link href={`/admin/purchasing/purchase-orders/${po.id}`} className="font-mono font-medium text-primary hover:underline">{po.label}</Link></TD>
                  <TD className="whitespace-nowrap text-fg-secondary">{formatDate(po.created_at)}{po.expected_on ? <div className="text-xs text-fg-muted">Expected {formatDate(po.expected_on)}</div> : null}</TD>
                  <TD><Link href={`/admin/suppliers/${po.supplier_id}`} className="hover:underline">{po.supplier_name}</Link></TD>
                  <TD right>{po.line_count}</TD>
                  <TD right className="font-medium">{formatMoney(po.total_minor)}{po.paid_minor && po.payment_status !== "paid" ? <div className="text-xs font-normal text-fg-muted">Paid {formatMoney(po.paid_minor)}</div> : null}</TD>
                  <TD><Badge variant={poStatusVariant(po.status)}>{titleCase(po.status)}</Badge></TD>
                  <TD>{po.status === "cancelled" && !po.paid_minor ? <span className="text-fg-muted">-</span> : <Badge variant={pay.variant}>{pay.text}</Badge>}</TD>
                </TR>
              );
            }) : <EmptyRow colSpan={7}>No purchase orders match.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
    </>
  );
}
