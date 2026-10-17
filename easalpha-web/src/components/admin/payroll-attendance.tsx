"use client";
// The attendance hub tabs (SPEC Attendance screens): Today, Sessions, Scan Log, Ledger, Enrolled and Reports.
// Leave, Holidays and the rules tabs live in payroll-leave.tsx and payroll-rules-form.tsx.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogIn, LogOut, ClipboardEdit, FileText, Fingerprint, ShieldOff, RefreshCw, Moon } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { AttendanceDay, AttendanceDayStatus, AttendanceLedger, AttendanceReport, AttendanceScan, AttendanceToday, EnrolledEmployee, ScanResponse } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime, formatTime, isoDay } from "@/lib/dates";
import { usePagedList } from "@/lib/hooks";
import { exportTablePdf } from "@/lib/pdf";
import { Cards, DateRangePicker, FilterBar, LoadMore, type DateRange } from "@/components/admin/page";
import { useAction, useList } from "@/components/admin/crud";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ConfirmDialog, Dialog, EmptyRow, Field, Input, KeyValue, Loading, Select, SummaryCard, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";
import { ATTENDANCE_STATUSES, attendanceStatusVariant, counterCards, daysInMonth, deriveCounters, minutesLabel, monthLabel, SCAN_RESULTS } from "./payroll-helpers";
import { ChargesTable } from "./payroll-run";
import { AttendanceBadge, EmployeeSelect, MonthPicker, ScanBadge } from "./payroll-shared";

// Literal classes so Tailwind emits them; the calendar cell takes the soft tone of its status badge.
const DAY_TONE: Record<string, string> = { success: "bg-success-soft", warning: "bg-warning-soft", accent: "bg-accent-soft", danger: "bg-danger-soft", info: "bg-info-soft", primary: "bg-primary-soft", neutral: "bg-muted" };

const ATTENDANCE_KEYS = ["attendance_today", "attendance_sessions", "attendance_scans", "attendance_ledger", "attendance_reports", "payroll_ledger"];

function MarkDialog({ target, onClose }: { target: { employee_id: string; name: string; business_day: string; status?: AttendanceDayStatus; note?: string | null } | null; onClose: () => void }) {
  const [status, setStatus] = useState<AttendanceDayStatus>("present");
  const [note, setNote] = useState("");
  useEffect(() => { if (target) { setStatus(target.status ?? "present"); setNote(target.note ?? ""); } }, [target]);
  const mark = useAction<{ employee_id: string; business_day: string; status: string; note: string }>(ATTENDANCE_KEYS, (b) => api("/attendance/mark", { method: "POST", body: b }), "Day marked");
  return (
    <Dialog open={!!target} onClose={onClose} title={target ? `Mark ${target.name}` : ""} description={target ? `${formatDate(target.business_day)}. A marked day keeps this status until it is scanned or edited again.` : undefined} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={mark.isPending} onClick={() => target && mark.mutate({ employee_id: target.employee_id, business_day: target.business_day, status, note }, { onSuccess: onClose })}>Mark</Button></>}>
      <div className="space-y-3">
        <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value as AttendanceDayStatus)}>{ATTENDANCE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field>
        <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this day was marked by hand" /></Field>
      </div>
    </Dialog>
  );
}

