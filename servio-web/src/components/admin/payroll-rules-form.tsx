"use client";
// SPEC "The rules engine": one form for the business Defaults and for a per-employee override. Every SPEC rule is a
// section here. Changing rules never rewrites saved days: rows keep their stored status until scanned or edited again.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AttendanceRuleSet, PenaltyKind } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { useAction } from "@/components/admin/crud";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Checkbox, Field, Input, Loading, MoneyInput, Select, Switch } from "@/components/ui";
import { BLANK_RULES, PENALTY_OPTIONS, type RulesForm, ruleToForm, rulesPayload, validateRulesForm, WEEKDAYS } from "./payroll-helpers";

export function useRules() {
  return useQuery({ queryKey: ["attendance_rules"], queryFn: () => api<{ data: AttendanceRuleSet[] }>("/employees/rules"), select: (r) => r.data });
}

const HISTORY_NOTE = "Changing rules does not rewrite history. Rules apply to new and updated records; days already saved keep their stored status until they are scanned or edited again.";

function Section({ title, hint, children, aside }: { title: string; hint?: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><div><CardTitle>{title}</CardTitle>{hint ? <p className="mt-0.5 text-xs text-fg-secondary">{hint}</p> : null}</div>{aside}</CardHeader>
      <CardBody className="grid gap-4 sm:grid-cols-2">{children}</CardBody>
    </Card>
  );
}

