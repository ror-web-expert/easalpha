"use client";
import { forwardRef, useMemo, useState } from "react";
import { Search, Star, Gift, PlusSquare } from "lucide-react";
import type { BusinessSettings, Catalog, Deal, Product } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { displaySettings, priceFor } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { modalOpen } from "./scanner";

// Soft tints (translucent, so they read on light and dark themes) instead of loud solid blocks.
const PLACEHOLDERS = ["bg-teal-500/12 text-teal-600", "bg-amber-500/15 text-amber-600", "bg-sky-500/12 text-sky-600", "bg-rose-500/12 text-rose-600", "bg-violet-500/12 text-violet-600", "bg-emerald-500/12 text-emerald-600", "bg-orange-500/12 text-orange-600", "bg-indigo-500/12 text-indigo-500"];
function tint(id: string) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PLACEHOLDERS[h % PLACEHOLDERS.length]; }

/**
 * A product or deal on the till. With images switched on (Display Settings) the picture fills the top of the tile in
 * a 4:3 frame, so food photos read at a glance; a product without a photo gets its tinted dish mark in the same frame,
 * keeping every row even. With images off the tile is just the name and price.
 */
export function ItemTile({ name, price, imageKey, id, onClick, badge, currency, showPrice = true, showImage = true }: { name: string; price: number; imageKey?: string | null; id: string; onClick: () => void; badge?: React.ReactNode; currency?: string; showPrice?: boolean; showImage?: boolean }) {
  return (
    <button onClick={onClick} className="group flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-[0_1px_2px_rgb(0_0_0/0.06)] transition hover:border-primary/40 hover:shadow-[var(--elev-2)] active:scale-[0.98] active:bg-primary-soft">
      {showImage ? (
        <div className={cn("relative aspect-[4/3] w-full overflow-hidden", imageKey ? "bg-muted" : tint(id))}>
          {imageKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageKey} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ) : (
            // Default dish mark when the product has no image: a cloche on the tile's tint, with the initial below it.
            <span className="flex h-full w-full flex-col items-center justify-center gap-1 opacity-80" aria-hidden>
              <svg viewBox="0 0 32 32" className="h-10 w-10" fill="currentColor"><path d="M16 7a1.5 1.5 0 0 1 1.5 1.5v.6A9 9 0 0 1 25 18H7a9 9 0 0 1 7.5-8.9v-.6A1.5 1.5 0 0 1 16 7Z" /><rect x="5" y="19.5" width="22" height="2.5" rx="1.25" /></svg>
              <span className="text-2xl font-semibold leading-none">{name.slice(0, 1).toUpperCase()}</span>
            </span>
          )}
          {badge ? <span className="absolute right-2 top-2 rounded-full bg-card/95 px-2 py-0.5 text-xs font-medium text-fg-secondary shadow-sm">{badge}</span> : null}
        </div>
      ) : null}
      <div className="flex flex-1 flex-col justify-between gap-1.5 px-3 pb-3 pt-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="line-clamp-2 text-[15px] font-semibold leading-5 tracking-[0.1px]">{name}</div>
          {!showImage && badge ? <span className="shrink-0 text-fg-secondary">{badge}</span> : null}
        </div>
        {showPrice ? <div className="text-base font-bold text-primary tabular">{formatMoney(price, currency)}</div> : null}
      </div>
    </button>
  );
}

interface ItemGridProps {
  catalog: Catalog; orderType: string; onProduct: (p: Product) => void; onDeal: (d: Deal) => void; onOpenItem: () => void; canOpenItem: boolean; settings?: BusinessSettings;
  /** Enter in the search box: a barcode in the local catalog adds its item. Returns true when it did. */
  onCode?: (code: string) => boolean;
  /** Shown beside the search box (the camera Scan button). */
  searchAction?: React.ReactNode;
}

