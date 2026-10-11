"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, Scale } from "lucide-react";
import { api } from "@/lib/api";
import type { BalanceLine, BalanceSheet } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, isoDay } from "@/lib/dates";
import { exportTablePdf } from "@/lib/pdf";
import { FilterBar, PageHeader } from "@/components/admin/page";
import { Button, Card, CardBody, CardHeader, CardTitle, Loading } from "@/components/ui";
import { balanceSheetBalanced } from "@/components/admin/finance-helpers";
import { AccountCode, AccountLedgerPanel, AsOfPicker, BalancedBadge } from "@/components/admin/finance-widgets";

// SPEC Balance Sheet: assets against liabilities and equity as of a day, with the period's profit carried into
// equity as current earnings so the two sides agree.
export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState(isoDay());
  const [ledgerFor, setLedgerFor] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["balance_sheet", asOf], queryFn: () => api<BalanceSheet>("/finance/balance_sheet", { query: { as_of: asOf } }) });
  const d = q.data;
  const balanced = d ? balanceSheetBalanced(d) : undefined;
  const exportPdf = () => d && exportTablePdf({
    title: "Balance Sheet", subtitle: `As of ${formatDate(asOf)} · ${balanced ? "Balanced" : "Out of balance"}`,
    columns: [{ header: "Section", key: "section" }, { header: "Code", key: "code" }, { header: "Account", key: "name" }, { header: "Balance", key: "balance", align: "right" }],
    rows: [
      ...d.assets.map((r) => ({ section: "Assets", code: r.account.code, name: r.account.name, balance: formatMoney(r.balance_minor) })),
      { section: "Assets", code: "", name: "Total assets", balance: formatMoney(d.total_assets_minor) },
      ...d.liabilities.map((r) => ({ section: "Liabilities", code: r.account.code, name: r.account.name, balance: formatMoney(r.balance_minor) })),
      { section: "Liabilities", code: "", name: "Total liabilities", balance: formatMoney(d.total_liabilities_minor) },
      ...d.equity.map((r) => ({ section: "Equity", code: r.account.code, name: r.account.name, balance: formatMoney(r.balance_minor) })),
      { section: "Equity", code: "", name: "Current earnings", balance: formatMoney(d.current_earnings_minor) },
      { section: "Equity", code: "", name: "Total equity", balance: formatMoney(d.total_equity_minor) },
    ],
    footer: [`Assets ${formatMoney(d.total_assets_minor)} = Liabilities ${formatMoney(d.total_liabilities_minor)} + Equity ${formatMoney(d.total_equity_minor)}`],
    filename: `balance-sheet-${asOf}.pdf`,
  });
  return (
    <>
      <PageHeader icon={Scale} title="Balance sheet" description="Assets on one side, liabilities and equity on the other, as of a day." actions={<Button variant="secondary" onClick={exportPdf} disabled={!d}><FileDown className="h-4 w-4" /> Export PDF</Button>} />
      <FilterBar><AsOfPicker value={asOf} onChange={setAsOf} /><BalancedBadge balanced={balanced} /></FilterBar>
      {q.isLoading || !d ? <Loading /> : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Section title="Assets" rows={d.assets} total={d.total_assets_minor} totalLabel="Total assets" onOpen={setLedgerFor} />
            <Section title="Liabilities" rows={d.liabilities} total={d.total_liabilities_minor} totalLabel="Total liabilities" onOpen={setLedgerFor} />
            <Section title="Equity" rows={d.equity} total={d.total_equity_minor} totalLabel="Total equity" onOpen={setLedgerFor}
              extra={<Line label="Current earnings" sub={`Income ${formatMoney(d.income_minor)} less expenses ${formatMoney(d.expenses_minor)}`} value={d.current_earnings_minor} />} />
          </div>
          <Card className="mt-4">
            <CardBody className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="tabular">Assets <span className="font-semibold">{formatMoney(d.total_assets_minor)}</span> = Liabilities <span className="font-semibold">{formatMoney(d.total_liabilities_minor)}</span> + Equity <span className="font-semibold">{formatMoney(d.total_equity_minor)}</span></span>
              <span className="flex items-center gap-2"><BalancedBadge balanced={balanced} />{!balanced ? <span className="text-xs text-fg-muted">Difference {formatMoney(d.total_assets_minor - d.total_liabilities_minor - d.total_equity_minor)}</span> : null}</span>
            </CardBody>
          </Card>
        </>
      )}
      <AccountLedgerPanel accountId={ledgerFor} onClose={() => setLedgerFor(null)} />
    </>
  );
}

function Line({ label, sub, value, code }: { label: React.ReactNode; sub?: string; value: number; code?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="min-w-0">{code ? <span className="mr-2">{code}</span> : null}<span>{label}</span>{sub ? <span className="block text-xs text-fg-muted">{sub}</span> : null}</span>
      <span className={`shrink-0 font-medium tabular ${value < 0 ? "text-danger" : ""}`}>{formatMoney(value)}</span>
    </div>
  );
}

function Section({ title, rows, total, totalLabel, extra, onOpen }: { title: string; rows: BalanceLine[]; total: number; totalLabel: string; extra?: React.ReactNode; onOpen: (id: string) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><span className="text-sm text-fg-secondary">{rows.length} accounts</span></CardHeader>
      <CardBody className="divide-y">
        {rows.length ? rows.map((r) => <Line key={r.account.id} code={<AccountCode account={r.account} onOpen={onOpen} />} label={r.account.name} value={r.balance_minor} />) : <p className="py-2 text-sm text-fg-muted">Nothing on this side yet</p>}
        {extra}
        <div className="flex items-center justify-between pt-2 text-sm font-semibold"><span>{totalLabel}</span><span className="tabular">{formatMoney(total)}</span></div>
      </CardBody>
    </Card>
  );
}
