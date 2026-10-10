"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Factory, Plus } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { ProductionBatch, Recipe } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { formatUnitQty } from "@/lib/units";
import { usePagedList } from "@/lib/hooks";
import { FilterBar, LoadMore, PageHeader } from "@/components/admin/page";
import { sectionName, useSections } from "@/components/admin/stock";
import { Button, Dialog, EmptyRow, Field, Input, Loading, Select, Stat, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";

function Production() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const sections = useSections();
  const subRecipes = useQuery({ queryKey: ["recipes", { sub: true }], queryFn: () => api<{ data: Recipe[] }>("/recipes", { query: { sub_recipes: "true" } }), select: (r) => r.data });
  const [recipeFilter, setRecipeFilter] = useState("");
  const list = usePagedList<ProductionBatch>(["production_batches"], "/production_batches", { recipe_id: recipeFilter });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ recipe_id: "", quantity: "", section_id: "", note: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { const rid = params.get("recipe_id"); if (rid) { setForm((f) => ({ ...f, recipe_id: rid })); setOpen(true); } }, [params]);
  const recipe = useMemo(() => subRecipes.data?.find((r) => r.id === form.recipe_id), [subRecipes.data, form.recipe_id]);
  const unitCode = recipe?.yield_unit?.code ?? "";
  const qty = Number(form.quantity) || 0;
  const batches = recipe && Number(recipe.yield_qty) > 0 ? qty / Number(recipe.yield_qty) : 0;
  const estCost = recipe ? Math.round(recipe.cost_minor * batches) : 0;
  const produce = async () => {
    setBusy(true);
    try {
      const b = await api<ProductionBatch>("/production_batches", { method: "POST", body: { recipe_id: form.recipe_id, quantity: form.quantity, section_id: form.section_id || undefined, note: form.note || undefined } });
      ["production_batches", "stock_levels", "stock_items", "stock_item", "stock_documents", "stock_item_ledger", "recipes", "food_cost"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(`${b.document_label ?? "Batch"} posted`, `${b.recipe_name}: ${formatMoney(b.cost_minor)}`);
      setOpen(false); setForm({ recipe_id: "", quantity: "", section_id: "", note: "" });
    } catch (e) { toast.error("Could not produce", errorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader icon={Factory} title="Production" description="Make a sub-recipe in a batch: ingredients leave stock, the output item comes in at the batch cost." actions={<Button onClick={() => setOpen(true)} disabled={!subRecipes.data?.length}><Plus className="h-4 w-4" /> Produce</Button>} />
      {subRecipes.data && !subRecipes.data.length ? <div className="mb-4 rounded-lg border border-warning/50 bg-warning-soft px-4 py-3 text-sm">No sub-recipes yet. <Link href="/admin/inventory/recipes/new?mode=sub" className="font-medium text-primary hover:underline">Create one</Link> for anything you prepare ahead, like marinated chicken or sauces.</div> : null}
      <FilterBar>
        <Select className="w-auto" value={recipeFilter} onChange={(e) => setRecipeFilter(e.target.value)}><option value="">All sub-recipes</option>{subRecipes.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>When</TH><TH>Sub-recipe</TH><TH right>Produced</TH><TH>Section</TH><TH right>Cost</TH><TH>Document</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((b) => {
              const r = subRecipes.data?.find((x) => x.id === b.recipe_id);
              return (
                <TR key={b.id}>
                  <TD className="whitespace-nowrap text-fg-secondary">{formatDateTime(b.produced_at)}</TD>
                  <TD><Link href={`/admin/inventory/recipes/${b.recipe_id}`} className="font-medium text-primary hover:underline">{b.recipe_name}</Link>{r ? <div className="text-xs text-fg-muted">{r.output_item_name}</div> : null}</TD>
                  <TD right>{formatUnitQty(b.quantity_produced, r?.yield_unit?.code)}</TD>
                  <TD className="text-fg-secondary">{sectionName(sections.data, b.stock_section_id)}</TD>
                  <TD right>{formatMoney(b.cost_minor)}</TD>
                  <TD>{b.stock_document_id ? <Link href={`/admin/inventory/stock-actions/${b.stock_document_id}`} className="font-mono text-primary hover:underline">{b.document_label}</Link> : "-"}</TD>
                </TR>
              );
            }) : <EmptyRow colSpan={6}>No batches yet.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
      <Dialog open={open} onClose={() => setOpen(false)} title="Produce a batch" description="Ingredients are deducted from the section at the recipe's ratios; the output lands in the same section."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={produce} loading={busy} disabled={!form.recipe_id || qty <= 0}>Produce</Button></>}>
        <div className="space-y-3">
          <Field label="Sub-recipe"><Select value={form.recipe_id} onChange={(e) => setForm({ ...form, recipe_id: e.target.value })} autoFocus><option value="">Choose…</option>{subRecipes.data?.map((r) => <option key={r.id} value={r.id}>{r.name} (yields {Number(r.yield_qty)} {r.yield_unit?.code ?? ""})</option>)}</Select></Field>
          <Field label={`Quantity to make${unitCode ? ` (${unitCode})` : ""}`} hint={recipe ? `One batch yields ${Number(recipe.yield_qty)} ${unitCode} of ${recipe.output_item_name} for ${formatMoney(recipe.cost_minor)}` : undefined}>
            <Input type="number" inputMode="decimal" min={0} step="any" className="tabular" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} disabled={!recipe} />
          </Field>
          <Field label="Section" hint="Blank = default section"><Select value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })}><option value="">Default</option>{sections.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Note"><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          {recipe && qty > 0 ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <Stat label="Batches" value={batches.toLocaleString("en-US", { maximumFractionDigits: 2 })} />
              <Stat label="Output" value={`${formatUnitQty(qty, unitCode)} ${recipe.output_item_name ?? ""}`} />
              <Stat label="Estimated cost" value={formatMoney(estCost)} />
            </div>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}

export default function ProductionPage() {
  return <Suspense fallback={<Loading />}><Production /></Suspense>;
}
