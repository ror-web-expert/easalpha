"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Download, FileJson, Hash, Move, Package, Plus, SlidersHorizontal, Star } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Category, Page, Product } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { usePagedList, useDebounced } from "@/lib/hooks";
import { toast } from "@/store/toast";
import { FilterBar, LoadMore, PageHeader, SearchInput } from "@/components/admin/page";
import { useAction, useList } from "@/components/admin/crud";
import { DisplaySettingsDialog, ImportMenuDialog, ProductCodesDialog, downloadMenu, useDisplaySettings } from "@/components/admin/catalog-dialogs";
import { DragHandle, SortableList, SortableRow } from "@/components/admin/catalog-sortable";
import { discountLabel } from "@/components/admin/catalog-helpers";
import { Badge, Button, Checkbox, EmptyRow, EmptyState, Loading, Select, Switch, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { cn } from "@/lib/utils";

type Panel = "import" | "display" | "codes" | null;

export default function ProductsPage() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [cat, setCat] = useState("");
  const [fav, setFav] = useState(false);
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
  const catName = (id: string) => cats.data?.find((c) => c.id === id)?.name ?? "-";
  const download = async () => {
    setDownloading(true);
    try { await downloadMenu(); toast.success("Menu downloaded"); }
    catch (e) { toast.error("Download failed", errorMessage(e)); }
    finally { setDownloading(false); }
  };
  return (
    <>
      <PageHeader icon={Package} title="Products" description="Products show a price and an Active or Inactive state. Drag to arrange within a category; download, import, display and code tools on the right." actions={<>
        <Button variant="secondary" onClick={download} loading={downloading}><Download className="h-4 w-4" /> Download Menu</Button>
        <Button variant="secondary" onClick={() => setPanel("import")}><FileJson className="h-4 w-4" /> Import JSON</Button>
        <Button variant="secondary" onClick={() => setPanel("display")}><SlidersHorizontal className="h-4 w-4" /> Display Settings</Button>
        <Button variant="secondary" onClick={() => setPanel("codes")}><Hash className="h-4 w-4" /> Product Codes</Button>
        <Link href="/admin/products/catalog/new"><Button><Plus className="h-4 w-4" /> New product</Button></Link>
      </>} />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Name, SKU, Urdu name" />
        <Select className="w-auto" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Checkbox label="Favourites" checked={fav} onChange={(e) => setFav(e.target.checked)} disabled={arrange} />
        <Checkbox label="Include inactive" checked={inactive} onChange={(e) => setInactiveOverride(e.target.checked)} />
        <Switch checked={arrange} onChange={setArrange} label="Arrange" />
        {arrange ? <span className="flex items-center gap-1 text-xs text-fg-muted"><Move className="h-3.5 w-3.5" /> {cat ? "Drag rows by the grip; the order saves on drop." : "Choose a category to arrange its products."}</span> : null}
      </FilterBar>
      {arrange ? (
        cat ? <ArrangeList categoryId={cat} includeInactive={inactive} showImages={display.data.images} /> : <EmptyState icon={Move} title="Pick a category" hint="Products are arranged inside their category, the same order the till and the website show." />
      ) : list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH></TH><TH>Name</TH><TH>Category</TH><TH>SKU</TH><TH>Variants</TH><TH>Status</TH><TH right>Price</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((p) => (
              <TR key={p.id}>
                <TD className="w-10"><button onClick={() => favM.mutate({ id: p.id, value: !p.is_favourite })} aria-label={p.is_favourite ? "Remove from favourites" : "Add to favourites"}><Star className={cn("h-4 w-4", p.is_favourite ? "fill-accent text-accent" : "text-fg-muted")} /></button></TD>
                <TD>
                  <span className="flex items-center gap-3">
                    {display.data.images ? <Thumb src={p.image_key} /> : null}
                    <span><Link href={`/admin/products/catalog/${p.id}`} className="font-medium text-primary hover:underline">{p.name}</Link>{p.name_ur ? <span className="ml-2 text-fg-muted">{p.name_ur}</span> : null}</span>
                  </span>
                </TD>
                <TD className="text-fg-secondary">{catName(p.category_id)}</TD>
                <TD className="font-mono text-xs text-fg-secondary">{p.sku ?? "-"}{p.pct_code ? <span className="ml-2 text-fg-muted">PCT {p.pct_code}</span> : null}</TD>
                <TD className="text-fg-secondary">{p.variants?.length ? p.variants.map((v) => v.name).join(", ") : "-"}</TD>
                <TD>{p.active ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>} {p.show_online ? <Badge variant="info">online</Badge> : null}</TD>
                <TD right className="font-medium">{display.data.show_prices ? formatMoney(p.base_price_minor) : "-"}{discountLabel(p.discount_value, p.discount_type) ? <Badge variant="accent" className="ml-2">{discountLabel(p.discount_value, p.discount_type)} off</Badge> : null}</TD>
              </TR>
            )) : <EmptyRow colSpan={7}>No products. Add your first item or import a menu.</EmptyRow>}
          </TBody>
        </Table>
      )}
      {!arrange ? <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} /> : null}
      <ImportMenuDialog open={panel === "import"} onClose={() => setPanel(null)} />
      <DisplaySettingsDialog open={panel === "display"} onClose={() => setPanel(null)} />
      <ProductCodesDialog open={panel === "codes"} onClose={() => setPanel(null)} />
    </>
  );
}

function Thumb({ src }: { src: string | null }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : <Package className="h-4 w-4 text-fg-muted" />}
    </span>
  );
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
                <TD><span className="flex items-center gap-3">{showImages ? <Thumb src={p.image_key} /> : null}<span className="font-medium">{p.name}</span></span></TD>
                <TD className="text-fg-secondary">{p.variants?.length ? p.variants.map((v) => v.name).join(", ") : "-"}</TD>
                <TD>{p.active ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}</TD>
                <TD right className="font-medium">{formatMoney(p.base_price_minor)}</TD>
              </SortableRow>
            )}
          </SortableList>
        ) : <EmptyRow colSpan={6}>No products in this category.</EmptyRow>}
      </TBody>
    </Table>
  );
}
