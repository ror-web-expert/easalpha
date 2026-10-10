"use client";
import { useState } from "react";
import { Gift, Plus, Pencil, Trash2 } from "lucide-react";
import type { Deal, Product } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/admin/page";
import { useList, useRemove, useSave } from "@/components/admin/crud";
import { Badge, Button, Checkbox, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Select, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";

interface ItemForm { product_id: string; variant_id: string; quantity: number; choice_group: string }
interface Form { id?: string; name: string; description: string; price_minor: number; active: boolean; show_online: boolean; valid_from: string; valid_to: string; items: ItemForm[] }
const blank: Form = { name: "", description: "", price_minor: 0, active: true, show_online: true, valid_from: "", valid_to: "", items: [{ product_id: "", variant_id: "", quantity: 1, choice_group: "" }] };

export default function DealsPage() {
  const list = useList<Deal>("deals", "/deals");
  const products = useQuery({ queryKey: ["products", "all"], queryFn: () => api<{ data: Product[] }>("/products", { query: { limit: 200 } }), select: (r) => r.data });
  const save = useSave<Form>(["deals"], (f) => (f.id ? `/deals/${f.id}` : "/deals"), { onSuccess: () => setForm(null) });
  const remove = useRemove(["deals"], (id) => `/deals/${id}`);
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<Deal | null>(null);
  const pname = (id: string) => products.data?.find((p) => p.id === id)?.name ?? "?";
  return (
    <>
      <PageHeader icon={Gift} title="Deals" description="Bundles sold at one price. Choice groups let the customer pick one of several." actions={<Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New deal</Button>} />
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Deal</TH><TH>Items</TH><TH>Valid</TH><TH>Status</TH><TH right>Price</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {list.data?.length ? list.data.map((d) => (
              <TR key={d.id}>
                <TD className="font-medium">{d.name}</TD>
                <TD className="text-fg-secondary">{d.items.map((i) => `${i.quantity}× ${pname(i.product_id)}${i.choice_group ? ` [${i.choice_group}]` : ""}`).join(", ")}</TD>
                <TD className="text-fg-secondary">{d.valid_from || d.valid_to ? `${formatDate(d.valid_from) || "…"} – ${formatDate(d.valid_to) || "…"}` : "Always"}</TD>
                <TD>{d.active ? <Badge variant="success">active</Badge> : <Badge>inactive</Badge>}</TD>
                <TD right className="font-medium">{formatMoney(d.price_minor)}</TD>
                <TD right>
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: d.id, name: d.name, description: d.description ?? "", price_minor: d.price_minor, active: d.active, show_online: d.show_online, valid_from: d.valid_from ?? "", valid_to: d.valid_to ?? "", items: d.items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id ?? "", quantity: i.quantity, choice_group: i.choice_group ?? "" })) })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setDel(d)} aria-label="Delete"><Trash2 className="h-4 w-4 text-danger" /></Button>
                </TD>
              </TR>
            )) : <EmptyRow colSpan={6}>No deals yet.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit deal" : "New deal"} size="lg"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name || !form?.items.some((i) => i.product_id)} onClick={() => form && save.mutate({ ...form, valid_from: form.valid_from || (null as unknown as string), valid_to: form.valid_to || (null as unknown as string), items: form.items.filter((i) => i.product_id) })}>Save</Button></>}>
        {form ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
              <Field label="Price"><MoneyInput value={form.price_minor} onChange={(v) => setForm({ ...form, price_minor: v })} /></Field>
              <Field label="Valid from"><Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></Field>
              <Field label="Valid to"><Input type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} /></Field>
            </div>
            <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <div className="flex gap-4"><Checkbox label="Active" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /><Checkbox label="Show online" checked={form.show_online} onChange={(e) => setForm({ ...form, show_online: e.target.checked })} /></div>
            <div className="flex items-center justify-between"><span className="text-xs font-medium text-fg-secondary">Items</span><Button size="sm" variant="secondary" onClick={() => setForm({ ...form, items: [...form.items, { product_id: "", variant_id: "", quantity: 1, choice_group: "" }] })}><Plus className="h-4 w-4" /> Add</Button></div>
            {form.items.map((it, i) => {
              const prod = products.data?.find((p) => p.id === it.product_id);
              return (
                <div key={i} className="grid grid-cols-[2fr_1fr_80px_1fr_36px] gap-2">
                  <Select value={it.product_id} onChange={(e) => setForm({ ...form, items: form.items.map((x, j) => (j === i ? { ...x, product_id: e.target.value, variant_id: "" } : x)) })}><option value="">Product…</option>{products.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
                  <Select value={it.variant_id} disabled={!prod?.variants?.length} onChange={(e) => setForm({ ...form, items: form.items.map((x, j) => (j === i ? { ...x, variant_id: e.target.value } : x)) })}><option value="">Any variant</option>{prod?.variants?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
                  <Input type="number" min={1} value={it.quantity} onChange={(e) => setForm({ ...form, items: form.items.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)) })} />
                  <Input placeholder="Choice group" value={it.choice_group} onChange={(e) => setForm({ ...form, items: form.items.map((x, j) => (j === i ? { ...x, choice_group: e.target.value } : x)) })} />
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm({ ...form, items: form.items.filter((_, j) => j !== i) })} aria-label="Remove"><Trash2 className="h-4 w-4 text-danger" /></Button>
                </div>
              );
            })}
            <p className="text-xs text-fg-muted">Items with the same choice group are alternatives: the cashier picks one.</p>
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => { if (del) remove.mutate(del.id, { onSuccess: () => setDel(null) }); }} title={`Archive ${del?.name}?`} confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}
