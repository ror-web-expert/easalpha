"use client";
// SPEC Payroll > Employees: the people payroll prices. Department filter and search; create and edit with the pay type
// (monthly salary, weekly or daily wage) and salary components; fingerprint status at a glance; a link to each
// employee's statement; the detail page carries attendance, payslips and per-employee rules.
import { useState } from "react";
import Link from "next/link";
import { Contact, Plus, Pencil, Building2, Layers, UserX, FileText } from "lucide-react";
import type { EmployeeFull } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { useDebounced } from "@/lib/hooks";
import { FilterBar, PageHeader, SearchInput } from "@/components/admin/page";
import { useRemove } from "@/components/admin/crud";
import { PayrollGuard, useEmployees } from "@/components/admin/payroll-shared";
import { blankEmployee, ComponentsDialog, DepartmentsDialog, EmployeeDialog, type EmployeeForm, employeeToForm, FingerprintBadge, useDepartments } from "@/components/admin/payroll-employees";
import { isWageStaff, payrollMix, payTypeLabel, rateLabel } from "@/components/admin/wages-helpers";
import { Badge, Button, ConfirmDialog, EmptyRow, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function EmployeesPage() {
  const [department, setDepartment] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const list = useEmployees({ department_id: department || undefined, q: dq || undefined });
  const departments = useDepartments();
  const [form, setForm] = useState<EmployeeForm | null>(null);
  const [editing, setEditing] = useState<EmployeeFull | null>(null);
  const [deps, setDeps] = useState(false);
  const [comps, setComps] = useState(false);
  const [archive, setArchive] = useState<EmployeeFull | null>(null);
  const remove = useRemove(["employees", "payroll_overview", "attendance_enrolled"], (id) => `/employees/${id}`, "Employee archived");
  const rows = list.data ?? [];
  const mix = payrollMix(rows);
  return (
    <PayrollGuard>
      <PageHeader icon={Contact} title="Employees" description="Everyone payroll pays: a monthly salary or a daily or weekly wage, department, components and the fingerprint that feeds attendance." actions={<>
        <Button variant="secondary" onClick={() => setDeps(true)}><Building2 className="h-4 w-4" /> Departments</Button>
        <Button variant="secondary" onClick={() => setComps(true)}><Layers className="h-4 w-4" /> Components</Button>
        <Button onClick={() => { setEditing(null); setForm(blankEmployee()); }}><Plus className="h-4 w-4" /> Add employee</Button>
      </>} />
      <FilterBar>
        <Select className="w-auto" value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department"><option value="">All departments</option>{departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
        <SearchInput value={q} onChange={setQ} placeholder="Name, CNIC or designation" />
        <span className="ml-auto text-sm text-fg-secondary">{rows.length} employees · {formatMoney(mix.monthly_minor)} monthly salaries{mix.wage_count ? ` · ${mix.wage_count} on daily or weekly wages` : ""}</span>
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Employee</TH><TH>Department</TH><TH>Contact</TH><TH right>Pay</TH><TH>Components</TH><TH>Joined</TH><TH>Fingerprint</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {rows.length ? rows.map((e) => (
              <TR key={e.id}>
                <TD><Link href={`/admin/payroll/employees/${e.id}`} className="font-medium text-primary">{e.name}</Link><div className="text-xs text-fg-muted">{e.designation ?? ""}</div></TD>
                <TD>{e.department ?? <span className="text-fg-muted">-</span>}</TD>
                <TD className="text-fg-secondary">{e.phone ?? e.cnic ?? "-"}</TD>
                <TD right className="whitespace-nowrap">{rateLabel(e.base_salary_minor, e.pay_frequency)}<div className="text-xs font-normal text-fg-muted">{payTypeLabel(e.pay_frequency)}{isWageStaff(e.pay_frequency) ? <> · <Link href="/admin/payroll/wages" className="text-primary">Pay Wages</Link></> : null}</div></TD>
                <TD>{e.components?.length ? <span className="flex flex-wrap gap-1">{e.components.map((c) => <Badge key={c.id ?? c.salary_component_id} variant={c.kind === "deduction" ? "warning" : "neutral"}>{c.name}{c.percent != null ? ` ${c.percent}%` : c.amount_minor != null ? ` ${formatMoney(c.amount_minor)}` : ""}</Badge>)}</span> : <span className="text-fg-muted">-</span>}</TD>
                <TD className="text-fg-secondary">{e.joined_on ? formatDate(e.joined_on) : "-"}{e.left_on ? <div className="text-xs text-danger">left {formatDate(e.left_on)}</div> : null}</TD>
                <TD><FingerprintBadge employee={e} /></TD>
                <TD right className="whitespace-nowrap">
                  <Link href={`/admin/payroll/statement?employee_id=${e.id}`} title="Statement" aria-label={`Statement for ${e.name}`} className="inline-grid h-8 w-8 place-items-center rounded-full text-fg-secondary hover:bg-fg/8"><FileText className="h-4 w-4" /></Link>
                  <Button variant="ghost" size="icon-sm" title="Edit" aria-label="Edit" onClick={() => { setEditing(e); setForm(employeeToForm(e)); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" title="Archive" aria-label="Archive" onClick={() => setArchive(e)}><UserX className="h-4 w-4 text-danger" /></Button>
                </TD>
              </TR>
            )) : <EmptyRow colSpan={8}>{dq || department ? "No employees match." : "No employees yet. Add the first one."}</EmptyRow>}
          </TBody>
        </Table>
      )}
      <EmployeeDialog form={form} onClose={() => setForm(null)} employee={editing} />
      <DepartmentsDialog open={deps} onClose={() => setDeps(false)} />
      <ComponentsDialog open={comps} onClose={() => setComps(false)} />
      <ConfirmDialog open={!!archive} onClose={() => setArchive(null)} onConfirm={() => archive && remove.mutate(archive.id, { onSuccess: () => setArchive(null) })} title={`Archive ${archive?.name}?`} description="They leave today, drop out of attendance and future payroll, and their past payslips stay." confirmLabel="Archive" destructive loading={remove.isPending} />
    </PayrollGuard>
  );
}
