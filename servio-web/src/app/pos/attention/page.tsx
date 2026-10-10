"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RotateCw, Trash2, Clock, Lock } from "lucide-react";
import { db, type AttentionItem, type QueueItem } from "@/lib/db";
import { dismissAttention, processQueue, retryAttention } from "@/lib/sync";
import { formatDateTime } from "@/lib/dates";
import { usePosCan } from "@/store/device";
import { PosShell } from "@/components/pos/shell";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyState, Tabs } from "@/components/ui";

export default function AttentionPage() {
  const can = usePosCan();
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [tab, setTab] = useState<"attention" | "queue">("attention");
  const reload = useCallback(async () => {
    setItems(await db.attention.orderBy("created_at").reverse().toArray());
    setQueue(await db.queue.orderBy("created_at").toArray());
  }, []);
  useEffect(() => { reload(); const t = setInterval(reload, 3000); return () => clearInterval(t); }, [reload]);
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
          items.length ? items.map((a) => (
            <Card key={a.id}>
              <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-danger" /> {a.type} · <span className="font-mono text-xs">{a.code}</span></CardTitle><span className="text-xs text-fg-muted">{formatDateTime(a.created_at)}</span></CardHeader>
              <CardBody className="space-y-3">
                <p className="text-base">{a.message}</p>
                <details className="text-xs"><summary className="cursor-pointer text-fg-secondary">Record</summary><pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2">{JSON.stringify(a.payload, null, 2)}</pre></details>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => retryAttention(a.id).then(reload)}><RotateCw className="h-4 w-4" /> Try again</Button>
                  <Button variant="ghost" onClick={() => dismissAttention(a.id).then(reload)}><Trash2 className="h-4 w-4" /> Dismiss</Button>
                </div>
              </CardBody>
            </Card>
          )) : <EmptyState icon={AlertTriangle} title="Nothing needs attention" hint="Records the server rejects show here with the reason. They are never lost silently." />
        ) : (
          queue.length ? (
            <>
              <Button onClick={() => processQueue().then(reload)}><RotateCw className="h-4 w-4" /> Sync now</Button>
              {queue.map((q) => (
                <Card key={q.id}><CardBody className="flex items-center justify-between gap-3 text-sm">
                  <div><Badge>{q.type}</Badge> <span className="font-mono text-xs text-fg-muted">{q.id.slice(0, 8)}</span><div className="text-xs text-fg-secondary">{formatDateTime(q.created_at)}{q.attempts ? ` · ${q.attempts} attempts` : ""}{q.last_error ? ` · ${q.last_error}` : ""}</div></div>
                  <Badge variant={q.status === "sending" ? "info" : "warning"}><Clock className="h-3 w-3" /> {q.status}</Badge>
                </CardBody></Card>
              ))}
            </>
          ) : <EmptyState icon={Clock} title="Queue is empty" hint="Everything this till did has reached the server." />
        )}
      </div>
    </PosShell>
  );
}
