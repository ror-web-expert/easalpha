"use client";
// Pay Wages: daily staff for a day and weekly staff for the week holding it (Monday to Sunday), paid at day end.
// Days worked come from attendance when it is kept; the manager can change the days, the wage, a bonus, deductions and
// the advance to recover, then select rows and pay them in one go (POST /wages/batch pays each row on its own, so one
// problem does not stop the rest). Below: the wage payments for a date range with totals, CSV and void.
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, ChevronLeft, ChevronRight, Download, FileText, HandCoins, Undo2, Users } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { WagePayment, WagePreview } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { downloadCsv } from "@/lib/csv";
import { businessDayFor } from "@/lib/business-day";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import { Cards, type DateRange, DateRangePicker, FilterBar, PageHeader } from "@/components/admin/page";
import { useAction } from "@/components/admin/crud";
import { MethodSelect, PayrollGuard, usePayMethods, useWageEmployees, WageEmployeeSelect } from "@/components/admin/payroll-shared";
import {
  attendanceChips, capRecovery, chipText, dayLabel, daysText, dueState, hasErrors, isWageStaff, maxRecovery, payTypeLabel, periodLabel, rateLabel, resultsByEmployee, rowGross, shiftDay,
  validateWageRow, WAGE_HISTORY_COLUMNS, wageBatchRow, type WageBatchResult, wageHistoryRow, wageNet, type WageRow, wageRowFromPreview, wageStatusVariant, wageTotals, weekOf,
} from "@/components/admin/wages-helpers";
import { Badge, Button, Checkbox, Dialog, EmptyRow, EmptyState, ErrorState, Field, Input, Loading, MoneyInput, Select, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

const WAGE_PERMS = ["payroll.manage", "PAYROLL", "wages.pay"];
/** Everything a wage payment or a void moves. */
const KEYS = ["wages_due", "wages", "employee_statement", "advances", "expenses", "accounts", "payroll_overview"];

interface DueResponse { day: string; data: WagePreview[] }
interface BatchBody { day: string; method_code?: string; rows: ReturnType<typeof wageBatchRow>[] }
interface BatchResponse { day: string; results: WageBatchResult[]; paid: number; failed: number }
interface HistoryResponse { data: WagePayment[]; totals: { count: number; net_minor: number; gross_minor: number; advance_recovered_minor: number } }

/** The branch's business day: a payment at 1 am belongs to the day that is ending. */
function useBusinessToday() {
  const dayEnd = useAuthStore((s) => s.session?.branch?.day_end_time ?? null);
  return businessDayFor(dayEnd);
}

function useMethodName() {
  const methods = usePayMethods();
  return (code: string | null | undefined) => methods.find((m) => m.code === code)?.name ?? (code || "-");
}

const statementHref = (employeeId: string) => `/admin/payroll/statement?employee_id=${encodeURIComponent(employeeId)}`;

function DayPicker({ value, onChange, max }: { value: string; onChange: (d: string) => void; max: string }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" onClick={() => onChange(shiftDay(value, -1))} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Button>
      <Input type="date" className="w-auto" value={value} max={max} onChange={(e) => { if (e.target.value) onChange(e.target.value > max ? max : e.target.value); }} aria-label="Day" />
      <Button variant="ghost" size="icon-sm" onClick={() => onChange(shiftDay(value, 1))} disabled={value >= max} aria-label="Next day"><ChevronRight className="h-4 w-4" /></Button>
      {value !== max ? <Button variant="ghost" size="sm" onClick={() => onChange(max)}>Today</Button> : null}
    </div>
  );
}

