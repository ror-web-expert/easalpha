"use client";
// SPEC Attendance > Leave (paid and unpaid) and Holidays (Eid, Muharram, closures). Approved leave, holidays and
// weekly offs are always excluded from no-scan absences.
import { useState } from "react";
import { Plus, Check, X, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Branch, Holiday, LeaveKind, LeaveRequest } from "@/lib/types";
import { formatDate, isoDay } from "@/lib/dates";
import { FilterBar } from "@/components/admin/page";
import { useAction, useList, useRemove, useSave } from "@/components/admin/crud";
import { Badge, Button, Checkbox, Dialog, EmptyRow, Field, Input, Loading, Select, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { EmployeeSelect, LeaveBadge } from "./payroll-shared";

const LEAVE_KEYS = ["leaves", "attendance_today", "attendance_sessions", "attendance_ledger", "attendance_reports"];

interface LeaveForm { employee_id: string; kind: LeaveKind; from_date: string; to_date: string; reason: string }

export function LeaveTab() {
  const [status, setStatus] = useState("pending");
  const [employee, setEmployee] = useState("");
  const list = useList<LeaveRequest>("leaves", "/employees/leaves", { status, employee_id: employee });
  const [form, setForm] = useState<LeaveForm | null>(null);
  const create = useSave<LeaveForm>(LEAVE_KEYS, () => "/employees/leaves", { onSuccess: () => setForm(null), success: "Leave requested" });
  const decide = useAction<{ id: string; approve: boolean }>(LEAVE_KEYS, ({ id, approve }) => api(`/employees/leaves/${id}/decide`, { method: "POST", body: { approve } }));
  const rows = list.data ?? [];
  const valid = form && form.employee_id && form.from_date && form.to_date && form.to_date >= form.from_date;
  return (
    <>
      <FilterBar>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></Select>
        <EmployeeSelect value={employee} onChange={setEmployee} allLabel="All employees" />
        <Button className="ml-auto" onClick={() => setForm({ employee_id: "", kind: "paid", from_date: isoDay(), to_date: isoDay(), reason: "" })}><Plus className="h-4 w-4" /> Request leave</Button>
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Employee</TH><TH>Kind</TH><TH>From</TH><TH>To</TH><TH right>Days</TH><TH>Reason</TH><TH>Status</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {rows.length ? rows.map((l) => (
              <TR key={l.id}>
                <TD className="font-medium">{l.employee_name}</TD>
                <TD><Badge variant={l.kind === "unpaid" ? "warning" : "info"} className="capitalize">{l.kind}</Badge></TD>
                <TD>{formatDate(l.from_date)}</TD><TD>{formatDate(l.to_date)}</TD><TD right>{l.days}</TD>
                <TD className="max-w-xs truncate text-fg-secondary" title={l.reason ?? ""}>{l.reason ?? "-"}</TD>
                <TD><LeaveBadge status={l.status} /></TD>
                <TD right>{l.status === "pending" ? <>
                  <Button variant="ghost" size="sm" onClick={() => decide.mutate({ id: l.id, approve: true })} disabled={decide.isPending}><Check className="h-4 w-4 text-success" /> Approve</Button>
                  <Button variant="ghost" size="sm" onClick={() => decide.mutate({ id: l.id, approve: false })} disabled={decide.isPending}><X className="h-4 w-4 text-danger" /> Reject</Button>
                </> : null}</TD>
              </TR>
            )) : <EmptyRow colSpan={8}>No {status || ""} leave requests.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title="Request leave" description="Paid leave keeps the day's pay; unpaid leave is deducted at the payroll divisor. Approved days are never counted absent."
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={create.isPending} disabled={!valid} onClick={() => form && create.mutate(form)}>Request</Button></>}>
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Employee" className="sm:col-span-2"><EmployeeSelect value={form.employee_id} onChange={(id) => setForm({ ...form, employee_id: id })} className="w-full" /></Field>
            <Field label="Kind" className="sm:col-span-2"><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as LeaveKind })}><option value="paid">Paid</option><option value="unpaid">Unpaid</option></Select></Field>
            <Field label="From"><Input type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value, to_date: form.to_date < e.target.value ? e.target.value : form.to_date })} /></Field>
            <Field label="To" error={form.to_date < form.from_date ? "Must be on or after From" : undefined}><Input type="date" value={form.to_date} min={form.from_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} /></Field>
            <Field label="Reason" className="sm:col-span-2"><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

interface HolidayForm { name: string; on_date: string; paid: boolean; branch_id: string }

export function HolidaysTab() {
  const list = useList<Holiday>("holidays", "/employees/holidays");
  const branches = useList<Branch>("branches", "/branches");
  const [form, setForm] = useState<HolidayForm | null>(null);
  const keys = ["holidays", "attendance_today", "attendance_ledger", "attendance_reports"];
  const add = useSave<{ name: string; on_date: string; paid: boolean; branch_id: string | null }>(keys, () => "/employees/holidays", { onSuccess: () => setForm(null), success: "Holiday added" });
  const remove = useRemove(keys, (id) => `/employees/holidays/${id}`, "Holiday removed");
  const rows = list.data ?? [];
  const branchName = (id: string | null) => (id ? branches.data?.find((b) => b.id === id)?.name ?? "One branch" : "All branches");
  return (
    <>
      <FilterBar>
        <span className="text-sm text-fg-secondary">{rows.length} holidays. A holiday is never counted absent; paid holidays keep the day&apos;s pay.</span>
        <Button className="ml-auto" onClick={() => setForm({ name: "", on_date: isoDay(), paid: true, branch_id: "" })}><Plus className="h-4 w-4" /> Add holiday</Button>
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Date</TH><TH>Holiday</TH><TH>Paid</TH><TH>Branch</TH><TH right /></tr></THead>
          <TBody>
            {rows.length ? rows.map((h) => (
              <TR key={h.id}>
                <TD className="tabular">{formatDate(h.on_date)}</TD>
                <TD className="font-medium">{h.name}</TD>
                <TD>{h.paid ? <Badge variant="success">Paid</Badge> : <Badge variant="warning">Unpaid</Badge>}</TD>
                <TD className="text-fg-secondary">{branchName(h.branch_id)}</TD>
                <TD right><Button variant="ghost" size="icon-sm" aria-label={`Remove ${h.name}`} onClick={() => remove.mutate(h.id)}><Trash2 className="h-4 w-4" /></Button></TD>
              </TR>
            )) : <EmptyRow colSpan={5}>No holidays yet. Add Eid, Muharram and any closures.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title="Add holiday" size="sm"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={add.isPending} disabled={!form?.name.trim() || !form?.on_date} onClick={() => form && add.mutate({ name: form.name.trim(), on_date: form.on_date, paid: form.paid, branch_id: form.branch_id || null })}>Add</Button></>}>
        {form ? (
          <div className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Eid ul Fitr" autoFocus /></Field>
            <Field label="Date"><Input type="date" value={form.on_date} onChange={(e) => setForm({ ...form, on_date: e.target.value })} /></Field>
            <Field label="Branch"><Select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}><option value="">All branches</option>{branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
            <Checkbox label="Paid holiday" checked={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.checked })} />
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
