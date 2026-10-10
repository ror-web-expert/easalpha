"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Archive, BookOpenText, Factory } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Recipe } from "@/lib/types";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/admin/page";
import { useRemove } from "@/components/admin/crud";
import { draftToInput, RecipeForm, recipeProblems, recipeToDraft, type RecipeDraft } from "@/components/admin/recipe-form";
import { Button, ConfirmDialog, Loading } from "@/components/ui";
import { toast } from "@/store/toast";

const KEYS = ["recipes", "recipe", "recipe_coverage", "recipe_flags", "food_cost"];

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const recipe = useQuery({ queryKey: ["recipe", id], queryFn: () => api<Recipe>(`/recipes/${id}`) });
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const remove = useRemove(KEYS, (rid) => `/recipes/${rid}`, "Recipe archived");
  useEffect(() => {
    const r = recipe.data;
    if (!r || loadedFor === r.id) return;
    let alive = true;
    recipeToDraft(r).then((d) => { if (alive) { setDraft(d); setLoadedFor(r.id); } });
    return () => { alive = false; };
  }, [recipe.data, loadedFor]);
  const r = recipe.data;
  if (recipe.isLoading || !r || !draft) return <Loading />;
  const problems = recipeProblems(draft);
  const save = async () => {
    setBusy(true);
    try {
      await api<Recipe>(`/recipes/${r.id}`, { method: "PATCH", body: draftToInput(draft, r.id) });
      KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success("Recipe saved");
    } catch (e) { toast.error("Could not save", errorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader icon={BookOpenText} title={r.name} description={`${r.is_sub_recipe ? `Sub-recipe for ${r.output_item_name}` : `Recipe for ${r.product_name}${r.variant_name ? ` · ${r.variant_name}` : ""}`} · updated ${formatDateTime(r.updated_at)}`} actions={<>
        <Link href="/admin/stock/recipes"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Recipes</Button></Link>
        {r.is_sub_recipe ? <Link href={`/admin/stock/production?recipe_id=${r.id}`}><Button variant="secondary"><Factory className="h-4 w-4" /> Produce</Button></Link> : null}
        <Button variant="destructive" onClick={() => setArchiving(true)}><Archive className="h-4 w-4" /> Archive</Button>
      </>} />
      <RecipeForm draft={draft} onChange={setDraft} existing={r} saved={r} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <ul className="text-xs text-fg-muted">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        <Button onClick={save} loading={busy} disabled={busy || problems.length > 0}>Save changes</Button>
      </div>
      <ConfirmDialog open={archiving} onClose={() => setArchiving(false)} onConfirm={() => remove.mutate(r.id, { onSuccess: () => router.replace("/admin/stock/recipes") })} title={`Archive ${r.name}?`} description={r.is_sub_recipe ? "Past production batches keep it." : "The product will sell without deducting stock until it gets a new recipe."} confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}
