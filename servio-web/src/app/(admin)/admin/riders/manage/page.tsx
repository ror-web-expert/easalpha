"use client";
import { useState } from "react";
import Link from "next/link";
import { Bike, Plus, Pencil, Trash2, Timer, Wallet } from "lucide-react";
import type { Rider, RiderLifetimeKind } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatAgo } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { useCan } from "@/store/auth";
import { Cards, FilterBar, PageHeader } from "@/components/admin/page";
import { useRemove, useSave } from "@/components/admin/crud";
import { riderStatusVariant, useRiders } from "@/components/admin/delivery";
import { LIFETIME_KINDS, RIDER_PERMS, TEMPORARY_RIDER_PERMISSIONS, TEMPORARY_RIDER_SENTENCE, assignedVsCompleted, lifetimeLabel, lifetimeNeedsValue, lifetimeRemaining, riderActionPerms, riderExpired } from "@/components/admin/riders-helpers";
import { Badge, Button, Checkbox, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Select, SummaryCard, Switch, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";

type Tab = "permanent" | "temporary";
interface Form { id?: string; name: string; phone: string; vehicle: string; vehicle_no: string; address: string; charge_per_delivery_minor: number; create_login: boolean; pin: string; status?: string }
const blank: Form = { name: "", phone: "+92", vehicle: "bike", vehicle_no: "", address: "", charge_per_delivery_minor: 0, create_login: true, pin: "" };
interface TempForm { id?: string; name: string; phone: string; lifetime_kind: RiderLifetimeKind; lifetime_value: number; permissions: string[]; status?: string }
const blankTemp: TempForm = { name: "", phone: "", lifetime_kind: "one_order", lifetime_value: 2, permissions: ["collect_cash"] };

export default function RidersPage() {
  const can = useCan();
  const [tab, setTab] = useState<Tab>("permanent");
  const [status, setStatus] = useState("");
  const riders = useRiders({ status: status || undefined, temporary: tab === "temporary" ? "true" : "false" });
  const save = useSave<Record<string, unknown>>(["riders"], (f) => (f.id ? `/riders/${f.id}` : "/riders"), { onSuccess: () => { setForm(null); setTemp(null); }, success: "Rider saved" });
  const remove = useRemove(["riders"], (id) => `/riders/${id}`, "Rider removed");
  const [form, setForm] = useState<Form | null>(null);
  const [temp, setTemp] = useState<TempForm | null>(null);
  const [del, setDel] = useState<Rider | null>(null);
  const rows = riders.data ?? [];
  const submit = () => {
    if (!form) return;
    const body: Record<string, unknown> = { id: form.id, name: form.name, phone: form.phone || null, vehicle: form.vehicle || null, vehicle_no: form.vehicle_no || null, address: form.address || null, charge_per_delivery_minor: form.charge_per_delivery_minor };
    if (form.id) body.status = form.status;
    else if (form.create_login) { body.create_login = true; body.pin = form.pin; }
    save.mutate(body);
  };
  const submitTemp = () => {
    if (!temp) return;
    if (temp.id) { save.mutate({ id: temp.id, name: temp.name, phone: temp.phone || null, permissions: temp.permissions, status: temp.status }); return; }
    save.mutate({ name: temp.name, phone: temp.phone || null, temporary: true, lifetime_kind: temp.lifetime_kind, lifetime_value: lifetimeNeedsValue(temp.lifetime_kind) ? temp.lifetime_value : undefined, permissions: temp.permissions });
  };
  const pinOk = !form || form.id || !form.create_login || /^\d{4}$/.test(form.pin);
  const canCreate = tab === "permanent" ? can(...RIDER_PERMS.permanent.create) : can(...RIDER_PERMS.temporary.create);
  const addButton = canCreate ? (tab === "permanent"
    ? <Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> Add rider</Button>
    : <Button onClick={() => setTemp(blankTemp)}><Plus className="h-4 w-4" /> Add temporary rider</Button>) : null;
  return (
    <>
      <PageHeader icon={Bike} title="Manage Riders" description="Permanent riders carry contact details, vehicle information, a per-delivery charge and assigned-versus-completed counts. A rider with a login uses the rider app with a 4-digit PIN."
        actions={<><Link href="/admin/riders/vault"><Button variant="secondary"><Wallet className="h-4 w-4" /> Rider Vault</Button></Link>{addButton}</>} />
      <Cards>
        <SummaryCard label={tab === "permanent" ? "Riders" : "Temporary riders"} value={rows.length} tone="neutral" />
        <SummaryCard label="Available" value={rows.filter((r) => r.status === "available" && !riderExpired(r)).length} tone="success" />
        <SummaryCard label="Out on deliveries" value={rows.reduce((a, r) => a + (r.open_deliveries ?? 0), 0)} sub="Open deliveries right now" tone="info" />
        {tab === "permanent"
          ? <SummaryCard label="Float held" value={formatMoney(rows.reduce((a, r) => a + r.float_minor, 0))} sub="Company cash with riders" tone="warning" />
          : <SummaryCard label="Expired" value={rows.filter((r) => riderExpired(r)).length} sub="Lifetime used up" tone="danger" />}
      </Cards>
      <FilterBar>
        <Tabs value={tab} onChange={setTab} items={[{ value: "permanent", label: "Permanent" }, { value: "temporary", label: "Temporary" }]} />
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="available">Available</option><option value="busy">Busy</option><option value="offline">Offline</option></Select>
      </FilterBar>
      {tab === "temporary" ? <p className="mb-3 text-sm text-fg-secondary">{TEMPORARY_RIDER_SENTENCE}</p> : null}
      {riders.isLoading ? <Loading /> : tab === "permanent" ? (
        <Table>
          <THead><tr><TH>Rider</TH><TH>Phone</TH><TH>Vehicle</TH><TH right>Charge per delivery</TH><TH>Status</TH><TH right>Assigned / completed</TH><TH right>Float</TH><TH>Login</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {rows.length ? rows.map((r) => {
              const perms = riderActionPerms(r);
              return (
                <TR key={r.id}>
                  <TD><Link href={`/admin/riders/manage/${r.id}`} className="font-medium text-primary hover:underline">{r.name}</Link>{r.last_seen_at ? <div className="text-xs text-fg-muted">Seen {formatAgo(r.last_seen_at)}</div> : null}</TD>
                  <TD className="text-fg-secondary">{r.phone ?? "-"}</TD>
                  <TD className="text-fg-secondary">{[r.vehicle ? titleCase(r.vehicle) : null, r.vehicle_no].filter(Boolean).join(" · ") || "-"}</TD>
                  <TD right>{formatMoney(r.charge_per_delivery_minor)}</TD>
                  <TD><Badge variant={riderStatusVariant(r.status)}>{titleCase(r.status)}</Badge>{r.open_deliveries ? <span className="ml-2 text-xs text-fg-muted">{r.open_deliveries} open</span> : null}</TD>
                  <TD right className="tabular" title="Assigned / completed">{assignedVsCompleted(r)}</TD>
                  <TD right className={r.float_minor ? "font-medium" : "text-fg-muted"}>{formatMoney(r.float_minor)}</TD>
                  <TD>{r.membership_id ? <Badge variant="success">app</Badge> : <Badge>none</Badge>}</TD>
                  <TD right>
                    {can(...perms.edit) ? <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: r.id, name: r.name, phone: r.phone ?? "", vehicle: r.vehicle ?? "", vehicle_no: r.vehicle_no ?? "", address: r.address ?? "", charge_per_delivery_minor: r.charge_per_delivery_minor, create_login: false, pin: "", status: r.status })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button> : null}
                    {can(...perms.delete) ? <Button variant="ghost" size="icon-sm" onClick={() => setDel(r)} aria-label="Deactivate"><Trash2 className="h-4 w-4 text-danger" /></Button> : null}
                  </TD>
                </TR>
              );
            }) : <EmptyRow colSpan={9}>No riders yet.</EmptyRow>}
          </TBody>
        </Table>
      ) : (
        <Table>
          <THead><tr><TH>Rider</TH><TH>Phone</TH><TH>Lifetime</TH><TH>Remaining</TH><TH>Status</TH><TH>Permissions</TH><TH right>Assigned / completed</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {rows.length ? rows.map((r) => {
              const perms = riderActionPerms(r);
              const expired = riderExpired(r);
              return (
                <TR key={r.id} className={expired ? "opacity-70" : ""}>
                  <TD><Link href={`/admin/riders/manage/${r.id}`} className="font-medium text-primary hover:underline">{r.name}</Link></TD>
                  <TD className="text-fg-secondary">{r.phone ?? "-"}</TD>
                  <TD><span className="inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5 text-fg-muted" />{r.lifetime_label ?? lifetimeLabel(r.lifetime_kind, r.lifetime_value)}</span></TD>
                  <TD className="text-fg-secondary">{expired ? <Badge variant="danger">Expired</Badge> : lifetimeRemaining(r)}</TD>
                  <TD><Badge variant={riderStatusVariant(r.status)}>{titleCase(r.status)}</Badge></TD>
                  <TD><div className="flex flex-wrap gap-1">{r.permissions?.length ? r.permissions.map((p) => <Badge key={p} variant="outline">{TEMPORARY_RIDER_PERMISSIONS.find((x) => x.code === p)?.label ?? p}</Badge>) : <span className="text-xs text-fg-muted">none</span>}</div></TD>
                  <TD right className="tabular">{assignedVsCompleted(r)}</TD>
                  <TD right>
                    {can(...perms.edit) ? <Button variant="ghost" size="icon-sm" onClick={() => setTemp({ id: r.id, name: r.name, phone: r.phone ?? "", lifetime_kind: (r.lifetime_kind ?? "one_order") as RiderLifetimeKind, lifetime_value: r.lifetime_value ?? 2, permissions: r.permissions ?? [], status: r.status })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button> : null}
                    {can(...perms.delete) ? <Button variant="ghost" size="icon-sm" onClick={() => setDel(r)} aria-label="Remove"><Trash2 className="h-4 w-4 text-danger" /></Button> : null}
                  </TD>
                </TR>
              );
            }) : <EmptyRow colSpan={8}>No temporary riders. Add one for a stand-in who works one order, a few orders, the rest of today or a few hours.</EmptyRow>}
          </TBody>
        </Table>
      )}

      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit rider" : "Add rider"}
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
                <Switch checked={form.create_login} onChange={(v) => setForm({ ...form, create_login: v })} label="Create a rider app login (optional)" />
                {form.create_login ? <Field label="4-digit PIN" hint="The rider signs in to the rider app on a paired phone with this PIN" error={form.pin && !/^\d{4}$/.test(form.pin) ? "Exactly 4 digits" : undefined}><Input inputMode="numeric" maxLength={4} className="w-32 font-mono tracking-widest" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></Field> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog open={!!temp} onClose={() => setTemp(null)} title={temp?.id ? "Edit temporary rider" : "Add temporary rider"} description={TEMPORARY_RIDER_SENTENCE}
        footer={<><Button variant="secondary" onClick={() => setTemp(null)}>Cancel</Button><Button loading={save.isPending} disabled={!temp?.name.trim() || (!!temp && !temp.id && lifetimeNeedsValue(temp.lifetime_kind) && temp.lifetime_value < 1)} onClick={submitTemp}>Save</Button></>}>
        {temp ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={temp.name} onChange={(e) => setTemp({ ...temp, name: e.target.value })} autoFocus /></Field>
            <Field label="Phone (optional)"><Input type="tel" value={temp.phone} onChange={(e) => setTemp({ ...temp, phone: e.target.value })} /></Field>
            {temp.id ? (
              <Field label="Status"><Select value={temp.status ?? "available"} onChange={(e) => setTemp({ ...temp, status: e.target.value })}><option value="available">Available</option><option value="busy">Busy</option><option value="offline">Offline</option></Select></Field>
            ) : (
              <>
                <Field label="Lifetime"><Select value={temp.lifetime_kind} onChange={(e) => setTemp({ ...temp, lifetime_kind: e.target.value as RiderLifetimeKind })}>{LIFETIME_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></Field>
                {lifetimeNeedsValue(temp.lifetime_kind) ? <Field label={temp.lifetime_kind === "n_orders" ? "How many orders" : "How many hours"}><Input type="number" inputMode="numeric" min={1} value={temp.lifetime_value} onChange={(e) => setTemp({ ...temp, lifetime_value: Math.max(1, Number(e.target.value) || 1) })} /></Field> : <div className="hidden sm:block" />}
                <p className="text-xs text-fg-muted sm:col-span-2">The rider is removed from the pick list when the lifetime ends: {lifetimeLabel(temp.lifetime_kind, temp.lifetime_value).toLowerCase()}.</p>
              </>
            )}
            <Field label="Permissions" className="sm:col-span-2">
              <div className="space-y-2 rounded-md border bg-muted/40 p-3">
                {TEMPORARY_RIDER_PERMISSIONS.map((p) => (
                  <div key={p.code}>
                    <Checkbox label={p.label} checked={temp.permissions.includes(p.code)} onChange={(e) => setTemp({ ...temp, permissions: e.target.checked ? [...temp.permissions, p.code] : temp.permissions.filter((x) => x !== p.code) })} />
                    <div className="ml-6 text-xs text-fg-muted">{p.hint}</div>
                  </div>
                ))}
              </div>
            </Field>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })} title={del?.temporary ? `Remove ${del?.name}?` : `Deactivate ${del?.name}?`}
        description={del?.temporary ? "A temporary rider with no orders is deleted; one that carried orders is deactivated and kept for the records." : "A rider on past orders is deactivated rather than deleted. A rider holding float or with unsettled deliveries must be settled first."}
        confirmLabel={del?.temporary ? "Remove" : "Deactivate"} destructive loading={remove.isPending} />
    </>
  );
}
