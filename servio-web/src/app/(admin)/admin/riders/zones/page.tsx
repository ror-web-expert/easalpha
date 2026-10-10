"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPinned, Plus, Pencil, Trash2, Search } from "lucide-react";
import { api } from "@/lib/api";
import type { DeliveryZone, ZoneQuote } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { useDebounced } from "@/lib/hooks";
import { PageHeader } from "@/components/admin/page";
import { useList, useRemove, useSave } from "@/components/admin/crud";
import { TagInput } from "@/components/ui/tag-input";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Switch, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface Form { id?: string; name: string; areas: string[]; charge_minor: number; min_order_minor: number; eta_minutes: string; active: boolean }
const blank: Form = { name: "", areas: [], charge_minor: 0, min_order_minor: 0, eta_minutes: "30", active: true };

export default function ZonesPage() {
  const zones = useList<DeliveryZone>("delivery_zones", "/delivery_zones");
  const save = useSave<Record<string, unknown>>(["delivery_zones"], (f) => (f.id ? `/delivery_zones/${f.id}` : "/delivery_zones"), { onSuccess: () => setForm(null) });
  const remove = useRemove(["delivery_zones"], (id) => `/delivery_zones/${id}`, "Zone archived");
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<DeliveryZone | null>(null);
  const [text, setText] = useState("");
  const dt = useDebounced(text, 400);
  const quote = useQuery({ queryKey: ["zone_quote", dt], queryFn: () => api<ZoneQuote>("/delivery_zones/quote", { query: { text: dt } }), enabled: dt.trim().length > 2 });
  return (
    <>
      <PageHeader icon={MapPinned} title="Delivery zones" description="Areas with their delivery charge, minimum order and ETA. The till matches the customer's address text to an area." actions={<Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New zone</Button>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          {zones.isLoading ? <Loading /> : (
            <Table>
              <THead><tr><TH>Zone</TH><TH>Areas</TH><TH right>Charge</TH><TH right>Min order</TH><TH right>ETA</TH><TH>Status</TH><TH right>Actions</TH></tr></THead>
              <TBody>
                {zones.data?.length ? zones.data.map((z) => (
                  <TR key={z.id}>
                    <TD className="font-medium">{z.name}</TD>
                    <TD><div className="flex max-w-md flex-wrap gap-1">{z.areas.map((a) => <Badge key={a} variant="outline">{a}</Badge>)}{!z.areas.length ? <span className="text-xs text-fg-muted">No areas</span> : null}</div></TD>
                    <TD right className="font-medium">{formatMoney(z.charge_minor)}</TD>
                    <TD right>{z.min_order_minor ? formatMoney(z.min_order_minor) : "-"}</TD>
                    <TD right>{z.eta_minutes ? `${z.eta_minutes} min` : "-"}</TD>
                    <TD><Badge variant={z.active ? "success" : "neutral"}>{z.active ? "Active" : "Inactive"}</Badge></TD>
                    <TD right>
                      <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: z.id, name: z.name, areas: z.areas, charge_minor: z.charge_minor, min_order_minor: z.min_order_minor, eta_minutes: z.eta_minutes ? String(z.eta_minutes) : "", active: z.active })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setDel(z)} aria-label="Archive"><Trash2 className="h-4 w-4 text-danger" /></Button>
                    </TD>
                  </TR>
                )) : <EmptyRow colSpan={7}>No zones yet. Add DHA, Gulberg, Johar Town… with their charges.</EmptyRow>}
              </TBody>
            </Table>
          )}
        </div>
        <Card className="self-start">
          <CardHeader><CardTitle>Test an address</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" /><Input className="pl-9" value={text} onChange={(e) => setText(e.target.value)} placeholder="House 12, Phase 5, DHA Lahore" /></div>
            {dt.trim().length > 2 ? quote.isLoading ? <Loading label="Matching" /> : quote.data ? (
              quote.data.zone ? (
                <div className="rounded-md border border-success/40 bg-success-soft/40 p-3 text-sm">
                  <div className="font-semibold">{quote.data.zone.name}</div>
                  <div className="mt-1 text-fg-secondary">Charge {formatMoney(quote.data.charge_minor)}{quote.data.min_order_minor ? ` · min order ${formatMoney(quote.data.min_order_minor)}` : ""}{quote.data.eta_minutes ? ` · ${quote.data.eta_minutes} min` : ""}</div>
                </div>
              ) : (
                <div className="rounded-md border border-warning/40 bg-warning-soft/40 p-3 text-sm">
                  <div className="font-semibold">No zone matches</div>
                  <div className="mt-1 text-fg-secondary">No area in any zone appears in this text. The till will ask the cashier for the charge.</div>
                </div>
              )
            ) : null : <p className="text-xs text-fg-muted">Type an address or area to see which zone and charge the till would pick.</p>}
          </CardBody>
        </Card>
      </div>
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit zone" : "New zone"}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name.trim()} onClick={() => form && save.mutate({ id: form.id, name: form.name, areas: form.areas, charge_minor: form.charge_minor, min_order_minor: form.min_order_minor, eta_minutes: form.eta_minutes ? Number(form.eta_minutes) : null, active: form.active })}>Save</Button></>}>
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="DHA" autoFocus /></Field>
            <Field label="Areas" hint="Press Enter or comma after each. Matched against the address text, case-insensitive." className="sm:col-span-2"><TagInput value={form.areas} onChange={(v) => setForm({ ...form, areas: v })} placeholder="DHA, Phase 5, Phase 6" /></Field>
            <Field label="Delivery charge"><MoneyInput value={form.charge_minor} onChange={(v) => setForm({ ...form, charge_minor: v })} /></Field>
            <Field label="Minimum order" hint="0 = no minimum"><MoneyInput value={form.min_order_minor} onChange={(v) => setForm({ ...form, min_order_minor: v })} /></Field>
            <Field label="ETA (minutes)"><Input type="number" min={0} value={form.eta_minutes} onChange={(e) => setForm({ ...form, eta_minutes: e.target.value })} /></Field>
            <div className="flex items-end"><Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Active" /></div>
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })} title={`Archive ${del?.name}?`} description="Existing deliveries keep their charge." confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}
