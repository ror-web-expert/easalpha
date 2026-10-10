"use client";
import { useState } from "react";
import { Users } from "lucide-react";
import type { CustomerRow } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { daysAgo, isoDay } from "@/lib/dates";
import { Cards, SearchInput, type DateRange } from "@/components/admin/page";
import { ReportShell, useReport } from "@/components/admin/report-shell";
import { CUSTOMER_COLUMNS, CustomersTable, customerExportRows } from "@/components/admin/report-sections";
import { SummaryCard } from "@/components/ui";

export default function CustomersReportPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(29), to: isoDay() });
  const [search, setSearch] = useState("");
  const q = useReport<{ data: CustomerRow[] }>("customers", range);
  const all = q.data?.data ?? [];
  const needle = search.trim().toLowerCase();
  const rows = needle ? all.filter((r) => (r.name ?? "").toLowerCase().includes(needle) || (r.phone ?? "").includes(needle)) : all;
  const revenue = rows.reduce((a, r) => a + r.revenue_minor, 0);
  const owing = rows.filter((r) => (r.balance_minor ?? 0) > 0);
  return (
    <ReportShell icon={Users} title="Customers" description="Customer activity and spend: orders, revenue, outstanding balance and last visit for every customer who ordered in the period."
      range={range} onRange={setRange} loading={q.isLoading} error={q.isError} onRetry={() => q.refetch()}
      filters={<SearchInput value={search} onChange={setSearch} placeholder="Name or phone" />}
      exportData={{ name: "customers", columns: CUSTOMER_COLUMNS, rows: customerExportRows(rows), footer: [`${rows.length} customers  |  Revenue ${formatMoney(revenue)}  |  ${owing.length} with a balance (${formatMoney(owing.reduce((a, r) => a + (r.balance_minor ?? 0), 0))})`] }}>
      <Cards>
        <SummaryCard label="Customers" value={rows.length} sub="Ordered in the period" tone="info" />
        <SummaryCard label="Revenue" value={formatMoney(revenue)} sub={`Average ${formatMoney(rows.length ? Math.round(revenue / rows.length) : 0)} per customer`} tone="success" />
        <SummaryCard label="Orders" value={rows.reduce((a, r) => a + r.orders, 0)} tone="primary" />
        <SummaryCard label="With a balance" value={owing.length} sub={formatMoney(owing.reduce((a, r) => a + (r.balance_minor ?? 0), 0))} tone={owing.length ? "warning" : "neutral"} />
      </Cards>
      <CustomersTable rows={rows} />
    </ReportShell>
  );
}
