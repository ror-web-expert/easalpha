"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { api } from "@/lib/api";
import type { PurchasingSummary, SupplierAgingReport } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { isoDay } from "@/lib/dates";
import { Cards, FilterBar, PageHeader } from "@/components/admin/page";
import { EmptyRow, Input, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function PurchasingPage() {
  const [asOf, setAsOf] = useState(isoDay());
  const summary = useQuery({ queryKey: ["purchasing_summary"], queryFn: () => api<PurchasingSummary>("/purchasing/summary") });
  const aging = useQuery({ queryKey: ["purchasing_aging", asOf], queryFn: () => api<SupplierAgingReport>("/purchasing/aging", { query: { as_of: asOf } }) });
  const s = summary.data;
  const a = aging.data;
  const overdue = a ? a.totals["31_60"] + a.totals["61_90"] + a.totals.over_90 : 0;
  return (
    <>
      <PageHeader icon={CalendarClock} title="Payables" description="What you owe suppliers and for how long. Aging is FIFO: payments settle the oldest receipts first." />
      <Cards>
        <SummaryCard label="Owed to suppliers" value={formatMoney(s?.payables_minor)} sub={`${s?.suppliers_with_due ?? 0} of ${s?.suppliers ?? 0} suppliers`} tone={s?.payables_minor ? "danger" : "success"} />
        <SummaryCard label="Overdue (31+ days)" value={formatMoney(overdue)} sub={a ? `31–60 ${formatMoney(a.totals["31_60"])} · 61–90 ${formatMoney(a.totals["61_90"])} · 90+ ${formatMoney(a.totals.over_90)}` : ""} tone="warning" />
        <SummaryCard label="Open purchase orders" value={s?.open_purchase_orders ?? 0} sub={`${formatMoney(s?.open_purchase_orders_minor)} sent, not yet received`} tone="info" />
        <SummaryCard label="This month" value={formatMoney(s?.received_this_month_minor)} sub={`received · paid ${formatMoney(s?.paid_this_month_minor)}${s?.receivables_minor ? ` · suppliers owe you ${formatMoney(s.receivables_minor)}` : ""}`} tone="primary" />
      </Cards>
      <FilterBar>
        <span className="text-sm text-fg-secondary">Aging as of</span>
        <Input type="date" className="w-auto" value={asOf} onChange={(e) => setAsOf(e.target.value)} aria-label="As of" />
      </FilterBar>
      {aging.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Supplier</TH><TH>Terms</TH><TH right>Current</TH><TH right>31–60</TH><TH right>61–90</TH><TH right>90+</TH><TH right>Total</TH></tr></THead>
          <TBody>
            {a?.rows.length ? a.rows.map((r) => (
              <TR key={r.supplier.id}>
                <TD><Link href={`/admin/suppliers/${r.supplier.id}`} className="font-medium text-primary hover:underline">{r.supplier.name}</Link>{r.supplier.phone ? <div className="text-xs text-fg-muted">{r.supplier.phone}</div> : null}</TD>
                <TD className="text-fg-secondary">{r.supplier.payment_terms_days ? `${r.supplier.payment_terms_days} days` : "On delivery"}</TD>
                <TD right>{formatMoney(r.aging.current)}</TD>
                <TD right className={r.aging["31_60"] ? "text-warning" : "text-fg-muted"}>{formatMoney(r.aging["31_60"])}</TD>
                <TD right className={r.aging["61_90"] ? "text-warning" : "text-fg-muted"}>{formatMoney(r.aging["61_90"])}</TD>
                <TD right className={r.aging.over_90 ? "font-medium text-danger" : "text-fg-muted"}>{formatMoney(r.aging.over_90)}</TD>
                <TD right className="font-semibold">{formatMoney(r.aging.total)}</TD>
              </TR>
            )) : <EmptyRow colSpan={7}>Nothing owed to any supplier.</EmptyRow>}
            {a?.rows.length ? (
              <tr className="border-t bg-muted/60 font-semibold"><td className="h-12 px-3" colSpan={2}>Total</td><td className="px-3 text-right tabular">{formatMoney(a.totals.current)}</td><td className="px-3 text-right tabular">{formatMoney(a.totals["31_60"])}</td><td className="px-3 text-right tabular">{formatMoney(a.totals["61_90"])}</td><td className="px-3 text-right tabular">{formatMoney(a.totals.over_90)}</td><td className="px-3 text-right tabular">{formatMoney(a.totals.total)}</td></tr>
            ) : null}
          </TBody>
        </Table>
      )}
    </>
  );
}
