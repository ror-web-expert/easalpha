"use client";
// SPEC Payroll > Advances: request, approve or reject, pay (records a Salaries / Advance expense), then payroll recovers
// the instalment each month until the outstanding amount is repaid.
import { useState } from "react";
import { CircleDollarSign, Plus, Check, X, Banknote } from "lucide-react";
import { api } from "@/lib/api";
import type { Advance, AdvanceStatus } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { Cards, FilterBar, PageHeader } from "@/components/admin/page";
import { useAction, useList, useSave } from "@/components/admin/crud";
import { AdvanceBadge, EmployeeSelect, MethodSelect, PayrollGuard } from "@/components/admin/payroll-shared";
import { Button, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Select, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface Form { employee_id: string; amount_minor: number; installment_minor: number; reason: string }
const STATUSES: AdvanceStatus[] = ["pending", "approved", "paid", "repaid", "rejected"];

export default function AdvancesPage() {
  const [status, setStatus] = useState("");
  const [employee, setEmployee] = useState("");
  const list = useList<Advance>("advances", "/payroll/advances", { status, employee_id: employee });
  const all = useList<Advance>("advances", "/payroll/advances");
  const [form, setForm] = useState<Form | null>(null);
  const [payFor, setPayFor] = useState<Advance | null>(null);
  const [method, setMethod] = useState("");
  const keys = ["advances", "payroll_overview", "expenses", "accounts"];
  const create = useSave<Omit<Form, "installment_minor"> & { installment_minor: number | null }>(keys, () => "/payroll/advances", { onSuccess: () => setForm(null), success: "Advance requested" });
  const decide = useAction<{ id: string; approve: boolean }>(keys, ({ id, approve }) => api(`/payroll/advances/${id}/decide`, { method: "POST", body: { approve } }));
  const pay = useAction<{ id: string; method_code: string }>(keys, ({ id, method_code }) => api(`/payroll/advances/${id}/pay`, { method: "POST", body: { method_code } }), "Advance paid and recorded as an expense");
  const rows = list.data ?? [];
  const pending = (all.data ?? []).filter((a) => a.status === "pending");
  const outstanding = (all.data ?? []).filter((a) => a.status === "paid" && a.outstanding_minor > 0);
  const canSubmit = form && form.employee_id && form.amount_minor > 0 && (form.installment_minor === 0 || form.installment_minor <= form.amount_minor);
  return (
    <PayrollGuard perms={["payroll.manage", "PAYROLL"]}>
      <PageHeader icon={CircleDollarSign} title="Advances" description="Salary advances: requested, approved, paid out, then recovered from payslips in instalments until repaid." actions={<Button onClick={() => setForm({ employee_id: "", amount_minor: 0, installment_minor: 0, reason: "" })}><Plus className="h-4 w-4" /> Request advance</Button>} />
      <Cards>
        <SummaryCard label="Pending" value={pending.length} sub={`${formatMoney(pending.reduce((s, a) => s + a.amount_minor, 0))} waiting for a decision`} tone={pending.length ? "warning" : "neutral"} />
        <SummaryCard label="Outstanding" value={formatMoney(outstanding.reduce((s, a) => s + a.outstanding_minor, 0))} sub={`${outstanding.length} advances still being recovered`} tone={outstanding.length ? "danger" : "neutral"} />
        <SummaryCard label="Repaid" value={(all.data ?? []).filter((a) => a.status === "repaid").length} sub="fully recovered through payroll" tone="success" />
      </Cards>
      <FilterBar>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s[0].toUpperCase() + s.slice(1)}</option>)}</Select>
        <EmployeeSelect value={employee} onChange={setEmployee} allLabel="All employees" />
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Advance</TH><TH>Employee</TH><TH>Requested</TH><TH>Reason</TH><TH right>Amount</TH><TH right>Instalment</TH><TH right>Outstanding</TH><TH>Status</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {rows.length ? rows.map((a) => (
              <TR key={a.id}>
                <TD className="font-medium">{a.label}</TD>
                <TD>{a.employee_name}</TD>
                <TD className="text-fg-secondary">{formatDate(a.requested_on)}</TD>
                <TD className="max-w-xs truncate text-fg-secondary" title={a.reason ?? ""}>{a.reason ?? "-"}</TD>
                <TD right>{formatMoney(a.amount_minor)}</TD>
                <TD right>{a.installment_minor ? formatMoney(a.installment_minor) : <span className="text-fg-muted" title="Recovered in one go from the next payslip">Full</span>}</TD>
                <TD right className={a.outstanding_minor > 0 && a.status === "paid" ? "font-medium text-danger" : ""}>{a.status === "paid" || a.status === "repaid" ? formatMoney(a.outstanding_minor) : "-"}</TD>
                <TD><AdvanceBadge status={a.status} />{a.paid_at ? <div className="text-xs text-fg-muted">paid {formatDateTime(a.paid_at)}</div> : null}</TD>
                <TD right>
                  {a.status === "pending" ? <>
                    <Button variant="ghost" size="sm" onClick={() => decide.mutate({ id: a.id, approve: true })} disabled={decide.isPending}><Check className="h-4 w-4 text-success" /> Approve</Button>
                    <Button variant="ghost" size="sm" onClick={() => decide.mutate({ id: a.id, approve: false })} disabled={decide.isPending}><X className="h-4 w-4 text-danger" /> Reject</Button>
                  </> : null}
                  {a.status === "approved" ? <Button variant="soft" size="sm" onClick={() => setPayFor(a)}><Banknote className="h-4 w-4" /> Pay</Button> : null}
                </TD>
              </TR>
            )) : <EmptyRow colSpan={9}>No advances{status ? ` with status ${status}` : ""}.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title="Request advance" description="Approve it next, then pay it out. Payroll recovers the instalment from each payslip until the amount is repaid."
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={create.isPending} disabled={!canSubmit} onClick={() => form && create.mutate({ employee_id: form.employee_id, amount_minor: form.amount_minor, reason: form.reason, installment_minor: form.installment_minor || null })}>Request</Button></>}>
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Employee" className="sm:col-span-2"><EmployeeSelect value={form.employee_id} onChange={(id) => setForm({ ...form, employee_id: id })} className="w-full" /></Field>
            <Field label="Amount"><MoneyInput value={form.amount_minor} onChange={(m) => setForm({ ...form, amount_minor: m })} autoFocus /></Field>
            <Field label="Monthly instalment" hint="Blank recovers the whole amount from the next payslip" error={form.installment_minor > form.amount_minor && form.amount_minor > 0 ? "Cannot exceed the amount" : undefined}><MoneyInput value={form.installment_minor} onChange={(m) => setForm({ ...form, installment_minor: m })} /></Field>
            <Field label="Reason" className="sm:col-span-2"><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Medical, school fees, Eid" /></Field>
          </div>
        ) : null}
      </Dialog>
      <Dialog open={!!payFor} onClose={() => setPayFor(null)} title={payFor ? `Pay ${payFor.label}` : ""} description={payFor ? `${formatMoney(payFor.amount_minor)} to ${payFor.employee_name}. Recorded as a Salaries / Advance expense on the chosen account.` : undefined} size="sm"
        footer={<><Button variant="secondary" onClick={() => setPayFor(null)}>Cancel</Button><Button loading={pay.isPending} onClick={() => payFor && pay.mutate({ id: payFor.id, method_code: method }, { onSuccess: () => setPayFor(null) })}>Pay</Button></>}>
        <Field label="Paid from"><MethodSelect value={method} onChange={setMethod} /></Field>
      </Dialog>
    </PayrollGuard>
  );
}
