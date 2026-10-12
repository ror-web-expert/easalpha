"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Wallet, Coins, BookOpen } from "lucide-react";
import { api } from "@/lib/api";
import type { Customer, Ledger } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useCan } from "@/store/auth";
import { Cards, PageHeader } from "@/components/admin/page";
import { CustomerPicker } from "@/components/admin/customers-picker";
import { balanceLabel } from "@/components/admin/marketing-helpers";
import { BillActions, SEND_BILL_PERMS } from "@/components/admin/customer-accounts";
import { entryDay, entryDetails, entryKindLabel, entryKindVariant, entryRef, signedMoney } from "@/components/admin/customer-accounts-helpers";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyRow, EmptyState, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

// SPEC Customer Account: the cashier-facing view of one account. The bill (last month unless other dates are chosen)
// can be viewed, downloaded as a PDF or sent on WhatsApp (POST /customers/:id/send_bill) to the customer and, when
// set, the guardian. Sending needs SEND_ACCOUNT_BILL or CUSTOMER_ACCOUNT. When the WhatsApp master toggle is off the
// API answers 409 whatsapp.disabled and the screen says so plainly.

export default function CustomerAccountPage() {
  const can = useCan();
  const canSend = can(...SEND_BILL_PERMS);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const q = useQuery({ queryKey: ["ledger", customer?.id], queryFn: () => api<Ledger>(`/customers/${customer!.id}/ledger`), enabled: !!customer });
  const c = q.data?.customer ?? customer;
  const recent = [...(q.data?.entries ?? [])].reverse().slice(0, 10);
  return (
    <>
      <PageHeader icon={Wallet} title="Customer Account" description="One account at a glance: the balance, the latest entries and the bill, which can be viewed, downloaded or sent on WhatsApp." actions={c ? <>
        <Link href={`/admin/customers/payments?customer_id=${c.id}`}><Button variant="secondary"><Coins className="h-4 w-4" /> Payments</Button></Link>
        <Link href={`/admin/customers/ledger?customer_id=${c.id}`}><Button variant="secondary"><BookOpen className="h-4 w-4" /> Full ledger</Button></Link>
      </> : undefined} />
      <div className="mb-4 max-w-xl"><CustomerPicker value={customer} onChange={(v) => { setCustomer(v); setNotice(null); }} autoFocus /></div>
      {!customer ? <EmptyState icon={Wallet} title="Pick a customer" hint="Search by name, phone, khata no, roll or room." /> : q.isLoading ? <Loading /> : c ? (
        <>
          {!canSend ? <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-ink">Your role cannot send account bills. Ask an owner for the Send Account Bill or Customer Account permission.</p> : null}
          <Cards>
            <SummaryCard label={balanceLabel(c.balance_minor)} value={formatMoney(Math.abs(c.balance_minor))} sub={c.credit_limit_minor ? `Limit ${formatMoney(c.credit_limit_minor)}` : "No credit limit"} tone={c.balance_minor > 0 ? "danger" : "success"} />
            <SummaryCard label="Khata No." value={c.khata_no ?? "-"} sub={[c.phone ?? "No phone", c.member_no ? `Roll ${c.member_no}` : null, c.room ? `Room ${c.room}` : null].filter(Boolean).join(" · ")} tone="neutral" />
            <SummaryCard label="Orders" value={c.orders_count} sub={c.last_order_at ? `Last ${formatDateTime(c.last_order_at)}` : "No orders yet"} />
            <SummaryCard label="Overdue (31+ days)" value={formatMoney(q.data ? q.data.aging["31_60"] + q.data.aging["61_90"] + q.data.aging.over_90 : 0)} sub={q.data ? `Current ${formatMoney(q.data.aging.current)}` : ""} tone="warning" />
          </Cards>
          {!c.is_walk_in ? (
            <Card className="mb-4">
              <CardHeader><CardTitle>Bill</CardTitle><span className="text-xs text-fg-muted">Last month unless you choose other dates</span></CardHeader>
              <CardBody className="space-y-3">
                <BillActions customer={c} picker onResult={(text, ok) => setNotice({ text, ok })} />
                {notice ? <p className={cn("rounded-md px-3 py-2 text-sm", notice.ok ? "bg-success-soft text-success-ink" : "bg-muted")}>{notice.text}</p> : null}
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader><CardTitle>Recent entries</CardTitle><span className="text-xs text-fg-muted">Latest 10 of {q.data?.entries.length ?? 0}</span></CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead><tr><TH>Date</TH><TH>Entry</TH><TH>Order / ref</TH><TH>Details</TH><TH right>Amount</TH><TH right>Balance</TH></tr></THead>
                <TBody>
                  {recent.length ? recent.map((e) => (
                    <TR key={`${e.kind}-${e.ref}`} className={e.reversed ? "text-fg-muted" : undefined}>
                      <TD className="whitespace-nowrap text-fg-secondary" title={formatDateTime(e.at)}>{formatDate(entryDay(e))}</TD>
                      <TD className="whitespace-nowrap"><Badge variant={entryKindVariant(e.kind)}>{entryKindLabel(e.kind)}</Badge>{e.reversed ? <Badge variant="outline" className="ml-1.5">Reversed</Badge> : null}</TD>
                      <TD className="font-mono text-xs">{entryRef(e) || "-"}</TD>
                      <TD className="max-w-80 truncate text-fg-secondary" title={entryDetails(e)}>{entryDetails(e) || "-"}</TD>
                      <TD right className={cn(e.reversed && "line-through", !e.reversed && (e.amount_minor < 0 ? "text-success" : "text-danger"))}>{signedMoney(e.amount_minor)}</TD>
                      <TD right className="font-medium">{formatMoney(e.balance_minor)}</TD>
                    </TR>
                  )) : <EmptyRow colSpan={6}>No account activity yet.</EmptyRow>}
                </TBody>
              </Table>
            </CardBody>
          </Card>
        </>
      ) : null}
    </>
  );
}
