"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Download, FileJson, Hash, LayoutGrid, List, Move, Package, Plus, SlidersHorizontal, Star, Trash2, TrendingUp } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Category, Page, Product } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { usePagedList, useDebounced, useLocalState } from "@/lib/hooks";
import { toast } from "@/store/toast";
import { FilterBar, LoadMore, PageHeader, SearchInput } from "@/components/admin/page";
import { useAction, useList, useRemove } from "@/components/admin/crud";
import { DisplaySettingsDialog, ImportMenuDialog, ProductCodesDialog, downloadMenu, useDisplaySettings } from "@/components/admin/catalog-dialogs";
import { DragHandle, SortableList, SortableRow } from "@/components/admin/catalog-sortable";
import { discountLabel } from "@/components/admin/catalog-helpers";
import { marginLabel, marginTone, type CatalogView } from "@/components/admin/catalog-grid-helpers";
import { CategoryBanner, CategoryChips, ProductGrid, TileImage } from "@/components/admin/catalog-grid";
import { ProductAnalysisDialog } from "@/components/admin/product-analysis";
import { Badge, Button, Checkbox, ConfirmDialog, EmptyRow, EmptyState, Loading, OverflowMenu, Select, Switch, Table, Tabs, TBody, TD, TH, THead, TR } from "@/components/ui";
import { cn } from "@/lib/utils";

type Panel = "import" | "display" | "codes" | null;

