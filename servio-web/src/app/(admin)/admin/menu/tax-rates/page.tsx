"use client";
import { useState } from "react";
import { Tag, Plus, Pencil, Trash2 } from "lucide-react";
import type { TaxRate } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useList, useRemove, useSave } from "@/components/admin/crud";
import { Badge, Button, Checkbox, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface Form { id?: string; name: string; rate: number; inclusive: boolean; authority: string; is_default: boolean; active: boolean }
const blank: Form = { name: "", rate: 16, inclusive: false, authority: "fbr", is_default: false, active: true };

export default function TaxRatesPage() {
  const list = useList<TaxRate>("tax_rates", "/tax_rates");
  const save = useSave<Form>(["tax_rates"], (f) => (f.id ? `/tax_rates/${f.id}` : "/tax_rates"), { onSuccess: () => setForm(null) });
  const remove = useRemove(["tax_rates"], (id) => `/tax_rates/${id}`);
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<TaxRate | null>(null);
  return (
    <>
      <PageHeader icon={Tag} title="Tax rates" description="Sales tax per product. Inclusive rates are already inside the price." actions={<Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New rate</Button>} />
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Name</TH><TH right>Rate</TH><TH>Mode</TH><TH>Authority</TH><TH>Status</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {list.data?.length ? list.data.map((t) => (
              <TR key={t.id}>
                <TD className="font-medium">{t.name} {t.is_default ? <Badge variant="primary">default</Badge> : null}</TD>
                <TD right>{t.rate}%</TD>
                <TD>{t.inclusive ? "Inclusive" : "Exclusive"}</TD>
                <TD className="uppercase text-fg-secondary">{t.authority ?? "-"}</TD>
                <TD>{t.active ? <Badge variant="success">active</Badge> : <Badge>inactive</Badge>}</TD>
                <TD right>
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: t.id, name: t.name, rate: t.rate, inclusive: t.inclusive, authority: t.authority ?? "", is_default: t.is_default, active: t.active })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setDel(t)} aria-label="Delete"><Trash2 className="h-4 w-4 text-danger" /></Button>
                </TD>
              </TR>
            )) : <EmptyRow colSpan={6}>No tax rates. Add one if you are registered.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit tax rate" : "New tax rate"} size="sm"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name} onClick={() => form && save.mutate(form)}>Save</Button></>}>
        {form ? (
          <div className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Field label="Rate (%)"><Input type="number" step="0.01" min={0} value={form.rate} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} /></Field>
            <Field label="Authority"><Select value={form.authority} onChange={(e) => setForm({ ...form, authority: e.target.value })}><option value="">None</option><option value="fbr">FBR</option><option value="pra">PRA</option><option value="srb">SRB</option><option value="kpra">KPRA</option><option value="bra">BRA</option></Select></Field>
            <Checkbox label="Price includes tax" checked={form.inclusive} onChange={(e) => setForm({ ...form, inclusive: e.target.checked })} />
            <Checkbox label="Default for new products" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
            <Checkbox label="Active" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => { if (del) remove.mutate(del.id, { onSuccess: () => setDel(null) }); }} title={`Deactivate ${del?.name}?`} description="Products still using it block this." confirmLabel="Deactivate" destructive loading={remove.isPending} />
    </>
  );
}
