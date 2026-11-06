"use client";
import { Wifi, WifiOff, RefreshCw, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useSyncStore } from "@/store/sync";
import { cn } from "@/lib/utils";
import { processQueue } from "@/lib/sync";

export function SyncBadge({ className }: { className?: string }) {
  const { status, pending, attention, lastError } = useSyncStore();
  // A push the server refused for a reason other than the network (a revoked till, a 403) is not "Online" in green:
  // the badge names the problem and points at the Attention page, where the records sit.
  const problem = status === "online" && !!lastError;
  const Icon = status === "offline" ? WifiOff : status === "syncing" ? RefreshCw : problem ? AlertTriangle : Wifi;
  const tone = problem ? "bg-danger-soft text-danger-ink" : status === "online" ? "bg-success-soft text-success-ink" : status === "offline" ? "bg-warning-soft text-warning-ink" : "bg-info-soft text-info-ink";
  const iconTone = problem ? "text-danger" : status === "online" ? "text-success" : status === "offline" ? "text-warning" : "text-info animate-spin";
  const label = problem ? "Sync problem" : status === "online" ? "Online" : status === "offline" ? "Offline" : "Syncing";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        onClick={() => processQueue()}
        className={cn("flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium", tone)}
        title={problem ? `${lastError}. Tap to try again.` : "Tap to sync now"}
      >
        <Icon className={cn("h-4 w-4", iconTone)} />
        <span className="hidden xl:inline">{label}</span>
        {pending ? <span className="rounded-full bg-card px-1.5 text-xs tabular">{pending}</span> : null}
      </button>
      {attention || problem ? (
        <Link href="/pos/attention" title={problem ? lastError ?? undefined : undefined} className="flex h-10 items-center gap-1 rounded-full bg-danger-soft px-3 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-danger" /> {attention || "Details"}</Link>
      ) : null}
    </div>
  );
}
