"use client";
// SPEC Payroll settings hold two decisions: the salary calculation method (Actual Calendar Days vs Fixed Divisor, with
// the Rs 30,000 worked example) and Require fingerprint to close shift. Below them, the Payroll Notifications switches
// (WhatsApp to staff when an advance, a wage or a salary is paid) from the settings store, with their own Save.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet2, CalendarDays, Divide, Fingerprint } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { PayrollSettings, SalaryMethod } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/admin/page";
import { SettingsScreenCard, useSettings } from "@/components/admin/settings-screen";
import { PayrollGuard } from "@/components/admin/payroll-shared";
import { useCan } from "@/store/auth";
import { formatMoneyExact, perDayMinor } from "@/components/admin/payroll-helpers";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Loading, Switch } from "@/components/ui";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";

interface Form { salary_method: SalaryMethod; fixed_divisor: number; require_fingerprint_to_close_shift: boolean }

/** Registry group "store", screen "Payroll Notifications": payroll.whatsapp.advance_paid, .wage_paid and .salary_paid. */
function PayrollNotificationsCard() {
  const settings = useSettings();
  const can = useCan();
  const keys = settings.data?.groups.store?.screens["Payroll Notifications"];
  if (settings.isLoading) return <Card><Loading /></Card>;
  if (!keys?.length) return null;
  return (
    <div>
      <SettingsScreenCard screen="3. Payroll Notifications" keys={keys} />
      <p className="mt-2 px-1 text-xs text-fg-secondary">A message goes only to an employee with a phone number whose own &quot;Send WhatsApp messages about pay&quot; switch is on, and only while WhatsApp sending is on in Settings &gt; WhatsApp.{can("settings.manage") ? "" : " Changing these switches needs the Settings permission."}</p>
    </div>
  );
}

function MethodCard({ selected, onSelect, icon: Icon, title, children }: { selected: boolean; onSelect: () => void; icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onSelect} className={cn("rounded-xl border bg-card p-4 text-left transition-colors hover:bg-fg/[0.04]", selected && "border-primary shadow-[inset_0_0_0_1px_var(--primary)]")} aria-pressed={selected}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-base font-medium"><Icon className="h-5 w-5 text-primary" /> {title}</span>
        {selected ? <Badge variant="primary">Selected</Badge> : null}
      </div>
      <div className="mt-2 text-sm text-fg-secondary">{children}</div>
    </button>
  );
}

