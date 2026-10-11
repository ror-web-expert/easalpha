"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListOrdered, Volume2, VolumeX, ChefHat, BellRing } from "lucide-react";
import { api } from "@/lib/api";
import type { KitchenQueue, QueueOrder } from "@/lib/types";
import { KitchenGate, useBeep } from "@/components/kitchen/auth";
import { Button } from "@/components/ui";
import { useLocalState } from "@/lib/hooks";
import { formatTime } from "@/lib/dates";
import { cn, titleCase } from "@/lib/utils";

function Column({ title, icon: Icon, orders, tone, highlight }: { title: string; icon: React.ComponentType<{ className?: string }>; orders: QueueOrder[]; tone: "muted" | "success"; highlight?: Set<string> }) {
  const dense = orders.length > 8;
  return (
    <section className="flex min-h-0 flex-col">
      <div className={cn("flex items-center gap-3 rounded-t-xl px-5 py-3", tone === "success" ? "bg-cta text-cta-fg" : "bg-navy text-white")}>
        <Icon className="h-7 w-7" /><h2 className="text-2xl font-bold">{title}</h2><span className="ml-auto rounded-full bg-black/20 px-3 py-0.5 text-lg tabular">{orders.length}</span>
      </div>
      <div className={cn("grid flex-1 auto-rows-min gap-3 overflow-y-auto rounded-b-xl border border-t-0 border-white/15 p-4", dense ? "grid-cols-3" : "grid-cols-2")}>
        {orders.map((o) => (
          <div key={o.id} className={cn("flex flex-col items-center justify-center rounded-xl border-2 bg-card py-4 text-center text-fg", tone === "success" ? "border-cta" : "border-border", highlight?.has(o.id) && "animate-pulse ring-4 ring-cta/60")}>
            <div className={cn("font-black leading-none tabular", dense ? "text-5xl" : "text-6xl lg:text-7xl")}>{o.label}</div>
            <div className="mt-2 text-base text-fg-secondary">{o.guest_name ? o.guest_name : titleCase(o.order_type)}{tone === "success" && o.ready_at ? ` · ${formatTime(o.ready_at)}` : ""}</div>
          </div>
        ))}
        {!orders.length ? <div className="col-span-full py-16 text-center text-2xl text-white/60">{tone === "success" ? "Nothing ready yet" : "No orders in the kitchen"}</div> : null}
      </div>
    </section>
  );
}

function Screen() {
  const [sound, setSound] = useLocalState<boolean>("servio.queue.sound", true);
  const beep = useBeep();
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seenReady = useRef<Set<string> | null>(null);
  const q = useQuery({ queryKey: ["kitchen_queue"], queryFn: () => api<KitchenQueue>("/kitchen/queue"), refetchInterval: 5_000 });
  useEffect(() => {
    const ready = q.data?.ready ?? [];
    if (!seenReady.current) { seenReady.current = new Set(ready.map((o) => o.id)); return; }
    const newOnes = ready.filter((o) => !seenReady.current!.has(o.id));
    if (newOnes.length) {
      if (sound) beep([1320, 1320, 1760]);
      setFresh(new Set(newOnes.map((o) => o.id)));
      const t = setTimeout(() => setFresh(new Set()), 8000);
      ready.forEach((o) => seenReady.current!.add(o.id));
      return () => clearTimeout(t);
    }
  }, [q.data, sound, beep]);
  const clock = q.data?.at ? formatTime(q.data.at) : "";
  return (
    <div className="flex h-screen flex-col bg-navy-deep text-white [--heading-color:#fff]">
      <header className="flex h-14 items-center gap-3 border-b border-white/10 bg-navy px-4 [--heading-color:#fff]">
        <ListOrdered className="h-6 w-6 text-cta" /><span className="text-lg font-semibold">Order queue</span>
        <div className="flex-1" />
        <span className={cn("text-sm tabular text-white/70", q.isError && "text-danger")}>{q.isError ? "Reconnecting…" : clock}</span>
        <Button variant="ghost" size="icon" className="text-white/85 hover:bg-white/10" onClick={() => setSound(!sound)} aria-label="Sound">{sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</Button>
      </header>
      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-2">
        <Column title="Preparing" icon={ChefHat} orders={q.data?.preparing ?? []} tone="muted" />
        <Column title="Ready" icon={BellRing} orders={q.data?.ready ?? []} tone="success" highlight={fresh} />
      </div>
    </div>
  );
}

export default function QueuePage() {
  return <KitchenGate title="Queue screen"><Screen /></KitchenGate>;
}
