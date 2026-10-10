"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { api } from "@/lib/api";
import type { ConsumptionReport } from "@/lib/types";
import { formatMoney, formatPercent } from "@/lib/money";
import { daysAgo, isoDay } from "@/lib/dates";
import { formatBaseQty, formatUnitCost } from "@/lib/units";
import { Cards, DateRangePicker, FilterBar, PageHeader, type DateRange } from "@/components/admin/page";
import { EmptyRow, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function ConsumptionPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(29), to: isoDay() });
  const report = useQuery({ queryKey: ["stock_consumption", range], queryFn: () => api<ConsumptionReport>("/stock/consumption", { query: { from: range.from, to: range.to } }) });
  const d = report.data;
  const top = d?.rows[0];
  return (
    <>
      <PageHeader icon={Flame} title="Consumption" description="Ingredients and packaging used by sales in the period, net of returns, valued at the cost when deducted." />
      <FilterBar><DateRangePicker value={range} onChange={setRange} /></FilterBar>
      <Cards>
        <SummaryCard label="Cost of goods used" value={formatMoney(d?.total_value_minor)} sub={`${d?.rows.length ?? 0} items`} tone="primary" />
        <SummaryCard label="Top item" value={top ? top.item.name : "-"} sub={top ? `${formatMoney(top.value_minor)} · ${formatPercent(d && d.total_value_minor ? (top.value_minor * 100) / d.total_value_minor : 0)} of the total` : ""} tone="info" />
      </Cards>
      {report.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Item</TH><TH>Category</TH><TH right>Used</TH><TH right>Avg cost</TH><TH right>Value</TH><TH right>Share</TH></tr></THead>
          <TBody>
            {d?.rows.length ? d.rows.map((r) => (
              <TR key={r.item.id}>
                <TD><Link href={`/admin/stock/items/${r.item.id}`} className="font-medium text-primary hover:underline">{r.item.name}</Link>{r.item.is_packaging ? <span className="ml-2 text-xs text-fg-muted">packaging</span> : null}</TD>
                <TD className="text-fg-secondary">{r.item.category ?? "-"}</TD>
                <TD right>{formatBaseQty(r.quantity, r.item.base_unit.code)}</TD>
                <TD right className="text-fg-secondary">{formatUnitCost(r.item.avg_cost_minor_per_base, r.item.base_unit.code, formatMoney)}</TD>
                <TD right className="font-medium">{formatMoney(r.value_minor)}</TD>
                <TD right className="text-fg-secondary">{formatPercent(d.total_value_minor ? (r.value_minor * 100) / d.total_value_minor : 0)}</TD>
              </TR>
            )) : <EmptyRow colSpan={6}>Nothing consumed in this range. Sales deduct stock only for products with a recipe.</EmptyRow>}
          </TBody>
        </Table>
      )}
    </>
  );
}
