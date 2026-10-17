"use client";
import { useState } from "react";
import { Percent } from "lucide-react";
import type { RegularDiscountsReport } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { daysAgo, isoDay } from "@/lib/dates";
import { Cards, type DateRange } from "@/components/admin/page";
import { ReportShell, ShareBar, useReport } from "@/components/admin/report-shell";
import { pctOf } from "@/components/admin/report-helpers";
import { Badge, Card, CardHeader, CardTitle, EmptyRow, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

const tierValue = (kind: string | null, value: number | null) => value === null || kind === null ? "-" : kind === "percent" ? `${value}%` : formatMoney(value * 100);

export default function RegularDiscountsReportPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(29), to: isoDay() });
  const q = useReport<RegularDiscountsReport>("regular_discounts", range);
  const d = q.data;
  const rows = d?.rows ?? [];
  return (
    <ReportShell icon={Percent} title="Regular Discounts" description="Automatic tier discounts given: orders and amount per loyalty tier, where the tier depends on how recently the customer last ordered."
      range={range} onRange={setRange} loading={q.isLoading} error={q.isError} onRetry={() => q.refetch()}
      exportData={{
        name: "regular-discounts",
        columns: [{ header: "Tier", key: "tier" }, { header: "Within days", key: "within_days", align: "right" }, { header: "Discount", key: "discount" }, { header: "Orders", key: "orders", align: "right" }, { header: "Amount", key: "amount", align: "right" }, { header: "Share", key: "share", align: "right" }],
        rows: rows.map((r) => ({ tier: r.tier, within_days: r.within_days ?? "", discount: tierValue(r.kind, r.value), orders: r.orders, amount: formatMoney(r.amount_minor), share: `${pctOf(r.amount_minor, d?.totals.amount_minor ?? 0)}%` })),
        footer: d ? [`${d.totals.orders} orders discounted  |  ${formatMoney(d.totals.amount_minor)} given  |  ${d.tiers.length} active tiers`] : undefined,
      }}>
      <Cards>
        <SummaryCard label="Orders discounted" value={d?.totals.orders ?? 0} tone="info" />
        <SummaryCard label="Discount given" value={formatMoney(d?.totals.amount_minor)} sub={`Average ${formatMoney(d?.totals.orders ? Math.round(d.totals.amount_minor / d.totals.orders) : 0)} per order`} tone="warning" />
        <SummaryCard label="Active tiers" value={d?.tiers.length ?? 0} sub={(d?.tiers ?? []).map((t) => t.name).join(", ")} tone="primary" />
      </Cards>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Table>
          <THead><tr><TH>Tier</TH><TH right>Within days</TH><TH>Discount</TH><TH right>Orders</TH><TH right>Amount</TH><TH>Share</TH></tr></THead>
          <TBody>{rows.length ? rows.map((r) => <TR key={r.tier_id ?? r.tier}><TD className="font-medium">{r.tier}</TD><TD right>{r.within_days ?? "-"}</TD><TD>{tierValue(r.kind, r.value)}</TD><TD right>{r.orders}</TD><TD right className="font-medium">{formatMoney(r.amount_minor)}</TD><TD><ShareBar percent={pctOf(r.amount_minor, d?.totals.amount_minor ?? 0)} /></TD></TR>) : <EmptyRow colSpan={6}>No automatic discounts were applied in this period</EmptyRow>}</TBody>
        </Table>
        <Card className="h-fit">
          <CardHeader><CardTitle>Current tiers</CardTitle></CardHeader>
          <Table><THead><tr><TH>Tier</TH><TH right>Within</TH><TH right>Gives</TH></tr></THead><TBody>{d?.tiers.length ? d.tiers.map((t) => <TR key={t.id}><TD>{t.name}{!t.active ? <Badge className="ml-2">off</Badge> : null}</TD><TD right>{t.within_days} days</TD><TD right>{tierValue(t.kind, t.value)}</TD></TR>) : <EmptyRow colSpan={3}>No tiers. Set them under Settings, Regular Discounts.</EmptyRow>}</TBody></Table>
        </Card>
      </div>
    </ReportShell>
  );
}
