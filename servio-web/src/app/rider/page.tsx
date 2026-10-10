"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, LogOut, RefreshCw, MapPin, Phone, Wallet, PackageCheck } from "lucide-react";
import { errorMessage } from "@/lib/api";
import type { Delivery, RiderDeliveries, RiderFloat } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatAgo, formatTime } from "@/lib/dates";
import { DELIVERY_LABELS, deliveryStatusVariant } from "@/components/admin/delivery";
import { addressLine, groupDeliveries, isCashOrder, riderNextSteps, type RiderStep } from "@/components/admin/riders-helpers";
import { riderApi } from "@/components/rider/api";
import { PushToggle } from "@/components/admin/push-enable";
import { useRiderStore } from "@/components/rider/store";
import { Badge, Button, Card, CardBody, Dialog, EmptyState, ErrorState, Field, Input, Loading, MoneyInput, Stat, ThemeToggle } from "@/components/ui";
import { toast } from "@/store/toast";

const POLL_MS = 30_000;
type Pending = { d: Delivery; step: RiderStep; cash: number; reason: string };

export default function RiderHomePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const session = useRiderStore((s) => s.session);
  const signOut = useRiderStore((s) => s.signOut);
  const [showAll, setShowAll] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const deliveries = useQuery({ queryKey: ["rider_deliveries", showAll], enabled: !!session, refetchInterval: POLL_MS, queryFn: () => riderApi<RiderDeliveries>("/rider/deliveries", { query: { all: showAll ? "true" : undefined } }) });
  const float = useQuery({ queryKey: ["rider_float"], enabled: !!session, refetchInterval: POLL_MS, queryFn: () => riderApi<RiderFloat>("/rider/float") });
  useEffect(() => { if (!session) router.replace("/rider/pin"); }, [session, router]);
  const rider = deliveries.data?.rider;
  const perms = rider?.permissions ?? [];
  const temp = !!rider?.temporary;
  const canFail = !temp || perms.includes("mark_failed");
  const canCollect = !temp || perms.includes("collect_cash");
  const seePhone = !temp || perms.includes("see_phone");
  const groups = groupDeliveries(deliveries.data?.data ?? []);
  const openCount = (deliveries.data?.data ?? []).filter((d) => !["delivered", "failed"].includes(d.status)).length;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["rider_deliveries"] }); qc.invalidateQueries({ queryKey: ["rider_float"] }); };
  const start = (d: Delivery, step: RiderStep) => {
    const needsInput = (step.asksCash && canCollect) || step.asksReason;
    if (!needsInput) return send(d, step, {});
    setPending({ d, step, cash: d.cash_collected_minor ?? d.order_total_minor, reason: "" });
  };
  const send = async (d: Delivery, step: RiderStep, extra: { cash_collected_minor?: number; note?: string }) => {
    setBusy(true);
    try {
      const pos = await position();
      await riderApi(`/rider/deliveries/${d.id}/status`, { method: "POST", body: { status: step.to, ...extra, ...pos } });
      toast.success(`${d.order_label}: ${DELIVERY_LABELS[step.to]}`);
      setPending(null); refresh();
    } catch (e) { toast.error("Could not update", errorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <main className="flex min-h-screen flex-col pb-8">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-page/95 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-fg"><Bike className="h-5 w-5" /></span>
          <div className="min-w-0">
            <div className="truncate font-medium">{rider?.name ?? session?.user?.name ?? "Rider"}</div>
            <div className="truncate text-xs text-fg-muted">{openCount} open · {deliveries.dataUpdatedAt ? `updated ${formatAgo(new Date(deliveries.dataUpdatedAt))}` : "loading"}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Refresh" onClick={() => { refresh(); deliveries.refetch(); }}><RefreshCw className={`h-5 w-5 ${deliveries.isFetching ? "animate-spin" : ""}`} /></Button>
          <ThemeToggle />
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => { signOut(); router.replace("/rider/pin"); }}><LogOut className="h-5 w-5" /></Button>
        </div>
      </header>

      <div className="space-y-4 px-4 pt-4">
        <Card className="bg-primary-soft">
          <CardBody className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium tracking-[0.5px] text-primary-ink">FLOAT YOU HOLD</div>
              <div className="mt-1 text-3xl font-bold tabular text-primary-ink">{formatMoney(float.data?.float_minor ?? rider?.float_minor ?? 0)}</div>
              <div className="mt-1 text-xs text-primary-ink/80">
                {float.data ? `Cash collected to hand in: ${formatMoney(float.data.settlement.cash_collected_minor)} on ${float.data.settlement.deliveries_count} deliveries` : "Company cash in your pocket"}
              </div>
            </div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-primary-fg"><Wallet className="h-6 w-6" /></span>
          </CardBody>
        </Card>
        {float.data ? <p className="text-xs text-fg-muted">Hand in {formatMoney(float.data.settlement.expected_minor)} at the till when you settle: collected cash plus the float.</p> : null}
        <Card><CardBody className="flex items-center justify-between gap-3 py-3"><PushToggle app="rider" request={riderApi} label="Alert me when a delivery is assigned" /></CardBody></Card>

        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">My deliveries</h2>
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>{showAll ? "Open only" : "Show finished"}</Button>
        </div>
        {deliveries.isLoading ? <Loading /> : deliveries.isError ? <ErrorState message={errorMessage(deliveries.error)} onRetry={() => deliveries.refetch()} /> : !groups.length ? (
          <EmptyState icon={PackageCheck} title="Nothing assigned" hint="New deliveries appear here as the dispatcher assigns them. This page refreshes every 30 seconds." />
        ) : groups.map((g) => (
          <section key={g.status} className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-fg-secondary"><Badge variant={deliveryStatusVariant(g.status)}>{DELIVERY_LABELS[g.status]}</Badge><span>{g.rows.length}</span></div>
            {g.rows.map((d) => <DeliveryCard key={d.id} d={d} canFail={canFail} canCollect={canCollect} seePhone={seePhone} busy={busy} onStep={(s) => start(d, s)} />)}
          </section>
        ))}
      </div>

      <Dialog open={!!pending} onClose={() => setPending(null)} size="sm" title={pending ? `${pending.step.label}: ${pending.d.order_label}` : ""}
        description={pending?.step.asksReason ? "Tell the shop why the delivery failed." : "Enter the cash you took from the customer."}
        footer={<><Button variant="secondary" onClick={() => setPending(null)}>Cancel</Button><Button variant={pending?.step.tone === "destructive" ? "destructive" : "primary"} loading={busy} disabled={!!pending?.step.asksReason && !pending.reason.trim()} onClick={() => pending && send(pending.d, pending.step, pending.step.asksReason ? { note: pending.reason } : { cash_collected_minor: pending.cash })}>{pending?.step.label}</Button></>}>
        {pending?.step.asksReason ? (
          <Field label="Reason"><Input className="h-12" value={pending.reason} onChange={(e) => setPending({ ...pending, reason: e.target.value })} placeholder="Customer not home, wrong address" autoFocus /></Field>
        ) : pending ? (
          <div className="space-y-2">
            <Stat label="Order total" value={formatMoney(pending.d.order_total_minor)} />
            <Field label="Cash collected"><MoneyInput value={pending.cash} onChange={(v) => setPending({ ...pending, cash: v })} className="h-14 text-2xl" autoFocus /></Field>
            <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => setPending({ ...pending, cash: pending.d.order_total_minor })}>Exact</Button><Button variant="secondary" size="sm" onClick={() => setPending({ ...pending, cash: 0 })}>Nothing</Button></div>
          </div>
        ) : null}
      </Dialog>
    </main>
  );
}