export default function PayrollSettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["payroll_settings"], queryFn: () => api<PayrollSettings>("/payroll/settings") });
  const [form, setForm] = useState<Form | null>(null);
  useEffect(() => { if (q.data) setForm({ salary_method: q.data.salary_method, fixed_divisor: q.data.fixed_divisor, require_fingerprint_to_close_shift: q.data.require_fingerprint_to_close_shift }); }, [q.data]);
  const save = useMutation({
    mutationFn: (body: Form) => api<PayrollSettings>("/payroll/settings", { method: "PATCH", body }),
    onSuccess: (s) => { qc.setQueryData(["payroll_settings"], s); qc.invalidateQueries({ queryKey: ["attendance_rules"] }); toast.success("Payroll settings saved"); },
    onError: (e) => toast.error("Could not save", errorMessage(e)),
  });
  if (!form || !q.data) return <PayrollGuard perms={["payroll.manage", "settings.manage"]}><Loading /></PayrollGuard>;
  const ex = q.data.example;
  const divisorOk = Number.isInteger(form.fixed_divisor) && form.fixed_divisor >= 1 && form.fixed_divisor <= 31;
  const fixedDay = perDayMinor(ex.salary_minor, form.fixed_divisor);
  return (
    <PayrollGuard perms={["payroll.manage", "settings.manage"]}>
      <PageHeader icon={Wallet2} title="Payroll settings" description="How a day of salary is priced, whether a cashier must scan a fingerprint before closing a shift, and which pay messages staff get on WhatsApp." actions={<Button onClick={() => save.mutate(form)} loading={save.isPending} disabled={!divisorOk}>Save</Button>} />
      <div className="space-y-4">
        <Card>
          <CardHeader><div><CardTitle>1. Salary calculation method</CardTitle><p className="mt-0.5 text-xs text-fg-secondary">Prices a lost day, an unpaid leave day and an absence deduction. Every payroll run snapshots the method it used.</p></div></CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <MethodCard selected={form.salary_method === "calendar_days"} onSelect={() => setForm({ ...form, salary_method: "calendar_days" })} icon={CalendarDays} title="Actual Calendar Days">
                Divides the monthly salary by the real days in the month, so the daily rate moves between 28 and 31 day months.
              </MethodCard>
              <MethodCard selected={form.salary_method === "fixed_divisor"} onSelect={() => setForm({ ...form, salary_method: "fixed_divisor" })} icon={Divide} title="Fixed Divisor">
                Always divides by the same number, commonly 26, so every day of the year is worth the same.
              </MethodCard>
            </div>
            {form.salary_method === "fixed_divisor" ? (
              <Field label="Divisor" error={divisorOk ? undefined : "Use a whole number from 1 to 31"} hint="26 treats four weekly offs as unpaid days; 30 spreads the salary over a notional month." className="max-w-xs">
                <Input type="number" min={1} max={31} inputMode="numeric" value={form.fixed_divisor} onChange={(e) => setForm({ ...form, fixed_divisor: Number(e.target.value) })} />
              </Field>
            ) : null}
            <div className="rounded-xl bg-muted p-4 text-sm">
              <div className="font-medium">Worked example on a {formatMoney(ex.salary_minor)} salary</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className={cn("rounded-lg border bg-card p-3", form.salary_method === "calendar_days" && "border-primary")}>
                  <div className="text-xs text-fg-secondary">Calendar days: a February day (28)</div>
                  <div className="mt-1 text-xl tabular">{formatMoneyExact(ex.february_day_minor)}</div>
                </div>
                <div className={cn("rounded-lg border bg-card p-3", form.salary_method === "calendar_days" && "border-primary")}>
                  <div className="text-xs text-fg-secondary">Calendar days: a January day (31)</div>
                  <div className="mt-1 text-xl tabular">{formatMoneyExact(ex.january_day_minor)}</div>
                </div>
                <div className={cn("rounded-lg border bg-card p-3", form.salary_method === "fixed_divisor" && "border-primary")}>
                  <div className="text-xs text-fg-secondary">Fixed divisor: any day (/{divisorOk ? form.fixed_divisor : q.data.fixed_divisor})</div>
                  <div className="mt-1 text-xl tabular">{formatMoneyExact(divisorOk ? fixedDay : ex.fixed_day_minor)}</div>
                </div>
              </div>
              <p className="mt-3 text-xs text-fg-secondary">{formatMoneyExact(ex.february_day_minor)} is deducted for a February day against {formatMoneyExact(ex.january_day_minor)} for a January day under Actual Calendar Days; the Fixed Divisor figure never moves.</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><div><CardTitle className="flex items-center gap-2"><Fingerprint className="h-4 w-4" /> 2. Require fingerprint to close shift</CardTitle><p className="mt-0.5 text-xs text-fg-secondary">When on, a cashier must scan at the attendance reader before the till lets them close their shift.</p></div></CardHeader>
          <CardBody>
            <Switch checked={form.require_fingerprint_to_close_shift} onChange={(v) => setForm({ ...form, require_fingerprint_to_close_shift: v })} label={form.require_fingerprint_to_close_shift ? "Required: the shift close waits for a scan" : "Not required: shifts close without a scan"} />
          </CardBody>
        </Card>
        <div className="flex justify-end"><Button onClick={() => save.mutate(form)} loading={save.isPending} disabled={!divisorOk}>Save</Button></div>
        <PayrollNotificationsCard />
      </div>
    </PayrollGuard>
  );
}