// ---- Today ----
export function TodayTab() {
  const qc = useQueryClient();
  const [day, setDay] = useState("");
  const q = useQuery({ queryKey: ["attendance_today", day], queryFn: () => api<AttendanceToday>("/attendance/today", { query: { business_day: day || undefined } }), refetchInterval: 30000 });
  const [mark, setMark] = useState<{ employee_id: string; name: string; business_day: string; status?: AttendanceDayStatus; note?: string | null } | null>(null);
  const [autoClose, setAutoClose] = useState(false);
  const refresh = () => ATTENDANCE_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const scan = useAction<{ employee_id: string }, ScanResponse>(ATTENDANCE_KEYS, ({ employee_id }) => api<ScanResponse>("/attendance/scan", { method: "POST", body: { employee_id, source: "manual" } }));
  const checkOut = useAction<{ employee_id: string }>(ATTENDANCE_KEYS, ({ employee_id }) => api("/attendance/check_out", { method: "POST", body: { employee_id } }), "Checked out");
  const closeAll = useAction<void, { closed: number }>(ATTENDANCE_KEYS, () => api<{ closed: number }>("/attendance/auto_close", { method: "POST", body: { business_day: day || q.data?.business_day } }));
  const t = q.data;
  const counters = t ? (t.counters ?? deriveCounters(t.data, t.not_checked_in.length)) : null;
  const checkIn = (employee_id: string) => scan.mutate({ employee_id }, { onSuccess: (r) => toast[r.result === "already_marked" || r.result === "rejected" ? "error" : "success"](r.message, `${r.employee.name}: ${r.attendance.status.replace(/_/g, " ")}`) });
  return (
    <>
      <FilterBar>
        <Field label="Business day"><Input type="date" className="w-auto" value={day || t?.business_day || ""} max={isoDay()} onChange={(e) => setDay(e.target.value)} /></Field>
        <div className="ml-auto flex gap-2 self-end">
          <Button variant="ghost" size="sm" onClick={refresh}><RefreshCw className="h-4 w-4" /> Refresh</Button>
          <Button variant="secondary" size="sm" onClick={() => setAutoClose(true)} disabled={!counters?.currently_in}><Moon className="h-4 w-4" /> Auto-close open rows</Button>
        </div>
      </FilterBar>
      <Cards>
        {counterCards(counters).map((c) => <SummaryCard key={c.key} label={c.label} value={c.value} tone={c.tone} />)}
      </Cards>
      {q.isLoading || !t ? <Loading /> : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
          <Table>
            <THead><tr><TH>Employee</TH><TH>Status</TH><TH>In</TH><TH>Out</TH><TH right>Late</TH><TH right>Worked</TH><TH right>Overtime</TH><TH>Source</TH><TH right>Actions</TH></tr></THead>
            <TBody>
              {t.data.length ? t.data.map((a) => (
                <TR key={a.id}>
                  <TD className="font-medium">{a.employee_name}{a.note ? <div className="text-xs font-normal text-fg-muted">{a.note}</div> : null}</TD>
                  <TD><AttendanceBadge status={a.status} missingPunch={a.missing_punch} autoClosed={a.auto_closed} /></TD>
                  <TD className="tabular">{a.checked_in_at ? formatTime(a.checked_in_at) : "-"}</TD>
                  <TD className="tabular">{a.checked_out_at ? formatTime(a.checked_out_at) : a.checked_in_at ? <Badge variant="success">In</Badge> : "-"}</TD>
                  <TD right className={a.late_minutes ? "text-warning-ink" : ""}>{a.late_minutes ? minutesLabel(a.late_minutes) : "-"}</TD>
                  <TD right>{a.worked_minutes ? minutesLabel(a.worked_minutes) : "-"}</TD>
                  <TD right>{a.overtime_minutes ? minutesLabel(a.overtime_minutes) : "-"}</TD>
                  <TD className="capitalize text-fg-secondary">{a.source}</TD>
                  <TD right>
                    {a.checked_in_at && !a.checked_out_at ? <Button variant="ghost" size="sm" onClick={() => checkOut.mutate({ employee_id: a.employee_id })} disabled={checkOut.isPending} title="Always allowed, even inside the checkout gap"><LogOut className="h-4 w-4" /> Manual check out</Button> : null}
                    <Button variant="ghost" size="sm" onClick={() => setMark({ employee_id: a.employee_id, name: a.employee_name, business_day: a.business_day, status: a.status, note: a.note })}><ClipboardEdit className="h-4 w-4" /> Mark</Button>
                  </TD>
                </TR>
              )) : <EmptyRow colSpan={9}>No attendance rows for {formatDate(t.business_day)} yet.</EmptyRow>}
            </TBody>
          </Table>
          <Card className="self-start">
            <CardHeader><CardTitle>Not checked in</CardTitle><Badge variant={t.not_checked_in.length ? "warning" : "success"}>{t.not_checked_in.length}</Badge></CardHeader>
            <CardBody className="space-y-2">
              {t.not_checked_in.length ? t.not_checked_in.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0"><div className="truncate font-medium">{e.name}</div><div className="truncate text-xs text-fg-muted">{e.designation ?? ""}</div></div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="soft" size="sm" onClick={() => checkIn(e.id)} disabled={scan.isPending}><LogIn className="h-4 w-4" /> Check in</Button>
                    <Button variant="ghost" size="icon-sm" title="Mark" aria-label="Mark" onClick={() => setMark({ employee_id: e.id, name: e.name, business_day: t.business_day })}><ClipboardEdit className="h-4 w-4" /></Button>
                  </div>
                </div>
              )) : <p className="text-sm text-fg-muted">Everyone active today has checked in.</p>}
            </CardBody>
          </Card>
        </div>
      )}
      <MarkDialog target={mark} onClose={() => setMark(null)} />
      <ConfirmDialog open={autoClose} onClose={() => setAutoClose(false)} onConfirm={() => closeAll.mutate(undefined, { onSuccess: (r) => { toast.success(`${r.closed} rows auto-closed`); setAutoClose(false); } })} title="Auto-close open rows?" description="Everyone still checked in is closed for this business day without overtime and flagged as a missing punch. This runs on its own at the end of the day." confirmLabel="Auto-close" loading={closeAll.isPending} />
    </>
  );
}

