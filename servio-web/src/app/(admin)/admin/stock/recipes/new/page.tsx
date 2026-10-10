"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpenText } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Product, Recipe } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { blankRecipe, draftToInput, RecipeForm, recipeProblems, type RecipeDraft } from "@/components/admin/recipe-form";
import { Button, Loading } from "@/components/ui";
import { toast } from "@/store/toast";

const RECIPE_KEYS = ["recipes", "recipe", "recipe_coverage", "recipe_flags", "food_cost"];

function NewRecipe() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const productId = params.get("product_id");
  const [draft, setDraft] = useState<RecipeDraft>(() => blankRecipe(params.get("mode") === "sub" ? "sub" : "product"));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!productId) return;
    api<Product>(`/products/${productId}`).then((p) => setDraft((d) => ({ ...d, mode: "product", product: p, name: d.name || p.name }))).catch(() => {});
  }, [productId]);
  const problems = recipeProblems(draft);
  const save = async () => {
    setBusy(true);
    try {
      const r = await api<Recipe>("/recipes", { method: "POST", body: draftToInput(draft) });
      RECIPE_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(`${r.name} saved`);
      router.replace(`/admin/stock/recipes/${r.id}`);
    } catch (e) { toast.error("Could not save", errorMessage(e)); setBusy(false); }
  };
  return (
    <>
      <PageHeader icon={BookOpenText} title="New recipe" description="Ingredients are costed from current average purchase prices." actions={<Link href="/admin/stock/recipes"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Recipes</Button></Link>} />
      <RecipeForm draft={draft} onChange={setDraft} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <ul className="text-xs text-fg-muted">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        <Button onClick={save} loading={busy} disabled={busy || problems.length > 0}>Save recipe</Button>
      </div>
    </>
  );
}

export default function NewRecipePage() {
  return <Suspense fallback={<Loading />}><NewRecipe /></Suspense>;
}
