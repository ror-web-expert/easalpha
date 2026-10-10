"use client";
import { useState } from "react";
import { PackageOpen, Pencil, Plus, Trash2 } from "lucide-react";
import type { Branch, OrderType, PackagingRule, StockItem } from "@/lib/types";
import { titleCase } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page";
import { useList, useRemove, useSave } from "@/components/admin/crud";
import { ItemPicker } from "@/components/admin/stock";
import { Badge, Button, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, Select, Table, TBody, TD, TH, THead, TR, orderTypeVariant } from "@/components/ui";

const ORDER_TYPES: OrderType[] = ["dine_in", "takeaway", "delivery", "walk_in"];
interface Form { id?: string; order_type: OrderType; item: StockItem | null; stock_item_id: string; item_name: string; quantity: string; branch_id: string }
const blank: Form = { order_type: "takeaway", item: null, stock_item_id: "", item_name: "", quantity: "1", branch_id: "" };

export default function PackagingPage() {
  const rules = useList<PackagingRule>("packaging_rules", "/packaging_rules");
  const branches = useList<Branch>("branches", "/branches");
  const [form, setForm] = useState<Form | null>(null);
  const [removing, setRemoving] = useState<PackagingRule | null>(null);
  const save = useSave<Record<string, unknown>>(["packaging_rules"], (f) => (f.id ? `/packaging_rules/${f.id}` : "/packaging_rules"), { success: "Rule saved", onSuccess: () => setForm(null) });
  const remove = useRemove(["packaging_rules"], (id) => `/packaging_rules/${id}`, "Rule removed");
  const branchName = (id: string | null) => (id ? branches.data?.find((b) => b.id === id)?.name ?? "…" : "All branches");
  return (
    <>
      <PageHeader icon={PackageOpen} title="Packaging" description="Boxes, bags and cutlery deducted once per order by order type, on top of the recipes. Mark the items as packaging items first." actions={<Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New rule</Button>} />
      {rules.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Order type</TH><TH>Item</TH><TH right>Per order</TH><TH>Branch</TH><TH right></TH></tr></THead>
          <TBody>
            {rules.data?.length ? rules.data.map((r) => (
              <TR key={r.id}>
                <TD><Badge variant={orderTypeVariant(r.order_type)}>{titleCase(r.order_type)}</Badge></TD>
                <TD className="font-medium">{r.item_name}</TD>
                <TD right>{Number(r.quantity)} {r.unit_code}</TD>
                <TD className="text-fg-secondary">{branchName(r.branch_id)}</TD>
                <TD right className="whitespace-nowrap">
                  <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setForm({ id: r.id, order_type: r.order_type, item: null, stock_item_id: r.stock_item_id, item_name: r.item_name, quantity: String(Number(r.quantity)), branch_id: r.branch_id ?? "" })}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setRemoving(r)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                </TD>
              </TR>
            )) : <EmptyRow colSpan={5}>No packaging rules. Add one per order type, e.g. one takeaway box per takeaway order.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit packaging rule" : "New packaging rule"} size="sm"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form || !form.stock_item_id || !(Number(form.quantity) > 0)} onClick={() => form && save.mutate({ id: form.id, order_type: form.order_type, stock_item_id: form.stock_item_id, quantity: form.quantity, branch_id: form.branch_id || null })}>Save</Button></>}>
        {form ? (
          <div className="space-y-3">
            <Field label="Order type"><Select value={form.order_type} onChange={(e) => setForm({ ...form, order_type: e.target.value as OrderType })}>{ORDER_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select></Field>
            <Field label="Packaging item" hint={form.item_name && !form.item ? `Current: ${form.item_name}` : undefined}><ItemPicker value={form.item ?? (form.item_name ? ({ name: form.item_name } as StockItem) : null)} onPick={(it) => setForm({ ...form, item: it, stock_item_id: it.id, item_name: it.name })} /></Field>
            <Field label={`Quantity per order${form.item ? ` (${form.item.base_unit.code})` : ""}`}><Input type="number" inputMode="decimal" min={0} step="any" className="tabular" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
            <Field label="Branch" hint="Blank applies everywhere; a branch rule replaces the general one there"><Select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}><option value="">All branches</option>{branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} onConfirm={() => removing && remove.mutate(removing.id, { onSuccess: () => setRemoving(null) })} title="Remove this rule?" description={removing ? `${titleCase(removing.order_type)} orders will stop deducting ${removing.item_name}.` : undefined} confirmLabel="Remove" destructive loading={remove.isPending} />
    </>
  );
}
