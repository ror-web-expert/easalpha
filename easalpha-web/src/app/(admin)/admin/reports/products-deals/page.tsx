"use client";
import { useState } from "react";
import { Package } from "lucide-react";
import type { ItemRow } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { daysAgo, isoDay } from "@/lib/dates";
import { Cards, type DateRange } from "@/components/admin/page";
import { ReportShell, useReport } from "@/components/admin/report-shell";
import { ITEM_COLUMNS, ItemsTable, itemExportRows } from "@/components/admin/report-sections";
import { Select, SummaryCard } from "@/components/ui";

type Kind = "" | "product" | "deal";

export default function ProductsDealsPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(6), to: isoDay() });
  const [kind, setKind] = useState<Kind>("");
  const q = useReport<{ data: ItemRow[] }>("items", range, { limit: 500 });
  const all = q.data?.data ?? [];
  const rows = kind === "deal" ? all.filter((r) => r.deal_id) : kind === "product" ? all.filter((r) => !r.deal_id) : all;
  const deals = all.filter((r) => r.deal_id);
  const revenue = rows.reduce((a, r) => a + r.revenue_minor, 0);
  const qty = rows.reduce((a, r) => a + r.quantity, 0);
  return (
    <ReportShell icon={Package} title="Products & Deals" description="Item and deal performance: quantity sold, orders, discounts and revenue per product or deal for the period."
      range={range} onRange={setRange} loading={q.isLoading} error={q.isError} onRetry={() => q.refetch()}
      filters={<Select className="w-auto" value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Kind"><option value="">Products and deals</option><option value="product">Products only</option><option value="deal">Deals only</option></Select>}
      exportData={{ name: "products-deals", columns: ITEM_COLUMNS, rows: itemExportRows(rows), footer: [`${rows.length} lines  |  ${qty} sold  |  Revenue ${formatMoney(revenue)}`] }}>
      <Cards>
        <SummaryCard label="Revenue" value={formatMoney(revenue)} sub={`${rows.length} lines`} tone="success" />
        <SummaryCard label="Quantity sold" value={qty} tone="info" />
        <SummaryCard label="Deals" value={deals.length} sub={`${formatMoney(deals.reduce((a, r) => a + r.revenue_minor, 0))} from deals`} tone="primary" />
        <SummaryCard label="Top seller" value={rows[0]?.name ?? "-"} sub={rows[0] ? `${rows[0].quantity} sold · ${formatMoney(rows[0].revenue_minor)}` : ""} tone="neutral" />
      </Cards>
      <ItemsTable rows={rows} />
    </ReportShell>
  );
}
