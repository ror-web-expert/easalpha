"use client";
import { useState } from "react";
import { Building2, Plus, Pencil, Trash2 } from "lucide-react";
import type { Branch } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useList, useRemove, useSave } from "@/components/admin/crud";
import { Badge, Button, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface Form { id?: string; name: string; code: string; address: string; city: string; phone: string; time_zone: string; business_day_start: string; day_end_time: string; tax_registration: { authority: string; ntn: string; strn: string; pos_id: string; token: string } }
const blank: Form = { name: "", code: "", address: "", city: "", phone: "", time_zone: "Asia/Karachi", business_day_start: "06:01", day_end_time: "02:01", tax_registration: { authority: "none", ntn: "", strn: "", pos_id: "", token: "" } };

export default function BranchesPage() {
  const list = useList<Branch>("branches", "/branches");
  const save = useSave<Form>(["branches"], (f) => (f.id ? `/branches/${f.id}` : "/branches"), { onSuccess: () => setForm(null) });
  const remove = useRemove(["branches"], (id) => `/branches/${id}`);
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<Branch | null>(null);
  return (
    <>
      <PageHeader icon={Building2} title="Store Management" description="Branches managed from this dashboard. Each has its own business-day window, tax registration and devices." actions={<Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New branch</Button>} />
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Branch</TH><TH>City</TH><TH>Phone</TH><TH>Business day</TH><TH>Tax</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {list.data?.length ? list.data.map((b) => (
              <TR key={b.id}>
                <TD className="font-medium">{b.name} <span className="font-mono text-xs text-fg-muted">{b.code}</span> {b.is_main ? <Badge variant="primary">main</Badge> : null}</TD>
                <TD className="text-fg-secondary">{b.city ?? "-"}</TD>
                <TD className="text-fg-secondary">{b.phone ?? "-"}</TD>
                <TD className="tabular">{b.business_day_window ?? (b.day_end_time ? `${b.business_day_start ?? "06:01"} to ${b.day_end_time}` : "-")}</TD>
                <TD>{b.tax_registration?.authority && b.tax_registration.authority !== "none" ? <Badge variant="success">{b.tax_registration.authority.toUpperCase()}</Badge> : <Badge>none</Badge>}</TD>
                <TD right>
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: b.id, name: b.name, code: b.code, address: b.address ?? "", city: b.city ?? "", phone: b.phone ?? "", time_zone: b.time_zone ?? "Asia/Karachi", business_day_start: b.business_day_start ?? "06:01", day_end_time: b.day_end_time ?? "02:01", tax_registration: { authority: "none", ntn: "", strn: "", pos_id: "", token: "", ...(b.tax_registration ?? {}) } })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  {!b.is_main ? <Button variant="ghost" size="icon-sm" onClick={() => setDel(b)} aria-label="Archive"><Trash2 className="h-4 w-4 text-danger" /></Button> : null}
                </TD>
              </TR>
            )) : <EmptyRow colSpan={6} />}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit branch" : "New branch"}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name || !form?.code} onClick={() => form && save.mutate(form)}>Save</Button></>}>
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Field label="Code" hint="Short, used in serials and receipts"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Address" className="sm:col-span-2"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="City"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Time zone"><Input value={form.time_zone} onChange={(e) => setForm({ ...form, time_zone: e.target.value })} /></Field>
            <div className="sm:col-span-2 mt-2 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Business day</div>
            <Field label="Start" hint="When the business day opens"><Input type="time" value={form.business_day_start} onChange={(e) => setForm({ ...form, business_day_start: e.target.value })} /></Field>
            <Field label="End" hint="May fall on the next day; sales until then count for the previous day"><Input type="time" value={form.day_end_time} onChange={(e) => setForm({ ...form, day_end_time: e.target.value })} /></Field>
            <div className="sm:col-span-2 mt-2 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Tax registration</div>
            <Field label="Authority"><Select value={form.tax_registration.authority} onChange={(e) => setForm({ ...form, tax_registration: { ...form.tax_registration, authority: e.target.value } })}><option value="none">Not registered</option><option value="fbr">FBR</option><option value="pra">PRA</option><option value="srb">SRB</option><option value="kpra">KPRA</option></Select></Field>
            <Field label="POS ID"><Input value={form.tax_registration.pos_id} onChange={(e) => setForm({ ...form, tax_registration: { ...form.tax_registration, pos_id: e.target.value } })} /></Field>
            <Field label="NTN"><Input value={form.tax_registration.ntn} onChange={(e) => setForm({ ...form, tax_registration: { ...form.tax_registration, ntn: e.target.value } })} /></Field>
            <Field label="STRN"><Input value={form.tax_registration.strn} onChange={(e) => setForm({ ...form, tax_registration: { ...form.tax_registration, strn: e.target.value } })} /></Field>
            <Field label="API token" className="sm:col-span-2"><Input type="password" value={form.tax_registration.token} onChange={(e) => setForm({ ...form, tax_registration: { ...form.tax_registration, token: e.target.value } })} /></Field>
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })} title={`Archive ${del?.name}?`} confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}