export default function ProductsPage() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [cat, setCat] = useState("");
  const [fav, setFav] = useState(false);
  // Grid reads like the menu board (photos, category chips); List is the working table. The choice is remembered on this browser.
  const [view, setView] = useLocalState<CatalogView>("catalog.view", "grid");
  const [analyse, setAnalyse] = useState<Product | null>(null);
  const [del, setDel] = useState<Product | null>(null);
  const display = useDisplaySettings();
  // SPEC Display Settings: show_inactive is the default for "Include inactive"; the checkbox overrides it for this visit.
  const [inactiveOverride, setInactiveOverride] = useState<boolean | null>(null);
  const inactive = inactiveOverride ?? display.data.show_inactive;
  const [arrange, setArrange] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [downloading, setDownloading] = useState(false);
  const cats = useList<Category>("categories", "/categories");
  const list = usePagedList<Product>(["products"], "/products", { q: dq, category_id: cat, favourites: fav ? "true" : "", include_inactive: inactive ? "true" : "" }, { enabled: !arrange });
  const favM = useAction<{ id: string; value: boolean }>(["products"], ({ id, value }) => api(`/products/${id}/favourite`, { method: "POST", body: { value } }));
  // Archive, not delete: past orders keep the product; it leaves the till on the next sync (the same action as the product page).
  const remove = useRemove(["products"], (pid: string) => `/products/${pid}`, "Product archived");
  const catName = (id: string) => cats.data?.find((c) => c.id === id)?.name ?? "-";
  const total = useMemo(() => (cats.data ?? []).reduce((s, c) => s + (c.product_count ?? 0), 0), [cats.data]);
  const current = cat ? cats.data?.find((c) => c.id === cat) : undefined;
  const grid = view === "grid" && !arrange;
  // Review 4.4: a column that is empty on every visible row only takes width away from the name.
  const showSku = list.rows.some((p) => p.sku || p.pct_code);
  const showVariants = list.rows.some((p) => p.variants?.length);
  const showMargin = list.rows.some((p) => p.cost);
  const toggleFav = (p: Product) => favM.mutate({ id: p.id, value: !p.is_favourite });
  const download = async () => {
    setDownloading(true);
    try { await downloadMenu(); toast.success("Menu downloaded"); }
    catch (e) { toast.error("Download failed", errorMessage(e)); }
    finally { setDownloading(false); }
  };
  return (
    <>
      <PageHeader icon={Package} title="Products" description="Every product with its photo, price and margin, and whether it sells in the shop and online. Grid reads like the menu; List is for checking codes and prices. Turn on Arrange to drag products into order within a category." actions={<>
        {/* Review 4.4: one primary action; the menu tools sit together in one overflow menu. */}
        <OverflowMenu label={downloading ? "Downloading…" : "Menu tools"} items={[
          { label: "Download menu", icon: Download, hint: "Every product as a file you can re-import", onSelect: download, disabled: downloading },
          { label: "Import products", icon: FileJson, hint: "Add or update products from a menu file", onSelect: () => setPanel("import") },
          { label: "Display settings", icon: SlidersHorizontal, hint: "Images, prices and inactive products", onSelect: () => setPanel("display") },
          { label: "Product codes", icon: Hash, hint: "SKUs and tax codes in bulk", onSelect: () => setPanel("codes") },
        ]} />
        <Link href="/admin/products/catalog/new"><Button><Plus className="h-4 w-4" /> New product</Button></Link>
      </>} />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Name, SKU, Urdu name" />
        {!grid ? <Select className="w-auto" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select> : null}
        {!grid ? <Checkbox label="Favourites" checked={fav} onChange={(e) => setFav(e.target.checked)} disabled={arrange} /> : null}
        <Checkbox label="Include inactive" checked={inactive} onChange={(e) => setInactiveOverride(e.target.checked)} />
        <Switch checked={arrange} onChange={setArrange} label="Arrange" />
        {arrange ? <span className="flex items-center gap-1 text-xs text-fg-muted"><Move className="h-3.5 w-3.5" /> {cat ? "Drag rows by the grip; the order saves on drop." : "Choose a category to arrange its products."}</span> : null}
        <Tabs<CatalogView> value={view} onChange={setView} className="ml-auto" items={[
          { value: "grid", label: <span className="flex items-center gap-1.5"><LayoutGrid className="h-4 w-4" /> Grid</span> },
          { value: "list", label: <span className="flex items-center gap-1.5"><List className="h-4 w-4" /> List</span> },
        ]} />
      </FilterBar>
      {grid ? <CategoryChips cats={cats.data ?? []} value={cat} onChange={setCat} fav={fav} onFav={setFav} total={total} /> : null}
      {grid && current ? <CategoryBanner category={current} /> : null}
      {arrange ? (
        cat ? <ArrangeList categoryId={cat} includeInactive={inactive} showImages={display.data.images} /> : <EmptyState icon={Move} title="Pick a category" hint="Products are arranged inside their category, the same order the till and the website show." />
      ) : list.isLoading ? <Loading /> : grid ? (
        <ProductGrid rows={list.rows} catName={catName} showPrices={display.data.show_prices} onFav={toggleFav} onAnalyse={setAnalyse} onRemove={setDel} />
      ) : (
        <Table>
          <THead><tr><TH></TH><TH>Name</TH><TH>Category</TH>{showSku ? <TH>SKU</TH> : null}{showVariants ? <TH>Variants</TH> : null}<TH>Status</TH><TH right>Price</TH>{showMargin ? <TH right>Margin</TH> : null}<TH></TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((p) => (
              <TR key={p.id}>
                <TD className="w-10"><button onClick={() => toggleFav(p)} aria-label={p.is_favourite ? "Remove from favourites" : "Add to favourites"}><Star className={cn("h-4 w-4", p.is_favourite ? "fill-accent text-accent" : "text-fg-muted")} /></button></TD>
                <TD>
                  <span className="flex items-center gap-3">
                    {display.data.images ? <Thumb src={p.image_key} name={p.name} /> : null}
                    <span><Link href={`/admin/products/catalog/${p.id}`} className="font-medium text-primary hover:underline">{p.name}</Link>{p.name_ur ? <span className="ml-2 text-fg-muted">{p.name_ur}</span> : null}</span>
                  </span>
                </TD>
                <TD className="text-fg-secondary">{catName(p.category_id)}</TD>
                {showSku ? <TD className="font-mono text-xs text-fg-secondary">{p.sku ?? "-"}{p.pct_code ? <span className="ml-2 text-fg-muted">PCT {p.pct_code}</span> : null}</TD> : null}
                {showVariants ? <TD className="text-fg-secondary">{p.variants?.length ? p.variants.map((v) => v.name).join(", ") : "-"}</TD> : null}
                <TD><ProductStatus active={p.active} online={p.show_online} /></TD>
                <TD right className="font-medium">{display.data.show_prices ? formatMoney(p.base_price_minor) : "-"}{discountLabel(p.discount_value, p.discount_type) ? <Badge variant="accent" className="ml-2">{discountLabel(p.discount_value, p.discount_type)} off</Badge> : null}</TD>
                {showMargin ? <TD right>{marginLabel(p.cost) ? <Badge variant={marginTone(p.cost) ?? "neutral"}>{marginLabel(p.cost)}</Badge> : <span className="text-fg-muted">-</span>}</TD> : null}
                <TD className="w-24"><span className="flex items-center justify-end"><Button variant="ghost" size="icon-sm" onClick={() => setAnalyse(p)} aria-label={`Analysis for ${p.name}`} title="Product analysis"><TrendingUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon-sm" className="text-danger hover:bg-danger-soft" onClick={() => setDel(p)} aria-label={`Archive ${p.name}`} title="Archive (delete)"><Trash2 className="h-4 w-4" /></Button></span></TD>
              </TR>
            )) : <EmptyRow colSpan={6 + (showSku ? 1 : 0) + (showVariants ? 1 : 0) + (showMargin ? 1 : 0)} icon={Package} action={<Link href="/admin/products/catalog/new"><Button size="sm"><Plus className="h-4 w-4" /> New product</Button></Link>}>{dq || cat || fav ? "No products match these filters. Clear the search or pick another category." : "No products yet. Add your first item, or import a menu from Menu tools."}</EmptyRow>}
          </TBody>
        </Table>
      )}
      {!arrange ? <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} /> : null}
      <ImportMenuDialog open={panel === "import"} onClose={() => setPanel(null)} />
      <DisplaySettingsDialog open={panel === "display"} onClose={() => setPanel(null)} />
      <ProductCodesDialog open={panel === "codes"} onClose={() => setPanel(null)} />
      <ProductAnalysisDialog productId={analyse?.id ?? null} open={!!analyse} onClose={() => setAnalyse(null)} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })} title={`Archive ${del?.name ?? "this product"}?`} description="It leaves the till on the next sync; past orders and reports keep it. Tick Include inactive to find it again." confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}

