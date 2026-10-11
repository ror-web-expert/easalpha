"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import type { BadgeVariant } from "@/components/ui";
import type { Page, StockDocumentKind, StockDocumentStatus, StockItem, StockLedgerKind, StockSection, Unit } from "@/lib/types";
import { useDebounced } from "@/lib/hooks";
import { useList, useSave } from "@/components/admin/crud";
import { Button, Checkbox, Dialog, Field, Input, Select } from "@/components/ui";
import { unitsOfKind } from "@/lib/units";
import { cn } from "@/lib/utils";

// ---- Labels and badges ----
export const DOC_KINDS: { value: StockDocumentKind; label: string; hint: string }[] = [
  { value: "receive", label: "Receive", hint: "Goods in from a supplier. Needs a destination section and unit costs." },
  { value: "transfer", label: "Transfer", hint: "Move stock between two sections." },
  { value: "waste", label: "Waste", hint: "Spoiled, dropped or burnt. Needs a reason." },
  { value: "adjustment", label: "Adjustment", hint: "Correct a quantity up or down." },
  { value: "count", label: "Count", hint: "Enter counted quantities; the difference posts as an adjustment. Only while counting is open." },
  { value: "supplier_return", label: "Supplier return", hint: "Send goods back to the supplier." },
];
export const KIND_LABELS: Record<string, string> = { receive: "Receive", transfer: "Transfer", waste: "Waste", adjustment: "Adjustment", count: "Count", production: "Production", supplier_return: "Supplier return" };
export const LEDGER_KINDS: StockLedgerKind[] = ["sale", "sale_return", "receive", "transfer_in", "transfer_out", "waste", "adjustment", "count", "production_in", "production_out", "supplier_return", "packaging", "opening"];

export function docKindVariant(kind: string | null | undefined): BadgeVariant {
  switch (kind) {
    case "receive": return "success";
    case "transfer": return "info";
    case "waste": return "danger";
    case "adjustment": case "count": return "warning";
    case "supplier_return": return "accent";
    case "production": return "primary";
    default: return "neutral";
  }
}
export function docStatusVariant(status: StockDocumentStatus | string | null | undefined): BadgeVariant {
  switch (status) {
    case "posted": return "success";
    case "cancelled": return "danger";
    default: return "neutral";
  }
}
export function ledgerKindVariant(kind: string | null | undefined): BadgeVariant {
  switch (kind) {
    case "receive": case "transfer_in": case "production_in": case "sale_return": case "opening": return "success";
    case "sale": case "packaging": return "primary";
    case "transfer_out": case "production_out": case "supplier_return": return "info";
    case "waste": return "danger";
    case "adjustment": case "count": return "warning";
    default: return "neutral";
  }
}

// ---- Lookups ----
export function useSections() { return useList<StockSection>("stock_sections", "/stock_sections"); }
export function useUnits() { return useList<Unit>("units", "/units"); }
export function useStockCategories() { return useList<string>("stock_categories", "/stock_items/categories"); }
export function sectionName(sections: StockSection[] | undefined, id: string | null | undefined): string {
  if (!id) return "-";
  return sections?.find((s) => s.id === id)?.name ?? "…";
}

// ---- Item create / edit dialog ----
export interface StockItemForm {
  id?: string; name: string; name_ur: string; sku: string; category: string; base_unit_id: string; purchase_unit_id: string; minimum_qty: string; reorder_qty: string;
  barcode: string; is_packaging: boolean; track_expiry: boolean;
}
const blankItem: StockItemForm = { name: "", name_ur: "", sku: "", category: "", base_unit_id: "", purchase_unit_id: "", minimum_qty: "0", reorder_qty: "0", barcode: "", is_packaging: false, track_expiry: false };

export function itemToForm(i: StockItem): StockItemForm {
  return {
    id: i.id, name: i.name, name_ur: i.name_ur ?? "", sku: i.sku ?? "", category: i.category ?? "", base_unit_id: i.base_unit.id, purchase_unit_id: i.purchase_unit?.id ?? "",
    minimum_qty: String(Number(i.minimum_qty)), reorder_qty: String(Number(i.reorder_qty)), barcode: i.barcode ?? "", is_packaging: i.is_packaging, track_expiry: i.track_expiry,
  };
}

