"use client";
import { useState } from "react";
import { RefreshCw, Check } from "lucide-react";
import { api } from "@/lib/api";
import type { SyncRejection } from "@/lib/types";
import { formatDateTime } from "@/lib/dates";
import { usePagedList } from "@/lib/hooks";
import { FilterBar, LoadMore, PageHeader } from "@/components/admin/page";
import { useAction } from "@/components/admin/crud";
import { Badge, Button, Checkbox, Dialog, EmptyRow, Loading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function SyncPage() {
  const [resolved, setResolved] = useState(false);
  const list = usePagedList<SyncRejection>(["sync_rejections"], "/sync/rejections", { include_resolved: resolved ? "true" : "" });
  const [view, setView] = useState<SyncRejection | null>(null);
  const resolve = useAction<{ id: string; resolution: string }>(["sync_rejections", "dashboard"], ({ id, resolution }) => api(`/sync/rejections/${id}/resolve`, { method: "POST", body: { resolution } }), "Resolved");
  return (
    <>
      <PageHeader icon={RefreshCw} title="Needs attention" description="Records a till sent that the server could not apply. Nothing is lost: fix the cause, then resolve." />
      <FilterBar><Checkbox label="Show resolved" checked={resolved} onChange={(e) => setResolved(e.target.checked)} /></FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>When</TH><TH>Type</TH><TH>Code</TH><TH>Message</TH><TH>Status</TH><TH right></TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((r) => (
              <TR key={r.id} onClick={() => setView(r)}>
                <TD className="text-fg-secondary">{formatDateTime(r.created_at)}</TD>
                <TD><Badge>{r.record_type}</Badge></TD>
                <TD className="font-mono text-xs">{r.code}</TD>
                <TD className="max-w-md truncate">{r.message}</TD>
                <TD>{r.resolved_at ? <Badge variant="success">resolved · {r.resolution}</Badge> : <Badge variant="danger">open</Badge>}</TD>
                <TD right>{!r.resolved_at ? <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); resolve.mutate({ id: r.id, resolution: "dismissed" }); }}><Check className="h-3 w-3" /> Dismiss</Button> : null}</TD>
              </TR>
            )) : <EmptyRow colSpan={6}>Nothing needs attention.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
      <Dialog open={!!view} onClose={() => setView(null)} title={`${view?.record_type} · ${view?.code}`} description={view?.message} size="lg" footer={view && !view.resolved_at ? <><Button variant="secondary" onClick={() => resolve.mutate({ id: view.id, resolution: "dismissed" }, { onSuccess: () => setView(null) })}>Dismiss</Button><Button onClick={() => resolve.mutate({ id: view.id, resolution: "fixed" }, { onSuccess: () => setView(null) })}>Mark fixed</Button></> : undefined}>
        <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(view?.payload, null, 2)}</pre>
      </Dialog>
    </>
  );
}
