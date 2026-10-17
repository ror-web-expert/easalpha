"use client";
import { useState } from "react";
import { Layers } from "lucide-react";
import type { CategoryRow } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { daysAgo, isoDay } from "@/lib/dates";
import { Cards, type DateRange } from "@/components/admin/page";
import { ReportShell, useReport } from "@/components/admin/report-shell";
import { CATEGORY_COLUMNS, CategoriesSection, categoryExportRows } from "@/components/admin/report-sections";
import { SummaryCard } from "@/components/ui";

export default function CategoryReportPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(6), to: isoDay() });
  const q = useReport<{ data: CategoryRow[] }>("categories", range);
  const rows = q.data?.data ?? [];
  const revenue = rows.reduce((a, r) => a + r.revenue_minor, 0);
  return (
    <ReportShell icon={Layers} title="Category Report" description="Sales by menu category: quantity and revenue per category with each category's share of the period."
      range={range} onRange={setRange} loading={q.isLoading} error={q.isError} onRetry={() => q.refetch()}
      exportData={{ name: "categories", columns: CATEGORY_COLUMNS, rows: categoryExportRows(rows), footer: [`${rows.length} categories  |  Revenue ${formatMoney(revenue)}`] }}>
      <Cards>
        <SummaryCard label="Revenue" value={formatMoney(revenue)} sub={`${rows.length} categories`} tone="success" />
        <SummaryCard label="Quantity sold" value={rows.reduce((a, r) => a + r.quantity, 0)} tone="info" />
        <SummaryCard label="Top category" value={rows[0]?.name ?? "-"} sub={rows[0] && revenue ? `${((rows[0].revenue_minor * 100) / revenue).toFixed(1)}% of revenue` : ""} tone="primary" />
      </Cards>
      <CategoriesSection rows={rows} />
    </ReportShell>
  );
}
