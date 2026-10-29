"use client";
import { useState } from "react";
import Link from "next/link";
import { Undo2, Plus } from "lucide-react";
import type { PurchaseReturn } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { usePagedList } from "@/lib/hooks";
import { FilterBar, LoadMore, PageHeader } from "@/components/admin/page";
import { postedStatusVariant, SupplierSelect } from "@/components/admin/purchasing";
import { Badge, Button, EmptyRow, Loading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function PurchaseReturnsPage() {
  const [supplier, setSupplier] = useState("");
  const list = usePagedList<PurchaseReturn>(["purchase_returns"], "/purchase_returns", { supplier_id: supplier });
  return (
    <>
      <PageHeader icon={Undo2} title="Purchase Returns" description="Goods sent back. A credit note lowers what you owe; a cash refund puts money back in the drawer or account." actions={<Link href="/admin/purchasing/purchase-returns/new"><Button><Plus className="h-4 w-4" /> New return</Button></Link>} />
      <FilterBar><SupplierSelect className="w-auto" value={supplier} onChange={(id) => setSupplier(id)} /></FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Return</TH><TH>Supplier</TH><TH>Status</TH><TH>Returned</TH><TH>Settlement</TH><TH>Reason</TH><TH>Links</TH><TH right>Amount</TH><TH>Created</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono font-medium">{r.label}</TD>
                <TD><Link href={`/admin/suppliers/${r.supplier_id}`} className="hover:underline">{r.supplier_name}</Link></TD>
                <TD><Badge variant={postedStatusVariant(r.status)}>{r.status}</Badge></TD>
                <TD className="text-fg-secondary">{formatDate(r.returned_on)}</TD>
                <TD><Badge variant={r.settlement === "cash_refund" ? "success" : "info"}>{r.settlement === "cash_refund" ? "Cash refund" : "Credit note"}</Badge></TD>
                <TD className="max-w-56 truncate text-fg-secondary">{r.reason ?? "-"}</TD>
                <TD className="whitespace-nowrap text-xs">{r.goods_receipt_id ? <Link href={`/admin/purchasing/goods-received/${r.goods_receipt_id}`} className="text-primary hover:underline">Receipt</Link> : null}{r.goods_receipt_id && r.stock_document_id ? " · " : null}{r.stock_document_id ? <Link href={`/admin/inventory/stock-actions/${r.stock_document_id}`} className="text-primary hover:underline">Document</Link> : null}</TD>
                <TD right className="font-medium">{formatMoney(r.amount_minor)}</TD>
                <TD className="whitespace-nowrap text-fg-secondary">{formatDateTime(r.created_at)}</TD>
              </TR>
            )) : <EmptyRow colSpan={9}>No returns yet.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
    </>
  );
}
