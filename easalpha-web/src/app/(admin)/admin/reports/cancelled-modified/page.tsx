"use client";
import { useState } from "react";
import { Undo2 } from "lucide-react";
import type { DiscountsReport, ModifiedRow, VoidsReport } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { daysAgo, isoDay } from "@/lib/dates";
import { Cards, type DateRange } from "@/components/admin/page";
import { ReportShell, type ReportExport, useReport } from "@/components/admin/report-shell";
import { DISCOUNT_COLUMNS, DiscountsSection, MODIFIED_COLUMNS, ModifiedTable, VOID_COLUMNS, VoidsSection, discountExportRows, modifiedExportRows, voidExportRows } from "@/components/admin/report-sections";
import { Loading, SummaryCard, Tabs } from "@/components/ui";

type Tab = "cancelled" | "modified" | "discounts";

export default function CancelledModifiedPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(6), to: isoDay() });
  const [tab, setTab] = useState<Tab>("cancelled");
  const voids = useReport<VoidsReport>("voids", range);
  const modified = useReport<{ data: ModifiedRow[] }>("modified", range);
  const discounts = useReport<DiscountsReport>("discounts", range);
  const mods = modified.data?.data ?? [];
  const exportData: ReportExport = tab === "cancelled"
    ? { name: "cancelled-orders", columns: VOID_COLUMNS, rows: voidExportRows(voids.data?.rows ?? []), footer: voids.data ? [`${voids.data.count} voided orders  |  ${formatMoney(voids.data.amount_minor)}`] : undefined }
    : tab === "modified"
      ? { name: "modified-orders", columns: MODIFIED_COLUMNS, rows: modifiedExportRows(mods), footer: [`${mods.length} orders changed after sending`], landscape: true }
      : { name: "discounts", columns: DISCOUNT_COLUMNS, rows: discountExportRows(discounts.data?.rows ?? []), footer: discounts.data ? [`${discounts.data.count} discounts  |  ${formatMoney(discounts.data.amount_minor)}`] : undefined };
  return (
    <ReportShell icon={Undo2} title="Cancelled & Modified Orders" description="Every cancellation and edit, the theft-and-error report: voided orders with who approved them, orders changed after the kitchen ticket went out, and manual discounts."
      range={range} onRange={setRange} loading={voids.isLoading} error={voids.isError} onRetry={() => voids.refetch()} exportData={exportData}>
      <Cards>
        <SummaryCard label="Cancelled orders" value={voids.data?.count ?? 0} sub={formatMoney(voids.data?.amount_minor)} tone={voids.data?.count ? "danger" : "neutral"} />
        <SummaryCard label="Modified after sending" value={mods.length} sub={`${mods.reduce((a, r) => a + r.tickets.length, 0)} kitchen tickets`} tone={mods.length ? "warning" : "neutral"} />
        <SummaryCard label="Manual discounts" value={discounts.data?.count ?? 0} sub={formatMoney(discounts.data?.amount_minor)} tone="info" />
        <SummaryCard label="Approvals" value={(voids.data?.rows ?? []).filter((r) => r.approved_by).length + (discounts.data?.rows ?? []).filter((r) => r.approved_by).length} sub="Voids and discounts a supervisor approved" tone="primary" />
      </Cards>
      <Tabs value={tab} onChange={setTab} className="no-print mb-4 w-fit max-w-full" items={[{ value: "cancelled", label: "Cancelled", count: voids.data?.count }, { value: "modified", label: "Modified", count: mods.length }, { value: "discounts", label: "Discounts", count: discounts.data?.count }]} />
      {tab === "cancelled" && voids.data ? <VoidsSection report={voids.data} cards={false} /> : null}
      {tab === "modified" ? (modified.isLoading ? <Loading /> : <ModifiedTable rows={mods} />) : null}
      {tab === "discounts" ? (discounts.isLoading || !discounts.data ? <Loading /> : <DiscountsSection report={discounts.data} cards={false} />) : null}
    </ReportShell>
  );
}
