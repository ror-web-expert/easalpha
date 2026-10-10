"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { api } from "@/lib/api";
import type { OrderSummary, OrdersSummary } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime, isoDay } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { usePagedList, useDebounced } from "@/lib/hooks";
import { Cards, FilterBar, LoadMore, PageHeader, SearchInput } from "@/components/admin/page";
import { Badge, Input, Select, SummaryCard, Table, TBody, TD, TH, THead, TR, EmptyRow, Loading, ErrorState, orderStatusVariant, orderTypeVariant, paymentStatusVariant } from "@/components/ui";
import { OrderDrawer } from "@/components/admin/order-drawer";

const STATUSES = ["draft", "held", "placed", "preparing", "ready", "served", "dispatched", "paid", "closed", "voided", "refunded"];
const TYPES = ["dine_in", "takeaway", "delivery", "walk_in"];
const SOURCES = ["till", "qr", "online", "phone", "foodpanda", "kiosk"];

export default function OrdersPage() {
  const [day, setDay] = useState(isoDay());
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [source, setSource] = useState("");
  const [pay, setPay] = useState("");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [selected, setSelected] = useState<string | null>(null);
  const query = { business_day: day, status, order_type: type, source, payment_status: pay, open: open ? "true" : "", q: dq };
  const list = usePagedList<OrderSummary>(["orders"], "/orders", query);
  const summary = useQuery({ queryKey: ["orders_summary", day], queryFn: () => api<OrdersSummary>("/orders/summary", { query: { business_day: day } }) });
  const s = summary.data;
  return (
    <>
      <PageHeader icon={ReceiptText} title="Orders" description="Every order of the day with its status and payment." />
      <Cards>
        <SummaryCard label="Revenue (paid)" value={formatMoney(s?.revenue_minor)} sub={`${s?.paid_orders ?? 0} paid orders`} tone="success" />
        <SummaryCard label="Open" value={formatMoney(s?.open_minor)} sub={`${s?.open_orders ?? 0} open orders`} tone="info" />
        <SummaryCard label="Voided" value={formatMoney(s?.voided_minor)} sub={`${s?.voided_orders ?? 0} voided`} tone="danger" />
        <SummaryCard label="Average order" value={formatMoney(s?.average_order_minor)} sub={`${s?.discount_minor ? `Discounts ${formatMoney(s.discount_minor)}` : "No discounts"}`} tone="neutral" />
      </Cards>
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Serial, till serial, guest, notes" />
        <Input type="date" className="w-auto" value={day} onChange={(e) => setDay(e.target.value)} />
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{STATUSES.map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}</Select>
        <Select className="w-auto" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{TYPES.map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}</Select>
        <Select className="w-auto" value={source} onChange={(e) => setSource(e.target.value)}><option value="">All sources</option>{SOURCES.map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}</Select>
        <Select className="w-auto" value={pay} onChange={(e) => setPay(e.target.value)}><option value="">Any payment</option>{["unpaid", "partial", "paid", "refunded"].map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}</Select>
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> Open only</label>
      </FilterBar>
      {list.isLoading ? <Loading /> : list.error ? <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} /> : (
        <Table>
          <THead><tr><TH>Order</TH><TH>Type</TH><TH>Status</TH><TH>Payment</TH><TH>Customer / table</TH><TH>Created</TH><TH right>Items</TH><TH right>Total</TH><TH right>Due</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((o) => (
              <TR key={o.id} onClick={() => setSelected(o.id)}>
                <TD className="font-mono font-medium">{o.label}{o.is_staff_meal ? <Badge className="ml-1" variant="accent">staff</Badge> : null}</TD>
                <TD><Badge variant={orderTypeVariant(o.order_type)}>{titleCase(o.order_type)}</Badge></TD>
                <TD><Badge variant={orderStatusVariant(o.status)}>{titleCase(o.status)}</Badge></TD>
                <TD><Badge variant={paymentStatusVariant(o.payment_status)}>{titleCase(o.payment_status)}</Badge></TD>
                <TD className="text-fg-secondary">{o.table_code ? `Table ${o.table_code}` : o.guest_name || (o.customer_id ? "Customer" : "Walk-in")}</TD>
                <TD className="text-fg-secondary">{formatDateTime(o.created_at)}</TD>
                <TD right>{o.item_count}</TD>
                <TD right className="font-medium">{formatMoney(o.total_minor)}</TD>
                <TD right className={o.due_minor > 0 ? "text-danger" : ""}>{o.due_minor > 0 ? formatMoney(o.due_minor) : "-"}</TD>
              </TR>
            )) : <EmptyRow colSpan={9}>No orders match these filters</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
      <OrderDrawer id={selected} onClose={() => setSelected(null)} />
    </>
  );
}
