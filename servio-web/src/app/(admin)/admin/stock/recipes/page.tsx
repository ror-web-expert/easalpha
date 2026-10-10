"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText, Plus, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "@/lib/api";
import type { Recipe, RecipeCoverage, RecipeFlag } from "@/lib/types";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { useDebounced } from "@/lib/hooks";
import { FilterBar, PageHeader, SearchInput } from "@/components/admin/page";
import { Badge, Button, EmptyRow, Loading, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";

type Kind = "all" | "products" | "sub";

export default function RecipesPage() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [kind, setKind] = useState<Kind>("all");
  const [showMissing, setShowMissing] = useState(false);
  const list = useQuery({ queryKey: ["recipes", { q: dq, kind }], queryFn: () => api<{ data: Recipe[] }>("/recipes", { query: { q: dq, products: kind === "products" ? "true" : "", sub_recipes: kind === "sub" ? "true" : "" } }), select: (r) => r.data });
  const coverage = useQuery({ queryKey: ["recipe_coverage"], queryFn: () => api<RecipeCoverage>("/recipes/coverage") });
  const flags = useQuery({ queryKey: ["recipe_flags"], queryFn: () => api<{ data: RecipeFlag[] }>("/recipes/flags"), select: (r) => r.data });
  const cov = coverage.data;
  return (
    <>
      <PageHeader icon={BookOpenText} title="Recipes" description="What each product uses, so stock is deducted on every sale and food cost is known. Sub-recipes produce a stock item in batches." actions={<>
        <Link href="/admin/stock/food-cost"><Button variant="secondary">Food cost</Button></Link>
        <Link href="/admin/stock/recipes/new"><Button><Plus className="h-4 w-4" /> New recipe</Button></Link>
      </>} />
      {cov ? (
        <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${cov.percent >= 100 ? "border-success/50 bg-success-soft" : "border-warning/50 bg-warning-soft"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-semibold tabular">{formatPercent(cov.percent, 0)}</span>
              <span>of products have a recipe <span className="text-fg-secondary">({cov.with_recipe} of {cov.products})</span>{cov.missing.length ? <span className="text-fg-secondary">. {cov.missing.length} still sell without stock deduction.</span> : null}</span>
            </div>
            {cov.missing.length ? <Button size="sm" variant="secondary" onClick={() => setShowMissing((v) => !v)}>{showMissing ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} Missing products</Button> : null}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-card"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, cov.percent)}%` }} /></div>
          {showMissing && cov.missing.length ? (
            <ul className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {cov.missing.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-md bg-card px-3 py-1.5">
                  <span className="truncate">{p.name}</span>
                  <Link href={`/admin/stock/recipes/new?product_id=${p.id}`} className="shrink-0 text-xs font-medium text-primary hover:underline">Create recipe</Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {flags.data?.length ? (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger-soft/40 px-4 py-3 text-sm">
          <div className="mb-1 flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 text-danger" /> {flags.data.length} line{flags.data.length === 1 ? "" : "s"} look like a wrong unit</div>
          <ul className="space-y-1 text-fg-secondary">{flags.data.map((f, i) => <li key={`${f.recipe_id}-${f.stock_item_id}-${i}`}>{f.message} <Link href={`/admin/stock/recipes/${f.recipe_id}`} className="text-primary hover:underline">Open {f.recipe}</Link></li>)}</ul>
        </div>
      ) : null}
      <FilterBar>
        <Tabs value={kind} onChange={setKind} items={[{ value: "all", label: "All" }, { value: "products", label: "Product recipes" }, { value: "sub", label: "Sub-recipes" }]} />
        <SearchInput value={q} onChange={setQ} placeholder="Recipe name" />
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Recipe</TH><TH>Makes</TH><TH right>Lines</TH><TH right>Cost</TH><TH right>Food cost</TH><TH>Updated</TH></tr></THead>
          <TBody>
            {list.data?.length ? list.data.map((r) => (
              <TR key={r.id}>
                <TD><Link href={`/admin/stock/recipes/${r.id}`} className="font-medium text-primary hover:underline">{r.name}</Link>{r.notes ? <div className="max-w-xs truncate text-xs text-fg-muted">{r.notes}</div> : null}</TD>
                <TD>{r.is_sub_recipe ? <><Badge variant="accent">Sub-recipe</Badge> <span className="ml-1 text-fg-secondary">{Number(r.yield_qty)} {r.yield_unit?.code ?? ""} {r.output_item_name}</span></> : <><Badge variant="primary">Product</Badge> <span className="ml-1 text-fg-secondary">{r.product_name}{r.variant_name ? ` · ${r.variant_name}` : ""}</span></>}</TD>
                <TD right>{r.line_count}</TD>
                <TD right>{formatMoney(r.cost_minor)}{r.is_sub_recipe && r.yield_unit ? <div className="text-xs text-fg-muted">{formatMoney(Math.round(r.unit_cost_minor * Number(r.yield_unit.factor_to_base)))} / {r.yield_unit.code}</div> : null}</TD>
                <TD right>{r.food_cost ? <span className={r.food_cost.over_target ? "font-medium text-danger" : ""}>{r.food_cost.percent === null ? "-" : formatPercent(r.food_cost.percent)}{r.food_cost.over_target ? <Badge className="ml-1" variant="danger">over</Badge> : null}</span> : "-"}</TD>
                <TD className="whitespace-nowrap text-fg-secondary">{formatDateTime(r.updated_at)}</TD>
              </TR>
            )) : <EmptyRow colSpan={6}>No recipes yet. Create one for each product so sales deduct stock.</EmptyRow>}
          </TBody>
        </Table>
      )}
    </>
  );
}
