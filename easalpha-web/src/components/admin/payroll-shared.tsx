"use client";
// Small pieces shared across the Payroll group screens: month picker, employee select, payment method select, the
// permission guard and the status badges. Nothing here talks to a screen's own state.
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import type { EmployeeFull, PaymentAccount, PaymentMethod, WageEmployeesResponse } from "@/lib/types";
import { useList } from "@/components/admin/crud";
import { Badge, Button, Input, Select } from "@/components/ui";
import { RequirePermission } from "./no-access";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";
import { advanceStatusVariant, attendanceStatusLabel, attendanceStatusVariant, leaveStatusVariant, monthKey, overdraftNote, payableMethods, runStatusVariant, scanResultLabel, scanResultVariant, shiftMonth } from "./payroll-helpers";

export const PAYROLL_PERMS = ["payroll.manage", "PAYROLL", "staff.manage"];

/** SPEC: business hours come from Store settings and are the last fallback for a shift start. */
export function useBusinessHours(): string | null {
  return useAuthStore((s) => s.session?.branch?.business_day_window ?? null);
}

/** The group is for payroll.manage / PAYROLL (staff.manage can see Employees and Fingerprint, as the sidebar does).
 *  Without them the page shows the admin's standard no-access state; a page's queries go inside it (review R5). */
export function PayrollGuard({ children, perms = PAYROLL_PERMS }: { children: React.ReactNode; perms?: string[] }) {
  return <RequirePermission perms={perms}>{children}</RequirePermission>;
}

/** "YYYY-MM" picker with previous and next month buttons. */
export function MonthPicker({ value, onChange, max, className }: { value: string; onChange: (v: string) => void; max?: string; className?: string }) {
  const top = max ?? monthKey();
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button variant="ghost" size="icon-sm" onClick={() => onChange(shiftMonth(value, -1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
      <Input type="month" className="w-auto" value={value} max={top} onChange={(e) => { if (e.target.value) onChange(e.target.value); }} aria-label="Month" />
      <Button variant="ghost" size="icon-sm" onClick={() => onChange(shiftMonth(value, 1))} disabled={value >= top} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
    </div>
  );
}

export function useEmployees(query: Record<string, string | undefined> = {}) {
  return useList<EmployeeFull>("employees", "/employees", query);
}

/** The wage screens' employee list. Payroll managers get everyone; a user who may only pay wages (wages.pay) gets daily
 *  and weekly staff, since GET /employees and salary statements need the payroll permission. */
export function useWageEmployees() {
  return useQuery({ queryKey: ["wage_employees"], queryFn: () => api<WageEmployeesResponse>("/wages/employees") });
}

export function WageEmployeeSelect({ value, onChange, allLabel, className }: { value: string; onChange: (id: string) => void; allLabel?: string; className?: string }) {
  const q = useWageEmployees();
  return (
    <Select className={cn("w-auto min-w-48", className)} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Employee">
      <option value="">{allLabel ?? "Choose an employee"}</option>
      {(q.data?.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}{e.designation ? ` (${e.designation})` : ""}</option>)}
    </Select>
  );
}

export function EmployeeSelect({ value, onChange, allLabel, className, autoSelectFirst }: { value: string; onChange: (id: string) => void; allLabel?: string; className?: string; autoSelectFirst?: boolean }) {
  const employees = useEmployees();
  const rows = employees.data ?? [];
  const first = rows[0]?.id;
  // Screens that need one employee (Ledger, Employee Rules) start on the first one so they are never blank.
  useEffect(() => { if (autoSelectFirst && !value && first) onChange(first); }, [autoSelectFirst, value, first, onChange]);
  return (
    <Select className={cn("w-auto min-w-48", className)} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Employee">
      {allLabel || !autoSelectFirst ? <option value="">{allLabel ?? "Choose an employee"}</option> : null}
      {rows.map((e) => <option key={e.id} value={e.id}>{e.name}{e.designation ? ` (${e.designation})` : ""}</option>)}
    </Select>
  );
}

/** The methods a run, an advance or wages can be paid from (payableMethods). */
export function usePayMethods() {
  const methods = useList<PaymentMethod>("payment_methods", "/payment_methods");
  return useMemo(() => payableMethods(methods.data ?? []), [methods.data]);
}

/** Below the "Paid from" select: a warning when the account behind the method would go below zero. Shown only to
 *  someone who may read the accounts; it never blocks the payment. */
export function PayFromWarning({ methodCode, amountMinor }: { methodCode: string; amountMinor: number }) {
  const methods = usePayMethods();
  const accounts = useQuery({ queryKey: ["payment_accounts"], queryFn: () => api<{ data: PaymentAccount[] }>("/payment_accounts"), select: (r) => r.data, retry: false });
  const method = methods.find((m) => m.code === methodCode) ?? methods[0];
  const note = overdraftNote(accounts.data?.find((a) => a.id === method?.payment_account_id), amountMinor);
  if (!note) return null;
  return <p role="alert" className="mt-2 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-ink"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{note}</p>;
}

export function MethodSelect({ value, onChange, className }: { value: string; onChange: (code: string) => void; className?: string }) {
  const methods = usePayMethods();
  const current = value || methods[0]?.code || "";
  const first = methods[0]?.code;
  useEffect(() => { if (!value && first) onChange(first); }, [value, first, onChange]);
  return (
    <Select className={className} value={current} onChange={(e) => onChange(e.target.value)} aria-label="Payment method">
      {methods.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
    </Select>
  );
}

export function AttendanceBadge({ status, missingPunch, autoClosed }: { status: string | null | undefined; missingPunch?: boolean; autoClosed?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant={attendanceStatusVariant(status)}>{attendanceStatusLabel(status)}</Badge>
      {missingPunch ? <Badge variant="outline" title="No check-out was recorded; overtime is not guessed at">Missing punch</Badge> : null}
      {autoClosed ? <Badge variant="outline" title="Closed at the end of the business day">Auto-closed</Badge> : null}
    </span>
  );
}
export const ScanBadge = ({ result }: { result: string | null | undefined }) => <Badge variant={scanResultVariant(result)}>{scanResultLabel(result)}</Badge>;
export const RunBadge = ({ status }: { status: string | null | undefined }) => <Badge variant={runStatusVariant(status)} className="capitalize">{status ?? "-"}</Badge>;
export const AdvanceBadge = ({ status }: { status: string | null | undefined }) => <Badge variant={advanceStatusVariant(status)} className="capitalize">{status ?? "-"}</Badge>;
export const LeaveBadge = ({ status }: { status: string | null | undefined }) => <Badge variant={leaveStatusVariant(status)} className="capitalize">{status ?? "-"}</Badge>;
