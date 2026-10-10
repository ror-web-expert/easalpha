"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, Check, Play, Volume2, VolumeX, Wifi, WifiOff } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { subscribe } from "@/lib/cable";
import type { KitchenOrder, KitchenTicket, Station } from "@/lib/types";
import { formatElapsed, formatTime } from "@/lib/dates";
import { cn, titleCase } from "@/lib/utils";
import { KitchenGate, useBeep, useKitchenToken } from "@/components/kitchen/auth";
import { Badge, Button, Select, orderTypeVariant } from "@/components/ui";
import { toast } from "@/store/toast";
import { useLocalState } from "@/lib/hooks";

function Timer({ start, elapsed }: { start: string | null; elapsed: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const base = start ? (now - new Date(start).getTime()) / 1000 : elapsed;
  const mins = base / 60;
  return <span className={cn("rounded-md px-2 py-0.5 font-mono text-lg font-bold tabular", mins >= 15 ? "bg-danger text-danger-fg" : mins >= 8 ? "bg-warning text-warning-fg" : "bg-muted")}>{formatElapsed(base)}</span>;
}

function Board() {
  const qc = useQueryClient();
  const { token } = useKitchenToken();
  const [station, setStation] = useLocalState<string>("servio.kds.station", "");
  const [sound, setSound] = useLocalState<boolean>("servio.kds.sound", true);
  const [live, setLive] = useState(false);
  const beep = useBeep();
  const seen = useRef<Set<string> | null>(null);
  const stations = useQuery({ queryKey: ["stations"], queryFn: () => api<{ data: Station[] }>("/stations"), select: (r) => r.data });
  const orders = useQuery({ queryKey: ["kitchen_orders", station], queryFn: () => api<{ data: KitchenOrder[]; server_time: string }>("/kitchen/orders", { query: { station_id: station || undefined } }), refetchInterval: live ? 30_000 : 10_000 });
  const tickets = useQuery({ queryKey: ["kitchen_tickets", station], queryFn: () => api<{ data: KitchenTicket[] }>("/kitchen/tickets", { query: { station_id: station || undefined, limit: 20 } }), refetchInterval: 15_000, select: (r) => r.data.filter((t) => t.kind !== "new" && Date.now() - new Date(t.created_at).getTime() < 30 * 60_000) });
  const refresh = useCallback(() => { qc.invalidateQueries({ queryKey: ["kitchen_orders"] }); qc.invalidateQueries({ queryKey: ["kitchen_tickets"] }); }, [qc]);
  useEffect(() => {
    if (!token) return;
    const sub = subscribe("KitchenChannel", token, () => refresh(), (s) => setLive(s === "open"));
    return () => sub.close();
  }, [token, refresh]);
  useEffect(() => {
    const list = orders.data?.data ?? [];
    if (!seen.current) { seen.current = new Set(list.map((o) => o.id)); return; }
    const fresh = list.filter((o) => !seen.current!.has(o.id));
    if (fresh.length && sound) beep([880, 1100, 1320]);
    list.forEach((o) => seen.current!.add(o.id));
  }, [orders.data, sound, beep]);

  const act = async (path: string) => {
    try { await api(path, { method: "POST" }); refresh(); } catch (e) { toast.error("Could not update", errorMessage(e)); }
  };
  const list = useMemo(() => [...(orders.data?.data ?? [])].sort((a, b) => (a.placed_at ?? a.created_at) < (b.placed_at ?? b.created_at) ? -1 : 1), [orders.data]);
  const changed = tickets.data ?? [];
  return (
    <div className="flex h-screen flex-col bg-page text-fg">
      <header className="flex h-14 items-center gap-3 border-b bg-card px-3">
        <ChefHat className="h-6 w-6 text-primary" />
        <span className="text-lg font-semibold">Kitchen</span>
        <Select className="h-11 w-48 text-base" value={station} onChange={(e) => setStation(e.target.value)} aria-label="Station"><option value="">All stations</option>{stations.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <span className="text-sm text-fg-secondary">{list.length} orders</span>
        <div className="flex-1" />
        <span className={cn("flex items-center gap-1 text-sm", live ? "text-success" : "text-fg-muted")}>{live ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}{live ? "Live" : "Polling"}</span>
        <Button variant="ghost" size="icon" onClick={() => setSound(!sound)} aria-label="Sound">{sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</Button>
      </header>
      {changed.length ? (
        <div className="flex gap-2 overflow-x-auto border-b bg-warning-soft px-3 py-2">
          {changed.map((t) => <div key={t.id} className={cn("shrink-0 rounded-md border px-3 py-1 text-sm", t.kind === "cancelled" ? "border-danger bg-danger-soft" : "border-warning")}><b className="uppercase">{t.kind}</b> #{t.serial ?? "?"}{t.table_code ? ` · ${t.table_code}` : ""}: {(t.lines ?? []).map((l) => `${(l as { quantity?: string }).quantity ?? ""} ${(l as { name?: string }).name ?? ""}`).join(", ")} <span className="text-fg-muted">{formatTime(t.created_at)}</span></div>)}
        </div>
      ) : null}
      <div className="grid flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto p-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {list.map((o) => (
          <article key={o.id} className={cn("flex flex-col rounded-lg border-2 bg-card shadow-sm", o.status === "preparing" ? "border-info" : o.status === "ready" ? "border-success" : "border-border")}>
            <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <div className="flex items-center gap-2"><span className="text-2xl font-bold">{o.label}</span><Badge variant={orderTypeVariant(o.order_type)}>{titleCase(o.order_type)}</Badge>{o.table_code ? <Badge>Table {o.table_code}</Badge> : null}</div>
              <Timer start={o.placed_at} elapsed={o.elapsed_seconds} />
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
        {!list.length ? <div className="col-span-full py-24 text-center text-xl text-fg-muted">{orders.isLoading ? "Loading…" : orders.error ? errorMessage(orders.error) : "No orders in the kitchen"}</div> : null}
      </div>
    </div>
  );
}

export default function KitchenPage() {
  return <KitchenGate title="Kitchen display"><Board /></KitchenGate>;
}
