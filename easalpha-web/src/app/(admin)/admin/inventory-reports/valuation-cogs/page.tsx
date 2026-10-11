"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Calculator, Boxes, Flame, Receipt, Percent } from "lucide-react";
import { api } from "@/lib/api";
import type { ValuationCogsReport } from "@/lib/types";
import { formatMoney, formatPercent } from "@/lib/money";
import { isoDay } from "@/lib/dates";
import { Cards, DateRangePicker, FilterBar, PageHeader, type DateRange } from "@/components/admin/page";
import { Breakdown } from "@/components/charts/charts";
import { Card, CardBody, CardHeader, CardTitle, EmptyRow, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

const monthStart = () => { const d = new Date(); return isoDay(new Date(d.getFullYear(), d.getMonth(), 1)); };

export default function ValuationCogsPage() {
  const [range, setRange] = useState<DateRange>({ from: monthStart(), to: isoDay() });
  const report = useQuery({ queryKey: ["stock_valuation_cogs", range], queryFn: () => api<ValuationCogsReport>("/stock/valuation_cogs", { query: { from: range.from, to: range.to } }) });
  const d = report.data;
  const margin = d?.gross_margin_percent;
  return (
    <>
      <PageHeader icon={Calculator} title="Valuation & COGS" description="Stock value right now by section, and the cost of goods sold in the period: what the sold recipes and packaging cost when they were deducted, set against revenue before tax." />
      <FilterBar><DateRangePicker value={range} onChange={setRange} /></FilterBar>
      <Cards>
        <SummaryCard label="Stock value" value={formatMoney(d?.stock_value_minor)} sub="All sections, at average cost, today" icon={Boxes} tone="primary" />
        <SummaryCard label="COGS" value={formatMoney(d?.cogs_minor)} sub="Cost of what was sold in the period" icon={Flame} tone="warning" />
        <SummaryCard label="Revenue" value={formatMoney(d?.revenue_minor)} sub="Completed orders, before tax" icon={Receipt} tone="info" />
        <SummaryCard label="Gross margin" value={margin === null || margin === undefined ? "-" : formatPercent(margin)} sub={d?.revenue_minor ? `${formatMoney(d.revenue_minor - d.cogs_minor)} gross profit` : "No revenue in the period"} icon={Percent} tone={margin === null || margin === undefined ? "neutral" : margin < 50 ? "danger" : margin < 65 ? "warning" : "success"} />
      </Cards>
      {report.isLoading ? <Loading /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Valuation by section</CardTitle><span className="text-sm text-fg-secondary">{formatMoney(d?.stock_value_minor)}</span></CardHeader>
            <Table>
              <THead><tr><TH>Section</TH><TH right>Items with stock</TH><TH right>Value</TH><TH right>Share</TH></tr></THead>
              <TBody>
                {d?.valuation.length ? d.valuation.map((v) => (
                  <TR key={v.section.id}>
                    <TD className="font-medium">{v.section.name}</TD>
                    <TD right className="text-fg-secondary">{v.items}</TD>
                    <TD right className="font-medium">{formatMoney(v.value_minor)}</TD>
                    <TD right className="text-fg-secondary">{formatPercent(d.stock_value_minor ? (v.value_minor * 100) / d.stock_value_minor : 0)}</TD>
                  </TR>
                )) : <EmptyRow colSpan={4}>No sections hold stock.</EmptyRow>}
              </TBody>
            </Table>
          </Card>
          <Card>
            <CardHeader><CardTitle>COGS by category</CardTitle><span className="text-sm text-fg-secondary">{formatMoney(d?.cogs_minor)}</span></CardHeader>
            <CardBody><Breakdown data={d?.cogs_by_category.map((c) => ({ label: c.category, value: c.cogs_minor }))} /></CardBody>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>COGS by item</CardTitle><span className="text-sm text-fg-secondary">Top {d?.cogs_by_item.length ?? 0}</span></CardHeader>
            <Table>
              <THead><tr><TH>Item</TH><TH>Category</TH><TH right>COGS</TH><TH right>Share</TH></tr></THead>
              <TBody>
                {d?.cogs_by_item.length ? d.cogs_by_item.map((r) => (
                  <TR key={r.item.id}>
                    <TD><Link href={`/admin/inventory/items/${r.item.id}`} className="font-medium text-primary hover:underline">{r.item.name}</Link>{r.item.is_packaging ? <span className="ml-2 text-xs text-fg-muted">packaging</span> : null}</TD>
                    <TD className="text-fg-secondary">{r.item.category ?? "-"}</TD>
                    <TD right className="font-medium">{formatMoney(r.cogs_minor)}</TD>
                    <TD right className="text-fg-secondary">{formatPercent(d.cogs_minor ? (r.cogs_minor * 100) / d.cogs_minor : 0)}</TD>
                  </TR>
                )) : <EmptyRow colSpan={4}>Nothing sold with a recipe in this range.</EmptyRow>}
              </TBody>
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
