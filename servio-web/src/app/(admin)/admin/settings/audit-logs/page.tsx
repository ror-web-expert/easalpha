"use client";
import { useState } from "react";
import { ScrollText } from "lucide-react";
import type { AuditLog } from "@/lib/types";
import { formatDateTime } from "@/lib/dates";
import { usePagedList, useDebounced } from "@/lib/hooks";
import { FilterBar, LoadMore, PageHeader } from "@/components/admin/page";
import { Badge, Dialog, EmptyRow, Input, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

const ACTIONS = ["login", "create", "update", "void", "refund", "discount", "price_change", "permission_change", "settings_change", "pair_device", "revoke_device", "pin_login", "pin_failed", "approve"];

export default function AuditPage() {
  const [action, setAction] = useState("");
  const [table, setTable] = useState("");
  const dt = useDebounced(table);
  const list = usePagedList<AuditLog>(["audit_logs"], "/audit_logs", { action_name: action, table_name: dt });
  const [view, setView] = useState<AuditLog | null>(null);
  return (
    <>
      <PageHeader icon={ScrollText} title="Audit log" description="Every sensitive action with who did it, who approved it and the before and after values." />
      <FilterBar>
        <Select className="w-auto" value={action} onChange={(e) => setAction(e.target.value)}><option value="">All actions</option>{ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}</Select>
        <Input className="w-48" placeholder="Table, e.g. orders" value={table} onChange={(e) => setTable(e.target.value)} />
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>When</TH><TH>Action</TH><TH>Record</TH><TH>User</TH><TH>Approved by</TH><TH>IP</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((a) => (
              <TR key={a.id} onClick={() => setView(a)}>
                <TD className="text-fg-secondary">{formatDateTime(a.occurred_at)}</TD>
                <TD><Badge variant={["void", "refund", "revoke_device", "pin_failed"].includes(a.action) ? "danger" : ["price_change", "permission_change", "settings_change"].includes(a.action) ? "warning" : "neutral"}>{a.action}</Badge></TD>
                <TD className="font-mono text-xs">{a.table_name ?? "-"}{a.record_id ? ` · ${a.record_id.slice(0, 8)}` : ""}</TD>
                <TD className="font-mono text-xs">{a.user_id?.slice(0, 8) ?? "-"}</TD>
                <TD className="font-mono text-xs">{a.approved_by_user_id?.slice(0, 8) ?? "-"}</TD>
                <TD className="text-xs text-fg-muted">{a.ip ?? "-"}</TD>
              </TR>
            )) : <EmptyRow colSpan={6} />}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
      <Dialog open={!!view} onClose={() => setView(null)} title={`${view?.action} · ${view?.table_name ?? ""}`} description={formatDateTime(view?.occurred_at)} size="lg">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><div className="mb-1 text-xs font-semibold uppercase text-fg-secondary">Before</div><pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(view?.before ?? null, null, 2)}</pre></div>
          <div><div className="mb-1 text-xs font-semibold uppercase text-fg-secondary">After</div><pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(view?.after ?? null, null, 2)}</pre></div>
        </div>
      </Dialog>
    </>
  );
}
