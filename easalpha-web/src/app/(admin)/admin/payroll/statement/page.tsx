"use client";
// Employee Statement: one employee's account with the business for a period. Monthly salary earned (after deductions)
// and wages are credits; salary and wages paid and advances given are debits. The running balance starts from what
// was brought forward: above zero is still owed to the employee, below zero the employee owes (advances). PDF, CSV and
// Send on WhatsApp. ?employee_id= opens it on an employee so other screens can link here.
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileText, MessageCircle, ScrollText } from "lucide-react";
import { api, errorCode, errorMessage } from "@/lib/api";
import type { EmployeeStatement } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { downloadCsv } from "@/lib/csv";
import { exportTablePdf } from "@/lib/pdf";
import { businessDayFor } from "@/lib/business-day";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import { Cards, FilterBar, PageHeader } from "@/components/admin/page";
import { PayrollGuard, useWageEmployees } from "@/components/admin/payroll-shared";
import {
  balanceNote, balanceWording, dateText, payTypeLabel, periodLabel, rateLabel, STATEMENT_COLUMNS, STATEMENT_PRESETS, statementExportRows, statementKindLabel, statementKindVariant,
  type StatementPreset, statementRange,
} from "@/components/admin/wages-helpers";
import { Badge, Button, EmptyState, ErrorState, Input, Loading, Select, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

const WAGE_PERMS = ["payroll.manage", "PAYROLL", "wages.pay"];

export default function EmployeeStatementPage() {
  return <PayrollGuard perms={WAGE_PERMS}><Suspense fallback={<Loading />}><StatementView /></Suspense></PayrollGuard>;
}

function useBusinessToday() {
  const dayEnd = useAuthStore((s) => s.session?.branch?.day_end_time ?? null);
  return businessDayFor(dayEnd);
}

interface Option { id: string; name: string; detail: string }

/** GET /wages/employees: payroll managers see everyone; a user who may only pay wages sees daily and weekly staff. */
function useEmployeeOptions(): { options: Option[]; partial: boolean } {
  const q = useWageEmployees();
  if (!q.data) return { options: [], partial: false };
  return { options: q.data.data.map((e) => ({ id: e.id, name: e.name, detail: [e.designation, payTypeLabel(e.pay_frequency)].filter(Boolean).join(", ") })), partial: q.data.scope === "wage_staff" };
}

function BalanceCell({ minor, strong }: { minor: number; strong?: boolean }) {
  return (
    <TD right>
      <div className={strong ? "font-semibold" : "font-medium"}>{formatMoney(Math.abs(minor))}</div>
      <div className="text-xs font-normal text-fg-muted">{balanceNote(minor)}</div>
    </TD>
  );
}

function StatementView() {
  const params = useSearchParams();
  const router = useRouter();
  const employeeId = params.get("employee_id") ?? "";
  const today = useBusinessToday();
  const [preset, setPreset] = useState<StatementPreset>("this_month");
  const [custom, setCustom] = useState(() => statementRange("this_month", today));
  const range = preset === "custom" ? custom : statementRange(preset, today);
  const rangeOk = !!range.from && !!range.to && range.from <= range.to;
  const { options, partial } = useEmployeeOptions();
  const q = useQuery({
    queryKey: ["employee_statement", employeeId, range.from, range.to],
    queryFn: () => api<EmployeeStatement>(`/employees/${encodeURIComponent(employeeId)}/statement`, { query: { from: range.from, to: range.to } }),
    enabled: !!employeeId && rangeOk,
  });
  const s = q.data;
  const [sendError, setSendError] = useState<{ code: string; message: string } | null>(null);
  const send = useMutation({
    mutationFn: () => api<{ sent: number; to: string[] }>(`/employees/${encodeURIComponent(employeeId)}/send_statement`, { method: "POST", body: { from: range.from, to: range.to } }),
    onSuccess: (r) => { setSendError(null); toast.success("Statement sent on WhatsApp", r.to?.length ? `To ${r.to.join(", ")}` : undefined); },
    onError: (e) => {
      const code = errorCode(e);
      setSendError({ code, message: errorMessage(e) });
      toast.error(code === "whatsapp.no_phone" ? "No phone number" : code === "whatsapp.disabled" ? "WhatsApp is off" : "Could not send the statement", errorMessage(e));
    },
  });
  const choose = (id: string) => {
    setSendError(null);
    router.replace(id ? `/admin/payroll/statement?employee_id=${encodeURIComponent(id)}` : "/admin/payroll/statement", { scroll: false });
  };
  // Keep the open employee in the list even when the picker's source does not include them (archived, or partial list).
  const list = s && !options.some((o) => o.id === s.employee.id) ? [...options, { id: s.employee.id, name: s.employee.name, detail: payTypeLabel(s.employee.pay_frequency) }] : options;

  const fileBase = s ? `statement-${s.employee.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${s.from}-${s.to}` : "statement";
  const exportCsv = () => s && downloadCsv(fileBase, STATEMENT_COLUMNS, statementExportRows(s));
  const exportPdf = () => s && exportTablePdf({
    title: `Employee statement: ${s.employee.name}`,
    subtitle: [periodLabel(s.from, s.to), s.employee.designation, `${payTypeLabel(s.employee.pay_frequency)} ${rateLabel(s.employee.rate_minor, s.employee.pay_frequency)}`].filter(Boolean).join("  |  "),
    columns: STATEMENT_COLUMNS, rows: statementExportRows(s), filename: `${fileBase}.pdf`,
    footer: [
      `Earned ${formatMoney(s.totals.earned_minor)}  |  Paid ${formatMoney(s.totals.paid_minor)}  |  Advances given ${formatMoney(s.totals.advances_minor)}  |  Advance recovered ${formatMoney(s.totals.recovered_minor)}`,
      `Balance on ${dateText(s.to)}: ${balanceWording(s.closing_balance_minor).text}  |  Advances outstanding ${formatMoney(s.advances_outstanding_minor)}`,
    ],
  });
  const bw = balanceWording(s?.closing_balance_minor);

  return (
    <>
      <PageHeader icon={ScrollText} title="Employee Statement" description="What an employee earned, what they were paid and the advances they took, with the balance: owed to the employee or owed by them."
        actions={employeeId ? <>
          <Button variant="secondary" onClick={exportCsv} disabled={!s}><Download className="h-4 w-4" /> CSV</Button>
          <Button variant="secondary" onClick={exportPdf} disabled={!s}><FileText className="h-4 w-4" /> PDF</Button>
          <Button onClick={() => send.mutate()} loading={send.isPending} disabled={!s}><MessageCircle className="h-4 w-4" /> Send on WhatsApp</Button>
        </> : undefined} />
      <FilterBar>
        <Select className="w-auto min-w-56" value={employeeId} onChange={(e) => choose(e.target.value)} aria-label="Employee">
          <option value="">Choose an employee</option>
          {list.map((o) => <option key={o.id} value={o.id}>{o.name}{o.detail ? ` (${o.detail})` : ""}</option>)}
        </Select>
        <Select className="w-auto" value={preset} onChange={(e) => { const p = e.target.value as StatementPreset; if (p === "custom") setCustom(range); setPreset(p); }} aria-label="Period">
          {STATEMENT_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </Select>
        {preset === "custom" ? (
          <div className="flex items-center gap-2">
            <Input type="date" className="w-auto" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="From" />
            <span className="text-xs text-fg-muted">to</span>
            <Input type="date" className="w-auto" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="To" />
          </div>
        ) : <span className="text-sm text-fg-secondary">{periodLabel(range.from, range.to)}</span>}
        {!rangeOk ? <span className="text-xs text-danger">The end date is before the start date</span> : null}
        {partial ? <span className="text-xs text-fg-muted">Daily and weekly staff are listed. Salary statements need the Payroll permission.</span> : null}
      </FilterBar>
      {sendError ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-ink" role="alert">
          {sendError.code === "whatsapp.no_phone" ? (
            <><span>{s?.employee.name ?? "This employee"} has no phone number, so the statement cannot be sent. Add the phone on the Employees screen, then send again.</span><Link href="/admin/payroll/employees" className="font-medium underline">Open Employees</Link></>
          ) : sendError.code === "whatsapp.disabled" ? (
            <><span>WhatsApp sending is switched off, so nothing was sent. Turn it on in Settings, WhatsApp, then send again.</span><Link href="/admin/settings/whatsapp" className="font-medium underline">Open WhatsApp settings</Link></>
          ) : <span>Could not send the statement: {sendError.message}</span>}
        </div>
      ) : null}
      {!employeeId ? (
        <EmptyState icon={ScrollText} title="Choose an employee" hint="See what they earned, what they were paid and the advances they took, and whether money is owed to them or by them." />
      ) : !rangeOk ? null : q.isLoading ? <Loading /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : s ? (
        <>
          <p className="mb-4 text-sm text-fg-secondary">
            <span className="font-medium text-fg">{s.employee.name}</span>{s.employee.designation ? ` · ${s.employee.designation}` : ""} · {payTypeLabel(s.employee.pay_frequency)} {rateLabel(s.employee.rate_minor, s.employee.pay_frequency)} · {s.employee.phone ?? <span className="text-warning-ink">No phone number</span>}
          </p>
          <Cards>
            <SummaryCard label="Earned" value={formatMoney(s.totals.earned_minor)} sub="salary and wages, after deductions" tone="success" />
            <SummaryCard label="Paid" value={formatMoney(s.totals.paid_minor)} sub="salary and wages paid out" tone="primary" />
            <SummaryCard label="Advances given" value={formatMoney(s.totals.advances_minor)} sub="paid out in this period" tone="warning" />
            <SummaryCard label="Advance recovered" value={formatMoney(s.totals.recovered_minor)} sub="taken back from pay" tone="info" />
            <SummaryCard label="Balance" value={formatMoney(bw.amount_minor)} sub={`${bw.label} on ${dateText(s.to)}`} tone={bw.tone} />
            <SummaryCard label="Advances outstanding" value={formatMoney(s.advances_outstanding_minor)} sub="not yet recovered, all dates" tone={s.advances_outstanding_minor ? "danger" : "neutral"} />
          </Cards>
          <Table>
            <THead><tr><TH>Date</TH><TH>Entry</TH><TH>Detail</TH><TH>Ref</TH><TH right>Earned</TH><TH right>Paid / given</TH><TH right>Balance</TH></tr></THead>
            <TBody>
              <TR className="font-medium">
                <TD className="whitespace-nowrap">{dateText(s.from)}</TD><TD colSpan={5}>Brought forward</TD><BalanceCell minor={s.brought_forward_minor} />
              </TR>
              {s.entries.length ? s.entries.map((e, i) => (
                <TR key={`${e.kind}-${e.ref}-${i}`}>
                  <TD className="whitespace-nowrap text-fg-secondary">{dateText(e.date)}</TD>
                  <TD><span className="flex items-center gap-2 whitespace-nowrap"><Badge variant={statementKindVariant(e.kind)}>{statementKindLabel(e.kind)}</Badge>{e.label}</span></TD>
                  <TD className="text-fg-secondary">{e.detail ?? ""}</TD>
                  <TD className="whitespace-nowrap font-mono text-xs">{e.ref}</TD>
                  <TD right>{e.credit_minor ? formatMoney(e.credit_minor) : ""}</TD>
                  <TD right>{e.debit_minor ? formatMoney(e.debit_minor) : ""}</TD>
                  <BalanceCell minor={e.balance_minor} />
                </TR>
              )) : <tr><td colSpan={7} className="px-5 py-6 text-center text-sm text-fg-muted">No pay or advances in this period.</td></tr>}
              <TR className="font-medium">
                <TD className="whitespace-nowrap">{dateText(s.to)}</TD><TD colSpan={3}>Closing balance</TD>
                <TD right>{formatMoney(s.totals.earned_minor)}</TD><TD right>{formatMoney(s.totals.paid_minor + s.totals.advances_minor)}</TD>
                <BalanceCell minor={s.closing_balance_minor} strong />
              </TR>
            </TBody>
          </Table>
        </>
      ) : null}
    </>
  );
}
