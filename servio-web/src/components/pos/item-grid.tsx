"use client";
import { forwardRef, useMemo, useState } from "react";
import { Search, Star, Gift, PlusSquare } from "lucide-react";
import type { Catalog, Deal, Product } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { priceFor } from "@/lib/pricing";
import { cn } from "@/lib/utils";

// Soft tints (translucent, so they read on light and dark themes) instead of loud solid blocks.
const PLACEHOLDERS = ["bg-teal-500/12 text-teal-600", "bg-amber-500/15 text-amber-600", "bg-sky-500/12 text-sky-600", "bg-rose-500/12 text-rose-600", "bg-violet-500/12 text-violet-600", "bg-emerald-500/12 text-emerald-600", "bg-orange-500/12 text-orange-600", "bg-indigo-500/12 text-indigo-500"];
function tint(id: string) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PLACEHOLDERS[h % PLACEHOLDERS.length]; }

export function ItemTile({ name, price, imageKey, id, onClick, badge, currency }: { name: string; price: number; imageKey?: string | null; id: string; onClick: () => void; badge?: React.ReactNode; currency?: string }) {
  return (
    <button onClick={onClick} className="group flex min-h-24 flex-col overflow-hidden rounded-xl border bg-card text-left transition hover:shadow-[var(--elev-1)] active:scale-[0.98] active:bg-primary-soft">
      <div className={cn("relative m-2 mb-0 flex h-14 items-center justify-center rounded-lg text-2xl font-medium", tint(id))}>
        {imageKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageKey} alt="" className="h-full w-full rounded-lg object-cover" />
        ) : name.slice(0, 1).toUpperCase()}
        {badge ? <span className="absolute right-1 top-1">{badge}</span> : null}
      </div>
      <div className="flex flex-1 flex-col justify-between px-3 pb-3 pt-2">
        <div className="line-clamp-2 text-base font-medium leading-6 tracking-[0.15px]">{name}</div>
        <div className="mt-1 text-sm font-medium text-primary tabular">{formatMoney(price, currency)}</div>
      </div>
    </button>
  );
}

export const ItemGrid = forwardRef<HTMLInputElement, { catalog: Catalog; orderType: string; onProduct: (p: Product) => void; onDeal: (d: Deal) => void; onOpenItem: () => void; canOpenItem: boolean }>(
  function ItemGrid({ catalog, orderType, onProduct, onDeal, onOpenItem, canOpenItem }, searchRef) {
    const [cat, setCat] = useState<string>("fav");
    const [q, setQ] = useState("");
    const currency = catalog.business.currency;
    const branchId = catalog.branch?.id;
    const categories = useMemo(() => [...catalog.categories].filter((c) => !c.archived_at).sort((a, b) => a.sort_order - b.sort_order), [catalog.categories]);
    const products = useMemo(() => catalog.products.filter((p) => p.active && !p.archived_at), [catalog.products]);
    const deals = useMemo(() => catalog.deals.filter((d) => d.active), [catalog.deals]);
    const shown = useMemo(() => {
      const term = q.trim().toLowerCase();
      if (term) return products.filter((p) => p.name.toLowerCase().includes(term) || (p.sku ?? "").toLowerCase().includes(term) || (p.name_ur ?? "").includes(term));
      if (cat === "fav") return products.filter((p) => p.is_favourite);
      if (cat === "deals") return [];
      return products.filter((p) => p.category_id === cat).sort((a, b) => a.sort_order - b.sort_order);
    }, [products, q, cat]);
    const showDeals = !q.trim() && (cat === "deals" || (cat === "fav" && deals.length > 0));
    return (
      <div className="flex h-full min-h-0">
        <aside className="flex w-36 shrink-0 flex-col gap-1 overflow-y-auto bg-page p-2 md:w-44">
          <CatButton active={cat === "fav" && !q} onClick={() => { setCat("fav"); setQ(""); }}><Star className="h-4 w-4" /> Favourites</CatButton>
          {deals.length ? <CatButton active={cat === "deals" && !q} onClick={() => { setCat("deals"); setQ(""); }}><Gift className="h-4 w-4" /> Deals</CatButton> : null}
          {categories.map((c) => <CatButton key={c.id} active={cat === c.id && !q} onClick={() => { setCat(c.id); setQ(""); }}>{c.name}</CatButton>)}
          {canOpenItem ? <CatButton active={false} onClick={onOpenItem}><PlusSquare className="h-4 w-4" /> Open item</CatButton> : null}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative bg-page p-2">
            <Search className="pointer-events-none absolute left-6 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-secondary" />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items (F2)" className="h-12 w-full rounded-full bg-high pl-12 pr-4 text-base transition placeholder:text-fg-secondary focus:outline-none focus:ring-2 focus:ring-primary" onKeyDown={(e) => { if (e.key === "Enter" && shown[0]) { onProduct(shown[0]); setQ(""); } }} />
          </div>
          <div className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5 overflow-y-auto p-2.5">
            {showDeals ? deals.map((d) => <ItemTile key={d.id} id={d.id} name={d.name} price={d.price_minor} imageKey={d.image_key} currency={currency} onClick={() => onDeal(d)} badge={<Gift className="h-4 w-4" />} />) : null}
            {shown.map((p) => <ItemTile key={p.id} id={p.id} name={p.name} price={priceFor(p, orderType, null, branchId)} imageKey={p.image_key} currency={currency} onClick={() => onProduct(p)} badge={p.variants?.length ? <span className="rounded bg-card/90 px-1 text-[10px] font-medium text-fg-secondary">{p.variants.length} sizes</span> : null} />)}
            {!shown.length && !showDeals ? <div className="col-span-full py-12 text-center text-fg-muted">{q ? "No items match" : cat === "fav" ? "Star items in the admin to show them here" : "No items in this category"}</div> : null}
          </div>
        </div>
      </div>
    );
  },
);

function CatButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("flex min-h-12 items-center gap-3 rounded-full px-4 text-left text-sm font-medium tracking-[0.1px] transition-colors", active ? "bg-sidebar-active-bg text-sidebar-active" : "text-fg-secondary hover:bg-fg/8")}>{children}</button>
  );
}
