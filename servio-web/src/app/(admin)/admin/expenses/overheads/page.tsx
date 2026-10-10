"use client";
import { useState } from "react";
import Link from "next/link";
import { Gauge, Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";
import type { Overhead, OverheadBasis, OverheadKind } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { titleCase } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page";
import { useList, useRemove, useSave } from "@/components/admin/crud";
import { Badge, Button, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Select, Switch, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface Form { id?: string; name: string; kind: OverheadKind; amount_minor: number; basis: OverheadBasis; active: boolean }
const KINDS: OverheadKind[] = ["labor", "gas", "rent", "utilities", "other"];
const BASES: { value: OverheadBasis; label: string; hint: string }[] = [
  { value: "per_order", label: "Per order", hint: "Added to every paid order" },
  { value: "per_day", label: "Per day", hint: "Spread over each business day" },
  { value: "per_month", label: "Per month", hint: "Spread over the days of the month" },
];
const blank: Form = { name: "", kind: "rent", amount_minor: 0, basis: "per_month", active: true };

export default function OverheadsPage() {
  const list = useList<Overhead>("overheads", "/overheads");
  const save = useSave<Form>(["overheads", "expenses_summary"], (f) => (f.id ? `/overheads/${f.id}` : "/overheads"), { onSuccess: () => setForm(null) });
  const remove = useRemove(["overheads", "expenses_summary"], (id) => `/overheads/${id}`);
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<Overhead | null>(null);
  return (
    <>
      <PageHeader icon={Gauge} title="Overheads" description="Fixed costs that are not paid through the till: rent, salaries, gas. They are allocated to the period in the expenses summary and cost per order." actions={<>
        <Link href="/admin/expenses"><Button variant="secondary"><ArrowLeft className="h-4 w-4" /> Expenses</Button></Link>
        <Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New overhead</Button>
      </>} />
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Name</TH><TH>Kind</TH><TH>Basis</TH><TH>Status</TH><TH right>Amount</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {list.data?.length ? list.data.map((o) => (
              <TR key={o.id}>
                <TD className="font-medium">{o.name}</TD>
                <TD><Badge variant="neutral">{titleCase(o.kind)}</Badge></TD>
                <TD className="text-fg-secondary">{BASES.find((b) => b.value === o.basis)?.label ?? o.basis}</TD>
                <TD><Badge variant={o.active ? "success" : "neutral"}>{o.active ? "Active" : "Inactive"}</Badge></TD>
                <TD right className="font-medium">{formatMoney(o.amount_minor)}</TD>
                <TD right>
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: o.id, name: o.name, kind: o.kind, amount_minor: o.amount_minor, basis: o.basis, active: o.active })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setDel(o)} aria-label="Delete"><Trash2 className="h-4 w-4 text-danger" /></Button>
                </TD>
              </TR>
            )) : <EmptyRow colSpan={6}>No overheads yet. Add rent, salaries or gas to see a true cost per order.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit overhead" : "New overhead"} size="sm"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name.trim() || !form?.amount_minor} onClick={() => form && save.mutate(form)}>Save</Button></>}>
        {form ? (
          <div className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rent, Kitchen staff, Gas cylinder" autoFocus /></Field>
            <Field label="Kind"><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as OverheadKind })}>{KINDS.map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}</Select></Field>
            <Field label="Amount"><MoneyInput value={form.amount_minor} onChange={(v) => setForm({ ...form, amount_minor: v })} /></Field>
            <Field label="Basis" hint={BASES.find((b) => b.value === form.basis)?.hint}><Select value={form.basis} onChange={(e) => setForm({ ...form, basis: e.target.value as OverheadBasis })}>{BASES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</Select></Field>
            <Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Active" />
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })} title={`Delete ${del?.name}?`} confirmLabel="Delete" destructive loading={remove.isPending} />
    </>
  );
}
