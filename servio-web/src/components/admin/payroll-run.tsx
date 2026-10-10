"use client";
// Run Payroll pieces: the run detail panel (payslips table with an expandable breakdown, Sync to Expenses behind the
// manager PIN, Cancel, PDF) and the payslip breakdown used by the Ledger and the employee's Payslips tab too.
import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileText, Banknote, Ban } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { AttendanceCharges, ChargeableStatus, PayrollRunDetail, PayslipRow } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { exportTablePdf } from "@/lib/pdf";
import { useApproval } from "@/components/approval";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ConfirmDialog, Dialog, EmptyRow, Field, KeyValue, Loading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { toast } from "@/store/toast";
import { attendanceStatusLabel, formatMoneyExact, minutesLabel, monthLabel, PAYSLIP_PDF_COLUMNS, payslipPdfRow, payslipTotals, penaltyLabel } from "./payroll-helpers";
import { MethodSelect, RunBadge } from "./payroll-shared";

const CHARGE_ORDER: ChargeableStatus[] = ["late", "half_day", "absent"];

/** SPEC charges breakdown: per status the count, free allowance, charged, penalty, fine and lost days, then the cap. */
export function ChargesTable({ charges }: { charges: AttendanceCharges | null | undefined }) {
  if (!charges) return <p className="text-sm text-fg-muted">No charges were computed for this month.</p>;
  const capped = charges.fine_cap_minor != null && charges.fines_before_cap_minor > charges.fine_cap_minor;
  return (
    <div className="space-y-2">
      {!charges.rules_enabled ? <p className="text-xs text-fg-secondary">Rules were off for this employee: every scan recorded as Present and only absences cost a day.</p> : null}
      <Table>
        <THead><tr><TH>Status</TH><TH right>Count</TH><TH right>Free</TH><TH right>Charged</TH><TH>Penalty</TH><TH right>Fine</TH><TH right>Lost days</TH></tr></THead>
        <TBody>
          {CHARGE_ORDER.map((s) => {
            const d = charges.detail?.[s];
            if (!d) return null;
            return <TR key={s}><TD>{attendanceStatusLabel(s)}</TD><TD right>{d.count}</TD><TD right>{d.free}</TD><TD right className={d.charged ? "font-medium" : ""}>{d.charged}</TD><TD>{penaltyLabel(d.penalty)}</TD><TD right>{formatMoney(d.fine_minor)}</TD><TD right>{d.lost_days}</TD></TR>;
          })}
          <TR className="font-medium">
            <TD colSpan={5}>Total{capped ? <span className="ml-2 text-xs font-normal text-fg-secondary">fines {formatMoney(charges.fines_before_cap_minor)} capped at {formatMoney(charges.fine_cap_minor)}; lost days are never capped</span> : charges.fine_cap_minor != null ? <span className="ml-2 text-xs font-normal text-fg-secondary">cap {formatMoney(charges.fine_cap_minor)} not reached</span> : <span className="ml-2 text-xs font-normal text-fg-secondary">no fine cap</span>}</TD>
            <TD right>{formatMoney(charges.fines_minor)}</TD><TD right>{charges.lost_days}</TD>
          </TR>
        </TBody>
      </Table>
    </div>
  );
}

