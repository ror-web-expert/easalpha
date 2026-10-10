"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plug, RefreshCw } from "lucide-react";
import { api, API_URL } from "@/lib/api";
import type { Branch, FoodpandaSettings } from "@/lib/types";
import { formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page";
import { useAction, useList } from "@/components/admin/crud";
import { useCan } from "@/store/auth";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyRow, Field, Input, Loading, Select, Switch, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

// Foodpanda: orders arrive on a webhook signed with a shared secret; commission is booked against each order.
// The secret never round-trips (the API masks it); Rotate issues a new one and shows it once.

const truthy = (v: unknown) => v === true || v === "true" || v === 1 || v === "1";
interface Form { enabled: boolean; commission_percent: string; auto_accept: boolean; branch_id: string }

export default function IntegrationsPage() {
  const can = useCan();
  const canEdit = can("settings.manage");
  const q = useQuery({ queryKey: ["foodpanda"], queryFn: () => api<FoodpandaSettings>("/integrations/foodpanda") });
  const branches = useList<Branch>("branches", "/branches");
  const [f, setF] = useState<Form | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!q.data || f) return;
    setF({ enabled: truthy(q.data.enabled), commission_percent: String(q.data.commission_percent ?? ""), auto_accept: truthy(q.data.auto_accept), branch_id: q.data.branch_id ?? "" });
  }, [q.data, f]);
  const save = useAction<Record<string, unknown>, FoodpandaSettings>(["foodpanda"], (body) => api("/integrations/foodpanda", { method: "PATCH", body }), "Foodpanda settings saved");
  if (q.isLoading || !f) return <Loading />;
  const s = q.data!;
  const webhook = s.webhook_url ? `${API_URL.replace(/\/api\/v1$/, "")}${s.webhook_url}` : "";
  return (
    <>
      <PageHeader icon={Plug} title="Integrations" description="Aggregators that push orders into the POS." actions={<Button loading={save.isPending} disabled={!canEdit} onClick={() => save.mutate({ enabled: f.enabled, commission_percent: Number(f.commission_percent) || 0, auto_accept: f.auto_accept, branch_id: f.branch_id || null })}>Save</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Foodpanda</CardTitle><Switch checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} label={f.enabled ? "On" : "Off"} disabled={!canEdit} /></CardHeader>
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Commission %" hint="Booked as an expense against each Foodpanda order"><Input type="number" min={0} max={100} step="any" className="tabular" value={f.commission_percent} onChange={(e) => setF({ ...f, commission_percent: e.target.value })} disabled={!canEdit} /></Field>
            <Field label="Orders land at"><Select value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })} disabled={!canEdit}><option value="">Main branch</option>{branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
            <div className="sm:col-span-2"><Switch checked={f.auto_accept} onChange={(v) => setF({ ...f, auto_accept: v })} label="Accept incoming orders automatically" disabled={!canEdit} /></div>
            <Field label="Webhook URL" hint="Paste this into the Foodpanda partner portal" className="sm:col-span-2"><Input readOnly className="font-mono text-xs" value={webhook} onFocus={(e) => e.currentTarget.select()} /></Field>
            <div className="sm:col-span-2">
              <div className="mb-1 flex items-center gap-2"><span className="text-xs font-medium tracking-[0.4px] text-fg-secondary">Shared secret</span>{s.secret ? <Badge variant="success">set</Badge> : <Badge>not set</Badge>}</div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{shown ?? s.secret ?? "-"}</span>
                <Button variant="secondary" size="sm" disabled={!canEdit} loading={save.isPending} onClick={() => save.mutate({ secret: "rotate" }, { onSuccess: (r) => setShown(r.secret_plain ?? null) })}><RefreshCw className="h-4 w-4" /> Rotate</Button>
              </div>
              <p className="mt-1 text-xs text-fg-muted">{shown ? "Copy the new secret now; it is shown only once." : "Rotating issues a new secret and shows it once. Update the partner portal afterwards."}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent webhook events</CardTitle></CardHeader>
          <CardBody className="p-0">
            <Table>
              <THead><tr><TH>Received</TH><TH>Event</TH><TH>External id</TH><TH>Status</TH><TH>Error</TH></tr></THead>
              <TBody>
                {s.events?.length ? s.events.map((e) => (
                  <TR key={e.id}>
                    <TD className="text-fg-secondary">{formatDateTime(e.received_at)}</TD>
                    <TD>{titleCase(e.event)}</TD>
                    <TD className="font-mono text-xs">{e.external_id ?? "-"}</TD>
                    <TD><Badge variant={e.status === "processed" || e.status === "ok" ? "success" : e.status === "failed" ? "danger" : "neutral"}>{e.status}</Badge></TD>
                    <TD className="max-w-xs truncate text-xs text-danger" title={e.error ?? undefined}>{e.error ?? ""}</TD>
                  </TR>
                )) : <EmptyRow colSpan={5}>No events received yet.</EmptyRow>}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
