"use client";
import { forwardRef, useMemo, useState } from "react";
import { scannerConfig } from "@/lib/barcode";
import { Gift, Plus, PlusSquare, Search, Star } from "lucide-react";
import type { BusinessSettings, Catalog, Deal, Product } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { displaySettings, priceFor } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { modalOpen } from "./scanner";

export type TileSize = "small" | "large";

/** Every small tile is this tall, whatever its name, so a row never mixes short and tall tiles. */
export const SMALL_TILE_HEIGHT = "6rem";
/** The narrowest a tile may get: wide enough for two lines of a name like "Chicken Karahi (half)" and its price. A
 *  small tile shows its photo only from 13rem wide (a container query), so a narrow tile gives the name that room. */
const MIN_TILE_WIDTH: Record<TileSize, string> = { small: "11rem", large: "13rem" };

/** The grid's columns: Display Settings' tiles per row, but never narrower than the tile size allows. */
export function tileColumns(columns: number, size: TileSize): string {
  return `repeat(auto-fill, minmax(max(${MIN_TILE_WIDTH[size]}, calc((100% - ${columns - 1} * 0.5rem) / ${columns})), 1fr))`;
}

/**
 * A product or deal on the till. Small (review 3.4): a compact, text-first tile with a real photo, when there is one,
 * as a thumbnail; there is no placeholder artwork, so many items fit on the screen. Large (Display Settings, Tile size):
 * a big picture on top, or the first letter on a tint when the item has no photo. Either way every tile in the grid has
 * the same height, the name has the whole width for two lines (the full name shows on hover), and the price and the
 * quick-add button share the bottom row. `onQuick` (review 3.6): one tap adds the item with the options dialog's defaults.
 */
export function ItemTile({ name, price, imageKey, onClick, badge, currency, showPrice = true, showImage = true, onQuick, size = "small" }: { name: string; price: number; imageKey?: string | null; id?: string; onClick: () => void; badge?: React.ReactNode; currency?: string; showPrice?: boolean; showImage?: boolean; onQuick?: () => void; size?: TileSize }) {
  const [broken, setBroken] = useState(false);
  const photo = showImage && imageKey && !broken ? imageKey : null;
  const large = size === "large";
  const nameText = <span className="line-clamp-2 shrink-0 text-[15px] font-semibold leading-5 tracking-[0.1px] text-fg">{name}</span>;
  // The quick-add button sits over the bottom right corner; the price row leaves it room.
  const priceRow = (
    <span className={cn("flex min-w-0 flex-wrap items-baseline gap-x-2", onQuick && "pr-10")}>
      {showPrice ? <span className="whitespace-nowrap text-base font-bold text-fg tabular">{formatMoney(price, currency)}</span> : null}
      {badge ? <span className="whitespace-nowrap text-xs font-medium text-fg-secondary">{badge}</span> : null}
    </span>
  );
  return (
    <div className="@container relative h-full" data-tile={size}>
      <button onClick={onClick} title={name} className={cn("flex h-full w-full rounded-xl border bg-pos-tile text-left shadow-[0_1px_2px_rgb(0_0_0/0.06)] transition hover:border-primary/50 active:scale-[0.98] active:bg-primary-soft",
        large ? "flex-col overflow-hidden" : "items-stretch gap-3 p-2.5")}>
        {large && showImage ? (
          <span className="relative block aspect-[4/3] w-full shrink-0 bg-muted">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover [filter:var(--pos-media-filter)]" onError={() => setBroken(true)} />
            ) : <span aria-hidden className="absolute inset-0 grid place-items-center bg-primary-soft text-4xl font-bold uppercase text-primary-ink">{name.trim().charAt(0) || "?"}</span>}
          </span>
        ) : !large && photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" loading="lazy" className="hidden h-11 w-11 shrink-0 self-start rounded-lg bg-muted object-cover [filter:var(--pos-media-filter)] @min-[13rem]:block" onError={() => setBroken(true)} />
        ) : null}
        <span className={cn("flex min-w-0 flex-1 flex-col justify-between gap-1", large && "min-h-[5.5rem] p-2.5")}>
          {nameText}
          {priceRow}
        </span>
      </button>
      {onQuick ? (
        <button type="button" onClick={onQuick} aria-label={`Quick add ${name}`} title="Add with the usual options"
          className="absolute bottom-0.5 right-0.5 flex h-11 w-11 items-center justify-center rounded-full text-primary hover:bg-primary-soft active:bg-primary/15">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary/50 bg-pos-tile"><Plus className="h-4 w-4" strokeWidth={2.75} /></span>
        </button>
      ) : null}
    </div>
  );
}

/** Review 3.6: a product that opens the options dialog only for optional choices can be added in one tap with the
 *  dialog's defaults (first size, no extras). One with a required choice has no safe default, so it keeps the dialog. */
