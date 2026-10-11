"use client";
import { useState } from "react";
import { Clock, LogOut } from "lucide-react";
import { api } from "@/lib/api";
import type { Membership, UserSession } from "@/lib/types";
import { formatDateTime } from "@/lib/dates";
import { usePagedList } from "@/lib/hooks";
import { FilterBar, LoadMore, PageHeader } from "@/components/admin/page";
import { useAction, useList } from "@/components/admin/crud";
import { Badge, Button, ConfirmDialog, EmptyRow, Loading, Select, Switch, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

const TYPE_LABEL: Record<string, string> = { admin: "Admin", cashier: "Cashier", order_taker: "Order taker", rider: "Rider" };
const APP_LABEL: Record<string, string> = { admin: "Admin", pos: "POS", kds: "Kitchen", rider: "Rider app", order_taker: "Order taker" };

export default function SessionsPage() {
  const [activeOnly, setActiveOnly] = useState(true);
  const [memberId, setMemberId] = useState("");
  const [revoke, setRevoke] = useState<UserSession | null>(null);
  const staff = useList<Membership>("staff", "/staff");
  const list = usePagedList<UserSession>(["staff_sessions"], "/staff/sessions", { active: activeOnly ? true : undefined, membership_id: memberId || undefined, limit: 50 });
  const revokeM = useAction<string>(["staff_sessions"], (id) => api(`/staff/sessions/${id}/revoke`, { method: "POST" }), "Session revoked");
  return (
    <>
      <PageHeader icon={Clock} title="User Sessions" description="Who is signed in, on which app and device. Revoking signs that session out everywhere it is used." />
      <FilterBar>
        <Switch checked={activeOnly} onChange={setActiveOnly} label="Active only" />
        <Select className="w-auto" value={memberId} onChange={(e) => setMemberId(e.target.value)} aria-label="Staff member">
          <option value="">All staff</option>
          {staff.data?.map((m) => <option key={m.id} value={m.id}>{m.user?.name ?? m.id}</option>)}
        </Select>
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>User</TH><TH>Type</TH><TH>App</TH><TH>Device</TH><TH>IP</TH><TH>Signed in</TH><TH>Signed out</TH><TH>Status</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.name ?? "-"}</TD>
                <TD className="text-fg-secondary">{s.staff_type ? TYPE_LABEL[s.staff_type] ?? s.staff_type : "-"}</TD>
                <TD>{s.app ? APP_LABEL[s.app] ?? s.app : "-"}</TD>
                <TD className="text-fg-secondary"><span title={s.user_agent ?? undefined}>{s.device ?? (s.user_agent ? s.user_agent.slice(0, 40) : "-")}</span></TD>
                <TD className="font-mono text-xs text-fg-secondary">{s.ip ?? "-"}</TD>
                <TD className="text-fg-secondary">{formatDateTime(s.signed_in_at) || "-"}</TD>
                <TD className="text-fg-secondary">{s.signed_out_at ? formatDateTime(s.signed_out_at) : "-"}</TD>
                <TD><Badge variant={s.active ? "success" : "neutral"}>{s.active ? "Active" : s.signed_out_at ? "Signed out" : "Expired"}</Badge></TD>
                <TD right>{s.active ? <Button variant="ghost" size="sm" onClick={() => setRevoke(s)}><LogOut className="h-4 w-4" /> Revoke</Button> : null}</TD>
              </TR>
            )) : <EmptyRow colSpan={9}>{activeOnly ? "No active sessions." : "No sessions yet."}</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
      <ConfirmDialog open={!!revoke} onClose={() => setRevoke(null)} onConfirm={() => revoke && revokeM.mutate(revoke.id, { onSuccess: () => setRevoke(null) })} title={`Sign out ${revoke?.name ?? "this session"}?`} description="The session stops working on that device right away. They can sign in again." confirmLabel="Revoke" destructive loading={revokeM.isPending} />
    </>
  );
}
