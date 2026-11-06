"use client";
import { useState } from "react";
import { Building2, Plus, Pencil, Trash2 } from "lucide-react";
import type { Branch } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useList, useRemove, useSave } from "@/components/admin/crud";
import { branchCode } from "@/components/admin/branch-helpers";
import { isTimeZone, taxRegistrationPayload, timeZoneOptions, type TaxForm } from "@/components/admin/store-helpers";
import { Badge, Button, Checkbox, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { useAuthStore } from "@/store/auth";
import { ReadOnly } from "@/components/admin/read-only";

// token_set and token_hint come from the API (settings.manage only); the token itself never does (S1).
interface Form { id?: string; name: string; code: string; address: string; city: string; phone: string; time_zone: string; business_day_start: string; day_end_time: string; tax: TaxForm; token_set: boolean; token_hint: string | null }
const blankTax: TaxForm = { authority: "none", ntn: "", strn: "", pos_id: "", token: "", token_clear: false };
const blank: Form = { name: "", code: "", address: "", city: "", phone: "", time_zone: "Asia/Karachi", business_day_start: "06:01", day_end_time: "02:01", tax: blankTax, token_set: false, token_hint: null };

function formFor(b: Branch): Form {
  const t = b.tax_registration ?? {};
  return {
    id: b.id, name: b.name, code: b.code, address: b.address ?? "", city: b.city ?? "", phone: b.phone ?? "", time_zone: b.time_zone ?? "Asia/Karachi",
    business_day_start: b.business_day_start ?? "06:01", day_end_time: b.day_end_time ?? "02:01",
    tax: { ...blankTax, authority: t.authority ?? "none", ntn: t.ntn ?? "", strn: t.strn ?? "", pos_id: t.pos_id ?? "" }, token_set: !!t.token_set, token_hint: t.token_hint ?? null,
  };
}

export default function BranchesPage() {
  const list = useList<Branch>("branches", "/branches");
  const save = useSave<Record<string, unknown>>(["branches"], (f) => (f.id ? `/branches/${f.id}` : "/branches"), { onSuccess: () => setForm(null) });
  const remove = useRemove(["branches"], (id) => `/branches/${id}`);
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<Branch | null>(null);
  // A new branch starts on the store's clock (S3), as the API does when no zone is sent.
  const storeZone = useAuthStore((s) => s.session?.business?.time_zone) ?? "Asia/Karachi";
  const setTax = (patch: Partial<TaxForm>) => form && setForm({ ...form, tax: { ...form.tax, ...patch } });
  const zoneError = form && !isTimeZone(form.time_zone) ? "Pick a time zone from the list, such as Asia/Karachi" : undefined;
  const submit = () => {
    if (!form) return;
    const { id, name, code, address, city, phone, time_zone, business_day_start, day_end_time } = form;
    save.mutate({ id, name, code, address, city, phone, time_zone, business_day_start, day_end_time, tax_registration: taxRegistrationPayload(form.tax) });
  };
  return (
    <ReadOnly>
      <PageHeader icon={Building2} title="Store Management" description="Branches managed from this dashboard. Each has its own business-day window, tax registration and devices." actions={<Button onClick={() => setForm({ ...blank, time_zone: storeZone })}><Plus className="h-4 w-4" /> New branch</Button>} />
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
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm(formFor(b))} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  {!b.is_main ? <Button variant="ghost" size="icon-sm" onClick={() => setDel(b)} aria-label="Archive"><Trash2 className="h-4 w-4 text-danger" /></Button> : null}
                </TD>
              </TR>
            )) : <EmptyRow colSpan={6} />}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit branch" : "New branch"}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name || !form?.code || !!zoneError} title={!form?.name || !form?.code ? "Enter a name and a code to save" : zoneError} onClick={submit}>Save</Button></>}>
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            {/* The code is printed in every receipt number and its barcode: 1 to 8 of A-Z and 0-9 (R15). An older code is
                left as it is until someone edits it. */}
            <Field label="Code" hint="1 to 8 letters and digits, used in receipt numbers and their barcode"><Input className="font-mono uppercase" maxLength={8} value={form.code} onChange={(e) => setForm({ ...form, code: branchCode(e.target.value) })} /></Field>
            <Field label="Address" className="sm:col-span-2"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="City"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Time zone" error={zoneError} hint={zoneError ? undefined : "Follows the store's time zone when that changes, unless you set another here"}>
              <Select value={form.time_zone} onChange={(e) => setForm({ ...form, time_zone: e.target.value })}>{timeZoneOptions(form.time_zone).map((z) => <option key={z} value={z}>{z}</option>)}</Select>
            </Field>
            <div className="sm:col-span-2 mt-2 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Business day</div>
            <Field label="Start" hint="When the business day opens"><Input type="time" value={form.business_day_start} onChange={(e) => setForm({ ...form, business_day_start: e.target.value })} /></Field>
            <Field label="End" hint="May fall on the next day; sales until then count for the previous day"><Input type="time" value={form.day_end_time} onChange={(e) => setForm({ ...form, day_end_time: e.target.value })} /></Field>
            <div className="sm:col-span-2 mt-2 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Tax registration</div>
            <Field label="Authority"><Select value={form.tax.authority} onChange={(e) => setTax({ authority: e.target.value })}><option value="none">Not registered</option><option value="fbr">FBR</option><option value="pra">PRA</option><option value="srb">SRB</option><option value="kpra">KPRA</option></Select></Field>
            <Field label="POS ID" hint="Printed on the receipt"><Input value={form.tax.pos_id} onChange={(e) => setTax({ pos_id: e.target.value })} /></Field>
            <Field label="NTN" hint="Printed on the receipt"><Input value={form.tax.ntn} onChange={(e) => setTax({ ntn: e.target.value })} /></Field>
            <Field label="STRN" hint="Printed on the receipt"><Input value={form.tax.strn} onChange={(e) => setTax({ strn: e.target.value })} /></Field>
            <Field label="API token" className="sm:col-span-2"
              hint={form.token_set ? `A token is saved${form.token_hint ? ` (${form.token_hint})` : ""}. It stays on the server and never prints. Type a new one to replace it.` : "Stays on the server: it never prints and no till receives it."}>
              <Input type="password" autoComplete="new-password" value={form.tax.token} disabled={form.tax.token_clear} placeholder={form.token_set ? "Saved; leave blank to keep it" : ""} onChange={(e) => setTax({ token: e.target.value })} />
            </Field>
            {form.token_set ? <Checkbox className="sm:col-span-2" label="Remove the saved token" checked={form.tax.token_clear} onChange={(e) => setTax({ token_clear: e.target.checked, token: "" })} /> : null}
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })} title={`Archive ${del?.name}?`} confirmLabel="Archive" destructive loading={remove.isPending} />
    </ReadOnly>
  );
}
