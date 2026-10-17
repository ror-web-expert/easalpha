"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PiggyBank } from "lucide-react";
import { api } from "@/lib/api";
import type { AgingReport } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { isoDay } from "@/lib/dates";
import { Cards, FilterBar, PageHeader } from "@/components/admin/page";
import { EmptyRow, Input, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function AgingPage() {
  const [asOf, setAsOf] = useState(isoDay());
  const q = useQuery({ queryKey: ["aging", asOf], queryFn: () => api<AgingReport>("/customers/aging", { query: { as_of: asOf } }) });
  const t = q.data?.totals;
  return (
    <>
      <PageHeader icon={PiggyBank} title="Khata aging" description="Who owes what and for how long. Payments settle the oldest charges first." />
      <FilterBar><Input type="date" className="w-auto" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></FilterBar>
      <Cards>
        <SummaryCard label="Total due" value={formatMoney(t?.total)} sub={`${q.data?.customers_with_due ?? 0} customers`} tone="danger" />
        <SummaryCard label="Current (0–30)" value={formatMoney(t?.current)} tone="success" />
        <SummaryCard label="31–60 days" value={formatMoney(t?.["31_60"])} tone="warning" />
        <SummaryCard label="61–90 days" value={formatMoney(t?.["61_90"])} tone="warning" />
        <SummaryCard label="Over 90" value={formatMoney(t?.over_90)} tone="danger" />
      </Cards>
      {q.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Customer</TH><TH>Phone</TH><TH right>Current</TH><TH right>31–60</TH><TH right>61–90</TH><TH right>90+</TH><TH right>Total</TH></tr></THead>
          <TBody>
            {q.data?.rows.length ? q.data.rows.map(({ customer: c, aging: a }) => (
              <TR key={c.id}>
                <TD><Link href={`/admin/customers/${c.id}`} className="font-medium text-primary hover:underline">{c.name}</Link></TD>
                <TD className="text-fg-secondary">{c.phone}</TD>
                <TD right>{formatMoney(a.current)}</TD><TD right>{formatMoney(a["31_60"])}</TD><TD right>{formatMoney(a["61_90"])}</TD>
                <TD right className={a.over_90 ? "text-danger" : ""}>{formatMoney(a.over_90)}</TD>
                <TD right className="font-medium">{formatMoney(a.total)}</TD>
              </TR>
            )) : <EmptyRow colSpan={7}>Nobody owes anything.</EmptyRow>}
          </TBody>
        </Table>
      )}
    </>
  );
}
