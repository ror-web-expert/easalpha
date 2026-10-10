"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Plus, Pencil, Trash2, Eye, Send, AlertTriangle } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Branch, ReportSchedule, ReportScheduleKind } from "@/lib/types";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/admin/page";
import { useList, useRemove, useSave } from "@/components/admin/crud";
import { TagInput } from "@/components/ui/tag-input";
import { Badge, Button, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, Select, Switch, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { toast } from "@/store/toast";

interface Form { id?: string; name: string; kind: ReportScheduleKind; cadence: "daily" | "weekly" | "monthly"; hour: number; weekday: number; day_of_month: number; channel: "whatsapp" | "email" | "both"; recipients: string[]; branch_id: string; active: boolean }
const KINDS: { value: ReportScheduleKind; label: string; hint: string }[] = [
  { value: "daily_summary", label: "Daily summary", hint: "Sales, orders, cash, voids and discounts in one message" },
  { value: "sales", label: "Sales", hint: "Revenue by day and payment method" },
  { value: "items", label: "Items sold", hint: "Top products and quantities" },
  { value: "cashiers", label: "Cashiers", hint: "Orders and sales per cashier" },
  { value: "grand", label: "Grand report", hint: "Everything, for the owner" },
  { value: "stock_sheet", label: "Stock sheet", hint: "Opening, in, out, waste, closing" },
  { value: "expenses", label: "Expenses", hint: "Spending by category" },
  { value: "payables", label: "Payables", hint: "What is owed to suppliers" },
  { value: "khata", label: "Khata", hint: "Customer credit outstanding" },
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const blank: Form = { name: "", kind: "daily_summary", cadence: "daily", hour: 9, weekday: 1, day_of_month: 1, channel: "whatsapp", recipients: [], branch_id: "", active: true };
const isContact = (s: string) => /^\+?[\d\s-]{7,}$/.test(s) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? "am" : "pm"}`;

export default function ReportSchedulesPage() {
  const qc = useQueryClient();
  const list = useList<ReportSchedule>("report_schedules", "/report_schedules");
  const branches = useList<Branch>("branches", "/branches");
  const save = useSave<Record<string, unknown>>(["report_schedules"], (f) => (f.id ? `/report_schedules/${f.id}` : "/report_schedules"), { onSuccess: () => setForm(null), success: "Schedule saved" });
  const remove = useRemove(["report_schedules"], (id) => `/report_schedules/${id}`, "Schedule deleted");
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<ReportSchedule | null>(null);
  const [preview, setPreview] = useState<{ s: ReportSchedule; text: string | null } | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const showPreview = async (s: ReportSchedule) => {
    setPreview({ s, text: null });
    try { const r = await api<{ text: string }>(`/report_schedules/${s.id}/preview`); setPreview({ s, text: r.text }); }
    catch (e) { toast.error("Could not preview", errorMessage(e)); setPreview(null); }
  };
  const runNow = async (s: ReportSchedule) => {
    setRunning(s.id);
    try { const r = await api<{ sent_to?: string[] }>(`/report_schedules/${s.id}/run`, { method: "POST" }); toast.success(`${s.name} sent`, r.sent_to?.length ? `To ${r.sent_to.join(", ")}` : undefined); qc.invalidateQueries({ queryKey: ["report_schedules"] }); }
    catch (e) { toast.error("Could not send", errorMessage(e)); }
    finally { setRunning(null); }
  };
  const when = (s: ReportSchedule) => s.cadence === "daily" ? `Daily at ${hourLabel(s.hour)}` : s.cadence === "weekly" ? `${WEEKDAYS[s.weekday]}s at ${hourLabel(s.hour)}` : `Day ${s.day_of_month} of the month at ${hourLabel(s.hour)}`;
  return (
    <>
      <PageHeader icon={CalendarRange} title="Scheduled reports" description="Reports sent by WhatsApp or email on a schedule. Daily covers yesterday, weekly the last 7 days, monthly the last month." actions={<Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New schedule</Button>} />
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Schedule</TH><TH>Report</TH><TH>When</TH><TH>Channel</TH><TH>Recipients</TH><TH>Branch</TH><TH>Last run</TH><TH>Next run</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {list.data?.length ? list.data.map((s) => (
              <TR key={s.id} className={s.active ? "" : "opacity-60"}>
                <TD><div className="font-medium">{s.name}</div>{!s.active ? <Badge>paused</Badge> : null}{s.last_error ? <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-danger"><AlertTriangle className="h-3 w-3" /> {s.last_error}</div> : null}</TD>
                <TD>{KINDS.find((k) => k.value === s.kind)?.label ?? s.kind}</TD>
                <TD className="text-fg-secondary">{when(s)}</TD>
                <TD><Badge variant={s.channel === "both" ? "primary" : s.channel === "whatsapp" ? "success" : "info"}>{s.channel === "both" ? "WhatsApp + email" : s.channel === "whatsapp" ? "WhatsApp" : "Email"}</Badge></TD>
                <TD className="max-w-xs text-xs text-fg-secondary"><div className="flex flex-wrap gap-1">{s.recipients.map((r) => <Badge key={r} variant="outline">{r}</Badge>)}</div></TD>
                <TD className="text-fg-secondary">{s.branch_id ? branches.data?.find((b) => b.id === s.branch_id)?.name ?? "…" : "All"}</TD>
                <TD className="text-fg-secondary">{s.last_run_at ? formatDateTime(s.last_run_at) : "-"}</TD>
                <TD className="text-fg-secondary">{s.active && s.next_run_at ? formatDateTime(s.next_run_at) : "-"}</TD>
                <TD right>
                  <Button variant="ghost" size="icon-sm" onClick={() => showPreview(s)} aria-label="Preview" title="Preview"><Eye className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => runNow(s)} loading={running === s.id} aria-label="Run now" title="Send now"><Send className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: s.id, name: s.name, kind: s.kind, cadence: s.cadence, hour: s.hour, weekday: s.weekday, day_of_month: s.day_of_month, channel: s.channel, recipients: s.recipients, branch_id: s.branch_id ?? "", active: s.active })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setDel(s)} aria-label="Delete"><Trash2 className="h-4 w-4 text-danger" /></Button>
                </TD>
              </TR>
            )) : <EmptyRow colSpan={9}>No schedules yet. Start with a daily summary to the owner&apos;s WhatsApp at 9 am.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit schedule" : "New schedule"}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name.trim() || !form?.recipients.length} onClick={() => form && save.mutate({ ...form, branch_id: form.branch_id || null })}>Save</Button></>}>
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Owner daily summary" autoFocus /></Field>
            <Field label="Report" hint={KINDS.find((k) => k.value === form.kind)?.hint}><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ReportScheduleKind })}>{KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></Field>
            <Field label="Cadence"><Select value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value as Form["cadence"] })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></Select></Field>
            <Field label="Hour" hint="Branch time zone"><Select value={form.hour} onChange={(e) => setForm({ ...form, hour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</Select></Field>
            {form.cadence === "weekly" ? <Field label="Weekday"><Select value={form.weekday} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select></Field> : null}
            {form.cadence === "monthly" ? <Field label="Day of month" hint="1 to 28"><Input type="number" min={1} max={28} value={form.day_of_month} onChange={(e) => setForm({ ...form, day_of_month: Math.min(28, Math.max(1, Number(e.target.value))) })} /></Field> : null}
            <Field label="Channel"><Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as Form["channel"] })}><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="both">Both</option></Select></Field>
            <Field label="Branch"><Select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}><option value="">All branches</option>{branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
            <Field label="Recipients" hint="Phone numbers for WhatsApp, emails for email. Press Enter after each." className="sm:col-span-2"><TagInput value={form.recipients} onChange={(v) => setForm({ ...form, recipients: v })} placeholder="0300 1234567, owner@example.com" validate={isContact} /></Field>
            <Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Active" />
          </div>
        ) : null}
      </Dialog>
      <Dialog open={!!preview} onClose={() => setPreview(null)} title={preview ? `Preview: ${preview.s.name}` : ""} description="The text as it would be sent now, for the period the cadence covers." size="lg"
        footer={<><Button variant="secondary" onClick={() => setPreview(null)}>Close</Button>{preview ? <Button loading={running === preview.s.id} onClick={() => runNow(preview.s)}><Send className="h-4 w-4" /> Send now</Button> : null}</>}>
        {preview?.text == null ? <Loading /> : <pre className="whitespace-pre-wrap rounded-md border bg-muted/50 p-4 font-mono text-xs leading-relaxed">{preview.text}</pre>}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })} title={`Delete ${del?.name}?`} confirmLabel="Delete" destructive loading={remove.isPending} />
    </>
  );
}
