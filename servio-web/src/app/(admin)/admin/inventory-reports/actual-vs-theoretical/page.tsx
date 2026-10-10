"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { api } from "@/lib/api";
import type { ActualVsTheoreticalReport } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { daysAgo, isoDay } from "@/lib/dates";
import { formatBaseQty } from "@/lib/units";
import { Cards, DateRangePicker, FilterBar, PageHeader, type DateRange } from "@/components/admin/page";
import { useSections } from "@/components/admin/stock";
import { formatVariance, varianceClass } from "@/components/admin/stockreport-helpers";
import { Badge, EmptyRow, Loading, Select, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function ActualVsTheoreticalPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(29), to: isoDay() });
  const [section, setSection] = useState("");
  const sections = useSections();
  const report = useQuery({ queryKey: ["stock_actual_vs_theoretical", range, section], queryFn: () => api<ActualVsTheoreticalReport>("/stock/actual_vs_theoretical", { query: { from: range.from, to: range.to, section_id: section } }) });
  const d = report.data;
  const counted = d?.rows.filter((r) => r.counted).length ?? 0;
  const short = d?.rows.filter((r) => Number(r.variance) < 0).length ?? 0;
  return (
    <>
      <PageHeader icon={Scale} title="Actual vs Theoretical" description="Counted stock against what recipes say should remain. Theoretical is the balance the ledger expected from sales, receipts and other movements; a stock count posts the difference between that and what was found, so the count entries in the period are the variance. Items that were sold but never counted show no variance." />
      <FilterBar>
        <DateRangePicker value={range} onChange={setRange} />
        <Select className="w-auto" value={section} onChange={(e) => setSection(e.target.value)} aria-label="Section"><option value="">All sections</option>{sections.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
      </FilterBar>
      <Cards>
        <SummaryCard label="Total variance value" value={formatMoney(d?.variance_value_minor)} sub={d && d.variance_value_minor < 0 ? "Less was found than recipes expected" : d && d.variance_value_minor > 0 ? "More was found than recipes expected" : "Counts match the recipes"} tone={d && d.variance_value_minor < 0 ? "danger" : d && d.variance_value_minor > 0 ? "success" : "neutral"} />
        <SummaryCard label="Items counted" value={counted} sub={`of ${d?.rows.length ?? 0} items used or counted`} tone="info" />
        <SummaryCard label="Items short" value={short} sub="Counted below the theoretical balance" tone={short ? "warning" : "neutral"} />
      </Cards>
      {report.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Item</TH><TH right>Theoretical</TH><TH right>Actual</TH><TH right>Variance</TH><TH right>Variance value</TH><TH right>Used by sales</TH><TH right>Waste</TH><TH>Counted</TH></tr></THead>
          <TBody>
            {d?.rows.length ? d.rows.map((r) => (
              <TR key={r.item.id}>
                <TD><Link href={`/admin/inventory/items/${r.item.id}`} className="font-medium text-primary hover:underline">{r.item.name}</Link>{r.item.category ? <span className="ml-2 text-xs text-fg-muted">{r.item.category}</span> : null}</TD>
                <TD right className="text-fg-secondary">{formatBaseQty(r.theoretical, r.unit_code)}</TD>
                <TD right className={Number(r.actual) < 0 ? "font-medium text-danger" : "font-medium"}>{formatBaseQty(r.actual, r.unit_code)}</TD>
                <TD right className={varianceClass(r.variance)}>{formatVariance(r.variance, r.unit_code)}</TD>
                <TD right className={varianceClass(r.variance_value_minor)}>{r.variance_value_minor ? formatMoney(r.variance_value_minor) : "-"}</TD>
                <TD right className="text-fg-secondary">{Number(r.used_by_sales) ? formatBaseQty(r.used_by_sales, r.unit_code) : "-"}</TD>
                <TD right className={Number(r.waste) ? "text-danger" : "text-fg-muted"}>{Number(r.waste) ? formatBaseQty(r.waste, r.unit_code) : "-"}</TD>
                <TD>{r.counted ? <Badge variant="success">counted</Badge> : <Badge variant="outline">not counted</Badge>}</TD>
              </TR>
            )) : <EmptyRow colSpan={8}>No sales or counts in this range. Post a Stock Count under Stock Actions to measure variance.</EmptyRow>}
          </TBody>
        </Table>
      )}
    </>
  );
}
