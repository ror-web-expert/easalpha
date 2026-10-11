"use client";
import { useState } from "react";
import { SlidersHorizontal, Plus, Pencil, Trash2 } from "lucide-react";
import type { ModifierGroup } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/admin/page";
import { useList, useRemove, useSave } from "@/components/admin/crud";
import { Badge, Button, Checkbox, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface ModForm { id?: string; name: string; name_ur: string; price_minor: number }
interface Form { id?: string; name: string; min_select: number; max_select: number | ""; required: boolean; modifiers: ModForm[] }
const blank: Form = { name: "", min_select: 0, max_select: "", required: false, modifiers: [{ name: "", name_ur: "", price_minor: 0 }] };

export default function ModifierGroupsPage() {
  const list = useList<ModifierGroup>("modifier_groups", "/modifier_groups");
  const save = useSave<Form>(["modifier_groups"], (f) => (f.id ? `/modifier_groups/${f.id}` : "/modifier_groups"), { onSuccess: () => setForm(null) });
  const remove = useRemove(["modifier_groups"], (id) => `/modifier_groups/${id}`);
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<ModifierGroup | null>(null);
  return (
    <>
      <PageHeader icon={SlidersHorizontal} title="Modifier groups" description="Choices like spice level or extra toppings, attached to products." actions={<Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New group</Button>} />
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Group</TH><TH>Rules</TH><TH>Modifiers</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {list.data?.length ? list.data.map((g) => (
              <TR key={g.id}>
                <TD className="font-medium">{g.name}</TD>
                <TD>{g.required ? <Badge variant="warning">required</Badge> : <Badge>optional</Badge>} <span className="text-xs text-fg-secondary">min {g.min_select}{g.max_select ? `, max ${g.max_select}` : ""}</span></TD>
                <TD className="text-fg-secondary">{g.modifiers.filter((m) => m.active).map((m) => `${m.name}${m.price_minor ? ` +${formatMoney(m.price_minor)}` : ""}`).join(", ")}</TD>
                <TD right>
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: g.id, name: g.name, min_select: g.min_select, max_select: g.max_select ?? "", required: g.required, modifiers: g.modifiers.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name, name_ur: m.name_ur ?? "", price_minor: m.price_minor })) })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setDel(g)} aria-label="Delete"><Trash2 className="h-4 w-4 text-danger" /></Button>
                </TD>
              </TR>
            )) : <EmptyRow colSpan={4}>No modifier groups yet.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit group" : "New modifier group"}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name} onClick={() => form && save.mutate({ ...form, max_select: form.max_select === "" ? (null as unknown as number) : form.max_select, modifiers: form.modifiers.filter((m) => m.name.trim()) })}>Save</Button></>}>
        {form ? (
          <div className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Min select"><Input type="number" min={0} value={form.min_select} onChange={(e) => setForm({ ...form, min_select: Number(e.target.value) })} /></Field>
              <Field label="Max select"><Input type="number" min={0} value={form.max_select} placeholder="any" onChange={(e) => setForm({ ...form, max_select: e.target.value === "" ? "" : Number(e.target.value) })} /></Field>
              <div className="flex items-end pb-2"><Checkbox label="Required" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} /></div>
            </div>
            <div className="flex items-center justify-between"><span className="text-xs font-medium text-fg-secondary">Modifiers</span><Button size="sm" variant="secondary" onClick={() => setForm({ ...form, modifiers: [...form.modifiers, { name: "", name_ur: "", price_minor: 0 }] })}><Plus className="h-4 w-4" /> Add</Button></div>
            {form.modifiers.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_120px_36px] gap-2">
                <Input placeholder="Name" value={m.name} onChange={(e) => setForm({ ...form, modifiers: form.modifiers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <Input placeholder="Urdu" dir="rtl" value={m.name_ur} onChange={(e) => setForm({ ...form, modifiers: form.modifiers.map((x, j) => (j === i ? { ...x, name_ur: e.target.value } : x)) })} />
                <MoneyInput value={m.price_minor} onChange={(v) => setForm({ ...form, modifiers: form.modifiers.map((x, j) => (j === i ? { ...x, price_minor: v } : x)) })} />
                <Button variant="ghost" size="icon-sm" onClick={() => setForm({ ...form, modifiers: form.modifiers.filter((_, j) => j !== i) })} aria-label="Remove"><Trash2 className="h-4 w-4 text-danger" /></Button>
              </div>
            ))}
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => { if (del) remove.mutate(del.id, { onSuccess: () => setDel(null) }); }} title={`Archive ${del?.name}?`} description="It is detached from every product." confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}
