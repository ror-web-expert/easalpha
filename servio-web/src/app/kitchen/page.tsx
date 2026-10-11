"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, Check, Play, Volume2, VolumeX, Wifi, WifiOff } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { subscribe } from "@/lib/cable";
import type { BusinessSettings, KitchenOrder, KitchenTicket, Station } from "@/lib/types";
import { formatElapsed, formatTime } from "@/lib/dates";
import { cn, titleCase } from "@/lib/utils";
import { kdsAlerts, kdsTone } from "@/lib/pos-rules";
import { KitchenGate, useBeep, useKitchenToken } from "@/components/kitchen/auth";
import { useCatalogStore } from "@/store/catalog";
import { useDeviceStore } from "@/store/device";
import { useAuthStore } from "@/store/auth";
import { Badge, Button, Select, orderTypeVariant } from "@/components/ui";
import { toast } from "@/store/toast";
import { useLocalState } from "@/lib/hooks";
import { PushToggle } from "@/components/admin/push-enable";

/**
 * SPEC "KDS Alerts": the three store-wide settings (new-order sound, timeout minutes, red sound) sync to the KDS on the
 * next login or refresh, not live. They are read from the settings this screen already holds at login: the catalog a
 * paired till downloaded, the paired device's business record, or the manager's admin session. A single GET /me when the
 * page loads (a refresh) picks up changes made since; the websocket does not push them.
 */
function useKdsSettings(): BusinessSettings | null {
  const { token } = useKitchenToken();
  const catalogSettings = useCatalogStore((s) => s.catalog?.business.settings);
  const deviceSettings = useDeviceStore((s) => s.business?.settings);
  const adminSettings = useAuthStore((s) => s.session?.business?.settings);
  const [fresh, setFresh] = useState<BusinessSettings | null>(null);
  useEffect(() => {
    if (!token) return;
    api<{ business?: { settings?: BusinessSettings } }>("/me").then((r) => { if (r.business?.settings) setFresh(r.business.settings); }).catch(() => {});
  }, [token]);
  return fresh ?? catalogSettings ?? deviceSettings ?? adminSettings ?? null;
}

const startedAt = (o: KitchenOrder, now: number) => (o.placed_at ? new Date(o.placed_at).getTime() : now - o.elapsed_seconds * 1000);

