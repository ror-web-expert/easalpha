"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserCircle, HandCoins, Pencil, Star, SlidersHorizontal, BookOpen, Landmark } from "lucide-react";
import { api } from "@/lib/api";
import type { Customer, CustomerGroup, CustomerLoyalty, Ledger, OrderSummary, PaymentMethod } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { cn, titleCase } from "@/lib/utils";
import { usePagedList } from "@/lib/hooks";
import { useModules } from "@/lib/modules";
import { Cards, PageHeader } from "@/components/admin/page";
import { useList, useSave } from "@/components/admin/crud";
import { loyaltyKindVariant } from "@/components/admin/phase3";
import { balanceLabel, balanceVariant } from "@/components/admin/marketing-helpers";
import {
  AdjustBalanceDialog, AdjustmentsTable, BillActions, DuplicateWarning, OpeningBalanceDialog, ReverseAdjustmentDialog, useAdjustments, type ReversibleAdjustment,
} from "@/components/admin/customer-accounts";
import { canReverseEntry, cleanPhone, entryDay, entryDetails, entryKindLabel, entryKindVariant, entryRef, signedMoney } from "@/components/admin/customer-accounts-helpers";
import { useApproval } from "@/components/approval";
import { toast } from "@/store/toast";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Checkbox, Dialog, EmptyRow, Field, Input, Label, Loading, MoneyInput, Select, SummaryCard, Switch, Table, TBody, TD, TH, THead, TR, Tabs, Textarea, orderStatusVariant } from "@/components/ui";
import { OrderDrawer } from "@/components/admin/order-drawer";