export function canQuickAdd(p: Product, groups: Catalog["modifier_groups"]): boolean {
  const ids = p.modifier_group_ids ?? [];
  const hasSheet = (p.variants?.length ?? 0) > 0 || ids.length > 0;
  if (!hasSheet) return false;
  return !ids.some((id) => { const g = groups.find((x) => x.id === id); return !!g && (g.required || g.min_select > 0); });
}

/** Review 3.5: the till opens on Favourites only when they fill a row; otherwise on the category with the most items. */
export function startCategory(favourites: number, columns: number, categories: { id: string }[], products: { category_id: string }[]): string {
  if (favourites >= columns || !categories.length) return "fav";
  const count = new Map<string, number>();
  products.forEach((p) => count.set(p.category_id, (count.get(p.category_id) ?? 0) + 1));
  let best = categories[0].id;
  categories.forEach((c) => { if ((count.get(c.id) ?? 0) > (count.get(best) ?? 0)) best = c.id; });
  return (count.get(best) ?? 0) > favourites ? best : "fav";
}

interface ItemGridProps {
  catalog: Catalog; orderType: string; onProduct: (p: Product) => void; onDeal: (d: Deal) => void; onOpenItem: () => void; canOpenItem: boolean; settings?: BusinessSettings;
  /** Enter in the search box: a barcode in the local catalog adds its item. Returns true when it did. */
  onCode?: (code: string) => boolean;
  /** Shown beside the search box (the camera Scan button). */
  searchAction?: React.ReactNode;
  /** One-tap add with the options dialog's defaults (review 3.6). */
  onQuickAdd?: (p: Product) => void;
}

export const ItemGrid = forwardRef<HTMLInputElement, ItemGridProps>(
  function ItemGrid({ catalog, orderType, onProduct, onDeal, onOpenItem, canOpenItem, settings, onCode, searchAction, onQuickAdd }, searchRef) {
    const [q, setQ] = useState("");
    const currency = catalog.business.currency;
    const branchId = catalog.branch?.id;
    const categories = useMemo(() => [...catalog.categories].filter((c) => !c.archived_at).sort((a, b) => a.sort_order - b.sort_order), [catalog.categories]);
    const products = useMemo(() => catalog.products.filter((p) => p.active && !p.archived_at), [catalog.products]);
    const deals = useMemo(() => catalog.deals.filter((d) => d.active), [catalog.deals]);
    // SPEC "Display Settings": tiles per row, images and prices come from the settings store.
    const display = displaySettings(settings ?? catalog.business.settings);
    const [cat, setCat] = useState<string>(() => startCategory(products.filter((p) => p.is_favourite).length + deals.filter((d) => d.is_favourite).length, display.columns, categories, products));
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
              <input ref={searchRef} data-scan-target value={q} onChange={(e) => setQ(e.target.value)} placeholder={scannerConfig(settings).enabled ? "Search or scan items (F2)" : "Search items (F2)"} className="h-12 w-full rounded-full bg-high pl-12 pr-4 text-base transition placeholder:text-fg-secondary focus:outline-none focus:ring-2 focus:ring-primary"
                onKeyDown={(e) => {
                  // Enter acts on what was typed: never on an empty box (a scanner's late Enter) or behind an open dialog.
                  if (e.key !== "Enter" || !q.trim() || modalOpen()) return;
                  if (onCode?.(q.trim())) { setQ(""); return; }
                  if (shown[0]) { onProduct(shown[0]); setQ(""); }
                }} />
            </div>
            {searchAction}
          </div>
          {/* Tiles per row from Display Settings, but never narrower than the tile size allows: a smaller screen gets
              fewer tiles that a finger can hit and a name can fit in, instead of squeezing the same count into slivers.
              Small tiles share one fixed height; large ones are all the same shape, so the rows line up. */}
          <div className="grid flex-1 content-start gap-2 overflow-y-auto bg-page p-3" data-testid="item-grid"
            style={{ gridTemplateColumns: tileColumns(display.columns, display.tileSize), gridAutoRows: display.tileSize === "small" ? SMALL_TILE_HEIGHT : "auto" }}>
            {shownDeals.map((d) => <ItemTile key={d.id} id={d.id} size={display.tileSize} name={d.name} price={d.price_minor} imageKey={display.images ? d.image_key : null} showImage={display.images} currency={currency} showPrice={display.showPrices} onClick={() => onDeal(d)} badge={<span className="flex items-center gap-1"><Gift className="h-3.5 w-3.5" /> Deal</span>} />)}
            {shown.map((p) => <ItemTile key={p.id} id={p.id} size={display.tileSize} name={p.name} price={priceFor(p, orderType, null, branchId)} imageKey={display.images ? p.image_key : null} showImage={display.images} currency={currency} showPrice={display.showPrices} onClick={() => onProduct(p)} badge={p.variants?.length ? `${p.variants.length} sizes` : null}
              onQuick={onQuickAdd && canQuickAdd(p, catalog.modifier_groups) ? () => onQuickAdd(p) : undefined} />)}
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
