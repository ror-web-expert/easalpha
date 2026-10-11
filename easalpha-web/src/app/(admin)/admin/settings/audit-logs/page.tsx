"use client";
import { useState } from "react";
import { Download, ScrollText } from "lucide-react";
import type { AuditLog } from "@/lib/types";
import { errorMessage } from "@/lib/api";
import { daysAgo, formatDateTime, isoDay } from "@/lib/dates";
import { usePagedList, useDebounced } from "@/lib/hooks";
import { toast } from "@/store/toast";
import { LoadMore, PageHeader } from "@/components/admin/page";
import { downloadFile } from "@/components/admin/phase3";
import { AuditFilterBar, actionVariant, auditQuery, type AuditFilters } from "@/components/admin/audit-filters";
import { AuditInsightsPanel } from "@/components/admin/audit-insights";
import { Badge, Button, Dialog, EmptyRow, Loading, Table, Tabs, TBody, TD, TH, THead, TR } from "@/components/ui";

type Tab = "log" | "insights";

export default function AuditLogsPage() {
  const [tab, setTab] = useState<Tab>("log");
  const [filters, setFilters] = useState<AuditFilters>({ range: { from: daysAgo(6), to: isoDay() }, userId: "", action: "", table: "", recordId: "" });
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try { await downloadFile("/exports/audit_logs.csv", { from: filters.range.from, to: filters.range.to }, `audit_logs_${filters.range.from}_${filters.range.to}.csv`); }
    catch (e) { toast.error("Export failed", errorMessage(e)); }
    finally { setExporting(false); }
  };
  return (
    <>
      <PageHeader icon={ScrollText} title="Audit Logs" description="Every create, update and delete, append-only; nothing can be erased." />
      <Tabs value={tab} onChange={setTab} items={[{ value: "log", label: "Log" }, { value: "insights", label: "Search Insights" }]} className="mb-4" />
      <AuditFilterBar value={filters} onChange={setFilters} showRecord={tab === "log"}>
        {tab === "log" ? <Button variant="secondary" onClick={exportCsv} loading={exporting}><Download className="h-4 w-4" /> Export CSV</Button> : null}
      </AuditFilterBar>
      {tab === "log" ? <AuditLogTable filters={filters} /> : <AuditInsightsPanel filters={filters} />}
    </>
  );
}

function AuditLogTable({ filters }: { filters: AuditFilters }) {
  const recordId = useDebounced(filters.recordId);
  const list = usePagedList<AuditLog>(["audit_logs"], "/audit_logs", auditQuery({ ...filters, recordId }));
  const [view, setView] = useState<AuditLog | null>(null);
  if (list.isLoading) return <Loading />;
  return (
    <>
      <Table>
        <THead><tr><TH>When</TH><TH>Action</TH><TH>Entity</TH><TH>User</TH><TH>Approved by</TH><TH>IP</TH></tr></THead>
        <TBody>
          {list.rows.length ? list.rows.map((a) => (
            <TR key={a.id} onClick={() => setView(a)}>
              <TD className="whitespace-nowrap text-fg-secondary">{formatDateTime(a.occurred_at)}</TD>
              <TD><Badge variant={actionVariant(a.action)}>{a.action.replace(/_/g, " ")}</Badge></TD>
              <TD className="font-mono text-xs">{a.table_name ?? "-"}{a.record_id ? ` · ${a.record_id.slice(0, 8)}` : ""}</TD>
              <TD>{a.user_name ?? (a.user_id ? a.user_id.slice(0, 8) : "System")}</TD>
              <TD className="text-fg-secondary">{a.approved_by_name ?? (a.approved_by_user_id ? a.approved_by_user_id.slice(0, 8) : "-")}</TD>
              <TD className="text-xs text-fg-muted">{a.ip ?? "-"}</TD>
            </TR>
          )) : <EmptyRow colSpan={6}>No audit entries match these filters.</EmptyRow>}
        </TBody>
      </Table>
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
      <Dialog open={!!view} onClose={() => setView(null)} title={`${view?.action.replace(/_/g, " ") ?? ""} · ${view?.table_name ?? ""}`} description={`${formatDateTime(view?.occurred_at)}${view?.user_name ? ` · ${view.user_name}` : ""}${view?.record_id ? ` · ${view.record_id}` : ""}`} size="lg">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><div className="mb-1 text-xs font-semibold uppercase text-fg-secondary">Before</div><pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(view?.before ?? null, null, 2)}</pre></div>
          <div><div className="mb-1 text-xs font-semibold uppercase text-fg-secondary">After</div><pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(view?.after ?? null, null, 2)}</pre></div>
        </div>
      </Dialog>
    </>
  );
}
