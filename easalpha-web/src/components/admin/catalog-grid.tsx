"use client";
import Link from "next/link";
import { Package, Pencil, Star, Trash2, TrendingUp } from "lucide-react";
import type { Category, Product } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { discountLabel } from "@/components/admin/catalog-helpers";
import { initials, marginLabel, marginTone, tileHue } from "@/components/admin/catalog-grid-helpers";
import { Badge, Button } from "@/components/ui";

/** The picture of a product or category, or a coloured tile with its initials when it has none: never a grey icon in a row of food. */
export function TileImage({ src, name, className }: { src: string | null; name: string; className?: string }) {
  const h = tileHue(name);
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="" className={cn("object-cover", className)} loading="lazy" />;
  return (
    <div className={cn("grid place-items-center", className)} style={{ background: `linear-gradient(135deg, hsl(${h} 70% 93%), hsl(${h} 55% 80%))` }} aria-hidden="true">
      <span className="text-2xl font-bold tracking-wide" style={{ color: `hsl(${h} 45% 30%)` }}>{initials(name)}</span>
    </div>
  );
}

/** Category chips across the top of the grid, the way a menu board reads: All products, Favourites, then each category with its count. */
export function CategoryChips({ cats, value, onChange, fav, onFav, total }: { cats: Category[]; value: string; onChange: (id: string) => void; fav: boolean; onFav: (v: boolean) => void; total: number }) {
  const chip = (selected: boolean) => cn(
    "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors",
    selected ? "border-primary bg-primary text-primary-fg shadow-[var(--elev-1)]" : "border-border bg-card text-fg-secondary hover:bg-muted hover:text-fg",
  );
  const count = (n: number | null | undefined, selected: boolean) => (
    <span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular", selected ? "bg-white/20 text-primary-fg" : "bg-muted text-fg-muted")}>{n ?? 0}</span>
  );
  const all = !value;
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" role="tablist" aria-label="Categories">
      <button type="button" role="tab" aria-selected={all} className={chip(all)} onClick={() => onChange("")}>All products {count(total, all)}</button>
      <button type="button" aria-pressed={fav} className={chip(fav)} onClick={() => onFav(!fav)}><Star className={cn("h-4 w-4", fav ? "fill-current" : "fill-accent text-accent")} /> Favourites</button>
      {cats.map((c) => (
        <button key={c.id} type="button" role="tab" aria-selected={value === c.id} className={chip(value === c.id)} onClick={() => onChange(value === c.id ? "" : c.id)}>
          {c.name} {count(c.product_count, value === c.id)}
        </button>
      ))}
    </div>
  );
}

/** The chosen category above its products: picture, name, count. */
export function CategoryBanner({ category }: { category: Category }) {
  return (
    <div className="mb-4 flex items-center gap-4 rounded-2xl border bg-card px-5 py-4">
      <TileImage src={category.image_key} name={category.name} className="h-14 w-14 shrink-0 rounded-xl" />
      <div className="min-w-0">
        <h2 className="truncate text-lg font-bold leading-6 text-heading">{category.name}{category.name_ur ? <span dir="rtl" className="ml-3 text-base font-medium text-fg-muted">{category.name_ur}</span> : null}</h2>
        <p className="text-sm text-fg-muted">{category.product_count ?? 0} products{category.subtitle ? ` · ${category.subtitle}` : ""}{category.show_online ? "" : " · not on the website"}</p>
      </div>
    </div>
  );
}

const editHref = (p: Product) => `/admin/products/catalog/${p.id}`;