/** One status pill per product (review 4.4): whether it sells, and where. */
function ProductStatus({ active, online }: { active: boolean; online?: boolean }) {
  if (!active) return <Badge>Inactive</Badge>;
  return <Badge variant="success" title={online ? "Sells at the till and on the website" : "Sells at the till only"}>{online ? "Active · Online" : "Active · Till only"}</Badge>;
}

/** The list's small picture: the photo, or the same coloured initials tile the grid uses. */
function Thumb({ src, name }: { src: string | null; name: string }) {
  return <TileImage src={src} name={name} className="h-9 w-9 shrink-0 rounded-md border [&>span]:text-xs" />;
}

/** SPEC Arrange mode for products: every product of one category, drag-and-drop, saved with POST /products/reorder on drop. */
function ArrangeList({ categoryId, includeInactive, showImages }: { categoryId: string; includeInactive: boolean; showImages: boolean }) {
  const all = useQuery({ queryKey: ["products", "arrange", categoryId, includeInactive], queryFn: () => api<Page<Product>>("/products", { query: { category_id: categoryId, include_inactive: includeInactive ? "true" : "", limit: 200 } }), select: (r) => r.data });
  const reorder = useAction<string[]>(["products"], (ids) => api("/products/reorder", { method: "POST", body: { ids } }), "Order saved");
  const [ordered, setOrdered] = useState<Product[] | null>(null);
  const rows = ordered ?? all.data ?? [];
  const onDrop = (next: Product[]) => { setOrdered(next); reorder.mutate(next.map((p) => p.id), { onSettled: () => setOrdered(null) }); };
  if (all.isLoading) return <Loading />;
  return (
    <Table>
      <THead><tr><TH></TH><TH>#</TH><TH>Name</TH><TH>Variants</TH><TH>Status</TH><TH right>Price</TH></tr></THead>
      <TBody>
        {rows.length ? (
          <SortableList items={rows} getId={(p) => p.id} onReorder={onDrop} disabled={reorder.isPending}>
            {(p, i, handle) => (
              <SortableRow key={p.id} handle={handle}>
                <TD className="w-10"><DragHandle handle={handle} /></TD>
                <TD className="w-10 text-fg-muted tabular">{i + 1}</TD>
                <TD><span className="flex items-center gap-3">{showImages ? <Thumb src={p.image_key} name={p.name} /> : null}<span className="font-medium">{p.name}</span></span></TD>
                <TD className="text-fg-secondary">{p.variants?.length ? p.variants.map((v) => v.name).join(", ") : "-"}</TD>
                <TD><ProductStatus active={p.active} online={p.show_online} /></TD>
                <TD right className="font-medium">{formatMoney(p.base_price_minor)}</TD>
              </SortableRow>
            )}
          </SortableList>
        ) : <EmptyRow colSpan={6}>No products in this category.</EmptyRow>}
      </TBody>
    </Table>
  );
}
