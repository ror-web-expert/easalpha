"use client";
import { useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import type { Shift } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { usePagedList } from "@/lib/hooks";
import { FilterBar, LoadMore, PageHeader } from "@/components/admin/page";
import { Badge, EmptyRow, Input, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function ShiftsPage() {
  const [day, setDay] = useState("");
  const [status, setStatus] = useState("");
  const list = usePagedList<Shift>(["shifts"], "/shifts", { business_day: day, status });
  return (
    <>
      <PageHeader icon={Wallet} title="Shifts" description="Every cashier shift with its count, over or short, and Z report." />
      <FilterBar>
        <Input type="date" className="w-auto" value={day} onChange={(e) => setDay(e.target.value)} />
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="open">Open</option><option value="closed">Closed</option></Select>
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Opened</TH><TH>Closed</TH><TH>Day</TH><TH>Status</TH><TH>Settlement</TH><TH right>Opening</TH><TH right>Counted</TH><TH right>Over / short</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((s) => (
              <TR key={s.id}>
                <TD><Link href={`/admin/finance/shifts/${s.id}`} className="font-medium text-primary hover:underline">{formatDateTime(s.opened_at)}</Link></TD>
                <TD className="text-fg-secondary">{s.closed_at ? formatDateTime(s.closed_at) : "-"}</TD>
                <TD>{s.business_day}</TD>
                <TD><Badge variant={s.status === "open" ? "info" : "primary"}>{s.status}</Badge></TD>
                <TD><Badge variant={s.settlement_status === "settled" ? "success" : s.settlement_status === "pending" ? "warning" : "neutral"}>{s.settlement_status}</Badge>{s.approved_by_membership_id ? <Badge className="ml-1" variant="success">approved</Badge> : null}</TD>
                <TD right>{formatMoney(s.opening_cash_minor)}</TD>
                <TD right>{s.counted_cash_minor !== null ? formatMoney(s.counted_cash_minor) : "-"}</TD>
                <TD right className={(s.over_short_minor ?? 0) < 0 ? "text-danger" : (s.over_short_minor ?? 0) > 0 ? "text-success" : ""}>{s.over_short_minor !== null && s.over_short_minor !== undefined ? formatMoney(s.over_short_minor) : "-"}</TD>
              </TR>
            )) : <EmptyRow colSpan={8}>No shifts.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
    </>
  );
}