/** One payslip's breakdown: divisor, daily rate, lost days, overtime, components, charges per status and advances. */
export function PayslipDetailPanel({ payslip: p }: { payslip: PayslipRow }) {
  const d = p.detail ?? {};
  const att = d.attendance;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>How the pay was priced</CardTitle>{d.absent_rule ? <Badge variant="outline">{d.absent_rule === "fixed_26" ? `Fixed divisor ${d.divisor ?? ""}` : "Calendar days"}</Badge> : null}</CardHeader>
        <CardBody>
          <KeyValue items={[
            { label: "Divisor", value: d.divisor ?? "-" }, { label: "Daily rate", value: d.daily_rate_minor != null ? formatMoneyExact(d.daily_rate_minor) : "-" },
            { label: "Active days / month", value: d.active_days != null ? `${d.active_days} / ${d.days_in_month ?? "-"}` : "-" },
            { label: "Lost days (penalties)", value: d.lost_days ?? "-" }, { label: "Absence days priced", value: d.absence_days ?? "-" },
            { label: "Overtime", value: <>{formatMoney(d.overtime_minor ?? 0)}{att ? <span className="ml-1 text-xs text-fg-muted">({minutesLabel(att.overtime_minutes)})</span> : null}</> },
            { label: "Base", value: formatMoney(p.base_minor) }, { label: "Earnings", value: formatMoney(p.earnings_minor) }, { label: "Deductions", value: formatMoney(p.deductions_minor) },
            { label: "Absence", value: formatMoney(p.absence_minor) }, { label: "Fines", value: formatMoney(p.late_fines_minor) }, { label: "Advances recovered", value: formatMoney(p.advances_recovered_minor) },
            { label: "Tips", value: formatMoney(p.tips_minor) }, { label: "Commission", value: formatMoney(p.commission_minor) }, { label: "Net", value: <span className="text-base">{formatMoney(p.net_minor)}</span> },
          ]} />
        </CardBody>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Attendance</CardTitle>{att ? <span className="text-xs text-fg-secondary">{att.missing_punches} missing punches</span> : null}</CardHeader>
          <CardBody>
            {att ? <KeyValue items={[
              { label: "Present", value: att.present }, { label: "Late", value: att.late ?? att.late_days }, { label: "Half days", value: att.half_days }, { label: "Absent", value: att.absent },
              { label: "Leave", value: att.leave }, { label: "Unpaid leave", value: att.unpaid_leave }, { label: "Holiday", value: att.holiday }, { label: "Weekly off", value: att.weekly_off ?? 0 },
              { label: "Late minutes", value: minutesLabel(att.late_minutes) },
            ]} /> : <KeyValue items={[{ label: "Present", value: p.days_present }, { label: "Absent", value: p.days_absent }, { label: "Leave", value: p.days_leave }]} />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Components</CardTitle></CardHeader>
          <CardBody>
            {d.components?.length ? <KeyValue items={d.components.map((c) => ({ label: `${c.name} (${c.kind})`, value: formatMoney(c.amount_minor) }))} /> : <p className="text-sm text-fg-muted">No salary components.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Advances recovered</CardTitle></CardHeader>
          <CardBody>
            {d.advances?.length ? <KeyValue items={d.advances.map((a) => ({ label: a.advance, value: `${formatMoney(a.taken_minor)} (then ${formatMoney(a.outstanding_after_minor)} left)` }))} /> : <p className="text-sm text-fg-muted">No advances outstanding.</p>}
          </CardBody>
        </Card>
      </div>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Charges per status</CardTitle></CardHeader>
        <CardBody><ChargesTable charges={d.charges} /></CardBody>
      </Card>
    </div>
  );
}

export function useRun(id: string | null) {
  return useQuery({ queryKey: ["payroll_run", id], queryFn: () => api<PayrollRunDetail>(`/payroll/runs/${id}`), enabled: !!id });
}

/** The selected run: totals, actions and the payslip table. */
export function RunDetailPanel({ runId, onChanged }: { runId: string; onChanged?: () => void }) {
  const qc = useQueryClient();
  const q = useRun(runId);
  const [open, setOpen] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState("");
  const [paying, setPaying] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const { run: approve, dialog } = useApproval();
  const refresh = () => { qc.invalidateQueries({ queryKey: ["payroll_run", runId] }); ["payroll_runs", "payroll_overview", "payroll_ledger", "payroll_reports", "advances", "expenses", "accounts"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onChanged?.(); };
  const r = q.data;
  const pay = async () => {
    if (!r) return;
    setPaying(true);
    try {
      await approve((pin) => api(`/payroll/runs/${r.id}/pay`, { method: "POST", body: { method_code: method, approver_pin: pin } }), `Pay ${r.label} (${formatMoney(r.net_minor)}) as salary expenses`);
      toast.success("Payroll synced to Expenses", `${r.employees_count} salary expenses recorded from ${r.label}`);
      setPayOpen(false);
      refresh();
    } catch (e) { if (!(e instanceof ApiError && e.code === "approval.cancelled")) toast.error("Could not pay", errorMessage(e)); }
    finally { setPaying(false); }
  };
  const cancel = async () => {
    if (!r) return;
    setCancelling(true);
    try { await api(`/payroll/runs/${r.id}/cancel`, { method: "POST" }); toast.success(`${r.label} cancelled`); setCancelOpen(false); refresh(); }
    catch (e) { toast.error("Could not cancel", errorMessage(e)); }
    finally { setCancelling(false); }
  };
  if (q.isLoading || !r) return <Card><Loading /></Card>;
  const slips = r.payslips ?? [];
  const t = payslipTotals(slips);
  const exportPdf = () => exportTablePdf({
    title: `Payroll ${r.label}`, subtitle: `${monthLabel(r.month)}  |  ${r.status}  |  ${r.employees_count} employees`, columns: PAYSLIP_PDF_COLUMNS, rows: slips.map((p) => payslipPdfRow(p)),
    footer: [`Base ${formatMoney(t.base)}  |  Earnings ${formatMoney(t.earnings)}  |  Deductions ${formatMoney(t.deductions)}  |  Absence ${formatMoney(t.absence)}  |  Fines ${formatMoney(t.fines)}  |  Advances ${formatMoney(t.advances)}`, `Net payable ${formatMoney(t.net)}`],
    filename: `${r.label.toLowerCase()}.pdf`, landscape: true,
  });
  const payable = r.status === "generated" || r.status === "approved";
  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">{r.label} <RunBadge status={r.status} /></CardTitle>
          <p className="mt-0.5 text-xs text-fg-secondary">{monthLabel(r.month)} · {r.employees_count} employees · generated {formatDateTime(r.created_at)}{r.paid_at ? ` · paid ${formatDateTime(r.paid_at)}` : ""}{r.notes ? ` · ${r.notes}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={exportPdf} disabled={!slips.length}><FileText className="h-4 w-4" /> PDF</Button>
          {payable ? <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}><Ban className="h-4 w-4" /> Cancel</Button> : null}
          {payable ? <Button size="sm" onClick={() => setPayOpen(true)}><Banknote className="h-4 w-4" /> Sync to Expenses / Pay</Button> : null}
        </div>
      </CardHeader>
      <CardBody className="grid grid-cols-2 gap-3 border-b sm:grid-cols-4">
        <div><div className="text-xs text-fg-secondary">Gross</div><div className="text-lg tabular">{formatMoney(r.gross_minor)}</div></div>
        <div><div className="text-xs text-fg-secondary">Deductions</div><div className="text-lg tabular">{formatMoney(r.deductions_minor)}</div></div>
        <div><div className="text-xs text-fg-secondary">Net payable</div><div className="text-lg tabular font-medium">{formatMoney(r.net_minor)}</div></div>
        <div><div className="text-xs text-fg-secondary">Method snapshot</div><div className="text-sm">{r.settings_snapshot?.salary_method === "fixed_26" ? `Fixed divisor ${r.settings_snapshot?.fixed_divisor ?? ""}` : "Calendar days"}{r.settings_snapshot?.rules_enabled === false ? " · rules off" : ""}</div></div>
      </CardBody>
      <Table className="rounded-none border-0">
        <THead><tr><TH className="w-8" /><TH>Employee</TH><TH right>Base</TH><TH right>Earnings</TH><TH right>Deductions</TH><TH right>Absence</TH><TH right>Fines</TH><TH right>Advances</TH><TH right>Net</TH></tr></THead>
        <TBody>
          {slips.length ? slips.map((p) => (
            <Fragment key={p.id}>
              <TR onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>
                <TD>{open === p.id ? <ChevronDown className="h-4 w-4 text-fg-muted" /> : <ChevronRight className="h-4 w-4 text-fg-muted" />}</TD>
                <TD className="font-medium">{p.employee_name}<div className="text-xs font-normal text-fg-muted">{p.designation ?? ""}{p.paid_at ? ` · paid ${formatDateTime(p.paid_at)}` : ""}</div></TD>
                <TD right>{formatMoney(p.base_minor)}</TD><TD right>{formatMoney(p.earnings_minor)}</TD><TD right>{formatMoney(p.deductions_minor)}</TD><TD right>{formatMoney(p.absence_minor)}</TD><TD right>{formatMoney(p.late_fines_minor)}</TD><TD right>{formatMoney(p.advances_recovered_minor)}</TD>
                <TD right className="font-medium">{formatMoney(p.net_minor)}</TD>
              </TR>
              {open === p.id ? <tr className="border-t bg-muted/40"><td colSpan={9} className="p-4"><PayslipDetailPanel payslip={p} /></td></tr> : null}
            </Fragment>
          )) : <EmptyRow colSpan={9}>No payslips in this run.</EmptyRow>}
          {slips.length ? <TR className="font-medium"><TD /><TD>Total</TD><TD right>{formatMoney(t.base)}</TD><TD right>{formatMoney(t.earnings)}</TD><TD right>{formatMoney(t.deductions)}</TD><TD right>{formatMoney(t.absence)}</TD><TD right>{formatMoney(t.fines)}</TD><TD right>{formatMoney(t.advances)}</TD><TD right>{formatMoney(t.net)}</TD></TR> : null}
        </TBody>
      </Table>
      <Dialog open={payOpen} onClose={() => setPayOpen(false)} title="Sync to Expenses" description={`Pays every payslip in ${r.label} as a salary expense (${formatMoney(r.net_minor)} in total), closes the advances recovered and marks the run paid. A manager PIN is asked for.`} size="sm"
        footer={<><Button variant="secondary" onClick={() => setPayOpen(false)}>Cancel</Button><Button onClick={pay} loading={paying}>Pay {formatMoney(r.net_minor)}</Button></>}>
        <Field label="Paid from"><MethodSelect value={method} onChange={setMethod} /></Field>
      </Dialog>
      <ConfirmDialog open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={cancel} title={`Cancel ${r.label}?`} description="The payslips are kept for reference but the month can be generated again. A paid run cannot be cancelled." confirmLabel="Cancel run" destructive loading={cancelling} />
      {dialog}
    </Card>
  );
}