/** One product as a card: photo, name, price, margin badge, status, and the analysis and edit buttons. Everything on it is reachable by keyboard. */
export function ProductTile({ product: p, categoryName, showPrices, onFav, onAnalyse, onRemove }: { product: Product; categoryName: string; showPrices: boolean; onFav: (p: Product) => void; onAnalyse: (p: Product) => void; onRemove: (p: Product) => void }) {
  const off = discountLabel(p.discount_value, p.discount_type);
  const tone = marginTone(p.cost);
  const margin = marginLabel(p.cost);
  return (
    <div className={cn("group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-[var(--shadow-pop)]", !p.active && "opacity-80")}>
      <Link href={editHref(p)} className="relative block aspect-[4/3] overflow-hidden bg-muted" aria-label={`Edit ${p.name}`} tabIndex={-1}>
        <TileImage src={p.image_key} name={p.name} className={cn("h-full w-full transition-transform duration-300 group-hover:scale-[1.03]", !p.active && "grayscale")} />
        {!p.active ? <Badge className="absolute left-2 top-2 bg-card shadow-[var(--elev-1)]">Inactive</Badge> : !p.show_online ? <Badge variant="outline" className="absolute left-2 top-2 bg-card shadow-[var(--elev-1)]">Till only</Badge> : null}
        {off ? <Badge variant="accent" className="absolute bottom-2 left-2 shadow-[var(--elev-1)]">{off} off</Badge> : null}
      </Link>
      <button type="button" onClick={() => onFav(p)} aria-label={p.is_favourite ? "Remove from favourites" : "Add to favourites"} aria-pressed={p.is_favourite}
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-card shadow-[var(--elev-1)] transition-colors hover:bg-accent-soft">
        <Star className={cn("h-4 w-4", p.is_favourite ? "fill-accent text-accent" : "text-fg-muted")} />
      </button>
      <div className="flex flex-1 flex-col px-3.5 pb-3 pt-3">
        <Link href={editHref(p)} className="line-clamp-2 text-[15px] font-semibold leading-5 text-heading hover:text-primary">{p.name}</Link>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-fg-muted">
          <span className="truncate">{categoryName}</span>
          {p.name_ur ? <span dir="rtl" className="truncate">{p.name_ur}</span> : null}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
          <div>
            {showPrices ? <div className="text-base font-bold leading-5 text-heading tabular">{formatMoney(p.base_price_minor)}</div> : null}
            {p.variants?.length ? <div className="text-xs text-fg-muted">{p.variants.length} sizes</div> : null}
          </div>
          {margin && tone ? <Badge variant={tone} title={p.cost?.variant_name ? `${p.cost.variant_name} at average ingredient costs` : "At average ingredient costs"}>{margin}</Badge> : null}
        </div>
      </div>
      <div className="flex items-center justify-between border-t px-2 py-1.5">
        <span className="flex items-center gap-1.5 pl-1.5 text-xs font-medium text-fg-secondary">
          <span className={cn("h-2 w-2 rounded-full", p.active ? "bg-success" : "bg-border-strong")} aria-hidden="true" />{p.active ? "Active" : "Inactive"}
        </span>
        <span className="flex items-center">
          <Button variant="ghost" size="icon-sm" onClick={() => onAnalyse(p)} aria-label={`Analysis for ${p.name}`} title="Product analysis"><TrendingUp className="h-4 w-4" /></Button>
          <Link href={editHref(p)} aria-label={`Edit ${p.name}`} title="Edit" className="grid h-8 w-8 place-items-center rounded-full text-fg-secondary hover:bg-fg/8"><Pencil className="h-4 w-4" /></Link>
          <Button variant="ghost" size="icon-sm" className="text-danger hover:bg-danger-soft" onClick={() => onRemove(p)} aria-label={`Archive ${p.name}`} title="Archive (delete)"><Trash2 className="h-4 w-4" /></Button>
        </span>
      </div>
    </div>
  );
}

export function ProductGrid({ rows, catName, showPrices, onFav, onAnalyse, onRemove }: { rows: Product[]; catName: (id: string) => string; showPrices: boolean; onFav: (p: Product) => void; onAnalyse: (p: Product) => void; onRemove: (p: Product) => void }) {
  if (!rows.length) {
    return (
      <div className="grid place-items-center rounded-2xl border border-dashed bg-card py-16 text-center">
        <Package className="mb-2 h-8 w-8 text-fg-muted" />
        <p className="text-sm font-medium text-heading">No products here</p>
        <p className="mt-1 text-sm text-fg-muted">Pick another category, clear the search, or add a product.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {rows.map((p) => <ProductTile key={p.id} product={p} categoryName={catName(p.category_id)} showPrices={showPrices} onFav={onFav} onAnalyse={onAnalyse} onRemove={onRemove} />)}
    </div>
  );
}
