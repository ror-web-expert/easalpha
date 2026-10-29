"use client";
// Canteen reports over any range: meals by day, session, dish or department, and per worker, with CSV like the other reports.
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download } from "lucide-react";
import { api } from "@/lib/api";
import type { CanteenSummary, CanteenWorkersReport, MealClaim } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime, isoDay } from "@/lib/dates";
import { Cards, DateRangePicker, FilterBar, PageHeader, type DateRange } from "@/components/admin/page";
import { Badge, Button, Dialog, EmptyRow, Loading, SummaryCard, Table, Tabs, TBody, TD, TH, THead, TR } from "@/components/ui";

type View = "day" | "session" | "dish" | "department" | "workers";
const VIEWS: { value: View; label: string }[] = [{ value: "day", label: "By day" }, { value: "session", label: "By session" }, { value: "dish", label: "By dish" }, { value: "department", label: "By department" }, { value: "workers", label: "Per worker" }];

function csvDownload(name: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob([[header, ...rows].map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

export default function CanteenReportsPage() {
  return <Suspense fallback={<Loading />}><Reports /></Suspense>;
}

function Reports() {
  const params = useSearchParams();
  const monthStart = isoDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [range, setRange] = useState<DateRange>({ from: monthStart, to: isoDay() });
  const [view, setView] = useState<View>(params.get("worker") ? "workers" : "day");
  const [worker, setWorker] = useState<string | null>(params.get("worker"));
  const summary = useQuery({ queryKey: ["canteen_summary", range, view], queryFn: () => api<CanteenSummary>("/canteen/reports/summary", { query: { from: range.from, to: range.to, group_by: view } }), enabled: view !== "workers" });
  const workers = useQuery({ queryKey: ["canteen_workers_report", range], queryFn: () => api<CanteenWorkersReport>("/canteen/reports/workers", { query: { from: range.from, to: range.to } }), enabled: view === "workers" });
  const detail = useQuery({ queryKey: ["canteen_worker_detail", worker, range], queryFn: () => api<{ employee: { id: string; name: string; department: string | null }; claims: MealClaim[]; meals: number; worker_minor: number }>(`/canteen/workers/${worker}`, { query: { from: range.from, to: range.to } }), enabled: !!worker });
  const totals = view === "workers" ? workers.data?.totals : summary.data?.totals;
  const exportCsv = () => {
    if (view === "workers" && workers.data) csvDownload(`canteen-workers-${range.from}-${range.to}.csv`, ["Worker", "Department", "Meals", "Worker share", "Company share", "Last meal"], workers.data.rows.map((r) => [r.name, r.department, r.meals, r.worker_minor / 100, r.company_minor / 100, r.last_meal_at]));
    else if (summary.data) csvDownload(`canteen-${view}-${range.from}-${range.to}.csv`, [view, "Meals", "Served", "Planned", "Workers", "Worker share", "Company share", "Total"], summary.data.rows.map((r) => [view === "day" ? formatDate(r.key) : r.key, r.meals, r.served, r.planned, r.workers, r.worker_minor / 100, r.company_minor / 100, r.total_minor / 100]));
  };
  return (
    <>
      <PageHeader icon={BarChart3} title="Canteen reports" description="Meals and money over any range: a day, a week, a month. The worker share is what goes on accounts and comes off payroll; the company share is the subsidy." actions={<Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" /> CSV</Button>} />
      <FilterBar><DateRangePicker value={range} onChange={setRange} /></FilterBar>
      <Tabs value={view} onChange={setView} items={VIEWS} className="mb-4" />
      {totals ? (
        <Cards>
          <SummaryCard label="Meals" value={totals.meals} />
          <SummaryCard label="Workers' share" value={formatMoney(totals.worker_minor)} tone="primary" />
          <SummaryCard label="Company share" value={formatMoney(totals.company_minor)} />
          <SummaryCard label="Total" value={formatMoney(totals.worker_minor + totals.company_minor)} />
        </Cards>
      ) : null}
      {view === "workers" ? (
        workers.isLoading ? <Loading /> : (
          <Table>
            <THead><tr><TH>Worker</TH><TH>Department</TH><TH right>Meals</TH><TH right>Worker share</TH><TH right>Company share</TH><TH>Last meal</TH><TH right></TH></tr></THead>
            <TBody>{workers.data?.rows.length ? workers.data.rows.map((r) => (
              <TR key={r.employee_id}><TD className="font-medium">{r.name}{r.designation ? <div className="text-xs font-normal text-fg-muted">{r.designation}</div> : null}</TD><TD className="text-fg-secondary">{r.department ?? "-"}</TD><TD right className="tabular">{r.meals}</TD><TD right className="tabular">{formatMoney(r.worker_minor)}</TD><TD right className="tabular">{formatMoney(r.company_minor)}</TD><TD className="text-fg-secondary">{r.last_meal_at ? formatDateTime(r.last_meal_at) : "-"}</TD><TD right><Button variant="ghost" size="sm" onClick={() => setWorker(r.employee_id)}>Details</Button></TD></TR>
            )) : <EmptyRow colSpan={7}>No meals in this range.</EmptyRow>}</TBody>
          </Table>
        )
      ) : summary.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>{VIEWS.find((v) => v.value === view)?.label.replace("By ", "")}</TH><TH right>Meals</TH><TH right>Served</TH><TH right>Planned</TH><TH right>Workers</TH><TH right>Worker share</TH><TH right>Company share</TH><TH right>Total</TH></tr></THead>
          <TBody>{summary.data?.rows.length ? summary.data.rows.map((r) => (
            <TR key={r.key}><TD className="font-medium">{view === "day" ? formatDate(r.key) : r.key}</TD><TD right className="tabular">{r.meals}</TD><TD right className="tabular">{r.served}</TD><TD right className="tabular">{r.planned ?? "-"}</TD><TD right className="tabular">{r.workers}</TD><TD right className="tabular">{formatMoney(r.worker_minor)}</TD><TD right className="tabular">{formatMoney(r.company_minor)}</TD><TD right className="tabular font-semibold">{formatMoney(r.total_minor)}</TD></TR>
          )) : <EmptyRow colSpan={8}>No meals in this range.</EmptyRow>}</TBody>
        </Table>
      )}
      <Dialog open={!!worker} onClose={() => setWorker(null)} title={detail.data ? `${detail.data.employee.name}: meals` : "Meals"} description={detail.data ? `${formatDate(range.from)} to ${formatDate(range.to)}: ${detail.data.meals} meals, ${formatMoney(detail.data.worker_minor)} on the account` : undefined} size="lg" footer={<Button onClick={() => setWorker(null)}>Close</Button>}>
        {detail.isLoading ? <Loading /> : (
          <Table>
            <THead><tr><TH>Date</TH><TH>Session</TH><TH>Dish</TH><TH>Token</TH><TH>How</TH><TH right>Worker pays</TH><TH>Status</TH></tr></THead>
            <TBody>{detail.data?.claims.map((c) => <TR key={c.id} className={c.status === "cancelled" ? "opacity-60" : ""}><TD>{formatDateTime(c.scanned_at)}</TD><TD>{c.session}</TD><TD>{c.dish}</TD><TD className="font-mono">{c.token_label}</TD><TD className="capitalize">{c.source}</TD><TD right className="tabular">{formatMoney(c.worker_price_minor)}</TD><TD><Badge variant={c.status === "served" ? "success" : c.status === "cancelled" ? "danger" : "info"}>{c.status}</Badge></TD></TR>)}</TBody>
          </Table>
        )}
      </Dialog>
    </>
  );
}