export const ItemGrid = forwardRef<HTMLInputElement, ItemGridProps>(
  function ItemGrid({ catalog, orderType, onProduct, onDeal, onOpenItem, canOpenItem, settings, onCode, searchAction }, searchRef) {
    const [cat, setCat] = useState<string>("fav");
    const [q, setQ] = useState("");
    const currency = catalog.business.currency;
    const branchId = catalog.branch?.id;
    const categories = useMemo(() => [...catalog.categories].filter((c) => !c.archived_at).sort((a, b) => a.sort_order - b.sort_order), [catalog.categories]);
    const products = useMemo(() => catalog.products.filter((p) => p.active && !p.archived_at), [catalog.products]);
    const deals = useMemo(() => catalog.deals.filter((d) => d.active), [catalog.deals]);
    // SPEC "Display Settings": tiles per row, images and prices come from the settings store.
    const display = displaySettings(settings ?? catalog.business.settings);
    const shown = useMemo(() => {
      const term = q.trim().toLowerCase();
      if (term) return products.filter((p) => p.name.toLowerCase().includes(term) || (p.sku ?? "").toLowerCase().includes(term) || (p.name_ur ?? "").includes(term));
      if (cat === "fav") return products.filter((p) => p.is_favourite);
      if (cat === "deals") return [];
      return products.filter((p) => p.category_id === cat).sort((a, b) => a.sort_order - b.sort_order);
    }, [products, q, cat]);
    // Favourites: starred products plus favourited deals. The Deals tab lists every active deal.
    const shownDeals = useMemo(() => (q.trim() ? [] : cat === "deals" ? deals : cat === "fav" ? deals.filter((d) => d.is_favourite) : []), [deals, cat, q]);
    const showDeals = shownDeals.length > 0;
    return (
      <div className="flex h-full min-h-0">
        <aside className="flex w-36 shrink-0 flex-col gap-1 overflow-y-auto bg-page p-2 md:w-44">
          <CatButton active={cat === "fav" && !q} onClick={() => { setCat("fav"); setQ(""); }}><Star className="h-4 w-4" /> Favourites</CatButton>
          {deals.length ? <CatButton active={cat === "deals" && !q} onClick={() => { setCat("deals"); setQ(""); }}><Gift className="h-4 w-4" /> Deals</CatButton> : null}
          {categories.map((c) => <CatButton key={c.id} active={cat === c.id && !q} onClick={() => { setCat(c.id); setQ(""); }}>{c.name}</CatButton>)}
          {canOpenItem ? <CatButton active={false} onClick={onOpenItem}><PlusSquare className="h-4 w-4" /> Open item</CatButton> : null}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 bg-page p-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-secondary" />
              {/* data-scan-target: a scanner typing into this box is caught as a scan (components/pos/scanner.tsx). */}
              <input ref={searchRef} data-scan-target value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items (F2)" className="h-12 w-full rounded-full bg-high pl-12 pr-4 text-base transition placeholder:text-fg-secondary focus:outline-none focus:ring-2 focus:ring-primary"
                onKeyDown={(e) => {
                  // Enter acts on what was typed: never on an empty box (a scanner's late Enter) or behind an open dialog.
                  if (e.key !== "Enter" || !q.trim() || modalOpen()) return;
                  if (onCode?.(q.trim())) { setQ(""); return; }
                  if (shown[0]) { onProduct(shown[0]); setQ(""); }
                }} />
            </div>
            {searchAction}
          </div>
          {/* Tiles per row from Display Settings, but never narrower than 144px: a portrait tablet gets fewer, bigger tiles
              that a finger can hit, instead of squeezing the same count into slivers. */}
          <div className="grid flex-1 auto-rows-min gap-3 overflow-y-auto p-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(max(9rem, calc((100% - ${display.columns - 1} * 0.75rem) / ${display.columns})), 1fr))` }}>
            {shownDeals.map((d) => <ItemTile key={d.id} id={d.id} name={d.name} price={d.price_minor} imageKey={display.images ? d.image_key : null} showImage={display.images} currency={currency} showPrice={display.showPrices} onClick={() => onDeal(d)} badge={<span className="flex items-center gap-1"><Gift className="h-3.5 w-3.5" /> Deal</span>} />)}
            {shown.map((p) => <ItemTile key={p.id} id={p.id} name={p.name} price={priceFor(p, orderType, null, branchId)} imageKey={display.images ? p.image_key : null} showImage={display.images} currency={currency} showPrice={display.showPrices} onClick={() => onProduct(p)} badge={p.variants?.length ? `${p.variants.length} sizes` : null} />)}
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
