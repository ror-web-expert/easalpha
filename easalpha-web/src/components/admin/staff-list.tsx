"use client";
import { useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Plus, KeyRound, UserX, UserCheck, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { Branch, CashierRole, Membership, Role, StaffType } from "@/lib/types";
import { formatDateTime } from "@/lib/dates";
import { FilterBar, PageHeader } from "@/components/admin/page";
import { useAction, useList, useSave } from "@/components/admin/crud";
import { Badge, Button, Checkbox, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

// SPEC "Staff populations": Admin Staff, Cashiers and Order Takers are separate screens over the same membership
// record, split by staff_type. Cashiers also carry a cashier role (Cashier, Supervisor, Kitchen Display).
export const CASHIER_ROLES: { value: CashierRole; label: string }[] = [
  { value: "cashier", label: "Cashier" },
  { value: "supervisor", label: "Supervisor" },
  { value: "kitchen_display", label: "Kitchen Display" },
];
export const cashierRoleLabel = (v: CashierRole | null | undefined) => CASHIER_ROLES.find((r) => r.value === v)?.label ?? "-";

/** The system role a new member of each population starts with. */
export const DEFAULT_ROLE_KEY: Record<StaffType, string> = { admin: "manager", cashier: "cashier", order_taker: "waiter", rider: "rider" };

const SINGULAR: Record<StaffType, string> = { admin: "admin staff member", cashier: "cashier", order_taker: "order taker", rider: "rider" };

interface Form { name: string; phone: string; email: string; password: string; role_id: string; pin: string; all_branches: boolean; branch_ids: string[]; cashier_role: CashierRole }
const blank: Form = { name: "", phone: "+92", email: "", password: "", role_id: "", pin: "", all_branches: true, branch_ids: [], cashier_role: "cashier" };
type CreateBody = Omit<Form, "phone" | "email" | "password" | "pin" | "cashier_role"> & { phone: string | null; email: string | null; password: string | null; pin: string | null; staff_type: StaffType; cashier_role?: CashierRole };

export function StaffList({ staffType, title, description, icon }: { staffType: StaffType; title: string; description: string; icon: LucideIcon }) {
  const isCashier = staffType === "cashier";
  const [status, setStatus] = useState("");
  const [cashierRole, setCashierRole] = useState("");
  const list = useList<Membership>("staff", "/staff", { staff_type: staffType, status, cashier_role: isCashier ? cashierRole : undefined });
  const roles = useList<Role>("roles", "/roles");
  const branches = useList<Branch>("branches", "/branches");
  const [form, setForm] = useState<Form | null>(null);
  const [pinFor, setPinFor] = useState<Membership | null>(null);
  const [pin, setPin] = useState("");
  const [deact, setDeact] = useState<Membership | null>(null);
  const create = useSave<CreateBody>(["staff"], () => "/staff", { onSuccess: () => setForm(null), success: `${title.replace(/s$/, "")} added` });
  const setPinM = useAction<{ id: string; pin: string }>(["staff"], ({ id, pin }) => api(`/staff/${id}/set_pin`, { method: "POST", body: { pin } }), "PIN updated");
  const deactM = useAction<string>(["staff"], (id) => api(`/staff/${id}/deactivate`, { method: "POST" }), "Deactivated");
  const reactM = useAction<string>(["staff"], (id) => api(`/staff/${id}/reactivate`, { method: "POST" }), "Reactivated");
  const roleM = useAction<{ id: string; role_id: string }>(["staff"], ({ id, role_id }) => api(`/staff/${id}`, { method: "PATCH", body: { role_id } }), "Role changed");
  const cashierRoleM = useAction<{ id: string; cashier_role: CashierRole }>(["staff"], ({ id, cashier_role }) => api(`/staff/${id}`, { method: "PATCH", body: { cashier_role } }), "Cashier role changed");
  const openAdd = () => {
    const def = roles.data?.find((r) => r.system_key === DEFAULT_ROLE_KEY[staffType]) ?? roles.data?.find((r) => r.system_key !== "owner");
    setForm({ ...blank, role_id: def?.id ?? "" });
  };
  const submit = () => {
    if (!form) return;
    const body: CreateBody = {
      name: form.name, role_id: form.role_id, all_branches: form.all_branches, branch_ids: form.branch_ids, staff_type: staffType,
      phone: form.phone.length > 4 ? form.phone : null, email: form.email || null, password: form.password || null, pin: form.pin || null,
    };
    if (isCashier) body.cashier_role = form.cashier_role;
    create.mutate(body);
  };
  const cols = 8 + (isCashier ? 1 : 0);
  return (
    <>
      <PageHeader icon={icon} title={title} description={description} actions={<><Link href="/admin/staff/roles"><Button variant="secondary">Roles</Button></Link><Button onClick={openAdd}><Plus className="h-4 w-4" /> Add {SINGULAR[staffType]}</Button></>} />
      <FilterBar>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All</option><option value="active">Active</option><option value="deactivated">Deactivated</option></Select>
        {isCashier ? <Select className="w-auto" value={cashierRole} onChange={(e) => setCashierRole(e.target.value)} aria-label="Cashier role"><option value="">All cashier roles</option>{CASHIER_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select> : null}
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Name</TH><TH>Contact</TH><TH>Role</TH>{isCashier ? <TH>Cashier role</TH> : null}<TH>Access</TH><TH>PIN</TH><TH>Status</TH><TH>Last login</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {list.data?.length ? list.data.map((m) => (
              <TR key={m.id}>
                <TD className="font-medium">{m.user?.name}</TD>
                <TD className="text-fg-secondary">{m.user?.phone ?? m.user?.email ?? "-"}</TD>
                <TD>
                  <Select className="h-8 w-auto text-xs" value={m.role.id} disabled={m.role.system_key === "owner" || m.status !== "active"} onChange={(e) => roleM.mutate({ id: m.id, role_id: e.target.value })} aria-label={`Role for ${m.user?.name ?? "member"}`}>
                    {roles.data?.filter((r) => r.system_key !== "owner" || r.id === m.role.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </Select>
                </TD>
                {isCashier ? (
                  <TD>
                    <Select className="h-8 w-auto text-xs" value={m.cashier_role ?? "cashier"} disabled={m.status !== "active"} onChange={(e) => cashierRoleM.mutate({ id: m.id, cashier_role: e.target.value as CashierRole })} aria-label={`Cashier role for ${m.user?.name ?? "member"}`}>
                      {CASHIER_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </Select>
                  </TD>
                ) : null}
                <TD>{m.role.system_key === "owner" ? <Badge variant="primary">Owner</Badge> : <Badge variant={m.permissions_mode === "custom" ? "info" : "neutral"}>{m.permissions_mode === "custom" ? "Custom" : "Role"}</Badge>}</TD>
                <TD>{m.has_pin ? <Badge variant={m.pin_locked ? "danger" : "success"}>{m.pin_locked ? "locked" : "set"}</Badge> : <Badge variant="warning">no PIN</Badge>}</TD>
                <TD><Badge variant={m.status === "active" ? "success" : "neutral"}>{m.status}</Badge>{m.all_branches ? null : <span className="ml-1 text-xs text-fg-muted">{m.branch_ids.length} branch</span>}</TD>
                <TD className="text-fg-secondary">{m.user?.last_login_at ? formatDateTime(m.user.last_login_at) : "-"}</TD>
                <TD right>
                  <Link href={`/admin/staff/${m.id}/access`} className="inline-flex"><Button variant="ghost" size="sm" title="Manage access"><ShieldCheck className="h-4 w-4" /> Manage access</Button></Link>
                  <Button variant="ghost" size="icon-sm" title="Set PIN" onClick={() => { setPinFor(m); setPin(""); }} aria-label="Set PIN"><KeyRound className="h-4 w-4" /></Button>
                  {m.status === "active" ? <Button variant="ghost" size="icon-sm" title="Deactivate" onClick={() => setDeact(m)} aria-label="Deactivate"><UserX className="h-4 w-4 text-danger" /></Button> : <Button variant="ghost" size="icon-sm" title="Reactivate" onClick={() => reactM.mutate(m.id)} aria-label="Reactivate"><UserCheck className="h-4 w-4 text-success" /></Button>}
                </TD>
              </TR>
            )) : <EmptyRow colSpan={cols}>No {title.toLowerCase()} yet.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={`Add ${SINGULAR[staffType]}`} description="A phone sends a WhatsApp invite; email plus password lets them open the admin."
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={create.isPending} disabled={!form?.name || !form?.role_id || (!form?.phone && !form?.email)} onClick={submit}>Add</Button></>}>
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Field label="Role"><Select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>{roles.data?.filter((r) => r.system_key !== "owner").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
            {isCashier ? <Field label="Cashier role" hint="Kitchen Display signs in to the kitchen screen only."><Select value={form.cashier_role} onChange={(e) => setForm({ ...form, cashier_role: e.target.value as CashierRole })}>{CASHIER_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select></Field> : null}
            <Field label="Phone"><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Password" hint="Only for admin access"><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            <Field label="Till PIN (4 digits)"><Input inputMode="numeric" maxLength={4} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })} /></Field>
            <div className="sm:col-span-2 space-y-2">
              <Checkbox label="All branches" checked={form.all_branches} onChange={(e) => setForm({ ...form, all_branches: e.target.checked })} />
              {!form.all_branches ? <div className="flex flex-wrap gap-3">{branches.data?.map((b) => <Checkbox key={b.id} label={b.name} checked={form.branch_ids.includes(b.id)} onChange={(e) => setForm({ ...form, branch_ids: e.target.checked ? [...form.branch_ids, b.id] : form.branch_ids.filter((x) => x !== b.id) })} />)}</div> : null}
            </div>
          </div>
        ) : null}
      </Dialog>
      <Dialog open={!!pinFor} onClose={() => setPinFor(null)} title={`Set PIN for ${pinFor?.user?.name}`} size="sm" footer={<><Button variant="secondary" onClick={() => setPinFor(null)}>Cancel</Button><Button disabled={pin.length !== 4} loading={setPinM.isPending} onClick={() => pinFor && setPinM.mutate({ id: pinFor.id, pin }, { onSuccess: () => setPinFor(null) })}>Save PIN</Button></>}>
        <Field label="New 4-digit PIN"><Input inputMode="numeric" maxLength={4} className="text-center text-2xl tracking-[0.5em]" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} autoFocus /></Field>
      </Dialog>
      <ConfirmDialog open={!!deact} onClose={() => setDeact(null)} onConfirm={() => deact && deactM.mutate(deact.id, { onSuccess: () => setDeact(null) })} title={`Deactivate ${deact?.user?.name}?`} description="They are blocked on every till at the next sync. Their past orders stay." confirmLabel="Deactivate" destructive loading={deactM.isPending} />
    </>
  );
}
