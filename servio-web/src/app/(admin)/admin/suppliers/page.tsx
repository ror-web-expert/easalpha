"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Truck, Plus, Upload } from "lucide-react";
import { api } from "@/lib/api";
import type { PurchasingSummary, Supplier } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { usePagedList, useDebounced } from "@/lib/hooks";
import { Cards, FilterBar, LoadMore, PageHeader, SearchInput } from "@/components/admin/page";
import { SupplierDialog } from "@/components/admin/purchasing";
import { Button, Checkbox, EmptyRow, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function SuppliersPage() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [withBalance, setWithBalance] = useState(false);
  const list = usePagedList<Supplier>(["suppliers"], "/suppliers", { q: dq, with_balance: withBalance ? "true" : "" });
  const summary = useQuery({ queryKey: ["purchasing_summary"], queryFn: () => api<PurchasingSummary>("/purchasing/summary") });
  const [dialog, setDialog] = useState<Supplier | "new" | null>(null);
  const s = summary.data;
  return (
    <>
      <PageHeader icon={Truck} title="Suppliers" description="Who you buy from, what you owe them and what they charge." actions={<>
        <Link href="/admin/suppliers/import"><Button variant="secondary"><Upload className="h-4 w-4" /> Import CSV</Button></Link>
        <Button onClick={() => setDialog("new")}><Plus className="h-4 w-4" /> New supplier</Button>
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
          <THead><tr><TH>Supplier</TH><TH>Contact</TH><TH>Phone</TH><TH>Terms</TH><TH right>Balance</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((sup) => (
              <TR key={sup.id}>
                <TD><Link href={`/admin/suppliers/${sup.id}`} className="font-medium text-primary hover:underline">{sup.name}</Link>{sup.ntn ? <span className="ml-2 font-mono text-xs text-fg-muted">NTN {sup.ntn}</span> : null}</TD>
                <TD className="text-fg-secondary">{sup.contact_name ?? "-"}</TD>
                <TD className="text-fg-secondary">{sup.phone ?? "-"}</TD>
                <TD className="text-fg-secondary">{sup.payment_terms_days ? `${sup.payment_terms_days} days` : "On delivery"}</TD>
                <TD right className={sup.balance_minor > 0 ? "font-medium text-danger" : sup.balance_minor < 0 ? "font-medium text-success" : ""}>{sup.balance_minor ? formatMoney(sup.balance_minor) : "-"}</TD>
              </TR>
            )) : <EmptyRow colSpan={5}>No suppliers yet. Add one or import a CSV.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
      <SupplierDialog supplier={dialog} onClose={() => setDialog(null)} />
    </>
  );
}
