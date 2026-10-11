"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, RefreshCw, UserPlus, Banknote, MapPin, Phone } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { assignRider, DELIVERY_LABELS, deliveryStatusVariant, listDeliveries, listRiders, moveDelivery, NEXT_STATUSES, recordDeliveryCash, unassignRider } from "@/lib/till-extras";
import type { Delivery, DeliveryStatus, Rider } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatAgo, formatTime } from "@/lib/dates";
import { useCatalogStore } from "@/store/catalog";
import { useSyncStore } from "@/store/sync";
import { toast } from "@/store/toast";
import { PosShell } from "@/components/pos/shell";
import { ReasonDialog } from "@/components/pos/dialogs";
import { useLiveStore } from "@/components/pos/live";
import { Badge, Button, Dialog, EmptyState, Field, MoneyInput, Tabs, paymentStatusVariant } from "@/components/ui";
import { cn, titleCase } from "@/lib/utils";

const FAIL_REASONS = ["Customer not reachable", "Wrong address", "Customer refused", "Rider accident", "Order cancelled"];

export default function DeliveryPage() {
  const router = useRouter();
  const currency = useCatalogStore((s) => s.catalog?.business.currency);
  const status = useSyncStore((s) => s.status);
  const lastLive = useLiveStore((s) => s.lastAt);
  const [tab, setTab] = useState<"open" | "all">("open");
  const [rows, setRows] = useState<Delivery[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<Delivery | null>(null);
  const [failing, setFailing] = useState<Delivery | null>(null);
  const [cashFor, setCashFor] = useState<{ d: Delivery; to: DeliveryStatus | null; amount: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await listDeliveries(tab === "open")); } catch (e) { toast.error("Could not load deliveries", errorMessage(e)); }
    finally { setLoading(false); }
  }, [tab]);
  useEffect(() => { load(); }, [load]);
  // The live feed refreshes on every order change broadcast; follow it, and poll as a fallback.
  useEffect(() => { if (lastLive) load(); }, [lastLive, load]);
  useEffect(() => { const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);
  useEffect(() => { listRiders().then(setRiders).catch(() => {}); }, []);

  const apply = async (d: Delivery, fn: () => Promise<Delivery>, ok: string) => {
    setBusy(d.id);
    try { const next = await fn(); setRows((r) => r.map((x) => (x.id === next.id ? { ...x, ...next } : x))); toast.success(ok); }
    catch (e) { toast.error("Could not update", errorMessage(e)); load(); }
    finally { setBusy(null); }
  };
  const move = (d: Delivery, to: DeliveryStatus) => {
    if (to === "failed") { setFailing(d); return; }
    if (to === "unassigned") { apply(d, () => unassignRider(d.id), "Rider removed"); return; }
    if (to === "assigned") { setAssigning(d); return; }
    if (to === "delivered") { setCashFor({ d, to, amount: d.payment_status === "paid" ? 0 : d.cash_collected_minor ?? d.order_total_minor }); return; }
    apply(d, () => moveDelivery(d.id, to), `${d.order_label} ${DELIVERY_LABELS[to].toLowerCase()}`);
  };
  const confirmCash = async () => {
    if (!cashFor) return;
    const { d, to, amount } = cashFor;
    setCashFor(null);
    if (to) await apply(d, () => moveDelivery(d.id, to, { cash_collected_minor: amount }), `${d.order_label} delivered · ${formatMoney(amount, currency)} collected`);
    else await apply(d, () => recordDeliveryCash(d.id, amount), `Cash recorded for ${d.order_label}`);
  };

  const counts = { unassigned: rows.filter((r) => r.status === "unassigned").length, out: rows.filter((r) => ["picked_up", "on_the_way", "arrived"].includes(r.status)).length };

  return (
    <PosShell title={`Delivery · ${counts.unassigned} unassigned · ${counts.out} on the road`}>
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b bg-card p-2">
          <Tabs size="lg" value={tab} onChange={setTab} items={[{ value: "open", label: "Open", count: tab === "open" ? rows.length : undefined }, { value: "all", label: "All today" }]} />
          <div className="flex gap-1 text-xs">
            {(["unassigned", "assigned", "picked_up", "on_the_way", "arrived", "delivered", "failed"] as DeliveryStatus[]).map((s) => <Badge key={s} variant={deliveryStatusVariant(s)}>{DELIVERY_LABELS[s]}</Badge>)}
          </div>
          <div className="flex-1" />
          <Button variant="secondary" size="lg" onClick={load} loading={loading} disabled={status === "offline"}><RefreshCw className="h-4 w-4" /> Refresh</Button>
        </div>
        <p className="border-b bg-info-soft/50 px-3 py-1.5 text-xs text-fg-secondary">Delivered never closes the order: the cashier still takes the payment at the till (Pay from the order). Cash the rider brings back is settled on the rider.</p>
        <div className="grid flex-1 grid-cols-1 gap-2 overflow-y-auto p-2 lg:grid-cols-2 2xl:grid-cols-3">
          {rows.map((d) => {
            const nexts = NEXT_STATUSES[d.status] ?? [];
            return (
              <div key={d.id} className={cn("flex flex-col rounded-lg border bg-card p-3 shadow-sm", d.status === "unassigned" && "border-warning", d.status === "failed" && "border-danger")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-2xl font-bold">{d.order_label} <Badge variant={deliveryStatusVariant(d.status)}>{DELIVERY_LABELS[d.status] ?? titleCase(d.status)}</Badge></div>
                    <div className="truncate text-sm text-fg-secondary">{d.customer?.name ?? d.guest_name ?? "Customer"}{d.customer?.phone ? <span className="inline-flex items-center gap-1"> · <Phone className="h-3 w-3" />{d.customer.phone}</span> : null} · {formatTime(d.created_at)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-semibold tabular">{formatMoney(d.order_total_minor, currency)}</div>
                    <Badge variant={paymentStatusVariant(d.payment_status)}>{titleCase(d.payment_status)}</Badge>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  {d.address?.text || d.zone_name ? <span className="inline-flex items-center gap-1 text-fg-secondary"><MapPin className="h-4 w-4" />{d.address?.text ?? ""}{d.zone_name ? <Badge className="ml-1">{d.zone_name}</Badge> : null}</span> : null}
                  {d.charge_minor ? <span className="text-fg-muted">Delivery {formatMoney(d.charge_minor, currency)}</span> : null}
                  <span className={cn("font-medium", d.rider_name ? "" : "text-warning")}>{d.rider_name ? `Rider: ${d.rider_name}` : "No rider yet"}</span>
                  {d.failed_reason ? <span className="text-danger">{d.failed_reason}</span> : null}
                  {d.cash_collected_minor != null ? <span className="text-success">Cash collected {formatMoney(d.cash_collected_minor, currency)}</span> : null}
                  {d.delivered_at ? <span className="text-fg-muted">delivered {formatAgo(d.delivered_at)}</span> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {d.status === "unassigned" || d.status === "failed" ? <Button size="lg" onClick={() => setAssigning(d)} disabled={busy === d.id}><UserPlus className="h-5 w-5" /> Assign rider</Button> : null}
                  {d.status === "assigned" ? <Button size="lg" variant="secondary" onClick={() => setAssigning(d)} disabled={busy === d.id}><UserPlus className="h-4 w-4" /> Change rider</Button> : null}
                  {nexts.filter((s) => s !== "assigned").map((s) => (
                    <Button key={s} size="lg" variant={s === "failed" ? "destructive" : s === "delivered" ? "primary" : "secondary"} onClick={() => move(d, s)} loading={busy === d.id}>{DELIVERY_LABELS[s]}</Button>
                  ))}
                  {d.status === "delivered" ? <Button size="lg" variant="secondary" onClick={() => setCashFor({ d, to: null, amount: d.cash_collected_minor ?? (d.payment_status === "paid" ? 0 : d.order_total_minor) })}><Banknote className="h-4 w-4" /> Cash collected</Button> : null}
                  {d.payment_status !== "paid" && d.order_status !== "voided" ? <Button size="lg" variant="soft" onClick={() => router.push(`/pos?order=${d.order_id}`)}><Banknote className="h-5 w-5" /> Pay at till</Button> : null}
                </div>
              </div>
            );
          })}
          {!rows.length && !loading ? <EmptyState icon={Bike} title={tab === "open" ? "No open deliveries" : "No deliveries today"} hint="Delivery orders placed at the till show here with their rider and status." className="col-span-full m-4" /> : null}
        </div>
      </div>

      <Dialog open={!!assigning} onClose={() => setAssigning(null)} title={assigning ? `Rider for ${assigning.order_label}` : ""} description="Active riders for this branch. Busy riders can still take another drop." size="md">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {riders.map((r) => (
            <button key={r.id} disabled={!!busy} onClick={() => { const d = assigning!; setAssigning(null); apply(d, () => assignRider(d.id, r.id), `${r.name} assigned to ${d.order_label}`); }} className={cn("flex min-h-16 items-center justify-between rounded-lg border p-3 text-left hover:bg-muted", assigning?.rider_id === r.id && "border-primary bg-primary-soft")}>
              <div><div className="text-lg font-semibold">{r.name}</div><div className="text-xs text-fg-secondary">{r.vehicle ?? "rider"}{r.vehicle_no ? ` · ${r.vehicle_no}` : ""}{r.phone ? ` · ${r.phone}` : ""}</div></div>
              <div className="text-right text-xs"><Badge variant={r.status === "available" ? "success" : r.status === "busy" ? "info" : "neutral"}>{titleCase(r.status)}</Badge><div className="mt-1 text-fg-muted">{r.open_deliveries ?? 0} open</div></div>
            </button>
          ))}
          {!riders.length ? <p className="col-span-full py-6 text-center text-sm text-fg-muted">No riders set up. Add them in the admin under Delivery.</p> : null}
        </div>
      </Dialog>
      <ReasonDialog open={!!failing} onClose={() => setFailing(null)} onConfirm={(reason) => { const d = failing!; setFailing(null); apply(d, () => moveDelivery(d.id, "failed", { note: reason }), `${d.order_label} marked failed`); }} title={failing ? `Fail ${failing.order_label}` : "Fail delivery"} description="The order stays open; void or re-dispatch it from Orders." confirmLabel="Mark failed" presets={FAIL_REASONS} />
      <Dialog open={!!cashFor} onClose={() => setCashFor(null)} title={cashFor?.to ? `Delivered · ${cashFor.d.order_label}` : `Cash collected · ${cashFor?.d.order_label ?? ""}`} description="How much cash did the rider collect from the customer? Zero when it was prepaid. The order is still closed by Pay at the till." size="sm" footer={<><Button variant="secondary" onClick={() => setCashFor(null)}>Cancel</Button><Button onClick={confirmCash}>{cashFor?.to ? "Mark delivered" : "Save"}</Button></>}>
        {cashFor ? <Field label="Cash collected"><MoneyInput value={cashFor.amount} onChange={(v) => setCashFor({ ...cashFor, amount: v })} className="h-14 text-2xl" autoFocus /></Field> : null}
        {cashFor ? <div className="mt-2 flex gap-2">{[0, cashFor.d.order_total_minor].filter((v, i, a) => a.indexOf(v) === i).map((v) => <button key={v} onClick={() => setCashFor({ ...cashFor, amount: v })} className={cn("min-h-11 rounded-lg border px-3 text-sm", cashFor.amount === v ? "border-primary bg-primary-soft" : "bg-card")}>{v ? `Bill ${formatMoney(v, currency)}` : "Prepaid · none"}</button>)}</div> : null}
      </Dialog>
    </PosShell>
  );
}
