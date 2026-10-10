"use client";
import { useState } from "react";
import { Warehouse, Plus, Pencil, Archive } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { StockSection, StockValuationRow } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/admin/page";
import { useRemove, useSave } from "@/components/admin/crud";
import { useSections } from "@/components/admin/stock";
import { Badge, Button, Checkbox, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface Form { id?: string; name: string; sort_order: number; is_default: boolean }
const blank: Form = { name: "", sort_order: 0, is_default: false };

export default function StockSectionsPage() {
  const sections = useSections();
  const valuation = useQuery({ queryKey: ["stock_valuation"], queryFn: () => api<{ data: StockValuationRow[] }>("/stock/valuation"), select: (r) => r.data });
  const [form, setForm] = useState<Form | null>(null);
  const [archiving, setArchiving] = useState<StockSection | null>(null);
  const save = useSave<Form, StockSection>(["stock_sections", "stock_valuation"], (f) => (f.id ? `/stock_sections/${f.id}` : "/stock_sections"), { onSuccess: () => setForm(null) });
  const remove = useRemove(["stock_sections", "stock_valuation"], (id) => `/stock_sections/${id}`, "Section archived");
  const val = (id: string) => valuation.data?.find((v) => v.section.id === id);
  return (
    <>
      <PageHeader icon={Warehouse} title="Stock sections" description="Places stock is kept in this branch: kitchen, warehouse, bar. Sales deduct from the default section." actions={<Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New section</Button>} />
      {sections.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Name</TH><TH right>Order</TH><TH right>Items with stock</TH><TH right>Value</TH><TH /></tr></THead>
          <TBody>
            {sections.data?.length ? sections.data.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.name}{s.is_default ? <Badge className="ml-2" variant="primary">default</Badge> : null}</TD>
                <TD right className="text-fg-secondary">{s.sort_order}</TD>
                <TD right>{val(s.id)?.items ?? "-"}</TD>
                <TD right>{formatMoney(val(s.id)?.value_minor)}</TD>
                <TD className="whitespace-nowrap text-right">
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: s.id, name: s.name, sort_order: s.sort_order, is_default: s.is_default })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setArchiving(s)} aria-label="Archive"><Archive className="h-4 w-4 text-danger" /></Button>
                </TD>
              </TR>
            )) : <EmptyRow colSpan={5}>No sections yet.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit section" : "New section"} size="sm"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name} onClick={() => form && save.mutate(form)}>Save</Button></>}>
        {form ? (
          <div className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Field label="Sort order"><Input type="number" className="tabular" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })} /></Field>
            <Checkbox label="Default section (sales deduct from here)" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!archiving} onClose={() => setArchiving(null)} onConfirm={() => archiving && remove.mutate(archiving.id, { onSuccess: () => setArchiving(null) })} title={`Archive ${archiving?.name ?? "section"}?`} description="Move or count its stock to zero first." confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}