export default function PayWagesPage() {
  const today = useBusinessToday();
  const [voidFor, setVoidFor] = useState<WagePayment | null>(null);
  const [reason, setReason] = useState("");
  const voidWage = useAction<{ id: string; reason: string }>(KEYS, ({ id, reason: r }) => api(`/wages/${id}/void`, { method: "POST", body: { reason: r } }), "Wage voided");
  const openVoid = (w: WagePayment) => { setReason(""); setVoidFor(w); };
  return (
    <PayrollGuard perms={WAGE_PERMS}>
      <PageHeader icon={HandCoins} title="Pay Wages" description="Daily staff are paid for the day and weekly staff once for the week (Monday to Sunday). Each wage is a Wages expense from the drawer or an account." />
      <DueSection today={today} onVoid={openVoid} />
      <HistorySection today={today} onVoid={openVoid} />
      <Dialog open={!!voidFor} onClose={() => setVoidFor(null)} title={voidFor ? `Void ${voidFor.label}?` : ""} size="sm"
        description={voidFor ? `${formatMoney(voidFor.net_minor)} to ${voidFor.employee_name ?? "the employee"} for ${periodLabel(voidFor.period_from, voidFor.period_to)}. The Wages expense is reversed${voidFor.advance_recovered_minor ? ` and ${formatMoney(voidFor.advance_recovered_minor)} goes back on the advance they owe` : ""}. The payment stays in the list as voided and the period can be paid again.` : undefined}
        footer={<><Button variant="secondary" onClick={() => setVoidFor(null)}>Cancel</Button><Button variant="destructive" loading={voidWage.isPending} disabled={!reason.trim()} onClick={() => voidFor && voidWage.mutate({ id: voidFor.id, reason: reason.trim() }, { onSuccess: () => setVoidFor(null) })}>Void wage</Button></>}>
        <Field label="Reason" hint="Kept with the payment and in the audit log"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Paid twice, wrong amount" autoFocus /></Field>
      </Dialog>
    </PayrollGuard>
  );
}

interface RowView { p: WagePreview; key: string; state: ReturnType<typeof dueState>; row: WageRow; gross: number; net: number; errors: ReturnType<typeof validateWageRow>; selected: boolean }

