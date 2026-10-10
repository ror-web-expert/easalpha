"use client";
import { useState } from "react";
import Link from "next/link";
import { Layers, Plus, Pencil, Trash2, ArrowLeft, CornerDownRight } from "lucide-react";
import type { ExpenseCategory } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useRemove, useSave } from "@/components/admin/crud";
import { useExpenseCategories } from "@/components/admin/delivery";
import { Button, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface Form { id?: string; name: string; parent_id: string; sort_order: number }

export default function ExpenseCategoriesPage() {
  const cats = useExpenseCategories();
  const save = useSave<Form>(["expense_categories"], (f) => (f.id ? `/expenses/categories/${f.id}` : "/expenses/categories"), { onSuccess: () => setForm(null) });
  const remove = useRemove(["expense_categories"], (id) => `/expenses/categories/${id}`, "Category archived");
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<ExpenseCategory | null>(null);
  const roots = cats.data ?? [];
  const row = (c: ExpenseCategory, child: boolean) => (
    <TR key={c.id}>
      <TD className={child ? "pl-8" : "font-medium"}>{child ? <CornerDownRight className="mr-1 inline h-3.5 w-3.5 text-fg-muted" /> : null}{c.name}</TD>
      <TD className="text-fg-secondary">{child ? c.full_name : `${c.children?.length ?? 0} sub-categories`}</TD>
      <TD right className="text-fg-muted">{c.sort_order}</TD>
      <TD right>
        {!child ? <Button variant="ghost" size="icon-sm" onClick={() => setForm({ name: "", parent_id: c.id, sort_order: c.children?.length ?? 0 })} aria-label="Add sub-category"><Plus className="h-4 w-4" /></Button> : null}
        <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: c.id, name: c.name, parent_id: c.parent_id ?? "", sort_order: c.sort_order })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon-sm" onClick={() => setDel(c)} aria-label="Archive"><Trash2 className="h-4 w-4 text-danger" /></Button>
      </TD>
    </TR>
  );
  return (
    <>
      <PageHeader icon={Layers} title="Expense categories" description="Two levels: a category and its sub-categories. Reports group by the top level." actions={<>
        <Link href="/admin/expenses"><Button variant="secondary"><ArrowLeft className="h-4 w-4" /> Expenses</Button></Link>
        <Button onClick={() => setForm({ name: "", parent_id: "", sort_order: roots.length })}><Plus className="h-4 w-4" /> New category</Button>
      </>} />
      {cats.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Name</TH><TH>Details</TH><TH right>Order</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {roots.length ? roots.flatMap((c) => [row(c, false), ...(c.children ?? []).map((x) => row(x, true))]) : <EmptyRow colSpan={4} />}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit category" : form?.parent_id ? "New sub-category" : "New category"} size="sm"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name.trim()} onClick={() => form && save.mutate({ ...form, parent_id: form.parent_id || (null as unknown as string) })}>Save</Button></>}>
        {form ? (
          <div className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Field label="Parent" hint="Leave empty for a top-level category">
              <Select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })} disabled={!!form.id && (roots.find((r) => r.id === form.id)?.children?.length ?? 0) > 0}>
                <option value="">None (top level)</option>
                {roots.filter((r) => r.id !== form.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <Field label="Sort order"><Input type="number" min={0} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></Field>
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })} title={`Archive ${del?.name}?`} description="Sub-categories are archived too. A category with expenses cannot be archived; move them first." confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}
