"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { FileDown } from "lucide-react";
import { api } from "@/lib/api";
import type { KindStatement } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, isoDay } from "@/lib/dates";
import { exportTablePdf } from "@/lib/pdf";
import { Cards, FilterBar, PageHeader } from "@/components/admin/page";
import { Button, EmptyRow, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { AccountCode, AccountLedgerPanel, AsOfPicker } from "./finance-widgets";

// SPEC Liabilities and Equity: one kind of the chart listed with balances as of a day, totals, and every account
// linked into the Combined Ledger panel. Equity also carries the period's profit as current earnings.
export function KindStatementPage({ icon, title, description, path, kindLabel }: { icon: LucideIcon; title: string; description: string; path: string; kindLabel: string }) {
  const [asOf, setAsOf] = useState(isoDay());
  const [ledgerFor, setLedgerFor] = useState<string | null>(null);
  const q = useQuery({ queryKey: [path, asOf], queryFn: () => api<KindStatement>(`/finance/${path}`, { query: { as_of: asOf } }) });
  const d = q.data;
  const hasEarnings = d?.current_earnings_minor !== undefined;
  const exportPdf = () => d && exportTablePdf({
    title, subtitle: `As of ${formatDate(asOf)}`,
    columns: [{ header: "Code", key: "code" }, { header: "Account", key: "name" }, { header: "Balance", key: "balance", align: "right" }],
    rows: [...d.rows.map((r) => ({ code: r.account.code, name: r.account.name, balance: formatMoney(r.balance_minor) })), ...(hasEarnings ? [{ code: "", name: "Current earnings", balance: formatMoney(d.current_earnings_minor) }] : [])],
    footer: [`Total ${kindLabel}: ${formatMoney(d.total_minor)}`, ...(hasEarnings ? [`Total with current earnings: ${formatMoney(d.total_with_earnings_minor)}`] : [])],
    filename: `${path}-${asOf}.pdf`,
  });
  return (
    <>
      <PageHeader icon={icon} title={title} description={description} actions={<Button variant="secondary" onClick={exportPdf} disabled={!d}><FileDown className="h-4 w-4" /> Export PDF</Button>} />
      <FilterBar><AsOfPicker value={asOf} onChange={setAsOf} /><Link href="/admin/finance/balance-sheet" className="text-sm text-primary hover:underline">Balance sheet</Link></FilterBar>
      {q.isLoading || !d ? <Loading /> : (
        <>
          <Cards>
            <SummaryCard label={`Total ${kindLabel}`} value={formatMoney(d.total_minor)} sub={`${d.rows.length} accounts as of ${formatDate(asOf)}`} tone="primary" />
            {hasEarnings ? <SummaryCard label="Current earnings" value={formatMoney(d.current_earnings_minor)} sub="Income less expenses to date" tone={(d.current_earnings_minor ?? 0) < 0 ? "danger" : "success"} /> : null}
            {hasEarnings ? <SummaryCard label="Total with earnings" value={formatMoney(d.total_with_earnings_minor)} tone="neutral" /> : null}
          </Cards>
          <Table>
            <THead><tr><TH>Code</TH><TH>Account</TH><TH>Normal side</TH><TH right>Balance</TH></tr></THead>
            <TBody>
              {d.rows.length ? d.rows.map((r) => (
                <TR key={r.account.id}>
                  <TD><AccountCode account={r.account} onOpen={setLedgerFor} /></TD>
                  <TD>{r.account.name}</TD>
                  <TD className="capitalize text-fg-secondary">{r.account.normal_side}</TD>
                  <TD right className={r.balance_minor < 0 ? "text-danger" : ""}>{formatMoney(r.balance_minor)}</TD>
                </TR>
              )) : <EmptyRow colSpan={4}>No {kindLabel.toLowerCase()} accounts</EmptyRow>}
              {hasEarnings ? <TR className="bg-muted/40"><TD></TD><TD className="font-medium">Current earnings</TD><TD className="text-fg-secondary">income less expenses</TD><TD right className="font-medium">{formatMoney(d.current_earnings_minor)}</TD></TR> : null}
              <tr className="border-t font-semibold"><td className="h-12 px-4" colSpan={3}>Total {kindLabel}{hasEarnings ? " with current earnings" : ""}</td><td className="h-12 px-4 text-right tabular">{formatMoney(hasEarnings ? d.total_with_earnings_minor : d.total_minor)}</td></tr>
            </TBody>
          </Table>
          <p className="mt-3 text-xs text-fg-muted">Click an account code to open its ledger. The same panel is available on the <Link href="/admin/finance/combined-ledger" className="text-primary hover:underline">Combined Ledger</Link>.</p>
        </>
      )}
      <AccountLedgerPanel accountId={ledgerFor} onClose={() => setLedgerFor(null)} />
    </>
  );
}
