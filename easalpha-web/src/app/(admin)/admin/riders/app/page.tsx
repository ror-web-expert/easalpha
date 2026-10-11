"use client";
import { useState } from "react";
import Link from "next/link";
import { Smartphone, Plus, RefreshCw, Trash2, KeyRound, QrCode, LogIn } from "lucide-react";
import { api } from "@/lib/api";
import type { Branch, Device } from "@/lib/types";
import { formatAgo, formatDateTime } from "@/lib/dates";
import { useCan } from "@/store/auth";
import { Cards, PageHeader } from "@/components/admin/page";
import { useAction, useList, useRemove, useSave } from "@/components/admin/crud";
import { useRiders } from "@/components/admin/delivery";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, Select, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface Form { name: string; kind: "rider"; branch_id: string }

export default function RiderAppPage() {
  const can = useCan();
  const canManage = can("devices.manage");
  const list = useList<Device>("devices", "/devices");
  const branches = useList<Branch>("branches", "/branches");
  const riders = useRiders({ temporary: "false" });
  const [form, setForm] = useState<Form | null>(null);
  const [code, setCode] = useState<Device | null>(null);
  const [del, setDel] = useState<Device | null>(null);
  const create = useSave<Form, Device>(["devices"], () => "/devices", { onSuccess: (d) => { setForm(null); setCode(d); }, success: "Rider phone added" });
  const regen = useAction<string, Device>(["devices"], (id) => api<Device>(`/devices/${id}/regenerate_code`, { method: "POST" }));
  const remove = useRemove(["devices"], (id) => `/devices/${id}`, "Rider phone revoked");
  const devices = (list.data ?? []).filter((d) => d.kind === "rider");
  const withLogin = (riders.data ?? []).filter((r) => r.membership_id).length;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <>
      <PageHeader icon={Smartphone} title="Rider App" description="Riders see their assigned deliveries and mark each step: picked up, on the way, arrived, delivered or failed. Cash collected on delivery is recorded for the Rider Vault. The app is an installable page at /rider on the rider's phone."
        actions={canManage ? <Button onClick={() => setForm({ name: "", kind: "rider", branch_id: branches.data?.[0]?.id ?? "" })}><Plus className="h-4 w-4" /> Add rider phone</Button> : null} />
      <Cards>
        <SummaryCard label="Rider phones" value={devices.filter((d) => !d.revoked_at).length} sub={`${devices.filter((d) => d.paired && !d.revoked_at).length} paired`} tone="info" />
        <SummaryCard label="Riders with a login" value={withLogin} sub={<Link href="/admin/riders/manage" className="text-primary hover:underline">Add logins in Manage Riders</Link>} tone="neutral" />
        <SummaryCard label="Install address" value={<span className="font-mono text-base">{origin ? `${origin}/rider` : "/rider"}</span>} sub="Open on the phone and add to the home screen" tone="primary" />
      </Cards>
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {[
          { icon: QrCode, title: "1. Open /rider on the phone", text: "Use the phone's browser and choose Add to Home Screen so it opens like an app, full screen and portrait." },
          { icon: KeyRound, title: "2. Enter the pairing code", text: "Add a rider phone here and read the 6-digit code to the rider. The code is shown once and expires; make a new one if it lapses." },
          { icon: LogIn, title: "3. Sign in with the rider's PIN", text: "The rider enters the 4-digit PIN set in Manage Riders. The phone stays paired; only the PIN is asked again." },
        ].map((s) => (
          <Card key={s.title}>
            <CardHeader><CardTitle className="flex items-center gap-2"><s.icon className="h-4 w-4 text-primary" /> {s.title}</CardTitle></CardHeader>
            <CardBody className="text-sm text-fg-secondary">{s.text}</CardBody>
          </Card>
        ))}
      </div>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Phone</TH><TH>Branch</TH><TH>Status</TH><TH>Pairing code</TH><TH>Last seen</TH><TH>App version</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {devices.length ? devices.map((d) => (
              <TR key={d.id} className={d.revoked_at ? "opacity-50" : ""}>
                <TD className="font-medium">{d.name} <span className="font-mono text-xs text-fg-muted">{d.code}</span></TD>
                <TD className="text-fg-secondary">{branches.data?.find((b) => b.id === d.branch_id)?.name ?? "-"}</TD>
                <TD>{d.revoked_at ? <Badge variant="danger">revoked</Badge> : d.paired ? <Badge variant="success">paired</Badge> : <Badge variant="warning">waiting for code</Badge>}</TD>
                <TD>{d.pairing_code && !d.paired ? <button className="font-mono text-base font-semibold tracking-widest text-primary" onClick={() => setCode(d)}>{d.pairing_code}</button> : <span className="text-fg-muted">-</span>}</TD>
                <TD className="text-fg-secondary" title={formatDateTime(d.last_seen_at)}>{d.last_seen_at ? formatAgo(d.last_seen_at) : "never"}</TD>
                <TD className="text-fg-secondary">{d.app_version ?? "-"}</TD>
                <TD right>
                  {canManage && !d.revoked_at ? <Button variant="ghost" size="icon-sm" title="New pairing code" onClick={() => regen.mutate(d.id, { onSuccess: (dev) => setCode(dev) })} aria-label="New pairing code"><RefreshCw className="h-4 w-4" /></Button> : null}
                  {canManage && !d.revoked_at ? <Button variant="ghost" size="icon-sm" title="Revoke" onClick={() => setDel(d)} aria-label="Revoke"><Trash2 className="h-4 w-4 text-danger" /></Button> : null}
                </TD>
              </TR>
            )) : <EmptyRow colSpan={7}>No rider phones yet. Add one to get a pairing code.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title="Add rider phone" description="One record per phone. The pairing code appears once after you save." size="sm"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={create.isPending} disabled={!form?.name.trim()} onClick={() => form && create.mutate(form)}>Add</Button></>}>
        {form ? (
          <div className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ali's phone" autoFocus /></Field>
            <Field label="Branch"><Select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>{branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
          </div>
        ) : null}
      </Dialog>
      <Dialog open={!!code} onClose={() => setCode(null)} title="Pairing code" description={`On the phone open ${origin || ""}/rider, enter this code, then sign in with the rider's PIN. Expires ${formatDateTime(code?.pairing_expires_at)}.`} size="sm" footer={<Button onClick={() => setCode(null)}>Done</Button>}>
        <div className="py-6 text-center font-mono text-5xl font-bold tracking-[0.3em] text-primary">{code?.pairing_code}</div>
        <p className="text-center text-sm text-fg-secondary">{code?.name}</p>
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })} title={`Revoke ${del?.name}?`} description="The phone is signed out at once and must be paired again with a new code." confirmLabel="Revoke" destructive loading={remove.isPending} />
    </>
  );
}
