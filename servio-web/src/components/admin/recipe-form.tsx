"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { InventorySettings, Page, Product, Recipe, RecipeInput, StockItem, TaxRate, Variant } from "@/lib/types";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatUnitCost, toBase, unitsOfKind } from "@/lib/units";
import { useDebounced } from "@/lib/hooks";
import { uuid, cn } from "@/lib/utils";
import { useList } from "@/components/admin/crud";
import { ItemPicker, useSections, useUnits } from "@/components/admin/stock";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Stat, Textarea } from "@/components/ui";

export type RecipeMode = "product" | "sub";
export interface RecipeLineDraft { key: string; item: StockItem | null; unit_id: string; quantity: string; waste_percent: string }
export const newRecipeLine = (): RecipeLineDraft => ({ key: uuid(), item: null, unit_id: "", quantity: "", waste_percent: "0" });

export interface RecipeDraft {
  mode: RecipeMode; name: string; product: Product | null; variant_id: string; output_item: StockItem | null; yield_qty: string; yield_unit_id: string; source_section_id: string; notes: string; lines: RecipeLineDraft[];
}
export const blankRecipe = (mode: RecipeMode = "product"): RecipeDraft => ({ mode, name: "", product: null, variant_id: "", output_item: null, yield_qty: "1", yield_unit_id: "", source_section_id: "", notes: "", lines: [newRecipeLine()] });

/** Line cost in minor units from the item's average cost: base quantity × (1 + waste%) × avg cost per base. */
export function lineCost(l: RecipeLineDraft, unitFactor: number): number {
  if (!l.item) return 0;
  const base = toBase(Number(l.quantity) || 0, { factor_to_base: String(unitFactor) });
  return Math.round(base * (1 + (Number(l.waste_percent) || 0) / 100) * Number(l.item.avg_cost_minor_per_base || 0));
}

export function priceExTax(product: Product, variant: Variant | null | undefined, taxes: TaxRate[] | undefined): number {
  const price = variant ? variant.price_minor : product.base_price_minor;
  const tax = taxes?.find((t) => t.id === product.tax_rate_id);
  if (!tax?.inclusive) return price;
  return Math.round(price / (1 + Number(tax.rate) / 100));
}

/** Load the draft for an existing recipe: fetches each line's stock item so units and live costs work. */
export async function recipeToDraft(r: Recipe): Promise<RecipeDraft> {
  const ids = Array.from(new Set((r.lines ?? []).map((l) => l.stock_item_id).concat(r.output_stock_item_id ? [r.output_stock_item_id] : [])));
  const items = await Promise.all(ids.map((id) => api<StockItem>(`/stock_items/${id}`).catch(() => null)));
  const byId = new Map(ids.map((id, i) => [id, items[i]]));
  const product = r.product_id ? await api<Product>(`/products/${r.product_id}`).catch(() => null) : null;
  return {
    mode: r.is_sub_recipe ? "sub" : "product", name: r.name, product, variant_id: r.variant_id ?? "", output_item: r.output_stock_item_id ? byId.get(r.output_stock_item_id) ?? null : null,
    yield_qty: String(Number(r.yield_qty) || 1), yield_unit_id: r.yield_unit?.id ?? "", source_section_id: r.source_section_id ?? "", notes: r.notes ?? "",
    lines: (r.lines ?? []).length ? (r.lines ?? []).map((l) => ({ key: uuid(), item: byId.get(l.stock_item_id) ?? null, unit_id: l.unit_id, quantity: String(Number(l.quantity)), waste_percent: String(Number(l.waste_percent) || 0) })) : [newRecipeLine()],
  };
}

export function draftToInput(d: RecipeDraft, existingId?: string): RecipeInput {
  return {
    id: existingId, name: d.name.trim(),
    ...(existingId ? {} : d.mode === "product" ? { product_id: d.product?.id ?? null } : { output_stock_item_id: d.output_item?.id ?? null }),
    variant_id: d.mode === "product" ? d.variant_id || null : null,
    yield_qty: d.yield_qty || "1", yield_unit_id: d.mode === "sub" ? d.yield_unit_id || null : null, source_section_id: d.source_section_id || null, notes: d.notes || null,
    lines: d.lines.filter((l) => l.item && l.quantity !== "").map((l) => ({ stock_item_id: l.item!.id, unit_id: l.unit_id || undefined, quantity: l.quantity, waste_percent: l.waste_percent || 0 })),
  };
}