function DeliveryCard({ d, canFail, canCollect, seePhone, busy, onStep }: { d: Delivery; canFail: boolean; canCollect: boolean; seePhone: boolean; busy: boolean; onStep: (s: RiderStep) => void }) {
  const cash = isCashOrder(d);
  const steps = riderNextSteps(d.status, { canFail, cashOrder: cash && canCollect });
  const address = addressLine(d.address);
  const phone = d.customer?.phone;
  const maps = d.address?.lat && d.address?.lng ? `https://maps.google.com/?q=${d.address.lat},${d.address.lng}` : address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : null;
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-mono text-lg font-semibold">{d.order_label}</div>
            <div className="text-sm">{d.customer?.name ?? d.guest_name ?? "Customer"}{d.zone_name ? <span className="text-fg-muted"> · {d.zone_name}</span> : null}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tabular">{formatMoney(d.order_total_minor)}</div>
            <div className="text-xs text-fg-muted">{cash ? "Cash on delivery" : "Paid"} · charge {formatMoney(d.charge_minor)}</div>
          </div>
        </div>
        {address ? <a href={maps ?? undefined} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-sm text-primary"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span>{address}</span></a> : null}
        {d.items?.length ? <div className="text-xs text-fg-secondary">{d.items.map((i) => `${i.quantity} x ${i.name}`).join(", ")}</div> : null}
        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          {d.assigned_at ? <span>Assigned {formatTime(d.assigned_at)}</span> : null}
          {d.picked_up_at ? <span>· Picked up {formatTime(d.picked_up_at)}</span> : null}
          {d.delivered_at ? <span>· Delivered {formatTime(d.delivered_at)}</span> : null}
          {d.failed_reason ? <span className="text-danger">· {d.failed_reason}</span> : null}
          {d.status === "delivered" && d.cash_collected_minor != null ? <span>· Collected {formatMoney(d.cash_collected_minor)}</span> : null}
        </div>
        {phone && seePhone ? <a href={`tel:${phone}`} className="flex h-12 items-center justify-center gap-2 rounded-full border border-border-strong text-sm font-medium text-primary"><Phone className="h-4 w-4" /> Call {phone}</a> : null}
        {steps.length ? (
          <div className="grid grid-cols-2 gap-2">
            {steps.map((s) => <Button key={s.to} size="xl" variant={s.tone} className={steps.length % 2 === 1 && s === steps[0] ? "col-span-2" : ""} disabled={busy} onClick={() => onStep(s)}>{s.label}</Button>)}
          </div>
        ) : null}
        {cash && !canCollect && d.status !== "delivered" && d.status !== "failed" ? <p className="text-xs text-fg-muted">Payment is taken at the counter; you are not set up to collect cash.</p> : null}
      </CardBody>
    </Card>
  );
}

function position(): Promise<{ lat?: number; lng?: number }> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve({});
    const t = setTimeout(() => resolve({}), 3000);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { clearTimeout(t); resolve({}); },
      { maximumAge: 60_000, timeout: 2500 },
    );
  });
}
