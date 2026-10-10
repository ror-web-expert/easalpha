"use client";
import { useState } from "react";
import Link from "next/link";
import { Coins, HandCoins } from "lucide-react";
import type { SupplierPaymentRow, SupplierPaymentsPage } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { daysAgo, formatDate, isoDay } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { usePagedList } from "@/lib/hooks";
import { useCan } from "@/store/auth";
import { Cards, DateRangePicker, FilterBar, LoadMore, PageHeader, type DateRange } from "@/components/admin/page";
import { RecordSupplierPaymentDialog, SupplierSearchSelect, useUsableMethods } from "@/components/admin/purchasing-dialogs";
import { SUPPLIER_PERMS } from "@/components/admin/purchasing-helpers";
import { Badge, Button, EmptyRow, Loading, Select, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function SupplierPaymentsPage() {
  const can = useCan();
  const [supplierId, setSupplierId] = useState("");
  const [range, setRange] = useState<DateRange>({ from: daysAgo(29), to: isoDay() });
  const [method, setMethod] = useState("");
  const [direction, setDirection] = useState("");
  const [recording, setRecording] = useState(false);
  const methods = useUsableMethods();
  const list = usePagedList<SupplierPaymentRow>(["supplier_payments_all"], "/supplier_payments", { supplier_id: supplierId, from: range.from, to: range.to, method_code: method, direction });
  const totals = (list.data?.pages[0] as SupplierPaymentsPage | undefined)?.totals;
  const methodName = (code: string | null) => methods.find((m) => m.code === code)?.name ?? (code ? titleCase(code) : "-");
  return (
    <>
      <PageHeader icon={Coins} title="Supplier Payments" description="Every payment to a supplier, and any money received back, with its method and the order it settles." actions={can(...SUPPLIER_PERMS.recordPayment) ? <Button onClick={() => setRecording(true)}><HandCoins className="h-4 w-4" /> Record payment</Button> : null} />
      <FilterBar>
        <SupplierSearchSelect value={supplierId} onChange={(id) => setSupplierId(id)} placeholder="All suppliers" allowClear />
        <DateRangePicker value={range} onChange={setRange} />
        <Select className="w-auto" value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Method"><option value="">Any method</option>{methods.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select>
        <Select className="w-auto" value={direction} onChange={(e) => setDirection(e.target.value)} aria-label="Direction"><option value="">Paid and received</option><option value="paid">Paid to supplier</option><option value="received">Received from supplier</option></Select>
      </FilterBar>
      <Cards className="lg:grid-cols-3 xl:grid-cols-3">
        <SummaryCard label="Paid to suppliers" value={formatMoney(totals?.paid_minor)} sub={`${formatDate(range.from)} to ${formatDate(range.to)}`} tone="success" />
        <SummaryCard label="Received from suppliers" value={formatMoney(totals?.received_minor)} sub="Refunds and money back" tone="warning" />
        <SummaryCard label="Payments" value={totals?.count ?? 0} sub={totals ? `Net ${formatMoney(totals.paid_minor - totals.received_minor)}` : ""} tone="neutral" />
      </Cards>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Date</TH><TH>Supplier</TH><TH>Payment</TH><TH>Purchase order</TH><TH>Method</TH><TH>Reference</TH><TH right>Amount</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((p) => (
              <TR key={p.id}>
                <TD className="whitespace-nowrap text-fg-secondary">{formatDate(p.paid_on)}</TD>
                <TD><Link href={`/admin/suppliers/ledger?supplier_id=${p.supplier_id}`} className="font-medium text-primary hover:underline">{p.supplier_name}</Link></TD>
                <TD><span className="font-mono text-xs">{p.label}</span><Badge variant={p.direction === "paid" ? "success" : "warning"} className="ml-2">{p.direction === "paid" ? "Paid" : "Received"}</Badge></TD>
                <TD>{p.purchase_order_id ? <Link href={`/admin/purchasing/purchase-orders/${p.purchase_order_id}`} className="font-mono text-xs text-primary hover:underline">{p.purchase_order_label ?? "PO"}</Link> : p.goods_receipt_id ? <Link href={`/admin/purchasing/goods-received/${p.goods_receipt_id}`} className="text-xs text-primary hover:underline">Goods receipt</Link> : <span className="text-fg-muted">-</span>}</TD>
                <TD className="text-fg-secondary">{methodName(p.method_code)}</TD>
                <TD className="max-w-56 truncate text-fg-secondary" title={[p.reference, p.note].filter(Boolean).join(" · ") || undefined}>{[p.reference, p.note].filter(Boolean).join(" · ") || "-"}</TD>
                <TD right className={`font-medium ${p.direction === "received" ? "text-warning" : ""}`}>{p.direction === "received" ? "-" : ""}{formatMoney(p.amount_minor)}</TD>
              </TR>
            )) : <EmptyRow colSpan={7}>No supplier payments in this range.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
      <RecordSupplierPaymentDialog open={recording} onClose={() => setRecording(false)} supplierId={supplierId || undefined} />
    </>
  );
}
