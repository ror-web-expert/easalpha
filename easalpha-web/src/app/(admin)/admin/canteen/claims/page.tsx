"use client";
// Meals: every token of a day, by session and status; a manager cancels one with a reason (the account is refunded).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks, XCircle } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { MealClaim, MealSession } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatTime, isoDay } from "@/lib/dates";
import { Cards, FilterBar, PageHeader } from "@/components/admin/page";
import { useList } from "@/components/admin/crud";
import { Badge, Button, Dialog, EmptyRow, Field, Input, Loading, Select, SummaryCard, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";

export default function CanteenClaimsPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(isoDay());
  const [session, setSession] = useState("");
  const [status, setStatus] = useState("");
  const [cancel, setCancel] = useState<MealClaim | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const sessions = useList<MealSession>("canteen_sessions_all", "/canteen/sessions");
  const list = useQuery({ queryKey: ["canteen_claims_admin", date, session, status], queryFn: () => api<{ data: MealClaim[] }>("/canteen/claims", { query: { date, session_id: session || undefined, status: status || undefined, limit: 2000 } }), refetchInterval: 20_000, select: (r) => r.data });
  const rows = list.data ?? [];
  const live = rows.filter((c) => c.status !== "cancelled");
  const doCancel = async () => {
    if (!cancel) return;
    setBusy(true);
    try { await api(`/canteen/claims/${cancel.id}/cancel`, { method: "POST", body: { reason } }); toast.success(`Token ${cancel.token_label} cancelled`, "The worker's account was refunded."); setCancel(null); setReason(""); void qc.invalidateQueries({ queryKey: ["canteen_claims_admin"] }); }
    catch (e) { toast.error("Could not cancel", errorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader icon={ListChecks} title="Meals" description="Every token of the day. Cancelling a meal refunds the worker's account and frees the dish count." />
      <FilterBar>
        <Field label="Day"><Input type="date" className="w-auto" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Session"><Select value={session} onChange={(e) => setSession(e.target.value)}><option value="">All sessions</option>{sessions.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="claimed">Waiting</option><option value="served">Served</option><option value="cancelled">Cancelled</option></Select></Field>
      </FilterBar>
      <Cards>
        <SummaryCard label="Meals" value={live.length} />
        <SummaryCard label="Served" value={live.filter((c) => c.status === "served").length} tone="success" />
        <SummaryCard label="Waiting" value={live.filter((c) => c.status === "claimed").length} tone="warning" />
        <SummaryCard label="Workers' share" value={formatMoney(live.reduce((s, c) => s + c.worker_price_minor, 0))} sub={`company ${formatMoney(live.reduce((s, c) => s + c.company_share_minor, 0))}`} />
      </Cards>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Token</TH><TH>Worker</TH><TH>Session</TH><TH>Dish</TH><TH>Time</TH><TH>How</TH><TH right>Worker pays</TH><TH right>Company</TH><TH>Status</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {rows.length ? rows.map((c) => (
              <TR key={c.id} className={c.status === "cancelled" ? "opacity-60" : ""}>
                <TD className="font-mono font-semibold">{c.token_label}</TD>
                <TD className="font-medium">{c.employee_name}</TD>
                <TD>{c.session}</TD>
                <TD className="text-fg-secondary">{c.dish}</TD>
                <TD className="tabular">{formatTime(c.scanned_at)}{c.served_at ? <div className="text-xs text-fg-muted">served {formatTime(c.served_at)}</div> : null}</TD>
                <TD className="capitalize text-fg-secondary">{c.source}</TD>
                <TD right className="tabular">{formatMoney(c.worker_price_minor)}</TD>
                <TD right className="tabular">{c.company_share_minor ? formatMoney(c.company_share_minor) : "-"}</TD>
                <TD><Badge variant={c.status === "served" ? "success" : c.status === "cancelled" ? "danger" : "info"}>{c.status}</Badge>{c.cancel_reason ? <div className="text-xs text-fg-muted">{c.cancel_reason}</div> : null}</TD>
                <TD right>{c.status !== "cancelled" ? <Button variant="ghost" size="sm" onClick={() => setCancel(c)}><XCircle className="h-4 w-4 text-danger" /> Cancel</Button> : null}</TD>
              </TR>
            )) : <EmptyRow colSpan={10}>No meals on this day.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!cancel} onClose={() => setCancel(null)} title={cancel ? `Cancel token ${cancel.token_label}?` : ""} description={cancel ? `${cancel.employee_name}, ${cancel.dish}. The worker's account is refunded ${formatMoney(cancel.worker_price_minor)} and they may take a meal again in this session.` : undefined} size="sm"
        footer={<><Button variant="secondary" onClick={() => setCancel(null)}>Keep</Button><Button variant="destructive" loading={busy} disabled={reason.trim().length < 3} onClick={doCancel}>Cancel the meal</Button></>}>
        <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong finger, meal not collected, duplicate card" autoFocus /></Field>
      </Dialog>
    </>
  );
}