export function recipeProblems(d: RecipeDraft): string[] {
  const p: string[] = [];
  if (!d.name.trim()) p.push("Give the recipe a name.");
  if (d.mode === "product" && !d.product) p.push("Choose the product this recipe makes.");
  if (d.mode === "sub" && !d.output_item) p.push("Choose the stock item this sub-recipe produces.");
  if (d.mode === "sub" && (!(Number(d.yield_qty) > 0))) p.push("Yield must be above zero.");
  const filled = d.lines.filter((l) => l.item);
  if (!filled.length) p.push("Add at least one ingredient.");
  filled.forEach((l) => { if (!(Number(l.quantity) > 0)) p.push(`${l.item!.name}: enter a quantity.`); });
  return p;
}

// ---- Product picker (search /products?q=) ----
export function ProductPicker({ value, onPick, autoFocus, className }: { value: Product | null; onPick: (p: Product) => void; autoFocus?: boolean; className?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q, 200);
  const wrap = useRef<HTMLDivElement>(null);
  const results = useQuery({ queryKey: ["products_pick", dq], queryFn: () => api<Page<Product>>("/products", { query: { q: dq, limit: 20 } }), enabled: open, select: (r) => r.data });
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={wrap} className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
      <Input className="pl-9" value={open ? q : value?.name ?? q} placeholder="Search product" autoFocus={autoFocus} onFocus={() => { setOpen(true); setQ(""); }} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border bg-card shadow-lg">
          {results.isLoading ? <div className="px-3 py-2 text-sm text-fg-muted">Searching…</div> : results.data?.length ? results.data.map((p) => (
            <button key={p.id} type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(p); setOpen(false); setQ(""); }}>
              <span className="truncate"><span className="font-medium">{p.name}</span>{p.sku ? <span className="ml-2 font-mono text-xs text-fg-muted">{p.sku}</span> : null}</span>
              <span className="shrink-0 text-xs text-fg-muted">{formatMoney(p.base_price_minor)}{p.variants?.length ? ` · ${p.variants.length} variants` : ""}</span>
            </button>
          )) : <div className="px-3 py-2 text-sm text-fg-muted">No products match.</div>}
        </div>
      ) : null}
    </div>
  );
}

