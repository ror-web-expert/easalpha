"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, CloudOff, LocateFixed, LogOut, MapPin, Navigation, PackageCheck, Phone, RefreshCw, Wallet } from "lucide-react";
import { errorMessage } from "@/lib/api";
import type { Delivery, RiderDeliveries, RiderFloat } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatAgo, formatTime } from "@/lib/dates";
import { DELIVERY_LABELS, deliveryStatusVariant } from "@/components/admin/delivery";
import { addressLine, groupDeliveries, isCashOrder, riderNextSteps, type RiderStep } from "@/components/admin/riders-helpers";
import { riderApi } from "@/components/rider/api";
import { flushOutbox, newOutboxId, useOutbox } from "@/components/rider/outbox";
import { applyOutbox, directionsUrl, newlyAssigned } from "@/components/rider/outbox-helpers";
import { PushToggle } from "@/components/admin/push-enable";
import { InstallAppCard } from "@/components/install-app";
import { useRiderStore } from "@/components/rider/store";
import { Badge, Button, Card, CardBody, Dialog, EmptyState, ErrorState, Field, Input, Loading, MoneyInput, Stat, ThemeToggle } from "@/components/ui";
import { toast } from "@/store/toast";

const POLL_MS = 30_000;
type Pending = { d: Delivery; step: RiderStep; cash: number; reason: string };
type Row = Delivery & { queued: number };

function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("online", cb); window.addEventListener("offline", cb); return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); }; },
    () => navigator.onLine,
    () => true,
  );
}

/** Geolocation permission as the browser reports it, so the app can ask at a sensible moment instead of mid-tap. */
function useLocationPermission(): [PermissionState | "unsupported" | null, () => void] {
  const [state, setState] = useState<PermissionState | "unsupported" | null>(null);
  useEffect(() => {
    if (!navigator.geolocation) { setState("unsupported"); return; }
    let status: PermissionStatus | null = null;
    navigator.permissions?.query({ name: "geolocation" as PermissionName }).then((p) => { status = p; setState(p.state); p.onchange = () => setState(p.state); }).catch(() => setState("unsupported"));
    return () => { if (status) status.onchange = null; };
  }, []);
  const ask = () => navigator.geolocation?.getCurrentPosition(() => setState("granted"), (e) => { if (e.code === 1) setState("denied"); }, { timeout: 10000 });
  return [state, ask];
}

/** A short double beep and a buzz for a new assignment. Browsers allow sound once the rider has tapped the page. */
function alertNewDelivery() {
  try { navigator.vibrate?.([250, 120, 250]); } catch {}
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.25].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.15);
    });
    setTimeout(() => { void ctx.close(); }, 800);
  } catch {}
}