function PenaltyRow({ label, penalty, fine, onPenalty, onFine, error, hint }: { label: string; penalty: PenaltyKind; fine: number; onPenalty: (p: PenaltyKind) => void; onFine: (m: number) => void; error?: string; hint?: string }) {
  const fineUsed = penalty === "fine_only" || penalty === "both";
  return (
    <>
      <Field label={`${label} penalty`} error={error} hint={hint}>
        <Select value={penalty} onChange={(e) => onPenalty(e.target.value as PenaltyKind)}>{PENALTY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
      </Field>
      <Field label={`${label} fine`} hint={fineUsed ? "Flat amount per charged day" : "Not used with this penalty"}><MoneyInput value={fine} onChange={onFine} disabled={!fineUsed} /></Field>
    </>
  );
}

/**
 * The rules form. employeeId undefined edits the Defaults; a string edits (or creates) that employee's override.
 * `initial` is the saved rule (null = no override yet, the form starts from the defaults passed in `fallback`).
 */
export function RulesForm({ employeeId, initial, fallback, onSaved, businessHours }: { employeeId?: string; initial: AttendanceRuleSet | null; fallback?: AttendanceRuleSet | null; onSaved?: () => void; businessHours?: string | null }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<RulesForm>(() => ruleToForm(initial ?? fallback ?? null));
  const [touched, setTouched] = useState(false);
  useEffect(() => { setForm(ruleToForm(initial ?? fallback ?? null)); setTouched(false); }, [initial, fallback, employeeId]);
  const errors = useMemo(() => validateRulesForm(form), [form]);
  const hasErrors = Object.keys(errors).length > 0;
  const save = useAction<RulesForm>(["attendance_rules", "attendance_ledger", "payroll_settings"], (f) => api("/employees/rules", { method: "PUT", body: rulesPayload(f, employeeId) }), employeeId ? "Employee rules saved" : "Default rules saved");
  const set = <K extends keyof RulesForm>(k: K, v: RulesForm[K]) => { setForm((f) => ({ ...f, [k]: v })); setTouched(true); };
  const submit = () => save.mutate(form, { onSuccess: () => { setTouched(false); qc.invalidateQueries({ queryKey: ["attendance_today"] }); onSaved?.(); } });
  const toggleOff = (d: number, on: boolean) => set("weekly_offs", on ? [...form.weekly_offs, d].sort() : form.weekly_offs.filter((x) => x !== d));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
        <div className="text-fg-secondary">{HISTORY_NOTE}</div>
        <div className="flex items-center gap-2">
          {touched ? <Badge variant="warning">Unsaved changes</Badge> : null}
          <Button variant="secondary" onClick={() => { setForm(ruleToForm(initial ?? fallback ?? null)); setTouched(false); }} disabled={!touched}>Reset</Button>
          <Button onClick={submit} loading={save.isPending} disabled={hasErrors}>{employeeId && !initial ? "Create override" : "Save rules"}</Button>
        </div>
      </div>

      <Section title="Master switch" hint="A master switch decides whether rules apply at all; with it off every scan simply records as Present." aside={<Badge variant={form.rules_enabled ? "success" : "neutral"}>{form.rules_enabled ? "Rules on" : "Rules off"}</Badge>}>
        <div className="sm:col-span-2"><Switch checked={form.rules_enabled} onChange={(v) => set("rules_enabled", v)} label="Apply attendance rules (thresholds, penalties, fines and overtime)" /></div>
      </Section>

      <Section title="Shift" hint={<>Business hours{businessHours ? ` (${businessHours})` : ""} come from Store settings and act as the last fallback for a shift start. {employeeId ? "A blank field here falls back to the business defaults." : "Blank fields fall back to business hours."}</>}>
        <Field label="Shift start" error={errors.shift_start}><Input type="time" value={form.shift_start} onChange={(e) => set("shift_start", e.target.value)} /></Field>
        <Field label="Shift end" error={errors.shift_end} hint="Overtime is measured from this time"><Input type="time" value={form.shift_end} onChange={(e) => set("shift_end", e.target.value)} /></Field>
      </Section>

      <Section title="Thresholds" hint="Minutes from that employee's shift start, judged on the first scan. Status is decided at check-in only; checkout never changes it. A blank field skips that rule.">
        <Field label="Late after (minutes)" error={errors.late_after_minutes}><Input type="number" min={0} inputMode="numeric" value={form.late_after_minutes} onChange={(e) => set("late_after_minutes", e.target.value)} placeholder="Blank skips this rule" /></Field>
        <Field label="Half day after (minutes)" error={errors.half_day_after_minutes}><Input type="number" min={0} inputMode="numeric" value={form.half_day_after_minutes} onChange={(e) => set("half_day_after_minutes", e.target.value)} placeholder="Blank skips this rule" /></Field>
        <Field label="Absent after (minutes)" error={errors.absent_after_minutes}><Input type="number" min={0} inputMode="numeric" value={form.absent_after_minutes} onChange={(e) => set("absent_after_minutes", e.target.value)} placeholder="Blank skips this rule" /></Field>
      </Section>

      <Section title="Overtime" hint="Off by default. Measured from shift end and only when the employee actually clocks out. A day with no check-out earns nothing and is flagged as a missing punch rather than guessed at.">
        <div className="sm:col-span-2"><Switch checked={form.overtime_enabled} onChange={(v) => set("overtime_enabled", v)} label="Pay overtime" /></div>
        <Field label="Rate per hour" error={errors.overtime_rate_minor_per_hour} hint={form.overtime_rate_minor_per_hour ? `${formatMoney(form.overtime_rate_minor_per_hour)} for each full hour after shift end` : undefined}>
          <MoneyInput value={form.overtime_rate_minor_per_hour} onChange={(m) => set("overtime_rate_minor_per_hour", m)} disabled={!form.overtime_enabled} />
        </Field>
      </Section>

      <Section title="Weekly offs" hint="Selected days are never counted absent. The days left unticked are saved as the working days.">
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          {WEEKDAYS.map((d) => <Checkbox key={d.value} label={d.label} checked={form.weekly_offs.includes(d.value)} onChange={(e) => toggleOff(d.value, e.target.checked)} />)}
        </div>
        {errors.weekly_offs ? <p className="text-xs text-danger sm:col-span-2">{errors.weekly_offs}</p> : null}
      </Section>

      <Section title="No-scan day" hint="Holidays, weekly offs and approved leave are always excluded.">
        <div className="sm:col-span-2"><Switch checked={form.no_scan_counts_absent} onChange={(v) => set("no_scan_counts_absent", v)} label="A day with no scan counts as absent" /></div>
      </Section>

      <Section title="Free allowances" hint="The first N lates, half days and absents per month are forgiven before any charge.">
        <Field label="Free lates per month" error={errors.free_lates}><Input type="number" min={0} inputMode="numeric" value={form.free_lates} onChange={(e) => set("free_lates", e.target.value)} /></Field>
        <Field label="Free half days per month" error={errors.free_half_days}><Input type="number" min={0} inputMode="numeric" value={form.free_half_days} onChange={(e) => set("free_half_days", e.target.value)} /></Field>
        <Field label="Free absents per month" error={errors.free_absents}><Input type="number" min={0} inputMode="numeric" value={form.free_absents} onChange={(e) => set("free_absents", e.target.value)} /></Field>
      </Section>

      <Section title="Penalties" hint="Per status: Fine only, Lose the day's pay, Both, or Not charged, plus a flat fine. A lost day is valued by the payroll divisor; half-day and absent deductions apply automatically, so a fine on top is optional.">
        <PenaltyRow label="Late" penalty={form.late_penalty} fine={form.late_fine_minor} onPenalty={(p) => set("late_penalty", p)} onFine={(m) => set("late_fine_minor", m)} error={errors.late_penalty} />
        <PenaltyRow label="Half day" penalty={form.half_day_penalty} fine={form.half_day_fine_minor} onPenalty={(p) => set("half_day_penalty", p)} onFine={(m) => set("half_day_fine_minor", m)} error={errors.half_day_penalty} hint="Lose the day's pay deducts half a day" />
        <PenaltyRow label="Absent" penalty={form.absent_penalty} fine={form.absent_fine_minor} onPenalty={(p) => set("absent_penalty", p)} onFine={(m) => set("absent_fine_minor", m)} error={errors.absent_penalty} />
      </Section>

      <Section title="Fine cap" hint="Optional monthly cap per employee. Caps fines only; lost-day deductions are never capped.">
        <Field label="Monthly fine cap" error={errors.fine_cap_minor} hint="Leave at zero for no cap"><MoneyInput value={form.fine_cap_minor} onChange={(m) => set("fine_cap_minor", m)} /></Field>
      </Section>

      <Section title="Checkout gap" hint='Cannot check out within N minutes of check-in. A second scan inside the gap shows "Already Marked". Manual checkout by an admin or cashier is always allowed, and anyone who never checks out is auto-closed at the end of the business day.'>
        <Field label="Gap (minutes)" error={errors.checkout_gap_minutes}><Input type="number" min={0} inputMode="numeric" value={form.checkout_gap_minutes} onChange={(e) => set("checkout_gap_minutes", e.target.value)} /></Field>
      </Section>

      <div className="flex justify-end gap-2">
        <Button onClick={submit} loading={save.isPending} disabled={hasErrors}>{employeeId && !initial ? "Create override" : "Save rules"}</Button>
      </div>
    </div>
  );
}

