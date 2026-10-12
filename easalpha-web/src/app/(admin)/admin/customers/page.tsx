"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Upload, Check, UserX, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { Customer, CustomerGroup, CustomerInsights } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime, isoDay } from "@/lib/dates";
import { usePagedList, useDebounced } from "@/lib/hooks";
import { useModules } from "@/lib/modules";
import { Cards, FilterBar, LoadMore, PageHeader, SearchInput } from "@/components/admin/page";
import { useAction, useList } from "@/components/admin/crud";
import { balanceLabel, balanceVariant, customerSourceLabel, customerStatusLabel, customerStatusVariant } from "@/components/admin/marketing-helpers";
import { DuplicateWarning, usePinRetry, KhataLimitField } from "@/components/admin/customer-accounts";
import { cleanPhone, isFutureDay, openingAmount } from "@/components/admin/customer-accounts-helpers";
import { Badge, Button, Checkbox, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Select, SummaryCard, Switch, Table, TBody, TD, TH, THead, TR, Tabs, Textarea } from "@/components/ui";

// SPEC "Customers are ledger accounts": Khata No., balance reading Settled or To Receive, source, and the lifecycle
// Active / Pending approval / Deactivated so online sign-ups can be held for approval.
// Hostels, canteens and offices: room, roll or ID number and a guardian who can get the account messages too. With
// customer accounts on, a new customer can start with the balance carried over from the paper register (needs
// khata.adjust or a manager PIN). Possible duplicates show while the name, phone, roll or guardian phone is typed.

interface Form {
  name: string; phone: string; email: string; company: string; group_id: string; credit_limit_minor: number | null; whatsapp_opt_in: boolean; notes: string;
  room: string; member_no: string; guardian_name: string; guardian_phone: string; notify_guardian: boolean;
  opening_minor: number; opening_advance: boolean; opening_reason: string; opening_on: string;
}
const blank = (): Form => ({
  // A new customer may buy on account with no limit, the same as one added at the till; the owner can set a limit or turn it off.
  name: "", phone: "+92", email: "", company: "", group_id: "", credit_limit_minor: null, whatsapp_opt_in: true, notes: "",
  room: "", member_no: "", guardian_name: "", guardian_phone: "", notify_guardian: false,
  opening_minor: 0, opening_advance: false, opening_reason: "Opening balance", opening_on: isoDay(),
});
type StatusTab = "" | "active" | "pending_approval" | "deactivated";

