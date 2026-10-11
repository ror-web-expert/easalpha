"use client";
// Small pieces shared across the Payroll group screens: month picker, employee select, payment method select, the
// permission guard and the status badges. Nothing here talks to a screen's own state.
import { useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import type { EmployeeFull, PaymentMethod } from "@/lib/types";
import { useList } from "@/components/admin/crud";
import { Badge, Button, EmptyState, Input, Select } from "@/components/ui";
import { useAuthStore, useCan } from "@/store/auth";
import { cn } from "@/lib/utils";
import { advanceStatusVariant, attendanceStatusLabel, attendanceStatusVariant, leaveStatusVariant, monthKey, runStatusVariant, scanResultLabel, scanResultVariant, shiftMonth } from "./payroll-helpers";

export const PAYROLL_PERMS = ["payroll.manage", "PAYROLL", "staff.manage"];

/** SPEC: business hours come from Store settings and are the last fallback for a shift start. */
export function useBusinessHours(): string | null {
  return useAuthStore((s) => s.session?.branch?.business_day_window ?? null);
}

/** The group is for payroll.manage / PAYROLL (staff.manage can see Employees and Fingerprint, as the sidebar does). */
export function PayrollGuard({ children, perms = PAYROLL_PERMS }: { children: React.ReactNode; perms?: string[] }) {
  const can = useCan();
  if (!can(...perms)) return <EmptyState icon={Lock} title="Payroll permission needed" hint="Ask an owner to grant the Payroll permission to your role." />;
  return <>{children}</>;
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

/** Active, non-khata payment methods, cash first. Used to pay a run or an advance. */
export function usePayMethods() {
  const methods = useList<PaymentMethod>("payment_methods", "/payment_methods");
  return useMemo(() => (methods.data ?? []).filter((m) => m.active && m.kind !== "khata").sort((a, b) => (a.kind === "cash" ? -1 : b.kind === "cash" ? 1 : a.sort_order - b.sort_order)), [methods.data]);
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