/** Timer tone: red once the store timeout passes, amber from half of it, neutral when no timeout is set. */
function Timer({ start, elapsed, timeout }: { start: string | null; elapsed: number; timeout: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const base = start ? (now - new Date(start).getTime()) / 1000 : elapsed;
  const tone = kdsTone(base / 60, timeout);
  return <span className={cn("rounded-md px-2 py-0.5 font-mono text-lg font-bold tabular", tone === "red" ? "bg-danger text-danger-fg" : tone === "warning" ? "bg-warning text-warning-fg" : "bg-muted")}>{formatElapsed(base)}</span>;
}

function Board() {
  const qc = useQueryClient();
  const { token } = useKitchenToken();
  const settings = useKdsSettings();
  const alerts = kdsAlerts(settings);
  const [station, setStation] = useLocalState<string>("servio.kds.station", "");
  // The per-device toggle only mutes a sound the store has switched on; it cannot turn one on that the store keeps off.
  const [deviceSound, setDeviceSound] = useLocalState<boolean>("servio.kds.sound", true);
  const soundOn = alerts.newOrderSound && deviceSound;
  const [live, setLive] = useState(false);
  const beep = useBeep();
  const seen = useRef<Set<string> | null>(null);
  const turnedRed = useRef<Set<string>>(new Set());
  const redPrimed = useRef(false);
  const stations = useQuery({ queryKey: ["stations"], queryFn: () => api<{ data: Station[] }>("/stations"), select: (r) => r.data });
  const orders = useQuery({ queryKey: ["kitchen_orders", station], queryFn: () => api<{ data: KitchenOrder[]; server_time: string }>("/kitchen/orders", { query: { station_id: station || undefined } }), refetchInterval: live ? 30_000 : 10_000 });
  const tickets = useQuery({ queryKey: ["kitchen_tickets", station], queryFn: () => api<{ data: KitchenTicket[] }>("/kitchen/tickets", { query: { station_id: station || undefined, limit: 20 } }), refetchInterval: 15_000, select: (r) => r.data.filter((t) => t.kind !== "new" && Date.now() - new Date(t.created_at).getTime() < 30 * 60_000) });
  const refresh = useCallback(() => { qc.invalidateQueries({ queryKey: ["kitchen_orders"] }); qc.invalidateQueries({ queryKey: ["kitchen_tickets"] }); }, [qc]);
  useEffect(() => {
    if (!token) return;
    const sub = subscribe("KitchenChannel", token, () => refresh(), (s) => setLive(s === "open"));
    return () => sub.close();
  }, [token, refresh]);
  // SPEC: a sound when a new order arrives, only while this page is open (the first load is silent).
  useEffect(() => {
    const list = orders.data?.data ?? [];
    if (!seen.current) { seen.current = new Set(list.map((o) => o.id)); return; }
    const fresh = list.filter((o) => !seen.current!.has(o.id));
    if (fresh.length && soundOn) beep([880, 1100, 1320]);
    list.forEach((o) => seen.current!.add(o.id));
  }, [orders.data, soundOn, beep]);

  const act = async (path: string) => {
    try { await api(path, { method: "POST" }); refresh(); } catch (e) { toast.error("Could not update", errorMessage(e)); }
  };
  const list = useMemo(() => [...(orders.data?.data ?? [])].sort((a, b) => (a.placed_at ?? a.created_at) < (b.placed_at ?? b.created_at) ? -1 : 1), [orders.data]);
  // SPEC: a one-shot sound the first time a card turns red. Cards already red when the page opens do not sound.
  useEffect(() => {
    const timeout = alerts.timeoutMinutes;
    if (timeout === null) return;
    const check = () => {
      const now = Date.now();
      let fresh = 0;
      for (const o of list) {
        if ((now - startedAt(o, now)) / 60_000 < timeout || turnedRed.current.has(o.id)) continue;
        turnedRed.current.add(o.id);
        fresh++;
      }
      if (fresh && redPrimed.current && alerts.redSound) beep([440, 330, 440]);
      redPrimed.current = true;
    };
    check();
    const t = setInterval(check, 5_000);
    return () => clearInterval(t);
  }, [list, alerts.timeoutMinutes, alerts.redSound, beep]);
  const changed = tickets.data ?? [];
  return (
    <div className="flex h-screen flex-col bg-navy-deep text-white [--heading-color:#fff]">
      <header className="flex h-14 items-center gap-3 border-b border-white/10 bg-navy px-3 [--heading-color:#fff]">
        <ChefHat className="h-6 w-6 text-cta" />
        <span className="text-lg font-semibold">Kitchen</span>
        <Select className="h-11 w-48 border-white/30 text-base text-white hover:border-white [&>option]:bg-card [&>option]:text-fg" value={station} onChange={(e) => setStation(e.target.value)} aria-label="Station"><option value="">All stations</option>{stations.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <span className="text-sm text-white/70">{list.length} orders{alerts.timeoutMinutes ? ` · red after ${alerts.timeoutMinutes} min` : ""}</span>
        <div className="flex-1" />
        <span className={cn("flex items-center gap-1 text-sm", live ? "text-white" : "text-white/60")}>{live ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}{live ? "Live" : "Polling"}</span>
        <PushToggle app="kitchen" label="Push" className="hidden md:inline-flex" />
        {alerts.newOrderSound
          ? <Button variant="ghost" size="icon" className="text-white/85 hover:bg-white/10" onClick={() => setDeviceSound(!deviceSound)} aria-label="Sound" title={deviceSound ? "Mute new-order sound on this screen" : "Unmute new-order sound on this screen"}>{deviceSound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</Button>
          : <Button variant="ghost" size="icon" className="text-white/85" disabled aria-label="Sound off" title="New-order sound is off in Settings, Point of Sale, KDS Alerts"><VolumeX className="h-5 w-5" /></Button>}
      </header>
      {changed.length ? (
        <div className="flex gap-2 overflow-x-auto border-b border-white/10 bg-warning-soft px-3 py-2 text-warning-ink">
          {changed.map((t) => <div key={t.id} className={cn("shrink-0 rounded-md border px-3 py-1 text-sm", t.kind === "cancelled" ? "border-danger bg-danger-soft" : "border-warning")}><b className="uppercase">{t.kind}</b> #{t.serial ?? "?"}{t.table_code ? ` · ${t.table_code}` : ""}: {(t.lines ?? []).map((l) => `${(l as { quantity?: string }).quantity ?? ""} ${(l as { name?: string }).name ?? ""}`).join(", ")} <span className="text-fg-muted">{formatTime(t.created_at)}</span></div>)}
        </div>
      ) : null}
      <div className="grid flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {list.map((o) => (
          <article key={o.id} className={cn("flex flex-col rounded-lg border-2 bg-card text-fg shadow-sm", o.status === "preparing" ? "border-info" : o.status === "ready" ? "border-success" : "border-cta")}>
            <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <div className="flex items-center gap-2"><span className="text-2xl font-bold">{o.label}</span><Badge variant={orderTypeVariant(o.order_type)}>{titleCase(o.order_type)}</Badge>{o.table_code ? <Badge>Table {o.table_code}</Badge> : null}</div>
              <Timer start={o.placed_at} elapsed={o.elapsed_seconds} timeout={alerts.timeoutMinutes} />
            </header>
            <ul className="flex-1 divide-y px-3">
              {o.items.map((i) => (
                <li key={i.id} className={cn("flex items-start justify-between gap-2 py-2", i.status === "ready" && "opacity-50")}>
                  <div>
                    <div className="text-lg font-semibold leading-tight"><span className="tabular">{Number(i.quantity)} ×</span> {i.name}</div>
                    {i.modifiers?.length ? <div className="text-base text-fg-secondary">{i.modifiers.map((m) => m.name).join(", ")}</div> : null}
                    {i.notes ? <div className="text-base font-medium text-warning">“{i.notes}”</div> : null}
                  </div>
                  {i.status !== "ready" ? <button onClick={() => act(`/kitchen/items/${i.id}/bump`)} className="grid h-12 w-12 shrink-0 place-items-center rounded-md border hover:bg-success-soft" aria-label="Bump item"><Check className="h-5 w-5" /></button> : <Check className="h-5 w-5 text-success" />}
                </li>
              ))}
            </ul>
            {o.notes ? <div className="px-3 pb-2 text-sm italic text-fg-secondary">{o.notes}</div> : null}
            <footer className="grid grid-cols-[auto_1fr] gap-2 p-2">
              {o.status === "placed" ? <Button variant="secondary" size="lg" onClick={() => act(`/kitchen/orders/${o.id}/start`)}><Play className="h-5 w-5" /> Start</Button> : <span />}
              <Button size="lg" className="h-14 w-full text-lg" onClick={() => act(`/kitchen/orders/${o.id}/bump`)}><Check className="h-6 w-6" /> Bump order</Button>
            </footer>
          </article>
        ))}
        {!list.length ? <div className="col-span-full py-24 text-center text-xl text-white/60">{orders.isLoading ? "Loading…" : orders.error ? errorMessage(orders.error) : "No orders in the kitchen"}</div> : null}
      </div>
    </div>
  );
}

export default function KitchenPage() {
  return <KitchenGate title="Kitchen display"><Board /></KitchenGate>;
}
