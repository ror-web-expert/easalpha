"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, Gauge, Landmark } from "lucide-react";
import { api } from "@/lib/api";
import type { FinanceDashboard } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime, isoDay } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { Cards, FilterBar, PageHeader } from "@/components/admin/page";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyRow, ErrorState, Input, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

// SPEC Finance Dashboard: total balance across accounts, Today In and Today Out, counts of the four movement sources,
// then recent activity with the account balance after each line.
export default function FinanceDashboardPage() {
  const [day, setDay] = useState(isoDay());
  const q = useQuery({ queryKey: ["finance_dashboard", day], queryFn: () => api<FinanceDashboard>("/finance/dashboard", { query: { business_day: day } }) });
  const d = q.data;
  return (
    <>
      <PageHeader icon={Gauge} title="Finance dashboard" description="Money across every payment account. Every order, expense, supplier payment and transfer posts here." />
      <FilterBar>
        <label className="flex items-center gap-2 text-sm text-fg-secondary">Business day<Input type="date" className="w-auto" value={day} max={isoDay()} onChange={(e) => setDay(e.target.value || isoDay())} aria-label="Business day" /></label>
        {day !== isoDay() ? <Button variant="ghost" size="sm" onClick={() => setDay(isoDay())}>Today</Button> : null}
      </FilterBar>
      {q.isLoading ? <Loading /> : q.isError || !d ? <ErrorState message="Could not load the dashboard" onRetry={() => q.refetch()} /> : (
        <>
          <Cards className="lg:grid-cols-3 xl:grid-cols-3">
            <SummaryCard label="Total balance" value={formatMoney(d.total_balance_minor)} sub={`${d.accounts.length} active accounts`} icon={Landmark} tone="primary" />
            <SummaryCard label="Today In" value={formatMoney(d.today_in_minor)} sub={formatDate(d.business_day)} icon={ArrowDownToLine} tone="success" />
            <SummaryCard label="Today Out" value={formatMoney(d.today_out_minor)} sub={formatDate(d.business_day)} icon={ArrowUpFromLine} tone="danger" />
          </Cards>
          <Cards>
            <SummaryCard label="Orders" value={d.counts.orders} sub="Payments and refunds" tone="neutral" />
            <SummaryCard label="Expenses" value={d.counts.expenses} sub="Paid out of an account" tone="neutral" />
            <SummaryCard label="Supplier payments" value={d.counts.supplier_payments} sub="Against purchase bills" tone="neutral" />
            <SummaryCard label="Transfers" value={d.counts.transfers} sub="Between accounts" tone="neutral" />
          </Cards>
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <Card>
              <CardHeader><CardTitle>Accounts</CardTitle><span className="text-sm text-fg-secondary tabular">{formatMoney(d.total_balance_minor)}</span></CardHeader>
              <CardBody className="space-y-1 p-2">
                {d.accounts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-md px-3 py-2 text-sm">
                    <span><span className="font-medium">{a.name}</span><span className="block text-xs text-fg-muted">{titleCase(a.kind)}</span></span>
                    <span className={`font-medium tabular ${a.balance_minor < 0 ? "text-danger" : ""}`}>{formatMoney(a.balance_minor)}</span>
                  </div>
                ))}
                {!d.accounts.length ? <p className="p-3 text-sm text-fg-muted">No active accounts.</p> : null}
              </CardBody>
            </Card>
            <Card>
              <CardHeader><CardTitle>Recent activity</CardTitle><span className="text-sm text-fg-secondary">Last {d.recent.length} movements</span></CardHeader>
              <Table className="rounded-none border-0">
                <THead><tr><TH>When</TH><TH>Account</TH><TH>Kind</TH><TH>Description</TH><TH right>Amount</TH><TH right>Balance after</TH></tr></THead>
                <TBody>
                  {d.recent.length ? d.recent.map((r) => (
                    <TR key={r.id}>
                      <TD className="whitespace-nowrap text-fg-secondary">{formatDateTime(r.at)}</TD>
                      <TD className="font-medium">{r.account}</TD>
                      <TD><Badge>{titleCase(r.kind)}</Badge></TD>
                      <TD className="max-w-[18rem] truncate" title={r.description ?? ""}>{r.description ?? "-"}</TD>
                      <TD right className={r.amount_minor < 0 ? "text-danger" : "text-success"}>{formatMoney(r.amount_minor)}</TD>
                      <TD right>{formatMoney(r.balance_after_minor)}</TD>
                    </TR>
                  )) : <EmptyRow colSpan={6}>No movements yet</EmptyRow>}
                </TBody>
              </Table>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
