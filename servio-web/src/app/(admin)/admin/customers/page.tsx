"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Users, Plus, Upload } from "lucide-react";
import { api } from "@/lib/api";
import type { Customer, CustomerGroup } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { usePagedList, useDebounced } from "@/lib/hooks";
import { Cards, FilterBar, LoadMore, PageHeader, SearchInput } from "@/components/admin/page";
import { useList, useSave } from "@/components/admin/crud";
import { Badge, Button, Checkbox, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Select, SummaryCard, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";

interface Form { name: string; phone: string; email: string; company: string; group_id: string; credit_limit_minor: number; whatsapp_opt_in: boolean; notes: string }
const blank: Form = { name: "", phone: "+92", email: "", company: "", group_id: "", credit_limit_minor: 0, whatsapp_opt_in: true, notes: "" };

export default function CustomersPage() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [group, setGroup] = useState("");
  const [status, setStatus] = useState("");
  const [withBalance, setWithBalance] = useState(false);
  const groups = useList<CustomerGroup>("customer_groups", "/customer_groups");
  const list = usePagedList<Customer>(["customers"], "/customers", { q: dq, group_id: group, status, with_balance: withBalance ? "true" : "" });
  const summary = useQuery({ queryKey: ["ledger_summary"], queryFn: () => api<{ total_outstanding_minor: number; customers_with_due: number; credit_customers: number; total_customers: number; collected_this_month_minor: number }>("/customers/ledger_summary") });
  const [form, setForm] = useState<Form | null>(null);
  const save = useSave<Form>(["customers", "ledger_summary"], () => "/customers", { onSuccess: () => setForm(null), success: "Customer added" });
  const s = summary.data;
  return (
    <>
      <PageHeader icon={Users} title="Customers" description="Khata (credit) balances, groups and order history." actions={<>
        <Link href="/admin/customers/import"><Button variant="secondary"><Upload className="h-4 w-4" /> Import CSV</Button></Link>
        <Link href="/admin/customers/groups"><Button variant="secondary">Groups</Button></Link>
        <Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New customer</Button>
      </>} />
      <Cards>
        <SummaryCard label="Customers" value={s?.total_customers ?? 0} sub={`${s?.credit_customers ?? 0} on credit`} />
        <SummaryCard label="Khata outstanding" value={formatMoney(s?.total_outstanding_minor)} sub={`${s?.customers_with_due ?? 0} customers owe`} tone="warning" />
        <SummaryCard label="Collected this month" value={formatMoney(s?.collected_this_month_minor)} tone="success" />
        <Link href="/admin/customers/aging"><SummaryCard label="Aging report" value="Open" sub="Who owes for how long" tone="neutral" className="h-full hover:border-primary" /></Link>
      </Cards>
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Name, phone, khata no" />
        <Select className="w-auto" value={group} onChange={(e) => setGroup(e.target.value)}><option value="">All groups</option>{groups.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="active">Active</option><option value="pending_approval">Pending approval</option><option value="deactivated">Deactivated</option></Select>
        <Checkbox label="With balance" checked={withBalance} onChange={(e) => setWithBalance(e.target.checked)} />
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Customer</TH><TH>Phone</TH><TH>Group</TH><TH>Status</TH><TH right>Orders</TH><TH right>Spent</TH><TH right>Balance</TH><TH>Last order</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((c) => (
              <TR key={c.id}>
                <TD><Link href={`/admin/customers/${c.id}`} className="font-medium text-primary hover:underline">{c.name}</Link>{c.khata_no ? <span className="ml-2 font-mono text-xs text-fg-muted">{c.khata_no}</span> : null}{c.is_walk_in ? <Badge className="ml-2">walk-in</Badge> : null}</TD>
                <TD className="text-fg-secondary">{c.phone ?? "-"}</TD>
                <TD className="text-fg-secondary">{groups.data?.find((g) => g.id === c.group_id)?.name ?? "-"}</TD>
                <TD><Badge variant={c.status === "active" ? "success" : c.status === "pending_approval" ? "warning" : "neutral"}>{c.status.replace("_", " ")}</Badge></TD>
                <TD right>{c.orders_count}</TD>
                <TD right>{formatMoney(c.net_spent_minor)}</TD>
                <TD right className={c.balance_minor > 0 ? "font-medium text-danger" : ""}>{c.balance_minor ? formatMoney(c.balance_minor) : "-"}</TD>
                <TD className="text-fg-secondary">{c.last_order_at ? formatDateTime(c.last_order_at) : "-"}</TD>
              </TR>
            )) : <EmptyRow colSpan={8}>No customers yet. Add one or import a CSV.</EmptyRow>}
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