export default function RiderHomePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const session = useRiderStore((s) => s.session);
  const signOut = useRiderStore((s) => s.signOut);
  const cache = useRiderStore((s) => s.cache);
  const setCache = useRiderStore((s) => s.setCache);
  const items = useOutbox((s) => s.items);
  const online = useOnline();
  const [geo, askLocation] = useLocationPermission();
  const [showAll, setShowAll] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const membershipId = session?.membership?.id ?? null;
  const queued = useMemo(() => items.filter((i) => i.membershipId === membershipId), [items, membershipId]);

  const deliveries = useQuery({
    queryKey: ["rider_deliveries", showAll], enabled: !!session, refetchInterval: POLL_MS,
    queryFn: async () => { const r = await riderApi<RiderDeliveries>("/rider/deliveries", { query: { all: showAll ? "true" : undefined } }); if (!showAll) setCache({ deliveries: r }); return r; },
    initialData: !showAll && cache?.deliveries ? cache.deliveries : undefined, initialDataUpdatedAt: cache?.at,
  });
  const float = useQuery({
    queryKey: ["rider_float"], enabled: !!session, refetchInterval: POLL_MS,
    queryFn: async () => { const r = await riderApi<RiderFloat>("/rider/float"); setCache({ float: r }); return r; },
    initialData: cache?.float ?? undefined, initialDataUpdatedAt: cache?.at,
  });
  useEffect(() => { if (!session) router.replace("/rider/pin"); }, [session, router]);

  const refresh = useCallback(() => { qc.invalidateQueries({ queryKey: ["rider_deliveries"] }); qc.invalidateQueries({ queryKey: ["rider_float"] }); }, [qc]);
  const flush = useCallback(async () => {
    const r = await flushOutbox();
    for (const s of r.sent) toast.success(`${s.orderLabel}: ${DELIVERY_LABELS[s.to]}`, s.attempts ? "Sent now that you have signal." : undefined);
    for (const d of r.dropped) {
      if (d.status === 409) toast.info(`${d.item.orderLabel} was already updated`, "The shop or an earlier tap changed it first.");
      else toast.error(`${d.item.orderLabel}: not saved`, d.message);
    }
    if (r.sent.length || r.dropped.length) refresh();
    return r;
  }, [refresh]);
  // Send anything waiting when the app opens, when signal comes back, when the rider returns to it, and every 15 seconds.
  useEffect(() => {
    if (!session) return;
    void flush();
    const onOnline = () => { void flush(); refresh(); };
    const onVisible = () => { if (document.visibilityState === "visible") { void flush(); refresh(); } };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const t = window.setInterval(() => { if (useOutbox.getState().items.length) void flush(); }, 15_000);
    return () => { window.removeEventListener("online", onOnline); document.removeEventListener("visibilitychange", onVisible); window.clearInterval(t); };
  }, [session, flush, refresh]);

  // A new assignment while the app is open: buzz, beep and say which order.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const data = deliveries.data?.data;
    if (!data || showAll) return;
    const fresh = newlyAssigned(seen.current, data);
    if (fresh.length) { alertNewDelivery(); toast.success("New delivery assigned", data.filter((d) => fresh.includes(d.id)).map((d) => d.order_label).join(", ")); }
    seen.current = new Set(data.filter((d) => !["delivered", "failed"].includes(d.status)).map((d) => d.id));
  }, [deliveries.data, showAll]);

  const rider = deliveries.data?.rider;
  const perms = rider?.permissions ?? [];
  const temp = !!rider?.temporary;
  const canFail = !temp || perms.includes("mark_failed");
  const canCollect = !temp || perms.includes("collect_cash");
  const seePhone = !temp || perms.includes("see_phone");
  const rows: Row[] = applyOutbox(deliveries.data?.data ?? [], queued);
  const groups = groupDeliveries(rows);
  const openCount = rows.filter((d) => !["delivered", "failed"].includes(d.status)).length;
  const start = (d: Delivery, step: RiderStep) => {
    const needsInput = (step.asksCash && canCollect) || step.asksReason;
    if (!needsInput) return send(d, step, {});
    setPending({ d, step, cash: d.cash_collected_minor ?? d.order_total_minor, reason: "" });
  };
  // Every tap is saved on the phone first, then sent; with no signal it waits and goes later with the time of the tap.
  const send = async (d: Delivery, step: RiderStep, extra: { cash_collected_minor?: number; note?: string }) => {
    setBusy(true);
    try {
      const pos = await position();
      useOutbox.getState().add({ id: newOutboxId(), deliveryId: d.id, orderLabel: d.order_label, to: step.to, occurredAt: new Date().toISOString(), note: extra.note, cashCollectedMinor: extra.cash_collected_minor, lat: pos.lat, lng: pos.lng, membershipId, attempts: 0 });
      setPending(null);
      const r = await flush();
      if (r.waiting) toast.info("Saved on this phone", "It will be sent as soon as you have signal.");
    } finally { setBusy(false); }
  };
  const lastSync = deliveries.dataUpdatedAt ? new Date(deliveries.dataUpdatedAt) : null;
  return (
    <main className="flex min-h-screen flex-col pb-8">
      <header className="sticky top-0 z-10 bg-navy text-white [--heading-color:#fff]">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cta text-cta-fg"><Bike className="h-5 w-5" /></span>
            <div className="min-w-0">
              <div className="truncate font-medium">{rider?.name ?? session?.user?.name ?? "Rider"}</div>
              <div className="truncate text-xs text-white/70">{openCount} open · {lastSync ? `updated ${formatAgo(lastSync)}` : "loading"}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-11 w-11 text-white/85 hover:bg-white/10" aria-label="Refresh" onClick={() => { refresh(); void flush(); }}><RefreshCw className={`h-5 w-5 ${deliveries.isFetching ? "animate-spin" : ""}`} /></Button>
            <ThemeToggle className="text-white/85 hover:bg-white/10" />
            <Button variant="ghost" size="icon" className="h-11 w-11 text-white/85 hover:bg-white/10" aria-label="Sign out" onClick={() => { signOut(); router.replace("/rider/pin"); }}><LogOut className="h-5 w-5" /></Button>
          </div>
        </div>
        {!online || queued.length ? (
          <div role="status" className="flex items-center gap-2 bg-warning px-4 py-2 text-sm font-medium text-warning-fg">
            <CloudOff className="h-4 w-4 shrink-0" />
            <span>{!online ? "No signal." : "Sending."} {queued.length ? `${queued.length} update${queued.length === 1 ? "" : "s"} waiting; they send by themselves.` : "Your taps are saved on this phone."}</span>
          </div>
        ) : null}
      </header>

      <div className="space-y-4 px-4 pt-4">
        <InstallAppCard appName="the rider app" text="Opens full screen from your home screen, stays signed in and works with weak signal." />
        {geo === "prompt" ? (
          <Card><CardBody className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-start gap-3"><LocateFixed className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><div className="font-medium">Share your location</div><div className="text-sm text-fg-secondary">The shop sees where each delivery was picked up and delivered.</div></div></div>
            <Button onClick={askLocation}>Allow</Button>
          </CardBody></Card>
        ) : geo === "denied" ? (
          <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-ink">Location is off for this app. Turn it on in the phone&apos;s settings, Apps, Chrome, Permissions, Location, so the shop sees where deliveries are made.</p>
        ) : null}
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
          <Button variant="ghost" size="sm" className="h-11" onClick={() => setShowAll((v) => !v)}>{showAll ? "Open only" : "Show finished"}</Button>
        </div>
        {deliveries.isError && !deliveries.data ? <ErrorState message={errorMessage(deliveries.error)} onRetry={() => deliveries.refetch()} /> : deliveries.isLoading && !deliveries.data ? <Loading /> : !groups.length ? (
          <EmptyState icon={PackageCheck} title="Nothing assigned" hint="New deliveries appear here as the dispatcher assigns them. This page refreshes every 30 seconds." />
        ) : groups.map((g) => (
          <section key={g.status} className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-fg-secondary"><Badge variant={deliveryStatusVariant(g.status)}>{DELIVERY_LABELS[g.status]}</Badge><span>{g.rows.length}</span></div>
            {g.rows.map((d) => <DeliveryCard key={d.id} d={d} canFail={canFail} canCollect={canCollect} seePhone={seePhone} busy={busy} onStep={(s) => start(d, s)} />)}
          </section>
        ))}
        {deliveries.isError && deliveries.data ? <p className="text-center text-xs text-fg-muted">Showing the list from {lastSync ? formatTime(lastSync.toISOString()) : "earlier"}. It refreshes when the connection is back.</p> : null}
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

function DeliveryCard({ d, canFail, canCollect, seePhone, busy, onStep }: { d: Row; canFail: boolean; canCollect: boolean; seePhone: boolean; busy: boolean; onStep: (s: RiderStep) => void }) {
  const cash = isCashOrder(d);
  const steps = riderNextSteps(d.status, { canFail, cashOrder: cash && canCollect });
  const address = addressLine(d.address);
  const phone = d.customer?.phone;
  const directions = directionsUrl(d.address, address);
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
        {d.queued ? <Badge variant="warning" className="gap-1"><CloudOff className="h-3.5 w-3.5" /> Saved, waiting for signal</Badge> : null}
        {address ? <div className="flex items-start gap-2 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" /><span>{address}</span></div> : null}
        {d.items?.length ? <div className="text-xs text-fg-secondary">{d.items.map((i) => `${i.quantity} x ${i.name}`).join(", ")}</div> : null}
        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          {d.assigned_at ? <span>Assigned {formatTime(d.assigned_at)}</span> : null}
          {d.picked_up_at ? <span>· Picked up {formatTime(d.picked_up_at)}</span> : null}
          {d.delivered_at ? <span>· Delivered {formatTime(d.delivered_at)}</span> : null}
          {d.failed_reason ? <span className="text-danger">· {d.failed_reason}</span> : null}
          {d.status === "delivered" && d.cash_collected_minor != null ? <span>· Collected {formatMoney(d.cash_collected_minor)}</span> : null}
        </div>
        {(directions && !["delivered", "failed"].includes(d.status)) || (phone && seePhone) ? (
          <div className="grid grid-cols-2 gap-2">
            {directions && !["delivered", "failed"].includes(d.status) ? <a href={directions} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-full border border-border-strong text-sm font-medium text-primary"><Navigation className="h-4 w-4" /> Navigate</a> : <span />}
            {phone && seePhone ? <a href={`tel:${phone}`} className="flex h-12 items-center justify-center gap-2 rounded-full border border-border-strong text-sm font-medium text-primary"><Phone className="h-4 w-4" /> Call</a> : null}
          </div>
        ) : null}
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
