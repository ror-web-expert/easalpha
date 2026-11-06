"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RotateCw, Trash2, Clock, Lock, KeyRound } from "lucide-react";
import { db, type AttentionItem, type QueueItem } from "@/lib/db";
import { dismissAttention, isMoneyRecord, processQueue, retryAttention } from "@/lib/sync";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { usePosCan } from "@/store/device";
import { useCatalogStore } from "@/store/catalog";
import { useApproval } from "@/components/approval";
import { PosShell } from "@/components/pos/shell";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ConfirmDialog, EmptyState, Tabs } from "@/components/ui";
import { toast } from "@/store/toast";

/** Refusals a manager's PIN resolves: Try again sends the PIN with that one push. */
const APPROVAL_CODES = ["approval.required", "permission.denied", "approval.invalid"];

/** One line for a record held under a rejected order: "payment Rs 500 cash", "void (Wrong order)", "order update". */
function describeRecord(a: AttentionItem, currency?: string): string {
  const p = a.payload as { amount_minor?: number; method_code?: string; reason?: string };
  if (a.type === "payment") return `payment ${formatMoney(p.amount_minor ?? 0, currency)}${p.method_code ? ` ${p.method_code}` : ""}`;
  if (a.type === "customer_payment") return `account payment ${formatMoney(p.amount_minor ?? 0, currency)}`;
  if (a.type === "refund") return `refund ${formatMoney(p.amount_minor ?? 0, currency)}`;
  if (a.type === "void") return `void${p.reason ? ` (${p.reason})` : ""}`;
  return a.type.replace("_", " ");
}