function DueSection({ today, onVoid }: { today: string; onVoid: (w: WagePayment) => void }) {
  const qc = useQueryClient();
  const [day, setDay] = useState(today);
  const due = useQuery({ queryKey: ["wages_due", day], queryFn: () => api<DueResponse>("/wages/due", { query: { day } }) });
  const [edits, setEdits] = useState<Record<string, WageRow>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<{ day: string; map: Record<string, WageBatchResult> } | null>(null);
  const [method, setMethod] = useState("");
  const [confirm, setConfirm] = useState(false);
  const methodName = useMethodName();
  const list = due.data?.data ?? [];
  // Tells "no daily or weekly staff" apart from "none due on this day" (GET /wages/employees works for wages.pay too).
  const staff = useWageEmployees();
  const wageStaffCount = staff.data ? staff.data.data.filter((e) => isWageStaff(e.pay_frequency)).length : null;

  const keyOf = (p: WagePreview) => `${p.employee_id}:${p.from}:${p.to}`;
  const setRow = (p: WagePreview, patch: Partial<WageRow>) => setEdits((e) => ({ ...e, [keyOf(p)]: { ...(e[keyOf(p)] ?? wageRowFromPreview(p)), ...patch } }));
  const toggle = (k: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(k); else n.delete(k); return n; });
  const changeDay = (d: string) => { setDay(d); setSelected(new Set()); };

  const view: RowView[] = list.map((p) => {
    const key = keyOf(p);
    const state = dueState(p);
    const row = edits[key] ?? wageRowFromPreview(p);
    const gross = rowGross(row, p);
    return { p, key, state, row, gross, net: wageNet({ ...row, gross_minor: gross }), errors: state === "due" ? validateWageRow(row, p) : {}, selected: state === "due" && selected.has(key) };
  });
  const dueRows = view.filter((v) => v.state === "due");
  const paidRows = view.filter((v) => v.state === "paid");
  const chosen = dueRows.filter((v) => v.selected);
  const invalid = chosen.filter((v) => hasErrors(v.errors));
  const chosenTotal = chosen.reduce((s, v) => s + v.net, 0);
  const allSelected = dueRows.length > 0 && dueRows.every((v) => v.selected);
  const resultMap = results?.day === day ? results.map : {};
  const week = weekOf(day);

  const pay = useMutation({
    mutationFn: (body: BatchBody) => api<BatchResponse>("/wages/batch", { method: "POST", body }),
    onSuccess: (r, body) => {
      const okIds = new Set(r.results.filter((x) => x.ok).map((x) => x.employee_id));
      const paidNet = r.results.reduce((s, x) => s + (x.ok ? x.wage?.net_minor ?? 0 : 0), 0);
      setResults({ day: body.day, map: resultsByEmployee(r.results) });
      setSelected((s) => new Set([...s].filter((k) => !okIds.has(k.split(":")[0]))));
      setConfirm(false);
      KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      if (!r.failed) toast.success(`${r.paid} ${r.paid === 1 ? "wage" : "wages"} paid`, `${formatMoney(paidNet)} recorded as Wages expenses`);
      else if (!r.paid) toast.error("Nothing was paid", "The reason is shown on each row.");
      else toast.error(`${r.paid} paid, ${r.failed} not paid`, "The reason is shown on each row that was not paid.");
    },
    onError: (e) => toast.error("Could not pay wages", errorMessage(e)),
  });
  const payChosen = () => pay.mutate({ day, method_code: method || undefined, rows: chosen.map((v) => wageBatchRow(v.p.employee_id, v.row)) });

  return (
    <>
      <FilterBar>
        <DayPicker value={day} onChange={changeDay} max={today} />
        <span className="text-sm text-fg-secondary">Daily staff for {dayLabel(day)}; weekly staff for {periodLabel(week.from, week.to)}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs text-fg-muted">Paid from</span>
          <MethodSelect value={method} onChange={setMethod} className="w-auto" />
          <Button onClick={() => setConfirm(true)} disabled={!chosen.length || invalid.length > 0} title={invalid.length ? "Fix the rows marked in red first" : !chosen.length ? "Tick the rows to pay" : undefined}>
            <Banknote className="h-4 w-4" /> Pay selected{chosen.length ? ` (${chosen.length})` : ""}
          </Button>
        </div>
      </FilterBar>
      {invalid.length ? <p className="-mt-2 mb-3 text-right text-xs text-danger">{invalid.length} selected {invalid.length === 1 ? "row needs" : "rows need"} fixing before paying.</p> : null}
      {due.isLoading ? <Loading /> : due.isError ? <ErrorState message={errorMessage(due.error)} onRetry={() => due.refetch()} /> : !list.length ? (
        wageStaffCount ? (
          <EmptyState icon={Users} title={`No one is due for ${dayLabel(day)}`} hint="Daily and weekly staff show here from the day they join until the day they leave." className="mb-6" />
        ) : (
          <EmptyState icon={HandCoins} title="No daily or weekly staff" className="mb-6"
            hint="Pay Wages is for staff paid by the day or the week. Open Employees, edit an employee and set Pay to Daily wage or Weekly wage, with the wage per day or per week. Monthly staff are paid from Run Payroll."
            action={<Link href="/admin/payroll/employees"><Button variant="secondary">Open Employees</Button></Link>} />
        )
      ) : (
        <>
          <Cards>
            <SummaryCard label="Due" value={dueRows.length} sub={`${formatMoney(dueRows.reduce((s, v) => s + v.net, 0))} as set below`} tone={dueRows.length ? "warning" : "neutral"} />
            <SummaryCard label="Paid" value={paidRows.length} sub={`${formatMoney(paidRows.reduce((s, v) => s + (v.p.paid?.net_minor ?? 0), 0))} for these days and weeks`} tone="success" />
            <SummaryCard label="Selected" value={formatMoney(chosenTotal)} sub={`${chosen.length} of ${dueRows.length} due`} tone="primary" />
            <SummaryCard label="Advances outstanding" value={formatMoney(list.reduce((s, p) => s + p.advances_outstanding_minor, 0))} sub="can be recovered from these wages" tone="info" />
          </Cards>
          <Table>
            <THead>
              <tr>
                <TH className="w-10"><Checkbox aria-label="Select every due row" checked={allSelected} disabled={!dueRows.length} onChange={(e) => setSelected(e.target.checked ? new Set(dueRows.map((v) => v.key)) : new Set())} /></TH>
                <TH>Employee</TH><TH>Attendance</TH><TH>Days</TH><TH right>Wage</TH><TH right>Bonus</TH><TH right>Deductions</TH><TH right>Advance recovery</TH><TH right>Net</TH><TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {view.map((v) => <DueRow key={v.key} v={v} result={resultMap[v.p.employee_id]} onToggle={(on) => toggle(v.key, on)} onChange={(patch) => setRow(v.p, patch)} onVoid={onVoid} methodName={methodName} />)}
            </TBody>
          </Table>
        </>
      )}
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={`Pay ${chosen.length} ${chosen.length === 1 ? "wage" : "wages"}?`} size="md"
        description={`${formatMoney(chosenTotal)} in total from ${methodName(method || "cash")}. Each wage is recorded as a Wages expense; any advance recovered comes off what the employee owes. Staff with a phone and WhatsApp messages on are told on WhatsApp.`}
        footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button><Button loading={pay.isPending} disabled={!chosen.length || invalid.length > 0} onClick={payChosen}>Pay {formatMoney(chosenTotal)}</Button></>}>
        <Table compact>
          <THead><tr><TH>Employee</TH><TH>Period</TH><TH right>Days</TH><TH right>Recovered</TH><TH right>Net</TH></tr></THead>
          <TBody>
            {chosen.map((v) => (
              <TR key={v.key}><TD className="font-medium">{v.p.employee_name}</TD><TD className="text-fg-secondary">{periodLabel(v.p.from, v.p.to)}</TD><TD right>{daysText(v.row.days)}</TD><TD right>{v.row.recovery_minor ? formatMoney(v.row.recovery_minor) : "-"}</TD><TD right>{formatMoney(v.net)}</TD></TR>
            ))}
            <TR className="font-medium"><TD colSpan={4}>Total</TD><TD right>{formatMoney(chosenTotal)}</TD></TR>
          </TBody>
        </Table>
      </Dialog>
    </>
  );
}

