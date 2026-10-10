"use client";
import { useState } from "react";
import Link from "next/link";
import { Bike, Plus, Pencil, Trash2 } from "lucide-react";
import type { Rider } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatAgo } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { Cards, FilterBar, PageHeader } from "@/components/admin/page";
import { useRemove, useSave } from "@/components/admin/crud";
import { riderStatusVariant, useRiders } from "@/components/admin/delivery";
import { Badge, Button, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Select, SummaryCard, Switch, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface Form { id?: string; name: string; phone: string; vehicle: string; vehicle_no: string; address: string; charge_per_delivery_minor: number; create_login: boolean; pin: string; status?: string }
const blank: Form = { name: "", phone: "+92", vehicle: "bike", vehicle_no: "", address: "", charge_per_delivery_minor: 0, create_login: true, pin: "" };

export default function RidersPage() {
  const [status, setStatus] = useState("");
  const riders = useRiders({ status: status || undefined });
  const save = useSave<Record<string, unknown>>(["riders"], (f) => (f.id ? `/riders/${f.id}` : "/riders"), { onSuccess: () => setForm(null), success: "Rider saved" });
  const remove = useRemove(["riders"], (id) => `/riders/${id}`, "Rider archived");
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<Rider | null>(null);
  const rows = riders.data ?? [];
  const submit = () => {
    if (!form) return;
    const body: Record<string, unknown> = { id: form.id, name: form.name, phone: form.phone || null, vehicle: form.vehicle || null, vehicle_no: form.vehicle_no || null, address: form.address || null, charge_per_delivery_minor: form.charge_per_delivery_minor };
    if (form.id) body.status = form.status;
    else if (form.create_login) { body.create_login = true; body.pin = form.pin; }
    save.mutate(body);
  };
  const pinOk = !form || form.id || !form.create_login || /^\d{4}$/.test(form.pin);
  return (
    <>
      <PageHeader icon={Bike} title="Riders" description="Delivery riders, their cash float and settlements. A rider with a login uses the rider app with a 4-digit PIN." actions={<Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New rider</Button>} />
      <Cards>
        <SummaryCard label="Riders" value={rows.length} tone="neutral" />
        <SummaryCard label="Available" value={rows.filter((r) => r.status === "available").length} tone="success" />
        <SummaryCard label="Out on deliveries" value={rows.reduce((a, r) => a + (r.open_deliveries ?? 0), 0)} sub="Open deliveries right now" tone="info" />
        <SummaryCard label="Float held" value={formatMoney(rows.reduce((a, r) => a + r.float_minor, 0))} sub="Company cash with riders" tone="warning" />
      </Cards>
      <FilterBar><Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="available">Available</option><option value="busy">Busy</option><option value="offline">Offline</option></Select></FilterBar>
      {riders.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Rider</TH><TH>Phone</TH><TH>Vehicle</TH><TH>Status</TH><TH right>Open</TH><TH right>Float</TH><TH right>Per delivery</TH><TH>Login</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {rows.length ? rows.map((r) => (
              <TR key={r.id}>
                <TD><Link href={`/admin/delivery/riders/${r.id}`} className="font-medium text-primary hover:underline">{r.name}</Link>{r.last_seen_at ? <div className="text-xs text-fg-muted">Seen {formatAgo(r.last_seen_at)}</div> : null}</TD>
                <TD className="text-fg-secondary">{r.phone ?? "-"}</TD>
                <TD className="text-fg-secondary">{[r.vehicle ? titleCase(r.vehicle) : null, r.vehicle_no].filter(Boolean).join(" · ") || "-"}</TD>
                <TD><Badge variant={riderStatusVariant(r.status)}>{titleCase(r.status)}</Badge></TD>
                <TD right>{r.open_deliveries ?? 0}</TD>
                <TD right className={r.float_minor ? "font-medium" : "text-fg-muted"}>{formatMoney(r.float_minor)}</TD>
                <TD right>{formatMoney(r.charge_per_delivery_minor)}</TD>
                <TD>{r.membership_id ? <Badge variant="success">app</Badge> : <Badge>none</Badge>}</TD>
                <TD right>
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: r.id, name: r.name, phone: r.phone ?? "", vehicle: r.vehicle ?? "", vehicle_no: r.vehicle_no ?? "", address: r.address ?? "", charge_per_delivery_minor: r.charge_per_delivery_minor, create_login: false, pin: "", status: r.status })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setDel(r)} aria-label="Archive"><Trash2 className="h-4 w-4 text-danger" /></Button>
                </TD>
              </TR>
            )) : <EmptyRow colSpan={9}>No riders yet.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit rider" : "New rider"}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name.trim() || !pinOk} onClick={submit}>Save</Button></>}>
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Field label="Phone" hint={!form.id && form.create_login ? "Also the login phone" : undefined}><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Vehicle"><Select value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })}><option value="bike">Bike</option><option value="scooter">Scooter</option><option value="car">Car</option><option value="bicycle">Bicycle</option><option value="foot">On foot</option></Select></Field>
            <Field label="Vehicle no"><Input className="font-mono" value={form.vehicle_no} onChange={(e) => setForm({ ...form, vehicle_no: e.target.value.toUpperCase() })} placeholder="LEA-1234" /></Field>
            <Field label="Charge per delivery" hint="Paid to the rider per completed delivery"><MoneyInput value={form.charge_per_delivery_minor} onChange={(v) => setForm({ ...form, charge_per_delivery_minor: v })} /></Field>
            {form.id ? <Field label="Status"><Select value={form.status ?? "available"} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="available">Available</option><option value="busy">Busy</option><option value="offline">Offline</option></Select></Field> : null}
            <Field label="Address" className="sm:col-span-2"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            {!form.id ? (
              <div className="space-y-3 rounded-md border bg-muted/40 p-3 sm:col-span-2">
                <Switch checked={form.create_login} onChange={(v) => setForm({ ...form, create_login: v })} label="Create a rider app login" />
                {form.create_login ? <Field label="4-digit PIN" hint="The rider logs into the app with phone and PIN" error={form.pin && !/^\d{4}$/.test(form.pin) ? "Exactly 4 digits" : undefined}><Input inputMode="numeric" maxLength={4} className="w-32 font-mono tracking-widest" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></Field> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })} title={`Archive ${del?.name}?`} description="A rider holding float or with unsettled deliveries must be settled first." confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}