// ---- Sessions ----
export function SessionsTab() {
  const [range, setRange] = useState<DateRange>({ from: isoDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), to: isoDay() });
  const [employee, setEmployee] = useState("");
  const [status, setStatus] = useState("");
  const list = useList<AttendanceDay>("attendance_sessions", "/attendance", { from: range.from, to: range.to, employee_id: employee });
  const [mark, setMark] = useState<{ employee_id: string; name: string; business_day: string; status?: AttendanceDayStatus; note?: string | null } | null>(null);
  const rows = useMemo(() => (list.data ?? []).filter((a) => !status || a.status === status), [list.data, status]);
  return (
    <>
      <FilterBar>
        <DateRangePicker value={range} onChange={setRange} />
        <EmployeeSelect value={employee} onChange={setEmployee} allLabel="All employees" />
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{ATTENDANCE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select>
        <span className="ml-auto text-sm text-fg-secondary">{rows.length} sessions</span>
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Day</TH><TH>Employee</TH><TH>Status</TH><TH>In</TH><TH>Out</TH><TH right>Late</TH><TH right>Worked</TH><TH right>Overtime</TH><TH>Source</TH><TH right /></tr></THead>
          <TBody>
            {rows.length ? rows.map((a) => (
              <TR key={a.id}>
                <TD>{formatDate(a.business_day)}</TD>
                <TD className="font-medium">{a.employee_name}{a.note ? <div className="text-xs font-normal text-fg-muted">{a.note}</div> : null}</TD>
                <TD><AttendanceBadge status={a.status} missingPunch={a.missing_punch} autoClosed={a.auto_closed} /></TD>
                <TD className="tabular">{a.checked_in_at ? formatTime(a.checked_in_at) : "-"}</TD>
                <TD className="tabular">{a.checked_out_at ? formatTime(a.checked_out_at) : "-"}</TD>
                <TD right>{a.late_minutes ? minutesLabel(a.late_minutes) : "-"}</TD>
                <TD right>{a.worked_minutes ? minutesLabel(a.worked_minutes) : "-"}</TD>
                <TD right>{a.overtime_minutes ? minutesLabel(a.overtime_minutes) : "-"}</TD>
                <TD className="capitalize text-fg-secondary">{a.source}</TD>
                <TD right><Button variant="ghost" size="sm" onClick={() => setMark({ employee_id: a.employee_id, name: a.employee_name, business_day: a.business_day, status: a.status, note: a.note })}><ClipboardEdit className="h-4 w-4" /> Mark</Button></TD>
              </TR>
            )) : <EmptyRow colSpan={10}>No sessions in this range.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <MarkDialog target={mark} onClose={() => setMark(null)} />
    </>
  );
}

// ---- Scan Log ----
export function ScanLogTab() {
  const [range, setRange] = useState<DateRange>({ from: isoDay(), to: isoDay() });
  const [employee, setEmployee] = useState("");
  const [result, setResult] = useState("");
  const list = usePagedList<AttendanceScan>(["attendance_scans"], "/attendance/scans", { from: range.from, to: range.to, employee_id: employee, result });
  return (
    <>
      <FilterBar>
        <DateRangePicker value={range} onChange={setRange} />
        <EmployeeSelect value={employee} onChange={setEmployee} allLabel="All employees" />
        <Select className="w-auto" value={result} onChange={(e) => setResult(e.target.value)} aria-label="Result"><option value="">All results</option>{SCAN_RESULTS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select>
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <>
          <Table>
            <THead><tr><TH>Scanned at</TH><TH>Employee</TH><TH>Finger</TH><TH>Result</TH><TH>Note</TH></tr></THead>
            <TBody>
              {list.rows.length ? list.rows.map((s) => (
                <TR key={s.id}>
                  <TD className="tabular">{formatDateTime(s.scanned_at)}</TD>
                  <TD className="font-medium">{s.employee_name ?? <span className="text-fg-muted">Unknown</span>}</TD>
                  <TD className="tabular text-fg-secondary">{s.fingerprint_id ?? "-"}</TD>
                  <TD><ScanBadge result={s.result} /></TD>
                  <TD className="text-fg-secondary">{s.note ?? ""}</TD>
                </TR>
              )) : <EmptyRow colSpan={5}>No taps on the reader in this range.</EmptyRow>}
            </TBody>
          </Table>
          <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
        </>
      )}
    </>
  );
}

