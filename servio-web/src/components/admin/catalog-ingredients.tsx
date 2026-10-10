"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import type { Product, Recipe, Variant } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { toast } from "@/store/toast";
import { useList } from "@/components/admin/crud";
import { blankRecipe, draftToInput, RecipeForm, recipeProblems, recipeToDraft, type RecipeDraft } from "@/components/admin/recipe-form";
import { Badge, Button, Loading, Tabs } from "@/components/ui";

const KEYS = ["recipes", "recipe", "recipe_coverage", "recipe_flags", "food_cost", "product"];

/** One recipe editor for a product or one of its variants. Creates the recipe on first save, updates it after. */
function VariantRecipe({ product, variant, recipe }: { product: Product; variant: Variant | null; recipe: Recipe | null }) {
  const qc = useQueryClient();
  const full = useQuery({ queryKey: ["recipe", recipe?.id], queryFn: () => api<Recipe>(`/recipes/${recipe!.id}`), enabled: !!recipe });
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const target = recipe ? `${recipe.id}:${recipe.updated_at}` : `new:${variant?.id ?? "product"}`;
  useEffect(() => {
    if (loadedFor === target) return;
    if (recipe) {
      const r = full.data;
      if (!r) return;
      let alive = true;
      recipeToDraft(r).then((d) => { if (alive) { setDraft({ ...d, product: d.product ?? product }); setLoadedFor(target); } });
      return () => { alive = false; };
    }
    setDraft({ ...blankRecipe("product"), product, variant_id: variant?.id ?? "", name: variant ? `${product.name} ${variant.name}` : product.name });
    setLoadedFor(target);
  }, [recipe, full.data, target, loadedFor, product, variant]);
  if (!draft) return <Loading />;
  const problems = recipeProblems(draft);
  const save = async () => {
    setBusy(true);
    try {
      if (recipe) await api<Recipe>(`/recipes/${recipe.id}`, { method: "PATCH", body: draftToInput(draft, recipe.id) });
      else await api<Recipe>("/recipes", { method: "POST", body: { ...draftToInput(draft), product_id: product.id, variant_id: variant?.id ?? null } });
      KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(recipe ? "Recipe saved" : "Recipe created");
    } catch (e) { toast.error("Could not save", errorMessage(e)); }
    finally { setBusy(false); }
  };
  // The product and variant are fixed by the tab, so the form shows them read-only (RecipeForm locks them when `existing` is set).
  const lock = recipe ?? ({ product_name: variant ? `${product.name} · ${variant.name}` : product.name } as Recipe);
  return (
    <div className="space-y-4">
      <RecipeForm draft={draft} onChange={setDraft} existing={lock} saved={full.data ?? recipe} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="text-xs text-fg-muted">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        <Button onClick={save} loading={busy} disabled={busy || problems.length > 0}>{recipe ? "Save recipe" : "Create recipe"}</Button>
      </div>
    </div>
  );
}

/** SPEC "Ingredients" tab: the recipe, set per variant. Without variants there is one product-level recipe. */
export function IngredientsTab({ product }: { product: Product }) {
  const variants = useMemo(() => product.variants ?? [], [product.variants]);
  const recipes = useList<Recipe>("recipes", "/recipes", { product_id: product.id });
  const [tab, setTab] = useState<string>(variants[0]?.id ?? "");
  useEffect(() => { if (variants.length && !variants.some((v) => v.id === tab)) setTab(variants[0].id); }, [variants, tab]);
  if (recipes.isLoading) return <Loading />;
  const forVariant = (variantId: string | null) => recipes.data?.find((r) => !r.is_sub_recipe && (r.variant_id ?? null) === variantId) ?? null;
  const shared = forVariant(null);
  if (!variants.length) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-fg-secondary">This product has no variants, so one recipe covers every sale. Add variants on Basic Info to cost each size on its own.</p>
        <VariantRecipe product={product} variant={null} recipe={shared} />
      </div>
    );
  }
  const current = variants.find((v) => v.id === tab) ?? variants[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={current.id} onChange={setTab} items={variants.map((v) => ({ value: v.id, label: <span className="flex items-center gap-2">{v.name}{forVariant(v.id) ? <Badge variant="success">recipe</Badge> : <Badge variant="outline">none</Badge>}</span> }))} />
        <span className="text-sm text-fg-muted">{current.name} sells at {formatMoney(current.price_minor)}.{shared ? ` A shared recipe "${shared.name}" covers variants without their own.` : ""}</span>
      </div>
      <VariantRecipe key={current.id} product={product} variant={current} recipe={forVariant(current.id)} />
    </div>
  );
}