/** The Defaults tab: loads the business-wide rule (employee_id null) and shows the form. */
export function DefaultRulesForm({ businessHours }: { businessHours?: string | null }) {
  const rules = useRules();
  if (rules.isLoading) return <Loading />;
  const defaults = rules.data?.find((r) => !r.employee_id) ?? null;
  return <RulesForm initial={defaults} fallback={null} businessHours={businessHours} />;
}

/** Per-employee rules: "Uses business defaults" until an override is created; the override can be removed by saving the defaults back. */
export function EmployeeRulesForm({ employeeId, businessHours }: { employeeId: string; businessHours?: string | null }) {
  const rules = useRules();
  const [creating, setCreating] = useState(false);
  useEffect(() => setCreating(false), [employeeId]);
  if (rules.isLoading) return <Loading />;
  const defaults = rules.data?.find((r) => !r.employee_id) ?? null;
  const own = rules.data?.find((r) => r.employee_id === employeeId) ?? null;
  if (!own && !creating) {
    return (
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium"><Badge variant="neutral">Uses business defaults</Badge></div>
            <p className="mt-1 text-sm text-fg-secondary">This employee follows the Defaults tab. Create an override to give them their own shift, thresholds, allowances and fines. Per-employee rules override the business defaults.</p>
          </div>
          <Button onClick={() => setCreating(true)}>Create override</Button>
        </CardBody>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-fg-secondary">{own ? <Badge variant="primary">Own rules</Badge> : <Badge variant="warning">New override (not saved yet)</Badge>}{own ? "This employee has an override; the Defaults tab no longer applies to them." : "Starts from the business defaults; save to apply."}</div>
      <RulesForm employeeId={employeeId} initial={own} fallback={defaults ?? BLANK_RULES_AS_RULE} businessHours={businessHours} onSaved={() => setCreating(false)} />
    </div>
  );
}

// A blank rule shaped like the API's, for an employee override when no defaults exist yet.
const BLANK_RULES_AS_RULE: AttendanceRuleSet = {
  id: "", employee_id: null, shift_start: null, shift_end: null, grace_minutes: 0, late_fine_minor: 0, late_fine_after_minutes: 0, absent_rule: "calendar_days", working_days: [0, 1, 2, 3, 4, 5, 6], require_fingerprint_to_close_shift: false,
  rules_enabled: BLANK_RULES.rules_enabled, late_after_minutes: null, half_day_after_minutes: null, absent_after_minutes: null, overtime_enabled: false, overtime_rate_minor_per_hour: 0, no_scan_counts_absent: false,
  free_lates: 0, free_half_days: 0, free_absents: 0, late_penalty: "fine_only", half_day_penalty: "lose_day", absent_penalty: "lose_day", half_day_fine_minor: 0, absent_fine_minor: 0, fine_cap_minor: null, checkout_gap_minutes: 0, fixed_divisor: 26,
};