// ---- Ledger ----
/** The month view per employee: a calendar of days, the summary and the charges breakdown. Reused on the employee detail page. */
export function AttendanceLedgerView({ employeeId, month, picker }: { employeeId: string; month: string; picker?: React.ReactNode }) {
  const q = useQuery({ queryKey: ["attendance_ledger", employeeId, month], queryFn: () => api<AttendanceLedger>("/attendance/ledger", { query: { employee_id: employeeId, month } }), enabled: !!employeeId });
  const [mark, setMark] = useState<{ employee_id: string; name: string; business_day: string; status?: AttendanceDayStatus; note?: string | null } | null>(null);
  const l = q.data;
  const byDay = useMemo(() => new Map((l?.days ?? []).map((d) => [d.business_day.slice(0, 10), d])), [l]);
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const n = daysInMonth(month);
  const cells: (AttendanceDay | { business_day: string } | null)[] = [...Array<null>(first).fill(null), ...Array.from({ length: n }, (_, i) => { const key = `${month}-${String(i + 1).padStart(2, "0")}`; return byDay.get(key) ?? { business_day: key }; })];
  const s = l?.summary;
  if (!employeeId) return <p className="py-8 text-center text-sm text-fg-muted">Choose an employee.</p>;
  return (
    <>
      {picker ? <FilterBar>{picker}{l ? <span className="text-sm text-fg-secondary">{l.employee.name} · {monthLabel(month)}</span> : null}</FilterBar> : null}
      {q.isLoading || !l || !s ? <Loading /> : (
        <>
          <Cards>
            <SummaryCard label="Present" value={s.present} sub="incl. late and half days" tone="success" />
            <SummaryCard label="Late" value={s.late} sub={minutesLabel(s.late_minutes)} tone="warning" />
            <SummaryCard label="Half days" value={s.half_days} tone="warning" />
            <SummaryCard label="Absent" value={s.absent} tone="danger" />
            <SummaryCard label="Leave" value={s.leave} sub={`${s.unpaid_leave} unpaid`} tone="info" />
            <SummaryCard label="Holiday / off" value={`${s.holiday} / ${s.weekly_off}`} tone="neutral" />
            <SummaryCard label="Overtime" value={minutesLabel(s.overtime_minutes)} sub={`${s.missing_punches} missing punches`} tone="primary" />
            <SummaryCard label="Fines" value={formatMoney(s.fines_minor)} sub={`${s.lost_days} lost days`} tone={s.fines_minor || s.lost_days ? "danger" : "neutral"} />
          </Cards>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card>
              <CardHeader><CardTitle>{monthLabel(month)}</CardTitle><span className="text-xs text-fg-secondary">Click a day to mark it</span></CardHeader>
              <CardBody>
                <div className="grid grid-cols-7 gap-1 text-center text-xs text-fg-muted">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-1">{d}</div>)}</div>
                <div className="grid grid-cols-7 gap-1">
                  {cells.map((c, i) => {
                    if (!c) return <div key={`b${i}`} />;
                    const a = "id" in c ? c : null;
                    const dayNo = Number(c.business_day.slice(8, 10));
                    const future = c.business_day > isoDay();
                    return (
                      <button key={c.business_day} type="button" disabled={future} onClick={() => setMark({ employee_id: employeeId, name: l.employee.name, business_day: c.business_day, status: a?.status, note: a?.note })}
                        className={cn("flex min-h-16 flex-col items-start rounded-lg border p-1.5 text-left text-xs transition-colors hover:bg-fg/[0.04] disabled:opacity-40", a ? DAY_TONE[attendanceStatusVariant(a.status)] ?? "bg-muted" : "bg-card")} title={a ? `${a.status.replace(/_/g, " ")}${a.checked_in_at ? ` in ${formatTime(a.checked_in_at)}` : ""}${a.checked_out_at ? ` out ${formatTime(a.checked_out_at)}` : ""}` : "No record"}>
                        <span className="tabular font-medium">{dayNo}</span>
                        {a ? <><Badge variant={attendanceStatusVariant(a.status)} className="mt-1 h-5 px-1.5 text-[10px]">{ATTENDANCE_STATUSES.find((x) => x.value === a.status)?.label ?? a.status}</Badge>{a.checked_in_at ? <span className="mt-0.5 text-fg-secondary tabular">{formatTime(a.checked_in_at)}{a.checked_out_at ? ` - ${formatTime(a.checked_out_at)}` : ""}</span> : null}{a.missing_punch ? <span className="text-fg-muted">missing punch</span> : null}</> : null}
                      </button>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Charges</CardTitle>{l.rule?.employee_id ? <Badge variant="primary">Own rules</Badge> : <Badge variant="neutral">Business defaults</Badge>}</CardHeader>
                <CardBody><ChargesTable charges={s.charges} /></CardBody>
              </Card>
              <Card>
                <CardHeader><CardTitle>Month summary</CardTitle></CardHeader>
                <CardBody><KeyValue items={[
                  { label: "Late minutes", value: minutesLabel(s.late_minutes) }, { label: "Worked", value: minutesLabel(s.worked_minutes) }, { label: "Overtime", value: minutesLabel(s.overtime_minutes) },
                  { label: "Missing punches", value: s.missing_punches }, { label: "Fines", value: formatMoney(s.fines_minor) }, { label: "Lost days", value: s.lost_days },
                  { label: "Shift", value: l.rule?.shift_start ? `${l.rule.shift_start} to ${l.rule.shift_end ?? "-"}` : "Business hours" },
                ]} /></CardBody>
              </Card>
            </div>
          </div>
        </>
      )}
      <MarkDialog target={mark} onClose={() => setMark(null)} />
    </>
  );
}

export function LedgerTab() {
  const [employee, setEmployee] = useState("");
  const [month, setMonth] = useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
  return <AttendanceLedgerView employeeId={employee} month={month} picker={<><EmployeeSelect value={employee} onChange={setEmployee} autoSelectFirst /><MonthPicker value={month} onChange={setMonth} /></>} />;
}

// ---- Enrolled ----
export function EnrolledTab() {
  const list = useList<EnrolledEmployee>("attendance_enrolled", "/attendance/enrolled");
  const [enrol, setEnrol] = useState<EnrolledEmployee | null>(null);
  const [fid, setFid] = useState("");
  const [revoke, setRevoke] = useState<EnrolledEmployee | null>(null);
  const [filter, setFilter] = useState("");
  const keys = ["attendance_enrolled", "employees", "employee"];
  const enrolM = useAction<{ employee_id: string; fingerprint_id: string }>(keys, (b) => api("/attendance/enrol", { method: "POST", body: b }), "Fingerprint enrolled");
  const revokeM = useAction<{ employee_id: string }>(keys, (b) => api("/attendance/revoke", { method: "POST", body: b }), "Fingerprint revoked");
  const rows = (list.data ?? []).filter((e) => !filter || (filter === "enrolled" ? e.fingerprint_enrolled : !e.fingerprint_enrolled));
  const enrolled = (list.data ?? []).filter((e) => e.fingerprint_enrolled).length;
  return (
    <>
      <FilterBar>
        <Select className="w-auto" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Enrolment"><option value="">Everyone</option><option value="enrolled">Enrolled</option><option value="not">Not enrolled</option></Select>
        <span className="ml-auto text-sm text-fg-secondary">{enrolled} of {list.data?.length ?? 0} enrolled</span>
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Employee</TH><TH>Status</TH><TH>Fingerprint id</TH><TH>Enrolled</TH><TH>Revoked</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {rows.length ? rows.map((e) => (
              <TR key={e.id}>
                <TD className="font-medium">{e.name}<div className="text-xs font-normal text-fg-muted">{e.designation ?? ""}</div></TD>
                <TD>{e.fingerprint_enrolled ? <Badge variant="success">Enrolled</Badge> : e.revoked_at ? <Badge variant="danger">Revoked</Badge> : <Badge variant="neutral">Not enrolled</Badge>}</TD>
                <TD className="tabular">{e.fingerprint_id ?? "-"}</TD>
                <TD className="text-fg-secondary">{e.enrolled_at ? formatDateTime(e.enrolled_at) : "-"}</TD>
                <TD className="text-fg-secondary">{e.revoked_at ? formatDateTime(e.revoked_at) : "-"}</TD>
                <TD right>
                  {e.fingerprint_enrolled ? <Button variant="ghost" size="sm" onClick={() => setRevoke(e)}><ShieldOff className="h-4 w-4 text-danger" /> Revoke</Button> : <Button variant="soft" size="sm" onClick={() => { setEnrol(e); setFid(""); }}><Fingerprint className="h-4 w-4" /> Enrol</Button>}
                </TD>
              </TR>
            )) : <EmptyRow colSpan={6}>No employees{filter ? " in this group" : ""}.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!enrol} onClose={() => setEnrol(null)} title={enrol ? `Enrol ${enrol.name}` : ""} description="Type the id the reader assigned to this finger. One id belongs to one employee." size="sm"
        footer={<><Button variant="secondary" onClick={() => setEnrol(null)}>Cancel</Button><Button disabled={!fid.trim()} loading={enrolM.isPending} onClick={() => enrol && enrolM.mutate({ employee_id: enrol.id, fingerprint_id: fid.trim() }, { onSuccess: () => setEnrol(null), onError: (err) => toast.error("Could not enrol", errorMessage(err)) })}>Enrol</Button></>}>
        <Field label="Fingerprint id"><Input value={fid} onChange={(e) => setFid(e.target.value)} autoFocus inputMode="numeric" placeholder="e.g. 17" /></Field>
      </Dialog>
      <ConfirmDialog open={!!revoke} onClose={() => setRevoke(null)} onConfirm={() => revoke && revokeM.mutate({ employee_id: revoke.id }, { onSuccess: () => setRevoke(null) })} title={`Revoke ${revoke?.name}'s fingerprint?`} description="The reader stops accepting this finger immediately. Past attendance stays." confirmLabel="Revoke" destructive loading={revokeM.isPending} />
    </>
  );
}

// ---- Reports ----
export function AttendanceReportsTab() {
  const [month, setMonth] = useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
  const q = useQuery({ queryKey: ["attendance_reports", month], queryFn: () => api<AttendanceReport>("/attendance/reports", { query: { month } }) });
  const r = q.data;
  const exportPdf = () => r && exportTablePdf({
    title: "Attendance report", subtitle: monthLabel(month), landscape: true,
    columns: [{ header: "Employee", key: "name" }, { header: "Department", key: "department" }, { header: "Present", key: "present", align: "right" }, { header: "Late", key: "late", align: "right" }, { header: "Half days", key: "half_days", align: "right" }, { header: "Absent", key: "absent", align: "right" }, { header: "Leave", key: "leave", align: "right" }, { header: "Holiday", key: "holiday", align: "right" }, { header: "Late min", key: "late_minutes", align: "right" }, { header: "Overtime", key: "overtime", align: "right" }, { header: "Missing punches", key: "missing", align: "right" }, { header: "Lost days", key: "lost_days", align: "right" }, { header: "Fines", key: "fines", align: "right" }],
    rows: r.rows.map(({ employee: e, summary: s }) => ({ name: e.name, department: e.department ?? "", present: s.present, late: s.late, half_days: s.half_days, absent: s.absent, leave: s.leave, holiday: s.holiday, late_minutes: s.late_minutes, overtime: minutesLabel(s.overtime_minutes), missing: s.missing_punches, lost_days: s.lost_days, fines: formatMoney(s.fines_minor) })),
    footer: [`Totals: present ${r.totals.present}, late ${r.totals.late}, half days ${r.totals.half_days}, absent ${r.totals.absent}, leave ${r.totals.leave}, overtime ${minutesLabel(r.totals.overtime_minutes)}, lost days ${r.totals.lost_days}, fines ${formatMoney(r.totals.fines_minor)}`],
    filename: `attendance-${month}.pdf`,
  });
  return (
    <>
      <FilterBar>
        <MonthPicker value={month} onChange={setMonth} />
        <Button variant="secondary" className="ml-auto" onClick={exportPdf} disabled={!r?.rows.length}><FileText className="h-4 w-4" /> Export PDF</Button>
      </FilterBar>
      {q.isLoading || !r ? <Loading /> : (
        <Table>
          <THead><tr><TH>Employee</TH><TH right>Present</TH><TH right>Late</TH><TH right>Half days</TH><TH right>Absent</TH><TH right>Leave</TH><TH right>Holiday</TH><TH right>Late min</TH><TH right>Overtime</TH><TH right>Missing</TH><TH right>Lost days</TH><TH right>Fines</TH></tr></THead>
          <TBody>
            {r.rows.length ? r.rows.map(({ employee: e, summary: s }) => (
              <TR key={e.id}>
                <TD className="font-medium">{e.name}<div className="text-xs font-normal text-fg-muted">{[e.designation, e.department].filter(Boolean).join(" · ")}</div></TD>
                <TD right>{s.present}</TD><TD right className={s.late ? "text-warning-ink" : ""}>{s.late}</TD><TD right>{s.half_days}</TD><TD right className={s.absent ? "text-danger" : ""}>{s.absent}</TD><TD right>{s.leave}</TD><TD right>{s.holiday}</TD>
                <TD right>{minutesLabel(s.late_minutes)}</TD><TD right>{minutesLabel(s.overtime_minutes)}</TD><TD right>{s.missing_punches}</TD><TD right>{s.lost_days}</TD><TD right>{formatMoney(s.fines_minor)}</TD>
              </TR>
            )) : <EmptyRow colSpan={12}>No employees.</EmptyRow>}
            {r.rows.length ? <TR className="font-medium"><TD>Total</TD><TD right>{r.totals.present}</TD><TD right>{r.totals.late}</TD><TD right>{r.totals.half_days}</TD><TD right>{r.totals.absent}</TD><TD right>{r.totals.leave}</TD><TD right>{r.totals.holiday}</TD><TD right>-</TD><TD right>{minutesLabel(r.totals.overtime_minutes)}</TD><TD right>{r.totals.missing_punches}</TD><TD right>{r.totals.lost_days}</TD><TD right>{formatMoney(r.totals.fines_minor)}</TD></TR> : null}
          </TBody>
        </Table>
      )}
    </>
  );
}
