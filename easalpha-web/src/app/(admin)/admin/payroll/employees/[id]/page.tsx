"use client";
// One employee: Profile, Attendance (this month's ledger), Payslips (across runs) and Rules (per-employee override).
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Contact, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import type { EmployeeFull, PayrollLedger } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/admin/page";
import { MonthPicker, PayrollGuard, RunBadge, useBusinessHours } from "@/components/admin/payroll-shared";
import { EmployeeDialog, type EmployeeForm, employeeToForm, FingerprintBadge } from "@/components/admin/payroll-employees";
import { EmployeeRulesForm } from "@/components/admin/payroll-rules-form";
import { AttendanceLedgerView } from "@/components/admin/payroll-attendance";
import { PayslipDetailPanel } from "@/components/admin/payroll-run";
import { monthKey, monthLabel } from "@/components/admin/payroll-helpers";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Dialog, EmptyRow, KeyValue, Loading, Table, Tabs, TBody, TD, TH, THead, TR } from "@/components/ui";

type Tab = "profile" | "attendance" | "payslips" | "rules";

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["employee", id], queryFn: () => api<EmployeeFull>(`/employees/${id}`) });
  const [tab, setTab] = useState<Tab>("profile");
  const [month, setMonth] = useState(monthKey());
  const [form, setForm] = useState<EmployeeForm | null>(null);
  const [slip, setSlip] = useState<string | null>(null);
  const hours = useBusinessHours();
  const ledger = useQuery({ queryKey: ["payroll_ledger", id], queryFn: () => api<PayrollLedger>("/payroll/ledger", { query: { employee_id: id } }), enabled: tab === "payslips" });
  const e = q.data;
  const selected = ledger.data?.data.find((p) => p.id === slip) ?? null;
  return (
    <PayrollGuard>
      <Link href="/admin/payroll/employees" className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowLeft className="h-4 w-4" /> Employees</Link>
      {q.isLoading || !e ? <Loading /> : (
        <>
          <PageHeader icon={Contact} title={e.name} description={[e.designation, e.department, formatMoney(e.base_salary_minor) + " base"].filter(Boolean).join(" · ")} actions={<><FingerprintBadge employee={e} /><Button variant="secondary" onClick={() => setForm(employeeToForm(e))}><Pencil className="h-4 w-4" /> Edit</Button></>} />
          <Tabs value={tab} onChange={setTab} items={[{ value: "profile", label: "Profile" }, { value: "attendance", label: "Attendance" }, { value: "payslips", label: "Payslips" }, { value: "rules", label: "Rules" }]} className="mb-4" />
          {tab === "profile" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardHeader><CardTitle>Profile</CardTitle>{e.left_on ? <Badge variant="danger">Left {formatDate(e.left_on)}</Badge> : <Badge variant="success">Active</Badge>}</CardHeader>
                <CardBody><KeyValue items={[
                  { label: "Designation", value: e.designation ?? "-" }, { label: "Department", value: e.department ?? "-" }, { label: "Phone", value: e.phone ?? "-" }, { label: "CNIC", value: e.cnic ?? "-" },
                  { label: "Joined", value: e.joined_on ? formatDate(e.joined_on) : "-" }, { label: "Left", value: e.left_on ? formatDate(e.left_on) : "-" }, { label: "Pay frequency", value: <span className="capitalize">{e.pay_frequency}</span> },
                  { label: "Shares tips", value: e.shares_tips ? "Yes" : "No" }, { label: "Staff login", value: e.membership_id ? "Linked" : "Not linked" },
                ]} />{e.notes ? <p className="mt-3 text-sm text-fg-secondary">{e.notes}</p> : null}</CardBody>
              </Card>
              <Card><CardHeader><CardTitle>Pay</CardTitle><span className="text-sm tabular">{formatMoney(e.base_salary_minor)} base</span></CardHeader>
                <CardBody>
                  {e.components?.length ? <KeyValue items={e.components.map((c) => ({ label: `${c.name} (${c.kind})`, value: c.percent != null ? `${c.percent}% of base` : formatMoney(c.amount_minor) }))} /> : <p className="text-sm text-fg-muted">No salary components.</p>}
                  <div className="mt-4 rounded-xl bg-muted p-3 text-sm"><div className="text-xs text-fg-secondary">Fingerprint</div><div className="mt-1 flex items-center gap-2"><FingerprintBadge employee={e} /><Link href="/admin/payroll/fingerprint?tab=enrolled" className="text-primary">Manage in Enrolled</Link></div></div>
                </CardBody>
              </Card>
            </div>
          ) : null}
          {tab === "attendance" ? <AttendanceLedgerView employeeId={e.id} month={month} picker={<MonthPicker value={month} onChange={setMonth} />} /> : null}
          {tab === "payslips" ? (ledger.isLoading ? <Loading /> : (
            <Table>
              <THead><tr><TH>Month</TH><TH>Run</TH><TH right>Base</TH><TH right>Earnings</TH><TH right>Deductions</TH><TH right>Absence</TH><TH right>Fines</TH><TH right>Advances</TH><TH right>Net</TH></tr></THead>
              <TBody>
                {ledger.data?.data.length ? ledger.data.data.map((p) => (
                  <TR key={p.id} onClick={() => setSlip(p.id)}>
                    <TD>{monthLabel(p.month)}</TD><TD><span className="inline-flex items-center gap-2">{p.run_label} <RunBadge status={p.run_status} /></span></TD>
                    <TD right>{formatMoney(p.base_minor)}</TD><TD right>{formatMoney(p.earnings_minor)}</TD><TD right>{formatMoney(p.deductions_minor)}</TD><TD right>{formatMoney(p.absence_minor)}</TD><TD right>{formatMoney(p.late_fines_minor)}</TD><TD right>{formatMoney(p.advances_recovered_minor)}</TD><TD right className="font-medium">{formatMoney(p.net_minor)}</TD>
                  </TR>
                )) : <EmptyRow colSpan={9}>No payslips yet for {e.name}.</EmptyRow>}
                {ledger.data?.data.length ? <TR className="font-medium"><TD colSpan={2}>Totals</TD><TD right colSpan={2}>{formatMoney(ledger.data.totals.gross_minor)}</TD><TD right colSpan={4}>{formatMoney(ledger.data.totals.deductions_minor)}</TD><TD right>{formatMoney(ledger.data.totals.net_minor)}</TD></TR> : null}
              </TBody>
            </Table>
          )) : null}
          {tab === "rules" ? <EmployeeRulesForm employeeId={e.id} businessHours={hours} /> : null}
          <EmployeeDialog form={form} onClose={() => setForm(null)} employee={e} />
          <Dialog open={!!selected} onClose={() => setSlip(null)} title={selected ? `${selected.run_label}: ${e.name}` : ""} description={selected ? `${monthLabel(selected.month)} payslip` : undefined} size="lg">{selected ? <PayslipDetailPanel payslip={selected} /> : null}</Dialog>
        </>
      )}
    </PayrollGuard>
  );
}
