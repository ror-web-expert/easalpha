"use client";
import { useState } from "react";
import Link from "next/link";
import { UserCircle, Plus, KeyRound, UserX, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { Branch, Membership, Role } from "@/lib/types";
import { formatDateTime } from "@/lib/dates";
import { FilterBar, PageHeader } from "@/components/admin/page";
import { useAction, useList, useSave } from "@/components/admin/crud";
import { Badge, Button, Checkbox, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface Form { name: string; phone: string; email: string; password: string; role_id: string; pin: string; all_branches: boolean; branch_ids: string[] }
const blank: Form = { name: "", phone: "+92", email: "", password: "", role_id: "", pin: "", all_branches: true, branch_ids: [] };

export default function StaffPage() {
  const [status, setStatus] = useState("");
  const list = useList<Membership>("staff", "/staff", { status });
  const roles = useList<Role>("roles", "/roles");
  const branches = useList<Branch>("branches", "/branches");
  const [form, setForm] = useState<Form | null>(null);
  const [pinFor, setPinFor] = useState<Membership | null>(null);
  const [pin, setPin] = useState("");
  const [deact, setDeact] = useState<Membership | null>(null);
  const create = useSave<Form>(["staff"], () => "/staff", { onSuccess: () => setForm(null), success: "Staff member added" });
  const setPinM = useAction<{ id: string; pin: string }>(["staff"], ({ id, pin }) => api(`/staff/${id}/set_pin`, { method: "POST", body: { pin } }), "PIN updated");
  const deactM = useAction<string>(["staff"], (id) => api(`/staff/${id}/deactivate`, { method: "POST" }), "Deactivated");
  const reactM = useAction<string>(["staff"], (id) => api(`/staff/${id}/reactivate`, { method: "POST" }), "Reactivated");
  const roleM = useAction<{ id: string; role_id: string }>(["staff"], ({ id, role_id }) => api(`/staff/${id}`, { method: "PATCH", body: { role_id } }), "Role changed");
  return (
    <>
      <PageHeader icon={UserCircle} title="Staff" description="People with a role and a till PIN." actions={<><Link href="/admin/staff/roles"><Button variant="secondary">Roles</Button></Link><Button onClick={() => setForm({ ...blank, role_id: roles.data?.find((r) => r.system_key === "cashier")?.id ?? roles.data?.[0]?.id ?? "" })}><Plus className="h-4 w-4" /> Add staff</Button></>} />
      <FilterBar><Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="active">Active</option><option value="deactivated">Deactivated</option></Select></FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Name</TH><TH>Contact</TH><TH>Role</TH><TH>PIN</TH><TH>Status</TH><TH>Last login</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {list.data?.length ? list.data.map((m) => (
              <TR key={m.id}>
                <TD className="font-medium">{m.user?.name}</TD>
                <TD className="text-fg-secondary">{m.user?.phone ?? m.user?.email ?? "-"}</TD>
                <TD>
                  <Select className="h-8 w-auto text-xs" value={m.role.id} disabled={m.role.system_key === "owner" || m.status !== "active"} onChange={(e) => roleM.mutate({ id: m.id, role_id: e.target.value })}>
                    {roles.data?.filter((r) => r.system_key !== "owner" || r.id === m.role.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </Select>
                </TD>
                <TD>{m.has_pin ? <Badge variant={m.pin_locked ? "danger" : "success"}>{m.pin_locked ? "locked" : "set"}</Badge> : <Badge variant="warning">no PIN</Badge>}</TD>
                <TD><Badge variant={m.status === "active" ? "success" : "neutral"}>{m.status}</Badge>{m.all_branches ? null : <span className="ml-1 text-xs text-fg-muted">{m.branch_ids.length} branch</span>}</TD>
                <TD className="text-fg-secondary">{m.user?.last_login_at ? formatDateTime(m.user.last_login_at) : "-"}</TD>
                <TD right>
                  <Button variant="ghost" size="icon-sm" title="Set PIN" onClick={() => { setPinFor(m); setPin(""); }} aria-label="Set PIN"><KeyRound className="h-4 w-4" /></Button>
                  {m.status === "active" ? <Button variant="ghost" size="icon-sm" title="Deactivate" onClick={() => setDeact(m)} aria-label="Deactivate"><UserX className="h-4 w-4 text-danger" /></Button> : <Button variant="ghost" size="icon-sm" title="Reactivate" onClick={() => reactM.mutate(m.id)} aria-label="Reactivate"><UserCheck className="h-4 w-4 text-success" /></Button>}
                </TD>
              </TR>
            )) : <EmptyRow colSpan={7}>No staff yet.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title="Add staff" description="A phone sends a WhatsApp invite; email plus password lets them open the admin."
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={create.isPending} disabled={!form?.name || !form?.role_id || (!form?.phone && !form?.email)} onClick={() => form && create.mutate({ ...form, phone: form.phone.length > 4 ? form.phone : (null as unknown as string), email: form.email || (null as unknown as string), password: form.password || (null as unknown as string), pin: form.pin || (null as unknown as string) })}>Add</Button></>}>
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Field label="Role"><Select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>{roles.data?.filter((r) => r.system_key !== "owner").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
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
