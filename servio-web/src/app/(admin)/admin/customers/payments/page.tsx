"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Coins, Download, FileText, HandCoins } from "lucide-react";
import { api } from "@/lib/api";
import type { Customer, CustomerPaymentRow, CustomerPaymentsPage, PaymentMethod } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { daysAgo, formatDate, formatDateTime, isoDay } from "@/lib/dates";
import { usePagedList } from "@/lib/hooks";
import { downloadCsv } from "@/lib/csv";
import { exportTablePdf } from "@/lib/pdf";
import { Cards, DateRangePicker, FilterBar, LoadMore, PageHeader } from "@/components/admin/page";
import { useList, useSave } from "@/components/admin/crud";
import { CustomerPicker } from "@/components/admin/customers-picker";
import { Badge, Button, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Select, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

// SPEC Customer Payments: every khata payment across customers, filtered by date, method and direction, with a
// Record payment action that posts to the customer's account (POST /customers/:id/payments).

interface PayForm { customer: Customer | null; amount_minor: number; method_code: string; reference: string; direction: "received" | "paid" }
const columns = [
  { header: "Number", key: "number" }, { header: "Date", key: "at" }, { header: "Business day", key: "day" }, { header: "Customer", key: "customer" }, { header: "Khata No.", key: "khata" },
  { header: "Direction", key: "direction" }, { header: "Method", key: "method" }, { header: "Reference", key: "reference" }, { header: "Amount", key: "amount", align: "right" as const },
];

function PaymentsScreen() {
  const params = useSearchParams();
  const presetCustomer = params.get("customer_id");
  const [range, setRange] = useState({ from: daysAgo(29), to: isoDay() });
  const [method, setMethod] = useState("");
  const [direction, setDirection] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const preset = useQuery({ queryKey: ["customer", presetCustomer], queryFn: () => api<Customer>(`/customers/${presetCustomer}`), enabled: !!presetCustomer && !customer });
  useEffect(() => { if (preset.data && !customer) setCustomer(preset.data); }, [preset.data, customer]);
  const methods = useList<PaymentMethod>("payment_methods", "/payment_methods");
  const list = usePagedList<CustomerPaymentRow>(["customer_payments"], "/customer_payments", { from: range.from, to: range.to, method_code: method, direction, customer_id: customer?.id });
  const totals = (list.data?.pages[0] as CustomerPaymentsPage | undefined)?.totals;
  const [pay, setPay] = useState<PayForm | null>(null);
  const save = useSave<Omit<PayForm, "customer">>(["customer_payments", "customers", "ledger", "ledger_summary"], () => `/customers/${pay?.customer?.id}/payments`, { onSuccess: () => setPay(null), success: "Payment recorded" });
  useEffect(() => { if (pay && !pay.method_code && methods.data?.length) setPay({ ...pay, method_code: methods.data.find((m) => m.kind === "cash")?.code ?? methods.data[0].code }); }, [methods.data, pay]);
  const methodName = (code: string | null) => methods.data?.find((m) => m.code === code)?.name ?? code ?? "-";
  const rows = list.rows.map((p) => ({ number: p.number, at: formatDateTime(p.received_at), day: formatDate(p.business_day), customer: p.customer_name, khata: p.khata_no ?? "", direction: p.direction === "paid" ? "Paid out" : "Received", method: methodName(p.method_code), reference: p.reference ?? "", amount: formatMoney(p.amount_minor) }));
  const subtitle = `${formatDate(range.from)} to ${formatDate(range.to)}${customer ? ` · ${customer.name}` : ""}`;
  return (
    <>
      <PageHeader icon={Coins} title="Customer Payments" description="Khata payments received and paid out across every customer. Recording one here posts it to the customer's ledger." actions={<>
        <Button variant="secondary" disabled={!rows.length} onClick={() => downloadCsv(`customer-payments-${range.from}-${range.to}`, columns, rows)}><Download className="h-4 w-4" /> CSV</Button>
        <Button variant="secondary" disabled={!rows.length} onClick={() => exportTablePdf({ title: "Customer payments", subtitle, columns, rows, landscape: true, footer: totals ? [`Received ${formatMoney(totals.received_minor)} · Paid out ${formatMoney(totals.paid_minor)} · ${totals.count} payments`] : undefined })}><FileText className="h-4 w-4" /> PDF</Button>
        <Button onClick={() => setPay({ customer, amount_minor: 0, method_code: "", reference: "", direction: "received" })}><HandCoins className="h-4 w-4" /> Record payment</Button>
      </>} />
      <Cards>
        <SummaryCard label="Received" value={formatMoney(totals?.received_minor)} tone="success" />
        <SummaryCard label="Paid out" value={formatMoney(totals?.paid_minor)} tone="warning" />
        <SummaryCard label="Net collected" value={formatMoney((totals?.received_minor ?? 0) - (totals?.paid_minor ?? 0))} />
        <SummaryCard label="Payments" value={totals?.count ?? 0} tone="neutral" />
      </Cards>
      <FilterBar>
        <DateRangePicker value={range} onChange={setRange} />
        <Select className="w-auto" value={method} onChange={(e) => setMethod(e.target.value)}><option value="">Any method</option>{methods.data?.filter((m) => m.kind !== "khata").map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select>
        <Select className="w-auto" value={direction} onChange={(e) => setDirection(e.target.value)}><option value="">Both directions</option><option value="received">Received</option><option value="paid">Paid out</option></Select>
        <CustomerPicker value={customer} onChange={setCustomer} placeholder="Any customer" className="w-full sm:w-80" />
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Number</TH><TH>When</TH><TH>Customer</TH><TH>Direction</TH><TH>Method</TH><TH>Reference</TH><TH right>Amount</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((p) => (
              <TR key={p.id}>
                <TD className="font-mono text-xs">{p.number}</TD>
                <TD className="text-fg-secondary">{formatDateTime(p.received_at)}<span className="block text-xs text-fg-muted">Day {formatDate(p.business_day)}</span></TD>
                <TD><Link href={`/admin/customers/${p.customer_id}`} className="font-medium text-primary hover:underline">{p.customer_name}</Link>{p.khata_no ? <span className="ml-2 font-mono text-xs text-fg-muted">{p.khata_no}</span> : null}</TD>
                <TD><Badge variant={p.direction === "paid" ? "warning" : "success"}>{p.direction === "paid" ? "Paid out" : "Received"}</Badge></TD>
                <TD className="text-fg-secondary">{methodName(p.method_code)}</TD>
                <TD className="text-fg-secondary">{p.reference ?? "-"}</TD>
                <TD right className={p.direction === "paid" ? "text-danger" : "font-medium"}>{p.direction === "paid" ? "-" : ""}{formatMoney(p.amount_minor)}</TD>
              </TR>
            )) : <EmptyRow colSpan={7}>No payments in this range.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
      <Dialog open={!!pay} onClose={() => setPay(null)} title="Record payment" description={pay?.customer ? `${pay.customer.name}: balance ${formatMoney(pay.customer.balance_minor)}` : "Pick the customer first"} size="sm"
        footer={<><Button variant="secondary" onClick={() => setPay(null)}>Cancel</Button><Button loading={save.isPending} disabled={!pay?.customer || !pay || pay.amount_minor <= 0 || !pay.method_code} onClick={() => pay && save.mutate({ amount_minor: pay.amount_minor, method_code: pay.method_code, reference: pay.reference, direction: pay.direction })}>Record {pay?.direction === "paid" ? "payout" : "payment"}</Button></>}>
        {pay ? (
          <div className="space-y-3">
            <Field label="Customer"><CustomerPicker value={pay.customer} onChange={(c) => setPay({ ...pay, customer: c, amount_minor: c && c.balance_minor > 0 && !pay.amount_minor ? c.balance_minor : pay.amount_minor })} autoFocus={!pay.customer} /></Field>
            <Field label="Direction"><Select value={pay.direction} onChange={(e) => setPay({ ...pay, direction: e.target.value as "received" | "paid" })}><option value="received">Received from customer</option><option value="paid">Paid out to customer</option></Select></Field>
            <Field label="Amount"><MoneyInput value={pay.amount_minor} onChange={(v) => setPay({ ...pay, amount_minor: v })} /></Field>
            <Field label="Method"><Select value={pay.method_code} onChange={(e) => setPay({ ...pay, method_code: e.target.value })}>{methods.data?.filter((m) => m.active && m.kind !== "khata").map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select></Field>
            <Field label="Reference"><Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="Transaction id, cheque no" /></Field>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

export default function CustomerPaymentsPage() {
  return <Suspense fallback={<Loading />}><PaymentsScreen /></Suspense>;
}