// One customer: contact, room / roll / guardian details, orders and loyalty. With customer accounts (khata) on, also
// the ledger, khata payments and the Account section: balance, opening balance, adjustments with reversal, and the
// bill for last month or any period (view, PDF, WhatsApp).

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const khata = useModules().customer_accounts;
  const ledger = useQuery({ queryKey: ["ledger", id], queryFn: () => api<Ledger>(`/customers/${id}/ledger`), enabled: khata });
  const customer = useQuery({ queryKey: ["customer", id], queryFn: () => api<Customer>(`/customers/${id}`) });
  const orders = usePagedList<OrderSummary>(["customer_orders", id], `/customers/${id}/orders`);
  const groups = useList<CustomerGroup>("customer_groups", "/customer_groups");
  const methods = useList<PaymentMethod>("payment_methods", "/payment_methods", {}, khata);
  const adjustments = useAdjustments(id, khata);
  const [tab, setTab] = useState<"ledger" | "orders" | "loyalty">("ledger");
  const activeTab = !khata && tab === "ledger" ? "orders" : tab;
  const qc = useQueryClient();
  const loyalty = useQuery({ queryKey: ["customer_loyalty", id], queryFn: () => api<CustomerLoyalty>(`/customers/${id}/loyalty`), enabled: activeTab === "loyalty" });
  const [adjust, setAdjust] = useState<{ points: string; note: string } | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustingBalance, setAdjustingBalance] = useState(false);
  const [enteringOpening, setEnteringOpening] = useState(false);
  const [reversing, setReversing] = useState<ReversibleAdjustment | null>(null);
  const { run: runApproval, dialog: approvalDialog } = useApproval();
  const doAdjust = async () => {
    if (!adjust) return;
    const pts = Number(adjust.points);
    if (!pts) return;
    setAdjusting(true);
    try {
      await runApproval((pin) => api(`/customers/${id}/loyalty/adjust`, { method: "POST", body: { points: pts, note: adjust.note || null, approver_pin: pin } }), `Adjust ${pts > 0 ? "+" : ""}${pts} points`);
      toast.success("Points adjusted");
      setAdjust(null);
      qc.invalidateQueries({ queryKey: ["customer_loyalty", id] }); qc.invalidateQueries({ queryKey: ["customer", id] });
    } catch (e) { if (!(e instanceof Error && e.message === "Approval cancelled")) toast.error("Could not adjust", e instanceof Error ? e.message : undefined); }
    finally { setAdjusting(false); }
  };
  const [pay, setPay] = useState<{ amount_minor: number; method_code: string; reference: string; direction: "received" | "paid" } | null>(null);
  const [edit, setEdit] = useState<Partial<Customer> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const payM = useSave<NonNullable<typeof pay>>(["ledger", "customer", "customers", "ledger_summary", "customer_bills"], () => `/customers/${id}/payments`, { onSuccess: () => setPay(null), success: "Payment recorded" });
  const editM = useSave<Partial<Customer>>(["customer", "customers", "ledger"], () => `/customers/${id}`, { onSuccess: () => setEdit(null) });
  useEffect(() => { if (pay && !pay.method_code && methods.data?.length) setPay({ ...pay, method_code: methods.data.find((m) => m.kind === "cash")?.code ?? methods.data[0].code }); }, [methods.data, pay]);
  const c = customer.data ?? ledger.data?.customer;
  if (!c) return <Loading />;
  const a = ledger.data?.aging;
  const opening = adjustments.data?.open_opening ?? null;
  const adjustmentRows = adjustments.data?.data ?? [];
  const accountable = khata && !c.is_walk_in;
  const startEdit = () => setEdit({
    name: c.name, phone: c.phone ?? "", email: c.email ?? "", company: c.company ?? "", group_id: c.group_id ?? "", credit_limit_minor: c.credit_limit_minor ?? 0, notes: c.notes ?? "",
    whatsapp_opt_in: c.whatsapp_opt_in, room: c.room ?? "", member_no: c.member_no ?? "", guardian_name: c.guardian_name ?? "", guardian_phone: c.guardian_phone ?? "", notify_guardian: !!c.notify_guardian,
  });
  const saveEdit = () => {
    if (!edit) return;
    // No limit (null) shows as 0 in the field, and 0 means no khata: only send the limit when it was changed.
    const limitChanged = (edit.credit_limit_minor ?? 0) !== (c.credit_limit_minor ?? 0);
    editM.mutate({
      ...edit, id, group_id: edit.group_id || (null as unknown as string),
      room: edit.room?.trim() || null, member_no: edit.member_no?.trim() || null, guardian_name: edit.guardian_name?.trim() || null, guardian_phone: cleanPhone(edit.guardian_phone),
      credit_limit_minor: khata && limitChanged ? edit.credit_limit_minor : undefined,
      ...(c.is_walk_in ? { name: undefined, phone: undefined } : {}),
    });
  };
  return (
    <>
      <PageHeader icon={UserCircle} title={c.name}
        description={[c.phone, c.khata_no ? `Khata ${c.khata_no}` : null, c.member_no ? `Roll ${c.member_no}` : null, c.room ? `Room ${c.room}` : null, c.company, c.group?.name].filter(Boolean).join(" · ")}
        actions={<>
          <Button variant="secondary" onClick={startEdit}><Pencil className="h-4 w-4" /> Edit</Button>
          {khata ? <Button onClick={() => setPay({ amount_minor: Math.max(0, c.balance_minor), method_code: "", reference: "", direction: "received" })}><HandCoins className="h-4 w-4" /> Record khata payment</Button> : null}
        </>} />
      {khata ? (
        <Cards>
          <SummaryCard label="Balance owed" value={formatMoney(c.balance_minor)} sub={c.credit_limit_minor ? `Limit ${formatMoney(c.credit_limit_minor)}` : "No credit limit"} tone={c.balance_minor > 0 ? "danger" : "success"} />
          <SummaryCard label="Orders" value={c.orders_count} sub={c.last_order_at ? `Last ${formatDateTime(c.last_order_at)}` : "No orders yet"} />
          <SummaryCard label="Net spent" value={formatMoney(c.net_spent_minor)} tone="neutral" />
          <SummaryCard label="Overdue (31+ days)" value={formatMoney((a?.["31_60"] ?? 0) + (a?.["61_90"] ?? 0) + (a?.over_90 ?? 0))} sub={a ? `Current ${formatMoney(a.current)} · 31–60 ${formatMoney(a["31_60"])} · 61–90 ${formatMoney(a["61_90"])} · 90+ ${formatMoney(a.over_90)}` : ""} tone="warning" />
        </Cards>
      ) : (
        <Cards>
          <SummaryCard label="Orders" value={c.orders_count} sub={c.last_order_at ? `Last ${formatDateTime(c.last_order_at)}` : "No orders yet"} />
          <SummaryCard label="Net spent" value={formatMoney(c.net_spent_minor)} tone="neutral" />
          <SummaryCard label="Loyalty points" value={c.loyalty_points} tone="neutral" />
        </Cards>
      )}
      {c.member_no || c.room || c.guardian_name || c.guardian_phone ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border bg-card px-5 py-3 text-sm">
          {c.room ? <span><span className="text-fg-secondary">Room / unit</span> <span className="ml-1 font-medium">{c.room}</span></span> : null}
          {c.member_no ? <span><span className="text-fg-secondary">Roll / ID no.</span> <span className="ml-1 font-medium">{c.member_no}</span></span> : null}
          {c.guardian_name || c.guardian_phone ? <span><span className="text-fg-secondary">Guardian</span> <span className="ml-1 font-medium">{[c.guardian_name, c.guardian_phone].filter(Boolean).join(", ")}</span></span> : null}
          {c.guardian_phone ? <Badge variant={c.notify_guardian ? "success" : "neutral"}>{c.notify_guardian ? "Guardian gets account messages" : "Guardian not messaged"}</Badge> : null}
        </div>
      ) : null}
      {accountable ? (
        <Card className="mb-6">
          <CardHeader className="flex-wrap">
            <CardTitle className="flex items-center gap-2"><Landmark className="h-4 w-4 text-fg-secondary" /> Account</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setAdjustingBalance(true)}><SlidersHorizontal className="h-4 w-4" /> Adjust balance</Button>
              <Link href={`/admin/customers/ledger?customer_id=${c.id}`}><Button size="sm" variant="ghost"><BookOpen className="h-4 w-4" /> Open ledger</Button></Link>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Balance</Label>
                <div className="flex items-center gap-2"><span className="text-xl font-bold tabular text-heading">{formatMoney(Math.abs(c.balance_minor))}</span><Badge variant={balanceVariant(c.balance_minor)}>{balanceLabel(c.balance_minor)}</Badge></div>
              </div>
              <div>
                <Label>Opening balance</Label>
                {adjustments.isLoading ? <span className="text-sm text-fg-muted">Loading</span> : opening ? (
                  <div className="text-sm">
                    <span className="font-semibold tabular">{formatMoney(Math.abs(opening.amount_minor))}</span>
                    <span className="ml-1 text-fg-secondary">{opening.amount_minor < 0 ? "paid in advance" : "owed"} · {formatDate(opening.effective_on)} · <span className="font-mono text-xs">{opening.label}</span></span>
                  </div>
                ) : <Button size="sm" variant="soft" onClick={() => setEnteringOpening(true)}>Enter opening balance</Button>}
              </div>
            </div>
            <div>
              <Label>Bill</Label>
              <BillActions customer={c} picker />
            </div>
            {adjustmentRows.length ? <AdjustmentsTable rows={adjustmentRows} onReverse={(x) => setReversing(x)} /> : <p className="text-sm text-fg-muted">No opening balance or adjustments yet.</p>}
          </CardBody>
        </Card>
      ) : null}
      <Tabs value={activeTab} onChange={setTab} items={[
        ...(khata ? [{ value: "ledger" as const, label: "Ledger", count: ledger.data?.entries.length }] : []),
        { value: "orders" as const, label: "Orders", count: c.orders_count },
        { value: "loyalty" as const, label: "Loyalty", count: c.loyalty_points },
      ]} className="mb-4 w-fit" />
      {activeTab === "ledger" ? (
        ledger.isLoading ? <Loading /> : (
          <Table>
            <THead><tr><TH>Date</TH><TH>Entry</TH><TH>Ref</TH><TH>Details</TH><TH right>Amount</TH><TH right>Balance</TH><TH></TH></tr></THead>
            <TBody>
              {ledger.data?.entries.length ? [...ledger.data.entries].reverse().map((e) => (
                <TR key={`${e.kind}-${e.ref}`} onClick={e.order_id ? () => setSelected(e.order_id!) : undefined} className={e.reversed ? "text-fg-muted" : undefined}>
                  <TD className="whitespace-nowrap text-fg-secondary" title={formatDateTime(e.at)}>{formatDate(entryDay(e))}</TD>
                  <TD className="whitespace-nowrap"><Badge variant={entryKindVariant(e.kind)}>{entryKindLabel(e.kind)}</Badge>{e.reversed ? <Badge variant="outline" className="ml-1.5">Reversed</Badge> : null}</TD>
                  <TD className="font-mono text-xs">{entryRef(e) || "-"}</TD>
                  <TD className="max-w-80 truncate text-fg-secondary" title={entryDetails(e)}>{entryDetails(e) || "-"}</TD>
                  <TD right className={cn(e.reversed && "line-through", !e.reversed && (e.amount_minor < 0 ? "text-success" : "text-danger"))}>{signedMoney(e.amount_minor)}</TD>
                  <TD right className="font-medium">{formatMoney(e.balance_minor)}</TD>
                  <TD right>{canReverseEntry(e) ? <Button size="sm" variant="ghost" onClick={(ev) => { ev.stopPropagation(); setReversing({ id: e.ref, label: e.label, kind: e.kind, amount_minor: e.amount_minor, reason: e.reason }); }}>Reverse</Button> : null}</TD>
                </TR>
              )) : <EmptyRow colSpan={7}>No khata activity.</EmptyRow>}
            </TBody>
          </Table>
        )
      ) : activeTab === "orders" ? (
        <Table>
          <THead><tr><TH>Order</TH><TH>Status</TH><TH>When</TH><TH right>Total</TH></tr></THead>
          <TBody>
            {orders.rows.length ? orders.rows.map((o) => (
              <TR key={o.id} onClick={() => setSelected(o.id)}><TD className="font-mono">{o.label}</TD><TD><Badge variant={orderStatusVariant(o.status)}>{o.status}</Badge></TD><TD className="text-fg-secondary">{formatDateTime(o.created_at)}</TD><TD right>{formatMoney(o.total_minor)}</TD></TR>
            )) : <EmptyRow colSpan={4}>No orders yet.</EmptyRow>}
          </TBody>
        </Table>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm"><Star className="h-4 w-4 text-warning" /><span className="text-2xl font-semibold tabular">{loyalty.data?.points ?? c.loyalty_points}</span><span className="text-fg-secondary">points · worth {formatMoney(loyalty.data?.value_minor ?? 0)}</span></div>
            {!c.is_walk_in ? <Button variant="secondary" onClick={() => setAdjust({ points: "", note: "" })}>Adjust points</Button> : null}
          </div>
          {loyalty.isLoading ? <Loading /> : (
            <Table>
              <THead><tr><TH>When</TH><TH>Kind</TH><TH>Note</TH><TH right>Points</TH><TH right>Balance</TH></tr></THead>
              <TBody>
                {loyalty.data?.transactions.length ? loyalty.data.transactions.map((t) => (
                  <TR key={t.id} onClick={t.order_id ? () => setSelected(t.order_id!) : undefined}>
                    <TD className="text-fg-secondary">{formatDateTime(t.occurred_at)}</TD>
                    <TD><Badge variant={loyaltyKindVariant(t.kind)}>{titleCase(t.kind)}</Badge></TD>
                    <TD className="text-fg-secondary">{t.note ?? "-"}</TD>
                    <TD right className={t.points < 0 ? "text-danger" : "text-success"}>{t.points > 0 ? "+" : ""}{t.points}</TD>
                    <TD right className="font-medium">{t.balance_after}</TD>
                  </TR>
                )) : <EmptyRow colSpan={5}>No points activity yet. Points are earned when a paid order names this customer.</EmptyRow>}
              </TBody>
            </Table>
          )}
        </>
      )}
      {c.addresses?.length ? (
        <Card className="mt-4"><CardHeader><CardTitle>Addresses</CardTitle></CardHeader><CardBody><ul className="space-y-1 text-sm">{c.addresses.map((ad) => <li key={ad.id}>{ad.label ? <span className="font-medium">{ad.label}: </span> : null}{ad.text}{ad.is_default ? <Badge className="ml-2" variant="primary">default</Badge> : null}</li>)}</ul></CardBody></Card>
      ) : null}
      <Dialog open={!!pay} onClose={() => setPay(null)} title="Khata payment" description={`Balance ${formatMoney(c.balance_minor)}`} size="sm"
        footer={<><Button variant="secondary" onClick={() => setPay(null)}>Cancel</Button><Button loading={payM.isPending} disabled={!pay || pay.amount_minor <= 0 || !pay.method_code} onClick={() => pay && payM.mutate(pay)}>Record {pay?.direction === "paid" ? "payout" : "payment"}</Button></>}>
        {pay ? (
          <div className="space-y-3">
            <Field label="Direction"><Select value={pay.direction} onChange={(e) => setPay({ ...pay, direction: e.target.value as "received" | "paid" })}><option value="received">Received from customer</option><option value="paid">Paid out to customer</option></Select></Field>
            <Field label="Amount"><MoneyInput value={pay.amount_minor} onChange={(v) => setPay({ ...pay, amount_minor: v })} autoFocus /></Field>
            <Field label="Method"><Select value={pay.method_code} onChange={(e) => setPay({ ...pay, method_code: e.target.value })}>{methods.data?.filter((m) => m.active && m.kind !== "khata").map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select></Field>
            <Field label="Reference"><Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="Transaction id, cheque no" /></Field>
          </div>
        ) : null}
      </Dialog>
      <Dialog open={!!edit} onClose={() => setEdit(null)} title="Edit customer" size="lg"
        footer={<>
          {edit && !c.is_walk_in ? <DuplicateWarning fields={edit} excludeId={id} showBalance={khata} /> : null}
          <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
          <Button loading={editM.isPending} disabled={!edit?.name?.trim()} onClick={saveEdit}>Save</Button>
        </>}>
        {edit ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} disabled={c.is_walk_in} /></Field>
            <Field label="Phone"><Input value={edit.phone ?? ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} disabled={c.is_walk_in} /></Field>
            <Field label="Room / unit"><Input value={edit.room ?? ""} onChange={(e) => setEdit({ ...edit, room: e.target.value })} /></Field>
            <Field label="Roll / ID no."><Input value={edit.member_no ?? ""} onChange={(e) => setEdit({ ...edit, member_no: e.target.value })} /></Field>
            <Field label="Guardian name"><Input value={edit.guardian_name ?? ""} onChange={(e) => setEdit({ ...edit, guardian_name: e.target.value })} /></Field>
            <Field label="Guardian phone"><Input type="tel" value={edit.guardian_phone ?? ""} onChange={(e) => setEdit({ ...edit, guardian_phone: e.target.value })} placeholder="03001234567" /></Field>
            <div className="sm:col-span-2"><Switch checked={!!edit.notify_guardian} onChange={(v) => setEdit({ ...edit, notify_guardian: v })} label="Send account messages to the guardian too" /></div>
            <Field label="Email"><Input value={edit.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="Company"><Input value={edit.company ?? ""} onChange={(e) => setEdit({ ...edit, company: e.target.value })} /></Field>
            <Field label="Group"><Select value={edit.group_id ?? ""} onChange={(e) => setEdit({ ...edit, group_id: e.target.value })}><option value="">None</option>{groups.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
            {khata ? <Field label="Credit limit" hint={c.credit_limit_minor === null ? "No limit now. 0 = no khata." : "0 = no khata"}><MoneyInput value={edit.credit_limit_minor ?? 0} onChange={(v) => setEdit({ ...edit, credit_limit_minor: v })} /></Field> : null}
            <Field label="Notes" className="sm:col-span-2"><Textarea value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
            <Checkbox label="WhatsApp opt-in" checked={!!edit.whatsapp_opt_in} onChange={(e) => setEdit({ ...edit, whatsapp_opt_in: e.target.checked })} />
          </div>
        ) : null}
      </Dialog>
      <Dialog open={!!adjust} onClose={() => setAdjust(null)} title="Adjust points" description="Positive adds points, negative removes them. A manager PIN may be needed." size="sm"
        footer={<><Button variant="secondary" onClick={() => setAdjust(null)}>Cancel</Button><Button loading={adjusting} disabled={!adjust || !Number(adjust.points)} onClick={doAdjust}>Apply</Button></>}>
        {adjust ? (
          <div className="space-y-3">
            <Field label="Points" hint="e.g. 50 or -20"><Input type="number" step={1} className="tabular" value={adjust.points} onChange={(e) => setAdjust({ ...adjust, points: e.target.value })} autoFocus /></Field>
            <Field label="Note"><Input value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} placeholder="Welcome bonus, complaint goodwill…" /></Field>
          </div>
        ) : null}
      </Dialog>
      {khata ? (
        <>
          <AdjustBalanceDialog customer={c} open={adjustingBalance} onClose={() => setAdjustingBalance(false)} />
          <OpeningBalanceDialog customer={c} open={enteringOpening} onClose={() => setEnteringOpening(false)} />
          <ReverseAdjustmentDialog adjustment={reversing} onClose={() => setReversing(null)} />
        </>
      ) : null}
      {approvalDialog}
      <OrderDrawer id={selected} onClose={() => setSelected(null)} />
    </>
  );
}
