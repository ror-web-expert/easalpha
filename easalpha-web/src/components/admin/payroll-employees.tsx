"use client";
// Employee create/edit dialog with the pay type (monthly salary, weekly or daily wage), the salary components editor,
// the WhatsApp pay messages switch and fingerprint status, plus the small managers for departments and salary
// components (SPEC Payroll > Employees).
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Fingerprint } from "lucide-react";
import { api } from "@/lib/api";
import type { Branch, Department, EmployeeComponent, EmployeeFull, Membership, PayFrequency, SalaryComponent, SalaryComponentKind } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { useAction, useList, useRemove, useSave } from "@/components/admin/crud";
import { Badge, Button, Checkbox, Dialog, EmptyRow, Field, Input, MoneyInput, Select, Switch, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { asPayFrequency, isWageStaff, PAY_TYPES, payAmountLabel } from "./wages-helpers";

export interface EmployeeForm {
  id?: string; name: string; phone: string; cnic: string; designation: string; department_id: string; branch_id: string; membership_id: string; base_salary_minor: number; pay_frequency: PayFrequency;
  joined_on: string; left_on: string; shares_tips: boolean; whatsapp_notify: boolean; notes: string; components: { salary_component_id: string; amount_minor: number; percent: string }[];
}
/** The "Pay" choices: base_salary_minor is the pay for one period of the chosen frequency. */
export const PAY_FREQUENCIES = PAY_TYPES.map((p) => ({ value: p.value, label: p.label }));

export const blankEmployee = (): EmployeeForm => ({ name: "", phone: "+92", cnic: "", designation: "", department_id: "", branch_id: "", membership_id: "", base_salary_minor: 0, pay_frequency: "monthly", joined_on: "", left_on: "", shares_tips: false, whatsapp_notify: true, notes: "", components: [] });
export function employeeToForm(e: EmployeeFull): EmployeeForm {
  return {
    id: e.id, name: e.name, phone: e.phone ?? "", cnic: e.cnic ?? "", designation: e.designation ?? "", department_id: e.department_id ?? "", branch_id: e.branch_id ?? "", membership_id: e.membership_id ?? "",
    base_salary_minor: e.base_salary_minor, pay_frequency: asPayFrequency(e.pay_frequency), joined_on: e.joined_on ?? "", left_on: e.left_on ?? "", shares_tips: e.shares_tips, whatsapp_notify: e.whatsapp_notify ?? true, notes: e.notes ?? "",
    components: (e.components ?? []).map((c: EmployeeComponent) => ({ salary_component_id: c.salary_component_id, amount_minor: c.amount_minor ?? 0, percent: c.percent == null ? "" : String(c.percent) })),
  };
}
export function employeePayload(f: EmployeeForm) {
  return {
    id: f.id, name: f.name.trim(), phone: f.phone.length > 4 ? f.phone : null, cnic: f.cnic || null, designation: f.designation || null, department_id: f.department_id || null, branch_id: f.branch_id || null, membership_id: f.membership_id || null,
    base_salary_minor: f.base_salary_minor, pay_frequency: f.pay_frequency, joined_on: f.joined_on || null, left_on: f.left_on || null, shares_tips: f.shares_tips, whatsapp_notify: f.whatsapp_notify, notes: f.notes || null,
    components: f.components.filter((c) => c.salary_component_id).map((c) => ({ salary_component_id: c.salary_component_id, amount_minor: c.percent ? null : c.amount_minor, percent: c.percent ? Number(c.percent) : null })),
  };
}

export const useDepartments = () => useList<Department>("departments", "/employees/departments");
export const useSalaryComponents = () => useList<SalaryComponent>("salary_components", "/employees/components");

export function EmployeeDialog({ form, onClose, employee, onSaved }: { form: EmployeeForm | null; onClose: () => void; employee?: EmployeeFull | null; onSaved?: (e: EmployeeFull) => void }) {
  const [f, setF] = useState<EmployeeForm | null>(form);
  useEffect(() => setF(form), [form]);
  const departments = useDepartments();
  const components = useSalaryComponents();
  const branches = useList<Branch>("branches", "/branches");
  const staff = useList<Membership>("staff", "/staff", { status: "active" });
  const save = useSave<ReturnType<typeof employeePayload>, EmployeeFull>(["employees", "employee", "payroll_overview", "attendance_enrolled", "wages_due", "employee_statement"], (i) => (i.id ? `/employees/${i.id}` : "/employees"), { onSuccess: (e) => { onClose(); onSaved?.(e); }, success: form?.id ? "Employee updated" : "Employee added" });
  if (!f) return null;
  const set = <K extends keyof EmployeeForm>(k: K, v: EmployeeForm[K]) => setF({ ...f, [k]: v });
  const setComp = (i: number, patch: Partial<EmployeeForm["components"][number]>) => set("components", f.components.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const compOf = (id: string) => components.data?.find((c) => c.id === id);
  const previewBase = f.base_salary_minor;
  const wageStaff = isWageStaff(f.pay_frequency);
  const hasPhone = f.phone.replace(/\D/g, "").length > 4;
  return (
    <Dialog open={!!form} onClose={onClose} title={f.id ? `Edit ${f.name || "employee"}` : "Add employee"} description="Pay, department and components feed payroll; the fingerprint is enrolled from Fingerprint > Enrolled." size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!f.name.trim()} onClick={() => save.mutate(employeePayload(f))}>{f.id ? "Save" : "Add"}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
        <Field label="Designation"><Input value={f.designation} onChange={(e) => set("designation", e.target.value)} placeholder="Cook, Waiter, Cashier" /></Field>
        <Field label="Phone"><Input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="CNIC"><Input value={f.cnic} onChange={(e) => set("cnic", e.target.value)} placeholder="35202-1234567-1" /></Field>
        <Field label="Department"><Select value={f.department_id} onChange={(e) => set("department_id", e.target.value)}><option value="">No department</option>{departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Branch"><Select value={f.branch_id} onChange={(e) => set("branch_id", e.target.value)}><option value="">All branches</option>{branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        <Field label="Pay" hint={wageStaff ? "Paid from Pay Wages, not in the monthly payroll run" : "Paid in the monthly payroll run"}>
          <Select value={f.pay_frequency} onChange={(e) => set("pay_frequency", asPayFrequency(e.target.value))}>{PAY_FREQUENCIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select>
        </Field>
        <Field label={payAmountLabel(f.pay_frequency)} hint={f.pay_frequency === "weekly" ? "For a full week, Monday to Sunday. Fewer days pay wage x days / 7" : undefined}><MoneyInput value={f.base_salary_minor} onChange={(m) => set("base_salary_minor", m)} /></Field>
        <Field label="Joined on"><Input type="date" value={f.joined_on} onChange={(e) => set("joined_on", e.target.value)} /></Field>
        <Field label="Left on" hint={wageStaff ? "Wages are due only from joining to leaving" : "Salary is pro-rated for joiners and leavers"}><Input type="date" value={f.left_on} onChange={(e) => set("left_on", e.target.value)} /></Field>
        <Field label="Staff login" hint="Links the employee to a till or admin login for commissions and PIN check-in" className="sm:col-span-2">
          <Select value={f.membership_id} onChange={(e) => set("membership_id", e.target.value)}><option value="">Not linked</option>{staff.data?.map((m) => <option key={m.id} value={m.id}>{m.user?.name ?? m.id} ({m.role.name})</option>)}</Select>
        </Field>
        <div className="sm:col-span-2"><Checkbox label="Shares tips (the month's tips are split equally among sharers)" checked={f.shares_tips} onChange={(e) => set("shares_tips", e.target.checked)} /></div>
        <div className="sm:col-span-2">
          <Switch checked={f.whatsapp_notify} onChange={(v) => set("whatsapp_notify", v)} label="Send WhatsApp messages about pay" />
          <p className="mt-1 text-xs text-fg-muted">{f.whatsapp_notify && !hasPhone ? "Add a phone number above, or no messages can be sent. " : ""}Advance paid, wage paid and salary paid messages go to this phone when they are switched on in Payroll settings.</p>
        </div>
        <div className="sm:col-span-2">
          <div className="mb-1 flex items-center justify-between"><span className="text-xs font-medium tracking-[0.4px] text-fg-secondary">Salary components</span><Button variant="ghost" size="sm" onClick={() => set("components", [...f.components, { salary_component_id: components.data?.[0]?.id ?? "", amount_minor: 0, percent: "" }])} disabled={!components.data?.length}><Plus className="h-4 w-4" /> Add component</Button></div>
          {f.components.length ? (
            <div className="space-y-2">
              {f.components.map((c, i) => {
                const def = compOf(c.salary_component_id);
                const percentMode = c.percent !== "" || (!!def?.is_percent && !c.amount_minor);
                return (
                  <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                    <Select value={c.salary_component_id} onChange={(e) => setComp(i, { salary_component_id: e.target.value })} aria-label="Component">{components.data?.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.kind})</option>)}</Select>
                    <Select className="w-auto" value={percentMode ? "percent" : "amount"} onChange={(e) => setComp(i, e.target.value === "percent" ? { amount_minor: 0, percent: c.percent || String(def?.percent ?? "") || "0" } : { percent: "", amount_minor: c.amount_minor || def?.default_amount_minor || 0 })} aria-label="Amount or percent"><option value="amount">Amount</option><option value="percent">% of base</option></Select>
                    {percentMode ? <Input type="number" inputMode="decimal" step="0.1" value={c.percent} onChange={(e) => setComp(i, { percent: e.target.value })} aria-label="Percent" placeholder="% of base" /> : <MoneyInput value={c.amount_minor} onChange={(m) => setComp(i, { amount_minor: m })} aria-label="Amount" />}
                    <Button variant="ghost" size="icon-sm" onClick={() => set("components", f.components.filter((_, j) => j !== i))} aria-label="Remove component"><Trash2 className="h-4 w-4" /></Button>
                    {percentMode && previewBase && c.percent ? <div className="col-span-4 -mt-1 text-xs text-fg-muted">= {formatMoney(Math.round(previewBase * Number(c.percent) / 100))} on the current base</div> : null}
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-fg-muted">No components. {components.data?.length ? "Add an allowance or a deduction." : "Create components from the Components button on the Employees screen first."}</p>}
          {wageStaff && f.components.length ? <p className="mt-1 text-xs text-fg-muted">Components are used by the monthly payroll run only; add a bonus or deduction when paying a wage instead.</p> : null}
        </div>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        {employee ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2 text-sm sm:col-span-2">
            <span className="flex items-center gap-2"><Fingerprint className="h-4 w-4 text-fg-secondary" /> Fingerprint <FingerprintBadge employee={employee} /></span>
            <Link href="/admin/payroll/fingerprint?tab=enrolled" className="text-primary">Manage in Enrolled</Link>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

export function FingerprintBadge({ employee: e }: { employee: Pick<EmployeeFull, "fingerprint_enrolled" | "fingerprint_id" | "fingerprint_enrolled_at" | "fingerprint_revoked_at"> }) {
  if (e.fingerprint_enrolled) return <Badge variant="success" title={e.fingerprint_enrolled_at ? `Enrolled ${formatDateTime(e.fingerprint_enrolled_at)}` : undefined}>Enrolled{e.fingerprint_id ? ` #${e.fingerprint_id}` : ""}</Badge>;
  if (e.fingerprint_revoked_at) return <Badge variant="danger" title={`Revoked ${formatDateTime(e.fingerprint_revoked_at)}`}>Revoked</Badge>;
  return <Badge variant="neutral">Not enrolled</Badge>;
}

export function DepartmentsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const departments = useDepartments();
  const [name, setName] = useState("");
  const add = useSave<{ name: string }>(["departments", "payroll_overview"], () => "/employees/departments", { onSuccess: () => setName(""), success: "Department added" });
  const remove = useRemove(["departments", "employees", "payroll_overview"], (id) => `/employees/departments/${id}`, "Department removed");
  return (
    <Dialog open={open} onClose={onClose} title="Departments" description="Kitchen, Floor, Delivery, Admin. Removing one keeps its employees; they show as having no department." size="sm" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="mb-3 flex gap-2"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New department" onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) add.mutate({ name: name.trim() }); }} /><Button onClick={() => add.mutate({ name: name.trim() })} disabled={!name.trim()} loading={add.isPending}>Add</Button></div>
      <Table>
        <THead><tr><TH>Department</TH><TH right>Employees</TH><TH right /></tr></THead>
        <TBody>
          {departments.data?.length ? departments.data.map((d) => <TR key={d.id}><TD>{d.name}</TD><TD right>{d.employees ?? 0}</TD><TD right><Button variant="ghost" size="icon-sm" onClick={() => remove.mutate(d.id)} aria-label={`Remove ${d.name}`}><Trash2 className="h-4 w-4" /></Button></TD></TR>) : <EmptyRow colSpan={3}>No departments yet.</EmptyRow>}
        </TBody>
      </Table>
    </Dialog>
  );
}

export function ComponentsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const components = useSalaryComponents();
  const [form, setForm] = useState<{ name: string; kind: SalaryComponentKind; is_percent: boolean; default_amount_minor: number; percent: string }>({ name: "", kind: "earning", is_percent: false, default_amount_minor: 0, percent: "" });
  const add = useAction<typeof form>(["salary_components"], (f) => api("/employees/components", { method: "POST", body: { name: f.name.trim(), kind: f.kind, is_percent: f.is_percent, default_amount_minor: f.is_percent ? null : f.default_amount_minor, percent: f.is_percent && f.percent ? Number(f.percent) : null } }), "Component added");
  const remove = useRemove(["salary_components", "employees"], (id) => `/employees/components/${id}`, "Component removed");
  return (
    <Dialog open={open} onClose={onClose} title="Salary components" description="Earnings (house rent, fuel, meal allowance) and deductions (EOBI, loan, uniform), fixed or a percent of base salary." size="md" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_1fr_auto]">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" aria-label="Name" />
        <Select className="w-auto" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as SalaryComponentKind })} aria-label="Kind"><option value="earning">Earning</option><option value="deduction">Deduction</option></Select>
        <Select className="w-auto" value={form.is_percent ? "percent" : "fixed"} onChange={(e) => setForm({ ...form, is_percent: e.target.value === "percent" })} aria-label="Calculation"><option value="fixed">Fixed</option><option value="percent">Percent</option></Select>
        {form.is_percent ? <Input type="number" inputMode="decimal" step="0.1" value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} placeholder="Default %" aria-label="Default percent" /> : <MoneyInput value={form.default_amount_minor} onChange={(m) => setForm({ ...form, default_amount_minor: m })} placeholder="Default amount" aria-label="Default amount" />}
        <Button onClick={() => add.mutate(form, { onSuccess: () => setForm({ ...form, name: "", percent: "", default_amount_minor: 0 }) })} disabled={!form.name.trim()} loading={add.isPending}>Add</Button>
      </div>
      <Table>
        <THead><tr><TH>Component</TH><TH>Kind</TH><TH>Calculation</TH><TH right>Default</TH><TH right /></tr></THead>
        <TBody>
          {components.data?.length ? components.data.map((c) => (
            <TR key={c.id}><TD className="font-medium">{c.name}</TD><TD><Badge variant={c.kind === "earning" ? "success" : "warning"} className="capitalize">{c.kind}</Badge></TD><TD>{c.is_percent ? "Percent of base" : "Fixed"}</TD><TD right>{c.is_percent ? (c.percent != null ? `${c.percent}%` : "-") : c.default_amount_minor != null ? formatMoney(c.default_amount_minor) : "-"}</TD><TD right><Button variant="ghost" size="icon-sm" onClick={() => remove.mutate(c.id)} aria-label={`Remove ${c.name}`}><Trash2 className="h-4 w-4" /></Button></TD></TR>
          )) : <EmptyRow colSpan={5}>No components yet.</EmptyRow>}
        </TBody>
      </Table>
    </Dialog>
  );
}
