"use client";
// The canteen counter: tokens waiting, oldest first; a tap (or the token typed with Enter) hands the meal over.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Utensils, Wifi, WifiOff } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useOnline } from "@/lib/hooks";
import { formatAgo } from "@/lib/dates";
import type { MealClaim } from "@/lib/types";
import { useDeviceStore } from "@/store/device";
import { useBeep } from "@/components/kitchen/auth";
import { Input } from "@/components/ui";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";
import { parseWedge } from "./helpers";

export function CanteenCounter() {
  const online = useOnline();
  const qc = useQueryClient();
  const beep = useBeep();
  const business = useDeviceStore((s) => s.business);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const waiting = useQuery({ queryKey: ["canteen_waiting"], queryFn: () => api<{ data: MealClaim[] }>("/canteen/claims", { auth: "pos", query: { status: "claimed", limit: 500 }, timeoutMs: 8000 }), refetchInterval: 3000, retry: false,
    select: (r) => [...r.data].sort((a, b) => a.scanned_at.localeCompare(b.scanned_at)) });
  const served = useQuery({ queryKey: ["canteen_served"], queryFn: () => api<{ data: MealClaim[] }>("/canteen/claims", { auth: "pos", query: { status: "served", limit: 30 }, timeoutMs: 8000 }), refetchInterval: 10_000, retry: false, select: (r) => r.data });

  const serve = async (c: MealClaim) => {
    if (busy) return;
    setBusy(c.id);
    try {
      await api(`/canteen/claims/${c.id}/serve`, { method: "POST", auth: "pos", timeoutMs: 8000 });
      beep([880, 1320]);
      qc.setQueryData<{ data: MealClaim[] }>(["canteen_waiting"], (old) => (old ? { data: old.data.filter((x) => x.id !== c.id) } : old));
      void qc.invalidateQueries({ queryKey: ["canteen_served"] });
      setQ("");
    } catch (e) {
      toast.error("Could not mark it served", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  // A token typed (or scanned from the slip) and Enter serves it.
  useEffect(() => {
    let buf = "";
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.tagName === "INPUT") return;
      if (e.key === "Enter") { const id = parseWedge(buf); buf = ""; const hit = id && waiting.data?.find((c) => c.token_label.toLowerCase() === id.toLowerCase()); if (hit) void serve(hit); return; }
      if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // serve changes identity each render; the listener reads the latest list through waiting.data
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting.data]);

  const list = (waiting.data ?? []).filter((c) => !q.trim() || c.token_label.toLowerCase().includes(q.trim().toLowerCase()) || (c.employee_name ?? "").toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="flex h-screen flex-col bg-navy-deep text-white [--heading-color:#fff]">
      <header className="flex h-16 items-center gap-4 border-b border-white/10 bg-navy px-5">
        <Utensils className="h-7 w-7 text-brand-orange" />
        <div><div className="text-lg font-semibold leading-tight">{business?.name ?? "Canteen"} · counter</div><div className="text-sm text-white/70">Tap a token when the meal is handed over</div></div>
        <div className="flex-1" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Token or name" className="h-11 w-56 bg-white/10 text-white placeholder:text-white/50" />
        <div className="text-right"><div className="text-sm text-white/70">Waiting</div><div className="text-2xl font-bold tabular">{waiting.data?.length ?? 0}</div></div>
        <span className={cn("flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold", online ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200")}>{online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}{online ? "Online" : "Offline"}</span>
      </header>
      {!online ? <div className="bg-amber-500/20 px-5 py-2 text-center text-sm text-amber-100">No connection: the list may be behind and serving will wait until it returns.</div> : null}
      <main className="grid flex-1 grid-cols-1 gap-5 overflow-hidden p-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <section className={cn("grid auto-rows-min gap-4 overflow-y-auto", list.length > 8 ? "grid-cols-4" : "grid-cols-2 lg:grid-cols-3")}>
          {list.map((c) => (
            <button key={c.id} type="button" onClick={() => serve(c)} disabled={busy === c.id} data-testid="token"
              className="flex flex-col items-center justify-center rounded-2xl border-2 border-cta bg-card p-5 text-center text-fg transition hover:bg-cta/10 disabled:opacity-50">
              <div className="text-5xl font-black leading-none tabular">{c.token_label}</div>
              <div className="mt-2 text-lg font-semibold">{c.employee_name}</div>
              <div className="text-fg-secondary">{c.dish}</div>
              <div className="mt-1 text-xs text-fg-muted">{formatAgo(c.scanned_at)}{c.source === "manual" ? " · manual" : ""}</div>
            </button>
          ))}
          {!list.length ? <div className="col-span-full py-24 text-center text-3xl text-white/50">{waiting.isLoading ? "Loading" : q ? "No token matches" : "Nobody waiting"}</div> : null}
        </section>
        <aside className="overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><CheckCircle2 className="h-5 w-5 text-emerald-300" /> Served</h2>
          <div className="space-y-2">
            {(served.data ?? []).map((c) => <div key={c.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm"><span className="font-mono font-semibold">{c.token_label}</span><span className="truncate px-2 text-white/80">{c.employee_name}</span><span className="text-white/50">{c.served_at ? formatAgo(c.served_at) : ""}</span></div>)}
            {!served.data?.length ? <p className="text-sm text-white/50">Nothing served yet</p> : null}
          </div>
        </aside>
      </main>
    </div>
  );
}
