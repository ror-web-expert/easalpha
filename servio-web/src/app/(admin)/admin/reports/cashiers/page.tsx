"use client";
import { useState } from "react";
import Link from "next/link";
import { UserCircle } from "lucide-react";
import type { CashierRow } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { daysAgo, isoDay } from "@/lib/dates";
import { Cards, type DateRange } from "@/components/admin/page";
import { ReportShell, useReport } from "@/components/admin/report-shell";
import { CASHIER_COLUMNS, CashiersTable, cashierExportRows } from "@/components/admin/report-sections";
import { Card, CardBody, CardHeader, CardTitle, SummaryCard } from "@/components/ui";
import { Breakdown } from "@/components/charts/charts";

export default function CashiersReportPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(6), to: isoDay() });
  const q = useReport<{ data: CashierRow[] }>("cashiers", range);
  const rows = q.data?.data ?? [];
  const revenue = rows.reduce((a, r) => a + r.revenue_minor, 0);
  const voids = rows.reduce((a, r) => a + r.voids, 0);
  return (
    <ReportShell icon={UserCircle} title="Cashiers" description="Cashier activity: orders paid, discounts given and voids per cashier who took the payment."
      range={range} onRange={setRange} loading={q.isLoading} error={q.isError} onRetry={() => q.refetch()}
      exportData={{ name: "cashiers", columns: CASHIER_COLUMNS, rows: cashierExportRows(rows), footer: [`${rows.length} cashiers  |  Revenue ${formatMoney(revenue)}  |  Discounts ${formatMoney(rows.reduce((a, r) => a + r.discount_minor, 0))}  |  Voids ${voids}`] }}>
      <Cards>
        <SummaryCard label="Cashiers" value={rows.length} tone="info" />
        <SummaryCard label="Orders paid" value={rows.reduce((a, r) => a + r.orders, 0)} tone="primary" />
        <SummaryCard label="Revenue" value={formatMoney(revenue)} tone="success" />
        <SummaryCard label="Voids" value={voids} sub={`Discounts ${formatMoney(rows.reduce((a, r) => a + r.discount_minor, 0))}`} tone={voids ? "danger" : "neutral"} />
      </Cards>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card><CardHeader><CardTitle>Revenue by cashier</CardTitle></CardHeader><CardBody><Breakdown data={rows.map((r) => ({ label: r.name ?? "Unknown", value: r.revenue_minor }))} /><p className="mt-4 text-xs text-fg-secondary">For money held against money collected, see <Link href="/admin/reports/cashier-till" className="text-primary hover:underline">Cashier Till</Link>.</p></CardBody></Card>
        <CashiersTable rows={rows} />
      </div>
    </ReportShell>
  );
}
