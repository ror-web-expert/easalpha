"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Users, Plus, Upload, Check, UserX, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { Customer, CustomerGroup, CustomerInsights } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { usePagedList, useDebounced } from "@/lib/hooks";
import { Cards, FilterBar, LoadMore, PageHeader, SearchInput } from "@/components/admin/page";
import { useAction, useList, useSave } from "@/components/admin/crud";
import { balanceLabel, balanceVariant, customerSourceLabel, customerStatusLabel, customerStatusVariant } from "@/components/admin/marketing-helpers";
import { Badge, Button, Checkbox, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Select, SummaryCard, Table, TBody, TD, TH, THead, TR, Tabs, Textarea } from "@/components/ui";

// SPEC "Customers are ledger accounts": Khata No., balance reading Settled or To Receive, source, and the lifecycle
// Active / Pending approval / Deactivated so online sign-ups can be held for approval.

interface Form { name: string; phone: string; email: string; company: string; group_id: string; credit_limit_minor: number; whatsapp_opt_in: boolean; notes: string }
const blank: Form = { name: "", phone: "+92", email: "", company: "", group_id: "", credit_limit_minor: 0, whatsapp_opt_in: true, notes: "" };
type StatusTab = "" | "active" | "pending_approval" | "deactivated";

export default function CustomersPage() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [group, setGroup] = useState("");
  const [status, setStatus] = useState<StatusTab>("");
  const [withBalance, setWithBalance] = useState(false);
  const groups = useList<CustomerGroup>("customer_groups", "/customer_groups");
  const list = usePagedList<Customer>(["customers"], "/customers", { q: dq, group_id: group, status, with_balance: withBalance ? "true" : "" });
  const summary = useQuery({ queryKey: ["ledger_summary"], queryFn: () => api<{ total_outstanding_minor: number; customers_with_due: number; credit_customers: number; total_customers: number; collected_this_month_minor: number }>("/customers/ledger_summary") });
  // Status counts for the tabs come from the insights totals (one cheap call; rows are capped at 1).
  const counts = useQuery({ queryKey: ["customer_status_counts"], queryFn: () => api<CustomerInsights>("/customers/insights", { query: { limit: 1 } }), select: (r) => r.totals.by_status });
  const [form, setForm] = useState<Form | null>(null);
  const save = useSave<Form>(["customers", "ledger_summary", "customer_status_counts"], () => "/customers", { onSuccess: () => setForm(null), success: "Customer added" });
  const approve = useAction<string>(["customers", "customer_status_counts"], (id) => api(`/customers/${id}/approve`, { method: "POST" }), "Customer approved");
  const setCustomerStatus = useAction<{ id: string; status: string }>(["customers", "customer_status_counts"], ({ id, status: s }) => api(`/customers/${id}`, { method: "PATCH", body: { status: s } }), "Customer updated");
  const [busy, setBusy] = useState<string | null>(null);
  const s = summary.data;
  const by = counts.data ?? {};
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  return (
    <>
      <PageHeader icon={Users} title="Customers" description="Ledger accounts with a Khata No. and a balance that reads Settled or To Receive. Online sign-ups wait as Pending approval." actions={<>
        <Link href="/admin/customers/import"><Button variant="secondary"><Upload className="h-4 w-4" /> Import CSV</Button></Link>
        <Link href="/admin/customers/groups"><Button variant="secondary">Groups</Button></Link>
        <Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New customer</Button>
      </>} />
      <Cards>
        <SummaryCard label="Customers" value={s?.total_customers ?? 0} sub={`${s?.credit_customers ?? 0} on credit`} />
        <SummaryCard label="To receive" value={formatMoney(s?.total_outstanding_minor)} sub={`${s?.customers_with_due ?? 0} customers owe`} tone="warning" />
        <SummaryCard label="Collected this month" value={formatMoney(s?.collected_this_month_minor)} tone="success" />
        <Link href="/admin/customers/ar-aging"><SummaryCard label="AR Aging" value="Open" sub="Who owes for how long" tone="neutral" className="h-full hover:border-primary" /></Link>
      </Cards>
      <Tabs value={status} onChange={setStatus} className="mb-4" items={[
        { value: "", label: "All", count: counts.data ? total : undefined },
        { value: "active", label: "Active", count: by.active ?? 0 },
        { value: "pending_approval", label: "Pending approval", count: by.pending_approval ?? 0 },
        { value: "deactivated", label: "Deactivated", count: by.deactivated ?? 0 },
      ]} />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Name, phone, khata no" />
        <Select className="w-auto" value={group} onChange={(e) => setGroup(e.target.value)}><option value="">All groups</option>{groups.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
        <Checkbox label="With balance" checked={withBalance} onChange={(e) => setWithBalance(e.target.checked)} />
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Khata No.</TH><TH>Customer</TH><TH>Phone</TH><TH>Source</TH><TH>Group</TH><TH>Status</TH><TH right>Orders</TH><TH right>Spent</TH><TH right>Balance</TH><TH>Last order</TH><TH right></TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((c) => (
              <TR key={c.id}>
                <TD className="font-mono text-xs text-fg-secondary">{c.khata_no ?? "-"}</TD>
                <TD><Link href={`/admin/customers/${c.id}`} className="font-medium text-primary hover:underline">{c.name}</Link>{c.is_walk_in ? <Badge className="ml-2">walk-in</Badge> : null}</TD>
                <TD className="text-fg-secondary">{c.phone ?? "-"}</TD>
                <TD className="text-fg-secondary">{customerSourceLabel(c.source)}</TD>
                <TD className="text-fg-secondary">{groups.data?.find((g) => g.id === c.group_id)?.name ?? "-"}</TD>
                <TD><Badge variant={customerStatusVariant(c.status)}>{customerStatusLabel(c.status)}</Badge></TD>
                <TD right>{c.orders_count}</TD>
                <TD right>{formatMoney(c.net_spent_minor)}</TD>
                <TD right><span className={c.balance_minor > 0 ? "font-medium text-danger" : "text-fg-secondary"}>{c.balance_minor ? formatMoney(Math.abs(c.balance_minor)) : ""}</span> <Badge variant={balanceVariant(c.balance_minor)}>{balanceLabel(c.balance_minor)}</Badge></TD>
                <TD className="text-fg-secondary">{c.last_order_at ? formatDateTime(c.last_order_at) : "-"}</TD>
                <TD right>
                  {c.is_walk_in ? null : c.status === "pending_approval" ? (
                    <Button size="sm" variant="soft" loading={approve.isPending && busy === c.id} onClick={() => { setBusy(c.id); approve.mutate(c.id, { onSettled: () => setBusy(null) }); }}><Check className="h-4 w-4" /> Approve</Button>
                  ) : c.status === "deactivated" ? (
                    <Button size="sm" variant="secondary" loading={setCustomerStatus.isPending && busy === c.id} onClick={() => { setBusy(c.id); setCustomerStatus.mutate({ id: c.id, status: "active" }, { onSettled: () => setBusy(null) }); }}><UserCheck className="h-4 w-4" /> Reactivate</Button>
                  ) : (
                    <Button size="sm" variant="ghost" loading={setCustomerStatus.isPending && busy === c.id} onClick={() => { setBusy(c.id); setCustomerStatus.mutate({ id: c.id, status: "deactivated" }, { onSettled: () => setBusy(null) }); }}><UserX className="h-4 w-4" /> Deactivate</Button>
                  )}
                </TD>
              </TR>
            )) : <EmptyRow colSpan={11}>{status === "pending_approval" ? "No sign-ups waiting for approval." : "No customers yet. Add one or import a CSV."}</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
      <Dialog open={!!form} onClose={() => setForm(null)} title="New customer"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name} onClick={() => form && save.mutate({ ...form, group_id: form.group_id || (null as unknown as string), email: form.email || (null as unknown as string) })}>Save</Button></>}>
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Field label="Phone"><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Company"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
            <Field label="Group"><Select value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}><option value="">None</option>{groups.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
            <Field label="Credit limit" hint="0 = no khata"><MoneyInput value={form.credit_limit_minor} onChange={(v) => setForm({ ...form, credit_limit_minor: v })} /></Field>
            <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <Checkbox label="WhatsApp opt-in" checked={form.whatsapp_opt_in} onChange={(e) => setForm({ ...form, whatsapp_opt_in: e.target.checked })} />
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
