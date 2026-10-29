"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator, FileDown } from "lucide-react";
import { api } from "@/lib/api";
import type { TrialBalance } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, isoDay } from "@/lib/dates";
import { exportTablePdf } from "@/lib/pdf";
import { DateRangePicker, FilterBar, PageHeader, type DateRange } from "@/components/admin/page";
import { Button, EmptyRow, Loading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { AccountCode, AccountLedgerPanel, BalancedBadge, KindBadge } from "@/components/admin/finance-widgets";

// SPEC Trial Balance: every posting account's opening, period and closing balances split into debit and credit
// columns; the period debits must equal the period credits.
const monthStart = () => { const d = new Date(); return isoDay(new Date(d.getFullYear(), d.getMonth(), 1)); };
const cell = (v: number) => (v ? formatMoney(v) : "");

export default function TrialBalancePage() {
  const [range, setRange] = useState<DateRange>({ from: monthStart(), to: isoDay() });
  const [ledgerFor, setLedgerFor] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["trial_balance", range], queryFn: () => api<TrialBalance>("/finance/trial_balance", { query: { from: range.from, to: range.to } }) });
  const d = q.data;
  const exportPdf = () => d && exportTablePdf({
    title: "Trial Balance", subtitle: `${formatDate(range.from)} to ${formatDate(range.to)} · ${d.balanced ? "Balanced" : "Out of balance"}`, landscape: true,
    columns: [{ header: "Code", key: "code" }, { header: "Account", key: "name" }, { header: "Opening Dr", key: "od", align: "right" }, { header: "Opening Cr", key: "oc", align: "right" }, { header: "Debit", key: "d", align: "right" }, { header: "Credit", key: "c", align: "right" }, { header: "Closing Dr", key: "cd", align: "right" }, { header: "Closing Cr", key: "cc", align: "right" }],
    rows: [
      ...d.rows.map((r) => ({ code: r.account.code, name: r.account.name, od: cell(r.opening_debit_minor), oc: cell(r.opening_credit_minor), d: cell(r.debit_minor), c: cell(r.credit_minor), cd: cell(r.closing_debit_minor), cc: cell(r.closing_credit_minor) })),
      { code: "", name: "Totals", od: formatMoney(d.totals.opening_debit_minor), oc: formatMoney(d.totals.opening_credit_minor), d: formatMoney(d.totals.debit_minor), c: formatMoney(d.totals.credit_minor), cd: formatMoney(d.totals.closing_debit_minor), cc: formatMoney(d.totals.closing_credit_minor) },
    ],
    filename: `trial-balance-${range.from}-${range.to}.pdf`,
  });
  return (
    <>
      <PageHeader icon={Calculator} title="Trial Balance" description="Opening, period and closing balances for every account with activity. Period debits must equal period credits." actions={<Button variant="secondary" onClick={exportPdf} disabled={!d}><FileDown className="h-4 w-4" /> Export PDF</Button>} />
      <FilterBar><DateRangePicker value={range} onChange={setRange} /><BalancedBadge balanced={d?.balanced} /></FilterBar>
      {q.isLoading || !d ? <Loading /> : (
        <Table>
          <THead>
            <tr><TH rowSpan={2}>Code</TH><TH rowSpan={2}>Account</TH><TH rowSpan={2}>Type</TH><TH colSpan={2} className="h-8 text-center">Opening</TH><TH colSpan={2} className="h-8 text-center">Period</TH><TH colSpan={2} className="h-8 text-center">Closing</TH></tr>
            <tr><TH right className="h-8">Dr</TH><TH right className="h-8">Cr</TH><TH right className="h-8">Dr</TH><TH right className="h-8">Cr</TH><TH right className="h-8">Dr</TH><TH right className="h-8">Cr</TH></tr>
          </THead>
          <TBody>
            {d.rows.length ? d.rows.map((r) => (
              <TR key={r.account.id}>
                <TD><AccountCode account={r.account} onOpen={setLedgerFor} /></TD>
                <TD>{r.account.name}</TD>
                <TD><KindBadge kind={r.account.kind} /></TD>
                <TD right>{cell(r.opening_debit_minor)}</TD><TD right>{cell(r.opening_credit_minor)}</TD>
                <TD right>{cell(r.debit_minor)}</TD><TD right>{cell(r.credit_minor)}</TD>
                <TD right>{cell(r.closing_debit_minor)}</TD><TD right>{cell(r.closing_credit_minor)}</TD>
              </TR>
            )) : <EmptyRow colSpan={9}>No postings in this range</EmptyRow>}
            <tr className="border-t bg-muted/40 font-semibold">
              <td className="h-12 px-4" colSpan={3}>Totals</td>
              <td className="h-12 px-4 text-right tabular">{formatMoney(d.totals.opening_debit_minor)}</td><td className="h-12 px-4 text-right tabular">{formatMoney(d.totals.opening_credit_minor)}</td>
              <td className="h-12 px-4 text-right tabular">{formatMoney(d.totals.debit_minor)}</td><td className="h-12 px-4 text-right tabular">{formatMoney(d.totals.credit_minor)}</td>
              <td className="h-12 px-4 text-right tabular">{formatMoney(d.totals.closing_debit_minor)}</td><td className="h-12 px-4 text-right tabular">{formatMoney(d.totals.closing_credit_minor)}</td>
            </tr>
          </TBody>
        </Table>
      )}
      <AccountLedgerPanel accountId={ledgerFor} onClose={() => setLedgerFor(null)} range={range} />
    </>
  );
}
