"use client";
import { useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import type { LoyaltyPointsReport } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { daysAgo, formatDate, isoDay } from "@/lib/dates";
import { Cards, type DateRange } from "@/components/admin/page";
import { ReportShell, useReport } from "@/components/admin/report-shell";
import { Card, CardBody, CardHeader, CardTitle, EmptyRow, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { BarsChart } from "@/components/charts/charts";

export default function LoyaltyPointsReportPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(29), to: isoDay() });
  const q = useReport<LoyaltyPointsReport>("loyalty_points", range);
  const d = q.data;
  const days = (d?.by_day ?? []).map((r) => ({ day: formatDate(r.date).slice(0, 6), issued: r.issued, redeemed: r.redeemed }));
  const top = d?.top_customers ?? [];
  return (
    <ReportShell icon={Star} title="Loyalty Points" description="Points issued and redeemed over the period, the value of redemptions, points still outstanding, and the customers who earned the most."
      range={range} onRange={setRange} loading={q.isLoading} error={q.isError} onRetry={() => q.refetch()}
      exportData={{
        name: "loyalty-points",
        columns: [{ header: "Day", key: "day" }, { header: "Issued", key: "issued", align: "right" }, { header: "Redeemed", key: "redeemed", align: "right" }, { header: "Adjusted", key: "adjusted", align: "right" }],
        rows: (d?.by_day ?? []).map((r) => ({ day: formatDate(r.date), issued: r.issued, redeemed: r.redeemed, adjusted: r.adjusted })),
        footer: d ? [`Issued ${d.issued}  |  Redeemed ${d.redeemed} (${formatMoney(d.redeemed_value_minor)})  |  Adjusted ${d.adjusted}  |  Outstanding ${d.outstanding}`, `Top customers: ${top.slice(0, 5).map((c) => `${c.name ?? "Unknown"} ${c.points}`).join(", ") || "-"}`] : undefined,
      }}>
      {d ? (
        <>
          <Cards>
            <SummaryCard label="Points issued" value={d.issued.toLocaleString()} sub="Earned on paid orders" tone="success" />
            <SummaryCard label="Points redeemed" value={d.redeemed.toLocaleString()} sub={`Worth ${formatMoney(d.redeemed_value_minor)} in discounts`} tone="primary" />
            <SummaryCard label="Adjusted" value={d.adjusted.toLocaleString()} sub="Manual adjustments, refunds and expiry" tone="neutral" />
            <SummaryCard label="Outstanding" value={d.outstanding.toLocaleString()} sub="Across all active customers" tone="warning" />
          </Cards>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Points by day</CardTitle></CardHeader><CardBody><BarsChart data={days} x="day" series={[{ key: "issued", label: "Issued" }, { key: "redeemed", label: "Redeemed" }]} /></CardBody></Card>
            <Card><CardHeader><CardTitle>Top customers</CardTitle><span className="text-sm text-fg-secondary">Points earned in the period</span></CardHeader>
              <Table><THead><tr><TH>Customer</TH><TH right>Points</TH></tr></THead><TBody>{top.length ? top.map((c) => <TR key={c.customer_id}><TD><Link href={`/admin/customers/${c.customer_id}`} className="font-medium text-primary hover:underline">{c.name ?? "Unknown"}</Link></TD><TD right className="font-medium">{c.points.toLocaleString()}</TD></TR>) : <EmptyRow colSpan={2}>No points earned in this period</EmptyRow>}</TBody></Table></Card>
            <Card className="lg:col-span-2"><CardHeader><CardTitle>Redemption options</CardTitle><span className="text-sm text-fg-secondary">What customers can spend points on</span></CardHeader>
              <Table><THead><tr><TH>Option</TH><TH right>Points</TH><TH>Reward</TH></tr></THead><TBody>{d.options.length ? d.options.map((o) => <TR key={o.id}><TD className="font-medium">{o.name}</TD><TD right>{o.points}</TD><TD className="text-fg-secondary">{o.kind === "product" ? o.product_name ?? "Free item" : o.kind === "percent" ? `${o.value}% off` : formatMoney(o.value * 100)}</TD></TR>) : <EmptyRow colSpan={3}>No redemption options. Set them under Settings, Loyalty Points.</EmptyRow>}</TBody></Table></Card>
          </div>
        </>
      ) : null}
    </ReportShell>
  );
}
