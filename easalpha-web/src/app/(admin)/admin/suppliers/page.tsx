"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Truck, Plus, Upload, Download } from "lucide-react";
import { api } from "@/lib/api";
import type { PurchasingSummary, Supplier, SupplierRow } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { isoDay } from "@/lib/dates";
import { usePagedList, useDebounced } from "@/lib/hooks";
import { useCan } from "@/store/auth";
import { Cards, FilterBar, LoadMore, PageHeader, SearchInput } from "@/components/admin/page";
import { SupplierDialog } from "@/components/admin/purchasing";
import { balanceLabel, downloadText, PO_PERMS, SUPPLIER_PERMS, suppliersCsv } from "@/components/admin/purchasing-helpers";
import { Badge, Button, Checkbox, EmptyRow, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function SuppliersPage() {
  const can = useCan();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [withBalance, setWithBalance] = useState(false);
  const list = usePagedList<SupplierRow>(["suppliers"], "/suppliers", { q: dq, with_balance: withBalance ? "true" : "" });
  const summary = useQuery({ queryKey: ["purchasing_summary"], queryFn: () => api<PurchasingSummary>("/purchasing/summary") });
  const [dialog, setDialog] = useState<Supplier | "new" | null>(null);
  const s = summary.data;
  const canManage = can(...SUPPLIER_PERMS.manage);
  const exportCsv = () => downloadText(`suppliers-${isoDay()}.csv`, suppliersCsv(list.rows));
  return (
    <>
      <PageHeader icon={Truck} title="Suppliers" description="Who you buy from, what you owe them (To Pay) or they owe you (To Receive), how many items they supply and how often." actions={<>
        <Button variant="secondary" onClick={exportCsv} disabled={!list.rows.length}><Download className="h-4 w-4" /> Export CSV</Button>
        {canManage ? <Link href="/admin/suppliers/import"><Button variant="secondary"><Upload className="h-4 w-4" /> Import CSV</Button></Link> : null}
        {canManage || can(...PO_PERMS.addSupplier) ? <Button onClick={() => setDialog("new")}><Plus className="h-4 w-4" /> New supplier</Button> : null}
      </>} />
      <Cards>
        <SummaryCard label="Suppliers" value={s?.suppliers ?? 0} sub={`${s?.suppliers_with_due ?? 0} with a balance`} />
        <SummaryCard label="Owed to suppliers" value={formatMoney(s?.payables_minor)} tone={s?.payables_minor ? "danger" : "success"} />
        <SummaryCard label="Paid this month" value={formatMoney(s?.paid_this_month_minor)} tone="success" />
        <Link href="/admin/purchasing/payables-aging"><SummaryCard label="Payables aging" value="Open" sub="Who is owed for how long" tone="neutral" className="h-full hover:border-primary" /></Link>
      </Cards>
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Name, phone, contact" />
        <Checkbox label="With balance" checked={withBalance} onChange={(e) => setWithBalance(e.target.checked)} />
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Supplier</TH><TH>Contact</TH><TH>Phone</TH><TH>Area / address</TH><TH right>Balance</TH><TH>Direction</TH><TH right>Items supplied</TH><TH right>Purchases</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((sup) => {
              const dir = balanceLabel(sup.balance_label, sup.balance_minor);
              return (
                <TR key={sup.id}>
                  <TD><Link href={`/admin/suppliers/${sup.id}`} className="font-medium text-primary hover:underline">{sup.name}</Link>{sup.ntn ? <span className="ml-2 font-mono text-xs text-fg-muted">NTN {sup.ntn}</span> : null}</TD>
                  <TD className="text-fg-secondary">{sup.contact_name ?? "-"}</TD>
                  <TD className="text-fg-secondary">{sup.phone ?? "-"}</TD>
                  <TD className="max-w-56 truncate text-fg-secondary" title={sup.address ?? undefined}>{sup.address ?? "-"}</TD>
                  <TD right className={sup.balance_minor > 0 ? "font-medium text-danger" : sup.balance_minor < 0 ? "font-medium text-success" : "text-fg-muted"}>{sup.balance_minor ? formatMoney(Math.abs(sup.balance_minor)) : "-"}</TD>
                  <TD><Badge variant={dir.variant}>{dir.text}</Badge></TD>
                  <TD right>{sup.items_count ?? 0}</TD>
                  <TD right>{sup.purchases_count ?? 0}</TD>
                </TR>
              );
            }) : <EmptyRow colSpan={8}>No suppliers yet. Add one or import a CSV.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
      <SupplierDialog supplier={dialog} onClose={() => setDialog(null)} />
    </>
  );
}
