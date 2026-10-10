"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, Check, X, Bell, ReceiptText, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { acceptQrOrder, handleRequest, rejectQrOrder } from "@/lib/till-extras";
import { storeServerOrder } from "@/lib/pos-actions";
import type { QrOrder, TableRequest } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatAgo, formatTime } from "@/lib/dates";
import { useCatalogStore } from "@/store/catalog";
import { toast } from "@/store/toast";
import { PosShell } from "@/components/pos/shell";
import { refreshLive, useLiveStore } from "@/components/pos/live";
import { ReasonDialog } from "@/components/pos/dialogs";
import { Badge, Button, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";

const REJECT_REASONS = ["Kitchen closed", "Item unavailable", "Table not seated", "Duplicate", "Suspicious order"];

export default function QrOrdersPage() {
  const router = useRouter();
  const currency = useCatalogStore((s) => s.catalog?.business.currency);
  const { pending, requests, available, live, loading, lastAt } = useLiveStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<QrOrder | null>(null);

  const accept = async (o: QrOrder) => {
    setBusy(o.id);
    try {
      const order = await acceptQrOrder(o.id);
      await storeServerOrder(order);
      toast.success(`${order.label} accepted`, o.table_code ? `Table ${o.table_code} · sent to the kitchen` : "Sent to the kitchen");
      refreshLive();
    } catch (e) { toast.error("Could not accept", errorMessage(e)); refreshLive(); }
    finally { setBusy(null); }
  };
  const reject = async (reason: string) => {
    if (!rejecting) return;
    setBusy(rejecting.id);
    try {
      const order = await rejectQrOrder(rejecting.id, reason);
      await storeServerOrder(order);
      toast.success("Order rejected", reason);
      setRejecting(null);
      refreshLive();
    } catch (e) { toast.error("Could not reject", errorMessage(e)); refreshLive(); }
    finally { setBusy(null); }
  };
  const handle = async (r: TableRequest) => {
    setBusy(r.id);
    try { await handleRequest(r.id); toast.success(r.kind === "ask_bill" ? `Bill for table ${r.table_code} handled` : `Table ${r.table_code} attended`); refreshLive(); }
    catch (e) { toast.error("Could not update", errorMessage(e)); }
    finally { setBusy(null); }
  };

  return (
    <PosShell title={<span className="flex items-center gap-2">QR orders {live ? <Wifi className="h-4 w-4 text-success" /> : <WifiOff className="h-4 w-4 text-fg-muted" />}{lastAt ? <span className="hidden text-xs text-fg-muted md:inline">updated {formatTime(lastAt)}</span> : null}</span>}>
      <div className="flex h-full flex-col">
        {requests.length ? (
          <div className="flex gap-2 overflow-x-auto border-b bg-warning-soft/60 p-2">
            {requests.map((r) => (
              <div key={r.id} className="flex min-w-64 shrink-0 items-center gap-3 rounded-lg border bg-card p-2 shadow-sm">
                <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-lg", r.kind === "ask_bill" ? "bg-primary-soft" : "bg-accent-soft")}>{r.kind === "ask_bill" ? <ReceiptText className="h-5 w-5" /> : <Bell className="h-5 w-5" />}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">Table {r.table_code} · {r.kind === "ask_bill" ? "Bill" : "Waiter"}</div>
                  <div className="truncate text-xs text-fg-secondary">{r.guest_name || "Guest"} · {formatAgo(r.requested_at)}{r.note ? ` · ${r.note}` : ""}</div>
                </div>
                <Button size="lg" variant="secondary" onClick={() => handle(r)} loading={busy === r.id}><Check className="h-4 w-4" /> Handle</Button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-2 border-b bg-card p-2">
          <div className="text-sm text-fg-secondary">{available ? `${pending.length} waiting for acceptance · refreshes every 10 s` : "This login cannot see QR orders."}</div>
          <div className="flex-1" />
          <Button variant="secondary" size="lg" onClick={() => refreshLive()} loading={loading}><RefreshCw className="h-4 w-4" /> Refresh</Button>
        </div>
        <div className="grid flex-1 grid-cols-1 gap-2 overflow-y-auto p-2 sm:grid-cols-2 xl:grid-cols-3">
          {pending.map((o) => (
            <div key={o.id} className="flex min-h-40 flex-col rounded-lg border bg-card p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-2xl font-bold">{o.table_code ? `Table ${o.table_code}` : o.label}</div>
                  <div className="text-sm text-fg-secondary">{o.guest_name || "Guest"} · {o.item_count} items · {formatAgo(o.created_at)}</div>
                </div>
                <Badge variant="warning">Pending</Badge>
              </div>
              <div className="mt-2 text-sm text-fg-secondary">{o.notes ? <span className="italic">“{o.notes}”</span> : null}</div>
              <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                <span className="text-xl font-semibold tabular">{formatMoney(o.total_minor, currency)}</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="lg" onClick={() => router.push(`/pos?order=${o.id}`)}>View</Button>
                  <Button variant="destructive" size="lg" onClick={() => setRejecting(o)} disabled={busy === o.id}><X className="h-5 w-5" /> Reject</Button>
                  <Button size="lg" onClick={() => accept(o)} loading={busy === o.id}><Check className="h-5 w-5" /> Accept</Button>
                </div>
              </div>
            </div>
          ))}
          {!pending.length ? <EmptyState icon={QrCode} title="No QR orders waiting" hint="Guests who order from a table card show here when the branch asks the cashier to accept first. Waiter calls and bill requests appear in the strip above." className="col-span-full m-4" /> : null}
        </div>
      </div>
      <ReasonDialog open={!!rejecting} onClose={() => setRejecting(null)} onConfirm={reject} title={rejecting ? `Reject ${rejecting.table_code ? `table ${rejecting.table_code}` : rejecting.label}` : "Reject"} description="The guest sees the reason. Items already sent to the kitchen stay on the bill." confirmLabel="Reject order" loading={!!busy} presets={REJECT_REASONS} />
    </PosShell>
  );
}
