"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { api } from "@/lib/api";
import type { PurchasingReport } from "@/lib/types";
import { formatMoney, formatPercent } from "@/lib/money";
import { daysAgo, isoDay } from "@/lib/dates";
import { formatBaseQty } from "@/lib/units";
import { Cards, DateRangePicker, FilterBar, PageHeader, type DateRange } from "@/components/admin/page";
import { EmptyRow, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";

type GroupBy = "supplier" | "item";

export default function PurchasesReportPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(29), to: isoDay() });
  const [groupBy, setGroupBy] = useState<GroupBy>("supplier");
  const report = useQuery({ queryKey: ["purchasing_report", range, groupBy], queryFn: () => api<PurchasingReport>("/purchasing/report", { query: { from: range.from, to: range.to, group_by: groupBy } }) });
  const d = report.data;
  return (
    <>
      <PageHeader icon={Receipt} title="Purchases report" description="Posted goods receipts in the period, by supplier or by item, with returns netted off." />
      <FilterBar>
        <DateRangePicker value={range} onChange={setRange} />
        <Tabs value={groupBy} onChange={setGroupBy} items={[{ value: "supplier", label: "By supplier" }, { value: "item", label: "By item" }]} />
      </FilterBar>
      <Cards>
        <SummaryCard label="Purchased" value={formatMoney(d?.total_minor)} sub={`${d?.rows.reduce((a, r) => a + r.receipts, 0) ?? 0} receipts`} tone="primary" />
        <SummaryCard label="Returned" value={formatMoney(d?.returns_minor)} tone="warning" />
        <SummaryCard label="Net purchases" value={formatMoney((d?.total_minor ?? 0) - (d?.returns_minor ?? 0))} tone="success" />
      </Cards>
      {report.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>{groupBy === "supplier" ? "Supplier" : "Item"}</TH><TH right>Receipts</TH>{groupBy === "item" ? <TH right>Quantity</TH> : null}<TH right>Value</TH><TH right>Share</TH></tr></THead>
          <TBody>
            {d?.rows.length ? d.rows.map((r) => (
              <TR key={r.supplier?.id ?? r.item?.id ?? r.key}>
                <TD>{r.supplier ? <Link href={`/admin/suppliers/${r.supplier.id}`} className="font-medium text-primary hover:underline">{r.key}</Link> : r.item ? <Link href={`/admin/inventory/items/${r.item.id}`} className="font-medium text-primary hover:underline">{r.key}</Link> : r.key}{r.item?.category ? <span className="ml-2 text-xs text-fg-muted">{r.item.category}</span> : null}</TD>
                <TD right>{r.receipts}</TD>
                {groupBy === "item" ? <TD right>{r.item ? formatBaseQty(r.quantity, r.item.base_unit.code) : r.quantity}</TD> : null}
                <TD right className="font-medium">{formatMoney(r.value_minor)}</TD>
                <TD right className="text-fg-secondary">{formatPercent(d.total_minor ? (r.value_minor * 100) / d.total_minor : 0)}</TD>
              </TR>
            )) : <EmptyRow colSpan={groupBy === "item" ? 5 : 4}>No receipts in this range.</EmptyRow>}
          </TBody>
        </Table>
      )}
    </>
  );
}
