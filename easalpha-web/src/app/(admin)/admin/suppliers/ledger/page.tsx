"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, SlidersHorizontal, Truck } from "lucide-react";
import { api } from "@/lib/api";
import type { SupplierLedgerReport } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { useCan } from "@/store/auth";
import { Cards, FilterBar, PageHeader } from "@/components/admin/page";
import { AdjustmentDialog, SupplierSearchSelect } from "@/components/admin/purchasing-dialogs";
import { AGING_BUCKETS, ledgerTypeVariant, SUPPLIER_PERMS } from "@/components/admin/purchasing-helpers";
import { Badge, Button, EmptyState, EmptyRow, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";

type Tab = "ledger" | "aging";

function LedgerScreen() {
  const can = useCan();
  const params = useSearchParams();
  const [supplierId, setSupplierId] = useState(params.get("supplier_id") ?? "");
  useEffect(() => { const sid = params.get("supplier_id"); if (sid) setSupplierId(sid); }, [params]);
  const [tab, setTab] = useState<Tab>("ledger");
  const [adjusting, setAdjusting] = useState(false);
  const ledger = useQuery({ queryKey: ["supplier_ledger", supplierId], queryFn: () => api<SupplierLedgerReport>(`/suppliers/${supplierId}/ledger`), enabled: !!supplierId });
  const r = ledger.data;
  const t = r?.tiles;
  const aging = r?.aging;
  return (
    <>
      <PageHeader icon={BookOpen} title="Supplier Ledger" description="The accounting view of one supplier: every purchase, payment, return and adjustment as a Dr or Cr line with a running balance, plus how old the unpaid amount is." actions={<>
        {r ? <Link href={`/admin/suppliers/${r.supplier.id}`}><Button variant="secondary"><Truck className="h-4 w-4" /> Supplier page</Button></Link> : null}
        {can(...SUPPLIER_PERMS.ledger) ? <Button onClick={() => setAdjusting(true)} disabled={!r}><SlidersHorizontal className="h-4 w-4" /> Manual adjustment</Button> : null}
      </>} />
      <FilterBar>
        <SupplierSearchSelect value={supplierId} onChange={(id) => setSupplierId(id)} />
        {r ? <span className="text-sm text-fg-secondary">{[r.supplier.contact_name, r.supplier.phone, r.supplier.payment_terms_days ? `${r.supplier.payment_terms_days} day terms` : "Pay on delivery"].filter(Boolean).join(" · ")}</span> : null}
      </FilterBar>
      {!supplierId ? <EmptyState icon={BookOpen} title="Choose a supplier" hint="Search by name, phone or contact to open their ledger." /> : ledger.isLoading || !r || !t ? <Loading /> : (
        <>
          <Cards>
            <SummaryCard label="Opening balance" value={formatMoney(t.opening_minor)} sub={`Since ${formatDate(r.supplier.created_at)}`} tone="neutral" />
            <SummaryCard label="Total purchases" value={formatMoney(t.purchases_minor)} sub={t.returns_minor ? `Less returns ${formatMoney(t.returns_minor)}` : `${r.supplier.purchases_count} goods receipts`} tone="warning" />
            <SummaryCard label="Total payments" value={formatMoney(t.payments_minor)} sub={t.received_minor ? `Received back ${formatMoney(t.received_minor)}` : t.adjustments_minor ? `Adjustments ${formatMoney(t.adjustments_minor)}` : "Paid to the supplier"} tone="success" />
            <SummaryCard label={t.balance_minor < 0 ? "Net balance (they owe you)" : "Net balance owed"} value={formatMoney(Math.abs(t.balance_minor))} tone={t.balance_minor > 0 ? "danger" : "success"}
              sub={<span className="inline-flex items-center gap-2"><Badge variant={t.ties_out ? "success" : "danger"}>{t.ties_out ? "Ties out" : "Does not tie out"}</Badge>{!t.ties_out ? <span>Cached {formatMoney(t.cached_balance_minor)}</span> : null}</span>} />
          </Cards>
          <Tabs value={tab} onChange={setTab} items={[{ value: "ledger", label: "Ledger", count: r.entries.length }, { value: "aging", label: "Aging Summary" }]} className="mb-4" />
          {tab === "ledger" ? (
            <Table>
              <THead><tr><TH>Date</TH><TH>Type</TH><TH>Number / PO</TH><TH>Description</TH><TH right>Dr</TH><TH right>Cr</TH><TH right>Balance</TH></tr></THead>
              <TBody>
                {r.entries.length ? r.entries.map((e, i) => (
                  <TR key={`${e.kind}-${e.ref ?? i}-${e.at}`}>
                    <TD className="whitespace-nowrap text-fg-secondary" title={formatDateTime(e.at)}>{formatDate(e.business_day ?? e.at)}</TD>
                    <TD><Badge variant={ledgerTypeVariant(e.type)}>{e.type}</Badge>{e.kind === "received" || e.kind === "refund_received" ? <span className="ml-2 text-xs text-fg-muted">received</span> : null}</TD>
                    <TD className="whitespace-nowrap">
                      {e.number ? <span className="font-mono text-xs">{e.number}</span> : null}
                      {e.purchase_order_id ? <Link href={`/admin/purchasing/purchase-orders/${e.purchase_order_id}`} className={`font-mono text-xs text-primary hover:underline${e.number ? " ml-2" : ""}`}>{e.purchase_order_label ?? "PO"}</Link> : null}
                      {!e.number && !e.purchase_order_id ? <span className="text-fg-muted">-</span> : null}
                    </TD>
                    <TD className="max-w-72 truncate text-fg-secondary" title={e.description ?? undefined}>{e.description || (e.method ?? "-")}</TD>
                    <TD right className={e.debit_minor ? "text-success" : "text-fg-muted"}>{e.debit_minor ? formatMoney(e.debit_minor) : "-"}</TD>
                    <TD right className={e.credit_minor ? "text-danger" : "text-fg-muted"}>{e.credit_minor ? formatMoney(e.credit_minor) : "-"}</TD>
                    <TD right className="font-medium">{formatMoney(e.balance_minor)}</TD>
                  </TR>
                )) : <EmptyRow colSpan={7}>No activity yet. Receive goods, record a payment or post an adjustment.</EmptyRow>}
              </TBody>
            </Table>
          ) : (
            <Table>
              <THead><tr><TH>Age of unpaid purchases</TH><TH right>Amount</TH><TH right>Share</TH></tr></THead>
              <TBody>
                {AGING_BUCKETS.map((b) => {
                  const v = aging?.[b.key] ?? 0;
                  const share = aging?.total ? (v / aging.total) * 100 : 0;
                  return (
                    <TR key={b.key}>
                      <TD className={b.key === "over_90" && v ? "font-medium text-danger" : b.key !== "current" && v ? "text-warning" : ""}>{b.label}</TD>
                      <TD right className={v ? "font-medium" : "text-fg-muted"}>{v ? formatMoney(v) : "-"}</TD>
                      <TD right className="text-fg-secondary">{v ? `${share.toFixed(0)}%` : "-"}</TD>
                    </TR>
                  );
                })}
                <TR className="bg-muted/40 font-medium"><TD>Total unpaid</TD><TD right>{formatMoney(aging?.total ?? 0)}</TD><TD right>{aging?.total ? "100%" : "-"}</TD></TR>
              </TBody>
            </Table>
          )}
          {tab === "aging" ? <p className="mt-3 text-xs text-fg-muted">Payments and credit notes settle the oldest purchases first, so what remains is the newest unpaid stock. Current means 30 days or younger.</p> : null}
          <AdjustmentDialog supplier={r.supplier} open={adjusting} onClose={() => setAdjusting(false)} />
        </>
      )}
    </>
  );
}

export default function SupplierLedgerPage() {
  return <Suspense fallback={<Loading />}><LedgerScreen /></Suspense>;
}
