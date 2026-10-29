"use client";
import { useState } from "react";
import { Percent, Plus, Pencil, Trash2 } from "lucide-react";
import type { Promotion } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/admin/page";
import { useList, useRemove, useSave } from "@/components/admin/crud";
import { Badge, Button, Checkbox, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
interface Form { id?: string; name: string; kind: string; value: number; coupon_code: string; applies_to: string; days: string[]; start_time: string; end_time: string; valid_from: string; valid_to: string; unit_limit: number | ""; min_order_minor: number; active: boolean }
const blank: Form = { name: "", kind: "percent", value: 10, coupon_code: "", applies_to: "order", days: [], start_time: "", end_time: "", valid_from: "", valid_to: "", unit_limit: "", min_order_minor: 0, active: true };

export default function PromotionsPage() {
  const list = useList<Promotion>("promotions", "/promotions");
  const save = useSave<Form>(["promotions"], (f) => (f.id ? `/promotions/${f.id}` : "/promotions"), { onSuccess: () => setForm(null) });
  const remove = useRemove(["promotions"], (id) => `/promotions/${id}`);
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<Promotion | null>(null);
  const nul = (s: string) => (s ? s : (null as unknown as string));
  return (
    <>
      <PageHeader icon={Percent} title="Promotions" description="Percent or fixed discounts, coupons, happy hours." actions={<Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New promotion</Button>} />
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Name</TH><TH>Discount</TH><TH>Coupon</TH><TH>When</TH><TH>Status</TH><TH right>Used</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {list.data?.length ? list.data.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium">{p.name}</TD>
                <TD>{p.kind === "percent" ? `${p.value}%` : formatMoney(p.value * 100)}{p.min_order_minor ? <span className="text-xs text-fg-muted"> min {formatMoney(p.min_order_minor)}</span> : null}</TD>
                <TD className="font-mono text-xs">{p.coupon_code ?? "-"}</TD>
                <TD className="text-xs text-fg-secondary">{p.days?.length ? p.days.join(", ") : "Any day"}{p.start_time ? ` ${p.start_time}–${p.end_time}` : ""}{p.valid_from ? ` · ${p.valid_from} → ${p.valid_to ?? "…"}` : ""}</TD>
                <TD>{p.sold_out ? <Badge variant="danger">sold out</Badge> : p.active ? <Badge variant="success">active</Badge> : <Badge>inactive</Badge>}</TD>
                <TD right>{p.units_sold}{p.unit_limit ? ` / ${p.unit_limit}` : ""}</TD>
                <TD right>
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: p.id, name: p.name, kind: p.kind, value: p.value, coupon_code: p.coupon_code ?? "", applies_to: p.applies_to ?? "order", days: p.days ?? [], start_time: p.start_time ?? "", end_time: p.end_time ?? "", valid_from: p.valid_from ?? "", valid_to: p.valid_to ?? "", unit_limit: p.unit_limit ?? "", min_order_minor: p.min_order_minor ?? 0, active: p.active })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setDel(p)} aria-label="Delete"><Trash2 className="h-4 w-4 text-danger" /></Button>
                </TD>
              </TR>
            )) : <EmptyRow colSpan={7} icon={Percent} action={<Button size="sm" onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New promotion</Button>}>No promotions yet. A promotion is a discount for a time, a coupon code or a happy hour.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit promotion" : "New promotion"}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name} onClick={() => form && save.mutate({ ...form, coupon_code: nul(form.coupon_code), start_time: nul(form.start_time), end_time: nul(form.end_time), valid_from: nul(form.valid_from), valid_to: nul(form.valid_to), unit_limit: form.unit_limit === "" ? (null as unknown as number) : form.unit_limit })}>Save</Button></>}>
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Field label="Kind"><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="percent">Percent off</option><option value="fixed">Fixed amount off</option></Select></Field>
            <Field label={form.kind === "percent" ? "Percent" : "Amount (Rs)"}><Input type="number" min={0} value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} /></Field>
            <Field label="Coupon code" hint="Leave blank for an automatic promotion"><Input className="font-mono uppercase" value={form.coupon_code} onChange={(e) => setForm({ ...form, coupon_code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Minimum order"><MoneyInput value={form.min_order_minor} onChange={(v) => setForm({ ...form, min_order_minor: v })} /></Field>
            <Field label="Start time"><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></Field>
            <Field label="End time"><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></Field>
            <Field label="Valid from"><Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></Field>
            <Field label="Valid to"><Input type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} /></Field>
            <Field label="Unit limit" hint="Blank for unlimited"><Input type="number" min={0} value={form.unit_limit} onChange={(e) => setForm({ ...form, unit_limit: e.target.value === "" ? "" : Number(e.target.value) })} /></Field>
            <div className="flex items-end pb-2"><Checkbox label="Active" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /></div>
            <div className="flex flex-wrap gap-3 sm:col-span-2">{DAYS.map((d) => <Checkbox key={d} label={d} checked={form.days.includes(d)} onChange={(e) => setForm({ ...form, days: e.target.checked ? [...form.days, d] : form.days.filter((x) => x !== d) })} />)}</div>
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => { if (del) remove.mutate(del.id, { onSuccess: () => setDel(null) }); }} title={`Archive ${del?.name}?`} confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}
