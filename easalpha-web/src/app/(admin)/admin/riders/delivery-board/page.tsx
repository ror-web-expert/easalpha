"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Route, LayoutGrid, List, Bike, Info, UserPlus, UserMinus, Banknote, MapPin, Phone } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Delivery, DeliveryStatus } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime, formatTime, isoDay } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { usePagedList } from "@/lib/hooks";
import { Cards, FilterBar, LoadMore, PageHeader } from "@/components/admin/page";
import { DELIVERY_LABELS, DELIVERY_STATUSES, NEXT_STATUSES, deliveryStatusVariant, useRiders } from "@/components/admin/delivery";
import { OrderDrawer } from "@/components/admin/order-drawer";
import { Badge, Button, Checkbox, Dialog, EmptyRow, Field, Input, KeyValue, Loading, MoneyInput, Select, Sheet, SummaryCard, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";
import { toast } from "@/store/toast";

type Action = { kind: "assign"; d: Delivery } | { kind: "status"; d: Delivery; to: DeliveryStatus } | { kind: "cash"; d: Delivery };
const BOARD_COLUMNS: DeliveryStatus[] = ["unassigned", "assigned", "picked_up", "on_the_way", "arrived", "delivered", "failed"];

export default function DeliveryBoardPage() {
  const qc = useQueryClient();
  const [day, setDay] = useState(isoDay());
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState("");
  const [rider, setRider] = useState("");
  const [view, setView] = useState<"board" | "table">("board");
  const riders = useRiders();
  const list = usePagedList<Delivery>(["deliveries"], "/deliveries", { business_day: day, open: open ? "true" : "", status, rider_id: rider, limit: 100 });
  const [selected, setSelected] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [riderId, setRiderId] = useState("");
  const [note, setNote] = useState("");
  const [cash, setCash] = useState(0);
  const [busy, setBusy] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["deliveries"] }); qc.invalidateQueries({ queryKey: ["delivery"] }); qc.invalidateQueries({ queryKey: ["riders"] }); };
  const post = async (path: string, body: Record<string, unknown>, success: string) => {
    setBusy(true);
    try { await api(path, { method: "POST", body }); toast.success(success); refresh(); setAction(null); }
    catch (e) { toast.error("Action failed", errorMessage(e)); }
    finally { setBusy(false); }
  };
  const start = (a: Action) => {
    setRiderId(a.d.rider_id ?? ""); setNote(""); setCash(a.d.cash_collected_minor ?? (a.kind === "status" && a.to === "delivered" && a.d.payment_status !== "paid" ? a.d.order_total_minor : 0));
    if (a.kind === "status" && a.to !== "failed" && a.to !== "delivered") { void post(`/deliveries/${a.d.id}/status`, { status: a.to }, `${a.d.order_label} marked ${DELIVERY_LABELS[a.to].toLowerCase()}`); return; }
    setAction(a);
  };
  const unassign = (d: Delivery) => post(`/deliveries/${d.id}/unassign`, {}, `${d.order_label} unassigned`);
  const rows = list.rows;
  const counts = Object.fromEntries(DELIVERY_STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<DeliveryStatus, number>;
  const cashOut = rows.filter((r) => r.status === "delivered").reduce((a, r) => a + (r.cash_collected_minor ?? 0), 0);
  const actions = (d: Delivery) => (
    <div className="flex flex-wrap items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {d.status === "unassigned" || d.status === "failed" ? <Button size="sm" variant="soft" onClick={() => start({ kind: "assign", d })}><UserPlus className="h-3.5 w-3.5" /> Assign</Button> : null}
      {d.status === "assigned" ? <Button size="sm" variant="ghost" onClick={() => unassign(d)} title="Unassign"><UserMinus className="h-3.5 w-3.5" /></Button> : null}
      {NEXT_STATUSES[d.status].filter((s) => s !== "assigned" && s !== "unassigned").length ? (
        <Select className="h-8 w-auto text-xs" value="" onChange={(e) => { const to = e.target.value as DeliveryStatus; if (to) start({ kind: "status", d, to }); }} aria-label="Move to">
          <option value="">Move to…</option>
          {NEXT_STATUSES[d.status].filter((s) => s !== "assigned" && s !== "unassigned").map((s) => <option key={s} value={s}>{DELIVERY_LABELS[s]}</option>)}
        </Select>
      ) : null}
      {d.status !== "unassigned" ? <Button size="sm" variant="ghost" onClick={() => start({ kind: "cash", d })} title="Cash collected"><Banknote className="h-3.5 w-3.5" /></Button> : null}
    </div>
  );
  return (
    <>
      <PageHeader icon={Route} title="Delivery board" description="Every delivery order of the business day with its rider and where it is." actions={<>
        <Link href="/admin/riders/manage"><Button variant="secondary"><Bike className="h-4 w-4" /> Riders</Button></Link>
        <Tabs value={view} onChange={setView} items={[{ value: "board", label: <LayoutGrid className="h-4 w-4" /> }, { value: "table", label: <List className="h-4 w-4" /> }]} />
      </>} />
      <Cards>
        <SummaryCard label="Waiting for a rider" value={counts.unassigned} tone="warning" />
        <SummaryCard label="On the road" value={counts.assigned + counts.picked_up + counts.on_the_way + counts.arrived} sub={`${counts.assigned} assigned · ${counts.picked_up + counts.on_the_way} moving · ${counts.arrived} arrived`} tone="info" />
        <SummaryCard label="Delivered" value={counts.delivered} sub={`${counts.failed} failed`} tone="success" />
        <SummaryCard label="Cash with riders" value={formatMoney(cashOut)} sub="Collected on delivered orders, not yet settled" tone="neutral" />
      </Cards>
      <FilterBar>
        <Input type="date" className="w-auto" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Business day" />
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{DELIVERY_STATUSES.map((s) => <option key={s} value={s}>{DELIVERY_LABELS[s]}</option>)}</Select>
        <Select className="w-auto" value={rider} onChange={(e) => setRider(e.target.value)}><option value="">All riders</option>{riders.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
        <Checkbox label="Open only" checked={open} onChange={(e) => setOpen(e.target.checked)} />
      </FilterBar>
      <p className="mb-4 flex items-start gap-2 rounded-md border border-info/30 bg-info-soft/40 px-3 py-2 text-xs text-fg-secondary"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" /> Delivered never closes the order; the cashier closes it at the till once the rider hands in the cash. Cash collected here feeds the rider&apos;s settlement.</p>
      {list.isLoading ? <Loading /> : view === "board" ? (
        <div className="grid gap-3 overflow-x-auto md:grid-cols-2 xl:grid-cols-4">
          {BOARD_COLUMNS.filter((s) => !open || !["delivered", "failed"].includes(s) || counts[s] > 0).map((s) => (
            <div key={s} className="flex min-h-40 flex-col rounded-lg border bg-muted/40">
              <div className="flex items-center justify-between border-b px-3 py-2"><Badge variant={deliveryStatusVariant(s)}>{DELIVERY_LABELS[s]}</Badge><span className="text-xs tabular text-fg-muted">{counts[s]}</span></div>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {rows.filter((r) => r.status === s).map((d) => (
                  <div key={d.id} className="cursor-pointer rounded-md border bg-card p-2.5 shadow-sm hover:border-primary" onClick={() => setSelected(d.id)}>
                    <div className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-semibold">{d.order_label}</span><span className="text-xs text-fg-muted">{formatTime(d.created_at)}</span></div>
                    <div className="mt-1 truncate text-sm">{d.guest_name ?? "Customer"}{d.zone_name ? <span className="text-fg-muted"> · {d.zone_name}</span> : null}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-fg-secondary"><span className="inline-flex items-center gap-1"><Bike className="h-3 w-3" /> {d.rider_name ?? "No rider"}</span><span className="tabular font-medium">{formatMoney(d.order_total_minor)}</span></div>
                    <div className="mt-2">{actions(d)}</div>
                  </div>
                ))}
                {!counts[s] ? <div className="py-6 text-center text-xs text-fg-muted">None</div> : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Table>
          <THead><tr><TH>Order</TH><TH>Customer</TH><TH>Zone</TH><TH>Rider</TH><TH>Status</TH><TH right>Total</TH><TH right>Cash</TH><TH>Placed</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {rows.length ? rows.map((d) => (
              <TR key={d.id} onClick={() => setSelected(d.id)}>
                <TD className="font-mono font-medium">{d.order_label}</TD>
                <TD>{d.guest_name ?? "-"}</TD>
                <TD className="text-fg-secondary">{d.zone_name ?? "-"}</TD>
                <TD>{d.rider_name ?? <span className="text-fg-muted">-</span>}</TD>
                <TD><Badge variant={deliveryStatusVariant(d.status)}>{DELIVERY_LABELS[d.status]}</Badge></TD>
                <TD right>{formatMoney(d.order_total_minor)}</TD>
                <TD right>{d.cash_collected_minor != null ? formatMoney(d.cash_collected_minor) : "-"}</TD>
                <TD className="text-fg-secondary">{formatDateTime(d.created_at)}</TD>
                <TD right>{actions(d)}</TD>
              </TR>
            )) : <EmptyRow colSpan={9}>No deliveries for this day.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />

      <Dialog open={!!action} onClose={() => setAction(null)} size="sm"
        title={action?.kind === "assign" ? `Assign ${action.d.order_label}` : action?.kind === "cash" ? `Cash collected for ${action.d.order_label}` : action ? `Mark ${action.d.order_label} ${DELIVERY_LABELS[action.to].toLowerCase()}` : ""}
        footer={<><Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
          {action?.kind === "assign" ? <Button loading={busy} disabled={!riderId} onClick={() => post(`/deliveries/${action.d.id}/assign`, { rider_id: riderId }, "Rider assigned")}>Assign</Button> : null}
          {action?.kind === "cash" ? <Button loading={busy} onClick={() => post(`/deliveries/${action.d.id}/cash`, { cash_collected_minor: cash }, "Cash recorded")}>Save</Button> : null}
          {action?.kind === "status" ? <Button loading={busy} variant={action.to === "failed" ? "destructive" : "primary"} disabled={action.to === "failed" && !note.trim()} onClick={() => post(`/deliveries/${action.d.id}/status`, { status: action.to, note: note || undefined, cash_collected_minor: action.to === "delivered" ? cash : undefined }, `Marked ${DELIVERY_LABELS[action.to].toLowerCase()}`)}>{DELIVERY_LABELS[action.to]}</Button> : null}
        </>}>
        {action?.kind === "assign" ? (
          <Field label="Rider" hint="Only active riders of this branch">
            <Select value={riderId} onChange={(e) => setRiderId(e.target.value)} autoFocus>
              <option value="">Choose…</option>
              {riders.data?.map((r) => <option key={r.id} value={r.id}>{r.name} · {titleCase(r.status)}{r.open_deliveries ? ` · ${r.open_deliveries} open` : ""}</option>)}
            </Select>
          </Field>
        ) : null}
        {action?.kind === "cash" || (action?.kind === "status" && action.to === "delivered") ? (
          <Field label="Cash collected" hint={action.d.payment_status === "paid" ? "This order is already paid; leave 0 unless cash changed hands." : `Order total ${formatMoney(action.d.order_total_minor)}`}><MoneyInput value={cash} onChange={setCash} autoFocus /></Field>
        ) : null}
        {action?.kind === "status" && action.to === "failed" ? <Field label="Why did it fail?"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Customer not answering, wrong address…" autoFocus /></Field> : null}
      </Dialog>
      <DeliveryDrawer id={selected} onClose={() => setSelected(null)} onOpenOrder={(oid) => { setSelected(null); setOrderId(oid); }} />
      <OrderDrawer id={orderId} onClose={() => setOrderId(null)} />
    </>
  );
}

function DeliveryDrawer({ id, onClose, onOpenOrder }: { id: string | null; onClose: () => void; onOpenOrder: (orderId: string) => void }) {
  const q = useQuery({ queryKey: ["delivery", id], queryFn: () => api<Delivery>(`/deliveries/${id}`), enabled: !!id });
  const d = q.data;
  return (
    <Sheet open={!!id} onClose={onClose} title={d ? `Delivery for ${d.order_label}` : "Delivery"} description={d ? <span className="inline-flex items-center gap-2"><Badge variant={deliveryStatusVariant(d.status)}>{DELIVERY_LABELS[d.status]}</Badge>{d.zone_name ? <span>{d.zone_name}</span> : null}</span> : undefined}
      footer={d ? <Button variant="secondary" onClick={() => onOpenOrder(d.order_id)}>Open order</Button> : undefined}>
      {!d ? <Loading /> : (
        <div className="space-y-5">
          <KeyValue items={[
            { label: "Order", value: `${d.order_label} · ${titleCase(d.order_status)}` },
            { label: "Payment", value: titleCase(d.payment_status) },
            { label: "Total", value: formatMoney(d.order_total_minor) },
            { label: "Delivery charge", value: formatMoney(d.charge_minor) },
            { label: "Cash collected", value: d.cash_collected_minor != null ? formatMoney(d.cash_collected_minor) : "-" },
            { label: "Rider", value: d.rider_name ?? "-" },
            { label: "Settled", value: d.settled_at ? formatDateTime(d.settled_at) : "Not yet" },
          ]} />
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Customer</div>
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">{d.customer?.name ?? d.guest_name ?? "Walk-in"}</div>
              {d.customer?.phone ? <div className="mt-0.5 inline-flex items-center gap-1 text-fg-secondary"><Phone className="h-3.5 w-3.5" /> {d.customer.phone}</div> : null}
              {d.address ? <div className="mt-1 flex items-start gap-1 text-fg-secondary"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{d.address.text}</span></div> : <div className="mt-1 text-fg-muted">No address on file</div>}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Items</div>
            <ul className="divide-y rounded-md border text-sm">{d.items?.length ? d.items.map((i, idx) => <li key={idx} className="flex justify-between px-3 py-2"><span>{i.name}</span><span className="tabular text-fg-secondary">× {Number(i.quantity)}</span></li>) : <li className="px-3 py-2 text-fg-muted">No items</li>}</ul>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Timeline</div>
            <ol className="relative ml-2 border-l pl-4 text-sm">
              <li className="relative pb-3"><span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-fg-muted" /><div className="font-medium">Created</div><div className="text-xs text-fg-muted">{formatDateTime(d.created_at)}</div></li>
              {d.events?.map((e, i) => (
                <li key={i} className="relative pb-3"><span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" /><div className="font-medium">{DELIVERY_LABELS[e.status as DeliveryStatus] ?? titleCase(e.status)}</div><div className="text-xs text-fg-muted">{formatDateTime(e.occurred_at)}{e.note ? ` · ${e.note}` : ""}{e.lat != null ? ` · ${e.lat.toFixed(4)}, ${e.lng?.toFixed(4)}` : ""}</div></li>
              ))}
            </ol>
            {d.failed_reason ? <p className="mt-1 text-xs text-danger">Failed: {d.failed_reason}</p> : null}
          </div>
          <p className="text-xs text-fg-muted">Delivered never closes the order; the cashier closes it at the till.</p>
        </div>
      )}
    </Sheet>
  );
}
