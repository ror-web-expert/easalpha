"use client";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { api } from "@/lib/api";
import type { AuditInsights } from "@/lib/types";
import { formatDate } from "@/lib/dates";
import { Cards } from "@/components/admin/page";
import { Card, CardBody, CardHeader, CardTitle, EmptyState, Loading, SummaryCard } from "@/components/ui";
import { Breakdown, TrendChart } from "@/components/charts/charts";
import { auditQuery, type AuditFilters } from "./audit-filters";

function top(counts: Record<string, number>, n = 10) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([label, value]) => ({ label: label || "unknown", value }));
}

/** Search Insights tab: counts by action, entity, actor and day for the current filters. */
export function AuditInsightsPanel({ filters }: { filters: AuditFilters }) {
  const query = auditQuery({ ...filters, recordId: "" });
  const q = useQuery({ queryKey: ["audit_logs", "insights", query], queryFn: () => api<AuditInsights>("/audit_logs/insights", { query }) });
  if (q.isLoading || !q.data) return <Loading />;
  const d = q.data;
  if (!d.total) return <EmptyState icon={ScrollText} title="No audit entries for these filters" hint="Widen the date range or clear the actor, action or entity filter." />;
  const days = Object.entries(d.by_day).map(([day, count]) => ({ day: formatDate(day).slice(0, 6), count }));
  const actors = d.by_actor.slice(0, 10).map((a) => ({ label: a.name, value: a.count }));
  return (
    <>
      <Cards className="lg:grid-cols-3 xl:grid-cols-3">
        <SummaryCard label="Entries" value={d.total.toLocaleString()} sub="Matching the filters" />
        <SummaryCard label="Distinct actors" value={d.by_actor.length} sub="Users who made changes" tone="info" />
        <SummaryCard label="Distinct entities" value={Object.keys(d.by_entity).length} sub="Tables touched" tone="neutral" />
      </Cards>
      <Card className="mb-4"><CardHeader><CardTitle>Entries by day</CardTitle></CardHeader><CardBody><TrendChart data={days} x="day" series={[{ key: "count", label: "Entries" }]} /></CardBody></Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card><CardHeader><CardTitle>By action</CardTitle></CardHeader><CardBody><Breakdown data={top(d.by_action)} money={false} /></CardBody></Card>
        <Card><CardHeader><CardTitle>By entity (top 10)</CardTitle></CardHeader><CardBody><Breakdown data={top(d.by_entity)} money={false} /></CardBody></Card>
        <Card><CardHeader><CardTitle>By actor (top 10)</CardTitle></CardHeader><CardBody><Breakdown data={actors} money={false} /></CardBody></Card>
      </div>
    </>
  );
}
