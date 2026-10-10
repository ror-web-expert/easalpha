"use client";
import { useState } from "react";
import Link from "next/link";
import { ShoppingCart, Plus } from "lucide-react";
import type { PurchaseOrder } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { usePagedList } from "@/lib/hooks";
import { FilterBar, LoadMore, PageHeader } from "@/components/admin/page";
import { PO_STATUSES, poStatusVariant, SupplierSelect } from "@/components/admin/purchasing";
import { Badge, Button, Checkbox, EmptyRow, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function PurchaseOrdersPage() {
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState("");
  const list = usePagedList<PurchaseOrder>(["purchase_orders"], "/purchase_orders", { status, open: open ? "true" : "", supplier_id: supplier });
  return (
    <>
      <PageHeader icon={ShoppingCart} title="Purchase orders" description="Draft, send to the supplier, then receive against the order; partial deliveries are fine." actions={<Link href="/admin/purchasing/orders/new"><Button><Plus className="h-4 w-4" /> New order</Button></Link>} />
      <FilterBar>
        <Select className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); if (e.target.value) setOpen(false); }}><option value="">Any status</option>{PO_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
        <SupplierSelect className="w-auto" value={supplier} onChange={(id) => setSupplier(id)} />
        <Checkbox label="Open only (sent or partial)" checked={open} onChange={(e) => { setOpen(e.target.checked); if (e.target.checked) setStatus(""); }} />
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Order</TH><TH>Supplier</TH><TH>Status</TH><TH>Expected</TH><TH right>Lines</TH><TH right>Total</TH><TH>Created</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((po) => (
              <TR key={po.id}>
                <TD><Link href={`/admin/purchasing/orders/${po.id}`} className="font-mono font-medium text-primary hover:underline">{po.label}</Link></TD>
                <TD><Link href={`/admin/purchasing/suppliers/${po.supplier_id}`} className="hover:underline">{po.supplier_name}</Link></TD>
                <TD><Badge variant={poStatusVariant(po.status)}>{titleCase(po.status)}</Badge></TD>
                <TD className="text-fg-secondary">{po.expected_on ? formatDate(po.expected_on) : "-"}</TD>
                <TD right>{po.line_count}</TD>
                <TD right className="font-medium">{formatMoney(po.total_minor)}</TD>
                <TD className="whitespace-nowrap text-fg-secondary">{formatDateTime(po.created_at)}</TD>
              </TR>
            )) : <EmptyRow colSpan={7}>No purchase orders match.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
    </>
  );
}
