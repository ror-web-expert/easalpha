"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Package, Pencil, Archive, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { Page, StockItem, StockLedgerEntry, SupplierPrice } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime, daysAgo, isoDay } from "@/lib/dates";
import { displayUnit, formatBaseQty, formatSignedQty, formatUnitCost } from "@/lib/units";
import { usePagedList } from "@/lib/hooks";
import { titleCase } from "@/lib/utils";
import { Cards, DateRangePicker, FilterBar, LoadMore, PageHeader, type DateRange } from "@/components/admin/page";
import { useRemove } from "@/components/admin/crud";
import { LEDGER_KINDS, ledgerKindVariant, sectionName, StockItemDialog, useSections } from "@/components/admin/stock";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ConfirmDialog, EmptyRow, KeyValue, Loading, Select, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function StockItemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const item = useQuery({ queryKey: ["stock_item", id], queryFn: () => api<StockItem>(`/stock_items/${id}`) });
  const sections = useSections();
  const [kind, setKind] = useState("");
  const [section, setSection] = useState("");
  const [range, setRange] = useState<DateRange>({ from: daysAgo(29), to: isoDay() });
  const ledger = usePagedList<StockLedgerEntry>(["stock_item_ledger", id], `/stock_items/${id}/ledger`, { kind, section_id: section, from: range.from, to: range.to });
  const prices = useQuery({ queryKey: ["supplier_prices", { itemId: id }], queryFn: () => api<Page<SupplierPrice>>("/purchasing/prices", { query: { stock_item_id: id, limit: 10 } }), select: (r) => r.data });
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const remove = useRemove(["stock_items", "stock_levels"], (iid) => `/stock_items/${iid}`, "Item archived");
  const i = item.data;
  if (item.isLoading || !i) return <Loading />;
  const code = i.base_unit.code;
  const qty = Number(i.quantity ?? 0);
  const lowFlag = Number(i.minimum_qty) > 0 && qty < Number(i.minimum_qty);
  return (
    <>
      <PageHeader icon={Package} title={i.name} description={[i.sku, i.category, i.name_ur].filter(Boolean).join(" · ") || "Stock item"} actions={<>
        <Link href="/admin/inventory/items"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Items</Button></Link>
        <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>
        <Button variant="destructive" onClick={() => setArchiving(true)}><Archive className="h-4 w-4" /> Archive</Button>
      </>} />
      <Cards>
        <SummaryCard label="On hand" value={formatBaseQty(i.quantity, code)} sub={qty < 0 ? "Negative: count or adjust" : lowFlag ? `Below minimum of ${formatBaseQty(i.minimum_qty, code)}` : "All sections"} tone={qty < 0 ? "danger" : lowFlag ? "warning" : "primary"} />
        <SummaryCard label="Stock value" value={formatMoney(i.value_minor)} tone="success" />
        <SummaryCard label="Average cost" value={formatUnitCost(i.avg_cost_minor_per_base, code, formatMoney)} sub="Weighted average of receipts" tone="info" />
        <SummaryCard label="Reorder" value={Number(i.reorder_qty) > 0 ? formatBaseQty(i.reorder_qty, code) : "-"} sub={Number(i.minimum_qty) > 0 ? `Minimum ${formatBaseQty(i.minimum_qty, code)}` : "No minimum set"} tone="neutral" />
      </Cards>
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardBody>
            <KeyValue items={[
              { label: "Base unit", value: `${i.base_unit.name} (${code})` },
              { label: "Purchase unit", value: i.purchase_unit ? `${i.purchase_unit.name} (${i.purchase_unit.code} = ${Number(i.purchase_unit.factor_to_base)} ${code})` : "Same as base" },
              { label: "Barcode", value: i.barcode ?? "-" },
              { label: "Packaging", value: i.is_packaging ? "Yes" : "No" },
              { label: "Track expiry", value: i.track_expiry ? "Yes" : "No" },
              { label: "Created", value: formatDate(i.created_at) },
            ]} />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Levels per section</CardTitle></CardHeader>
          <Table>
            <THead><tr><TH>Section</TH><TH right>Quantity</TH><TH right>Value</TH></tr></THead>
            <TBody>
              {i.levels?.length ? i.levels.map((l) => (
                <TR key={l.section_id}><TD className="font-medium">{sectionName(sections.data, l.section_id)}</TD><TD right className={Number(l.quantity) < 0 ? "text-danger" : ""}>{formatBaseQty(l.quantity, code)}</TD><TD right>{formatMoney(l.value_minor)}</TD></TR>
              )) : <EmptyRow colSpan={3}>No stock in any section yet.</EmptyRow>}
            </TBody>
          </Table>
        </Card>
      </div>
      <Card className="mb-5">
        <CardHeader><CardTitle>Supplier prices</CardTitle><Link href="/admin/purchasing/goods-received" className="text-xs text-primary hover:underline">All receipts</Link></CardHeader>
        <Table>
          <THead><tr><TH>Date</TH><TH>Supplier</TH><TH right>Price</TH><TH right>Per {displayUnit(1000, code).code}</TH><TH>Receipt</TH></tr></THead>
          <TBody>
            {prices.data?.length ? prices.data.map((p) => (
              <TR key={p.id}>
                <TD className="text-fg-secondary">{formatDate(p.observed_on)}</TD>
                <TD><Link href={`/admin/suppliers/${p.supplier_id}`} className="font-medium text-primary hover:underline">{p.supplier_name}</Link></TD>
                <TD right>{formatMoney(p.unit_cost_minor)} / {p.unit_code ?? code}</TD>
                <TD right className="text-fg-secondary">{formatUnitCost(p.base_unit_cost_minor, code, formatMoney)}</TD>
                <TD>{p.goods_receipt_id ? <Link href={`/admin/purchasing/goods-received/${p.goods_receipt_id}`} className="text-xs text-primary hover:underline">Open</Link> : "-"}</TD>
              </TR>
            )) : <EmptyRow colSpan={5}>No purchases recorded yet. Prices appear here from goods receipts.</EmptyRow>}
          </TBody>
        </Table>
      </Card>
      <h2 className="mb-3 text-base font-semibold">Ledger</h2>
      <FilterBar>
        <Select className="w-auto" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All kinds</option>{LEDGER_KINDS.map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}</Select>
        <Select className="w-auto" value={section} onChange={(e) => setSection(e.target.value)}><option value="">All sections</option>{sections.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <DateRangePicker value={range} onChange={setRange} />
      </FilterBar>
      {ledger.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>When</TH><TH>Kind</TH><TH>Section</TH><TH right>Change</TH><TH right>Before → after</TH><TH right>Unit cost</TH><TH right>Value</TH><TH>Reason / reference</TH></tr></THead>
          <TBody>
            {ledger.rows.length ? ledger.rows.map((e) => (
              <TR key={e.id} className={e.reversed_by_entry_id ? "opacity-60" : ""}>
                <TD className="whitespace-nowrap text-fg-secondary">{formatDateTime(e.occurred_at)}<div className="text-xs text-fg-muted">Day {formatDate(e.business_day)}</div></TD>
                <TD><Badge variant={ledgerKindVariant(e.kind)}>{titleCase(e.kind)}</Badge>{e.reverses_entry_id ? <Badge className="ml-1" variant="outline">reversal</Badge> : null}{e.reversed_by_entry_id ? <Badge className="ml-1" variant="outline">reversed</Badge> : null}</TD>
                <TD className="text-fg-secondary">{e.section_name ?? "-"}</TD>
                <TD right className={Number(e.quantity) < 0 ? "font-medium text-danger" : "font-medium text-success"}>{formatSignedQty(e.quantity, e.unit_code ?? code)}</TD>
                <TD right className="text-fg-secondary">{formatBaseQty(e.before_qty, code)} → {formatBaseQty(e.after_qty, code)}</TD>
                <TD right className="text-fg-secondary">{formatUnitCost(e.unit_cost_minor, code, formatMoney)}</TD>
                <TD right>{formatMoney(e.value_minor)}</TD>
                <TD className="text-fg-secondary">{e.reason ?? ""}{e.ref_table === "stock_documents" && e.ref_id ? <Link href={`/admin/inventory/stock-actions/${e.ref_id}`} className="ml-1 text-primary hover:underline">document</Link> : e.ref_table === "orders" && e.ref_id ? <Link href={`/admin/orders?id=${e.ref_id}`} className="ml-1 text-primary hover:underline">order</Link> : null}</TD>
              </TR>
            )) : <EmptyRow colSpan={8}>No ledger entries in this range.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={ledger.nextCursor} onLoad={() => ledger.fetchNextPage()} loading={ledger.isFetchingNextPage} />
      <StockItemDialog item={editing ? i : null} onClose={() => setEditing(false)} />
      <ConfirmDialog open={archiving} onClose={() => setArchiving(false)} onConfirm={() => remove.mutate(i.id, { onSuccess: () => router.replace("/admin/inventory/items") })} title={`Archive ${i.name}?`} description="Its stock must be zero in every section first. Past documents and ledger rows keep it." confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}