// ---- The form ----
export function RecipeForm({ draft, onChange, existing, saved }: { draft: RecipeDraft; onChange: (d: RecipeDraft) => void; existing?: Recipe | null; saved?: Recipe | null }) {
  const units = useUnits();
  const sections = useSections();
  const taxes = useList<TaxRate>("tax_rates", "/tax_rates");
  const settings = useQuery({ queryKey: ["inventory_settings"], queryFn: () => api<InventorySettings>("/inventory_settings") });
  const set = <K extends keyof RecipeDraft>(k: K, v: RecipeDraft[K]) => onChange({ ...draft, [k]: v });
  const setLine = (key: string, patch: Partial<RecipeLineDraft>) => onChange({ ...draft, lines: draft.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });
  const locked = !!existing; // product / output item cannot change after creation (API ignores them on update)
  const yieldUnits = unitsOfKind(units.data, draft.output_item?.base_unit.kind);
  const factorOf = (l: RecipeLineDraft) => Number((unitsOfKind(units.data, l.item?.base_unit.kind).find((u) => u.id === l.unit_id) ?? l.item?.base_unit)?.factor_to_base ?? 1);
  const total = useMemo(() => draft.lines.reduce((a, l) => a + lineCost(l, factorOf(l)), 0), [draft.lines, units.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const yieldUnit = yieldUnits.find((u) => u.id === draft.yield_unit_id) ?? draft.output_item?.base_unit;
  const yieldBase = draft.mode === "sub" && yieldUnit ? toBase(Number(draft.yield_qty) || 0, yieldUnit) : Number(draft.yield_qty) || 1;
  const unitCost = yieldBase > 0 ? total / yieldBase : 0;
  const variant = draft.product?.variants?.find((v) => v.id === draft.variant_id) ?? null;
  const price = draft.product ? priceExTax(draft.product, variant, taxes.data) : 0;
  const target = settings.data?.food_cost_target_percent ?? saved?.food_cost?.target_percent ?? 35;
  const perServing = Number(draft.yield_qty) > 0 ? total / Number(draft.yield_qty) : total;
  const percent = price > 0 ? (perServing * 100) / price : null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>What it makes</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            {!locked ? (
              <div className="grid grid-cols-2 gap-2">
                {([["product", "Product recipe", "Deducted when the product sells"], ["sub", "Sub-recipe", "Produces a stock item in batches"]] as const).map(([m, label, hint]) => (
                  <button key={m} type="button" onClick={() => onChange({ ...draft, mode: m })} className={cn("rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors hover:border-primary", draft.mode === m && "border-primary bg-primary-soft font-medium")}>
                    {label}<div className="text-xs font-normal text-fg-muted">{hint}</div>
                  </button>
                ))}
              </div>
            ) : <Badge variant={draft.mode === "sub" ? "accent" : "primary"}>{draft.mode === "sub" ? "Sub-recipe" : "Product recipe"}</Badge>}
            {draft.mode === "product" ? (
              <>
                <Field label="Product">{locked ? <Input value={draft.product?.name ?? existing?.product_name ?? ""} disabled /> : <ProductPicker value={draft.product} onPick={(p) => onChange({ ...draft, product: p, variant_id: "", name: draft.name || p.name })} autoFocus={!draft.product} />}</Field>
                {draft.product?.variants?.length ? (
                  <Field label="Variant" hint="Leave blank for a recipe shared by all variants">
                    <Select value={draft.variant_id} onChange={(e) => set("variant_id", e.target.value)}><option value="">All variants</option>{draft.product.variants.map((v) => <option key={v.id} value={v.id}>{v.name} ({formatMoney(v.price_minor)})</option>)}</Select>
                  </Field>
                ) : null}
                <Field label="Servings per batch" hint="Usually 1: the lines below make one portion"><Input type="number" inputMode="decimal" min={0} step="any" className="tabular" value={draft.yield_qty} onChange={(e) => set("yield_qty", e.target.value)} /></Field>
              </>
            ) : (
              <>
                <Field label="Output stock item">{locked ? <Input value={draft.output_item?.name ?? existing?.output_item_name ?? ""} disabled /> : <ItemPicker value={draft.output_item} onPick={(it) => onChange({ ...draft, output_item: it, yield_unit_id: it.base_unit.id, name: draft.name || it.name })} />}</Field>
                <div className="grid grid-cols-[1fr_110px] gap-2">
                  <Field label="Yield"><Input type="number" inputMode="decimal" min={0} step="any" className="tabular" value={draft.yield_qty} onChange={(e) => set("yield_qty", e.target.value)} disabled={!draft.output_item} /></Field>
                  <Field label="Unit"><Select value={draft.yield_unit_id} onChange={(e) => set("yield_unit_id", e.target.value)} disabled={!draft.output_item}>{draft.output_item ? yieldUnits.map((u) => <option key={u.id} value={u.id}>{u.code}</option>) : <option value="">-</option>}</Select></Field>
                </div>
              </>
            )}
            <Field label="Name"><Input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder={draft.mode === "sub" ? "Marinated chicken" : "Zinger Burger"} /></Field>
            <Field label="Source section" hint="Where ingredients are taken from; blank = the default section">
              <Select value={draft.source_section_id} onChange={(e) => set("source_section_id", e.target.value)}><option value="">Default section</option>{sections.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            </Field>
            <Field label="Notes"><Textarea value={draft.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Method, prep notes…" /></Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>{draft.mode === "product" ? "Food cost" : "Batch cost"}</CardTitle>{draft.mode === "product" && percent !== null ? <Badge variant={percent > target ? "danger" : "success"}>{percent > target ? "Over target" : "On target"}</Badge> : null}</CardHeader>
          <CardBody>
            <Stat label="Ingredient cost" value={formatMoney(total)} />
            {draft.mode === "product" ? (
              <>
                {Number(draft.yield_qty) > 1 ? <Stat label="Per serving" value={formatMoney(Math.round(perServing))} /> : null}
                <Stat label="Price before tax" value={draft.product ? formatMoney(price) : "-"} />
                <Stat label="Food cost" value={percent === null ? "-" : formatPercent(percent)} tone={percent !== null && percent > target ? "danger" : undefined} />
                <Stat label="Target" value={formatPercent(target)} />
                {saved?.food_cost ? <p className="mt-2 text-xs text-fg-muted">Saved: {formatPercent(saved.food_cost.percent ?? 0)} on {formatMoney(saved.food_cost.cost_minor)}. Costs move with average purchase prices.</p> : <p className="mt-2 text-xs text-fg-muted">Live estimate from current average costs.</p>}
              </>
            ) : (
              <>
                <Stat label="Yield" value={draft.output_item ? `${draft.yield_qty || 0} ${yieldUnit?.code ?? ""}` : "-"} />
                <Stat label="Cost per unit produced" value={draft.output_item ? formatUnitCost(unitCost, draft.output_item.base_unit.code, formatMoney) : "-"} />
                <p className="mt-2 text-xs text-fg-muted">Producing a batch moves this cost onto the output item&apos;s average.</p>
              </>
            )}
          </CardBody>
        </Card>
      </div>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Ingredients</CardTitle><Button size="sm" variant="secondary" onClick={() => set("lines", [...draft.lines, newRecipeLine()])}><Plus className="h-4 w-4" /> Add ingredient</Button></CardHeader>
        <CardBody className="space-y-3">
          {draft.lines.map((l, idx) => {
            const kindUnits = unitsOfKind(units.data, l.item?.base_unit.kind);
            const unit = kindUnits.find((u) => u.id === l.unit_id) ?? l.item?.base_unit;
            const cost = lineCost(l, factorOf(l));
            return (
              <div key={l.key} className="rounded-md border p-3">
                <div className="grid items-end gap-2 sm:grid-cols-[1fr_90px_110px_100px_110px_40px]">
                  <Field label={idx === 0 ? "Item" : undefined}><ItemPicker value={l.item} onPick={(it) => setLine(l.key, { item: it, unit_id: it.base_unit.id })} autoFocus={idx > 0 && idx === draft.lines.length - 1 && !l.item} /></Field>
                  <Field label={idx === 0 ? "Unit" : undefined}><Select value={l.unit_id} onChange={(e) => setLine(l.key, { unit_id: e.target.value })} disabled={!l.item}>{l.item ? kindUnits.map((u) => <option key={u.id} value={u.id}>{u.code}</option>) : <option value="">-</option>}</Select></Field>
                  <Field label={idx === 0 ? "Quantity" : undefined}><Input type="number" inputMode="decimal" min={0} step="any" className="tabular" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} disabled={!l.item} /></Field>
                  <Field label={idx === 0 ? "Waste %" : undefined}><Input type="number" inputMode="decimal" min={0} max={100} step="any" className="tabular" value={l.waste_percent} onChange={(e) => setLine(l.key, { waste_percent: e.target.value })} disabled={!l.item} /></Field>
                  <Field label={idx === 0 ? "Cost" : undefined}><div className="flex h-10 items-center justify-end text-sm font-medium tabular">{l.item ? formatMoney(cost) : "-"}</div></Field>
                  <Button variant="ghost" size="icon" onClick={() => set("lines", draft.lines.length > 1 ? draft.lines.filter((x) => x.key !== l.key) : [newRecipeLine()])} aria-label="Remove line"><Trash2 className="h-4 w-4 text-danger" /></Button>
                </div>
                {l.item ? (
                  <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-fg-muted">
                    <span>Avg cost {formatUnitCost(l.item.avg_cost_minor_per_base, l.item.base_unit.code, formatMoney)}</span>
                    {unit && !unit.is_base ? <span>1 {unit.code} = {Number(unit.factor_to_base)} {l.item.base_unit.code}</span> : null}
                    {Number(l.item.avg_cost_minor_per_base) === 0 ? <span className="text-warning">No cost yet: receive this item once to cost it.</span> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          <div className="flex items-center justify-between border-t pt-3 text-sm"><span className="text-fg-secondary">Total ingredient cost</span><span className="font-semibold tabular">{formatMoney(total)}</span></div>
        </CardBody>
      </Card>
    </div>
  );
}
