"use client";
// SPEC Payroll > Ledger: every payslip per employee across runs, for a month range, with totals and PDF export.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText } from "lucide-react";
import { api } from "@/lib/api";
import type { PayrollLedger } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { exportTablePdf } from "@/lib/pdf";
import { Cards, FilterBar, PageHeader } from "@/components/admin/page";
import { EmployeeSelect, MonthPicker, PayrollGuard, RunBadge } from "@/components/admin/payroll-shared";
import { monthKey, monthLabel, PAYSLIP_PDF_COLUMNS, payslipPdfRow, shiftMonth } from "@/components/admin/payroll-helpers";
import { PayslipDetailPanel } from "@/components/admin/payroll-run";
import { Button, Dialog, EmptyRow, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function PayrollLedgerPage() {
  const [employee, setEmployee] = useState("");
  const [to, setTo] = useState(monthKey());
  const [from, setFrom] = useState(shiftMonth(monthKey(), -11));
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["payroll_ledger", employee, from, to], queryFn: () => api<PayrollLedger>("/payroll/ledger", { query: { employee_id: employee, from, to } }) });
  const rows = q.data?.data ?? [];
  const t = q.data?.totals;
  const exportPdf = () => exportTablePdf({
    title: "Payroll ledger", subtitle: `${monthLabel(from)} to ${monthLabel(to)}${employee ? `  |  ${rows[0]?.employee_name ?? "one employee"}` : "  |  All employees"}`,
    columns: [{ header: "Month", key: "month" }, { header: "Run", key: "run" }, ...PAYSLIP_PDF_COLUMNS],
    rows: rows.map((p) => payslipPdfRow(p, { month: monthLabel(p.month), run: `${p.run_label} (${p.run_status})` })),
    footer: t ? [`Gross ${formatMoney(t.gross_minor)}  |  Deductions ${formatMoney(t.deductions_minor)}  |  Net ${formatMoney(t.net_minor)}  |  ${rows.length} payslips`] : undefined,
    filename: `payroll-ledger-${from}-${to}.pdf`, landscape: true,
  });
  const selected = rows.find((p) => p.id === open) ?? null;
  return (
    <PayrollGuard perms={["payroll.manage", "PAYROLL"]}>
      <PageHeader icon={BookOpen} title="Payroll ledger" description="Payslips across runs, one row per employee per month. Open a row for the full breakdown." actions={<Button variant="secondary" onClick={exportPdf} disabled={!rows.length}><FileText className="h-4 w-4" /> Export PDF</Button>} />
      <FilterBar>
        <EmployeeSelect value={employee} onChange={setEmployee} allLabel="All employees" />
        <span className="text-xs text-fg-muted">From</span><MonthPicker value={from} onChange={(v) => { setFrom(v); if (v > to) setTo(v); }} />
        <span className="text-xs text-fg-muted">to</span><MonthPicker value={to} onChange={(v) => { setTo(v); if (v < from) setFrom(v); }} />
      </FilterBar>
      <Cards className="lg:grid-cols-3 xl:grid-cols-3">
        <SummaryCard label="Gross" value={formatMoney(t?.gross_minor)} sub={`${rows.length} payslips`} tone="primary" />
        <SummaryCard label="Deductions" value={formatMoney(t?.deductions_minor)} sub="components, absence, fines and advances" tone="warning" />
        <SummaryCard label="Net" value={formatMoney(t?.net_minor)} tone="success" />
      </Cards>
      {q.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Month</TH><TH>Run</TH><TH>Employee</TH><TH right>Base</TH><TH right>Earnings</TH><TH right>Deductions</TH><TH right>Absence</TH><TH right>Fines</TH><TH right>Advances</TH><TH right>Net</TH></tr></THead>
          <TBody>
            {rows.length ? rows.map((p) => (
              <TR key={p.id} onClick={() => setOpen(p.id)}>
                <TD>{monthLabel(p.month)}</TD>
                <TD><span className="inline-flex items-center gap-2">{p.run_label} <RunBadge status={p.run_status} /></span></TD>
                <TD className="font-medium">{p.employee_name}<div className="text-xs text-fg-muted">{p.designation}</div></TD>
                <TD right>{formatMoney(p.base_minor)}</TD><TD right>{formatMoney(p.earnings_minor)}</TD><TD right>{formatMoney(p.deductions_minor)}</TD><TD right>{formatMoney(p.absence_minor)}</TD><TD right>{formatMoney(p.late_fines_minor)}</TD><TD right>{formatMoney(p.advances_recovered_minor)}</TD>
                <TD right className="font-medium">{formatMoney(p.net_minor)}</TD>
              </TR>
            )) : <EmptyRow colSpan={10}>No payslips for this range.</EmptyRow>}
            {t && rows.length ? <TR className="font-medium"><TD colSpan={3}>Totals</TD><TD right colSpan={2}>{formatMoney(t.gross_minor)}</TD><TD right colSpan={4}>{formatMoney(t.deductions_minor)}</TD><TD right>{formatMoney(t.net_minor)}</TD></TR> : null}
          </TBody>
        </Table>
      )}
      <Dialog open={!!selected} onClose={() => setOpen(null)} title={selected ? `${selected.employee_name}: ${selected.run_label}` : ""} description={selected ? `${monthLabel(selected.month)} payslip` : undefined} size="lg">
        {selected ? <PayslipDetailPanel payslip={selected} /> : null}
      </Dialog>
    </PayrollGuard>
  );
}