function DueRow({ v, result, onToggle, onChange, onVoid, methodName }: { v: RowView; result?: WageBatchResult; onToggle: (on: boolean) => void; onChange: (patch: Partial<WageRow>) => void; onVoid: (w: WagePayment) => void; methodName: (c: string | null | undefined) => string }) {
  const { p, row, errors } = v;
  const single = p.period_days === 1;
  const chips = attendanceChips(p.attendance);
  const outstanding = p.advances_outstanding_minor;
  const errorList = [...new Set(Object.values(errors))];
  const employee = (
    <TD>
      <Link href={statementHref(p.employee_id)} className="font-medium text-primary">{p.employee_name}</Link>
      <div className="whitespace-nowrap text-xs text-fg-muted">{payTypeLabel(p.pay_frequency)} · {rateLabel(p.rate_minor, p.pay_frequency)}</div>
      {!single ? <div className="whitespace-nowrap text-xs text-fg-muted">Week {periodLabel(p.from, p.to)}</div> : null}
    </TD>
  );
  const attendance = (
    <TD>
      {p.attendance_tracked ? (
        <span className="flex max-w-56 flex-wrap gap-1">{chips.map((c) => <Badge key={c.key} variant={c.variant}>{chipText(c, single)}</Badge>)}</span>
      ) : <span className="text-xs text-fg-muted" title="Every day of the period is counted">No attendance kept</span>}
    </TD>
  );

  if (v.state === "paid" && p.paid) {
    const w = p.paid;
    return (
      <TR>
        <TD />
        {employee}{attendance}
        <TD className="tabular">{daysText(w.days_worked)}</TD>
        <TD right>{formatMoney(w.gross_minor)}</TD><TD right>{formatMoney(w.bonus_minor)}</TD><TD right>{formatMoney(w.deductions_minor)}</TD><TD right>{formatMoney(w.advance_recovered_minor)}</TD>
        <TD right className="font-medium">{formatMoney(w.net_minor)}</TD>
        <TD>
          <div className="flex items-center gap-2 whitespace-nowrap"><Badge variant="success">Paid</Badge><span className="font-mono text-xs">{w.label}</span>
            <Button variant="ghost" size="sm" onClick={() => onVoid(w)} title="Void this payment"><Undo2 className="h-4 w-4" /> Void</Button></div>
          <div className="whitespace-nowrap text-xs text-fg-muted">{formatDateTime(w.paid_at)} · {methodName(w.method_code)}</div>
        </TD>
      </TR>
    );
  }

  if (v.state === "overlap") {
    return (
      <TR>
        <TD />
        {employee}{attendance}
        <TD colSpan={6} className="text-sm text-fg-secondary">
          Already has a wage paid inside this period: {p.already_paid.map((w) => `${w.label} (${periodLabel(w.period_from, w.period_to)})`).join(", ")}. Void it to pay the whole period here.
        </TD>
        <TD><Badge variant="warning">Paid in part</Badge></TD>
      </TR>
    );
  }

  return (
    <TR className={v.selected ? "bg-primary/8 even:bg-primary/8 hover:bg-primary/10" : undefined}>
      <TD><Checkbox aria-label={`Pay ${p.employee_name}`} checked={v.selected} onChange={(e) => onToggle(e.target.checked)} /></TD>
      {employee}{attendance}
      <TD>
        <Input type="number" inputMode="decimal" step="0.5" min={0} max={p.period_days} className={`w-20 tabular ${errors.days ? "border-danger" : ""}`} value={row.days}
          onChange={(e) => onChange({ days: e.target.value })} aria-label={`Days worked by ${p.employee_name}`} aria-invalid={!!errors.days} />
        <div className="text-xs text-fg-muted">of {p.period_days}</div>
      </TD>
      <TD right>
        <MoneyInput className="w-28" value={v.gross} onChange={(m) => onChange({ gross_minor: m, gross_edited: true })} aria-label={`Wage for ${p.employee_name}`} aria-invalid={!!errors.gross} />
        {row.gross_edited ? <Button variant="link" size="sm" className="h-auto text-xs" onClick={() => onChange({ gross_edited: false })}>Use days x rate</Button> : <div className="text-xs text-fg-muted">days x rate</div>}
      </TD>
      <TD right><MoneyInput className="w-24" value={row.bonus_minor} onChange={(m) => onChange({ bonus_minor: m })} aria-label={`Bonus for ${p.employee_name}`} aria-invalid={!!errors.bonus} /><div className="h-4" /></TD>
      <TD right><MoneyInput className="w-24" value={row.deductions_minor} onChange={(m) => onChange({ deductions_minor: m })} aria-label={`Deductions for ${p.employee_name}`} aria-invalid={!!errors.deductions} /><div className="h-4" /></TD>
      <TD right>
        <MoneyInput className="w-28" value={row.recovery_minor} max={outstanding / 100} disabled={!outstanding} onChange={(m) => onChange({ recovery_minor: capRecovery(m, outstanding) })} aria-label={`Advance recovery for ${p.employee_name}`} aria-invalid={!!errors.recovery} />
        {outstanding ? (
          <div className="flex items-center justify-end gap-1 whitespace-nowrap text-xs text-fg-muted">of {formatMoney(outstanding)}
            <Button variant="link" size="sm" className="h-auto text-xs" onClick={() => onChange({ recovery_minor: maxRecovery(row, p) })}>Max</Button></div>
        ) : <div className="text-xs text-fg-muted">No advances</div>}
      </TD>
      <TD right className={`font-medium ${errors.net ? "text-danger" : ""}`}>{formatMoney(v.net)}</TD>
      <TD className="max-w-56">
        {result && !result.ok ? <Badge variant="danger">Not paid</Badge> : result?.ok ? <Badge variant="success">Paid</Badge> : <Badge variant="outline">Due</Badge>}
        {result && !result.ok && result.error ? <div className="mt-0.5 text-xs text-danger">{result.error}</div> : null}
        {errorList.length ? <div className="mt-0.5 text-xs text-danger">{errorList.join(". ")}</div> : null}
      </TD>
    </TR>
  );
}

