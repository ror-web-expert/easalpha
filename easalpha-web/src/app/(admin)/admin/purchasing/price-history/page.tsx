"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { LineChart } from "lucide-react";
import { api } from "@/lib/api";
import type { PriceHistoryReport } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { daysAgo, formatDate, isoDay } from "@/lib/dates";
import { formatBaseQty } from "@/lib/units";
import { useDebounced } from "@/lib/hooks";
import { Cards, DateRangePicker, FilterBar, PageHeader, SearchInput, type DateRange } from "@/components/admin/page";
import { moneyPerUnit, signedPercent, verdictVariant } from "@/components/admin/purchasing-helpers";
import { Badge, Card, CardBody, EmptyRow, Loading, SummaryCard, Switch, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

// SPEC: the column meanings, shown on the page so the verdicts can be trusted without a manual.
const COLUMNS: { name: string; meaning: string }[] = [
  { name: "Bought", meaning: "Quantity and number of purchases in the window" },
  { name: "Spent", meaning: "Total spend on that item" },
  { name: "Paid on average", meaning: "Spend divided by quantity, in the item's unit" },
  { name: "Last price", meaning: "Most recent purchase price and its date" },
  { name: "Average cost", meaning: "The cost sales are currently booked at" },
  { name: "Difference", meaning: "Percentage gap between the two" },
  { name: "Verdict", meaning: "For example Wrong unit on a purchase, Valued below what you pay" },
];

export default function PurchasePriceHistoryPage() {
  const [range, setRange] = useState<DateRange>({ from: daysAgo(89), to: isoDay() });
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [flagged, setFlagged] = useState(false);
  const query = { from: range.from, to: range.to, q: dq, flagged: flagged ? "true" : "" };
  const report = useQuery({ queryKey: ["purchase_price_history", query], queryFn: () => api<PriceHistoryReport>("/purchasing/price_history", { query }) });
  const r = report.data;
  return (
    <>
      <PageHeader icon={LineChart} title="Purchase Price History" description="A data-quality check: what you actually paid per item against the average cost sales are booked at, over a chosen window. Items that need a look get a plain verdict; most flags are a wrong unit on a purchase line, and recipe costing is only as good as that unit." />
      <FilterBar>
        <DateRangePicker value={range} onChange={setRange} />
        <SearchInput value={q} onChange={setQ} placeholder="Item name" />
        <Switch checked={flagged} onChange={setFlagged} label="Flagged only" />
      </FilterBar>
      <Cards>
        <SummaryCard label="Items purchased" value={r?.summary.items ?? 0} sub={`${formatDate(range.from)} to ${formatDate(range.to)}`} tone="neutral" />
        <SummaryCard label="Flagged" value={r?.summary.flagged ?? 0} sub={r?.summary.items ? `${Math.round((r.summary.flagged / r.summary.items) * 100)}% of purchased items` : "Nothing to check yet"} tone={r?.summary.flagged ? "danger" : "success"} />
        <SummaryCard label="Spent" value={formatMoney(r?.summary.spent_minor)} sub="Posted goods receipts in the window" tone="primary" />
      </Cards>
      {report.isLoading || !r ? <Loading /> : (
        <Table>
          <THead><tr><TH>Item</TH><TH right>Bought</TH><TH right>Spent</TH><TH right>Paid on average</TH><TH right>Last price</TH><TH right>Average cost</TH><TH right>Difference</TH><TH>Verdict</TH></tr></THead>
          <TBody>
            {r.rows.length ? r.rows.map((row) => (
              <TR key={row.item.id} className={row.flagged ? "bg-warning-soft/30" : ""}>
                <TD><Link href={`/admin/inventory/items/${row.item.id}`} className="font-medium text-primary hover:underline">{row.item.name}</Link>{row.item.category ? <span className="ml-2 text-xs text-fg-muted">{row.item.category}</span> : null}</TD>
                <TD right><div>{formatBaseQty(row.bought_qty, row.unit_code)}</div><div className="text-xs text-fg-muted">{row.purchases} purchase{row.purchases === 1 ? "" : "s"}</div></TD>
                <TD right className="font-medium">{formatMoney(row.spent_minor)}</TD>
                <TD right>{moneyPerUnit(row.paid_avg_minor_per_base, row.unit_code)}</TD>
                <TD right><div>{formatMoney(row.last_price.unit_cost_minor)} / {row.last_price.unit_code ?? row.unit_code}</div><div className="text-xs text-fg-muted">{formatDate(row.last_price.on)}{row.last_price.supplier ? ` · ${row.last_price.supplier}` : ""}</div></TD>
                <TD right className="text-fg-secondary">{moneyPerUnit(row.avg_cost_minor_per_base, row.unit_code)}</TD>
                <TD right className={row.difference_percent === null ? "text-fg-muted" : Math.abs(row.difference_percent) >= 20 ? "font-medium text-danger" : ""}>{signedPercent(row.difference_percent)}</TD>
                <TD><Badge variant={verdictVariant(row.verdict)}>{row.verdict_text}</Badge></TD>
              </TR>
            )) : <EmptyRow colSpan={8}>{flagged ? "Nothing flagged in this window." : "No purchases in this window."}</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Card className="mt-4">
        <CardBody>
          <details>
            <summary className="cursor-pointer text-sm font-medium">What each column means</summary>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[160px_1fr]">
              {COLUMNS.map((c) => (<div key={c.name} className="contents"><dt className="font-medium">{c.name}</dt><dd className="text-fg-secondary">{c.meaning}</dd></div>))}
            </dl>
            <p className="mt-3 text-xs text-fg-muted">Flag rules: one purchase priced 20 times off the others, or the paid average 20 times off the booked cost, means a wrong unit on a purchase. A booked cost more than 20% below what you pay reads Valued below what you pay; more than 25% above reads Valued above what you pay. Items with no booked cost yet are flagged until a receipt sets one.</p>
          </details>
        </CardBody>
      </Card>
    </>
  );
}
