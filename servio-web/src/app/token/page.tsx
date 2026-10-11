"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Volume2, VolumeX } from "lucide-react";
import { api } from "@/lib/api";
import { subscribe } from "@/lib/cable";
import type { ReadyOrder } from "@/lib/types";
import { KitchenGate, useBeep, useKitchenToken } from "@/components/kitchen/auth";
import { Button } from "@/components/ui";
import { useLocalState } from "@/lib/hooks";
import { cn, titleCase } from "@/lib/utils";

function Screen() {
  const qc = useQueryClient();
  const { token } = useKitchenToken();
  const [sound, setSound] = useLocalState<boolean>("servio.token.sound", true);
  const beep = useBeep();
  const [flash, setFlash] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const ready = useQuery({ queryKey: ["kitchen_ready"], queryFn: () => api<{ data: ReadyOrder[] }>("/kitchen/ready"), refetchInterval: 10_000, select: (r) => r.data });
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ["kitchen_ready"] }), [qc]);
  useEffect(() => {
    if (!token) return;
    const sub = subscribe("TokensChannel", token, (m) => {
      if (m.type === "ready") { const label = (m.label as string) ?? `#${m.serial}`; setFlash(label); if (sound) beep([1320, 1320, 1760]); setTimeout(() => setFlash(null), 8000); }
      refresh();
    });
    return () => sub.close();
  }, [token, refresh, sound, beep]);
  useEffect(() => {
    const list = ready.data ?? [];
    if (!seen.current) { seen.current = new Set(list.map((o) => o.id)); return; }
    const fresh = list.filter((o) => !seen.current!.has(o.id));
    if (fresh.length) { setFlash(fresh[fresh.length - 1].label); if (sound) beep([1320, 1320, 1760]); setTimeout(() => setFlash(null), 8000); }
    list.forEach((o) => seen.current!.add(o.id));
  }, [ready.data, sound, beep]);
  const list = ready.data ?? [];
  return (
    <div className="flex h-screen flex-col bg-navy-deep text-white [--heading-color:#fff]">
      <header className="flex h-14 items-center gap-3 border-b border-white/10 bg-navy px-4 [--heading-color:#fff]">
        <Megaphone className="h-6 w-6 text-cta" /><span className="text-lg font-semibold">Ready for pickup</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="text-white/85 hover:bg-white/10" onClick={() => setSound(!sound)} aria-label="Sound">{sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</Button>
      </header>
      {flash ? <div className="animate-in bg-cta px-6 py-10 text-center text-cta-fg"><div className="text-2xl">Order</div><div className="text-[12vw] font-black leading-none tabular">{flash}</div><div className="text-3xl font-semibold">ready</div></div> : null}
      <div className={cn("grid flex-1 auto-rows-min gap-4 overflow-y-auto p-6", list.length > 6 ? "grid-cols-3 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-3")}>
        {list.map((o) => (
          <div key={o.id} className="flex flex-col items-center justify-center rounded-xl border-2 border-cta bg-card p-6 text-center text-fg">
            <div className="text-[8vw] font-black leading-none tabular lg:text-7xl">{o.label}</div>
            <div className="mt-2 text-xl text-cta-ink">{titleCase(o.order_type)} · ready</div>
          </div>
        ))}
        {!list.length && !flash ? <div className="col-span-full py-24 text-center text-3xl text-white/60">No orders waiting</div> : null}
      </div>
    </div>
  );
}

export default function TokenPage() {
  return <KitchenGate title="Token screen"><Screen /></KitchenGate>;
}