function HistorySection({ today, onVoid }: { today: string; onVoid: (w: WagePayment) => void }) {
  const [range, setRange] = useState<DateRange>({ from: `${today.slice(0, 8)}01`, to: today });
  const [status, setStatus] = useState("");
  const [employee, setEmployee] = useState("");
  const methodName = useMethodName();
  const q = useQuery({ queryKey: ["wages", range.from, range.to, status, employee], queryFn: () => api<HistoryResponse>("/wages", { query: { from: range.from, to: range.to, status, employee_id: employee } }) });
  const rows = q.data?.data ?? [];
  const t = wageTotals(rows);
  const exportCsv = () => downloadCsv(`wages-${range.from}-${range.to}`, WAGE_HISTORY_COLUMNS, rows.map((w) => wageHistoryRow(w, { method: methodName(w.method_code), paid_at: formatDateTime(w.paid_at) })));
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-heading">Wage payments</h2>
          <p className="text-sm text-fg-secondary">{t.count} paid · {formatMoney(t.net_minor)} net · {formatMoney(t.advance_recovered_minor)} advance recovered. Voided payments are listed but not counted.</p>
        </div>
        <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4" /> CSV</Button>
      </div>
      <FilterBar>
        <DateRangePicker value={range} onChange={setRange} />
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">Paid and voided</option><option value="paid">Paid</option><option value="voided">Voided</option></Select>
        <WageEmployeeSelect value={employee} onChange={setEmployee} allLabel="All employees" />
      </FilterBar>
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : (
        <Table>
          <THead>
            <tr><TH>Payment</TH><TH>Employee</TH><TH>Period</TH><TH right>Days</TH><TH right>Wage</TH><TH right>Bonus</TH><TH right>Deductions</TH><TH right>Advance recovered</TH><TH right>Net</TH><TH>Paid from</TH><TH>Status</TH><TH right>Actions</TH></tr>
          </THead>
          <TBody>
            {rows.length ? rows.map((w) => (
              <TR key={w.id} className={w.status === "voided" ? "text-fg-muted" : undefined}>
                <TD className="whitespace-nowrap font-mono text-xs">{w.label}</TD>
                <TD className="font-medium">{w.employee_name ?? "-"}</TD>
                <TD className="whitespace-nowrap text-fg-secondary">{periodLabel(w.period_from, w.period_to)}</TD>
                <TD right>{daysText(w.days_worked)}</TD>
                <TD right>{formatMoney(w.gross_minor)}</TD><TD right>{formatMoney(w.bonus_minor)}</TD><TD right>{formatMoney(w.deductions_minor)}</TD><TD right>{formatMoney(w.advance_recovered_minor)}</TD>
                <TD right className="font-medium">{formatMoney(w.net_minor)}</TD>
                <TD className="whitespace-nowrap">{methodName(w.method_code)}<div className="text-xs text-fg-muted">{formatDateTime(w.paid_at)}</div></TD>
                <TD><Badge variant={wageStatusVariant(w.status)}>{w.status === "voided" ? "Voided" : "Paid"}</Badge>{w.void_reason ? <div className="max-w-48 truncate text-xs text-fg-muted" title={w.void_reason}>{w.void_reason}</div> : null}</TD>
                <TD right className="whitespace-nowrap">
                  <Link href={statementHref(w.employee_id)} title="Employee statement" aria-label={`Statement for ${w.employee_name ?? "employee"}`} className="inline-grid h-8 w-8 place-items-center rounded-full text-fg-secondary hover:bg-fg/8"><FileText className="h-4 w-4" /></Link>
                  {w.status === "paid" ? <Button variant="ghost" size="sm" onClick={() => onVoid(w)}><Undo2 className="h-4 w-4" /> Void</Button> : null}
                </TD>
              </TR>
            )) : <EmptyRow colSpan={12}>No wage payments in this range.</EmptyRow>}
            {t.count ? (
              <TR className="font-medium">
                <TD colSpan={4}>Total paid ({t.count})</TD><TD right>{formatMoney(t.gross_minor)}</TD><TD right>{formatMoney(t.bonus_minor)}</TD><TD right>{formatMoney(t.deductions_minor)}</TD><TD right>{formatMoney(t.advance_recovered_minor)}</TD><TD right>{formatMoney(t.net_minor)}</TD><TD colSpan={3} />
              </TR>
            ) : null}
          </TBody>
        </Table>
      )}
    </section>
  );
}
