"use client";
// SPEC Payroll > Reports: payroll cost by month (table, totals and a chart) and by department, with PDF export.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, FileText } from "lucide-react";
import { api } from "@/lib/api";
import type { PayrollReport } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { exportTablePdf } from "@/lib/pdf";
import { Cards, FilterBar, PageHeader } from "@/components/admin/page";
import { BarsChart } from "@/components/charts/charts";
import { MonthPicker, PayrollGuard, RunBadge } from "@/components/admin/payroll-shared";
import { monthKey, monthLabel, shiftMonth } from "@/components/admin/payroll-helpers";
import { Button, Card, CardHeader, CardTitle, EmptyRow, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function PayrollReportsPage() {
  const [to, setTo] = useState(monthKey());
  const [from, setFrom] = useState(shiftMonth(monthKey(), -5));
  const q = useQuery({ queryKey: ["payroll_reports", from, to], queryFn: () => api<PayrollReport>("/payroll/reports", { query: { from, to } }) });
  const r = q.data;
  const exportPdf = () => {
    if (!r) return;
    exportTablePdf({
      title: "Payroll by month", subtitle: `${monthLabel(from)} to ${monthLabel(to)}`,
      columns: [{ header: "Month", key: "month" }, { header: "Run", key: "label" }, { header: "Status", key: "status" }, { header: "Employees", key: "employees", align: "right" }, { header: "Gross", key: "gross", align: "right" }, { header: "Deductions", key: "deductions", align: "right" }, { header: "Net", key: "net", align: "right" }],
      rows: r.by_month.map((m) => ({ month: monthLabel(m.month), label: m.label, status: m.status, employees: m.employees, gross: formatMoney(m.gross_minor), deductions: formatMoney(m.deductions_minor), net: formatMoney(m.net_minor) })),
      footer: [`Gross ${formatMoney(r.totals.gross_minor)}  |  Net ${formatMoney(r.totals.net_minor)}  |  Fines ${formatMoney(r.totals.fines_minor)}  |  Absence ${formatMoney(r.totals.absence_minor)}  |  Advances recovered ${formatMoney(r.totals.advances_recovered_minor)}`,
        "", "By department:", ...r.by_department.map((d) => `${d.department}: ${d.employees} employees, net ${formatMoney(d.net_minor)}, fines ${formatMoney(d.fines_minor)}, absence ${formatMoney(d.absence_minor)}`)],
      filename: `payroll-report-${from}-${to}.pdf`,
    });
  };
  const chart = (r?.by_month ?? []).map((m) => ({ month: monthLabel(m.month).slice(0, 3) + " " + m.month.slice(2, 4), gross: m.gross_minor, net: m.net_minor, deductions: m.deductions_minor }));
  return (
    <PayrollGuard perms={["payroll.manage", "PAYROLL"]}>
      <PageHeader icon={BarChart3} title="Payroll reports" description="What payroll cost by month and by department across the generated and paid runs. Cancelled runs are left out." actions={<Button variant="secondary" onClick={exportPdf} disabled={!r?.by_month.length}><FileText className="h-4 w-4" /> Export PDF</Button>} />
      <FilterBar>
        <span className="text-xs text-fg-muted">From</span><MonthPicker value={from} onChange={(v) => { setFrom(v); if (v > to) setTo(v); }} />
        <span className="text-xs text-fg-muted">to</span><MonthPicker value={to} onChange={(v) => { setTo(v); if (v < from) setFrom(v); }} />
      </FilterBar>
      {q.isLoading || !r ? <Loading /> : (
        <>
          <Cards>
            <SummaryCard label="Gross" value={formatMoney(r.totals.gross_minor)} sub={`${r.by_month.length} runs`} tone="primary" />
            <SummaryCard label="Net paid" value={formatMoney(r.totals.net_minor)} tone="success" />
            <SummaryCard label="Fines" value={formatMoney(r.totals.fines_minor)} sub={`Absence ${formatMoney(r.totals.absence_minor)}`} tone="warning" />
            <SummaryCard label="Advances recovered" value={formatMoney(r.totals.advances_recovered_minor)} tone="info" />
          </Cards>
          <Card className="mb-4">
            <CardHeader><CardTitle>Gross and net by month</CardTitle></CardHeader>
            <BarsChart data={chart} x="month" money series={[{ key: "gross", label: "Gross", money: true }, { key: "net", label: "Net", money: true }]} className="p-4" />
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>By month</CardTitle></CardHeader>
              <Table className="rounded-none border-0">
                <THead><tr><TH>Month</TH><TH>Run</TH><TH right>Employees</TH><TH right>Gross</TH><TH right>Deductions</TH><TH right>Net</TH></tr></THead>
                <TBody>
                  {r.by_month.length ? r.by_month.map((m) => (
                    <TR key={m.label}><TD>{monthLabel(m.month)}</TD><TD><span className="inline-flex items-center gap-2">{m.label} <RunBadge status={m.status} /></span></TD><TD right>{m.employees}</TD><TD right>{formatMoney(m.gross_minor)}</TD><TD right>{formatMoney(m.deductions_minor)}</TD><TD right className="font-medium">{formatMoney(m.net_minor)}</TD></TR>
                  )) : <EmptyRow colSpan={6}>No payroll runs in this range.</EmptyRow>}
                  {r.by_month.length ? <TR className="font-medium"><TD colSpan={3}>Total</TD><TD right>{formatMoney(r.totals.gross_minor)}</TD><TD right>{formatMoney(r.totals.gross_minor - r.totals.net_minor)}</TD><TD right>{formatMoney(r.totals.net_minor)}</TD></TR> : null}
                </TBody>
              </Table>
            </Card>
            <Card>
              <CardHeader><CardTitle>By department</CardTitle></CardHeader>
              <Table className="rounded-none border-0">
                <THead><tr><TH>Department</TH><TH right>Employees</TH><TH right>Fines</TH><TH right>Absence</TH><TH right>Net</TH></tr></THead>
                <TBody>
                  {r.by_department.length ? r.by_department.map((d) => (
                    <TR key={d.department}><TD>{d.department}</TD><TD right>{d.employees}</TD><TD right>{formatMoney(d.fines_minor)}</TD><TD right>{formatMoney(d.absence_minor)}</TD><TD right className="font-medium">{formatMoney(d.net_minor)}</TD></TR>
                  )) : <EmptyRow colSpan={5}>No payslips in this range.</EmptyRow>}
                </TBody>
              </Table>
            </Card>
          </div>
        </>
      )}
    </PayrollGuard>
  );
}
