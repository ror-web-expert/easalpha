"use client";
import { useState } from "react";
import { Gift, Plus, Pencil, Star, Trash2 } from "lucide-react";
import type { Deal, Product } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/admin/page";
import { useAction, useList, useRemove, useSave } from "@/components/admin/crud";
import { ImageUpload } from "@/components/admin/image-upload";
import { Badge, Button, Checkbox, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Select, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

interface ItemForm { product_id: string; variant_id: string; quantity: number; choice_group: string }
interface Form { id?: string; name: string; description: string; image_key: string; price_minor: number; active: boolean; show_online: boolean; is_favourite: boolean; valid_from: string; valid_to: string; items: ItemForm[] }
const blank: Form = { name: "", description: "", image_key: "", price_minor: 0, active: true, show_online: true, is_favourite: false, valid_from: "", valid_to: "", items: [{ product_id: "", variant_id: "", quantity: 1, choice_group: "" }] };

export default function DealsPage() {
  const list = useList<Deal>("deals", "/deals");
  const products = useQuery({ queryKey: ["products", "all"], queryFn: () => api<{ data: Product[] }>("/products", { query: { limit: 200 } }), select: (r) => r.data });
  const save = useSave<Record<string, unknown>>(["deals"], (f) => (f.id ? `/deals/${f.id}` : "/deals"), { onSuccess: () => setForm(null) });
  const remove = useRemove(["deals"], (id) => `/deals/${id}`);
  const favM = useAction<{ id: string; value: boolean }>(["deals"], ({ id, value }) => api(`/deals/${id}`, { method: "PATCH", body: { is_favourite: value } }));
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<Deal | null>(null);
  const pname = (id: string) => products.data?.find((p) => p.id === id)?.name ?? "?";
  return (
    <>
      <PageHeader icon={Gift} title="Deals" description="Fixed-price combos: a name, a price, a customer-facing description and the component products with quantities. Starred deals sit at the front of the till." actions={<Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New deal</Button>} />
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH></TH><TH>Deal</TH><TH>Items</TH><TH>Valid</TH><TH>Status</TH><TH right>Price</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {list.data?.length ? list.data.map((d) => (
              <TR key={d.id}>
                <TD className="w-10"><button onClick={() => favM.mutate({ id: d.id, value: !d.is_favourite })} aria-label={d.is_favourite ? "Remove from favourites" : "Add to favourites"} disabled={favM.isPending}><Star className={cn("h-4 w-4", d.is_favourite ? "fill-accent text-accent" : "text-fg-muted")} /></button></TD>
                <TD className="font-medium">
                  <span className="flex items-center gap-3">
                    {d.image_key ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.image_key} alt="" className="h-8 w-8 shrink-0 rounded-md border object-cover" />
                    ) : null}
                    <span>{d.name}{d.description ? <div className="max-w-xs truncate text-xs font-normal text-fg-secondary">{d.description}</div> : null}</span>
                  </span>
                </TD>
                <TD className="text-fg-secondary">{d.items.map((i) => `${i.quantity}× ${pname(i.product_id)}${i.choice_group ? ` [${i.choice_group}]` : ""}`).join(", ")}</TD>
                <TD className="text-fg-secondary">{d.valid_from || d.valid_to ? `${formatDate(d.valid_from) || "…"} – ${formatDate(d.valid_to) || "…"}` : "Always"}</TD>
                <TD>{d.active ? <Badge variant="success">active</Badge> : <Badge>inactive</Badge>}</TD>
                <TD right className="font-medium">{formatMoney(d.price_minor)}</TD>
                <TD right className="whitespace-nowrap">
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: d.id, name: d.name, description: d.description ?? "", image_key: d.image_key ?? "", price_minor: d.price_minor, active: d.active, show_online: d.show_online, is_favourite: !!d.is_favourite, valid_from: d.valid_from ?? "", valid_to: d.valid_to ?? "", items: d.items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id ?? "", quantity: i.quantity, choice_group: i.choice_group ?? "" })) })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setDel(d)} aria-label="Delete"><Trash2 className="h-4 w-4 text-danger" /></Button>
                </TD>
              </TR>
            )) : <EmptyRow colSpan={7} icon={Gift} action={<Button size="sm" onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New deal</Button>}>No deals yet. A deal sells a few products together at one price, like a family meal.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit deal" : "New deal"} size="lg"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name || !form?.items.some((i) => i.product_id)} onClick={() => form && save.mutate({ ...form, image_key: form.image_key || null, valid_from: form.valid_from || null, valid_to: form.valid_to || null, items: form.items.filter((i) => i.product_id) })}>Save</Button></>}>
        {form ? (
          <div className="space-y-3">
            <ImageUpload label="Deal image" value={form.image_key} onChange={(k) => setForm({ ...form, image_key: k ?? "" })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
              <Field label="Price"><MoneyInput value={form.price_minor} onChange={(v) => setForm({ ...form, price_minor: v })} /></Field>
              <Field label="Valid from"><Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></Field>
              <Field label="Valid to"><Input type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} /></Field>
            </div>
            <Field label="Description" hint="Shown to customers on the website and the receipt"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <div className="flex flex-wrap gap-4">
              <Checkbox label="Active" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              <Checkbox label="Show online" checked={form.show_online} onChange={(e) => setForm({ ...form, show_online: e.target.checked })} />
              <Checkbox label="Favourite" checked={form.is_favourite} onChange={(e) => setForm({ ...form, is_favourite: e.target.checked })} />
            </div>
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
