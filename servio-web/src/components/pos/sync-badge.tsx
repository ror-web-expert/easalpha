"use client";
import { Wifi, WifiOff, RefreshCw, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useSyncStore } from "@/store/sync";
import { cn } from "@/lib/utils";
import { processQueue } from "@/lib/sync";

export function SyncBadge({ className }: { className?: string }) {
  const { status, pending, attention } = useSyncStore();
  const Icon = status === "offline" ? WifiOff : status === "syncing" ? RefreshCw : Wifi;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        onClick={() => processQueue()}
        className={cn("flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium", status === "online" ? "bg-success-soft text-success-ink" : status === "offline" ? "bg-warning-soft text-warning-ink" : "bg-info-soft text-info-ink")}
        title="Tap to sync now"
      >
        <Icon className={cn("h-4 w-4", status === "online" ? "text-success" : status === "offline" ? "text-warning" : "text-info animate-spin")} />
        {status === "online" ? "Online" : status === "offline" ? "Offline" : "Syncing"}
        {pending ? <span className="rounded-full bg-card px-1.5 text-xs tabular">{pending}</span> : null}
      </button>
      {attention ? (
        <Link href="/pos/attention" className="flex h-10 items-center gap-1 rounded-full bg-danger-soft px-3 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-danger" /> {attention}</Link>
      ) : null}
    </div>
  );
}
