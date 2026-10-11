"use client";
// SPEC Items: name, auto-generated SKU (ADR-GE-9350), purchase category, base unit, minimum stock and an active flag.
// Quantities are not on this form: they change only through Stock Actions and sales.
import { useEffect, useState } from "react";
import type { StockItem } from "@/lib/types";
import { useSave } from "@/components/admin/crud";
import { useStockCategories, useUnits } from "@/components/admin/stock";
import { QUANTITY_NOTICE, SKU_HINT } from "@/components/admin/inventory-helpers";
import { Button, Checkbox, Dialog, Field, Input, Select, Switch } from "@/components/ui";
import { unitsOfKind } from "@/lib/units";

interface ItemForm {
  id?: string; name: string; name_ur: string; sku: string; purchase_category: string; base_unit_id: string; purchase_unit_id: string; minimum_qty: string; reorder_qty: string;
  barcode: string; active: boolean; is_packaging: boolean; track_expiry: boolean;
}
const blank: ItemForm = { name: "", name_ur: "", sku: "", purchase_category: "", base_unit_id: "", purchase_unit_id: "", minimum_qty: "0", reorder_qty: "0", barcode: "", active: true, is_packaging: false, track_expiry: false };

function toForm(i: StockItem): ItemForm {
  return {
    id: i.id, name: i.name, name_ur: i.name_ur ?? "", sku: i.sku ?? "", purchase_category: i.purchase_category ?? i.category ?? "", base_unit_id: i.base_unit.id, purchase_unit_id: i.purchase_unit?.id ?? "",
    minimum_qty: String(Number(i.minimum_qty)), reorder_qty: String(Number(i.reorder_qty)), barcode: i.barcode ?? "", active: i.active ?? true, is_packaging: i.is_packaging, track_expiry: i.track_expiry,
  };
}

/** Pass `item` as null to keep closed, "new" to create, or a StockItem to edit. */
export function InventoryItemDialog({ item, onClose, onSaved }: { item: StockItem | "new" | null; onClose: () => void; onSaved?: (saved: StockItem) => void }) {
  const units = useUnits();
  const cats = useStockCategories();
  const [form, setForm] = useState<ItemForm>(blank);
  useEffect(() => {
    if (item === "new") setForm(blank);
    else if (item) setForm(toForm(item));
  }, [item]);
  useEffect(() => {
    if (item === "new" && !form.base_unit_id && units.data?.length) {
      const pcs = units.data.find((u) => u.code === "pcs") ?? units.data.find((u) => u.is_base) ?? units.data[0];
      setForm((f) => ({ ...f, base_unit_id: pcs.id }));
    }
  }, [item, units.data, form.base_unit_id]);
  const save = useSave<Record<string, unknown>, StockItem>(["stock_items", "stock_item", "stock_levels", "stock_categories"], (f) => (f.id ? `/stock_items/${f.id}` : "/stock_items"), {
    success: item === "new" ? "Item created" : "Item saved",
    onSuccess: (saved) => { onSaved?.(saved); onClose(); },
  });
  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const base = units.data?.find((u) => u.id === form.base_unit_id);
  const purchaseUnits = unitsOfKind(units.data, base?.kind).filter((u) => u.id !== base?.id);
  const byKind = (kind: string) => units.data?.filter((u) => u.kind === kind) ?? [];
  const isNew = item === "new";
  const submit = () => save.mutate({
    id: form.id, name: form.name, name_ur: form.name_ur || null, sku: form.sku.trim() || null, category: form.purchase_category || null, purchase_category: form.purchase_category || null,
    base_unit_id: form.base_unit_id, purchase_unit_id: form.purchase_unit_id || null, minimum_qty: form.minimum_qty || "0", reorder_qty: form.reorder_qty || "0", barcode: form.barcode || null,
    active: form.active, is_packaging: form.is_packaging, track_expiry: form.track_expiry,
  });
  return (
    <Dialog open={!!item} onClose={onClose} title={isNew ? "New stock item" : "Edit stock item"} description={QUANTITY_NOTICE}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={save.isPending} disabled={!form.name || !form.base_unit_id}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
        <Field label="Name (Urdu)"><Input dir="rtl" value={form.name_ur} onChange={(e) => set("name_ur", e.target.value)} /></Field>
        <Field label={isNew ? "SKU (optional)" : "SKU"} hint={isNew ? SKU_HINT : "Generated when the item was created. Change it only if you need a different code."}>
          <Input className="font-mono" value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder={isNew ? "ADR-GE-9350" : undefined} />
        </Field>
        <Field label="Purchase category" hint="Such as ST KARYANA or General Local Purchase">
          <Input list="inventory-purchase-categories" value={form.purchase_category} onChange={(e) => set("purchase_category", e.target.value)} placeholder="Meat, Bakery, Grocery…" />
          <datalist id="inventory-purchase-categories">{cats.data?.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Base unit" hint="Stock is counted in this unit">
          <Select value={form.base_unit_id} onChange={(e) => { const u = units.data?.find((x) => x.id === e.target.value); setForm((f) => ({ ...f, base_unit_id: e.target.value, purchase_unit_id: u && base && u.kind === base.kind ? f.purchase_unit_id : "" })); }}>
            <option value="">Choose…</option>
            {(["weight", "volume", "count"] as const).map((k) => <optgroup key={k} label={k[0].toUpperCase() + k.slice(1)}>{byKind(k).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}</optgroup>)}
          </Select>
        </Field>
        <Field label="Purchase unit" hint={base ? `Same kind as ${base.code}` : undefined}>
          <Select value={form.purchase_unit_id} onChange={(e) => set("purchase_unit_id", e.target.value)} disabled={!base}>
            <option value="">Same as base</option>
            {purchaseUnits.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.code}, ×{Number(u.factor_to_base)})</option>)}
          </Select>
        </Field>
        <Field label={`Minimum stock${base ? ` (${base.code})` : ""}`} hint="Flags the item as low below this and feeds Demand"><Input type="number" inputMode="decimal" min={0} step="any" className="tabular" value={form.minimum_qty} onChange={(e) => set("minimum_qty", e.target.value)} /></Field>
        <Field label={`Reorder quantity${base ? ` (${base.code})` : ""}`}><Input type="number" inputMode="decimal" min={0} step="any" className="tabular" value={form.reorder_qty} onChange={(e) => set("reorder_qty", e.target.value)} /></Field>
        <Field label="Barcode" className="sm:col-span-2"><Input className="font-mono" value={form.barcode} onChange={(e) => set("barcode", e.target.value)} /></Field>
        <div className="sm:col-span-2">
          <Switch checked={form.active} onChange={(v) => set("active", v)} label={form.active ? "Active: offered in pickers and counted in Demand" : "Inactive: kept with its history, hidden from pickers"} />
        </div>
        <div className="flex flex-wrap gap-4 sm:col-span-2">
          <Checkbox label="Packaging item (deducted per order, not per recipe)" checked={form.is_packaging} onChange={(e) => set("is_packaging", e.target.checked)} />
          <Checkbox label="Track expiry" checked={form.track_expiry} onChange={(e) => set("track_expiry", e.target.checked)} />
        </div>
      </div>
    </Dialog>
  );
}
