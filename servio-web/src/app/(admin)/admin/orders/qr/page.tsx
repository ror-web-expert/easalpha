"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QrCode, Check, X, BellRing, Receipt, Hand } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { QrOrder, TableRequest } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatAgo, formatDateTime } from "@/lib/dates";
import { usePagedList } from "@/lib/hooks";
import { Cards, LoadMore, PageHeader } from "@/components/admin/page";
import { OrderDrawer } from "@/components/admin/order-drawer";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Dialog, EmptyRow, Field, Input, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR, Tabs, orderStatusVariant } from "@/components/ui";
import { toast } from "@/store/toast";

type Tab = "pending" | "accepted" | "rejected";

export default function QrOrdersPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("pending");
  const [allDays, setAllDays] = useState(false);
  const pending = useQuery({ queryKey: ["qr_orders", "pending", "count"], queryFn: () => api<{ data: QrOrder[] }>("/qr_orders", { query: { status: "pending", limit: 100 } }), refetchInterval: 10_000, select: (r) => r.data });
  const list = usePagedList<QrOrder>(["qr_orders", tab], "/qr_orders", { status: tab, all_days: allDays ? "true" : "" }, { enabled: tab !== "pending" });
  const requests = useQuery({ queryKey: ["qr_requests"], queryFn: () => api<{ data: TableRequest[] }>("/qr_orders/requests", { query: { open: "true" } }), refetchInterval: 10_000, select: (r) => r.data });
  const [reject, setReject] = useState<QrOrder | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["qr_orders"] }); qc.invalidateQueries({ queryKey: ["qr_requests"] }); qc.invalidateQueries({ queryKey: ["tables"] }); };
  const act = async (id: string, path: string, body: Record<string, unknown>, success: string) => {
    setBusy(id);
    try { await api(path, { method: "POST", body }); toast.success(success); refresh(); setReject(null); setReason(""); }
    catch (e) { toast.error("Action failed", errorMessage(e)); }
    finally { setBusy(null); }
  };
  const rows = tab === "pending" ? pending.data ?? [] : list.rows;
  const loading = tab === "pending" ? pending.isLoading : list.isLoading;
  const reqs = requests.data ?? [];
  return (
    <>
      <PageHeader icon={QrCode} title="Online & QR orders" description="Orders customers placed on the website and guests placed from a table card. Pending orders wait for a cashier before they reach the kitchen. Refreshes every 10 seconds." />
      <Cards>
        <SummaryCard label="Waiting for acceptance" value={pending.data?.length ?? 0} tone={pending.data?.length ? "warning" : "neutral"} />
        <SummaryCard label="Waiter calls" value={reqs.filter((r) => r.kind === "call_waiter").length} tone="info" />
        <SummaryCard label="Bill requests" value={reqs.filter((r) => r.kind === "ask_bill").length} tone="primary" />
        <SummaryCard label="Oldest pending" value={pending.data?.length ? formatAgo(pending.data[pending.data.length - 1].created_at) : "-"} tone="neutral" />
      </Cards>
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Tabs value={tab} onChange={setTab} items={[{ value: "pending", label: "Pending", count: pending.data?.length }, { value: "accepted", label: "Accepted" }, { value: "rejected", label: "Rejected" }]} className="w-fit" />
            {tab !== "pending" ? <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={allDays} onChange={(e) => setAllDays(e.target.checked)} /> All days</label> : null}
          </div>
          {loading ? <Loading /> : (
            <Table>
              <THead><tr><TH>From</TH><TH>Customer</TH><TH>Order</TH><TH right>Items</TH><TH right>Total</TH><TH>Placed</TH><TH right>Actions</TH></tr></THead>
              <TBody>
                {rows.length ? rows.map((o) => (
                  <TR key={o.id} onClick={() => setSelected(o.id)}>
                    <TD className="font-semibold">{o.source === "online" ? <span className="inline-flex items-center gap-1"><Badge variant="info">Website</Badge><span className="text-xs font-normal text-fg-secondary">{o.order_type === "delivery" ? "Delivery" : "Pickup"}</span></span> : <span>Table {o.table_code ?? "-"}</span>}</TD>
                    <TD>{o.guest_name ?? <span className="text-fg-muted">No name</span>}{o.address_text ? <div className="max-w-[260px] truncate text-xs text-fg-secondary" title={o.address_text}>{o.address_text}</div> : null}</TD>
                    <TD><span className="font-mono text-xs">{o.label}</span> <Badge variant={o.qr_status === "pending" ? "warning" : o.qr_status === "accepted" ? "success" : "danger"} className="ml-1">{o.qr_status}</Badge> {tab !== "pending" ? <Badge variant={orderStatusVariant(o.status)} className="ml-1">{o.status}</Badge> : null}</TD>
                    <TD right>{o.item_count}</TD>
                    <TD right className="font-medium">{formatMoney(o.total_minor)}</TD>
                    <TD className="text-fg-secondary" title={formatDateTime(o.created_at)}>{formatAgo(o.created_at)}</TD>
                    <TD right onClick={(e) => e.stopPropagation()}>
                      {o.qr_status === "pending" ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" loading={busy === o.id} onClick={() => act(o.id, `/qr_orders/${o.id}/accept`, {}, `${o.label} sent to the kitchen`)}><Check className="h-3.5 w-3.5" /> Accept</Button>
                          <Button size="sm" variant="secondary" onClick={() => { setReject(o); setReason(""); }}><X className="h-3.5 w-3.5" /> Reject</Button>
                        </div>
                      ) : <Button size="sm" variant="ghost" onClick={() => setSelected(o.id)}>View</Button>}
                    </TD>
                  </TR>
                )) : <EmptyRow colSpan={7}>{tab === "pending" ? "No orders waiting. New website and QR orders appear here within 10 seconds." : `No ${tab} QR orders${allDays ? "" : " today"}.`}</EmptyRow>}
              </TBody>
            </Table>
          )}
          {tab !== "pending" ? <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} /> : null}
        </div>
        <Card className="self-start">
          <CardHeader><CardTitle>Requests</CardTitle><span className="text-xs text-fg-muted">{reqs.length} open</span></CardHeader>
          <CardBody className="space-y-2">
            {requests.isLoading ? <Loading /> : reqs.length ? reqs.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-md border p-2.5">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${r.kind === "ask_bill" ? "bg-primary-soft text-primary" : "bg-info-soft text-info"}`}>{r.kind === "ask_bill" ? <Receipt className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">Table {r.table_code} <span className="font-normal text-fg-secondary">· {r.kind === "ask_bill" ? "wants the bill" : "called a waiter"}</span></div>
                  <div className="truncate text-xs text-fg-muted">{[r.guest_name, r.note, formatAgo(r.requested_at)].filter(Boolean).join(" · ")}</div>
                </div>
                <Button size="sm" variant="soft" loading={busy === r.id} onClick={() => act(r.id, `/qr_orders/requests/${r.id}/handle`, {}, `Table ${r.table_code} handled`)}><Hand className="h-3.5 w-3.5" /> Handle</Button>
              </div>
            )) : <p className="py-6 text-center text-sm text-fg-muted">No open requests.</p>}
          </CardBody>
        </Card>
      </div>
      <Dialog open={!!reject} onClose={() => setReject(null)} title={`Reject ${reject?.label}?`} description={reject ? `Table ${reject.table_code ?? "-"}${reject.guest_name ? ` · ${reject.guest_name}` : ""}. The guest sees that the cashier could not accept the order.` : undefined} size="sm"
        footer={<><Button variant="secondary" onClick={() => setReject(null)}>Cancel</Button><Button variant="destructive" loading={!!busy} disabled={!reason.trim()} onClick={() => reject && act(reject.id, `/qr_orders/${reject.id}/reject`, { reason }, `${reject.label} rejected`)}>Reject</Button></>}>
        <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Kitchen closed, item unavailable…" autoFocus /></Field>
      </Dialog>
      <OrderDrawer id={selected} onClose={() => setSelected(null)} />
    </>
  );
}
