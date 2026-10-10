"use client";
import { useState } from "react";
import Link from "next/link";
import { Package, Plus, Upload, Pencil, Archive } from "lucide-react";
import type { StockItem } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatBaseQty, formatUnitCost } from "@/lib/units";
import { usePagedList, useDebounced } from "@/lib/hooks";
import { FilterBar, LoadMore, PageHeader, SearchInput } from "@/components/admin/page";
import { useRemove } from "@/components/admin/crud";
import { StockItemDialog, useStockCategories } from "@/components/admin/stock";
import { Badge, Button, Checkbox, ConfirmDialog, EmptyRow, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function StockItemsPage() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [category, setCategory] = useState("");
  const [low, setLow] = useState(false);
  const [packaging, setPackaging] = useState(false);
  const cats = useStockCategories();
  const list = usePagedList<StockItem>(["stock_items"], "/stock_items", { q: dq, category, low: low ? "true" : "", packaging: packaging ? "true" : "" });
  const [editing, setEditing] = useState<StockItem | "new" | null>(null);
  const [archiving, setArchiving] = useState<StockItem | null>(null);
  const remove = useRemove(["stock_items", "stock_levels", "stock_categories"], (id) => `/stock_items/${id}`, "Item archived");
  return (
    <>
      <PageHeader icon={Package} title="Stock items" description="Ingredients, packaging and supplies. Quantities are kept in the base unit." actions={<>
        <Link href="/admin/stock/items/import"><Button variant="secondary"><Upload className="h-4 w-4" /> Import CSV</Button></Link>
        <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New item</Button>
      </>} />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Name, SKU or barcode" />
        <Select className="w-auto" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{cats.data?.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
        <Checkbox label="Low only" checked={low} onChange={(e) => setLow(e.target.checked)} />
        <Checkbox label="Packaging" checked={packaging} onChange={(e) => setPackaging(e.target.checked)} />
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Item</TH><TH>Category</TH><TH>Units</TH><TH right>On hand</TH><TH right>Minimum</TH><TH right>Avg cost</TH><TH right>Value</TH><TH>Flags</TH><TH /></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((i) => {
              const code = i.base_unit.code;
              const qty = Number(i.quantity ?? 0);
              const lowFlag = Number(i.minimum_qty) > 0 && qty < Number(i.minimum_qty);
              return (
                <TR key={i.id}>
                  <TD><Link href={`/admin/stock/items/${i.id}`} className="font-medium text-primary hover:underline">{i.name}</Link>{i.name_ur ? <span className="ml-2 text-fg-muted">{i.name_ur}</span> : null}{i.sku ? <span className="ml-2 font-mono text-xs text-fg-muted">{i.sku}</span> : null}</TD>
                  <TD className="text-fg-secondary">{i.category ?? "-"}</TD>
                  <TD className="text-fg-secondary">{code}{i.purchase_unit ? <span className="text-fg-muted"> · buy in {i.purchase_unit.code}</span> : null}</TD>
                  <TD right className={qty < 0 ? "font-medium text-danger" : lowFlag ? "font-medium text-warning" : "font-medium"}>{formatBaseQty(i.quantity, code)}</TD>
                  <TD right className="text-fg-secondary">{Number(i.minimum_qty) > 0 ? formatBaseQty(i.minimum_qty, code) : "-"}</TD>
                  <TD right className="text-fg-secondary">{formatUnitCost(i.avg_cost_minor_per_base, code, formatMoney)}</TD>
                  <TD right>{formatMoney(i.value_minor)}</TD>
                  <TD className="space-x-1">{i.is_packaging ? <Badge variant="info">packaging</Badge> : null}{i.track_expiry ? <Badge variant="accent">expiry</Badge> : null}{qty < 0 ? <Badge variant="danger">negative</Badge> : lowFlag ? <Badge variant="warning">low</Badge> : null}</TD>
                  <TD className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(i)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setArchiving(i)} aria-label="Archive"><Archive className="h-4 w-4 text-danger" /></Button>
                  </TD>
                </TR>
              );
            }) : <EmptyRow colSpan={9}>No stock items. Add one or import a CSV.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
      <StockItemDialog item={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!archiving} onClose={() => setArchiving(null)} onConfirm={() => archiving && remove.mutate(archiving.id, { onSuccess: () => setArchiving(null) })} title={`Archive ${archiving?.name ?? "item"}?`} description="Its stock must be zero in every section first. Past documents and ledger rows keep it." confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}
