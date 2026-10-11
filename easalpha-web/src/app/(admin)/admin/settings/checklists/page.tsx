"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { ChecklistRun, ChecklistTemplate } from "@/lib/types";
import { daysAgo, formatDate, formatTime, isoDay } from "@/lib/dates";
import { useCan } from "@/store/auth";
import { DateRangePicker, FilterBar, PageHeader, type DateRange } from "@/components/admin/page";
import { staffName, useStaff } from "@/components/admin/phase3";
import { RunCard, TemplateEditor } from "@/components/admin/checklists-cards";
import { KINDS, RUN_STATUS_META, kindLabel, runStatus } from "@/components/admin/checklists-helpers";
import { Badge, EmptyRow, ErrorState, Loading, Table, Tabs, TBody, TD, TH, THead, TR } from "@/components/ui";

type Tab = "today" | "history" | "templates";

// SPEC: the POS asks the cashier to run the opening checklist when a shift opens and the closing checklist when it closes.
// This page lets managers follow today's runs, look back over past days and edit what each checklist asks.
export default function ChecklistsPage() {
  const can = useCan();
  const canUse = can("settings.manage", "shifts.any", "shifts.own");
  const canEdit = can("settings.manage");
  const [tab, setTab] = useState<Tab>("today");
  const staff = useStaff();
  const staffRows = staff.isError ? undefined : staff.data;
  return (
    <>
      <PageHeader icon={ClipboardCheck} title="Opening and closing" description="The POS asks the cashier to run these checklists at shift open and close. Follow today's runs, look back over past days and edit the items." />
      {!canUse ? <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-ink">Your role cannot see checklists. Ask an owner for the Settings or Shifts permission.</p> : null}
      <Tabs<Tab> className="mb-4" value={tab} onChange={setTab} items={[{ value: "today", label: "Today" }, { value: "history", label: "History" }, { value: "templates", label: "Templates" }]} />
      {tab === "today" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {KINDS.map((k) => <RunCard key={k} kind={k} staff={staffRows} canTick={canUse} />)}
        </div>
      ) : null}
      {tab === "history" ? <HistoryTab who={(id) => (staff.isError ? "-" : staffName(staff.data, id))} /> : null}
      {tab === "templates" ? <TemplatesTab canEdit={canEdit} /> : null}
    </>
  );
}

function HistoryTab({ who }: { who: (id: string | null) => string }) {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(6), to: isoDay() });
  const q = useQuery({ queryKey: ["checklist_runs", range], queryFn: () => api<{ data: ChecklistRun[] }>("/checklists/runs", { query: { from: range.from, to: range.to } }), select: (r) => r.data });
  return (
    <>
      <FilterBar><DateRangePicker value={range} onChange={setRange} /></FilterBar>
      {q.isLoading ? <Loading /> : null}
      {q.isError ? <ErrorState message="Could not load past runs" onRetry={() => q.refetch()} /> : null}
      {q.data ? (
        <Table>
          <THead><tr><TH>Checklist</TH><TH>Business day</TH><TH>Status</TH><TH>Completed by</TH><TH>Time</TH><TH right>Ticked</TH></tr></THead>
          <TBody>
            {q.data.length === 0 ? <EmptyRow colSpan={6}>No checklist runs in this range</EmptyRow> : null}
            {q.data.map((r) => {
              const s = runStatus(r);
              return (
                <TR key={r.id}>
                  <TD className="font-medium">{kindLabel(r.kind)}</TD>
                  <TD>{formatDate(r.business_day)}</TD>
                  <TD><Badge variant={RUN_STATUS_META[s].variant}>{RUN_STATUS_META[s].label}</Badge></TD>
                  <TD className="text-fg-secondary">{who(r.completed_by_membership_id)}</TD>
                  <TD className="text-fg-secondary">{r.completed_at ? formatTime(r.completed_at) : "-"}</TD>
                  <TD right>{r.done_count} / {r.total_count}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      ) : null}
    </>
  );
}

function TemplatesTab({ canEdit }: { canEdit: boolean }) {
  const q = useQuery({ queryKey: ["checklist_templates"], queryFn: () => api<{ data: ChecklistTemplate[] }>("/checklists/templates"), select: (r) => r.data });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState message="Could not load the templates" onRetry={() => q.refetch()} />;
  return (
    <>
      {!canEdit ? <p className="mb-4 text-sm text-fg-secondary">Only owners and managers with the Settings permission can change these lists.</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {q.data.map((t) => <TemplateEditor key={`${t.kind}:${t.id}:${JSON.stringify(t.items)}:${t.required_for_shift}`} template={t} canEdit={canEdit} />)}
      </div>
    </>
  );
}
