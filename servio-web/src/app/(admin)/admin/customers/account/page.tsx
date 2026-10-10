"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Wallet, Send, Coins, BookOpen } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { Customer, Ledger } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { useCan } from "@/store/auth";
import { toast } from "@/store/toast";
import { Cards, PageHeader } from "@/components/admin/page";
import { CustomerPicker } from "@/components/admin/customers-picker";
import { balanceLabel, ledgerKindLabel, ledgerKindVariant } from "@/components/admin/marketing-helpers";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyRow, EmptyState, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

// SPEC Customer Account: the cashier-facing view of one account. Send bill posts the account statement over
// WhatsApp (POST /customers/:id/send_statement) and needs SEND_ACCOUNT_BILL or CUSTOMER_ACCOUNT. When the WhatsApp
// master toggle is off the API answers 409 whatsapp.disabled and the screen says so plainly.

export default function CustomerAccountPage() {
  const can = useCan();
  const canSend = can("SEND_ACCOUNT_BILL", "CUSTOMER_ACCOUNT", "customers.manage");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["ledger", customer?.id], queryFn: () => api<Ledger>(`/customers/${customer!.id}/ledger`), enabled: !!customer });
  const c = q.data?.customer ?? customer;
  const recent = [...(q.data?.entries ?? [])].reverse().slice(0, 10);
  const sendBill = async () => {
    if (!c) return;
    setSending(true); setNotice(null);
    try {
      const r = await api<{ message_id: string | null; status: string | null; to: string | null }>(`/customers/${c.id}/send_statement`, { method: "POST" });
      toast.success("Bill sent", r.to ? `WhatsApp statement queued to ${r.to}` : undefined);
      setNotice(`Statement ${r.status ?? "queued"}${r.to ? ` to ${r.to}` : ""}.`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "whatsapp.disabled") setNotice("WhatsApp sending is switched off. Turn on the master toggle in Settings > WhatsApp to send bills.");
      else if (e instanceof ApiError && e.code === "whatsapp.no_phone") setNotice(`${c.name} has no phone number on file, so there is nowhere to send the bill.`);
      else setNotice(errorMessage(e));
      toast.error("Could not send the bill", errorMessage(e));
    } finally { setSending(false); }
  };
  return (
    <>
      <PageHeader icon={Wallet} title="Customer Account" description="One account at a glance: the balance, the latest entries and a Send bill button that sends the statement over WhatsApp." actions={c ? <>
        <Link href={`/admin/customers/payments?customer_id=${c.id}`}><Button variant="secondary"><Coins className="h-4 w-4" /> Payments</Button></Link>
        <Link href={`/admin/customers/${c.id}`}><Button variant="secondary"><BookOpen className="h-4 w-4" /> Full ledger</Button></Link>
        <Button onClick={sendBill} loading={sending} disabled={!canSend || !c.phone} title={!canSend ? "Needs the Send Account Bill permission" : !c.phone ? "No phone number on file" : undefined}><Send className="h-4 w-4" /> Send bill</Button>
      </> : undefined} />
      <div className="mb-4 max-w-xl"><CustomerPicker value={customer} onChange={(v) => { setCustomer(v); setNotice(null); }} autoFocus /></div>
      {!customer ? <EmptyState icon={Wallet} title="Pick a customer" hint="Search by name, phone or khata no." /> : q.isLoading ? <Loading /> : c ? (
        <>
          {notice ? <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm">{notice}</p> : null}
          {!canSend ? <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-ink">Your role cannot send account bills. Ask an owner for the Send Account Bill or Customer Account permission.</p> : null}
          <Cards>
            <SummaryCard label={balanceLabel(c.balance_minor)} value={formatMoney(Math.abs(c.balance_minor))} sub={c.credit_limit_minor ? `Limit ${formatMoney(c.credit_limit_minor)}` : "No credit limit"} tone={c.balance_minor > 0 ? "danger" : "success"} />
            <SummaryCard label="Khata No." value={c.khata_no ?? "-"} sub={c.phone ?? "No phone"} tone="neutral" />
            <SummaryCard label="Orders" value={c.orders_count} sub={c.last_order_at ? `Last ${formatDateTime(c.last_order_at)}` : "No orders yet"} />
            <SummaryCard label="Overdue (31+ days)" value={formatMoney(q.data ? q.data.aging["31_60"] + q.data.aging["61_90"] + q.data.aging.over_90 : 0)} sub={q.data ? `Current ${formatMoney(q.data.aging.current)}` : ""} tone="warning" />
          </Cards>
          <Card>
            <CardHeader><CardTitle>Recent entries</CardTitle><span className="text-xs text-fg-muted">Latest 10 of {q.data?.entries.length ?? 0}</span></CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead><tr><TH>When</TH><TH>Entry</TH><TH>Order / ref</TH><TH right>Amount</TH><TH right>Balance</TH></tr></THead>
                <TBody>
                  {recent.length ? recent.map((e) => (
                    <TR key={e.ref}>
                      <TD className="text-fg-secondary">{formatDateTime(e.at)}</TD>
                      <TD><Badge variant={ledgerKindVariant(e.kind)}>{ledgerKindLabel(e.kind)}</Badge></TD>
                      <TD className="font-mono text-xs">{e.order_label ?? e.number ?? "-"}</TD>
                      <TD right className={e.amount_minor < 0 ? "text-success" : "text-danger"}>{e.amount_minor < 0 ? "-" : "+"}{formatMoney(Math.abs(e.amount_minor))}</TD>
                      <TD right className="font-medium">{formatMoney(e.balance_minor)}</TD>
                    </TR>
                  )) : <EmptyRow colSpan={5}>No account activity yet.</EmptyRow>}
                </TBody>
              </Table>
            </CardBody>
          </Card>
        </>
      ) : null}
    </>
  );
}
