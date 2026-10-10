"use client";
import { useState } from "react";
import Link from "next/link";
import { Package, Plus, Star } from "lucide-react";
import { api } from "@/lib/api";
import type { Category, Product } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { usePagedList, useDebounced } from "@/lib/hooks";
import { FilterBar, LoadMore, PageHeader, SearchInput } from "@/components/admin/page";
import { useAction, useList } from "@/components/admin/crud";
import { Badge, Button, Checkbox, EmptyRow, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { cn } from "@/lib/utils";

export default function ProductsPage() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [cat, setCat] = useState("");
  const [fav, setFav] = useState(false);
  const [inactive, setInactive] = useState(false);
  const cats = useList<Category>("categories", "/categories");
  const list = usePagedList<Product>(["products"], "/products", { q: dq, category_id: cat, favourites: fav ? "true" : "", include_inactive: inactive ? "true" : "" });
  const favM = useAction<{ id: string; value: boolean }>(["products"], ({ id, value }) => api(`/products/${id}/favourite`, { method: "POST", body: { value } }));
  return (
    <>
      <PageHeader icon={Package} title="Products" description="Items with variants, per-order-type prices and modifier groups." actions={<Link href="/admin/menu/products/new"><Button><Plus className="h-4 w-4" /> New product</Button></Link>} />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Name, SKU, Urdu name" />
        <Select className="w-auto" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Checkbox label="Favourites" checked={fav} onChange={(e) => setFav(e.target.checked)} />
        <Checkbox label="Include inactive" checked={inactive} onChange={(e) => setInactive(e.target.checked)} />
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH></TH><TH>Name</TH><TH>Category</TH><TH>SKU</TH><TH>Variants</TH><TH>Status</TH><TH right>Price</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((p) => (
              <TR key={p.id}>
                <TD className="w-10"><button onClick={() => favM.mutate({ id: p.id, value: !p.is_favourite })} aria-label="Favourite"><Star className={cn("h-4 w-4", p.is_favourite ? "fill-accent text-accent" : "text-fg-muted")} /></button></TD>
                <TD><Link href={`/admin/menu/products/${p.id}`} className="font-medium text-primary hover:underline">{p.name}</Link>{p.name_ur ? <span className="ml-2 text-fg-muted">{p.name_ur}</span> : null}</TD>
                <TD className="text-fg-secondary">{cats.data?.find((c) => c.id === p.category_id)?.name ?? "-"}</TD>
                <TD className="font-mono text-xs text-fg-secondary">{p.sku ?? "-"}</TD>
                <TD className="text-fg-secondary">{p.variants?.length ? p.variants.map((v) => v.name).join(", ") : "-"}</TD>
                <TD>{p.active ? <Badge variant="success">active</Badge> : <Badge>inactive</Badge>} {p.show_online ? <Badge variant="info">online</Badge> : null}</TD>
                <TD right className="font-medium">{formatMoney(p.base_price_minor)}</TD>
              </TR>
            )) : <EmptyRow colSpan={7}>No products. Add your first item or import a menu.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
    </>
  );
}
