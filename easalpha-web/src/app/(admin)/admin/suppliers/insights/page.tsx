"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Lightbulb } from "lucide-react";
import { api } from "@/lib/api";
import type { SupplierRanking, SupplierRankingSort } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { daysAgo, formatDate, isoDay } from "@/lib/dates";
import { Cards, DateRangePicker, FilterBar, PageHeader, type DateRange } from "@/components/admin/page";
import { balanceLabel } from "@/components/admin/purchasing-helpers";
import { Badge, Checkbox, EmptyRow, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";

const SORTS: { value: SupplierRankingSort; label: string }[] = [{ value: "purchased", label: "Purchased" }, { value: "paid", label: "Paid" }, { value: "outstanding", label: "Outstanding" }, { value: "name", label: "Name" }];

export default function SupplierInsightsPage() {
  const [sort, setSort] = useState<SupplierRankingSort>("purchased");
  const [range, setRange] = useState<DateRange>({ from: daysAgo(89), to: isoDay() });
  const [allTime, setAllTime] = useState(false);
  const query = allTime ? { sort } : { sort, from: range.from, to: range.to };
  const ranking = useQuery({ queryKey: ["supplier_ranking", query], queryFn: () => api<SupplierRanking>("/suppliers/ranking", { query }) });
  const r = ranking.data;
  const withPurchases = r?.rows.filter((x) => x.purchased_minor > 0).length ?? 0;
  return (
    <>
      <PageHeader icon={Lightbulb} title="Supplier Insights" description="Rank suppliers by what you bought, what you paid and what is still owed. Purchased and paid follow the date range; outstanding is the balance today." />
      <FilterBar>
        <Tabs value={sort} onChange={setSort} items={SORTS} />
        <DateRangePicker value={range} onChange={(v) => { setRange(v); setAllTime(false); }} />
        <Checkbox label="All time" checked={allTime} onChange={(e) => setAllTime(e.target.checked)} />
      </FilterBar>
      <Cards>
        <SummaryCard label="Purchased" value={formatMoney(r?.totals.purchased_minor)} sub={`${withPurchases} of ${r?.rows.length ?? 0} suppliers bought from`} tone="warning" />
        <SummaryCard label="Paid" value={formatMoney(r?.totals.paid_minor)} sub={allTime ? "All time" : `${formatDate(range.from)} to ${formatDate(range.to)}`} tone="success" />
        <SummaryCard label="Outstanding" value={formatMoney(r?.totals.outstanding_minor)} sub={`${r?.rows.filter((x) => x.outstanding_minor > 0).length ?? 0} suppliers to pay`} tone={r?.totals.outstanding_minor ? "danger" : "neutral"} />
      </Cards>
      {ranking.isLoading || !r ? <Loading /> : (
        <Table>
          <THead><tr><TH>#</TH><TH>Supplier</TH><TH right>Purchased</TH><TH right>Paid</TH><TH right>Outstanding</TH><TH right>POs</TH><TH>Last purchase</TH></tr></THead>
          <TBody>
            {r.rows.length ? r.rows.map((row, i) => {
              const dir = balanceLabel(row.supplier.balance_label, row.outstanding_minor);
              return (
                <TR key={row.supplier.id}>
                  <TD className="text-fg-muted">{i + 1}</TD>
                  <TD><Link href={`/admin/suppliers/ledger?supplier_id=${row.supplier.id}`} className="font-medium text-primary hover:underline">{row.supplier.name}</Link>{row.supplier.contact_name ? <span className="ml-2 text-xs text-fg-muted">{row.supplier.contact_name}</span> : null}</TD>
                  <TD right className={row.purchased_minor ? "" : "text-fg-muted"}>{row.purchased_minor ? formatMoney(row.purchased_minor) : "-"}</TD>
                  <TD right className={row.paid_minor ? "text-success" : "text-fg-muted"}>{row.paid_minor ? formatMoney(row.paid_minor) : "-"}</TD>
                  <TD right><span className={row.outstanding_minor > 0 ? "font-medium text-danger" : row.outstanding_minor < 0 ? "font-medium text-success" : "text-fg-muted"}>{row.outstanding_minor ? formatMoney(Math.abs(row.outstanding_minor)) : "-"}</span>{row.outstanding_minor ? <Badge variant={dir.variant} className="ml-2">{dir.text}</Badge> : null}</TD>
                  <TD right>{row.po_count}</TD>
                  <TD className="text-fg-secondary">{row.last_purchase_on ? formatDate(row.last_purchase_on) : "-"}</TD>
                </TR>
              );
            }) : <EmptyRow colSpan={7}>No suppliers yet.</EmptyRow>}
            {r.rows.length ? (
              <TR className="bg-muted/40 font-medium">
                <TD></TD><TD>Total ({r.rows.length} suppliers)</TD>
                <TD right>{formatMoney(r.totals.purchased_minor)}</TD><TD right>{formatMoney(r.totals.paid_minor)}</TD><TD right>{formatMoney(r.totals.outstanding_minor)}</TD>
                <TD right>{r.rows.reduce((a, x) => a + x.po_count, 0)}</TD><TD></TD>
              </TR>
            ) : null}
          </TBody>
        </Table>
      )}
    </>
  );
}