export default function CustomersPage() {
  const khata = useModules().customer_accounts;
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [group, setGroup] = useState("");
  const [status, setStatus] = useState<StatusTab>("");
  const [withBalance, setWithBalance] = useState(false);
  const groups = useList<CustomerGroup>("customer_groups", "/customer_groups");
  const list = usePagedList<Customer>(["customers"], "/customers", { q: dq, group_id: group, status, with_balance: khata && withBalance ? "true" : "" });
  const summary = useQuery({ queryKey: ["ledger_summary"], queryFn: () => api<{ total_outstanding_minor: number; customers_with_due: number; credit_customers: number; total_customers: number; collected_this_month_minor: number }>("/customers/ledger_summary"), enabled: khata });
  // Status counts for the tabs come from the insights totals (one cheap call; rows are capped at 1).
  const counts = useQuery({ queryKey: ["customer_status_counts"], queryFn: () => api<CustomerInsights>("/customers/insights", { query: { limit: 1 } }), select: (r) => r.totals.by_status });
  const [form, setForm] = useState<Form | null>(null);
  const { submit, busy, dialog } = usePinRetry();
  const approve = useAction<string>(["customers", "customer_status_counts"], (id) => api(`/customers/${id}/approve`, { method: "POST" }), "Customer approved");
  const setCustomerStatus = useAction<{ id: string; status: string }>(["customers", "customer_status_counts"], ({ id, status: s }) => api(`/customers/${id}`, { method: "PATCH", body: { status: s } }), "Customer updated");
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const s = summary.data;
  const by = counts.data ?? {};
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  const opening = form && khata ? openingAmount(form.opening_minor, form.opening_advance) : 0;
  const openingFuture = !!form && khata && form.opening_minor > 0 && isFutureDay(form.opening_on);
  const save = async () => {
    if (!form) return;
    const body = {
      name: form.name.trim(), phone: cleanPhone(form.phone), email: form.email.trim() || null, company: form.company, group_id: form.group_id || null,
      credit_limit_minor: form.credit_limit_minor, whatsapp_opt_in: form.whatsapp_opt_in, notes: form.notes,
      room: form.room.trim() || null, member_no: form.member_no.trim() || null, guardian_name: form.guardian_name.trim() || null, guardian_phone: cleanPhone(form.guardian_phone), notify_guardian: form.notify_guardian,
      ...(opening ? { opening_balance_minor: opening, opening_reason: form.opening_reason.trim() || "Opening balance", opening_on: form.opening_on || undefined } : {}),
    };
    const out = await submit((pin) => api<Customer>("/customers", { method: "POST", body: { ...body, approver_pin: pin } }),
      { label: opening ? `Opening balance ${formatMoney(Math.abs(opening))}${opening < 0 ? " in advance" : ""} for ${body.name}` : `Add customer ${body.name}`, success: "Customer added", failure: "Could not save the customer" });
    if (!out) return;
    ["customers", "ledger_summary", "customer_status_counts", "customer_search", "customer_bills"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    setForm(null);
  };
  const cols = khata ? 11 : 10;
  return (
    <>
      <PageHeader icon={Users} title="Customers" description={khata ? "Ledger accounts with a Khata No. and a balance that reads Settled or To Receive. Online sign-ups wait as Pending approval." : "Everyone who orders: contact details, groups, room or roll number and order history. Online sign-ups wait as Pending approval."} actions={<>
        <Link href="/admin/customers/import"><Button variant="secondary"><Upload className="h-4 w-4" /> Import CSV</Button></Link>
        <Link href="/admin/customers/groups"><Button variant="secondary">Groups</Button></Link>
        <Button onClick={() => setForm(blank())}><Plus className="h-4 w-4" /> New customer</Button>
      </>} />
      {khata ? (
        <Cards>
          <SummaryCard label="Customers" value={s?.total_customers ?? 0} sub={`${s?.credit_customers ?? 0} on credit`} />
          <SummaryCard label="To receive" value={formatMoney(s?.total_outstanding_minor)} sub={`${s?.customers_with_due ?? 0} customers owe`} tone="warning" />
          <SummaryCard label="Collected this month" value={formatMoney(s?.collected_this_month_minor)} tone="success" />
          <Link href="/admin/customers/ar-aging"><SummaryCard label="AR Aging" value="Open" sub="Who owes for how long" tone="neutral" className="h-full hover:border-primary" /></Link>
        </Cards>
      ) : (
        <Cards>
          <SummaryCard label="Customers" value={counts.data ? total : 0} sub={`${by.active ?? 0} active`} />
          <SummaryCard label="Pending approval" value={by.pending_approval ?? 0} sub="Online sign-ups to check" tone="warning" />
        </Cards>
      )}
      <Tabs value={status} onChange={setStatus} className="mb-4" items={[
        { value: "", label: "All", count: counts.data ? total : undefined },
        { value: "active", label: "Active", count: by.active ?? 0 },
        { value: "pending_approval", label: "Pending approval", count: by.pending_approval ?? 0 },
        { value: "deactivated", label: "Deactivated", count: by.deactivated ?? 0 },
      ]} />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Name, phone, khata no, roll or room" />
        <Select className="w-auto" value={group} onChange={(e) => setGroup(e.target.value)}><option value="">All groups</option>{groups.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
        {khata ? <Checkbox label="With balance" checked={withBalance} onChange={(e) => setWithBalance(e.target.checked)} /> : null}
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Khata No.</TH><TH>Customer</TH><TH>Phone</TH><TH>Source</TH><TH>Group</TH><TH>Status</TH><TH right>Orders</TH><TH right>Spent</TH>{khata ? <TH right>Balance</TH> : null}<TH>Last order</TH><TH right></TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((c) => (
              <TR key={c.id}>
                <TD className="font-mono text-xs text-fg-secondary">{c.khata_no ?? "-"}</TD>
                <TD className="whitespace-nowrap">
                  <Link href={`/admin/customers/${c.id}`} className="font-medium text-primary hover:underline">{c.name}</Link>{c.is_walk_in ? <Badge className="ml-2">walk-in</Badge> : null}
                  {c.member_no ? <span className="ml-2 text-xs text-fg-muted">Roll {c.member_no}</span> : null}
                  {c.room ? <span className="ml-2 text-xs text-fg-muted">Room {c.room}</span> : null}
                </TD>
                <TD className="text-fg-secondary">{c.phone ?? "-"}</TD>
                <TD className="text-fg-secondary">{customerSourceLabel(c.source)}</TD>
                <TD className="text-fg-secondary">{groups.data?.find((g) => g.id === c.group_id)?.name ?? "-"}</TD>
                <TD><Badge variant={customerStatusVariant(c.status)}>{customerStatusLabel(c.status)}</Badge></TD>
                <TD right>{c.orders_count}</TD>
                <TD right>{formatMoney(c.net_spent_minor)}</TD>
                {khata ? <TD right><span className={c.balance_minor > 0 ? "font-medium text-danger" : "text-fg-secondary"}>{c.balance_minor ? formatMoney(Math.abs(c.balance_minor)) : ""}</span> <Badge variant={balanceVariant(c.balance_minor)}>{balanceLabel(c.balance_minor)}</Badge></TD> : null}
                <TD className="text-fg-secondary">{c.last_order_at ? formatDateTime(c.last_order_at) : "-"}</TD>
                <TD right>
                  {c.is_walk_in ? null : c.status === "pending_approval" ? (
                    <Button size="sm" variant="soft" loading={approve.isPending && busyRow === c.id} onClick={() => { setBusyRow(c.id); approve.mutate(c.id, { onSettled: () => setBusyRow(null) }); }}><Check className="h-4 w-4" /> Approve</Button>
                  ) : c.status === "deactivated" ? (
                    <Button size="sm" variant="secondary" loading={setCustomerStatus.isPending && busyRow === c.id} onClick={() => { setBusyRow(c.id); setCustomerStatus.mutate({ id: c.id, status: "active" }, { onSettled: () => setBusyRow(null) }); }}><UserCheck className="h-4 w-4" /> Reactivate</Button>
                  ) : (
                    <Button size="sm" variant="ghost" loading={setCustomerStatus.isPending && busyRow === c.id} onClick={() => { setBusyRow(c.id); setCustomerStatus.mutate({ id: c.id, status: "deactivated" }, { onSettled: () => setBusyRow(null) }); }}><UserX className="h-4 w-4" /> Deactivate</Button>
                  )}
                </TD>
              </TR>
            )) : <EmptyRow colSpan={cols}>{status === "pending_approval" ? "No sign-ups waiting for approval." : "No customers yet. Add one or import a CSV."}</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
      <Dialog open={!!form} onClose={() => setForm(null)} title="New customer" size="lg"
        footer={<>
          {form ? <DuplicateWarning fields={form} showBalance={khata} /> : null}
          <Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
          <Button loading={busy} disabled={!form?.name.trim() || openingFuture} onClick={save}>Save</Button>
        </>}>
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Field label="Phone"><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Room / unit"><Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="B-12" /></Field>
            <Field label="Roll / ID no."><Input value={form.member_no} onChange={(e) => setForm({ ...form, member_no: e.target.value })} placeholder="2024-CS-17" /></Field>
            <Field label="Guardian name"><Input value={form.guardian_name} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} /></Field>
            <Field label="Guardian phone"><Input type="tel" value={form.guardian_phone} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} placeholder="03001234567" /></Field>
            <div className="sm:col-span-2"><Switch checked={form.notify_guardian} onChange={(v) => setForm({ ...form, notify_guardian: v })} label="Send account messages to the guardian too" /></div>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Company"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
            <Field label="Group"><Select value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}><option value="">None</option>{groups.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
            {khata ? <KhataLimitField className="sm:col-span-2" value={form.credit_limit_minor} onChange={(v) => setForm({ ...form, credit_limit_minor: v })} /> : null}
            {khata ? (
              <div className="rounded-xl border px-4 py-3 sm:col-span-2">
                <div className="mb-2 text-sm font-semibold text-heading">Opening balance</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Opening balance (already owes)" hint="From the paper register. Leave blank if none."><MoneyInput value={form.opening_minor} min={0} onChange={(v) => setForm({ ...form, opening_minor: Math.abs(v) })} /></Field>
                  <Field label="This amount is">
                    <Select value={form.opening_advance ? "advance" : "owes"} onChange={(e) => setForm({ ...form, opening_advance: e.target.value === "advance" })}>
                      <option value="owes">Owed by the customer</option>
                      <option value="advance">Paid in advance</option>
                    </Select>
                  </Field>
                  {form.opening_minor > 0 ? (
                    <>
                      <Field label="Reason"><Input value={form.opening_reason} onChange={(e) => setForm({ ...form, opening_reason: e.target.value })} /></Field>
                      <Field label="Date" error={openingFuture ? "The date cannot be in the future" : undefined}><Input type="date" value={form.opening_on} max={isoDay()} onChange={(e) => setForm({ ...form, opening_on: e.target.value })} /></Field>
                    </>
                  ) : null}
                </div>
                {form.opening_minor > 0 ? <p className="mt-2 text-xs text-fg-muted">Needs the Adjust balances permission or a manager PIN.</p> : null}
              </div>
            ) : null}
            <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <Checkbox label="WhatsApp opt-in" checked={form.whatsapp_opt_in} onChange={(e) => setForm({ ...form, whatsapp_opt_in: e.target.checked })} />
          </div>
        ) : null}
      </Dialog>
      {dialog}
    </>
  );
}
