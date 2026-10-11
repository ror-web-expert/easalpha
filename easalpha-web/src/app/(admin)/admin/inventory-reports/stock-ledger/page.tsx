"use client";
import { useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import type { StockItem, StockLedgerEntry } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { daysAgo, formatDate, formatDateTime, isoDay } from "@/lib/dates";
import { formatBaseQty, formatSignedQty, formatUnitCost } from "@/lib/units";
import { titleCase } from "@/lib/utils";
import { usePagedList } from "@/lib/hooks";
import { DateRangePicker, FilterBar, LoadMore, PageHeader, type DateRange } from "@/components/admin/page";
import { ItemPicker, LEDGER_KINDS, ledgerKindVariant, useSections } from "@/components/admin/stock";
import { Badge, Button, EmptyRow, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function StockLedgerPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(29), to: isoDay() });
  const [kind, setKind] = useState("");
  const [section, setSection] = useState("");
  const [item, setItem] = useState<StockItem | null>(null);
  const sections = useSections();
  const list = usePagedList<StockLedgerEntry>(["stock_ledger"], "/stock/ledger", { kind, section_id: section, item_id: item?.id ?? "", from: range.from, to: range.to });
  const refLink = (e: StockLedgerEntry) => {
    if (!e.ref_id) return null;
    if (e.ref_table === "stock_documents") return <Link href={`/admin/inventory/stock-actions/${e.ref_id}`} className="text-primary hover:underline">document</Link>;
    if (e.ref_table === "orders") return <Link href={`/admin/orders?q=${encodeURIComponent(e.ref_id)}`} className="text-primary hover:underline">order</Link>;
    return <span className="text-fg-muted">{e.ref_table?.replace(/_/g, " ")}</span>;
  };
  return (
    <>
      <PageHeader icon={History} title="Stock Ledger" description="Every movement per item: sales, receipts, transfers, waste, adjustments, counts and production, with the balance before and after each one." />
      <FilterBar>
        <DateRangePicker value={range} onChange={setRange} />
        <Select className="w-auto" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind"><option value="">All kinds</option>{LEDGER_KINDS.map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}</Select>
        <Select className="w-auto" value={section} onChange={(e) => setSection(e.target.value)} aria-label="Section"><option value="">All sections</option>{sections.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <ItemPicker className="w-full sm:w-64" value={item} onPick={setItem} />
        {item ? <Button variant="ghost" size="sm" onClick={() => setItem(null)}>Clear item</Button> : null}
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>When</TH><TH>Day</TH><TH>Kind</TH><TH>Item</TH><TH>Section</TH><TH right>Change</TH><TH right>Before → after</TH><TH right>Unit cost</TH><TH right>Value</TH><TH>Reason</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((e) => (
              <TR key={e.id} className={e.reversed_by_entry_id ? "opacity-60" : ""}>
                <TD className="whitespace-nowrap text-fg-secondary">{formatDateTime(e.occurred_at)}</TD>
                <TD className="whitespace-nowrap text-fg-secondary">{formatDate(e.business_day)}</TD>
                <TD><Badge variant={ledgerKindVariant(e.kind)}>{titleCase(e.kind)}</Badge>{e.reversed_by_entry_id ? <Badge className="ml-1" variant="outline">reversed</Badge> : null}</TD>
                <TD><Link href={`/admin/inventory/items/${e.stock_item_id}`} className="font-medium text-primary hover:underline">{e.item_name}</Link></TD>
                <TD className="text-fg-secondary">{e.section_name ?? "-"}</TD>
                <TD right className={Number(e.quantity) < 0 ? "font-medium text-danger" : "font-medium text-success"}>{formatSignedQty(e.quantity, e.unit_code)}</TD>
                <TD right className="whitespace-nowrap tabular text-fg-secondary">{formatBaseQty(e.before_qty, e.unit_code)} → <span className={Number(e.after_qty) < 0 ? "text-danger" : "text-fg"}>{formatBaseQty(e.after_qty, e.unit_code)}</span></TD>
                <TD right className="text-fg-secondary">{formatUnitCost(e.unit_cost_minor, e.unit_code, formatMoney)}</TD>
                <TD right className={e.value_minor < 0 ? "text-danger" : ""}>{formatMoney(e.value_minor)}</TD>
                <TD className="text-sm text-fg-secondary">{e.reason ?? ""}{e.reason && e.ref_id ? " · " : ""}{refLink(e)}</TD>
              </TR>
            )) : <EmptyRow colSpan={10}>No movements match. Widen the dates or clear a filter.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
    </>
  );
}