export default function AttentionPage() {
  const can = usePosCan();
  const currency = useCatalogStore((s) => s.catalog?.business.currency);
  const { run, dialog } = useApproval();
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [tab, setTab] = useState<"attention" | "queue">("attention");
  const [dismissing, setDismissing] = useState<AttentionItem | null>(null);
  const reload = useCallback(async () => {
    setItems(await db.attention.orderBy("created_at").reverse().toArray());
    setQueue(await db.queue.orderBy("created_at").toArray());
  }, []);
  useEffect(() => { reload(); const t = setInterval(reload, 3000); return () => clearInterval(t); }, [reload]);
  // A payment, void or update held back by a rejected order shows under that order and goes back, or away, with it.
  const ids = useMemo(() => new Set(items.map((a) => a.id)), [items]);
  const top = items.filter((a) => !a.blocked_by || !ids.has(a.blocked_by));
  const heldBy = (id: string) => items.filter((a) => a.blocked_by === id);

  const retry = async (a: AttentionItem) => {
    try {
      if (APPROVAL_CODES.includes(a.code)) {
        // The PIN dialog opens at once, listing what the record needs; the PIN rides with this one push, approving
        // only those codes, and is forgotten after it (sync.ts approvals).
        const asked = { permissions: a.permissions ?? [], labels: a.permission_labels ?? {} };
        await run((pin, codes) => (pin ? retryAttention(a.id, pin, codes) : Promise.reject(new ApiError(a.code, a.message, 403, asked))), `Retry ${a.type.replace("_", " ")} with a manager's approval`);
      } else await retryAttention(a.id);
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "approval.cancelled")) toast.error("Could not retry", errorMessage(e));
    }
    await reload();
  };
  // Money the server never recorded (a payment, a refund, a void, an order paid offline) is confirmed before it leaves the list.
  const dismiss = (a: AttentionItem) => {
    if (isMoneyRecord(a) || heldBy(a.id).some(isMoneyRecord)) setDismissing(a);
    else void dismissAttention(a.id).then(reload);
  };
  const confirmDismiss = () => {
    const a = dismissing;
    setDismissing(null);
    if (a) void dismissAttention(a.id).then(reload);
  };

  // SPEC "Offline behaviour": the Offline Orders queue has its own permission to view it; admins (settings.manage) always may.
  if (!can("OFFLINE_ORDERS", "settings.manage")) {
    return (
      <PosShell title="Needs attention">
        <EmptyState icon={Lock} title="You need the OFFLINE_ORDERS permission" hint="The queue of orders punched without a connection is only shown to users with Offline orders (Dashboard module). Ask an admin to grant it; it applies at your next sign-in." className="m-6" />
      </PosShell>
    );
  }
  return (
    <PosShell title="Needs attention">
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Tabs size="lg" value={tab} onChange={setTab} items={[{ value: "attention", label: "Rejected", count: items.length }, { value: "queue", label: "Waiting to sync", count: queue.length }]} className="w-fit" />
        {tab === "attention" ? (
          top.length ? top.map((a) => {
            const held = heldBy(a.id);
            const withPin = APPROVAL_CODES.includes(a.code);
            return (
              <Card key={a.id}>
                <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-danger" /> {a.type.replace("_", " ")} · <span className="font-mono text-xs">{a.code}</span></CardTitle><span className="text-xs text-fg-muted">{formatDateTime(a.created_at)}</span></CardHeader>
                <CardBody className="space-y-3">
                  <p className="text-base">{a.message}</p>
                  {withPin && a.permissions?.length ? <p className="text-sm text-fg-secondary">A manager approves: {a.permissions.map((c) => a.permission_labels?.[c] ?? c).join(", ")}</p> : null}
                  {isMoneyRecord(a) ? <p className="text-sm text-warning-ink">Money the server has not recorded. The order stays on the Orders screen marked Rejected until this is retried.</p> : null}
                  {held.length ? (
                    <div className="rounded-lg bg-muted p-3 text-sm">
                      <div className="font-medium">Held back with it</div>
                      <ul className="mt-1 space-y-0.5">{held.map((k) => <li key={k.id} className="flex items-center gap-2"><Badge variant="warning">{k.type.replace("_", " ")}</Badge> {describeRecord(k, currency)} <span className="font-mono text-xs text-fg-muted">{k.id.slice(0, 8)}</span></li>)}</ul>
                      <p className="mt-1 text-xs text-fg-muted">They cannot reach the server before this order does: Try again sends them with it, Dismiss drops them with it.</p>
                    </div>
                  ) : null}
                  <details className="text-xs"><summary className="cursor-pointer text-fg-secondary">Record</summary><pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2">{JSON.stringify(a.payload, null, 2)}</pre></details>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => retry(a)}>{withPin ? <KeyRound className="h-4 w-4" /> : <RotateCw className="h-4 w-4" />} {withPin ? "Try again with manager PIN" : "Try again"}</Button>
                    <Button variant="ghost" onClick={() => dismiss(a)}><Trash2 className="h-4 w-4" /> Dismiss</Button>
                  </div>
                </CardBody>
              </Card>
            );
          }) : <EmptyState icon={AlertTriangle} title="Nothing needs attention" hint="Records the server rejects show here with the reason. They are never lost silently." />
        ) : (
          queue.length ? (
            <>
              <Button onClick={() => processQueue().then(reload)}><RotateCw className="h-4 w-4" /> Sync now</Button>
              {queue.map((q) => (
                <Card key={q.id}><CardBody className="flex items-center justify-between gap-3 text-sm">
                  <div><Badge>{q.type.replace("_", " ")}</Badge> <span className="font-mono text-xs text-fg-muted">{q.id.slice(0, 8)}</span><div className="text-xs text-fg-secondary">{formatDateTime(q.created_at)}{q.attempts ? ` · ${q.attempts} attempts` : ""}{q.last_error ? ` · ${q.last_error}` : ""}</div></div>
                  <Badge variant={q.status === "sending" ? "info" : "warning"}><Clock className="h-3 w-3" /> {q.status}</Badge>
                </CardBody></Card>
              ))}
            </>
          ) : <EmptyState icon={Clock} title="Queue is empty" hint="Everything this till did has reached the server." />
        )}
      </div>
      <ConfirmDialog open={!!dismissing} onClose={() => setDismissing(null)} onConfirm={confirmDismiss} title="Dismiss a money record?" destructive confirmLabel="Dismiss"
        description={dismissing ? `The server never recorded this ${describeRecord(dismissing, currency)}${heldBy(dismissing.id).length ? ` or the ${heldBy(dismissing.id).length} record${heldBy(dismissing.id).length === 1 ? "" : "s"} held back with it` : ""}. Dismissing only removes it from this list: the order stays on the Orders screen marked Rejected, and the money stays off the server. Try again instead if it should be recorded.` : undefined} />
      {dialog}
    </PosShell>
  );
}