/** Pass `item` as null to keep closed, "new" to create, or a StockItem to edit. */
export function StockItemDialog({ item, onClose, onSaved }: { item: StockItem | "new" | null; onClose: () => void; onSaved?: (saved: StockItem) => void }) {
  const units = useUnits();
  const cats = useStockCategories();
  const [form, setForm] = useState<StockItemForm>(blankItem);
  useEffect(() => {
    if (item === "new") setForm(blankItem);
    else if (item) setForm(itemToForm(item));
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
  const set = <K extends keyof StockItemForm>(k: K, v: StockItemForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const base = units.data?.find((u) => u.id === form.base_unit_id);
  const purchaseUnits = unitsOfKind(units.data, base?.kind).filter((u) => u.id !== base?.id);
  const submit = () => save.mutate({
    id: form.id, name: form.name, name_ur: form.name_ur || null, sku: form.sku || null, category: form.category || null, base_unit_id: form.base_unit_id,
    purchase_unit_id: form.purchase_unit_id || null, minimum_qty: form.minimum_qty || "0", reorder_qty: form.reorder_qty || "0", barcode: form.barcode || null,
    is_packaging: form.is_packaging, track_expiry: form.track_expiry,
  });
  const byKind = (kind: string) => units.data?.filter((u) => u.kind === kind) ?? [];
  return (
    <Dialog open={!!item} onClose={onClose} title={item === "new" ? "New stock item" : "Edit stock item"} description="Quantities are kept in the base unit; the purchase unit is for receiving."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={save.isPending} disabled={!form.name || !form.base_unit_id}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
        <Field label="Name (Urdu)"><Input dir="rtl" value={form.name_ur} onChange={(e) => set("name_ur", e.target.value)} /></Field>
        <Field label="SKU"><Input className="font-mono" value={form.sku} onChange={(e) => set("sku", e.target.value)} /></Field>
        <Field label="Category">
          <Input list="stock-categories" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Meat, Bakery, Grocery…" />
          <datalist id="stock-categories">{cats.data?.map((c) => <option key={c} value={c} />)}</datalist>
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
        <Field label={`Minimum${base ? ` (${base.code})` : ""}`} hint="Flags the item as low below this"><Input type="number" inputMode="decimal" min={0} step="any" className="tabular" value={form.minimum_qty} onChange={(e) => set("minimum_qty", e.target.value)} /></Field>
        <Field label={`Reorder quantity${base ? ` (${base.code})` : ""}`}><Input type="number" inputMode="decimal" min={0} step="any" className="tabular" value={form.reorder_qty} onChange={(e) => set("reorder_qty", e.target.value)} /></Field>
        <Field label="Barcode" className="sm:col-span-2"><Input className="font-mono" value={form.barcode} onChange={(e) => set("barcode", e.target.value)} /></Field>
        <div className="flex flex-wrap gap-4 sm:col-span-2">
          <Checkbox label="Packaging item (deducted per order, not per recipe)" checked={form.is_packaging} onChange={(e) => set("is_packaging", e.target.checked)} />
          <Checkbox label="Track expiry" checked={form.track_expiry} onChange={(e) => set("track_expiry", e.target.checked)} />
        </div>
      </div>
    </Dialog>
  );
}

// ---- Item picker for document lines ----
export function ItemPicker({ value, onPick, className, autoFocus }: { value: StockItem | null; onPick: (item: StockItem) => void; className?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q, 200);
  const wrap = useRef<HTMLDivElement>(null);
  const results = useQuery({ queryKey: ["stock_items_pick", dq], queryFn: () => api<Page<StockItem>>("/stock_items", { query: { q: dq, limit: 20 } }), enabled: open, select: (r) => r.data });
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={wrap} className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
      <Input className="pl-9" value={open ? q : value?.name ?? q} placeholder="Search item" autoFocus={autoFocus} onFocus={() => { setOpen(true); setQ(""); }} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border bg-card shadow-lg">
          {results.isLoading ? <div className="px-3 py-2 text-sm text-fg-muted">Searching…</div> : results.data?.length ? results.data.map((i) => (
            <button key={i.id} type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(i); setOpen(false); setQ(""); }}>
              <span className="truncate"><span className="font-medium">{i.name}</span>{i.sku ? <span className="ml-2 font-mono text-xs text-fg-muted">{i.sku}</span> : null}</span>
              <span className="shrink-0 text-xs text-fg-muted">{i.category ?? ""} · {i.base_unit.code}</span>
            </button>
          )) : <div className="px-3 py-2 text-sm text-fg-muted">No items match.</div>}
        </div>
      ) : null}
    </div>
  );
}
