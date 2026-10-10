"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Download, FileText } from "lucide-react";
import { api } from "@/lib/api";
import type { Customer, Ledger } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { downloadCsv } from "@/lib/csv";
import { exportTablePdf } from "@/lib/pdf";
import { Cards, PageHeader } from "@/components/admin/page";
import { CustomerPicker } from "@/components/admin/customers-picker";
import { balanceLabel, ledgerKindLabel, ledgerKindVariant } from "@/components/admin/marketing-helpers";
import { Badge, Button, EmptyRow, EmptyState, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { OrderDrawer } from "@/components/admin/order-drawer";

// SPEC Customer Ledger: every charge put on account, every payment and refund, with a running balance, plus how old
// the open amount is. Rows are the API's ledger entries (Customers::Ledger), oldest first so the balance reads down.

const columns = [
  { header: "Date", key: "at" }, { header: "Business day", key: "business_day" }, { header: "Entry", key: "kind" }, { header: "Order / ref", key: "ref" }, { header: "Method", key: "method" },
  { header: "Amount", key: "amount", align: "right" as const }, { header: "Balance", key: "balance", align: "right" as const },
];

export default function CustomerLedgerPage() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["ledger", customer?.id], queryFn: () => api<Ledger>(`/customers/${customer!.id}/ledger`), enabled: !!customer });
  const c = q.data?.customer ?? customer;
  const a = q.data?.aging;
  const entries = q.data?.entries ?? [];
  const rows = entries.map((e) => ({
    at: formatDateTime(e.at), business_day: formatDate(e.business_day), kind: ledgerKindLabel(e.kind), ref: e.order_label ?? e.number ?? "", method: [e.method, e.reference].filter(Boolean).join(" / "),
    amount: `${e.amount_minor < 0 ? "-" : "+"}${formatMoney(Math.abs(e.amount_minor))}`, balance: formatMoney(e.balance_minor),
  }));
  const fileBase = `ledger-${c?.khata_no ?? c?.name ?? "customer"}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const exportPdf = () => c && exportTablePdf({ title: `Customer ledger: ${c.name}`, subtitle: `${c.khata_no ? `Khata ${c.khata_no} · ` : ""}Balance ${formatMoney(c.balance_minor)} (${balanceLabel(c.balance_minor)})`, columns, rows, filename: `${fileBase}.pdf`,
    footer: a ? [`Aging: current ${formatMoney(a.current)}, 31-60 ${formatMoney(a["31_60"])}, 61-90 ${formatMoney(a["61_90"])}, over 90 ${formatMoney(a.over_90)}`] : undefined });
  return (
    <>
      <PageHeader icon={BookOpen} title="Customer Ledger" description="Charges put on account, payments and refunds, with the running balance and how old the open amount is." actions={c ? <>
        <Button variant="secondary" disabled={!rows.length} onClick={() => downloadCsv(fileBase, columns, rows)}><Download className="h-4 w-4" /> CSV</Button>
        <Button variant="secondary" disabled={!rows.length} onClick={exportPdf}><FileText className="h-4 w-4" /> PDF</Button>
        <Link href={`/admin/customers/${c.id}`}><Button variant="secondary">Open customer</Button></Link>
      </> : undefined} />
      <div className="mb-4 max-w-xl"><CustomerPicker value={customer} onChange={setCustomer} autoFocus /></div>
      {!customer ? <EmptyState icon={BookOpen} title="Pick a customer" hint="Search by name, phone or khata no to open their ledger." /> : q.isLoading ? <Loading /> : c ? (
        <>
          <Cards className="xl:grid-cols-5">
            <SummaryCard label={balanceLabel(c.balance_minor)} value={formatMoney(Math.abs(c.balance_minor))} sub={c.khata_no ? `Khata ${c.khata_no}` : "No khata no"} tone={c.balance_minor > 0 ? "danger" : "success"} />
            <SummaryCard label="Current (0-30)" value={formatMoney(a?.current)} tone="success" />
            <SummaryCard label="31-60 days" value={formatMoney(a?.["31_60"])} tone="warning" />
            <SummaryCard label="61-90 days" value={formatMoney(a?.["61_90"])} tone="warning" />
            <SummaryCard label="Over 90" value={formatMoney(a?.over_90)} tone="danger" />
          </Cards>
          <Table>
            <THead><tr><TH>When</TH><TH>Business day</TH><TH>Entry</TH><TH>Order / ref</TH><TH>Method</TH><TH right>Amount</TH><TH right>Balance</TH></tr></THead>
            <TBody>
              {entries.length ? entries.map((e) => (
                <TR key={e.ref} onClick={e.order_id ? () => setSelected(e.order_id!) : undefined}>
                  <TD className="text-fg-secondary">{formatDateTime(e.at)}</TD>
                  <TD className="text-fg-secondary">{formatDate(e.business_day)}</TD>
                  <TD><Badge variant={ledgerKindVariant(e.kind)}>{ledgerKindLabel(e.kind)}</Badge></TD>
                  <TD className="font-mono text-xs">{e.order_label ?? e.number ?? "-"}</TD>
                  <TD className="text-fg-secondary">{[e.method, e.reference].filter(Boolean).join(" / ") || "-"}</TD>
                  <TD right className={e.amount_minor < 0 ? "text-success" : "text-danger"}>{e.amount_minor < 0 ? "-" : "+"}{formatMoney(Math.abs(e.amount_minor))}</TD>
                  <TD right className="font-medium">{formatMoney(e.balance_minor)}</TD>
                </TR>
              )) : <EmptyRow colSpan={7}>No account activity for this customer.</EmptyRow>}
            </TBody>
          </Table>
        </>
      ) : null}
      <OrderDrawer id={selected} onClose={() => setSelected(null)} />
    </>
  );
}
