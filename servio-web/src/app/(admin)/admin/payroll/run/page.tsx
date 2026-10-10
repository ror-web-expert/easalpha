"use client";
// SPEC Payroll > Run Payroll: pick a month, generate the run (one per month; a second attempt answers payroll.exists),
// review the payslips, then Sync to Expenses behind the manager PIN, or cancel.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeDollarSign, Play } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { PayrollRun, PayrollRunDetail } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { FilterBar, PageHeader } from "@/components/admin/page";
import { MonthPicker, PayrollGuard, RunBadge } from "@/components/admin/payroll-shared";
import { monthKey, monthLabel } from "@/components/admin/payroll-helpers";
import { RunDetailPanel } from "@/components/admin/payroll-run";
import { Button, Card, CardHeader, CardTitle, EmptyRow, Input, Loading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";

export default function RunPayrollPage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(monthKey());
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const runs = useQuery({ queryKey: ["payroll_runs"], queryFn: () => api<{ data: PayrollRun[] }>("/payroll/runs"), select: (r) => r.data });
  useEffect(() => { if (!selected && runs.data?.length) setSelected(runs.data[0].id); }, [runs.data, selected]);
  const existing = runs.data?.find((r) => r.month.startsWith(month) && r.status !== "cancelled");
  const generate = async () => {
    setGenerating(true);
    try {
      const run = await api<PayrollRunDetail>("/payroll/runs", { method: "POST", body: { month, notes: notes || undefined } });
      toast.success(`${run.label} generated`, `${run.employees_count} payslips, net ${formatMoney(run.net_minor)}`);
      setNotes("");
      qc.invalidateQueries({ queryKey: ["payroll_runs"] }); qc.invalidateQueries({ queryKey: ["payroll_overview"] });
      setSelected(run.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === "payroll.exists") {
        toast.error("Payroll already exists", e.message, existing ? { label: `Open ${existing.label}`, onClick: () => setSelected(existing.id) } : undefined);
      } else toast.error("Could not generate payroll", errorMessage(e));
    } finally { setGenerating(false); }
  };
  return (
    <PayrollGuard perms={["payroll.manage", "PAYROLL"]}>
      <PageHeader icon={BadgeDollarSign} title="Run Payroll" description="Generate a month, check every payslip, then Sync to Expenses to pay it. The run snapshots the divisor, fines and allowances it used, so later rule changes never move a paid month." />
      <FilterBar>
        <MonthPicker value={month} onChange={setMonth} />
        <Input className="w-64" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" aria-label="Notes" />
        <Button onClick={generate} loading={generating} disabled={!!existing} title={existing ? `${existing.label} already exists for ${monthLabel(month)}` : undefined}><Play className="h-4 w-4" /> Generate payroll</Button>
        {existing ? <span className="text-sm text-fg-secondary">{monthLabel(month)} is already generated as {existing.label}. Cancel it to generate again.</span> : null}
      </FilterBar>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="self-start">
          <CardHeader><CardTitle>Runs</CardTitle><span className="text-xs text-fg-secondary">{runs.data?.length ?? 0} runs</span></CardHeader>
          {runs.isLoading ? <Loading /> : (
            <Table className="rounded-none border-0">
              <THead><tr><TH>Run</TH><TH>Status</TH><TH right>Employees</TH><TH right>Net</TH></tr></THead>
              <TBody>
                {runs.data?.length ? runs.data.map((r) => (
                  <TR key={r.id} onClick={() => setSelected(r.id)} className={cn(selected === r.id && "bg-primary/8 hover:bg-primary/10")} aria-selected={selected === r.id}>
                    <TD className="font-medium">{r.label}<div className="text-xs font-normal text-fg-muted">{monthLabel(r.month)}{r.paid_at ? ` · paid ${formatDate(r.paid_at)}` : ""}</div></TD>
                    <TD><RunBadge status={r.status} /></TD>
                    <TD right>{r.employees_count}</TD>
                    <TD right>{formatMoney(r.net_minor)}</TD>
                  </TR>
                )) : <EmptyRow colSpan={4}>No payroll runs yet. Pick a month and generate the first one.</EmptyRow>}
              </TBody>
            </Table>
          )}
        </Card>
        <div className="min-w-0">
          {selected ? <RunDetailPanel runId={selected} /> : <Card><div className="py-16 text-center text-sm text-fg-muted">Choose a run to see its payslips.</div></Card>}
        </div>
      </div>
    </PayrollGuard>
  );
}
