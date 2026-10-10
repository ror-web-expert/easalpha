"use client";
import { useState } from "react";
import Link from "next/link";
import { FileInput, Plus } from "lucide-react";
import type { GoodsReceipt } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { usePagedList } from "@/lib/hooks";
import { FilterBar, LoadMore, PageHeader } from "@/components/admin/page";
import { postedStatusVariant, SupplierSelect } from "@/components/admin/purchasing";
import { Badge, Button, EmptyRow, Input, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function GoodsReceiptsPage() {
  const [supplier, setSupplier] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const list = usePagedList<GoodsReceipt>(["goods_receipts"], "/goods_receipts", { supplier_id: supplier, status, from, to });
  return (
    <>
      <PageHeader icon={FileInput} title="Goods received" description="Every delivery, with or without a purchase order. Posting a receipt puts stock in, raises the supplier balance and records the price." actions={<Link href="/admin/purchasing/payables-aging/goods-received/new"><Button><Plus className="h-4 w-4" /> New receipt</Button></Link>} />
      <FilterBar>
        <SupplierSelect className="w-auto" value={supplier} onChange={(id) => setSupplier(id)} />
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="posted">Posted</option><option value="cancelled">Cancelled</option></Select>
        <Input type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <span className="text-xs text-fg-muted">to</span>
        <Input type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Receipt</TH><TH>Supplier</TH><TH>Status</TH><TH>Received</TH><TH>Invoice</TH><TH>Order</TH><TH right>Lines</TH><TH right>Total</TH><TH>Created</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((g) => (
              <TR key={g.id}>
                <TD><Link href={`/admin/purchasing/payables-aging/goods-received/${g.id}`} className="font-mono font-medium text-primary hover:underline">{g.label}</Link></TD>
                <TD><Link href={`/admin/suppliers/${g.supplier_id}`} className="hover:underline">{g.supplier_name}</Link></TD>
                <TD><Badge variant={postedStatusVariant(g.status)}>{g.status}</Badge></TD>
                <TD className="text-fg-secondary">{formatDate(g.received_on)}</TD>
                <TD className="text-fg-secondary">{g.invoice_ref ?? "-"}</TD>
                <TD>{g.purchase_order_id ? <Link href={`/admin/purchasing/payables-aging/purchase-orders/${g.purchase_order_id}`} className="text-xs text-primary hover:underline">Order</Link> : <span className="text-xs text-fg-muted">Direct</span>}</TD>
                <TD right>{g.line_count}</TD>
                <TD right className="font-medium">{formatMoney(g.total_minor)}</TD>
                <TD className="whitespace-nowrap text-fg-secondary">{formatDateTime(g.created_at)}</TD>
              </TR>
            )) : <EmptyRow colSpan={9}>No receipts match.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
    </>
  );
}
