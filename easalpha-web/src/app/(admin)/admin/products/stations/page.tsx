"use client";
import { useState } from "react";
import { ChefHat, Plus, Pencil, Trash2 } from "lucide-react";
import type { Station } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useList, useRemove, useSave } from "@/components/admin/crud";
import { Button, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface Form { id?: string; name: string; printer_name: string; sort_order: number }
const blank: Form = { name: "", printer_name: "", sort_order: 0 };

export default function StationsPage() {
  const list = useList<Station>("stations", "/stations");
  const save = useSave<Form>(["stations"], (f) => (f.id ? `/stations/${f.id}` : "/stations"), { onSuccess: () => setForm(null) });
  const remove = useRemove(["stations"], (id) => `/stations/${id}`);
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<Station | null>(null);
  return (
    <>
      <PageHeader icon={ChefHat} title="Stations" description="BBQ, Karahi, Tandoor, Drinks: each gets its own tickets and display." actions={<Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New station</Button>} />
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Name</TH><TH>Printer</TH><TH right>Order</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {list.data?.length ? list.data.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.name}</TD>
                <TD className="text-fg-secondary">{s.printer_name ?? "-"}</TD>
                <TD right>{s.sort_order}</TD>
                <TD right>
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: s.id, name: s.name, printer_name: s.printer_name ?? "", sort_order: s.sort_order })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setDel(s)} aria-label="Delete"><Trash2 className="h-4 w-4 text-danger" /></Button>
                </TD>
              </TR>
            )) : <EmptyRow colSpan={4}>No stations. Without stations every item goes to one kitchen screen.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit station" : "New station"} size="sm"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name} onClick={() => form && save.mutate(form)}>Save</Button></>}>
        {form ? (
          <div className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Field label="Printer name" hint="Optional; the till prints KOTs here as fallback"><Input value={form.printer_name} onChange={(e) => setForm({ ...form, printer_name: e.target.value })} /></Field>
            <Field label="Sort order"><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></Field>
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => { if (del) remove.mutate(del.id, { onSuccess: () => setDel(null) }); }} title={`Archive ${del?.name}?`} confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}
