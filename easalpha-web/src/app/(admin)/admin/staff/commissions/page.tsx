"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HandCoins, Plus, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { CommissionAppliesTo, CommissionBasis, CommissionReport, CommissionRule } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { daysAgo, isoDay } from "@/lib/dates";
import { Cards, DateRangePicker, FilterBar, PageHeader, type DateRange } from "@/components/admin/page";
import { useList, useRemove, useSave } from "@/components/admin/crud";
import { APPLIES_LABELS, BASIS_LABELS, staffName, useRoles, useStaff } from "@/components/admin/phase3";
import { Badge, Button, Card, CardHeader, CardTitle, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, Select, SummaryCard, Switch, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface Form { id?: string; name: string; applies_to: CommissionAppliesTo; scope: "everyone" | "role" | "person"; role_key: string; membership_id: string; basis: CommissionBasis; value: string; active: boolean }
const blank: Form = { name: "", applies_to: "waiter", scope: "everyone", role_key: "", membership_id: "", basis: "percent_of_sales", value: "2", active: true };

export default function CommissionsPage() {
  const rules = useList<CommissionRule>("commission_rules", "/commission_rules");
  const roles = useRoles();
  const staff = useStaff();
  const [range, setRange] = useState<DateRange>({ from: daysAgo(29), to: isoDay() });
  const report = useQuery({ queryKey: ["commission_report", range], queryFn: () => api<CommissionReport>("/reports/commissions", { query: { from: range.from, to: range.to } }) });
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<CommissionRule | null>(null);
  const save = useSave<Record<string, unknown>>(["commission_rules", "commission_report"], (f) => (f.id ? `/commission_rules/${f.id}` : "/commission_rules"), { onSuccess: () => setForm(null), success: "Rule saved" });
  const remove = useRemove(["commission_rules", "commission_report"], (id) => `/commission_rules/${id}`, "Rule deleted");
  const systemRoles = roles.data?.filter((r) => r.system_key) ?? [];
  const valueLabel = (b: CommissionBasis, v: number) => b === "percent_of_sales" ? `${v}% of sales` : b === "per_order" ? `${formatMoney(v * 100)} per order` : `${formatMoney(v * 100)} per item`;
  const submit = () => form && save.mutate({ id: form.id, name: form.name, applies_to: form.applies_to, role_key: form.scope === "role" ? form.role_key || null : null, membership_id: form.scope === "person" ? form.membership_id || null : null, basis: form.basis, value: Number(form.value) || 0, active: form.active });
  const r = report.data;
  return (
    <>
      <PageHeader icon={HandCoins} title="Commissions" description="Rules pay staff a share of what they sell: order takers, waiters, cashiers and riders. The report feeds payroll for linked employees." actions={<Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New rule</Button>} />
      <Card className="mb-5">
        <CardHeader><CardTitle>Rules</CardTitle><span className="text-xs text-fg-muted">{rules.data?.filter((x) => x.active).length ?? 0} active</span></CardHeader>
        {rules.isLoading ? <Loading /> : (
          <Table>
            <THead><tr><TH>Rule</TH><TH>Applies to</TH><TH>Who</TH><TH>Pays</TH><TH>Status</TH><TH right>Actions</TH></tr></THead>
            <TBody>
              {rules.data?.length ? rules.data.map((x) => (
                <TR key={x.id} className={x.active ? "" : "opacity-60"}>
                  <TD className="font-medium">{x.name}</TD>
                  <TD><Badge variant="info">{APPLIES_LABELS[x.applies_to] ?? x.applies_to}</Badge></TD>
                  <TD className="text-fg-secondary">{x.membership_id ? staffName(staff.data, x.membership_id) : x.role_key ? `Role: ${roles.data?.find((ro) => ro.system_key === x.role_key)?.name ?? x.role_key}` : "Everyone in that position"}</TD>
                  <TD>{valueLabel(x.basis, x.value)}</TD>
                  <TD><Badge variant={x.active ? "success" : "neutral"}>{x.active ? "active" : "paused"}</Badge></TD>
                  <TD right>
                    <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setForm({ id: x.id, name: x.name, applies_to: x.applies_to, scope: x.membership_id ? "person" : x.role_key ? "role" : "everyone", role_key: x.role_key ?? "", membership_id: x.membership_id ?? "", basis: x.basis, value: String(x.value), active: x.active })}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => setDel(x)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                  </TD>
                </TR>
              )) : <EmptyRow colSpan={6}>No rules yet. A common start: waiters 2% of sales, riders Rs 50 per order.</EmptyRow>}
            </TBody>
          </Table>
        )}
      </Card>
      <h2 className="mb-2 text-base font-semibold">Commission report</h2>
      <FilterBar><DateRangePicker value={range} onChange={setRange} /></FilterBar>
      {report.isLoading || !r ? <Loading /> : (
        <>
          <Cards>
            <SummaryCard label="Total commission" value={formatMoney(r.total_commission_minor)} tone="primary" />
            <SummaryCard label="People earning" value={r.rows.filter((x) => x.commission_minor > 0).length} sub={`${r.rows.length} with sales in the period`} tone="neutral" />
            <SummaryCard label="Sales covered" value={formatMoney(r.rows.reduce((a, x) => a + x.sales_minor, 0))} sub="Counted once per position" tone="success" />
          </Cards>
          <Table>
            <THead><tr><TH>Staff</TH><TH>Position</TH><TH right>Orders</TH><TH right>Items</TH><TH right>Sales</TH><TH>Rules</TH><TH right>Commission</TH></tr></THead>
            <TBody>
              {r.rows.length ? r.rows.map((x) => (
                <TR key={`${x.membership_id}-${x.applies_to}`}>
                  <TD><div className="font-medium">{x.name}</div><div className="text-xs text-fg-muted">{x.role}</div></TD>
                  <TD><Badge variant="info">{APPLIES_LABELS[x.applies_to] ?? x.applies_to}</Badge></TD>
                  <TD right>{x.orders}</TD><TD right>{x.items}</TD><TD right>{formatMoney(x.sales_minor)}</TD>
                  <TD className="text-xs text-fg-secondary">{x.rules.length ? x.rules.join(", ") : <span className="text-fg-muted">no matching rule</span>}</TD>
                  <TD right className="font-medium">{formatMoney(x.commission_minor)}</TD>
                </TR>
              )) : <EmptyRow colSpan={7}>No paid orders with staff attached in this range.</EmptyRow>}
            </TBody>
          </Table>
        </>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit rule" : "New commission rule"}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name.trim() || (form?.scope === "role" && !form.role_key) || (form?.scope === "person" && !form.membership_id)} onClick={submit}>Save</Button></>}>
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Waiter 2%" autoFocus /></Field>
            <Field label="Applies to" hint="Which part the person played on the order"><Select value={form.applies_to} onChange={(e) => setForm({ ...form, applies_to: e.target.value as CommissionAppliesTo })}>{Object.entries(APPLIES_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Who"><Select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as Form["scope"] })}><option value="everyone">Everyone in that position</option><option value="role">Only a role</option><option value="person">One person</option></Select></Field>
            {form.scope === "role" ? <Field label="Role"><Select value={form.role_key} onChange={(e) => setForm({ ...form, role_key: e.target.value })}><option value="">Choose…</option>{systemRoles.map((ro) => <option key={ro.id} value={ro.system_key!}>{ro.name}</option>)}</Select></Field> : null}
            {form.scope === "person" ? <Field label="Staff member"><Select value={form.membership_id} onChange={(e) => setForm({ ...form, membership_id: e.target.value })}><option value="">Choose…</option>{staff.data?.map((m) => <option key={m.id} value={m.id}>{m.user?.name ?? m.id} ({m.role.name})</option>)}</Select></Field> : null}
            <Field label="Basis"><Select value={form.basis} onChange={(e) => setForm({ ...form, basis: e.target.value as CommissionBasis })}>{Object.entries(BASIS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label={form.basis === "percent_of_sales" ? "Percent" : "Rupees"}><Input type="number" min={0} step="any" className="tabular" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></Field>
            <Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Active" />
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })} title={`Delete ${del?.name}?`} description="Past payroll keeps what was already paid." confirmLabel="Delete" destructive loading={remove.isPending} />
    </>
  );
}
