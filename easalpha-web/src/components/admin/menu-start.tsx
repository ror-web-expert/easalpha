"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileJson, Layers, Plus, Sparkles, UtensilsCrossed } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { toast } from "@/store/toast";
import { Button, ConfirmDialog } from "@/components/ui";

// S7 (6 Nov 2026): a new owner had no way into the menu. The checklist opened an empty Catalog, New product offered
// no category and New category no menu, and the sample menu (POST /onboarding/sample_menu) was on no screen. These
// are the empty states that say what to do next and offer the sample.

/** POST /onboarding/sample_menu: a small desi fast-food menu in the default menu, refused once products exist. */
export function useSampleMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ menu_id: string; categories: number; products: number }>("/onboarding/sample_menu", { method: "POST" }),
    onSuccess: (r) => {
      ["products", "categories", "menus", "setup_checklist", "dashboard", "me"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success("Sample menu loaded", `${r.categories} categories and ${r.products} products. Change prices and names, or archive what you do not sell.`);
    },
    onError: (e) => toast.error("Could not load the sample menu", errorMessage(e)),
  });
}

export function SampleMenuButton({ variant = "secondary", size }: { variant?: "primary" | "secondary" | "soft" | "ghost"; size?: "sm" }) {
  const sample = useSampleMenu();
  const [ask, setAsk] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setAsk(true)}><Sparkles className="h-4 w-4" /> Load the sample menu</Button>
      <ConfirmDialog open={ask} onClose={() => setAsk(false)} onConfirm={() => sample.mutate(undefined, { onSettled: () => setAsk(false) })} loading={sample.isPending}
        title="Load the sample menu?" description="Adds five categories (Burgers, BBQ, Karahi, Rice, Drinks) with 13 products, a 16% sales tax and a spice level choice. Edit or archive any of it afterwards." confirmLabel="Load it" />
    </>
  );
}

/** The catalog of a business with no products yet: the steps, in order, and the shortcuts. */
export function MenuStart({ hasCategories, onImport }: { hasCategories: boolean; onImport?: () => void }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed bg-card px-6 py-12 text-center" data-testid="menu-start">
      <UtensilsCrossed className="mb-2 h-8 w-8 text-primary" />
      <p className="text-base font-medium text-heading">Your menu is empty</p>
      <p className="mt-1 max-w-lg text-sm text-fg-secondary">
        {hasCategories
          ? "Your categories are ready. Add the products that go in them, with their prices."
          : "Every product sits in a category, such as Burgers or Drinks. Add a category first, then its products, or start from the sample menu and change it to yours."}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {hasCategories
          ? <Link href="/admin/products/catalog/new"><Button><Plus className="h-4 w-4" /> New product</Button></Link>
          : <Link href="/admin/products/categories?new=1"><Button><Layers className="h-4 w-4" /> Add a category</Button></Link>}
        <SampleMenuButton />
        {onImport ? <Button variant="ghost" onClick={onImport}><FileJson className="h-4 w-4" /> Import a menu file</Button> : null}
      </div>
    </div>
  );
}
