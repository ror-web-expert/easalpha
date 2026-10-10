"use client";
import { useState } from "react";
import { MonitorSmartphone, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Branch, Device, Station } from "@/lib/types";
import { formatAgo, formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page";
import { useAction, useList, useRemove, useSave } from "@/components/admin/crud";
import { Badge, Button, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface Form { name: string; kind: string; branch_id: string; station_id: string }

export default function DevicesPage() {
  const list = useList<Device>("devices", "/devices");
  const branches = useList<Branch>("branches", "/branches");
  const stations = useList<Station>("stations", "/stations");
  const [form, setForm] = useState<Form | null>(null);
  const [code, setCode] = useState<Device | null>(null);
  const [del, setDel] = useState<Device | null>(null);
  const create = useSave<Form, Device>(["devices"], () => "/devices", { onSuccess: (d) => { setForm(null); setCode(d); }, success: "Device created" });
  const regen = useAction<string, Device>(["devices"], (id) => api<Device>(`/devices/${id}/regenerate_code`, { method: "POST" }));
  const remove = useRemove(["devices"], (id) => `/devices/${id}`, "Device revoked");
  return (
    <>
      <PageHeader icon={MonitorSmartphone} title="Devices" description="Tills, tablets, kitchen displays and token screens paired to a branch." actions={<Button onClick={() => setForm({ name: "", kind: "till", branch_id: branches.data?.[0]?.id ?? "", station_id: "" })}><Plus className="h-4 w-4" /> New device</Button>} />
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Device</TH><TH>Kind</TH><TH>Branch</TH><TH>Status</TH><TH>Pairing code</TH><TH>Last seen</TH><TH>Last sync</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {list.data?.length ? list.data.map((d) => (
              <TR key={d.id} className={d.revoked_at ? "opacity-50" : ""}>
                <TD className="font-medium">{d.name} <span className="font-mono text-xs text-fg-muted">{d.code}</span></TD>
                <TD>{titleCase(d.kind)}{d.station_id ? <span className="text-xs text-fg-muted"> · {stations.data?.find((s) => s.id === d.station_id)?.name}</span> : null}</TD>
                <TD className="text-fg-secondary">{branches.data?.find((b) => b.id === d.branch_id)?.name ?? "-"}</TD>
                <TD>{d.revoked_at ? <Badge variant="danger">revoked</Badge> : d.paired ? <Badge variant="success">paired</Badge> : <Badge variant="warning">not paired</Badge>}</TD>
                <TD>{d.pairing_code && !d.paired ? <button className="font-mono text-base font-semibold tracking-widest text-primary" onClick={() => setCode(d)}>{d.pairing_code}</button> : "-"}</TD>
                <TD className="text-fg-secondary" title={formatDateTime(d.last_seen_at)}>{d.last_seen_at ? formatAgo(d.last_seen_at) : "-"}</TD>
                <TD className="text-fg-secondary" title={formatDateTime(d.last_sync_at)}>{d.last_sync_at ? formatAgo(d.last_sync_at) : "-"}</TD>
                <TD right>
                  {!d.revoked_at ? <Button variant="ghost" size="icon-sm" title="New pairing code" onClick={() => regen.mutate(d.id, { onSuccess: (dev) => setCode(dev) })} aria-label="Regenerate"><RefreshCw className="h-4 w-4" /></Button> : null}
                  {!d.revoked_at ? <Button variant="ghost" size="icon-sm" title="Revoke" onClick={() => setDel(d)} aria-label="Revoke"><Trash2 className="h-4 w-4 text-danger" /></Button> : null}
                </TD>
              </TR>
            )) : <EmptyRow colSpan={8}>No devices. Create one to get a pairing code.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title="New device" size="sm" footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={create.isPending} disabled={!form?.name} onClick={() => form && create.mutate({ ...form, station_id: form.station_id || (null as unknown as string) })}>Create</Button></>}>
        {form ? (
          <div className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Counter till, Kitchen screen" autoFocus /></Field>
            <Field label="Kind"><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{["till", "tablet", "kitchen", "token_screen", "customer_display", "kiosk"].map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}</Select></Field>
            <Field label="Branch"><Select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>{branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
            {form.kind === "kitchen" ? <Field label="Station"><Select value={form.station_id} onChange={(e) => setForm({ ...form, station_id: e.target.value })}><option value="">All stations</option>{stations.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field> : null}
          </div>
        ) : null}
      </Dialog>
      <Dialog open={!!code} onClose={() => setCode(null)} title="Pairing code" description={`Enter this on the device at /pos/pair (till) or /kitchen (kitchen display). Expires ${formatDateTime(code?.pairing_expires_at)}.`} size="sm" footer={<Button onClick={() => setCode(null)}>Done</Button>}>
        <div className="py-6 text-center font-mono text-5xl font-bold tracking-[0.3em] text-primary">{code?.pairing_code}</div>
        <p className="text-center text-sm text-fg-secondary">{code?.name}</p>
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })} title={`Revoke ${del?.name}?`} description="The device is logged out immediately. Unsynced records stay on it until a manager re-pairs." confirmLabel="Revoke" destructive loading={remove.isPending} />
    </>
  );
}
