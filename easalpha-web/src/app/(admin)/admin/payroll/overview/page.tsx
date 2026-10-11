"use client";
// SPEC Payroll overview: total employees, pending advances, whether this month's payroll has been generated, and
// outstanding advances approved but not fully repaid. Departments and the last paid run sit under the cards.
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Gauge, Users, CircleDollarSign, BadgeDollarSign, HandCoins, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import type { PayrollOverview } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { Cards, PageHeader } from "@/components/admin/page";
import { PayrollGuard, RunBadge } from "@/components/admin/payroll-shared";
import { monthLabel } from "@/components/admin/payroll-helpers";
import { Button, Card, CardBody, CardHeader, CardTitle, EmptyRow, KeyValue, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function PayrollOverviewPage() {
  const q = useQuery({ queryKey: ["payroll_overview"], queryFn: () => api<PayrollOverview>("/payroll/overview") });
  const o = q.data;
  return (
    <PayrollGuard perms={["payroll.manage", "PAYROLL"]}>
      <PageHeader icon={Gauge} title="Payroll overview" description="Employees, advances waiting for a decision, this month's run and the advances still being recovered." actions={<Link href="/admin/payroll/run"><Button><BadgeDollarSign className="h-4 w-4" /> Run Payroll</Button></Link>} />
      {q.isLoading || !o ? <Loading /> : (
        <>
          <Cards>
            <SummaryCard label="Total employees" value={o.employees} sub={`${o.departments.length} departments`} icon={Users} tone="primary" />
            <SummaryCard label="Pending advances" value={o.pending_advances} sub={`${formatMoney(o.pending_advances_minor)} requested`} icon={CircleDollarSign} tone={o.pending_advances ? "warning" : "neutral"} />
            <SummaryCard label={`${monthLabel(o.month)} payroll`} value={o.month_generated ? "Generated" : "Not generated"} sub={o.run ? <span className="inline-flex items-center gap-1">{o.run.label} <RunBadge status={o.run.status} /></span> : <Link href="/admin/payroll/run" className="text-primary">Generate it from Run Payroll</Link>} icon={BadgeDollarSign} tone={o.month_generated ? "success" : "info"} />
            <SummaryCard label="Outstanding advances" value={formatMoney(o.outstanding_advances_minor)} sub={`${o.outstanding_advances} approved, not fully repaid`} icon={HandCoins} tone={o.outstanding_advances ? "danger" : "neutral"} />
          </Cards>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Departments</CardTitle><Link href="/admin/payroll/employees" className="inline-flex items-center gap-1 text-sm text-primary">Employees <ArrowRight className="h-4 w-4" /></Link></CardHeader>
              <Table className="rounded-none border-0">
                <THead><tr><TH>Department</TH><TH right>Employees</TH></tr></THead>
                <TBody>
                  {o.departments.length ? o.departments.map((d) => <TR key={d.id}><TD>{d.name}</TD><TD right>{d.employees}</TD></TR>) : <EmptyRow colSpan={2}>No departments yet. Add them from Employees.</EmptyRow>}
                </TBody>
              </Table>
            </Card>
            <Card>
              <CardHeader><CardTitle>Last paid run</CardTitle>{o.last_paid_run ? <RunBadge status={o.last_paid_run.status} /> : null}</CardHeader>
              <CardBody>
                {o.last_paid_run ? (
                  <KeyValue items={[
                    { label: "Run", value: <Link href="/admin/payroll/run" className="text-primary">{o.last_paid_run.label}</Link> }, { label: "Month", value: monthLabel(o.last_paid_run.month) }, { label: "Employees", value: o.last_paid_run.employees_count },
                    { label: "Gross", value: formatMoney(o.last_paid_run.gross_minor) }, { label: "Deductions", value: formatMoney(o.last_paid_run.deductions_minor) }, { label: "Net paid", value: formatMoney(o.last_paid_run.net_minor) },
                    { label: "Paid at", value: formatDateTime(o.last_paid_run.paid_at) },
                  ]} />
                ) : <p className="text-sm text-fg-secondary">No payroll has been paid yet. Generate a month from Run Payroll, then use Sync to Expenses to pay it.</p>}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </PayrollGuard>
  );
}
