"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3 } from "lucide-react";
import type { ByDayRow, ByHourRow, ReportOverview } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, daysAgo, isoDay } from "@/lib/dates";
import { type DateRange } from "@/components/admin/page";
import { ReportShell, useReport } from "@/components/admin/report-shell";
import { OverviewCards, OverviewCharts } from "@/components/admin/report-sections";
import { Card, CardHeader, CardTitle, EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

// The old tabbed page answered /admin/reports#items and friends; each tab is now its own SPEC sidebar entry.
const HASH_ROUTES: Record<string, string> = {
  items: "/admin/reports/products-deals", categories: "/admin/reports/categories", cashiers: "/admin/reports/cashiers", voids: "/admin/reports/cancelled-modified",
  discounts: "/admin/reports/cancelled-modified", modified: "/admin/reports/cancelled-modified", customers: "/admin/reports/customers", shifts: "/admin/reports/cashier-till", grand: "/admin/reports/grand",
};

export default function BusinessOverviewPage() {
  const router = useRouter();
  const [range, setRange] = useState<DateRange>({ from: daysAgo(6), to: isoDay() });
  useEffect(() => {
    const to = HASH_ROUTES[window.location.hash.slice(1)];
    if (to) router.replace(to);
  }, [router]);
  const o = useReport<ReportOverview>("overview", range);
  const byDay = useReport<{ data: ByDayRow[] }>("by_day", range);
  const byHour = useReport<{ data: ByHourRow[] }>("by_hour", range);
  const days = byDay.data?.data ?? [];
  const ov = o.data;
  return (
    <ReportShell icon={BarChart3} title="Business Overview" description="Headline sales and order metrics for the period. Paid orders by business day, money in rupees."
      range={range} onRange={setRange} loading={o.isLoading} error={o.isError} onRetry={() => o.refetch()}
      exportData={{
        name: "business-overview",
        columns: [{ header: "Day", key: "day" }, { header: "Orders", key: "orders", align: "right" }, { header: "Discounts", key: "discount", align: "right" }, { header: "Tax", key: "tax", align: "right" }, { header: "Revenue", key: "revenue", align: "right" }],
        rows: days.map((r) => ({ day: formatDate(r.business_day), orders: r.orders, discount: formatMoney(r.discount_minor), tax: formatMoney(r.tax_minor), revenue: formatMoney(r.revenue_minor) })),
        footer: ov ? [`Revenue ${formatMoney(ov.revenue_minor)}  |  ${ov.orders} paid orders  |  Average order ${formatMoney(ov.average_order_minor)}  |  Discounts ${formatMoney(ov.discount_minor)}  |  Voided ${ov.voided} (${formatMoney(ov.voided_minor)})`] : undefined,
      }}>
      {ov ? (
        <>
          <OverviewCards o={ov} />
          <OverviewCharts o={ov} byDay={days} byHour={byHour.data?.data ?? []} />
          <Card className="mt-4">
            <CardHeader><CardTitle>By day</CardTitle></CardHeader>
            <Table><THead><tr><TH>Day</TH><TH right>Orders</TH><TH right>Discounts</TH><TH right>Tax</TH><TH right>Revenue</TH></tr></THead>
              <TBody>{days.length ? days.map((r) => <TR key={r.business_day}><TD>{formatDate(r.business_day)}</TD><TD right>{r.orders}</TD><TD right>{formatMoney(r.discount_minor)}</TD><TD right>{formatMoney(r.tax_minor)}</TD><TD right className="font-medium">{formatMoney(r.revenue_minor)}</TD></TR>) : <EmptyRow colSpan={5} />}</TBody></Table>
          </Card>
        </>
      ) : null}
    </ReportShell>
  );
}
